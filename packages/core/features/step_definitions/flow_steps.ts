import assert from 'node:assert/strict';
import { Given, Then, When } from '@cucumber/cucumber';
import type { SurveyDefinition, SurveySession } from '../../src';
import type { SurveyWorld } from '../support/world';

interface FlowWorld extends SurveyWorld {
  definition?: SurveyDefinition;
  sessions?: Map<string, SurveySession>;
  heard?: string[];
  stop?: () => void;
}

function session(world: FlowWorld, name: string): SurveySession {
  const found = world.sessions?.get(name);
  assert.ok(found, `No session for "${name}"`);
  return found;
}

function ids(questions: { id: string | number }[] | null): string {
  return (questions ?? []).map((q) => String(q.id)).join(', ');
}

Given('{string} records events', function (this: FlowWorld, name: string) {
  const s = session(this, name);
  const heard: string[] = [];
  this.heard = heard;
  const offs = [
    s.on('answer', ({ question }) => heard.push(`answer ${String(question.id)}`)),
    s.on('invalid', ({ question }) => heard.push(`invalid ${String(question.id)}`)),
    s.on('navigate', ({ from, to }) => heard.push(`navigate ${String(from?.id)}>${to ? String(to.id) : 'end'}`)),
    s.on('back', ({ from, to }) => heard.push(`back ${String(from?.id)}>${String(to.id)}`)),
    s.on('complete', () => heard.push('complete')),
  ];
  this.stop = () => {
    offs.forEach((off) => {
      off();
    });
  };
});

Given('events stop being recorded', function (this: FlowWorld) {
  this.stop?.();
});

Given('{string} is on question {string}', function (this: FlowWorld, name: string, id: string) {
  session(this, name).getQuestion(id);
});

Given('{string} sets {string} to the list {string}', function (this: FlowWorld, name: string, id: string, list: string) {
  const s = session(this, name);
  const question = s.definition.getQuestionById(id);
  assert.ok(question);
  s.setAnswer({ value: list.split(',') }, question);
});

When('{string} goes back', function (this: FlowWorld, name: string) {
  session(this, name).back();
});

When('{string} moves to the next page', function (this: FlowWorld, name: string) {
  session(this, name).nextPage();
});

Then('the recorded events are {string}', function (this: FlowWorld, expected: string) {
  assert.equal((this.heard ?? []).join(', '), expected);
});

Then('the text of {string} for {string} is {string}', function (this: FlowWorld, id: string, name: string, text: string) {
  const s = session(this, name);
  assert.equal(s.getQuestionText(s.definition.getQuestionById(id)), text);
});

Then('the page for {string} is {string}', function (this: FlowWorld, name: string, expected: string) {
  assert.equal(ids(session(this, name).getPage()), expected);
});

Then('going back takes {string} to {string}', function (this: FlowWorld, name: string, id: string) {
  assert.equal(session(this, name).back()?.id, id);
});
