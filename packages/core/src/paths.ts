import type { AnswerValue } from './answer.js';
import type { SurveyDefinition } from './definition.js';
import { getEdges, type Edge } from './graph.js';
import type { QuestionId } from './question.js';
import { SurveySession } from './session.js';

export interface SimulatedPath {
  /** The questions along the route, in order. */
  questions: QuestionId[];
  /** The named ending the route finishes on, if any. */
  ending?: string;
  /** True when the route was cut short because it would revisit a question. */
  loops?: boolean;
}

/**
 * Lists the routes through a definition's structure, from the first question to an end, following every rule,
 * answer-map entry and fall-through. Conditions are not evaluated, so some listed routes may be impossible in
 * practice; use {@link runScript} to check one respondent's actual route. Stops after `maxPaths` routes.
 */
export function simulatePaths(definition: SurveyDefinition, { maxPaths = 1000 }: { maxPaths?: number } = {}): SimulatedPath[] {
  const first = definition.questions[0];
  if (!first) {
    return [];
  }
  const out = new Map<string, Edge[]>();
  for (const edge of getEdges(definition)) {
    const list = out.get(String(edge.from)) ?? [];
    list.push(edge);
    out.set(String(edge.from), list);
  }
  const paths: SimulatedPath[] = [];
  const seen = new Set<string>();
  const visit = (route: QuestionId[]): void => {
    if (paths.length >= maxPaths) {
      return;
    }
    const current = route[route.length - 1] as QuestionId;
    for (const edge of out.get(String(current)) ?? []) {
      if (paths.length >= maxPaths) {
        return;
      }
      if (edge.to === null) {
        record({ questions: route, ...(edge.ending === undefined ? {} : { ending: edge.ending }) });
      } else if (route.some((id) => String(id) === String(edge.to))) {
        record({ questions: route, loops: true });
      } else {
        visit([...route, edge.to]);
      }
    }
  };
  const record = (path: SimulatedPath): void => {
    const key = JSON.stringify(path);
    if (!seen.has(key)) {
      seen.add(key);
      paths.push(path);
    }
  };
  visit([first.id]);
  return paths;
}

export interface ScriptResult {
  /** The questions the respondent was shown, in order. */
  questions: QuestionId[];
  ending?: string;
  /** True when the session reached the end. */
  finished: boolean;
  /** The question the script had no answer for, if it stopped early. */
  stoppedAt?: QuestionId;
}

/**
 * Runs a session with scripted answers and reports the route it takes. Answers are keyed by question id; the run
 * stops at the first shown question without a scripted answer. Useful for testing branching logic.
 */
export function runScript(
  definition: SurveyDefinition,
  { answers, context = {} }: { answers: Record<string, AnswerValue>; context?: Record<string, unknown> },
): ScriptResult {
  const session = new SurveySession(definition, { context });
  const shown: QuestionId[] = [];
  const limit = definition.questions.length * 4 + 4;
  let q = session.getQuestion();
  while (q && shown.length < limit) {
    shown.push(q.id);
    const value = answers[String(q.id)];
    if (value === undefined) {
      return { questions: shown, finished: false, stoppedAt: q.id };
    }
    session.setAnswer({ value }, q);
    q = session.getNextQuestion();
  }
  return { questions: shown, finished: !q, ...(session.ending === undefined ? {} : { ending: session.ending }) };
}
