import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  aggregate,
  lintDefinition,
  SurveyDefinition,
  SurveySession,
  type AnswerInput,
  type Question,
  type QuestionInput,
  type SessionState,
  type SurveyDefinitionInput,
  type SurveyStore,
  type ValidationError,
} from 'survey-skipper';
import { parseSurvey } from 'survey-skipper-yaml';

export interface HandlerOptions {
  store: SurveyStore;
  /**
   * When set, requests that change definitions or read responses need `Authorization: Bearer <apiKey>`.
   * Respondent routes (starting and answering sessions) stay open.
   */
  apiKey?: string;
  /** Value for `Access-Control-Allow-Origin`, e.g. `*` or `https://surveys.example.com`. Off when unset. */
  corsOrigin?: string;
  /** Largest accepted request body in bytes. Default 1 MB. */
  maxBodyBytes?: number;
  /** Makes session ids. Default `crypto.randomUUID`. */
  newId?: () => string;
}

export type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

/** What session routes return: where the respondent is, plus the full saved state. */
export interface SessionView {
  sessionId: string;
  definitionId: string | number | undefined;
  definitionVersion: string | number | undefined;
  /** The current question with its text in the session's locale, or `null` when finished. */
  question: QuestionView | null;
  page: QuestionView[];
  finished: boolean;
  ending: string | undefined;
  canGoBack: boolean;
  state: SessionState;
}

