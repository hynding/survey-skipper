import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MemoryStore } from 'survey-skipper';
import { createFetchHandler, type SessionView, type WebhookPayload } from '../src/index.js';

const definition = {
  id: 'pets',
  questions: [
    { id: 'pet', text: 'Do you have a pet?', type: 'boolean', rules: [{ if: { '==': [{ var: 'answer' }, false] }, end: 'no_pet' }] },
    { id: 'name', text: 'What is its name?' },
  ],
};

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

void test('createFetchHandler answers Fetch API requests without node:http', async () => {
  const store = new MemoryStore();
  const events: WebhookPayload[] = [];
  let n = 0;
  const handle = createFetchHandler({
    store,
    newId: () => `s${String(++n)}`,
    onEvent: (payload) => {
      events.push(payload);
    },
  });
  const post = (path: string, body: unknown) =>
    handle(new Request(`https://anywhere.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

  assert.equal((await post('/definitions', definition)).status, 201);
  const list = await json<{ id: string; accepting: boolean }[]>(await handle(new Request('https://anywhere.example/definitions')));
  assert.deepEqual(list.map((d) => [d.id, d.accepting]), [['pets', true]]);

  const started = await json<SessionView>(await post('/definitions/pets/sessions', {}));
  assert.equal(started.sessionId, 's1');
  const answered = await json<SessionView>(await post('/sessions/s1/answers', { value: false }));
  assert.equal(answered.question?.id, 'pet');
  const done = await json<SessionView>(await post('/sessions/s1/next', {}));
  assert.equal(done.finished, true);
  assert.equal(done.ending, 'no_pet');
  assert.deepEqual(events.map((e) => e.event), ['start', 'answer', 'complete']);
});

void test('createFetchHandler reads YAML, enforces the body limit, sets CORS and checks the API key', async () => {
  const handle = createFetchHandler({ store: new MemoryStore(), apiKey: 'k', corsOrigin: '*', maxBodyBytes: 200 });
  const yaml = 'id: tiny\nquestions:\n  - id: q\n    text: Hi\n';
  const unauthorized = await handle(new Request('http://x/definitions', { method: 'POST', headers: { 'content-type': 'application/yaml' }, body: yaml }));
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get('access-control-allow-origin'), '*');

  const saved = await handle(
    new Request('http://x/definitions', { method: 'POST', headers: { 'content-type': 'application/yaml', authorization: 'Bearer k' }, body: yaml }),
  );
  assert.equal(saved.status, 201);
  assert.equal((await json<{ definition: { id: string } }>(saved)).definition.id, 'tiny');

  const big = await handle(new Request('http://x/definitions/tiny/sessions', { method: 'POST', body: JSON.stringify({ context: { pad: 'x'.repeat(500) } }) }));
  assert.equal(big.status, 413);

  const wrong = await handle(new Request('http://x/definitions', { method: 'DELETE' }));
  assert.equal(wrong.status, 405);
  assert.equal(wrong.headers.get('allow'), 'GET, POST');
});

void test('the fetch entry point has no Node-only imports, so it can run in a browser', () => {
  const source = readFileSync(new URL('../src/fetch.ts', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/^import\s+(type\s+)?[^;]*?from '([^']+)'/gms)].map((m) => ({ type: Boolean(m[1]), from: m[2] }));
  assert.ok(imports.length > 0);
  const runtime = imports.filter((i) => !i.type).map((i) => i.from);
  assert.deepEqual(runtime, ['survey-skipper', 'survey-skipper-yaml']);
});
