import { Given } from '@cucumber/cucumber';
import { Answer } from '../../src';
import { findCustomAnswer } from '../support/helpers';
import type { SurveyWorld } from '../support/world';

Given('I custom answer question {int} with a random value', function (this: SurveyWorld, num: number) {
  const template = findCustomAnswer(this.question(num));
  // Answer with a fresh Answer so the question's own answer options are not mutated.
  this.currentSurvey.setAnswer(
    new Answer({ text: template.text, value: Math.round(Math.random() * 10000), isCustom: true }),
  );
});
