import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnswerValue } from 'survey-skipper';
import { QuestionField } from '../src/QuestionField';

afterEach(() => {
  cleanup();
});

void test('a ranking question reorders its options and reports the order', () => {
  let value: AnswerValue | undefined;
  const question = {
    id: 'rank',
    type: 'ranking',
    displayText: 'Rank these',
    answers: [{ value: 'price', text: 'Price' }, { value: 'speed', text: 'Speed' }, { value: 'support', text: 'Support' }],
  };
  const { rerender } = render(<QuestionField question={question} value={value} onChange={(v) => { value = v; }} />);
  fireEvent.click(screen.getByText('Keep this order'));
  assert.deepEqual(value, ['price', 'speed', 'support']);
  rerender(<QuestionField question={question} value={value} onChange={(v) => { value = v; }} />);
  fireEvent.click(screen.getByLabelText('Move Support up'));
  assert.deepEqual(value, ['price', 'support', 'speed']);
});

void test('a top-2 ranking only reports the top two', () => {
  let value: AnswerValue | undefined;
  render(
    <QuestionField
      question={{ id: 'top', type: 'ranking', displayText: 'Top two', validation: { maxSelected: 2 }, answers: [{ value: 'a' }, { value: 'b' }, { value: 'c' }] }}
      value={undefined}
      onChange={(v) => { value = v; }}
    />,
  );
  fireEvent.click(screen.getByLabelText('Move c up'));
  assert.deepEqual(value, ['a', 'c']);
});

void test('a matrix question picks a column per row', () => {
  let value: AnswerValue | undefined;
  const question = {
    id: 'grid',
    type: 'matrix',
    displayText: 'Rate us',
    rows: [{ value: 'food', text: 'Food' }, { value: 'service', text: 'Service' }],
    answers: [{ value: 1, text: 'Bad' }, { value: 3, text: 'Great' }],
  };
  const { rerender } = render(<QuestionField question={question} value={value} onChange={(v) => { value = v; }} />);
  fireEvent.click(screen.getByLabelText('Food: Great'));
  assert.deepEqual(value, { food: 3 });
  rerender(<QuestionField question={question} value={value} onChange={(v) => { value = v; }} />);
  fireEvent.click(screen.getByLabelText('Service: Bad'));
  assert.deepEqual(value, { food: 3, service: 1 });
});
