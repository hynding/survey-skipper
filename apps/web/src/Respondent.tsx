import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnswerValue } from 'survey-skipper';
import { ApiError, type Api, type FieldErrors, type SessionView } from './api';
import { QuestionField } from './QuestionField';

export interface RespondentProps {
  api: Api;
  definitionId: string;
  /** Context for a new session, e.g. from the link's query string. */
  context?: Record<string, unknown>;
  /** Called once when the respondent finishes a session. */
  onFinish?: ((view: SessionView) => void) | undefined;
  /** Where the session id is remembered so a reload resumes. Default `localStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined;
}

const key = (definitionId: string) => `survey-skipper:session:${definitionId}`;

/** Answers one survey through survey-skipper-server: a page at a time, with Back, progress and validation. */
export function Respondent({ api, definitionId, context, onFinish, storage = safeStorage() }: RespondentProps) {
  const [view, setView] = useState<SessionView | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, AnswerValue | undefined>>({});
  const [errors, setErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const show = useCallback((next: SessionView) => {
    setView(next);
    setDrafts({});
    storage?.setItem(key(definitionId), next.sessionId);
  }, [storage, definitionId]);

  // Kept across React's development double-run of effects, so a first visit starts only one session.
  const loading = useRef<Promise<{ session: SessionView; total: number }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const saved = storage?.getItem(key(definitionId));
      let session: SessionView | null = null;
      if (saved) {
        try {
          session = await api.getSession(saved);
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) {
            throw error;
          }
        }
      }
      session ??= await api.startSession(definitionId, context);
      const definition = await api.getDefinition(definitionId);
      return { session, total: definition.questions.length };
    };
    loading.current ??= load();
    loading.current.then(
      (loaded) => {
        if (!cancelled) {
          setTotal(loaded.total);
          show(loaded.session);
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setProblem(error instanceof Error ? error.message : String(error));
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // The component is keyed by survey, so this runs once per survey.
  }, [api, definitionId]);

  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (view?.finished && reported.current !== view.sessionId) {
      reported.current = view.sessionId;
      onFinish?.(view);
    }
  }, [view, onFinish]);

  const run = async (step: () => Promise<SessionView>) => {
    setBusy(true);
    setProblem(null);
    try {
      show(await step());
      setErrors({});
    } catch (error) {
      if (error instanceof ApiError && Object.keys(error.errors).length > 0) {
        setErrors(error.errors);
      } else {
        setProblem(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setBusy(false);
    }
  };

  if (problem && !view) {
    return <p role="alert" className="problem">Could not load the survey: {problem}</p>;
  }
  if (!view) {
    return <p aria-busy="true">Loading…</p>;
  }

  const { state } = view;
  const answers = (state.answers ?? {}) as Record<string, { value?: AnswerValue } | undefined>;
  const abandoned = ((state as { abandonedAnswers?: Record<string, { value?: AnswerValue } | undefined> }).abandonedAnswers) ?? {};

  if (view.finished) {
    return (
      <section className="done">
        <h2>Thank you!</h2>
        <p>Your answers have been recorded.</p>
        <button
          type="button"
          onClick={() => {
            storage?.removeItem(key(definitionId));
            void run(() => api.startSession(definitionId, context));
          }}
        >
          Start again
        </button>
      </section>
    );
  }

  const valueFor = (id: string): { value: AnswerValue | undefined; restored: boolean } => {
    if (id in drafts) {
      return { value: drafts[id], restored: false };
    }
    const given = answers[id]?.value;
    if (given !== undefined) {
      return { value: given, restored: false };
    }
    const old = abandoned[id]?.value;
    return { value: old, restored: old !== undefined };
  };

  const submit = () =>
    run(async () => {
      for (const q of view.page) {
        const id = String(q.id);
        const { value } = valueFor(id);
        if (value !== undefined && (id in drafts || answers[id]?.value === undefined)) {
          await api.answer(view.sessionId, q.id, value);
        }
      }
      return api.next(view.sessionId);
    });

  const answered = (state.history ?? []).length;
  const progress = total ? Math.min(100, Math.round((answered / total) * 100)) : 0;

  return (
    <form
      className="respondent"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="progress" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div style={{ width: `${String(progress)}%` }} />
      </div>
      {view.page.map((q) => {
        const id = String(q.id);
        const { value, restored } = valueFor(id);
        return (
          <QuestionField
            key={id}
            question={q}
            value={value}
            restored={restored}
            errors={errors[id]}
            onChange={(v) => {
              setDrafts((d) => ({ ...d, [id]: v }));
            }}
          />
        );
      })}
      {problem ? <p role="alert" className="problem">{problem}</p> : null}
      <div className="actions">
        <button type="button" disabled={!view.canGoBack || busy} onClick={() => void run(() => api.back(view.sessionId))}>
          Back
        </button>
        <button type="submit" disabled={busy}>
          Next
        </button>
      </div>
    </form>
  );
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
