import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import {
  countQuotas,
  lintDefinition,
  quotaStatus,
  SurveyDefinition,
  SurveySession,
  type Quota,
  type SurveyDefinitionInput,
} from '../../src';
import type { SurveyWorld } from '../support/world';

interface QuotaWorld extends SurveyWorld {
  quotaDefinition?: SurveyDefinition;
  quotaSessions?: SurveySession[];
  respondent?: SurveySession;
  counts?: Record<string, number>;
}

const def = (world: QuotaWorld): SurveyDefinition => {
  assert.ok(world.quotaDefinition);
  return world.quotaDefinition;
};

const run = (definition: SurveyDefinition, age: number, device: string, finish: boolean): SurveySession => {
  const s = new SurveySession(definition, { context: { device } });
  s.answer({ value: age });
  if (finish) {
    while (s.getNextQuestion()) {
      s.answer({ value: 'x' });
    }
  }
  return s;
};

const respondent = (world: QuotaWorld, device: string): SurveySession => {
  world.counts ??= countQuotas(def(world), world.quotaSessions ?? []);
  return new SurveySession(def(world), { context: { device } }, { quotaCounts: world.counts });
};

Given('a quota definition:', function (this: QuotaWorld, json: string) {
  this.quotaDefinition = new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput);
});

Given('finished quota sessions with ages {} on {string}', function (this: QuotaWorld, ages: string, device: string) {
  this.quotaSessions ??= [];
  for (const age of ages.split(', ').map(Number)) {
    this.quotaSessions.push(run(def(this), age, device, true));
  }
});

Given('an unfinished quota session aged {int}', function (this: QuotaWorld, age: number) {
  this.quotaSessions?.push(run(def(this), age, 'desktop', false));
});

When('a new respondent on {string} answers age {int}', function (this: QuotaWorld, device: string, age: number) {
  const s = respondent(this, device);
  s.answer({ value: age });
  s.getNextQuestion();
  this.respondent = s;
});

When('a respondent without quota counts answers age {int}', function (this: QuotaWorld, age: number) {
  const s = new SurveySession(def(this));
  s.answer({ value: age });
  s.getNextQuestion();
  this.respondent = s;
});

When('a new respondent on {string} is checked against quotas', function (this: QuotaWorld, device: string) {
  const s = respondent(this, device);
  assert.equal(s.checkQuotas()?.id, 'mobile');
  this.respondent = s;
});

When('the quotas are counted again including that respondent', function (this: QuotaWorld) {
  assert.ok(this.respondent);
  this.counts = countQuotas(def(this), [...(this.quotaSessions ?? []), this.respondent]);
});

Then('the quota counts are {}', function (this: QuotaWorld, json: string) {
  assert.deepEqual(this.counts ?? countQuotas(def(this), this.quotaSessions ?? []), JSON.parse(json));
});

Then('the quota status of {string} is {int} of {int}, full', function (this: QuotaWorld, id: string, count: number, limit: number) {
  const status = quotaStatus(def(this), this.quotaSessions ?? []).find((q) => q.id === id);
  assert.deepEqual(status, { id, count, limit, full: true });
});

Then('the respondent is finished with ending {string}', function (this: QuotaWorld, ending: string) {
  assert.equal(this.respondent?.getQuestion(), null);
  assert.equal(this.respondent.ending, ending);
  assert.equal(this.respondent.timeline.at(-1)?.type, 'complete');
});

Then('the respondent is on {string}', function (this: QuotaWorld, id: string) {
  assert.equal(this.respondent?.getQuestion()?.id, id);
});

Then('linting a definition with quotas {} finds {string}', function (this: QuotaWorld, json: string, codes: string) {
  const issues = lintDefinition(new SurveyDefinition({ questions: [{ id: 'q' }], quotas: JSON.parse(json) as Quota[] }));
  assert.equal(issues.map((i) => i.code).join(', '), codes);
});
