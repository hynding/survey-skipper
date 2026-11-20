import assert from 'node:assert/strict';
import { After, Given, Then, When } from '@cucumber/cucumber';
import {
  MemoryStore,
  registerOperator,
  registerQuestionType,
  registerValidator,
  resetPlugins,
  resumeSession,
  SurveyDefinition,
  type SurveySession,
} from '../../src';
import type { SurveyWorld } from '../support/world';

interface EcoWorld extends SurveyWorld {
  definition?: SurveyDefinition;
  sessions?: Map<string, SurveySession>;
  store?: MemoryStore;
  resumed?: SurveySession;
}

After(() => {
  resetPlugins();
});

function session(world: EcoWorld, name: string): SurveySession {
  const found = world.sessions?.get(name);
  assert.ok(found, `No session for "${name}"`);
  return found;
}

function store(world: EcoWorld): MemoryStore {
  assert.ok(world.store);
  return world.store;
}

Given('the operator {string} is registered', function (name: string) {
  registerOperator(name, (a: never, b: never) => Math.abs(Number(a) - Number(b)) <= 5);
});

When('I try to register the operator {string}', function (this: EcoWorld, name: string) {
  try {
    registerOperator(name, () => true);
  } catch (error) {
    this.error = error;
  }
});

Given('the question type {string} is registered', function (name: string) {
  registerQuestionType(name, (value) => (typeof value === 'string' && value.includes('@') ? undefined : 'Expected an email address'));
});

Given('the validator {string} is registered', function (name: string) {
  registerValidator(name, (value, _question, domain) =>
    typeof value === 'string' && typeof domain === 'string' && value.endsWith(`@${domain}`) ? `Use an address outside ${domain}` : undefined,
  );
});

Given('the definition is saved to a memory store', async function (this: EcoWorld) {
  this.store = new MemoryStore();
  assert.ok(this.definition);
  await this.store.saveDefinition(this.definition);
});

Given('{string} is saved to the store as {string}', async function (this: EcoWorld, name: string, id: string) {
  await store(this).saveSession(id, session(this, name));
});

Given('version 2 of the definition is saved to the store', async function (this: EcoWorld) {
  assert.ok(this.definition);
  await store(this).saveDefinition({ ...this.definition.toJSON(), version: 2, questions: [{ id: 'z' }] });
});

When('{string} is resumed from the store', async function (this: EcoWorld, id: string) {
  this.resumed = await resumeSession(store(this), id);
});

Then(
  'the resumed session is on {string} with definition version {int}',
  function (this: EcoWorld, id: string, version: number) {
    assert.equal(this.resumed?.getQuestion()?.id, id);
    assert.equal(this.resumed.definition.version, version);
  },
);

Then('the store lists {int} session for definition {string}', async function (this: EcoWorld, count: number, id: string) {
  assert.equal((await store(this).listSessions(id)).length, count);
});

Then('the store\'s latest version of {string} is {int}', async function (this: EcoWorld, id: string, version: number) {
  assert.equal((await store(this).loadDefinition(id))?.version, version);
});

Then(
  '{string} sees the title {string}, question {string} and option {string}',
  function (this: EcoWorld, name: string, title: string, question: string, option: string) {
    const s = session(this, name);
    const q = s.getQuestion();
    assert.ok(q);
    const first = q.answers[0];
    assert.ok(first);
    assert.equal(s.getTitle(), title);
    assert.equal(s.getQuestionText(q), question);
    assert.equal(s.getAnswerText(first, q), option);
  },
);
