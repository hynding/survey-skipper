import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { MemoryStore, valueKey, type SurveyStore } from 'survey-skipper';
import { createHandler, FileStore, signWebhook, WebhookSender, type HandlerOptions, type SessionView, type WebhookPayload } from '../src/index.js';

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
    const json = (res.headers.get('content-type') ?? '').includes('json');
    return { status: res.status, body: (text && json ? JSON.parse(text) : text || undefined) as T };
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

void test('goto jumps along the route only', async () => {
  const { body } = await call<SessionView>('POST', '/definitions/commute/sessions');
  const sid = body.sessionId;
  await call('POST', `/sessions/${sid}/answers`, { value: 40 });
  await call('POST', `/sessions/${sid}/next`);
  assert.equal((await call('POST', `/sessions/${sid}/goto`, { questionId: 'role' })).status, 409);
  assert.equal((await call('POST', `/sessions/${sid}/goto`, {})).status, 400);
  const jumped = await call<SessionView>('POST', `/sessions/${sid}/goto`, { questionId: 'age' });
  assert.equal(jumped.body.question?.id, 'age');
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

void test('responses export as CSV and JSON', async () => {
  assert.equal((await call('GET', '/definitions/commute/responses.csv')).status, 401);
  const csv = await call<string>('GET', '/definitions/commute/responses.csv?context=1', undefined, admin);
  assert.equal(csv.status, 200);
  const [header = '', ...lines] = csv.body.trim().split('\r\n');
  assert.ok(header.startsWith('sessionId,definitionVersion,finished,ending,startedAt,completedAt,durationMs,age,role,done'));
  assert.ok(header.includes('context:employed'));
  assert.ok(lines.some((line) => line.includes(',too_young,')));
  const json = await call<{ columns: string[]; rows: Record<string, unknown>[] }>('GET', '/definitions/commute/responses.json', undefined, admin);
  assert.equal(json.body.rows.length, lines.length);
  assert.ok(json.body.rows.some((row) => row.ending === 'too_young' && row.age === 12));
});

void test('closed, draft, scheduled and full surveys refuse new sessions', async () => {
  const lifecycleStore = new MemoryStore();
  const own = await start({ store: lifecycleStore, apiKey: 'secret', now: () => new Date('2026-05-01T00:00:00Z') });
  try {
    const q = [{ id: 'q' }];
    await lifecycleStore.saveDefinition({ id: 'draft', status: 'draft', questions: q });
    await lifecycleStore.saveDefinition({ id: 'closed', status: 'closed', questions: q });
    await lifecycleStore.saveDefinition({ id: 'later', opensAt: '2026-06-01T00:00:00Z', questions: q });
    await lifecycleStore.saveDefinition({ id: 'full', maxResponses: 1, questions: q });
    const refused = async (id: string) => own.call<{ reason?: string }>('POST', `/definitions/${id}/sessions`);
    assert.deepEqual([(await refused('closed')).status, (await refused('closed')).body.reason], [403, 'closed']);
    assert.equal((await refused('later')).body.reason, 'not_yet_open');
    assert.equal((await refused('draft')).body.reason, 'draft');
    assert.equal((await own.call('POST', '/definitions/draft/sessions', {}, admin)).status, 201, 'creators can preview drafts');
    const first = await own.call<SessionView>('POST', '/definitions/full/sessions');
    assert.equal(first.status, 201);
    await own.call('POST', `/sessions/${first.body.sessionId}/answers`, { value: 'yes' });
    await own.call('POST', `/sessions/${first.body.sessionId}/next`);
    assert.equal((await refused('full')).body.reason, 'full');
    const list = await own.call<{ id: string; accepting: boolean; reason?: string }[]>('GET', '/definitions');
    assert.deepEqual(
      Object.fromEntries(list.body.map((d) => [d.id, d.reason ?? 'open'])),
      { draft: 'draft', closed: 'closed', later: 'not_yet_open', full: 'full' },
    );
  } finally {
    own.server.close();
  }
});

void test('shuffled options keep their order for a session', async () => {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
  await store.saveDefinition({ id: 'shuffle', questions: [{ id: 'pick', randomize: true, answers: letters.map((value) => ({ value })) }] });
  const orders = new Set<string>();
  for (let i = 0; i < 8; i++) {
    const started = await call<SessionView>('POST', '/definitions/shuffle/sessions');
    const order = (started.body.question?.answers ?? []).map((a) => valueKey(a.value)).join(',');
    assert.deepEqual(order.split(',').sort(), letters);
    const again = await call<SessionView>('GET', `/sessions/${started.body.sessionId}`);
    assert.equal((again.body.question?.answers ?? []).map((a) => valueKey(a.value)).join(','), order);
    orders.add(order);
  }
  assert.ok(orders.size > 1);
});

void test('full quotas screen respondents out', async () => {
  await store.saveDefinition({
    id: 'quota',
    quotas: [
      { id: 'cats', if: { '==': [{ var: 'answers.pet' }, 'cat'] }, limit: 1, end: 'cats_full' },
      { id: 'vip', if: { '==': [{ var: 'context.vip' }, true] }, limit: 0 },
    ],
    questions: [{ id: 'pet' }, { id: 'name' }],
  });
  const answer = async (value: string) => {
    const { body } = await call<SessionView>('POST', '/definitions/quota/sessions');
    await call('POST', `/sessions/${body.sessionId}/answers`, { value });
    return call<SessionView>('POST', `/sessions/${body.sessionId}/next`);
  };
  const first = await answer('cat');
  assert.equal(first.body.question?.id, 'name');
  await call('POST', `/sessions/${first.body.sessionId}/answers`, { value: 'Tom' });
  assert.equal((await call<SessionView>('POST', `/sessions/${first.body.sessionId}/next`)).body.finished, true);
  const second = await answer('cat');
  assert.deepEqual([second.body.finished, second.body.ending], [true, 'cats_full']);
  assert.equal((await answer('dog')).body.question?.id, 'name');
  const vip = await call<SessionView>('POST', '/definitions/quota/sessions', { context: { vip: true } });
  assert.deepEqual([vip.body.finished, vip.body.ending], [true, 'over_quota']);
  const status = await call<{ id: string; count: number; full: boolean }[]>('GET', '/definitions/quota/quotas', undefined, admin);
  assert.deepEqual(status.body.map((q) => [q.id, q.count, q.full]), [['cats', 1, true], ['vip', 0, true]]);
});

void test('webhooks receive signed events and are retried', async () => {
  const received: { event: string; signature: string | undefined; body: string }[] = [];
  let failuresLeft = 1;
  const receiver = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (failuresLeft-- > 0) {
        res.writeHead(500).end();
        return;
      }
      received.push({ event: String(req.headers['x-survey-skipper-event']), signature: req.headers['x-survey-skipper-signature'] as string | undefined, body: Buffer.concat(chunks).toString() });
      res.writeHead(204).end();
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, resolve));
  const url = `http://localhost:${String((receiver.address() as AddressInfo).port)}/hook`;
  const errors: string[] = [];
  const sender = new WebhookSender(
    [
      { url, secret: 'shh', events: ['start', 'complete'] },
      { url: 'http://localhost:1/unreachable', events: ['answer'], definitions: ['hooked'] },
    ],
    { retryDelayMs: 5, attempts: 2, onError: (error) => errors.push(error.message) },
  );
  const hookStore = new MemoryStore();
  await hookStore.saveDefinition({ id: 'hooked', questions: [{ id: 'q', rules: [{ end: 'thanks' }] }] });
  const own = await start({ store: hookStore, webhooks: sender });
  try {
    const { body } = await own.call<SessionView>('POST', '/definitions/hooked/sessions');
    await own.call('POST', `/sessions/${body.sessionId}/answers`, { value: 'hi' });
    await own.call('POST', `/sessions/${body.sessionId}/next`);
    await sender.idle();
    // The first delivery failed once and was retried, so events can arrive out of order.
    assert.deepEqual(received.map((r) => r.event).sort(), ['complete', 'start']);
    for (const r of received) {
      assert.equal(r.signature, signWebhook(r.body, 'shh'));
    }
    const complete = JSON.parse(received.find((r) => r.event === 'complete')?.body ?? '{}') as WebhookPayload;
    assert.deepEqual([complete.sessionId, complete.definitionId, complete.ending, complete.session.answers?.q?.value], [body.sessionId, 'hooked', 'thanks', 'hi']);
    assert.equal(errors.length, 1, 'the unreachable answer hook gave up after its attempts');
  } finally {
    own.server.close();
    receiver.close();
  }
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
