import { Answer, type AnswerInput } from './answer';
import { isNil } from './utils';

export type QuestionId = string | number;

export interface QuestionInput {
  id: QuestionId;
  text?: string;
  /** Plain objects are wrapped in {@link Answer}. */
  answers?: (Answer | AnswerInput)[];
}

export class Question {
  id: QuestionId;
  text: string | undefined;
  answers: Answer[];

  constructor({ id, text, answers = [] }: QuestionInput) {
    if (isNil(id)) {
      throw new TypeError('Question requires an id');
    }
    this.id = id;
    this.text = text;
    this.answers = answers.map((answer) => Answer.from(answer));
  }
}
