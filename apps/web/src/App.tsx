import { useEffect, useMemo, useState } from 'react';
import { Api } from './api';
import { Builder } from './Builder';
import { Home } from './Home';
import { Respondent } from './Respondent';
import { Results } from './Results';

export type Route =
  | { page: 'home' }
  | { page: 'builder'; id?: string }
  | { page: 'results'; id: string }
  | { page: 'survey'; id: string; context: Record<string, unknown> };

/**
 * Reads the hash route: `#/` for the list, `#/builder[/<id>]` for the builder, `#/results/<id>` for results,
 * `#/s/<id>?employed=true&name=Ana` for
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
  const match = /^\/s\/([^/]+)$/.exec(path);
  if (!match?.[1]) {
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
  return { page: 'survey', id: decodeURIComponent(match[1]), context };
}

export function App({ api: given }: { api?: Api }) {
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

  return (
    <main>
      <header>
        <a href="#/" className="brand">Survey Skipper</a>
        <nav>
          <a href="#/">Surveys</a>
          <a href="#/builder">Builder</a>
        </nav>
      </header>
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
