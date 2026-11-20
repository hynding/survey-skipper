import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryStore, type SurveyStore } from 'survey-skipper';
import { createHandler, FileStore, type HandlerOptions, type SessionView } from '../src/index.js';

const definition = {
  id: 'commute',
  version: 1,
  title: 'Commute',
  questions: [
    { id: 'age', text: 'How old are you?', type: 'number', required: true, rules: [{ if: { '<': [{ var: 'answer' }, 18] }, end: 'too_young' }] },
    { id: 'role', text: 'Your role, {{context.name}}?', showIf: { '==': [{ var: 'context.employed' }, true] } },
    { id: 'done', text: 'Anything else?' },
  ],
};

interface Reply<T = unknown> {
  status: number;
  body: T;
}

async function start(options: HandlerOptions): Promise<{ server: Server; call: <T = unknown>(method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Reply<T>> }> {
  const handler = createHandler(options);
  const server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const call = async <T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Reply<T>> => {
    const init: RequestInit = { method, headers: { 'content-type': 'application/json', ...headers } };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(`http://localhost:${String(port)}${path}`, init);
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : undefined) as T };
  };
  return { server, call };
}

let ids = 0;
let server: Server;
let call: Awaited<ReturnType<typeof start>>['call'];
const store: SurveyStore = new MemoryStore();

before(async () => {
  ({ server, call } = await start({ store, apiKey: 'secret', corsOrigin: '*', newId: () => `s${String(++ids)}` }));
});
after(() => {
  server.close();
});

const admin = { authorization: 'Bearer secret' };

void test('saving a definition needs the API key and returns lint results', async () => {
  assert.equal((await call('POST', '/definitions', definition)).status, 401);
  const saved = await call<{ lint: unknown[] }>('POST', '/definitions', definition, admin);
  assert.equal(saved.status, 201);
  assert.ok(Array.isArray(saved.body.lint));
  const list = await call<{ id: string; questions: number }[]>('GET', '/definitions');
  assert.deepEqual(list.body.map((d) => [d.id, d.questions]), [['commute', 3]]);
  assert.equal((await call<{ title: string }>('GET', '/definitions/commute')).body.title, 'Commute');
});

void test('a respondent answers, moves on, goes back and finishes', async () => {
  const started = await call<SessionView>('POST', '/definitions/commute/sessions', { context: { employed: true, name: 'Ana' } });
  assert.equal(started.status, 201);
  const sid = started.body.sessionId;
  assert.equal(started.body.question?.id, 'age');

  const missing = await call<{ errors: Record<string, unknown[]> }>('POST', `/sessions/${sid}/next`);
  assert.equal(missing.status, 422);
  assert.ok(missing.body.errors.age);

  const bad = await call('POST', `/sessions/${sid}/answers`, { value: 'old' });
  assert.equal(bad.status, 422);

  assert.equal((await call('POST', `/sessions/${sid}/answers`, { value: 30 })).status, 200);
  const moved = await call<SessionView>('POST', `/sessions/${sid}/next`);
  assert.equal(moved.body.question?.id, 'role');
  assert.equal(moved.body.question.displayText, 'Your role, Ana?');
  assert.equal(moved.body.canGoBack, true);

  const back = await call<SessionView>('POST', `/sessions/${sid}/back`);
  assert.equal(back.body.question?.id, 'age');

  await call('POST', `/sessions/${sid}/answers`, { value: 12 });
  const ended = await call<SessionView>('POST', `/sessions/${sid}/next`);
  assert.equal(ended.body.finished, true);
  assert.equal(ended.body.ending, 'too_young');
  assert.equal((await call<SessionView>('GET', `/sessions/${sid}`)).body.ending, 'too_young');
});

void test('context updates re-route the session', async () => {
  const { body } = await call<SessionView>('POST', '/definitions/commute/sessions');
  await call('PUT', `/sessions/${body.sessionId}/context`, { employed: true, name: 'Bo' });
  await call('POST', `/sessions/${body.sessionId}/answers`, { value: 40 });
  const next = await call<SessionView>('POST', `/sessions/${body.sessionId}/next`);
  assert.equal(next.body.question?.id, 'role');
});

void test('responses and stats are admin only', async () => {
  assert.equal((await call('GET', '/definitions/commute/sessions')).status, 401);
  const sessions = await call<unknown[]>('GET', '/definitions/commute/sessions', undefined, admin);
  assert.ok(sessions.body.length >= 2);
  const stats = await call<{ sessions: number; endings: Record<string, number> }>('GET', '/definitions/commute/stats', undefined, admin);
  assert.equal(stats.body.sessions, sessions.body.length);
  assert.equal(stats.body.endings.too_young, 1);
});

void test('sessions can be deleted', async () => {
  const { body } = await call<SessionView>('POST', '/definitions/commute/sessions');
  assert.equal((await call('DELETE', `/sessions/${body.sessionId}`)).status, 204);
  assert.equal((await call('GET', `/sessions/${body.sessionId}`)).status, 404);
});

void test('YAML definitions are accepted', async () => {
  const yaml = 'id: pets\nquestions:\n  - id: pet\n    text: Cat or dog?\n';
  const saved = await call('POST', '/definitions', yaml, { ...admin, 'content-type': 'application/yaml' });
  assert.equal(saved.status, 201);
  const started = await call<SessionView>('POST', '/definitions/pets/sessions');
  assert.equal(started.body.question?.displayText, 'Cat or dog?');
});

void test('errors: unknown routes, wrong methods, bad JSON, missing ids', async () => {
  assert.equal((await call('GET', '/nope')).status, 404);
  assert.equal((await call('PATCH', '/definitions')).status, 405);
  assert.equal((await call('POST', '/definitions', '{oops', admin)).status, 400);
  assert.equal((await call('POST', '/definitions', { questions: [] }, admin)).status, 400);
  assert.equal((await call('GET', '/definitions/missing')).status, 404);
  assert.equal((await call('OPTIONS', '/definitions')).status, 204);
});

void test('FileStore keeps data across restarts', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'survey-skipper-'));
  try {
    const first = await start({ store: new FileStore(dir) });
    await first.call('POST', '/definitions', definition);
    const { body } = await first.call<SessionView>('POST', '/definitions/commute/sessions');
    await first.call('POST', `/sessions/${body.sessionId}/answers`, { value: 50 });
    first.server.close();

    const second = await start({ store: new FileStore(dir) });
    const again = await second.call<SessionView>('GET', `/sessions/${body.sessionId}`);
    assert.equal(again.body.state.answers?.age?.value, 50);
    second.server.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
