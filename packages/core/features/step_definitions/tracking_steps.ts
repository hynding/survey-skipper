import assert from 'node:assert/strict';
import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import {
  aggregate,
  migrateSession,
  SurveyDefinition,
  SurveySession,
  timeOnQuestions,
  type AnswerValue,
  type MigrationReport,
  type SessionState,
  type SurveyStats,
} from '../../src';
import type { SurveyWorld } from '../support/world';

interface TrackingWorld extends SurveyWorld {
  definition?: SurveyDefinition;
  sessions?: Map<string, SurveySession>;
  stats?: SurveyStats;
  report?: MigrationReport;
}

function definitionOf(world: TrackingWorld): SurveyDefinition {
  assert.ok(world.definition);
  return world.definition;
}

function session(world: TrackingWorld, name: string): SurveySession {
  const found = world.sessions?.get(name);
  assert.ok(found, `No session for "${name}"`);
  return found;
}

Given('a session for {string} on the definition with a clock ticking one second per event', function (this: TrackingWorld, name: string) {
  let tick = 0;
  const now = (): Date => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
  this.sessions?.set(name, new SurveySession(definitionOf(this), {}, { now }));
});

Given('these sessions finished with answers:', function (this: TrackingWorld, table: DataTable) {
  const states: SessionState[] = table.hashes().map((row) => {
    const s = new SurveySession(definitionOf(this));
    let q = s.getQuestion();
    while (q) {
      const raw = row[String(q.id)];
      if (raw === undefined || raw === '') {
        break;
      }
      const value: AnswerValue = Number.isNaN(Number(raw)) ? raw : Number(raw);
      s.setAnswer({ value }, q);
      q = s.getNextQuestion();
    }
    return s.toJSON();
  });
  this.stats = aggregate(states);
});

When(
  '{string} is migrated to version 2, where {string} became text and {string} was removed',
  function (this: TrackingWorld, name: string, changed: string, removed: string) {
    const old = definitionOf(this).toJSON();
    const next = new SurveyDefinition({
      ...old,
      version: 2,
      variables: {},
      questions: old.questions
        .filter((q) => String(q.id) !== removed)
        .map((q) => (String(q.id) === changed ? { ...q, type: 'text' as const, text: 'Now text' } : q)),
    });
    const { state, report } = migrateSession(JSON.parse(JSON.stringify(session(this, name))) as SessionState, next);
    this.report = report;
    this.definition = next;
    this.sessions?.set(name, new SurveySession(next, state));
  },
);

Then('the timeline for {string} is {string}', function (this: TrackingWorld, name: string, expected: string) {
  const actual = session(this, name)
    .timeline.map((e) => `${e.type} ${String(e.questionId)}`)
    .join(', ');
  assert.equal(actual, expected);
});

Then(
  '{string} spent {int} ms on {string} and {int} ms on {string}',
  function (this: TrackingWorld, name: string, msA: number, a: string, msB: number, b: string) {
    const times = timeOnQuestions(session(this, name).timeline);
    assert.equal(times[a], msA);
    assert.equal(times[b], msB);
  },
);

Then('the variables for {string} are {}', function (this: TrackingWorld, name: string, json: string) {
  assert.deepEqual(session(this, name).getVariables(), JSON.parse(json));
});

Then(
  'the summary has {int} sessions, {int} completed and endings {}',
  function (this: TrackingWorld, total: number, completed: number, endings: string) {
    assert.ok(this.stats);
    assert.equal(this.stats.sessions, total);
    assert.equal(this.stats.completed, completed);
    assert.deepEqual(this.stats.endings, JSON.parse(endings));
  },
);

Then('question {string} was answered {int} times with {}', function (this: TrackingWorld, id: string, count: number, json: string) {
  const qs = this.stats?.questions[id];
  assert.ok(qs);
  assert.equal(qs.answered, count);
  assert.deepEqual(qs.distribution, JSON.parse(json));
});

Then('question {string} lost {int} respondent', function (this: TrackingWorld, id: string, count: number) {
  assert.equal(this.stats?.questions[id]?.droppedOff, count);
});

Then('the most common route is {string}', function (this: TrackingWorld, route: string) {
  assert.equal(this.stats?.paths[0]?.questions.map(String).join(', '), route);
});

Then(
  'the migration kept {string}, flagged {string} as invalid and restarted',
  function (this: TrackingWorld, kept: string, invalid: string) {
    assert.deepEqual(this.report?.kept, [kept]);
    assert.deepEqual(this.report.invalid, [invalid]);
    assert.equal(this.report.restarted, true);
  },
);

Then('{string} resumes at {string}', function (this: TrackingWorld, name: string, id: string) {
  assert.equal(session(this, name).getQuestion()?.id, id);
});

Then('{string} has an abandoned answer for {string}', function (this: TrackingWorld, name: string, id: string) {
  assert.ok(session(this, name).abandonedAnswers[id]);
});
