import { Answer, type AnswerInput } from './answer';
import type { Condition, Rule } from './rules';
import { isNil } from './utils';

export type QuestionId = string | number;

/**
 * What kind of answer a question expects. Untyped questions accept any value.
 * - `single`: one of the answer options (any value if a custom option exists)
 * - `multi`: a list of answer options
 * - `text`: a string
 * - `number`: a finite number
 * - `rating`: a whole number on a scale (`validation.min`..`validation.max`, default 1..5)
 * - `date`: an ISO date string, `YYYY-MM-DD`
 * - `boolean`: `true` or `false`
 */
export type QuestionType = 'single' | 'multi' | 'text' | 'number' | 'rating' | 'date' | 'boolean';

/** Constraints checked by `validateAnswer` and `SurveySession.answer`. */
export interface ValidationRules {
  /** Lowest number or rating, or earliest date (`YYYY-MM-DD`). */
  min?: number | string;
  /** Highest number or rating, or latest date (`YYYY-MM-DD`). */
  max?: number | string;
  minLength?: number;
  maxLength?: number;
  /** A regular expression that text answers must match. */
  pattern?: string;
  minSelected?: number;
  maxSelected?: number;
}

export interface QuestionInput {
  id: QuestionId;
  text?: string;
  /** Plain objects are wrapped in {@link Answer}. */
  answers?: (Answer | AnswerInput)[];
  /** Branching rules, checked in order when leaving this question. See {@link Rule}. */
  rules?: Rule[];
  /** When set, the question is only asked if this condition holds; otherwise the survey routes past it. */
  showIf?: Condition;
  /** When set, the question is routed past without being asked if this condition holds. */
  skipIf?: Condition;
  type?: QuestionType;
  /** Whether an answer is needed before moving on. Checked by `SurveySession.answer` and `validate`. */
  required?: boolean;
  validation?: ValidationRules;
}

export class Question {
  id: QuestionId;
  text: string | undefined;
  answers: Answer[];
  rules: Rule[];
  showIf: Condition | undefined;
  skipIf: Condition | undefined;
  type: QuestionType | undefined;
  required: boolean;
  validation: ValidationRules;

  constructor({ id, text, answers = [], rules = [], showIf, skipIf, type, required = false, validation = {} }: QuestionInput) {
    if (isNil(id)) {
      throw new TypeError('Question requires an id');
    }
    this.id = id;
    this.text = text;
    this.answers = answers.map((answer) => Answer.from(answer));
    this.rules = rules.map((rule) => ({ ...rule }));
    this.showIf = showIf;
    this.skipIf = skipIf;
    this.type = type;
    this.required = required;
    this.validation = { ...validation };
  }

  /** Wraps a plain object (e.g. deserialized JSON) in a Question; passes Questions through. */
  static from(input: Question | QuestionInput): Question {
    return input instanceof Question ? input : new Question(input);
  }
}
