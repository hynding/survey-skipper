import jsonLogic from 'json-logic-js';
import type { AnswerValue } from './answer.js';
import type { QuestionId } from './question.js';
import { isNil } from './utils.js';

/**
 * A JsonLogic expression (https://jsonlogic.com), as plain JSON. Conditions are evaluated against
 * {@link RuleData}, so `{ "var": "answers.q1" }` reads the answer to question `q1` and
 * `{ "var": "context.role" }` reads the survey's context.
 *
 * Besides the standard operators, survey-skipper registers:
 * - `answered`: `{ "answered": "q1" }` is true when question `q1` has a valid answer.
 * - `matches`: `{ "matches": [{ "var": "answer" }, "^\\d{5}$"] }` tests a value against a regular expression.
 */
export type Condition = boolean | { [operator: string]: unknown };

/**
 * One branching rule on a question. Rules are checked in order after the question is answered (or skipped);
 * the first whose `if` holds decides where to go. A rule without `if` always matches.
 * Give exactly one of `goTo` (a question id) or `end` (a named ending, which finishes the survey).
 */
export interface Rule {
  if?: Condition;
  goTo?: QuestionId;
  end?: string;
}

/** The data a {@link Condition} is evaluated against. */
export interface RuleData {
  /** Valid answer values keyed by question id. Multiple-choice answers are lists. */
  answers: Record<string, AnswerValue>;
  /** The survey's context, such as the respondent's role, locale or experiment group. */
  context: Record<string, unknown>;
  /** The value of the answer to the question being routed from, or `null` if it has none. */
  answer: AnswerValue | null;
  /** The definition's computed variables, by name. */
  vars: Record<string, unknown>;
  /** The total of the `score`s of the options picked so far. */
  score?: number;
  /** Score totals by section. */
  scores?: Record<string, number>;
}

jsonLogic.add_operation('matches', (value: unknown, pattern: unknown): boolean => {
  if (typeof pattern !== 'string' || (typeof value !== 'string' && typeof value !== 'number')) {
    return false;
  }
  return new RegExp(pattern).test(String(value));
});

// JsonLogic calls operations with the evaluation data as `this`.
jsonLogic.add_operation('answered', function (this: Partial<RuleData> | undefined, id: unknown): boolean {
  const answers = this?.answers;
  return !!answers && (typeof id === 'string' || typeof id === 'number') && Object.hasOwn(answers, String(id));
});

/** Evaluates a condition. Anything JsonLogic considers truthy counts as a match. */
export function evaluate(condition: Condition | undefined, data: RuleData): boolean {
  if (condition === undefined) {
    return true;
  }
  const result: unknown = jsonLogic.apply(condition, data);
  return jsonLogic.truthy(result);
}

/** Evaluates a JsonLogic expression and returns its value, for computed variables. */
export function compute(expression: Condition, data: RuleData): unknown {
  return jsonLogic.apply(expression, data);
}

/** Throws a `TypeError` unless the rule has exactly one of `goTo` or `end`. */
export function assertRuleShape(rule: Rule): void {
  const hasGoTo = !isNil(rule.goTo);
  const hasEnd = typeof rule.end === 'string' && rule.end.length > 0;
  if (hasGoTo === hasEnd) {
    throw new TypeError('A rule needs exactly one of "goTo" or "end"');
  }
}
