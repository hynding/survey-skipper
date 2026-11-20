import type { SurveyDefinitionJSON, ValidationError } from 'survey-skipper';
import type { SessionView } from 'survey-skipper-server';

export type { SessionView, QuestionView } from 'survey-skipper-server';

export interface DefinitionSummary {
  id: string | number;
  version?: string | number;
  title?: string;
  description?: string;
  questions: number;
}

export type FieldErrors = Record<string, ValidationError[]>;

/** A failed API call. `errors` holds validation errors by question id when the server sent them. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly errors: FieldErrors = {},
  ) {
    super(message);
  }
}

/** A small client for survey-skipper-server. */
export class Api {
  constructor(
    private readonly base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api',
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
    private readonly apiKey?: string,
  ) {}

  listDefinitions(): Promise<DefinitionSummary[]> {
    return this.call('GET', '/definitions');
  }

  getDefinition(id: string): Promise<SurveyDefinitionJSON> {
    return this.call('GET', `/definitions/${encodeURIComponent(id)}`);
  }

  startSession(definitionId: string, context?: Record<string, unknown>): Promise<SessionView> {
    return this.call('POST', `/definitions/${encodeURIComponent(definitionId)}/sessions`, context ? { context } : {});
  }

  getSession(sessionId: string): Promise<SessionView> {
    return this.call('GET', `/sessions/${encodeURIComponent(sessionId)}`);
  }

  answer(sessionId: string, questionId: string | number, value: unknown): Promise<SessionView> {
    return this.call('POST', `/sessions/${encodeURIComponent(sessionId)}/answers`, { questionId, value });
  }

  next(sessionId: string): Promise<SessionView> {
    return this.call('POST', `/sessions/${encodeURIComponent(sessionId)}/next`);
  }

  back(sessionId: string): Promise<SessionView> {
    return this.call('POST', `/sessions/${encodeURIComponent(sessionId)}/back`);
  }

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const res = await this.fetcher(`${this.base}${path}`, init);
    const text = await res.text();
    const data = (text ? JSON.parse(text) : undefined) as unknown;
    if (!res.ok) {
      const payload = (data ?? {}) as { error?: string; errors?: FieldErrors };
      throw new ApiError(res.status, payload.error ?? `Request failed (${String(res.status)})`, payload.errors);
    }
    return data as T;
  }
}
