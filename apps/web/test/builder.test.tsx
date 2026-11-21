import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, afterEach, before, test } from 'node:test';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryStore } from 'survey-skipper';
import { createHandler } from 'survey-skipper-server';
import { Api } from '../src/api';
import { parseRoute } from '../src/App';
import { Builder, parseSource, STARTER } from '../src/Builder';

let server: Server;
let base: string;
const store = new MemoryStore();

before(async () => {
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

const noStorage = { getItem: () => null, setItem: () => undefined };

void test('the starter survey parses and lints clean', () => {
  const parsed = parseSource(STARTER);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.issues, []);
});

void test('lint results update as the YAML changes', () => {
  const { container } = render(<Builder api={new Api(base)} storage={noStorage} />);
  assert.ok(screen.getByText('No problems found.'));
  const editor = screen.getByLabelText('Survey (YAML)');

  fireEvent.change(editor, { target: { value: STARTER.replace('goTo: wait', 'goTo: nowhere') } });
  assert.match(container.querySelector('.lint')?.textContent ?? '', /nowhere/);
  assert.equal(screen.getByText<HTMLButtonElement>('Save').disabled, true);

  fireEvent.change(editor, { target: { value: 'questions: [' } });
  assert.ok(screen.getByText(/Can’t read this yet/));
});

void test('the graph shows every question and ending', () => {
  const { container } = render(<Builder api={new Api(base)} storage={noStorage} />);
  const labels = [...container.querySelectorAll('svg .node-id')].map((n) => n.textContent);
  assert.deepEqual(labels, ['age', 'commute', 'parking', 'wait']);
  const endings = [...container.querySelectorAll('svg .ending text')].map((n) => n.textContent);
  assert.deepEqual(endings, ['End: too_young', 'End']);
  assert.ok(container.querySelectorAll('svg .edge.conditional').length >= 2);
});

void test('the preview runs the rules', async () => {
  render(<Builder api={new Api(base)} storage={noStorage} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '30' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
    await Promise.resolve();
  });
  fireEvent.click(screen.getByLabelText('Bus'));
  await act(async () => {
    fireEvent.click(screen.getByText('Next'));
    await Promise.resolve();
  });
  assert.ok(screen.getByText('How long do you usually wait, in minutes?'));
});

void test('saving needs the API key, then the survey can be edited again', async () => {
  render(<Builder api={new Api(base)} storage={noStorage} />);
  await act(async () => {
    fireEvent.click(screen.getByText('Save'));
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(await screen.findByText(/needs an API key/));

  fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'secret' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Save'));
    await new Promise((r) => setTimeout(r, 50));
  });
  assert.ok(await screen.findByText(/Saved my-survey/));
  cleanup();

  render(<Builder api={new Api(base)} definitionId="my-survey" storage={noStorage} />);
  const editor = await screen.findByLabelText<HTMLTextAreaElement>('Survey (YAML)');
  assert.match(editor.value, /How do you get to work\?/);
  assert.ok(screen.getByText('No problems found.'));
  assert.equal(screen.queryByText(/since the last save/), null, 'no changes right after loading');
  assert.ok(screen.getByText('Share'));

  fireEvent.change(editor, { target: { value: editor.value.replace('How do you get to work?', 'How do you commute?').replace('title: My survey', 'title: Commute') } });
  assert.ok(screen.getByText('2 changes since the last save'));
  assert.ok(screen.getByText('Changed the text of "commute"'));
  assert.ok(screen.getByText("Changed the survey's title"));
});

void test('builder routes', () => {
  assert.deepEqual(parseRoute('#/builder'), { page: 'builder' });
  assert.deepEqual(parseRoute('#/builder/my-survey'), { page: 'builder', id: 'my-survey' });
});
