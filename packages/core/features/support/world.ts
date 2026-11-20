import { setWorldConstructor, World } from '@cucumber/cucumber';
import type { Question, SurveySession } from '../../src';

export class SurveyWorld extends World {
  survey: SurveySession | null = null;
  actualQuestion: Question | null = null;
  actualQuestions: Question[] | null = null;
  error: unknown = null;

  /** The survey created by a Given step; fails the step if there is none. */
  get currentSurvey(): SurveySession {
    if (!this.survey) {
      throw new Error('No survey has been created in this scenario');
    }
    return this.survey;
  }

  /** The 1-based question `num` of the current survey. */
  question(num: number): Question {
    const q = this.currentSurvey.questions[num - 1];
    if (!q) {
      throw new Error(`Survey has no question ${String(num)}`);
    }
    return q;
  }
}

setWorldConstructor(SurveyWorld);
