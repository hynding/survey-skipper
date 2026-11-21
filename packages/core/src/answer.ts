import { isNil } from './utils.js';

/** A single value an answer can carry. */
export type ScalarValue = string | number | boolean;

/** A matrix answer: the column picked for each row, keyed by row value. */
export type MatrixValue = Record<string, ScalarValue>;

/**
 * The value of an answer: one scalar, a list of them (multiple choice, ranking), or a {@link MatrixValue} (matrix).
 */
export type AnswerValue = ScalarValue | ScalarValue[] | MatrixValue;

/** Plain-object shape accepted wherever an {@link Answer} is expected. */
export interface AnswerInput {
  text?: string;
  value?: AnswerValue | null;
  isCustom?: boolean;
  /** Keeps this option in place when the question's options are shuffled (`randomize`). Custom options always stay. */
  fixed?: boolean;
  /** Points for picking this option, added up by `SurveySession.getScore()`. */
  score?: number;
}

export class Answer {
  text: string | undefined;
  value: AnswerValue | null | undefined;
  isCustom: boolean;
  /** Set only on options that stay in place when options are shuffled. */
  fixed?: boolean;
  /** Points for picking this option. */
  score?: number;

  constructor({ text, value, isCustom = false, fixed, score }: AnswerInput = {}) {
    this.value = Array.isArray(value) ? [...value] : isMatrix(value) ? { ...value } : value;
    this.text = text ?? (isNil(this.value) ? undefined : formatAnswerValue(this.value));
    this.isCustom = isCustom;
    if (fixed) {
      this.fixed = true;
    }
    if (score !== undefined) {
      this.score = score;
    }
  }

  /** Wraps a plain object (e.g. deserialized JSON) in an Answer; passes Answers through. */
  static from(input: Answer | AnswerInput): Answer {
    return input instanceof Answer ? input : new Answer(input);
  }

  /** An answer is valid when it has a value that is not `null`, `undefined`, an empty string or an empty list. */
  isValid(): this is Answer & { value: AnswerValue } {
    if (isNil(this.value) || this.value === '') {
      return false;
    }
    if (Array.isArray(this.value)) {
      return this.value.length > 0;
    }
    return !isMatrix(this.value) || Object.keys(this.value).length > 0;
  }
}

/** Whether a value is a matrix answer (a plain object). */
export function isMatrix(value: unknown): value is MatrixValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** An answer value as text: lists joined with `, `, matrices as `row: column` pairs. */
export function formatAnswerValue(value: AnswerValue): string {
  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }
  if (isMatrix(value)) {
    return Object.entries(value)
      .map(([row, column]) => `${row}: ${String(column)}`)
      .join(', ');
  }
  return String(value);
}

/** An option or answer value as a lookup key: like `String(value)`, with lists joined by `,`. */
export function valueKey(value: AnswerValue | null | undefined): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  return Array.isArray(value) ? value.map(String).join(',') : isMatrix(value) ? formatAnswerValue(value) : String(value);
}
