import { isNil } from './utils.js';

/** A single value an answer can carry. */
export type ScalarValue = string | number | boolean;

/** The value of an answer: one scalar, or a list of them for multiple-choice questions. */
export type AnswerValue = ScalarValue | ScalarValue[];

/** Plain-object shape accepted wherever an {@link Answer} is expected. */
export interface AnswerInput {
  text?: string;
  value?: AnswerValue | null;
  isCustom?: boolean;
}

export class Answer {
  text: string | undefined;
  value: AnswerValue | null | undefined;
  isCustom: boolean;

  constructor({ text, value, isCustom = false }: AnswerInput = {}) {
    this.value = Array.isArray(value) ? [...value] : value;
    this.text = text ?? (isNil(this.value) ? undefined : Array.isArray(this.value) ? this.value.join(', ') : String(this.value));
    this.isCustom = isCustom;
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
    return !Array.isArray(this.value) || this.value.length > 0;
  }
}
