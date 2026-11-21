import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, afterEach, before, test } from 'node:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryStore, SurveyDefinition, SurveySession } from 'survey-skipper';
import { createHandler } from 'survey-skipper-server';
import { Api } from '../src/api';
import { parseRoute } from '../src/App';
import { Results } from '../src/Results';

let server: Server;
let base: string;
const store = new MemoryStore();

const definition = new SurveyDefinition({
  id: 'lunch',
  title: 'Lunch',
  questions: [
    { id: 'food', text: 'What did you eat?', type: 'single', answers: [{ value: 'soup', text: 'Soup' }, { value: 'salad', text: 'Salad' }] },
    { id: 'more', text: 'Anything else?', rules: [{ end: 'thanks' }] },
  ],
});

before(async () => {
  await store.saveDefinition(definition);
  const answers: [string, string | null][] = [['soup', 'no'], ['soup', null], ['salad', 'yes']];
  for (const [i, [food, more]] of answers.entries()) {
    const s = new SurveySession(definition);
    s.setAnswer({ value: food });
    s.getNextQuestion();
    if (more) {
      s.setAnswer({ value: more });
      s.getNextQuestion();
    }
    await store.saveSession(`s${String(i)}`, s);
  }
  const handler = createHandler({ store, apiKey: 'secret' });
  server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://localhost:${String((server.address() as AddressInfo).port)}`;
});
after(() => {
  server.close();
});
afterEach(() => {
  cleanup();
});

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  }
};

void test('the results route parses', () => {
  assert.deepEqual(parseRoute('#/results/lunch'), { page: 'results', id: 'lunch' });
});

void test('results ask for the API key, then show completion, endings and answers', async () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (k: string) => saved.get(k) ?? null, setItem: (k: string, v: string) => saved.set(k, v) };
  const { container } = render(<Results api={new Api(base)} definitionId="lunch" storage={storage} />);
  await flush();
  assert.ok(screen.getByText('Results need the server’s API key.'));
  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'secret' } });
  fireEvent.click(screen.getByText('Show results'));
  await flush();
  assert.equal(saved.get('survey-skipper:api-key'), 'secret');
  const tiles = [...container.querySelectorAll('.tile')].map((t) => t.textContent);
  assert.deepEqual(tiles, ['3Responses', '2Completed', '67%Completion rate']);
  const food = screen.getByRole('table', { name: 'Answers to What did you eat?' });
  assert.match(food.textContent, /Soup2 67%.*Salad1 33%/);
  assert.match(screen.getByRole('table', { name: 'Completed responses by ending' }).textContent, /thanks2 100%/);
  assert.ok(screen.getByText(/1 stopped here/));
});

void test('the CSV download comes from the server', async () => {
  const csv = await new Api(base).getResponsesCsv('lunch', 'secret');
  assert.equal(csv.split('\r\n').filter(Boolean).length, 4);
});
