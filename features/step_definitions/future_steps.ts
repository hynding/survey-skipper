import { Given } from '@cucumber/cucumber';
import { findAnswer } from '../support/helpers';
import type { SurveyWorld } from '../support/world';

Given('I pre-answer question {int} with {word}', function (this: SurveyWorld, num: number, value: string) {
  const question = this.question(num);
  this.currentSurvey.setAnswer(findAnswer(question, value), question);
});
