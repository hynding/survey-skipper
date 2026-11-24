import { WebStorageStore, type KeyValueStorage } from 'survey-skipper';
import { createFetchHandler } from 'survey-skipper-server/fetch';
import { Api } from './api';
import type { DemoOptions } from './App';
import { SAMPLE_SURVEYS } from './samples';

/** Where demo data lives in storage. Kept apart from a real server's keys. */
export const DEMO_PREFIX = 'survey-skipper-demo:';
const SEEDED = `${DEMO_PREFIX}seeded`;
/** A base URL the demo fetch understands; nothing is sent over the network. */
const DEMO_BASE = 'https://demo.survey-skipper.invalid';

/**
 * An {@link Api} that runs the survey server in the page instead of over HTTP. It uses the same routes as
 * survey-skipper-server (its browser-safe `createFetchHandler`), keeps everything in `storage` (default `localStorage`),
 * and adds the sample surveys the first time.
 */
export function createDemoApi(storage: KeyValueStorage = localStorage): Api {
  const store = new WebStorageStore(storage, DEMO_PREFIX);
  let seeding: Promise<void> | undefined;
  const seed = () => {
    seeding ??= storage.getItem(SEEDED) === null ? seedSamples(store, storage) : Promise.resolve();
    return seeding;
  };
  const handle = createFetchHandler({ store, newId });
  const fetcher: typeof fetch = async (input, init) => {
    await seed();
    return handle(new Request(input instanceof Request ? input : String(input), init));
  };
  return new Api(DEMO_BASE, fetcher);
}

/** The API and banner options for the demo build (`VITE_DEMO=true`). */
export function startDemo(storage: KeyValueStorage = localStorage): { api: Api; demo: DemoOptions } {
  return {
    api: createDemoApi(storage),
    demo: {
      onReset: () => {
        resetDemo(storage);
        window.location.hash = '#/';
        window.location.reload();
      },
    },
  };
}

/** Removes every demo survey and response, so the samples come back on the next call. */
export function resetDemo(storage: KeyValueStorage = localStorage): void {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    // Also forget the sessions the respondent screen remembers: they point at demo sessions that are gone.
    if (key?.startsWith(DEMO_PREFIX) || key?.startsWith('survey-skipper:session:')) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    storage.removeItem(key);
  }
}

async function seedSamples(store: WebStorageStore, storage: KeyValueStorage): Promise<void> {
  for (const survey of SAMPLE_SURVEYS) {
    await store.saveDefinition(survey);
  }
  storage.setItem(SEEDED, new Date().toISOString());
}

function newId(): string {
  // randomUUID needs a secure context; plain-http hosts fall back to Math.random, which is fine for a demo.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
