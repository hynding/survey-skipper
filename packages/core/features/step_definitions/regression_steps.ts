import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { Answer, Question, Survey, type QuestionInput } from '../../src';
import { getNewSurvey } from '../support/generator';
import { findAnswer } from '../support/helpers';
import type { SurveyWorld } from '../support/world';

function capture(world: SurveyWorld, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    world.error = error;
  }
}

Given(
  'a {int} question survey of {word} or {word} answers where question {int} answer {word} maps to {string}',
  function (this: SurveyWorld, length: number, a: string, b: string, from: number, value: string, to: string) {
    this.survey = getNewSurvey(length, [a, b], { [`q${String(from)}`]: { [value]: to } });
  },
);

Given('a survey whose question ids are numbers starting at 0', function (this: SurveyWorld) {
  this.survey = new Survey({
    questions: [0, 1, 2].map((id) => new Question({ id })),
    currentQuestionId: 2,
  });
});

When(/^I ask for the next (\d+) questions$/, function (this: SurveyWorld, num: string) {
  this.actualQuestions = this.currentSurvey.getNextQuestions(Number(num));
});

When('I answer those questions with {word}', function (this: SurveyWorld, value: string) {
  const questions = this.actualQuestions ?? [];
  this.currentSurvey.setAnswers(questions.map((q) => findAnswer(q, value)));
});

When(
  'I map an empty answer on question {int} to question {int}',
  function (this: SurveyWorld, a: number, b: number) {
    capture(this, () => this.currentSurvey.mapAnswer(this.question(a), new Answer({ value: '' }), this.question(b)));
  },
);

When(
  'I map question {int} answer {word} to a question outside the survey',
  function (this: SurveyWorld, a: number, value: string) {
    const from = this.question(a);
    capture(this, () => this.currentSurvey.mapAnswer(from, findAnswer(from, value), new Question({ id: 'elsewhere' })));
  },
);

When('I go to question id {int}', function (this: SurveyWorld, id: number) {
  this.actualQuestion = this.currentSurvey.getQuestion(id);
});

When('I create a question without an id', function (this: SurveyWorld) {
  capture(this, () => new Question({} as QuestionInput));
});

When('the survey is saved to JSON and restored', function (this: SurveyWorld) {
  const { questions, answers, answerMap } = this.currentSurvey;
  const saved = JSON.stringify({ questions, answers, answerMap, currentQuestionId: this.currentSurvey.getQuestion()?.id });
  this.survey = new Survey(JSON.parse(saved) as ConstructorParameters<typeof Survey>[0]);
});

Then('I am returned questions {int} through {int}', function (this: SurveyWorld, first: number, last: number) {
  const expected = this.currentSurvey.questions.slice(first - 1, last);
  assert.deepEqual(this.actualQuestions, expected);
});

Then('the current question id is {int}', function (this: SurveyWorld, id: number) {
  assert.equal(this.currentSurvey.getQuestion()?.id, id);
});

Then('an error is raised matching {string}', function (this: SurveyWorld, message: string) {
  assert.ok(this.error instanceof Error, 'Expected an error to be raised');
  assert.match(this.error.message, new RegExp(message));
});
