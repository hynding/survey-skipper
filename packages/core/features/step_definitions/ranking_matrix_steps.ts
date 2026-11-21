import assert from 'node:assert/strict';
import { Given, Then } from '@cucumber/cucumber';
import { aggregate, SurveyDefinition, SurveySession, toRows, type AnswerValue, type SurveyDefinitionInput } from '../../src';
import type { SurveyWorld } from '../support/world';

interface GridWorld extends SurveyWorld {
  grid?: SurveyDefinition;
  gridSessions?: SurveySession[];
}

const def = (world: GridWorld): SurveyDefinition => {
  assert.ok(world.grid);
  return world.grid;
};

Given('a ranking and matrix definition:', function (this: GridWorld, json: string) {
  this.grid = new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput);
});

Given('a ranking and matrix session that ranks and rates {}', function (this: GridWorld, json: string) {
  const s = new SurveySession(def(this));
  for (const value of [['speed', 'price', 'support'], ['a', 'b'], JSON.parse(json) as AnswerValue, 'done']) {
    const result = s.answer({ value });
    assert.ok(result.ok, JSON.stringify(result.errors));
    if (!s.getNextQuestion()) {
      break;
    }
  }
  this.gridSessions ??= [];
  this.gridSessions.push(s);
});

Then('answering {string} with {} gives {string}', function (this: GridWorld, id: string, json: string, expected: string) {
  const s = new SurveySession(def(this));
  const q = def(this).getQuestionById(id);
  assert.ok(q);
  const result = s.answer({ value: JSON.parse(json) as AnswerValue }, q);
  assert.equal(result.ok ? 'ok' : result.errors[0]?.code, expected, JSON.stringify(result.errors));
});

Then('the ranking and matrix session ended with {string}', function (this: GridWorld, ending: string) {
  const s = this.gridSessions?.at(-1);
  assert.equal(s?.getQuestion(), null);
  assert.equal(s.ending, ending);
});

Then('the distribution of {string} is {}', function (this: GridWorld, id: string, json: string) {
  assert.deepEqual(aggregate(this.gridSessions ?? []).questions[id]?.distribution, JSON.parse(json));
});

Then('the export has columns {string}', function (this: GridWorld, expected: string) {
  const { columns } = toRows(def(this), this.gridSessions ?? []);
  assert.equal(columns.slice(7).join(', '), expected);
});

Then('export row {int} has {string} {int} and {string} {}', function (this: GridWorld, n: number, a: string, av: number, b: string, bv: string) {
  const row = toRows(def(this), this.gridSessions ?? []).rows[n - 1];
  assert.equal(row?.[a], av);
  assert.deepEqual(row[b], JSON.parse(bv));
});
