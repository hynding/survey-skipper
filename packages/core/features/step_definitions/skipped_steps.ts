import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { lintDefinition, SurveyDefinition, SurveySession, type SurveyDefinitionInput } from '../../src';
import type { SurveyWorld } from '../support/world';

interface SkipWorld extends SurveyWorld {
  skipDefinition?: SurveyDefinition;
  skipper?: SurveySession;
}

const s = (world: SkipWorld): SurveySession => {
  assert.ok(world.skipper);
  return world.skipper;
};

function answerAll(world: SkipWorld, values: unknown[]): void {
  assert.ok(world.skipDefinition);
  world.skipper = new SurveySession(world.skipDefinition);
  for (const value of values) {
    assert.ok(world.skipper.answer({ value: value as string }).ok);
    world.skipper.getNextQuestion();
  }
}

Given('a skipping definition:', function (this: SkipWorld, json: string) {
  this.skipDefinition = new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput);
});

When('a skipping respondent answers employed false and income {int}', function (this: SkipWorld, income: number) {
  answerAll(this, [false, income]);
});

When('a skipping respondent answers employed true, employer {string} and income {int}', function (this: SkipWorld, employer: string, income: number) {
  answerAll(this, [true, employer, income]);
});

When('a skipping respondent answers employed false and goes back', function (this: SkipWorld) {
  answerAll(this, [false]);
  assert.deepEqual(s(this).getSkipped(), ['employer']);
  s(this).back();
});

When('the skipping respondent changes employed to true', function (this: SkipWorld) {
  assert.ok(s(this).answer({ value: true }).ok);
  s(this).getNextQuestion();
});

Then('the skipping respondent skipped {string}', function (this: SkipWorld, id: string) {
  assert.deepEqual(s(this).getSkipped(), [id]);
});

Then('the skipping respondent skipped nothing', function (this: SkipWorld) {
  assert.deepEqual(s(this).getSkipped(), []);
});

Then('the skipping respondent finished with {string}', function (this: SkipWorld, ending: string) {
  assert.equal(s(this).getQuestion(), null);
  assert.equal(s(this).ending, ending);
});

Then('the skipping respondent is on {string}', function (this: SkipWorld, id: string) {
  assert.equal(s(this).getQuestion()?.id, id);
});

Then('linting the definition {} finds {string}', function (this: SkipWorld, json: string, codes: string) {
  assert.equal(
    lintDefinition(new SurveyDefinition(JSON.parse(json) as SurveyDefinitionInput)).map((i) => i.code).join(', '),
    codes,
  );
});
