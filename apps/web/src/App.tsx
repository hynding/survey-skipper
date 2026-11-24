import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SessionView } from './api';
import { Api } from './api';
import { Builder } from './Builder';
import { Home } from './Home';
import { Respondent } from './Respondent';
import { Results } from './Results';

export type Route =
  | { page: 'home' }
  | { page: 'builder'; id?: string }
  | { page: 'results'; id: string }
  | { page: 'survey'; id: string; context: Record<string, unknown>; embed?: boolean };

/**
 * Reads the hash route: `#/` for the list, `#/builder[/<id>]` for the builder, `#/results/<id>` for results,
 * `#/s/<id>?employed=true&name=Ana` (or `#/embed/<id>?...` for the chrome-free embed) for
 * a survey. Query values become the
 * session's context; JSON values (`true`, `3`, `["a"]`) are parsed, anything else stays a string.
 */
export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  if (path === '/builder') {
    return { page: 'builder' };
  }
  const editing = /^\/builder\/([^/]+)$/.exec(path);
  if (editing?.[1]) {
    return { page: 'builder', id: decodeURIComponent(editing[1]) };
  }
  const results = /^\/results\/([^/]+)$/.exec(path);
  if (results?.[1]) {
    return { page: 'results', id: decodeURIComponent(results[1]) };
  }
  const match = /^\/(s|embed)\/([^/]+)$/.exec(path);
  if (!match?.[2]) {
    return { page: 'home' };
  }
  const context: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(query)) {
    try {
      context[k] = JSON.parse(v) as unknown;
    } catch {
      context[k] = v;
    }
  }
  return { page: 'survey', id: decodeURIComponent(match[2]), context, ...(match[1] === 'embed' ? { embed: true } : {}) };
}

export interface DemoOptions {
  /** Clears the demo's surveys and responses and brings back the samples. */
  onReset: () => void;
}

/** The app. Pass `demo` to show the demo banner (the GitHub Pages build runs everything in the browser). */
export function App({ api: given, demo }: { api?: Api; demo?: DemoOptions }) {
  const api = useMemo(() => given ?? new Api(), [given]);
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(window.location.hash));
    };
    window.addEventListener('hashchange', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  if (route.page === 'survey' && route.embed) {
    return <Embed api={api} definitionId={route.id} context={route.context} />;
  }

  return (
    <main>
      <header>
        <a href="#/" className="brand">Survey Skipper</a>
        <nav>
          <a href="#/">Surveys</a>
          <a href="#/builder">Builder</a>
        </nav>
      </header>
      {demo ? <DemoBanner {...demo} /> : null}
      {route.page === 'builder' ? (
        <Builder key={route.id ?? 'new'} api={api} definitionId={route.id} />
      ) : route.page === 'results' ? (
        <Results key={route.id} api={api} definitionId={route.id} />
      ) : route.page === 'survey' ? (
        <Respondent key={route.id} api={api} definitionId={route.id} context={Object.keys(route.context).length > 0 ? route.context : undefined} />
      ) : (
        <Home api={api} />
      )}
    </main>
  );
}

/** Says the app is a demo whose data stays in this browser, with a button to start over. */
export function DemoBanner({ onReset }: DemoOptions) {
  return (
    <aside className="demo-banner" aria-label="Demo mode">
      <p>
        <strong>Demo.</strong> Everything runs in your browser and is saved only on this device. Try a sample survey,
        build your own, and see the results.
      </p>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Delete every survey and response in this demo and bring back the samples?')) {
            onReset();
          }
        }}
      >
        Reset demo
      </button>
    </aside>
  );
}

/**
 * A survey without the app's header, for an iframe. Tells the parent page its height
 * (`{ type: 'survey-skipper:resize', height }`) and when the respondent finishes
 * (`{ type: 'survey-skipper:complete', definitionId, sessionId, ending }`).
 */
export function Embed({ api, definitionId, context }: { api: Api; definitionId: string; context: Record<string, unknown> }) {
  const post = useCallback((message: Record<string, unknown>) => {
    if (window.parent !== window) {
      window.parent.postMessage(message, '*');
    }
  }, []);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    const observer = new ResizeObserver(() => {
      post({ type: 'survey-skipper:resize', height: Math.ceil(document.documentElement.offsetHeight) });
    });
    observer.observe(document.body);
    return () => {
      observer.disconnect();
    };
  }, [post]);

  const onFinish = useCallback(
    (view: SessionView) => {
      post({ type: 'survey-skipper:complete', definitionId, sessionId: view.sessionId, ending: view.ending ?? null });
    },
    [post, definitionId],
  );

  return (
    <main className="embed">
      <Respondent api={api} definitionId={definitionId} context={Object.keys(context).length > 0 ? context : undefined} onFinish={onFinish} />
    </main>
  );
}
