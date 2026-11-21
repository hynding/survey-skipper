import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  aggregate,
  countQuotas,
  lintDefinition,
  quotaStatus,
  SurveyDefinition,
  toCSV,
  toRows,
  SurveySession,
  type AnswerInput,
  type Availability,
  type ClosedReason,
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
  /** The clock used for `opensAt` / `closesAt`. Default `() => new Date()`. */
  now?: () => Date;
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

/** A non-JSON response body. */
class RawBody {
  constructor(
    readonly contentType: string,
    readonly text: string,
    readonly filename?: string,
  ) {}
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
 * - `GET /definitions/:id/sessions`, `GET /definitions/:id/stats`, `GET /definitions/:id/quotas`, `GET /definitions/:id/responses.csv|.json`
 * - `POST /definitions/:id/sessions` starts a session (`{ context?, version? }`)
 * - `GET|DELETE /sessions/:sid`, `POST /sessions/:sid/answers`, `POST /sessions/:sid/next`,
 *   `POST /sessions/:sid/back`, `POST /sessions/:sid/goto`, `PUT /sessions/:sid/context`
 */
export function createHandler(options: HandlerOptions): Handler {
  const { store } = options;
  const maxBody = options.maxBodyBytes ?? 1_000_000;
  const newId = options.newId ?? randomUUID;
  const now = options.now ?? (() => new Date());

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
    return new SurveySession(definition, state, { quotaCounts: await quotaCountsOf(definition) });
  };

  const isAdmin = (req: IncomingMessage) => options.apiKey === undefined || req.headers.authorization === `Bearer ${options.apiKey}`;

  /** Whether a definition takes new sessions, counting completed sessions only when it has `maxResponses`. */
  const availabilityOf = async (definition: SurveyDefinition): Promise<Availability> => {
    const responses =
      definition.maxResponses === undefined || definition.id === undefined
        ? undefined
        : (await store.listSessions(definition.id)).filter((s) => s.state.finished).length;
    return definition.availability({ now: now(), responses });
  };

  /** Completed responses per quota, across all versions of the definition. `undefined` when it has no quotas. */
  const quotaCountsOf = async (definition: SurveyDefinition): Promise<Record<string, number> | undefined> => {
    if (definition.quotas.length === 0 || definition.id === undefined) {
      return undefined;
    }
    return countQuotas(definition, (await store.listSessions(definition.id)).map((s) => s.state));
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
      run: async () => {
        const definitions = await store.listDefinitions();
        return [200, await Promise.all(definitions.map(async (d) => ({ ...summary(d), ...(await availabilityOf(d)) })))];
      },
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
        return [200, aggregate(sessions, await loadDefinition(id, version))];
      },
    },
    {
      method: 'GET',
      pattern: /^\/definitions\/([^/]+)\/quotas$/,
      admin: true,
      run: async (_ctx, id) => {
        const definition = await loadDefinition(id);
        return [200, quotaStatus(definition, (await store.listSessions(id)).map((s) => s.state))];
      },
    },
    {
      method: 'GET',
      pattern: /^\/definitions\/([^/]+)\/responses\.(?:csv|json)$/,
      admin: true,
      run: async (ctx, id) => {
        const params = ctx.url.searchParams;
        const version = params.get('version');
        const definition = await loadDefinition(id, version);
        const sessions = (await store.listSessions(id)).filter(
          (s) => version === null || String(s.state.definitionVersion) === version,
        );
        const flag = (name: string) => ['1', 'true', 'yes'].includes(params.get(name) ?? '');
        const options = { includeAbandoned: flag('abandoned'), includeTimings: flag('timings'), includeContext: flag('context') };
        if (ctx.url.pathname.endsWith('.json')) {
          return [200, toRows(definition, sessions, options)];
        }
        return [200, new RawBody('text/csv; charset=utf-8', toCSV(definition, sessions, options), `${id}-responses.csv`)];
      },
    },
    {
      method: 'POST',
      pattern: /^\/definitions\/([^/]+)\/sessions$/,
      run: async (ctx, id) => {
        const body = asObject(await ctx.body());
        const version = typeof body.version === 'string' || typeof body.version === 'number' ? String(body.version) : null;
        const definition = await loadDefinition(id, version);
        const availability = await availabilityOf(definition);
        const preview = availability.reason === 'draft' && isAdmin(ctx.req);
        if (!availability.accepting && !preview) {
          throw new HttpError(403, CLOSED_MESSAGES[availability.reason ?? 'closed'], { reason: availability.reason });
        }
        const session = new SurveySession(definition, {}, { quotaCounts: await quotaCountsOf(definition) });
        if (body.context !== undefined) {
          session.setContext(asObject(body.context));
        }
        session.checkQuotas();
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
      method: 'POST',
      pattern: /^\/sessions\/([^/]+)\/goto$/,
      run: async (ctx, sid) => {
        const session = await loadSession(sid);
        const body = asObject(await ctx.body());
        if (typeof body.questionId !== 'string' && typeof body.questionId !== 'number') {
          throw new HttpError(400, 'Send { "questionId": ... }');
        }
        if (!session.canGoTo(body.questionId)) {
          throw new HttpError(409, `Question ${JSON.stringify(body.questionId)} is not on this respondent's route`);
        }
        session.goTo(body.questionId);
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
      if (found.route.admin && !isAdmin(req)) {
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

const CLOSED_MESSAGES: Record<ClosedReason, string> = {
  draft: 'This survey is a draft and is not taking responses yet',
  closed: 'This survey is closed',
  not_yet_open: 'This survey is not open yet',
  past_close: 'This survey has closed',
  full: 'This survey has all the responses it needs',
};

function summary(definition: SurveyDefinition) {
  return {
    id: definition.id,
    status: definition.status,
    opensAt: definition.opensAt,
    closesAt: definition.closesAt,
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
    return { ...input, answers: session.getOptions(q), displayText: session.getQuestionText(q) };
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
  if (payload instanceof RawBody) {
    const headers: Record<string, string> = { 'Content-Type': payload.contentType };
    if (payload.filename) {
      headers['Content-Disposition'] = `attachment; filename="${payload.filename.replace(/[^\w.-]/g, '_')}"`;
    }
    res.writeHead(status, headers).end(payload.text);
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(payload));
}
