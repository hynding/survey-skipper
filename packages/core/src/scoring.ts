import { isMatrix, valueKey, type Answer, type AnswerInput } from './answer.js';
import type { SurveyDefinition } from './definition.js';

/** A respondent's score: the total, and the part from each section. */
export interface Score {
  total: number;
  /** Totals by question `section`. Questions without a section count only in `total`. */
  sections: Record<string, number>;
}

/**
 * Adds up the `score` of the options picked in `answers`: one option for single answers, every picked option for
 * list answers. Answers that match no option score their question's custom option, if it has a score.
 */
export function scoreAnswers(
  definition: SurveyDefinition,
  answers: Record<string, Answer | AnswerInput | undefined>,
): Score {
  const result: Score = { total: 0, sections: {} };
  for (const question of definition.questions) {
    const answer = answers[String(question.id)];
    const value = answer?.value;
    if (value === undefined || value === null || value === '' || isMatrix(value)) {
      continue;
    }
    const scored = question.answers.filter((a) => a.score !== undefined);
    if (scored.length === 0) {
      continue;
    }
    let points = 0;
    for (const item of Array.isArray(value) ? value : [value]) {
      const option = scored.find((a) => !a.isCustom && valueKey(a.value) === String(item)) ?? scored.find((a) => a.isCustom);
      points += option?.score ?? 0;
    }
    result.total += points;
    if (question.section !== undefined) {
      result.sections[question.section] = (result.sections[question.section] ?? 0) + points;
    }
  }
  return result;
}
