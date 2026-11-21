import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { SurveyDefinition, SurveySession, toCSV, toRows, type ExportOptions, type ResponseTable, type SessionState } from '../../src';
import type { SurveyWorld } from '../support/world';

interface ExportWorld extends SurveyWorld {
  exportDefinition?: SurveyDefinition;
  exported?: { sessionId: string; state: SessionState }[];
  table?: ResponseTable;
  exportOptions?: ExportOptions;
}

function start(world: ExportWorld): SurveySession {
  assert.ok(world.exportDefinition);
  let tick = 0;
  const now = (): Date => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
  return new SurveySession(world.exportDefinition, { context: { source: 'ad' } }, { now });
}

function keep(world: ExportWorld, id: string, session: SurveySession): void {
  world.exported ??= [];
  world.exported.push({ sessionId: id, state: session.toJSON() });
}

Given('an export definition:', function (this: ExportWorld, json: string) {
  this.exportDefinition = new SurveyDefinition(JSON.parse(json) as object);
});

Given(
  'an exported session {string} answering name {string}, pets {} and why {string}',
  function (this: ExportWorld, id: string, name: string, pets: string, why: string) {
    const s = start(this);
    s.setAnswer({ value: name });
    s.getNextQuestion();
    s.setAnswer({ value: JSON.parse(pets) as string[] });
    s.getNextQuestion();
    s.setAnswer({ value: why });
    s.getNextQuestion();
    keep(this, id, s);
  },
);

Given('an exported session {string} answering name {string} only', function (this: ExportWorld, id: string, name: string) {
  const s = start(this);
  s.setAnswer({ value: name });
  keep(this, id, s);
});

When('the responses are exported', function (this: ExportWorld) {
  assert.ok(this.exportDefinition && this.exported);
  this.table = toRows(this.exportDefinition, this.exported);
});

When('the responses are exported with timings and context', function (this: ExportWorld) {
  assert.ok(this.exportDefinition && this.exported);
  this.exportOptions = { includeTimings: true, includeContext: true };
  this.table = toRows(this.exportDefinition, this.exported, this.exportOptions);
});

Then('the columns are {string}', function (this: ExportWorld, expected: string) {
  assert.equal(this.table?.columns.join(', '), expected);
});

Then('the columns include {string}', function (this: ExportWorld, expected: string) {
  for (const column of expected.split(', ')) {
    assert.ok(this.table?.columns.includes(column), `missing ${column}`);
  }
});

Then(
  'row {int} has name {string}, pets {}, finished {word} and ending {}',
  function (this: ExportWorld, n: number, name: string, pets: string, finished: string, ending: string) {
    const row = this.table?.rows[n - 1];
    assert.ok(row);
    assert.equal(row.name, name);
    assert.deepEqual(row.pets, JSON.parse(pets));
    assert.equal(row.finished, finished === 'true');
    assert.equal(row.ending, JSON.parse(ending));
  },
);

Then('row {int} took {int} ms', function (this: ExportWorld, n: number, ms: number) {
  assert.equal(this.table?.rows[n - 1]?.durationMs, ms);
});

Then('row {int} has {string} {string} and {string} {int}', function (this: ExportWorld, n: number, a: string, av: string, b: string, bv: number) {
  const row = this.table?.rows[n - 1];
  assert.equal(row?.[a], av);
  assert.equal(row[b], bv);
});

Then('the CSV is:', function (this: ExportWorld, expected: string) {
  assert.ok(this.exportDefinition && this.exported);
  assert.equal(toCSV(this.exportDefinition, this.exported), expected.split('\n').join('\r\n') + '\r\n');
});
