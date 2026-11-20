import { Answer } from './answer.js';
import type { SurveyDefinition } from './definition.js';
import type { QuestionId } from './question.js';
import type { SessionState } from './session.js';
import { validateAnswer } from './validation.js';

export interface MigrationReport {
  /** Questions whose answers carried over. */
  kept: QuestionId[];
  /** Questions that no longer exist; their answers moved to `abandonedAnswers`. */
  removed: QuestionId[];
  /** Questions whose answers no longer pass validation; their answers moved to `abandonedAnswers`. */
  invalid: QuestionId[];
  /** True when the respondent's place no longer exists, so the session will resume at its first unanswered question. */
  restarted: boolean;
}

/**
 * Moves a saved session onto a newer (or different) definition. Answers to questions that still exist and still
 * validate are kept. Others move to `abandonedAnswers`, so nothing is lost. History entries for removed questions are
 * dropped. If the current question was removed, the session resumes from the start, routing past answered questions
 * to the first unanswered one. The returned state records the new definition's id and version.
 */
export function migrateSession(
  state: SessionState,
  definition: SurveyDefinition,
): { state: SessionState; report: MigrationReport } {
  const report: MigrationReport = { kept: [], removed: [], invalid: [], restarted: false };
  const answers: Record<string, Answer> = {};
  const abandoned: Record<string, Answer> = Object.fromEntries(
    Object.entries(state.abandonedAnswers ?? {}).map(([id, a]) => [id, Answer.from(a)]),
  );
  for (const [id, input] of Object.entries(state.answers ?? {})) {
    const answer = Answer.from(input);
    const question = definition.getQuestionById(id);
    if (!question) {
      report.removed.push(id);
      abandoned[id] = answer;
    } else if (validateAnswer(question, answer).length > 0) {
      report.invalid.push(question.id);
      abandoned[id] = answer;
    } else {
      report.kept.push(question.id);
      answers[id] = answer;
    }
  }
  const exists = (id: QuestionId): boolean => definition.indexOf(id) !== undefined;
  const currentGone = !state.finished && state.currentQuestionId !== undefined && !exists(state.currentQuestionId);
  report.restarted = currentGone;
  const next: SessionState = {
    ...state,
    answers,
    abandonedAnswers: abandoned,
    history: currentGone ? [] : (state.history ?? []).filter(exists),
    forward: currentGone ? [] : (state.forward ?? []).filter(exists),
    ...(definition.id === undefined ? {} : { definitionId: definition.id }),
    ...(definition.version === undefined ? {} : { definitionVersion: definition.version }),
  };
  if (currentGone) {
    delete next.currentQuestionId;
  }
  return { state: next, report };
}
