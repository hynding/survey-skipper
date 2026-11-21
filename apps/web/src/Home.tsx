import { useEffect, useState } from 'react';
import type { Api, DefinitionSummary } from './api';

const REASONS: Record<NonNullable<DefinitionSummary['reason']>, string> = {
  draft: 'Draft',
  closed: 'Closed',
  not_yet_open: 'Not open yet',
  past_close: 'Closed',
  full: 'Full',
};

/** Lists the surveys on the server. */
export function Home({ api }: { api: Api }) {
  const [surveys, setSurveys] = useState<DefinitionSummary[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    api.listDefinitions().then(setSurveys, (error: unknown) => {
      setProblem(error instanceof Error ? error.message : String(error));
    });
  }, [api]);

  if (problem) {
    return <p role="alert" className="problem">Could not reach the survey server: {problem}</p>;
  }
  if (!surveys) {
    return <p aria-busy="true">Loading…</p>;
  }
  if (surveys.length === 0) {
    return <p>No surveys yet. <a href="#/builder">Create one in the builder</a>.</p>;
  }
  return (
    <ul className="surveys">
      {surveys.map((s) => (
        <li key={String(s.id)}>
          <a href={`#/s/${encodeURIComponent(String(s.id))}`}>{s.title ?? String(s.id)}</a>
          {s.accepting === false && s.reason ? <span className="badge">{REASONS[s.reason]}</span> : null}
          {s.description ? <p>{s.description}</p> : null}
          <small>
            {s.questions} questions · <a href={`#/builder/${encodeURIComponent(String(s.id))}`}>Edit</a> ·{' '}
            <a href={`#/results/${encodeURIComponent(String(s.id))}`}>Results</a>
          </small>
        </li>
      ))}
    </ul>
  );
}
