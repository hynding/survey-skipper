import assert from 'node:assert/strict';
import { test } from 'node:test';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import type { SessionJSON, SurveyDefinitionInput } from 'survey-skipper';
import { useSurvey } from '../src';

const definition: SurveyDefinitionInput = {
  questions: [
    { id: 'age', text: 'How old are you?', type: 'number', required: true, rules: [{ if: { '<': [{ var: 'answer' }, 18] }, end: 'too_young' }] },
    { id: 'role', text: 'Hi {{context.name}}, your role?', showIf: { '==': [{ var: 'context.employed' }, true] } },
    { id: 'done', text: 'Anything else?' },
  ],
};

void test('answering and next move through the survey', () => {
  const { result } = renderHook(() => useSurvey(definition, { context: { employed: true } }));
  assert.equal(result.current.question?.id, 'age');
  assert.equal(result.current.canGoBack, false);
  act(() => {
    assert.equal(result.current.answer(30), true);
  });
  assert.equal(result.current.valueOf(result.current.question), 30);
  act(() => {
    assert.equal(result.current.next(), true);
  });
  assert.equal(result.current.question.id, 'role');
  assert.equal(result.current.canGoBack, true);
});

void test('next refuses a page with errors and reports them', () => {
  const { result } = renderHook(() => useSurvey(definition));
  act(() => {
    assert.equal(result.current.next(), false);
  });
  assert.equal(result.current.question?.id, 'age');
  assert.ok((result.current.errors.age ?? []).length > 0);
  act(() => {
    result.current.answer(40);
  });
  assert.deepEqual(result.current.errors.age, []);
});

void test('an invalid answer is rejected', () => {
  const { result } = renderHook(() => useSurvey(definition));
  act(() => {
    assert.equal(result.current.answer('not a number'), false);
  });
  assert.ok((result.current.errors.age ?? []).length > 0);
});

void test('back returns to the previous question', () => {
  const { result } = renderHook(() => useSurvey(definition));
  act(() => {
    result.current.answer(30);
    result.current.next();
  });
  assert.equal(result.current.question?.id, 'done');
  act(() => {
    result.current.back();
  });
  assert.equal(result.current.question.id, 'age');
});

void test('an end rule finishes the survey', () => {
  const { result } = renderHook(() => useSurvey(definition));
  act(() => {
    result.current.answer(10);
    result.current.next();
  });
  assert.equal(result.current.finished, true);
  assert.equal(result.current.ending, 'too_young');
});

void test('setContext re-routes and fills text', () => {
  const { result } = renderHook(() => useSurvey(definition));
  act(() => {
    result.current.setContext({ employed: true, name: 'Ana' });
    result.current.answer(30);
    result.current.next();
  });
  assert.equal(result.current.question?.id, 'role');
  assert.equal(result.current.textOf(result.current.question), 'Hi Ana, your role?');
});

void test('onChange receives the session JSON and state resumes', () => {
  const saved: SessionJSON[] = [];
  const first = renderHook(() => useSurvey(definition, { onChange: (s) => saved.push(s) }));
  act(() => {
    first.result.current.answer(30);
    first.result.current.next();
  });
  assert.ok(saved.length > 0);
  const last = saved.at(-1);
  assert.ok(last);
  const resumed = renderHook(() => useSurvey(definition, { state: last }));
  assert.equal(resumed.result.current.question?.id, 'done');
});

void test('a component re-renders as the survey moves', () => {
  function Form() {
    const survey = useSurvey(definition);
    if (!survey.question) {
      return <p>Thanks</p>;
    }
    const question = survey.question;
    return (
      <button
        onClick={() => {
          survey.answer(10);
          survey.next();
        }}
      >
        {survey.textOf(question)}
      </button>
    );
  }
  render(<Form />);
  act(() => {
    screen.getByText('How old are you?').click();
  });
  assert.ok(screen.getByText('Thanks'));
  cleanup();
});

void test('goTo jumps along the route and refuses other questions', () => {
  const { result } = renderHook(() => useSurvey(definition));
  const [age, role] = result.current.session.questions;
  assert.ok(age && role);
  act(() => {
    result.current.answer(30);
    result.current.next();
  });
  assert.equal(result.current.question?.id, 'done');
  assert.equal(result.current.canGoTo(role), false);
  act(() => {
    assert.equal(result.current.goTo(role), false);
  });
  act(() => {
    assert.equal(result.current.goTo(age), true);
  });
  assert.equal(result.current.question.id, 'age');
});

void test('matrix answers can be passed as the bare { row: column } object', () => {
  const grid: SurveyDefinitionInput = {
    questions: [
      {
        id: 'grid',
        type: 'matrix',
        required: true,
        rows: [{ value: 'food' }, { value: 'value' }],
        answers: [{ value: 1 }, { value: 2 }, { value: 3 }],
      },
      { id: 'done' },
    ],
  };
  const { result } = renderHook(() => useSurvey(grid));
  const question = result.current.question;
  assert.ok(question);
  act(() => {
    assert.equal(result.current.answer({ food: 3, value: 1 }), true);
  });
  assert.deepEqual(result.current.valueOf(question), { food: 3, value: 1 });
  act(() => {
    assert.equal(result.current.answer({ value: { food: 2, value: 2 } }), true);
  });
  assert.deepEqual(result.current.valueOf(question), { food: 2, value: 2 });
  act(() => {
    assert.equal(result.current.next(), true);
  });
  assert.equal(result.current.question?.id, 'done');
});
