import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { lintDefinition, SurveyDefinition, SurveySession, type AnswerValue, type SurveyDefinitionInput, valueKey } from '../../src';
import type { SurveyWorld } from '../support/world';

interface CarryWorld extends SurveyWorld {
  carryDefinition?: SurveyDefinition;
  carrySession?: SurveySession;
}

const session = (world: CarryWorld): SurveySession => {
  assert.ok(world.carrySession);
  return world.carrySession;
};
const question = (s: SurveySession, id: string) => {
  const q = s.definition.getQuestionById(id);
  assert.ok(q);
  return q;
};
const valueOf = (raw: string, s: SurveySession, id: string): AnswerValue =>
  question(s, id).type === 'multi' ? [raw] : raw;

Given('a carry-forward definition:', function (this: CarryWorld, json: string) {
  this.carryDefinition = new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput);
});

Given('a carry-forward session that picked {}', function (this: CarryWorld, picked: string) {
  assert.ok(this.carryDefinition);
  const s = new SurveySession(this.carryDefinition);
  const values = JSON.parse(picked) as string[];
  s.setAnswer({ value: values, isCustom: values.includes('other-thing') });
  this.carrySession = s;
});

When('it answers {string} with {string} and moves on', function (this: CarryWorld, _id: string, value: string) {
  const s = session(this);
  s.getNextQuestion();
  s.setAnswer({ value });
  s.getNextQuestion();
});

Then('the options for {string} are {string}', function (this: CarryWorld, id: string, expected: string) {
  const s = session(this);
  assert.equal(s.getOptions(question(s, id)).map((a) => valueKey(a.value)).join(', '), expected);
});

Then('answering {string} with {string} fails with {string}', function (this: CarryWorld, id: string, value: string, code: string) {
  const s = session(this);
  const result = s.answer({ value: valueOf(value, s, id) }, question(s, id));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, code);
});

Then('answering {string} with {string} succeeds', function (this: CarryWorld, id: string, value: string) {
  const s = session(this);
  assert.equal(s.answer({ value: valueOf(value, s, id) }, question(s, id)).ok, true);
});

Then('the carry-forward session is on {string}', function (this: CarryWorld, id: string) {
  assert.equal(session(this).getQuestion()?.id, id);
});

Then('moving on from {string} reaches {string}', function (this: CarryWorld, from: string, id: string) {
  assert.equal(session(this).getQuestion()?.id, from);
  assert.equal(session(this).getNextQuestion()?.id, id);
});

Then('linting the carry-forward definition finds no problems', function (this: CarryWorld) {
  assert.ok(this.carryDefinition);
  assert.deepEqual(lintDefinition(this.carryDefinition), []);
});
