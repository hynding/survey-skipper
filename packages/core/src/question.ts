import { Answer, type AnswerInput } from './answer.js';
import type { Condition, Rule } from './rules.js';
import { isNil } from './utils.js';

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
export type BuiltInQuestionType = 'single' | 'multi' | 'text' | 'number' | 'rating' | 'date' | 'boolean';

/** A built-in type, or a name registered with `registerQuestionType`. */
// `string & {}` keeps editor suggestions for the built-in names.
export type QuestionType = BuiltInQuestionType | (string & {});

/** Text in other languages, keyed by locale (`fr`, `fr-CA`). */
export interface QuestionTranslation {
  text?: string;
  /** Answer option text keyed by the option's value. */
  answers?: Record<string, string>;
}

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
  /** Validators registered with `registerValidator`, run in order after the built-in checks. */
  custom?: { name: string; args?: unknown; message?: string }[];
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
  /** Consecutive questions with the same section form one page. See `SurveySession.getPage`. */
  section?: string;
  /** Whether an answer is needed before moving on. Checked by `SurveySession.answer` and `validate`. */
  required?: boolean;
  validation?: ValidationRules;
  /** Translations keyed by locale. The session picks one from `context.locale`. */
  translations?: Record<string, QuestionTranslation>;
  /**
   * Shows the answer options in a random order, fixed per session (see `SurveySession.getOptions`). Options marked
   * `fixed`, and custom options, keep their place.
   */
  randomize?: boolean;
}

export class Question {
  id: QuestionId;
  text: string | undefined;
  answers: Answer[];
  rules: Rule[];
  showIf: Condition | undefined;
  skipIf: Condition | undefined;
  type: QuestionType | undefined;
  section: string | undefined;
  required: boolean;
  validation: ValidationRules;
  translations: Record<string, QuestionTranslation>;
  randomize: boolean | undefined;

  constructor({ id, text, answers = [], rules = [], showIf, skipIf, type, section, required = false, validation = {}, translations = {}, randomize }: QuestionInput) {
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
    this.section = section;
    this.required = required;
    this.validation = { ...validation };
    this.translations = { ...translations };
    this.randomize = randomize;
  }

  /** Wraps a plain object (e.g. deserialized JSON) in a Question; passes Questions through. */
  static from(input: Question | QuestionInput): Question {
    return input instanceof Question ? input : new Question(input);
  }
}
