import { SurveyDefinition, type SurveyDefinitionInput, type SurveyDefinitionJSON } from './definition.js';
import { SurveySession, type SessionJSON, type SessionState } from './session.js';

/**
 * Where definitions and sessions are kept. Implement it for your database; `MemoryStore` and `WebStorageStore` are
 * included. All methods are async so network and database stores fit.
 */
export interface SurveyStore {
  /** Saves a definition under its `id` and `version`. Saving the same id and version again replaces it. */
  saveDefinition(definition: SurveyDefinition | SurveyDefinitionInput): Promise<void>;
  /** Loads a definition by id: the given version, or the most recently saved one. */
  loadDefinition(id: string | number, version?: string | number): Promise<SurveyDefinition | undefined>;
  /** Lists the latest version of every definition. */
  listDefinitions(): Promise<SurveyDefinition[]>;
  saveSession(sessionId: string, session: SurveySession | SessionState): Promise<void>;
  loadSession(sessionId: string): Promise<SessionState | undefined>;
  deleteSession(sessionId: string): Promise<void>;
  /** Lists saved sessions, optionally only those for one definition id. */
  listSessions(definitionId?: string | number): Promise<{ sessionId: string; state: SessionState }[]>;
}

/** The minimal string key-value interface of `localStorage` and `sessionStorage`. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

/**
 * A store backed by any string key-value storage: `localStorage` in browsers, or a `Map`-like object in tests.
 * Keys are prefixed with `prefix` (default `survey-skipper:`).
 */
export class WebStorageStore implements SurveyStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly prefix = 'survey-skipper:',
  ) {}

  saveDefinition(definition: SurveyDefinition | SurveyDefinitionInput): Promise<void> {
    const json = SurveyDefinition.from(definition).toJSON();
    if (json.id === undefined) {
      return Promise.reject(new TypeError('A definition needs an id to be stored'));
    }
    const id = String(json.id);
    const version = json.version === undefined ? '' : String(json.version);
    this.storage.setItem(`${this.prefix}def:${id}@${version}`, JSON.stringify(json));
    this.storage.setItem(`${this.prefix}def-latest:${id}`, version);
    return Promise.resolve();
  }

  loadDefinition(id: string | number, version?: string | number): Promise<SurveyDefinition | undefined> {
    const v = version === undefined ? this.storage.getItem(`${this.prefix}def-latest:${String(id)}`) : String(version);
    if (v === null) {
      return Promise.resolve(undefined);
    }
    const raw = this.storage.getItem(`${this.prefix}def:${String(id)}@${v}`);
    return Promise.resolve(raw === null ? undefined : new SurveyDefinition(JSON.parse(raw) as SurveyDefinitionJSON));
  }

  async listDefinitions(): Promise<SurveyDefinition[]> {
    const ids = this.keys(`${this.prefix}def-latest:`).map((key) => key.slice(`${this.prefix}def-latest:`.length));
    const loaded = await Promise.all(ids.map((id) => this.loadDefinition(id)));
    return loaded.filter((d): d is SurveyDefinition => d !== undefined);
  }

  saveSession(sessionId: string, session: SurveySession | SessionState): Promise<void> {
    const state = session instanceof SurveySession ? session.toJSON() : session;
    this.storage.setItem(`${this.prefix}session:${sessionId}`, JSON.stringify(state));
    return Promise.resolve();
  }

  loadSession(sessionId: string): Promise<SessionState | undefined> {
    const raw = this.storage.getItem(`${this.prefix}session:${sessionId}`);
    return Promise.resolve(raw === null ? undefined : (JSON.parse(raw) as SessionJSON));
  }

  deleteSession(sessionId: string): Promise<void> {
    this.storage.removeItem(`${this.prefix}session:${sessionId}`);
    return Promise.resolve();
  }

  async listSessions(definitionId?: string | number): Promise<{ sessionId: string; state: SessionState }[]> {
    const prefix = `${this.prefix}session:`;
    const out: { sessionId: string; state: SessionState }[] = [];
    for (const key of this.keys(prefix)) {
      const sessionId = key.slice(prefix.length);
      const state = await this.loadSession(sessionId);
      if (state && (definitionId === undefined || String(state.definitionId) === String(definitionId))) {
        out.push({ sessionId, state });
      }
    }
    return out;
  }

  private keys(prefix: string): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }
    return keys.sort();
  }
}

/** A store that keeps everything in memory. Handy for tests and prototypes. */
export class MemoryStore extends WebStorageStore {
  constructor() {
    const map = new Map<string, string>();
    super({
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => {
        map.set(key, value);
      },
      removeItem: (key) => {
        map.delete(key);
      },
      get length() {
        return map.size;
      },
      key: (index) => [...map.keys()][index] ?? null,
    });
  }
}

/**
 * Loads a saved session together with the definition version it ran against. Returns `undefined` if either is missing.
 */
export async function resumeSession(store: SurveyStore, sessionId: string): Promise<SurveySession | undefined> {
  const state = await store.loadSession(sessionId);
  if (!state || state.definitionId === undefined) {
    return undefined;
  }
  const definition = await store.loadDefinition(state.definitionId, state.definitionVersion);
  return definition ? new SurveySession(definition, state) : undefined;
}
