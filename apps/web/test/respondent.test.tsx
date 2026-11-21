import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, afterEach, before, test } from 'node:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryStore } from 'survey-skipper';
import { createHandler } from 'survey-skipper-server';
import { Api } from '../src/api';
import { parseRoute } from '../src/App';
import { Respondent } from '../src/Respondent';
import { shareLinks } from '../src/Share';

const definition = {
  id: 'commute',
  title: 'Commute',
  questions: [
    { id: 'age', text: 'How old are you?', type: 'number', required: true, rules: [{ if: { '<': [{ var: 'answer' }, 18] }, end: 'too_young' }] },
    { id: 'mode', text: 'How do you get to work, {{context.name}}?', answers: [{ value: 'car', text: 'Car' }, { value: 'bus', text: 'Bus' }], rules: [{ if: { '==': [{ var: 'answer' }, 'bus'] }, goTo: 'wait' }] },
    { id: 'parking', text: 'Rate the parking', type: 'rating', validation: { min: 1, max: 3 } },
    { id: 'wait', text: 'Minutes waiting?', type: 'number' },
  ],
};

let server: Server;
let base: string;

before(async () => {
  const store = new MemoryStore();
  await store.saveDefinition(definition);
  const handler = createHandler({ store });
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

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

async function next() {
  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
    await Promise.resolve();
  });
}

void test('a respondent answers, sees errors, goes back, and their old answer is kept', async () => {
  const storage = memoryStorage();
  render(<Respondent api={new Api(base)} definitionId="commute" context={{ name: 'Ana' }} storage={storage} />);
  await screen.findByText('How old are you?');

  await next();
  await screen.findByRole('alert');

  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } });
  await next();
  await screen.findByText('How do you get to work, Ana?');

  fireEvent.click(screen.getByLabelText('Car'));
  await next();
  await screen.findByText('Rate the parking');
  fireEvent.click(screen.getByRole('radio', { name: '2' }));
  await next();
  await screen.findByText('Minutes waiting?');

  // Go back to the mode question and take the bus instead: parking is now off the path.
  await act(async () => {
    fireEvent.click(screen.getByText('Back'));
    await Promise.resolve();
  });
  await screen.findByText('Rate the parking');
  await act(async () => {
    fireEvent.click(screen.getByText('Back'));
    await Promise.resolve();
  });
  await screen.findByText('How do you get to work, Ana?');
  fireEvent.click(screen.getByLabelText('Bus'));
  await next();
  await screen.findByText('Minutes waiting?');

  // Switch back to the car: the parking answer from the abandoned path comes back prefilled.
  await act(async () => {
    fireEvent.click(screen.getByText('Back'));
    await Promise.resolve();
  });
  await screen.findByText('How do you get to work, Ana?');
  fireEvent.click(screen.getByLabelText('Car'));
  await next();
  await screen.findByText('We kept your earlier answer to this question.');
  assert.equal(screen.getByRole('radio', { name: '2' }).getAttribute('aria-checked'), 'true');
  await next();
  await screen.findByText('Minutes waiting?');
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '5' } });
  await next();
  await screen.findByText('Thank you!');
  assert.ok(storage.map.get('survey-skipper:session:commute'));
});

void test('a reload resumes the saved session', async () => {
  const storage = memoryStorage();
  const api = new Api(base);
  const first = render(<Respondent api={api} definitionId="commute" storage={storage} />);
  await screen.findByText('How old are you?');
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '40' } });
  await next();
  await screen.findByText(/How do you get to work/);
  first.unmount();

  render(<Respondent api={api} definitionId="commute" storage={storage} />);
  await screen.findByText(/How do you get to work/);
  assert.equal(screen.getByRole('progressbar').getAttribute('aria-valuenow'), '25');
});

void test('an end rule shows the thank-you page', async () => {
  render(<Respondent api={new Api(base)} definitionId="commute" storage={memoryStorage()} />);
  await screen.findByText('How old are you?');
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } });
  await next();
  await screen.findByText('Thank you!');
});

void test('a missing survey shows an error', async () => {
  render(<Respondent api={new Api(base)} definitionId="nope" storage={memoryStorage()} />);
  await waitFor(() => {
    assert.match(screen.getByRole('alert').textContent, /Could not load/);
  });
});

void test('routes read the survey id and context from the hash', () => {
  assert.deepEqual(parseRoute('#/'), { page: 'home' });
  assert.deepEqual(parseRoute('#/s/commute?employed=true&name=Ana&n=3'), {
    page: 'survey',
    id: 'commute',
    context: { employed: true, name: 'Ana', n: 3 },
  });
});

void test('embed routes parse with their context', () => {
  assert.deepEqual(parseRoute('#/embed/commute?name=Ana'), { page: 'survey', id: 'commute', context: { name: 'Ana' }, embed: true });
  assert.deepEqual(parseRoute('#/s/commute'), { page: 'survey', id: 'commute', context: {} });
});

void test('finishing calls onFinish once with the ending', async () => {
  const finished: (string | undefined)[] = [];
  render(<Respondent api={new Api(base)} definitionId="commute" storage={memoryStorage()} onFinish={(v) => finished.push(v.ending)} />);
  await screen.findByText('How old are you?');
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } });
  await next();
  await screen.findByText('Thank you!');
  assert.deepEqual(finished, ['too_young']);
});

void test('share links point at the survey and the embed', () => {
  const { link, embed, snippet } = shareLinks('my survey', 'https://surveys.example.com/');
  assert.equal(link, 'https://surveys.example.com/#/s/my%20survey');
  assert.equal(embed, 'https://surveys.example.com/#/embed/my%20survey');
  assert.ok(snippet.includes(`src="${embed}"`));
  assert.ok(snippet.includes('survey-skipper:complete'));
});
