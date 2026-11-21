import { useEffect, useMemo, useState } from 'react';
import { diffDefinitions, getEdges, lintDefinition, SurveyDefinition, type LintIssue, type SurveyDefinitionJSON } from 'survey-skipper';
import { parseSurvey, stringifySurvey } from 'survey-skipper-yaml';
import { ApiError, type Api } from './api';
import { Graph } from './Graph';
import { Preview } from './Preview';
import { Share } from './Share';

export const STARTER = `id: my-survey
title: My survey
questions:
  - id: age
    text: How old are you?
    type: number
    required: true
    rules:
      - if: { "<": [{ var: answer }, 18] }
        end: too_young
  - id: commute
    text: How do you get to work?
    answers:
      - { value: car, text: Car }
      - { value: bus, text: Bus }
    rules:
      - if: { "==": [{ var: answer }, bus] }
        goTo: wait
  - id: parking
    text: How easy is parking?
    type: rating
  - id: wait
    text: How long do you usually wait, in minutes?
    type: number
`;

type Parsed = { ok: true; definition: SurveyDefinition; issues: LintIssue[] } | { ok: false; error: string };

/** Parses and lints YAML source. Exported for tests. */
export function parseSource(source: string): Parsed {
  try {
    const definition = new SurveyDefinition(parseSurvey(source));
    return { ok: true, definition, issues: lintDefinition(definition) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export interface BuilderProps {
  api: Api;
  /** Loads this saved definition to edit. Without it, the editor starts from a sample. */
  definitionId?: string | undefined;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | undefined;
}

/**
 * The survey builder: edit a definition in YAML (questions, JsonLogic rules, settings), with lint results, the
 * branching graph and a working preview updating as you type. Saving sends it to the server.
 */
export function Builder({ api, definitionId, storage = safeSession() }: BuilderProps) {
  const [source, setSource] = useState(definitionId ? '' : STARTER);
  const [loading, setLoading] = useState(Boolean(definitionId));
  const [tab, setTab] = useState<'graph' | 'preview'>('graph');
  const [apiKey, setApiKey] = useState(() => storage?.getItem('survey-skipper:api-key') ?? '');
  const [saved, setSaved] = useState<SurveyDefinitionJSON | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string; id?: string } | null>(null);

  useEffect(() => {
    if (!definitionId) {
      return;
    }
    let cancelled = false;
    api.getDefinition(definitionId).then(
      (json) => {
        if (!cancelled) {
          setSaved(json);
          setSource(stringifySurvey(json));
          setLoading(false);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setStatus({ kind: 'error', text: error instanceof Error ? error.message : String(error) });
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, definitionId]);

  const parsed = useMemo(() => parseSource(source), [source]);
  const edges = useMemo(() => (parsed.ok ? getEdges(parsed.definition) : []), [parsed]);
  const errors = parsed.ok ? parsed.issues.filter((i) => i.severity === 'error').length : 1;
  const changes = useMemo(() => (parsed.ok && saved ? diffDefinitions(saved, parsed.definition) : []), [parsed, saved]);

  const save = async () => {
    setStatus(null);
    storage?.setItem('survey-skipper:api-key', apiKey);
    try {
      const { definition } = await api.saveDefinitionYaml(source, apiKey || undefined);
      setSaved(definition);
      setStatus({ kind: 'ok', text: `Saved ${String(definition.id)}${definition.version === undefined ? '' : ` v${String(definition.version)}`}.`, id: String(definition.id) });
    } catch (error) {
      const text = error instanceof ApiError && error.status === 401 ? 'The server needs an API key.' : error instanceof Error ? error.message : String(error);
      setStatus({ kind: 'error', text });
    }
  };

  if (loading) {
    return <p aria-busy="true">Loading…</p>;
  }

  return (
    <div className="builder">
      <section className="editor">
        <label htmlFor="source" className="prompt">Survey (YAML)</label>
        <textarea
          id="source"
          spellCheck={false}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
          }}
        />
        <div className="lint" aria-live="polite">
          {!parsed.ok ? (
            <p className="issue error">Can’t read this yet: {parsed.error}</p>
          ) : parsed.issues.length === 0 ? (
            <p className="issue clean">No problems found.</p>
          ) : (
            <ul>
              {parsed.issues.map((issue, i) => (
                <li key={i} className={`issue ${issue.severity}`}>
                  <strong>{issue.severity}</strong> {issue.questionId === undefined ? '' : <code>{String(issue.questionId)}</code>} {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
        {changes.length > 0 ? (
          <details className="changes">
            <summary>{changes.length === 1 ? '1 change' : `${String(changes.length)} changes`} since the last save</summary>
            <ul>
              {changes.map((c, i) => (
                <li key={i} className={`change ${c.kind}`}>{c.message}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="save">
          <input
            type="password"
            placeholder="API key (if the server needs one)"
            aria-label="API key"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
            }}
          />
          <button type="button" disabled={errors > 0} onClick={() => void save()}>
            Save
          </button>
        </div>
        {status?.id ?? definitionId ? <Share definitionId={status?.id ?? definitionId ?? ''} /> : null}
        {status ? (
          <p role="status" className={status.kind === 'ok' ? 'saved' : 'problem'}>
            {status.text} {status.id ? <a href={`#/s/${encodeURIComponent(status.id)}`}>Open survey</a> : null}
          </p>
        ) : null}
      </section>
      <section className="view">
        <div role="tablist" className="tabs">
          <button type="button" role="tab" aria-selected={tab === 'graph'} onClick={() => { setTab('graph'); }}>Graph</button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={() => { setTab('preview'); }}>Preview</button>
        </div>
        {parsed.ok ? (
          tab === 'graph' ? (
            <div className="graph-wrap">
              <Graph definition={parsed.definition} edges={edges} issues={parsed.issues} />
            </div>
          ) : (
            <Preview key={source} definition={parsed.definition} />
          )
        ) : (
          <p className="note">Fix the YAML to see the {tab}.</p>
        )}
      </section>
    </div>
  );
}

function safeSession(): Storage | undefined {
  try {
    return typeof sessionStorage === 'undefined' ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}
