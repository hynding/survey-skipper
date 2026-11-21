import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import { SurveyDefinition, type SurveyDefinitionInput } from '../../src';
import type { SurveyWorld } from '../support/world';

interface LifecycleWorld extends SurveyWorld {
  lifecycle?: SurveyDefinition;
  lifecycleError?: Error;
}

const make = (json: string) => new SurveyDefinition({ id: 'x', ...(JSON.parse(json) as SurveyDefinitionInput) });

Given('a lifecycle definition with {}', function (this: LifecycleWorld, json: string) {
  this.lifecycle = make(json);
});

When('I make a lifecycle definition with {}', function (this: LifecycleWorld, json: string) {
  try {
    make(json);
  } catch (error) {
    this.lifecycleError = error as Error;
  }
});

Then('at {string} with {int} responses it is {}', function (this: LifecycleWorld, now: string, responses: number, result: string) {
  assert.ok(this.lifecycle);
  const availability = this.lifecycle.availability({ now: new Date(now), responses });
  assert.equal(availability.accepting ? 'accepting' : `closed: ${String(availability.reason)}`, result);
  assert.equal(this.lifecycle.isAcceptingResponses({ now: new Date(now), responses }), availability.accepting);
});

Then('its JSON keeps {}', function (this: LifecycleWorld, json: string) {
  assert.ok(this.lifecycle);
  const restored = new SurveyDefinition(JSON.parse(JSON.stringify(this.lifecycle)) as SurveyDefinitionInput).toJSON();
  for (const [k, v] of Object.entries(JSON.parse(json) as object)) {
    assert.deepEqual(restored[k as keyof typeof restored], v);
  }
});

Then('it is refused with {string}', function (this: LifecycleWorld, message: string) {
  assert.ok(this.lifecycleError?.message.includes(message));
});
