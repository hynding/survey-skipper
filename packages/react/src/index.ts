import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  SurveyDefinition,
  SurveySession,
  type Answer,
  type AnswerInput,
  type AnswerValue,
  type Question,
  type SessionJSON,
  type SessionOptions,
  type SessionState,
  type SurveyDefinitionInput,
  type ValidationError,
} from 'survey-skipper';

export interface UseSurveyOptions {
  /** Saved state to resume from. Only read on the first render. */
  state?: SessionState;
  /** Initial context. Only read on the first render; use `setContext` afterwards. */
  context?: Record<string, unknown>;
  /** Passed to the session constructor, e.g. a clock for the timeline. */
  sessionOptions?: SessionOptions;
  /** Called with the session's JSON after every change, e.g. to autosave it. */
  onChange?: (state: SessionJSON) => void;
}

export interface UseSurveyResult {
  /** The underlying session, for anything the hook doesn't wrap. */
  session: SurveySession;
  /** The current question, or `null` when finished. */
  question: Question | null;
  /** The current page (the current question plus same-section questions along the route). */
  page: Question[];
  /** Validation errors from the last `answer` or `next`, keyed by question id. */
  errors: Record<string, ValidationError[]>;
  /** Validates and stores an answer (to the current question by default). Returns whether it was accepted. */
  answer: (value: AnswerValue | AnswerInput, question?: Question) => boolean;
  /** The stored answer value for a question, if any. */
  valueOf: (question: Question) => AnswerValue | undefined;
  /**
   * Moves past the current page. First checks every question on the page (including `required`); if any fail, it
   * stays put, records the errors and returns `false`.
   */
  next: () => boolean;
  back: () => void;
  canGoBack: boolean;
  /** Jumps along the respondent's route (see `SurveySession.goTo`). Returns `false` if the question is off the route. */
  goTo: (question: Question) => boolean;
  /** Whether `goTo` can reach the question. */
  canGoTo: (question: Question) => boolean;
  finished: boolean;
  ending: string | undefined;
  /** The question's text in the session's locale, with placeholders filled in. */
  textOf: (question: Question) => string;
  /** The question's answer options in the order this respondent sees them (shuffled when it has `randomize`). */
  optionsOf: (question: Question) => Answer[];
  setContext: (context: Record<string, unknown>) => void;
}

const EVENTS = ['answer', 'navigate', 'back', 'complete'] as const;

/**
 * Runs a survey session in a React component. The component re-renders whenever the session changes.
 *
 * ```tsx
 * const survey = useSurvey(definition);
 * if (survey.finished) return <p>Thanks!</p>;
 * ```
 */
export function useSurvey(
  definition: SurveyDefinition | SurveyDefinitionInput,
  options: UseSurveyOptions = {},
): UseSurveyResult {
  const [session] = useState(() => {
    const s = new SurveySession(SurveyDefinition.from(definition), options.state ?? {}, options.sessionOptions);
    if (options.context) {
      s.setContext({ ...s.context, ...options.context });
    }
    return s;
  });
  const version = useRef(0);
  const listeners = useRef(new Set<() => void>());
  const onChange = useRef(options.onChange);
  onChange.current = options.onChange;
  const [errors, setErrors] = useState<Record<string, ValidationError[]>>({});

  const bump = useCallback(() => {
    version.current += 1;
    onChange.current?.(session.toJSON());
    listeners.current.forEach((listener) => {
      listener();
    });
  }, [session]);

  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.current.add(listener);
      const offs = EVENTS.map((event) => session.on(event, bump));
      return () => {
        listeners.current.delete(listener);
        offs.forEach((off) => {
          off();
        });
      };
    },
    [session, bump],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => version.current,
    () => version.current,
  );

  const answer = useCallback(
    (value: AnswerValue | AnswerInput, question?: Question): boolean => {
      const input: AnswerInput = isAnswerInput(value) ? value : { value };
      const target = question ?? session.getQuestion();
      if (!target) {
        return false;
      }
      const result = session.answer(input, target);
      setErrors((current) => ({ ...current, [String(target.id)]: result.errors }));
      return result.ok;
    },
    [session],
  );

  const next = useCallback((): boolean => {
    const page = session.getPage();
    const found: Record<string, ValidationError[]> = {};
    for (const q of page) {
      const problems = session.validate(q);
      if (problems.length > 0) {
        found[String(q.id)] = problems;
      }
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      return false;
    }
    session.nextPage();
    return true;
  }, [session]);

  const back = useCallback(() => {
    setErrors({});
    session.back();
  }, [session]);

  const goTo = useCallback(
    (question: Question): boolean => {
      if (!session.canGoTo(question.id)) {
        return false;
      }
      setErrors({});
      session.goTo(question.id);
      return true;
    },
    [session],
  );

  const setContext = useCallback(
    (context: Record<string, unknown>) => {
      session.setContext(context);
      bump();
    },
    [session, bump],
  );

  return useMemo(() => {
    const question = session.getQuestion();
    return {
      session,
      question,
      page: session.getPage(),
      errors,
      answer,
      valueOf: (q: Question) => session.answers[String(q.id)]?.value ?? undefined,
      next,
      back,
      canGoBack: session.canGoBack(),
      goTo,
      canGoTo: (q: Question) => session.canGoTo(q.id),
      finished: question === null,
      ending: session.ending,
      textOf: (q: Question) => session.getQuestionText(q),
      optionsOf: (q: Question) => session.getOptions(q),
      setContext,
    };
    // `snapshot` changes whenever the session does.
  }, [session, snapshot, errors, answer, next, back, goTo, setContext]);
}

function isAnswerInput(value: unknown): value is AnswerInput {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