export interface QuestionView extends QuestionInput {
  /** The question text in the session's locale with placeholders filled in. */
  displayText: string;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

interface Route {
  method: string;
  pattern: RegExp;
  admin?: boolean;
  run: (ctx: Context, id: string) => Promise<[number, unknown]>;
}

interface Context {
  req: IncomingMessage;
  url: URL;
  body: () => Promise<unknown>;
}

/**
 * Creates a Node `http` request handler for the survey API. Pass it to `http.createServer`.
 *
 * Routes (all JSON):
 * - `GET /health`
 * - `GET /definitions`, `POST /definitions` (JSON, or YAML with `Content-Type: application/yaml`)
 * - `GET /definitions/:id[?version=]`, `GET /definitions/:id/lint`
 * - `GET /definitions/:id/sessions`, `GET /definitions/:id/stats`
 * - `POST /definitions/:id/sessions` starts a session (`{ context?, version? }`)
 * - `GET|DELETE /sessions/:sid`, `POST /sessions/:sid/answers`, `POST /sessions/:sid/next`,
 *   `POST /sessions/:sid/back`, `PUT /sessions/:sid/context`
 */
export function createHandler(options: HandlerOptions): Handler {
  const { store } = options;
  const maxBody = options.maxBodyBytes ?? 1_000_000;
  const newId = options.newId ?? randomUUID;

  const loadDefinition = async (id: string, version?: string | null): Promise<SurveyDefinition> => {
    const definition = await store.loadDefinition(id, version ?? undefined);
    if (!definition) {
      throw new HttpError(404, `No definition "${id}"${version ? ` at version "${version}"` : ''}`);
    }
    return definition;
  };

  const loadSession = async (sessionId: string): Promise<SurveySession> => {
    const state = await store.loadSession(sessionId);
    if (!state) {
      throw new HttpError(404, `No session "${sessionId}"`);
    }
    if (state.definitionId === undefined) {
      throw new HttpError(500, `Session "${sessionId}" has no definition id`);
    }
    const definition = await loadDefinition(String(state.definitionId), state.definitionVersion === undefined ? null : String(state.definitionVersion));
    return new SurveySession(definition, state);
  };

  const save = async (sessionId: string, session: SurveySession): Promise<SessionView> => {
    await store.saveSession(sessionId, session);
    return view(sessionId, session);
  };

  const routes: Route[] = [
    { method: 'GET', pattern: /^\/health$/, run: () => Promise.resolve([200, { ok: true }]) },
    {
      method: 'GET',
      pattern: /^\/definitions$/,
      run: async () => [200, (await store.listDefinitions()).map((d) => summary(d))],
    },
    {
      method: 'POST',
      pattern: /^\/definitions$/,
      admin: true,
      run: async (ctx) => {
        const raw = await ctx.body();
        let definition: SurveyDefinition;
        try {
          definition = typeof raw === 'string' ? new SurveyDefinition(parseSurvey(raw)) : SurveyDefinition.from(raw as SurveyDefinitionInput);
        } catch (error) {
          throw new HttpError(400, `Invalid definition: ${(error as Error).message}`);
        }
        if (definition.id === undefined) {
          throw new HttpError(400, 'A definition needs an id');
        }
        await store.saveDefinition(definition);
        return [201, { definition: definition.toJSON(), lint: lintDefinition(definition) }];
      },
    },
    {
      method: 'GET',
      pattern: /^\/definitions\/([^/]+)$/,
      run: async (ctx, id) => [200, (await loadDefinition(id, ctx.url.searchParams.get('version'))).toJSON()],
    },
    {
      method: 'GET',
      pattern: /^\/definitions\/([^/]+)\/lint$/,
      run: async (ctx, id) => [200, lintDefinition(await loadDefinition(id, ctx.url.searchParams.get('version')))],
    },
    {
      method: 'GET',
      pattern: /^\/definitions\/([^/]+)\/sessions$/,
      admin: true,
      run: async (_ctx, id) => [200, await store.listSessions(id)],
    },
    {
      method: 'GET',
      pattern: /^\/definitions\/([^/]+)\/stats$/,
      admin: true,
      run: async (ctx, id) => {
        const version = ctx.url.searchParams.get('version');
        const sessions = (await store.listSessions(id))
          .map((s) => s.state)
          .filter((state) => version === null || String(state.definitionVersion) === version);
        return [200, aggregate(sessions)];
      },
    },
    {
      method: 'POST',
      pattern: /^\/definitions\/([^/]+)\/sessions$/,
      run: async (ctx, id) => {
        const body = asObject(await ctx.body());
        const version = typeof body.version === 'string' || typeof body.version === 'number' ? String(body.version) : null;
        const definition = await loadDefinition(id, version);
        const session = new SurveySession(definition);
        if (body.context !== undefined) {
          session.setContext(asObject(body.context));
        }
        return [201, await save(newId(), session)];
      },
    },
    {
      method: 'GET',
      pattern: /^\/sessions\/([^/]+)$/,
      run: async (_ctx, sid) => [200, view(sid, await loadSession(sid))],
    },
    {
      method: 'DELETE',
      pattern: /^\/sessions\/([^/]+)$/,
      run: async (_ctx, sid) => {
        await loadSession(sid);
        await store.deleteSession(sid);
        return [204, undefined];
      },
    },
    {
      method: 'POST',
      pattern: /^\/sessions\/([^/]+)\/answers$/,
      run: async (ctx, sid) => {
        const session = await loadSession(sid);
        const body = asObject(await ctx.body());
        const question = pickQuestion(session, body.questionId);
        if (!('value' in body)) {
          throw new HttpError(400, 'Send { "value": ... }');
        }
        const input: AnswerInput = { value: body.value as AnswerInput['value'] };
        if (typeof body.text === 'string') {
          input.text = body.text;
        }
        const result = session.answer(input, question);
        if (!result.ok) {
          throw new HttpError(422, 'The answer is not valid', { errors: { [String(question.id)]: result.errors } });
        }
        return [200, await save(sid, session)];
      },
    },
    {
      method: 'POST',
      pattern: /^\/sessions\/([^/]+)\/next$/,
      run: async (_ctx, sid) => {
        const session = await loadSession(sid);
        const errors: Record<string, ValidationError[]> = {};
        for (const q of session.getPage()) {
          const problems = session.validate(q);
          if (problems.length > 0) {
            errors[String(q.id)] = problems;
          }
        }
        if (Object.keys(errors).length > 0) {
          throw new HttpError(422, 'Some answers on this page are missing or not valid', { errors });
        }
        session.nextPage();
        return [200, await save(sid, session)];
      },
    },
    {
      method: 'POST',
      pattern: /^\/sessions\/([^/]+)\/back$/,
      run: async (_ctx, sid) => {
        const session = await loadSession(sid);
        if (!session.canGoBack()) {
          throw new HttpError(409, 'There is no earlier question to go back to');
        }
        session.back();
        return [200, await save(sid, session)];
      },
    },
    {
      method: 'PUT',
      pattern: /^\/sessions\/([^/]+)\/context$/,
      run: async (ctx, sid) => {
        const session = await loadSession(sid);
        session.setContext(asObject(await ctx.body()));
        return [200, await save(sid, session)];
      },
    },
  ];

  return async (req, res) => {
    if (options.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', options.corsOrigin);
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const method = req.method ?? 'GET';
      if (method === 'OPTIONS') {
        send(res, 204, undefined);
        return;
      }
      const matching = routes
        .map((route) => ({ route, match: route.pattern.exec(url.pathname) }))
        .filter((m): m is { route: Route; match: RegExpExecArray } => m.match !== null);
      const found = matching.find((m) => m.route.method === method);
      if (!found) {
        if (matching.length > 0) {
          res.setHeader('Allow', matching.map((m) => m.route.method).join(', '));
          throw new HttpError(405, `${method} is not allowed here`);
        }
        throw new HttpError(404, `No route for ${method} ${url.pathname}`);
      }
      if (found.route.admin && options.apiKey !== undefined && req.headers.authorization !== `Bearer ${options.apiKey}`) {
        throw new HttpError(401, 'This route needs an API key');
      }
      const param = decodeURIComponent(found.match[1] ?? '');
      const [status, payload] = await found.route.run({ req, url, body: () => readBody(req, maxBody) }, param);
      send(res, status, payload);
    } catch (error) {
      if (error instanceof HttpError) {
        send(res, error.status, { error: error.message, ...(error.details as object | undefined) });
      } else {
        send(res, 500, { error: 'Internal error' });
      }
    }
  };
}

function summary(definition: SurveyDefinition) {
  return {
    id: definition.id,
    version: definition.version,
    title: definition.title,
    description: definition.description,
    questions: definition.questions.length,
  };
}

/** Builds the response for a session. */
export function view(sessionId: string, session: SurveySession): SessionView {
  const inputs = session.definition.toJSON().questions;
  const describe = (q: Question): QuestionView => {
    const index = session.definition.indexOf(q.id);
    const input = (index === undefined ? undefined : inputs[index]) ?? { id: q.id };
    return { ...input, displayText: session.getQuestionText(q) };
  };
  const question = session.getQuestion();
  const state = session.toJSON();
  return {
    sessionId,
    definitionId: state.definitionId,
    definitionVersion: state.definitionVersion,
    question: question ? describe(question) : null,
    page: session.getPage().map(describe),
    finished: question === null,
    ending: session.ending,
    canGoBack: session.canGoBack(),
    state,
  };
}

function pickQuestion(session: SurveySession, id: unknown): Question {
  if (id === undefined) {
    const current = session.getQuestion();
    if (!current) {
      throw new HttpError(409, 'The survey is finished');
    }
    return current;
  }
  const question = session.definition.getQuestionById(id as string | number);
  if (!question) {
    throw new HttpError(400, `No question ${JSON.stringify(id)}`);
  }
  return question;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Expected a JSON object');
  }
  return value as Record<string, unknown>;
}

async function readBody(req: IncomingMessage, max: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > max) {
      throw new HttpError(413, 'Request body too large');
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') {
    return undefined;
  }
  const type = req.headers['content-type'] ?? '';
  if (/yaml/i.test(type)) {
    return text;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'The body is not valid JSON');
  }
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  if (payload === undefined) {
    res.writeHead(status).end();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(payload));
}
