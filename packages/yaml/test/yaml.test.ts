import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SurveyDefinition, SurveySession } from 'survey-skipper';
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

void test('question types and validation survive a round-trip', () => {
  const text = stringifySurvey({
    questions: [{ id: 'age', type: 'number', required: true, validation: { min: 0, max: 120 } }],
  });
  const [age] = loadSurvey(text).questions;
  assert.equal(age?.type, 'number');
  assert.equal(age.required, true);
  assert.deepEqual(age.validation, { min: 0, max: 120 });
});

void test('lifecycle, sections, randomizing, scores, carry-forward and matrix rows survive a round-trip', () => {
  const input = {
    id: 'full',
    status: 'open' as const,
    opensAt: '2026-06-01T00:00:00Z',
    closesAt: '2026-07-01T00:00:00Z',
    maxResponses: 100,
    sections: { s: { randomize: true } },
    questions: [
      { id: 'a', type: 'multi', randomize: true, answers: [{ value: 'x', score: 2 }, { value: 'none', fixed: true }] },
      { id: 'b', type: 'single', answersFrom: { question: 'a', include: 'unselected' as const } },
      { id: 'c', type: 'matrix', section: 's', rows: [{ value: 'r1', text: 'Row 1' }], answers: [{ value: 1 }] },
    ],
  };
  const json = new SurveyDefinition(parseSurvey(stringifySurvey(input))).toJSON();
  assert.deepEqual(JSON.parse(JSON.stringify(json)), JSON.parse(JSON.stringify(new SurveyDefinition(input).toJSON())));
});
