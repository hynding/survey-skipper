import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { lintDefinition, SurveyDefinition } from 'survey-skipper';
import { App } from '../src/App';
import { createDemoApi, DEMO_PREFIX, resetDemo } from '../src/demo';
import { SAMPLE_SURVEYS } from '../src/samples';

afterEach(() => {
  cleanup();
});

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

void test('every sample survey lints clean', () => {
  for (const survey of SAMPLE_SURVEYS) {
    assert.deepEqual(lintDefinition(new SurveyDefinition(survey)), [], String(survey.id));
  }
});

void test('the demo API lists the samples and branches without a server', async () => {
  const api = createDemoApi(memoryStorage());
  assert.deepEqual((await api.listDefinitions()).map((d) => d.id).sort(), ['coffee', 'feedback', 'quiz']);

  // Coffee: a "no" skips the coffee questions, and "neither" ends the survey early.
  let view = await api.startSession('coffee');
  view = await api.answer(view.sessionId, 'drinks_coffee', false);
  view = await api.next(view.sessionId);
  assert.equal(view.question?.id, 'tea');
  view = await api.answer(view.sessionId, 'tea', 'none');
  view = await api.next(view.sessionId);
  assert.equal(view.finished, true);
  assert.equal(view.ending, 'neither');

  // Feedback: a low score goes to the "what should we fix" branch.
  view = await api.startSession('feedback');
  await api.answer(view.sessionId, 'nps', 3);
  view = await api.next(view.sessionId);
  assert.equal(view.question?.id, 'improve');

  // Quiz: a perfect score reads the score into the question text.
  view = await api.startSession('quiz');
  for (const [id, value] of [['planets', '8'], ['red', 'mars'], ['moon', '1s']] as const) {
    await api.answer(view.sessionId, id, value);
    view = await api.next(view.sessionId);
  }
  assert.equal(view.question?.id, 'perfect');
  assert.match(view.question.displayText, /A perfect 3 out of 3/);

  const stats = await api.getStats('coffee');
  assert.equal(stats.completed, 1);
  assert.match(await api.getResponsesCsv('coffee'), /drinks_coffee/);
});

void test('demo data is kept in storage, and reset brings the samples back', async () => {
  const storage = memoryStorage();
  storage.setItem('other-app', 'keep me');
  storage.setItem('survey-skipper:session:coffee', 'old-session');
  const first = createDemoApi(storage);
  await first.saveDefinitionYaml('id: mine\ntitle: Mine\nquestions:\n  - id: q\n    text: Hello?\n');
  await first.startSession('mine');

  const again = createDemoApi(storage);
  assert.deepEqual((await again.listDefinitions()).map((d) => d.id).sort(), ['coffee', 'feedback', 'mine', 'quiz']);

  resetDemo(storage);
  assert.deepEqual([...storage.map.keys()], ['other-app']);
  const fresh = createDemoApi(storage);
  assert.deepEqual((await fresh.listDefinitions()).map((d) => d.id).sort(), ['coffee', 'feedback', 'quiz']);
  assert.ok([...storage.map.keys()].some((k) => k.startsWith(DEMO_PREFIX)));
});

void test('the app shows the demo banner and its reset button', async () => {
  const storage = memoryStorage();
  let resets = 0;
  window.location.hash = '#/';
  render(
    <App
      api={createDemoApi(storage)}
      demo={{
        onReset: () => {
          resets++;
        },
      }}
    />,
  );
  assert.ok(screen.getByLabelText('Demo mode'));
  await screen.findByText('Coffee break');
  assert.ok(screen.getByText('Space quiz'));

  const original = Object.getOwnPropertyDescriptor(window, 'confirm');
  window.confirm = () => true;
  try {
    fireEvent.click(screen.getByText('Reset demo'));
  } finally {
    if (original) {
      Object.defineProperty(window, 'confirm', original);
    }
  }
  assert.equal(resets, 1);
});

void test('without demo options there is no banner', () => {
  render(<App api={createDemoApi(memoryStorage())} />);
  assert.equal(screen.queryByLabelText('Demo mode'), null);
});
