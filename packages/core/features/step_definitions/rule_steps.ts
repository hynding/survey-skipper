import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  SurveyDefinition,
  SurveySession,
  type Question,
  type SessionState,
  type SurveyDefinitionInput,
} from '../../src';
import type { SurveyWorld } from '../support/world';

function byId(world: SurveyWorld, id: string): Question {
  const q = world.currentSurvey.questions.find((question) => String(question.id) === id);
  if (!q) {
    throw new Error(`Survey has no question "${id}"`);
  }
  return q;
}

function capture(world: SurveyWorld, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    world.error = error;
  }
}

Given('a survey defined as:', function (this: SurveyWorld, json: string) {
  this.survey = new SurveySession(new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput));
});

Given('the context is:', function (this: SurveyWorld, json: string) {
  this.currentSurvey.setContext(JSON.parse(json) as Record<string, unknown>);
});

Given('I answer {string} with {string}', function (this: SurveyWorld, id: string, value: string) {
  this.currentSurvey.setAnswer({ value }, byId(this, id));
});

Given(
  'answer {string} on {string} maps to {string} in the answer map',
  function (this: SurveyWorld, value: string, from: string, to: string) {
    this.currentSurvey.definition.answerMap[from] = { [value]: to };
  },
);

Given(
  'I add a rule to {string} that goes to {string} when the answer is {string}',
  function (this: SurveyWorld, id: string, to: string, value: string) {
    this.currentSurvey.definition.addRule(byId(this, id), { if: { '==': [{ var: 'answer' }, value] }, goTo: to });
  },
);

When('I add a rule to {string} with both goTo and end', function (this: SurveyWorld, id: string) {
  capture(this, () => this.currentSurvey.definition.addRule(byId(this, id), { goTo: 'done', end: 'finished' }));
});

When('I add a rule to {string} that goes to {string}', function (this: SurveyWorld, id: string, to: string) {
  capture(this, () => this.currentSurvey.definition.addRule(byId(this, id), { goTo: to }));
});

When('the whole survey is saved to JSON and restored', function (this: SurveyWorld) {
  const definition = JSON.parse(JSON.stringify(this.currentSurvey.definition)) as SurveyDefinitionInput;
  const state = JSON.parse(JSON.stringify(this.currentSurvey)) as SessionState;
  this.survey = new SurveySession(new SurveyDefinition(definition), state);
});

Then('the next question is {string}', function (this: SurveyWorld, id: string) {
  assert.equal(this.actualQuestion?.id, id);
  assert.equal(this.currentSurvey.getQuestion()?.id, id);
});

Then('the survey ended as {string}', function (this: SurveyWorld, ending: string) {
  assert.equal(this.currentSurvey.ending, ending);
});

Then('the survey has no ending', function (this: SurveyWorld) {
  assert.equal(this.currentSurvey.ending, undefined);
});

Then('the context role is {string}', function (this: SurveyWorld, role: string) {
  assert.equal(this.currentSurvey.context.role, role);
});

Then('question {string} still has {int} rules', function (this: SurveyWorld, id: string, count: number) {
  assert.equal(byId(this, id).rules.length, count);
});
