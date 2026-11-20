import { Answer, type AnswerInput } from './answer';
import type { Condition, Rule } from './rules';
import { isNil } from './utils';

export type QuestionId = string | number;

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
}

export class Question {
  id: QuestionId;
  text: string | undefined;
  answers: Answer[];
  rules: Rule[];
  showIf: Condition | undefined;
  skipIf: Condition | undefined;

  constructor({ id, text, answers = [], rules = [], showIf, skipIf }: QuestionInput) {
    if (isNil(id)) {
      throw new TypeError('Question requires an id');
    }
    this.id = id;
    this.text = text;
    this.answers = answers.map((answer) => Answer.from(answer));
    this.rules = rules.map((rule) => ({ ...rule }));
    this.showIf = showIf;
    this.skipIf = skipIf;
  }

  /** Wraps a plain object (e.g. deserialized JSON) in a Question; passes Questions through. */
  static from(input: Question | QuestionInput): Question {
    return input instanceof Question ? input : new Question(input);
  }
}
