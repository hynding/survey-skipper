import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { getNewSurvey } from '../support/generator';
import { findAnswer } from '../support/helpers';
import type { SurveyWorld } from '../support/world';

Given(
  'a {int} question survey of {word} or {word} answers',
  function (this: SurveyWorld, length: number, a: string, b: string) {
    this.survey = getNewSurvey(length, [a, b]);
  },
);

Given(
  'question {int} answer {word} maps to question {int}',
  function (this: SurveyWorld, a: number, value: string, b: number) {
    const questionA = this.question(a);
    this.currentSurvey.mapAnswer(questionA, findAnswer(questionA, value), this.question(b));
  },
);

Given('I answer question {int} with {word}', function (this: SurveyWorld, num: number, value: string) {
  this.currentSurvey.setAnswer(findAnswer(this.question(num), value));
});

When('I ask for the next question', function (this: SurveyWorld) {
  this.actualQuestion = this.currentSurvey.getNextQuestion();
});

Then('I am returned question {int}', function (this: SurveyWorld, num: number) {
  assert.equal(this.actualQuestion, this.question(num));
});

Then('I do not receive another question', function (this: SurveyWorld) {
  assert.equal(this.actualQuestion, null);
  assert.equal(this.currentSurvey.getQuestion(), null);
});
