import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SurveySession } from 'survey-skipper';
import { loadSurvey, parseSurvey, stringifySurvey } from '../src';

const doc = `
title: Commute survey
questions:
  - id: age
    text: How old are you?
    rules:
      - if: { "<": [{ var: answer }, 18] }
        end: too_young
  - id: role
    showIf: { "==": [{ var: context.employed }, true] }
    answers:
      - value: manager
      - value: other
        text: Something else
  - id: commute
    rules:
      - if:
          and:
            - answered: role
            - "==": [{ var: answers.role }, manager]
        goTo: done
  - id: bus
  - id: done
`;

void test('a YAML survey routes with its JsonLogic rules', () => {
  const survey = new SurveySession(loadSurvey(doc));
  survey.setContext({ employed: true });
  survey.setAnswer({ value: 30 });
  assert.equal(survey.getNextQuestion()?.id, 'role');
  survey.setAnswer({ value: 'manager' });
  assert.equal(survey.getNextQuestion()?.id, 'commute');
  survey.setAnswer({ value: 'car' });
  assert.equal(survey.getNextQuestion()?.id, 'done');
});

void test('showIf reads context from YAML conditions', () => {
  const survey = new SurveySession(loadSurvey(doc));
  survey.setAnswer({ value: 30 });
  assert.equal(survey.getNextQuestion()?.id, 'commute');
});

void test('an end rule from YAML finishes the survey', () => {
  const survey = new SurveySession(loadSurvey(doc));
  survey.setAnswer({ value: 10 });
  assert.equal(survey.getNextQuestion(), null);
  assert.equal(survey.ending, 'too_young');
});

void test('stringify then parse keeps the definition', () => {
  const original = new SurveySession(loadSurvey(doc));
  original.setAnswer({ value: 30 });
  const text = stringifySurvey(original);
  assert.doesNotMatch(text, /^(answers|history|context):/m);
  const again = parseSurvey(text);
  assert.equal(again.title, 'Commute survey');
  assert.deepEqual(loadSurvey(text).questions, loadSurvey(doc).questions);
});

void test('documents without a questions list are rejected', () => {
  assert.throws(() => parseSurvey('title: nothing'), /questions/);
  assert.throws(() => parseSurvey('- just a list'), /mapping/);
});

void test('skipIf and version survive a round-trip', () => {
  const text = stringifySurvey({ version: 2, questions: [{ id: 'a', skipIf: { '==': [{ var: 'context.x' }, 1] } }] });
  const definition = loadSurvey(text);
  assert.equal(definition.version, 2);
  assert.deepEqual(definition.questions[0]?.skipIf, { '==': [{ var: 'context.x' }, 1] });
});
