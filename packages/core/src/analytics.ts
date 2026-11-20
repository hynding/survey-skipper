import type { AnswerValue } from './answer.js';
import type { QuestionId } from './question.js';
import { SurveySession, type SessionState, type TimelineEvent } from './session.js';

export interface QuestionStats {
  /** Sessions that were shown the question. */
  shown: number;
  /** Sessions with a valid answer to it. */
  answered: number;
  /** Unfinished sessions that stopped on this question. */
  droppedOff: number;
  /** How often each answer value was given. Each item of a list answer counts once. */
  distribution: Record<string, number>;
}

export interface SurveyStats {
  sessions: number;
  completed: number;
  /** `completed / sessions`, or 0 with no sessions. */
  completionRate: number;
  /** Completed sessions by ending; sessions that ran past the last question count under `(none)`. */
  endings: Record<string, number>;
  /** Per-question numbers, keyed by question id. */
  questions: Record<string, QuestionStats>;
  /** The routes respondents took (questions shown, in order), most common first. */
  paths: { questions: QuestionId[]; count: number }[];
}

/**
 * Summarizes many sessions of one survey: completion, endings, per-question answer distributions and drop-off, and
 * the most common routes. Accepts live sessions or saved session JSON (`definitionId` is not checked).
 */
export function aggregate(sessions: (SurveySession | SessionState)[]): SurveyStats {
  const stats: SurveyStats = { sessions: 0, completed: 0, completionRate: 0, endings: {}, questions: {}, paths: [] };
  const pathCounts = new Map<string, { questions: QuestionId[]; count: number }>();
  const question = (id: QuestionId): QuestionStats => {
    const key = String(id);
    stats.questions[key] ??= { shown: 0, answered: 0, droppedOff: 0, distribution: {} };
    return stats.questions[key];
  };

  for (const input of sessions) {
    const state: SessionState = input instanceof SurveySession ? input.toJSON() : input;
    stats.sessions += 1;
    const path = [...(state.history ?? []), ...(!state.finished && state.currentQuestionId !== undefined ? [state.currentQuestionId] : [])];
    const unique = new Set(path.map(String));
    for (const id of unique) {
      question(id).shown += 1;
    }
    for (const [id, answer] of Object.entries(state.answers ?? {})) {
      const value = answer.value;
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) {
        continue;
      }
      const qs = question(id);
      qs.answered += 1;
      for (const item of Array.isArray(value) ? value : [value]) {
        const key = valueKey(item);
        qs.distribution[key] = (qs.distribution[key] ?? 0) + 1;
      }
    }
    if (state.finished) {
      stats.completed += 1;
      const ending = state.ending ?? '(none)';
      stats.endings[ending] = (stats.endings[ending] ?? 0) + 1;
    } else if (state.currentQuestionId !== undefined) {
      question(state.currentQuestionId).droppedOff += 1;
    }
    const key = JSON.stringify(path.map(String));
    const entry = pathCounts.get(key) ?? { questions: path, count: 0 };
    entry.count += 1;
    pathCounts.set(key, entry);
  }
  stats.completionRate = stats.sessions === 0 ? 0 : stats.completed / stats.sessions;
  stats.paths = [...pathCounts.values()].sort((a, b) => b.count - a.count);
  return stats;
}

/**
 * Milliseconds spent on each question, from a session's timeline: the time from each `shown` event to the next event
 * that moves the respondent (another `shown`, `back` or `complete`). Revisits add up.
 */
export function timeOnQuestions(timeline: TimelineEvent[]): Record<string, number> {
  const totals: Record<string, number> = {};
  let open: { id: string; at: number } | undefined;
  for (const event of timeline) {
    const at = Date.parse(event.at);
    if (open && (event.type === 'shown' || event.type === 'back' || event.type === 'complete')) {
      totals[open.id] = (totals[open.id] ?? 0) + (at - open.at);
      open = undefined;
    }
    if ((event.type === 'shown' || event.type === 'back') && event.questionId !== undefined) {
      open = { id: String(event.questionId), at };
    }
  }
  return totals;
}

function valueKey(value: Exclude<AnswerValue, unknown[]>): string {
  return String(value);
}
