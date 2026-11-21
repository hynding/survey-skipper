import assert from 'node:assert/strict';
import { Given, Then } from '@cucumber/cucumber';
import { diffDefinitions, type SurveyDefinitionInput } from '../../src';
import type { SurveyWorld } from '../support/world';

interface DiffWorld extends SurveyWorld {
  diffA?: SurveyDefinitionInput;
  diffB?: SurveyDefinitionInput;
}

const diff = (world: DiffWorld) => {
  assert.ok(world.diffA && world.diffB);
  return diffDefinitions(world.diffA, world.diffB);
};

Given('definition A is {}', function (this: DiffWorld, json: string) {
  this.diffA = JSON.parse(json) as SurveyDefinitionInput;
});
Given('definition B is {}', function (this: DiffWorld, json: string) {
  this.diffB = JSON.parse(json) as SurveyDefinitionInput;
});
Given('definition A is:', function (this: DiffWorld, json: string) {
  this.diffA = JSON.parse(json) as SurveyDefinitionInput;
});
Given('definition B is:', function (this: DiffWorld, json: string) {
  this.diffB = JSON.parse(json) as SurveyDefinitionInput;
});

Then('the diff is empty', function (this: DiffWorld) {
  assert.deepEqual(diff(this), []);
});

Then('the diff messages are:', function (this: DiffWorld, expected: string) {
  assert.equal(diff(this).map((c) => c.message).join('\n'), expected);
});
