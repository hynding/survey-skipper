import { useCallback, useEffect, useState } from 'react';
import type { SurveyDefinitionJSON, SurveyStats } from 'survey-skipper';
import { ApiError, type Api } from './api';

export interface ResultsProps {
  api: Api;
  definitionId: string;
  /** Where the API key is remembered for this tab. Default `sessionStorage`, shared with the builder. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | undefined;
}

const KEY = 'survey-skipper:api-key';

/** A survey's results: completion, endings, and per-question reach, drop-off and answers, with a CSV download. */
export function Results({ api, definitionId, storage = safeSession() }: ResultsProps) {
  const [apiKey, setApiKey] = useState(() => storage?.getItem(KEY) ?? '');
  const [data, setData] = useState<{ stats: SurveyStats; definition: SurveyDefinitionJSON } | null>(null);
  const [problem, setProblem] = useState<{ text: string; needsKey: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getStats(definitionId, apiKey || undefined), api.getDefinition(definitionId)]).then(
      ([stats, definition]) => {
        if (!cancelled) {
          setData({ stats, definition });
          setProblem(null);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setProblem({ text: error instanceof Error ? error.message : String(error), needsKey: error instanceof ApiError && error.status === 401 });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // apiKey is read when the user retries, not on every keystroke.
  }, [api, definitionId, attempt]);

  const retry = () => {
    storage?.setItem(KEY, apiKey);
    setAttempt((n) => n + 1);
  };

  const download = useCallback(async () => {
    try {
      const csv = await api.getResponsesCsv(definitionId, apiKey || undefined);
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${definitionId}-responses.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setProblem({ text: error instanceof Error ? error.message : String(error), needsKey: false });
    }
  }, [api, definitionId, apiKey]);

  if (problem?.needsKey || (problem && !data)) {
    return (
      <section className="results">
        <p role="alert" className="problem">{problem.needsKey ? 'Results need the server’s API key.' : `Could not load results: ${problem.text}`}</p>
        {problem.needsKey ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              retry();
            }}
          >
            <label>
              API key{' '}
              <input type="password" value={apiKey} onChange={(e) => {
                setApiKey(e.target.value);
              }} />
            </label>{' '}
            <button type="submit">Show results</button>
          </form>
        ) : null}
      </section>
    );
  }
  if (!data) {
    return <p aria-busy="true">Loading…</p>;
  }

  const { stats, definition } = data;
  const endings = Object.entries(stats.endings).sort((a, b) => b[1] - a[1]);
  return (
    <section className="results">
      <h1>{definition.title ?? String(definition.id)}: results</h1>
      <div className="tiles">
        <Tile label="Responses" value={String(stats.sessions)} />
        <Tile label="Completed" value={String(stats.completed)} />
        <Tile label="Completion rate" value={percent(stats.completionRate)} />
        {stats.score && stats.score.count > 0 ? <Tile label={`Average score (${String(stats.score.min)} to ${String(stats.score.max)})`} value={String(Math.round(stats.score.mean * 10) / 10)} /> : null}
      </div>
      <p>
        <button type="button" onClick={() => void download()} disabled={stats.sessions === 0}>
          Download CSV
        </button>{' '}
        <a href={`#/builder/${encodeURIComponent(definitionId)}`}>Edit survey</a>
      </p>
      {problem ? <p role="alert" className="problem">{problem.text}</p> : null}
      {stats.sessions === 0 ? (
        <p>No responses yet.</p>
      ) : (
        <>
          {endings.length > 0 ? (
            <>
              <h2>Endings</h2>
              <Bars label="Completed responses by ending" rows={endings.map(([name, count]) => ({ name: name === '(none)' ? 'Reached the end' : name, count }))} total={stats.completed} />
            </>
          ) : null}
          <h2>Questions</h2>
          {definition.questions.map((q) => {
            const qs = stats.questions[String(q.id)];
            const labels = new Map((q.answers ?? []).map((a) => [String(a.value), a.text ?? String(a.value)]));
            const rows = Object.entries(qs?.distribution ?? {})
              .map(([value, count]) => ({ name: labels.get(value) ?? value, count }))
              .sort(q.type === 'rating' || q.type === 'number' ? (a, b) => Number(a.name) - Number(b.name) : (a, b) => b.count - a.count);
            return (
              <article key={String(q.id)} className="question-result">
                <h3>{q.text ?? String(q.id)}</h3>
                <p className="meta">
                  Shown to {qs?.shown ?? 0} · answered by {qs?.answered ?? 0}
                  {qs?.droppedOff ? ` · ${String(qs.droppedOff)} stopped here` : ''}
                </p>
                {rows.length > 0 ? <Bars label={`Answers to ${q.text ?? String(q.id)}`} rows={rows.slice(0, 12)} total={qs?.answered ?? 0} /> : null}
                {rows.length > 12 ? <p className="meta">and {rows.length - 12} more answers in the CSV</p> : null}
              </article>
            );
          })}
        </>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
    </div>
  );
}

/** Horizontal bars, one hue, with the count and share written beside each bar. */
function Bars({ label, rows, total }: { label: string; rows: { name: string; count: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <table className="bars" aria-label={label}>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} title={`${row.name}: ${String(row.count)} (${percent(total ? row.count / total : 0)})`}>
            <th scope="row">{row.name}</th>
            <td className="bar-cell">
              <span className="bar" style={{ width: `${String((row.count / max) * 100)}%` }} />
            </td>
            <td className="bar-value">
              {row.count} <small>{percent(total ? row.count / total : 0)}</small>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function percent(n: number): string {
  return `${String(Math.round(n * 100))}%`;
}

function safeSession(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}
