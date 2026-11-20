import { isNil } from './utils';

/** A primitive value an answer can carry. Booleans are stored as 1 / 0. */
export type AnswerValue = string | number;

/** Plain-object shape accepted wherever an {@link Answer} is expected. */
export interface AnswerInput {
  text?: string;
  value?: AnswerValue | boolean | null;
  isCustom?: boolean;
}

export class Answer {
  text: string | undefined;
  value: AnswerValue | null | undefined;
  isCustom: boolean;

  constructor({ text, value, isCustom = false }: AnswerInput = {}) {
    this.value = sanitize(value);
    this.text = text ?? (isNil(this.value) ? undefined : String(value));
    this.isCustom = isCustom;
  }

  /** Wraps a plain object (e.g. deserialized JSON) in an Answer; passes Answers through. */
  static from(input: Answer | AnswerInput): Answer {
    return input instanceof Answer ? input : new Answer(input);
  }

  isValid(): this is Answer & { value: AnswerValue } {
    return this.value !== '' && !isNil(this.value);
  }
}

function sanitize(value: AnswerInput['value']): AnswerValue | null | undefined {
  if (value === true) return 1;
  if (value === false) return 0;
  return value;
}
