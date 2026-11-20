import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  Answer,
  Question,
  Survey,
  SurveyDefinition,
  SurveySession,
  type SessionJSON,
  type SessionState,
  type SurveyDefinitionInput,
} from '../../src';
import type { SurveyWorld } from '../support/world';

interface SessionWorld extends SurveyWorld {
  definition?: SurveyDefinition;
  sessions?: Map<string, SurveySession>;
  saved?: SessionJSON;
}

function definitionOf(world: SessionWorld): SurveyDefinition {
  if (!world.definition) {
    throw new Error('No definition in this scenario');
  }
  return world.definition;
}

function session(world: SessionWorld, name: string): SurveySession {
  const found = world.sessions?.get(name);
  if (!found) {
    throw new Error(`No session for "${name}"`);
  }
  return found;
}

function capture(world: SurveyWorld, fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    world.error = error;
  }
}

Given('a definition:', function (this: SessionWorld, json: string) {
  this.definition = new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput);
  this.sessions = new Map();
});

Given('a session for {string} on the definition', function (this: SessionWorld, name: string) {
  this.sessions?.set(name, new SurveySession(definitionOf(this)));
});

Given('{string} has the context:', function (this: SessionWorld, name: string, json: string) {
  session(this, name).setContext(JSON.parse(json) as Record<string, unknown>);
});

When('{string} answers {string}', function (this: SessionWorld, name: string, value: string) {
  session(this, name).setAnswer({ value });
});

When('{string} asks for the next question', function (this: SessionWorld, name: string) {
  session(this, name).getNextQuestion();
});

When('{string} pre-answers {string} with {string}', function (this: SessionWorld, name: string, id: string, value: string) {
  const question = definitionOf(this).getQuestionById(id);
  assert.ok(question);
  // Pre-answer before the session is first read, as when restoring answers from elsewhere.
  const s = new SurveySession(definitionOf(this), { answers: { [id]: { value } } });
  this.sessions?.set(name, s);
});

When('{string} is saved to JSON and restored', function (this: SessionWorld, name: string) {
  const state = JSON.parse(JSON.stringify(session(this, name))) as SessionState;
  this.sessions?.set(name, new SurveySession(definitionOf(this), state));
});

When('{string} is saved to JSON', function (this: SessionWorld, name: string) {
  this.saved = JSON.parse(JSON.stringify(session(this, name))) as SessionJSON;
});

When('I load a definition with schema version {int}', function (this: SessionWorld, version: number) {
  capture(this, () => new SurveyDefinition({ schemaVersion: version }));
});

When('I restore a session with schema version {int}', function (this: SessionWorld, version: number) {
  capture(this, () => new SurveySession(definitionOf(this), { schemaVersion: version }));
});

When('I build a 2.x style Survey with a mapped answer', function (this: SessionWorld) {
  const questions = ['a', 'b', 'c'].map((id) => new Question({ id, answers: [{ value: 'yes' }] }));
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- exercising the compatibility wrapper
  const survey = new Survey({ questions });
  const [a, , c] = survey.questions;
  assert.ok(a && c);
  survey.mapAnswer(a, new Answer({ value: 'yes' }), c);
  survey.setAnswer({ value: 'yes' });
  this.actualQuestion = survey.getNextQuestion();
});

Then('{string} has answered {string}', function (this: SessionWorld, name: string, id: string) {
  assert.ok(session(this, name).answers[id]);
});

Then('{string} has not answered {string}', function (this: SessionWorld, name: string, id: string) {
  assert.equal(session(this, name).answers[id], undefined);
});

Then('the current question for {string} is {string}', function (this: SessionWorld, name: string, id: string) {
  assert.equal(session(this, name).getQuestion()?.id, id);
});

Then('{string} is finished', function (this: SessionWorld, name: string) {
  assert.equal(session(this, name).getQuestion(), null);
});

Then('{string} can go back', function (this: SessionWorld, name: string) {
  assert.equal(session(this, name).back()?.id, 'distance');
});

Then(
  'the saved session has schema version {int}, definition {string} and definition version {int}',
  function (this: SessionWorld, schema: number, id: string, version: number) {
    assert.equal(this.saved?.schemaVersion, schema);
    assert.equal(this.saved.definitionId, id);
    assert.equal(this.saved.definitionVersion, version);
  },
);

Then('it routes like a session', function (this: SessionWorld) {
  assert.equal(this.actualQuestion?.id, 'c');
});

interface AnswerWorld extends SessionWorld {
  lastResult?: { ok: boolean; errors: { code: string }[] };
}

When(
  '{string} answers {string} with JSON {}',
  function (this: AnswerWorld, name: string, id: string, json: string) {
    const question = definitionOf(this).getQuestionById(id);
    assert.ok(question, `No question "${id}"`);
    this.lastResult = session(this, name).answer({ value: JSON.parse(json) as never }, question);
  },
);

Then('the answer is accepted', function (this: AnswerWorld) {
  assert.deepEqual(this.lastResult, { ok: true, errors: [] });
});

Then('the answer is rejected with {word}', function (this: AnswerWorld, code: string) {
  assert.equal(this.lastResult?.ok, false);
  assert.deepEqual(
    this.lastResult.errors.map((e) => e.code),
    [code],
  );
});

Then('validating {string} for {string} reports {word}', function (this: AnswerWorld, id: string, name: string, code: string) {
  const question = definitionOf(this).getQuestionById(id);
  assert.ok(question);
  assert.deepEqual(
    session(this, name).validate(question).map((e) => e.code),
    [code],
  );
});

Then('{string} stored false for {string}', function (this: AnswerWorld, name: string, id: string) {
  assert.equal(session(this, name).answers[id]?.value, false);
});
