import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { SurveyDefinition, SurveySession, type SurveyDefinitionInput } from '../../src';
import type { SurveyWorld } from '../support/world';

interface RandomWorld extends SurveyWorld {
  randomDefinition?: SurveyDefinition;
  randomSessions?: SurveySession[];
  randomSession?: SurveySession;
  restored?: SurveySession;
}

function def(world: RandomWorld): SurveyDefinition {
  assert.ok(world.randomDefinition);
  return world.randomDefinition;
}

const options = (s: SurveySession) =>
  s
    .getOptions(s.definition.getQuestionById('pick'))
    .map((a) => String(a.value))
    .join(',');

/** Walks a fresh copy of the session through the survey and returns the question ids asked. */
function walk(s: SurveySession, pick = 'a'): string[] {
  const copy = new SurveySession(s.definition, JSON.parse(JSON.stringify(s.toJSON())) as object);
  const asked: string[] = [];
  let q = copy.getQuestion();
  while (q) {
    asked.push(String(q.id));
    copy.setAnswer({ value: q.id === 'pick' ? pick : q.type === 'rating' ? 3 : 'x' });
    q = copy.getNextQuestion();
  }
  return asked;
}

const section = (asked: string[]) => asked.filter((id) => id.startsWith('r'));

Given('a randomized definition:', function (this: RandomWorld, json: string) {
  this.randomDefinition = new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput);
});

Given('{int} randomized sessions', function (this: RandomWorld, count: number) {
  this.randomSessions = Array.from({ length: count }, (_v, i) => new SurveySession(def(this), { seed: i * 7919 }));
});

Given('a randomized session with seed {int}', function (this: RandomWorld, seed: number) {
  this.randomSession = new SurveySession(def(this), { seed });
});

When('it is saved and restored', function (this: RandomWorld) {
  assert.ok(this.randomSession);
  this.restored = new SurveySession(def(this), JSON.parse(JSON.stringify(this.randomSession)) as object);
});

When('it answers {string} and {string}', function (this: RandomWorld, a: string, b: string) {
  const s = this.randomSession;
  assert.ok(s);
  s.setAnswer({ value: a });
  s.getNextQuestion();
  s.setAnswer({ value: b });
  s.getNextQuestion();
});

Then('every session shows {string} 6th and {string} 7th', function (this: RandomWorld, sixth: string, seventh: string) {
  for (const s of this.randomSessions ?? []) {
    const order = options(s).split(',');
    assert.equal(order[5], sixth);
    assert.equal(order[6], seventh);
    assert.deepEqual([...order].sort(), ['a', 'b', 'c', 'd', 'e', 'none', 'other']);
  }
});

Then("the sessions don't all show the options in the same order", function (this: RandomWorld) {
  assert.ok(new Set((this.randomSessions ?? []).map(options)).size > 1);
});

Then('it shows the same option order', function (this: RandomWorld) {
  assert.ok(this.randomSession && this.restored);
  assert.equal(options(this.restored), options(this.randomSession));
});

Then('it asks the same section order', function (this: RandomWorld) {
  assert.ok(this.randomSession && this.restored);
  assert.deepEqual(walk(this.restored), walk(this.randomSession));
});

Then(
  'every session asks r1, r2, r3 and r4 exactly once between {string} and {string}',
  function (this: RandomWorld, before: string, after: string) {
    for (const s of this.randomSessions ?? []) {
      const asked = walk(s);
      assert.equal(asked[1], before);
      assert.deepEqual([...asked.slice(2, 6)].sort(), ['r1', 'r2', 'r3', 'r4']);
      assert.equal(asked[6], after);
    }
  },
);

Then("the sessions don't all ask the section in the same order", function (this: RandomWorld) {
  assert.ok(new Set((this.randomSessions ?? []).map((s) => section(walk(s)).join())).size > 1);
});

Then("every session that answers {string} goes straight to its section's first question", function (this: RandomWorld, pick: string) {
  for (const s of this.randomSessions ?? []) {
    const viaRule = walk(s, pick);
    assert.equal(viaRule.length, 6);
    assert.deepEqual(section(viaRule), section(walk(s)));
  }
});

Then('its page is the section in its order', function (this: RandomWorld) {
  assert.ok(this.randomSession);
  assert.deepEqual(
    this.randomSession.getPage().map((q) => String(q.id)),
    section(walk(this.randomSession)),
  );
});
