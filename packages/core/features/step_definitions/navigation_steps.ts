import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { SurveyDefinition, SurveySession, type SessionState, type SurveyDefinitionInput } from '../../src';
import { getNewQuestions } from '../support/generator';
import { findAnswer } from '../support/helpers';
import type { SurveyWorld } from '../support/world';

Given(
  'a {int} question survey of {word} or {word} answers that discards abandoned answers',
  function (this: SurveyWorld, length: number, a: string, b: string) {
    this.survey = new SurveySession(
      new SurveyDefinition({ questions: getNewQuestions(length, [a, b]), keepAbandonedAnswers: false }),
    );
  },
);

When('I go back', function (this: SurveyWorld) {
  this.actualQuestion = this.currentSurvey.back();
});

When('the survey and its navigation are saved to JSON and restored', function (this: SurveyWorld) {
  const definition = JSON.parse(JSON.stringify(this.currentSurvey.definition)) as SurveyDefinitionInput;
  const state = JSON.parse(JSON.stringify(this.currentSurvey)) as SessionState;
  this.survey = new SurveySession(new SurveyDefinition(definition), state);
});

Then('I am not moved', function (this: SurveyWorld) {
  assert.equal(this.actualQuestion, null);
  assert.equal(this.currentSurvey.canGoBack(), false);
});

Then('the current question is question {int}', function (this: SurveyWorld, num: number) {
  assert.equal(this.currentSurvey.getQuestion(), this.question(num));
});

Then('question {int} is still answered {word}', function (this: SurveyWorld, num: number, value: string) {
  assert.equal(this.currentSurvey.answers[String(this.question(num).id)]?.value, value);
});

Then('question {int} has an abandoned answer of {word}', function (this: SurveyWorld, num: number, value: string) {
  assert.equal(this.currentSurvey.abandonedAnswers[String(this.question(num).id)]?.value, value);
});

Then('question {int} has no abandoned answer', function (this: SurveyWorld, num: number) {
  assert.equal(this.currentSurvey.abandonedAnswers[String(this.question(num).id)], undefined);
});

Then('question {int} has no active answer', function (this: SurveyWorld, num: number) {
  assert.equal(this.currentSurvey.answers[String(this.question(num).id)], undefined);
});

Then('the path is questions {int}, {int}', function (this: SurveyWorld, a: number, b: number) {
  assert.deepEqual(this.currentSurvey.getPath(), [this.question(a), this.question(b)]);
});

Then(
  'when I ask for the next question I am returned question {int}',
  function (this: SurveyWorld, num: number) {
    assert.equal(this.currentSurvey.getNextQuestion(), this.question(num));
  },
);

Then(
  'when I answer question {int} with {word} it has no abandoned answer',
  function (this: SurveyWorld, num: number, value: string) {
    const q = this.question(num);
    this.currentSurvey.setAnswer(findAnswer(q, value));
    assert.equal(this.currentSurvey.abandonedAnswers[String(q.id)], undefined);
    assert.equal(this.currentSurvey.answers[String(q.id)]?.value, value);
  },
);

When('I go to question {int}', function (this: SurveyWorld, num: number) {
  this.actualQuestion = this.currentSurvey.goTo(this.question(num).id);
});

Then('I can go to question {int}', function (this: SurveyWorld, num: number) {
  assert.equal(this.currentSurvey.canGoTo(this.question(num).id), true);
});

Then("I can't go to question {int}", function (this: SurveyWorld, num: number) {
  assert.equal(this.currentSurvey.canGoTo(this.question(num).id), false);
});

Then('going to question {int} is refused', function (this: SurveyWorld, num: number) {
  const before = this.currentSurvey.getQuestion();
  assert.throws(() => this.currentSurvey.goTo(this.question(num).id), RangeError);
  assert.equal(this.currentSurvey.getQuestion(), before);
});

Then('when I go to question {int} the current question is question {int}', function (this: SurveyWorld, a: number, b: number) {
  this.currentSurvey.goTo(this.question(a).id);
  assert.equal(this.currentSurvey.getQuestion(), this.question(b));
});

Then("when question {int}'s answer is removed I can't go to question {int}", function (this: SurveyWorld, a: number, b: number) {
  Reflect.deleteProperty(this.currentSurvey.answers, String(this.question(a).id));
  assert.equal(this.currentSurvey.canGoTo(this.question(b).id), false);
});
