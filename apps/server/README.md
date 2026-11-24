# survey-skipper-server

An HTTP API for [survey-skipper](../../packages/core): store survey definitions, run respondent sessions and read
responses and stats. It uses only Node's `http` module and any `SurveyStore`.

## Run it

```sh
pnpm --filter survey-skipper-server build   # after building its dependencies (or run `pnpm run build` at the root)
PORT=3000 DATA_DIR=./data API_KEY=change-me CORS_ORIGIN='*' pnpm --filter survey-skipper-server start
```

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. |
| `DATA_DIR` | unset (in memory) | Keep definitions and sessions as JSON files in this directory (`FileStore`). |
| `API_KEY` | unset (open) | Require `Authorization: Bearer <key>` on creator routes. |
| `CORS_ORIGIN` | unset (off) | Value for `Access-Control-Allow-Origin`, for browser apps on another origin. |
| `WEBHOOK_URLS` | unset | Comma-separated URLs to POST session events to (see Webhooks). |
| `WEBHOOK_SECRET` | unset | Signs webhook deliveries. |
| `WEBHOOK_EVENTS` | `complete` | Comma-separated events to send: `start`, `answer`, `complete`. |

Without `DATA_DIR`, everything is lost when the process stops. `pnpm --filter survey-skipper-server dev` runs from
source with tsx. Installed from npm, the same is available as the `survey-skipper-server` command.

## Use it in your own server

```ts
import { createServer } from 'node:http';
import { createHandler, FileStore } from 'survey-skipper-server';

const handler = createHandler({ store: new FileStore('./data'), apiKey: process.env.API_KEY });
createServer((req, res) => void handler(req, res)).listen(3000);
```

Any `SurveyStore` works, so you can plug in your own database adapter. `FileStore(dir)` keeps one JSON file per key;
its `FileStorage` key-value layer is exported too. `createHandler` options:

| Option | Default | What it does |
| --- | --- | --- |
| `store` | required | Where definitions and sessions live. |
| `apiKey` | unset (open) | Required as `Authorization: Bearer <key>` on creator routes. |
| `corsOrigin` | unset (off) | Sets the CORS headers and answers `OPTIONS` preflights. |
| `maxBodyBytes` | 1 MB | Largest accepted request body. |
| `newId` | `crypto.randomUUID` | Makes session ids. |
| `now` | `() => new Date()` | Clock for `opensAt` / `closesAt` and webhook timestamps. |
| `webhooks` | none | A list of webhooks, or a `WebhookSender` (see Webhooks). |

### Fetch API handler

`createFetchHandler(options)` is the same API as a Fetch API handler, `(request: Request) => Promise<Response>`, for
runtimes other than `node:http` (Deno, Bun, Cloudflare Workers, a service worker, or the page itself). Import it from
`survey-skipper-server/fetch`, which has no Node-only imports. It takes the options above except `webhooks`; pass
`onEvent(payload)` to receive the same `start`, `answer` and `complete` payloads instead. `createHandler` is a thin
`node:http` wrapper around it. The web app's [demo mode](../web#demo-mode-github-pages) uses it to run in the browser.

```ts
import { MemoryStore } from 'survey-skipper';
import { createFetchHandler } from 'survey-skipper-server/fetch';

const handle = createFetchHandler({ store: new MemoryStore() });
export default { fetch: handle };   // e.g. a Cloudflare Worker or Bun.serve
```

`view(sessionId, session)` builds the session view the routes return, if you add routes of your own.

## Routes

All bodies are JSON. 🔑 marks creator routes that need the API key when one is set.

| Route | What it does |
| --- | --- |
| `GET /health` | `{ ok: true }` |
| `GET /definitions` | Latest version of every definition: id, version, title, description, status, open window, question count, and `accepting` / `reason` (see below). |
| 🔑 `POST /definitions` | Save a definition (JSON, or YAML with `Content-Type: application/yaml`). It needs an `id`. Returns `{ definition, lint }`. |
| `GET /definitions/:id?version=` | A definition, latest version by default. |
| `GET /definitions/:id/lint` | Lint issues for a definition. |
| `POST /definitions/:id/sessions` | Start a session. Body: `{ context?, version? }`. Returns a session view (201), or 403 with a `reason` when the survey is not taking responses (see below). |
| 🔑 `GET /definitions/:id/sessions` | Saved sessions for a definition. |
| 🔑 `GET /definitions/:id/stats?version=` | `aggregate()` over its sessions: completion, endings, distributions, drop-off, paths, and `score` when options have scores. |
| 🔑 `GET /definitions/:id/quotas` | Each quota's `limit`, completed `count` and whether it is `full` (`quotaStatus()`). |
| 🔑 `GET /definitions/:id/responses.csv` | One row per session as CSV (`toCSV()`), as a download. Query: `version`, and `abandoned=1`, `timings=1`, `context=1` for extra columns. |
| 🔑 `GET /definitions/:id/responses.json` | The same as `{ columns, rows }` (`toRows()`). |
| `GET /sessions/:sid` | The session view. |
| `POST /sessions/:sid/answers` | Answer. Body: `{ value, questionId?, text? }`, current question by default. 422 with `errors` if invalid. |
| `POST /sessions/:sid/next` | Validate the current page and move on. 422 with `errors` if anything is missing or invalid. |
| `POST /sessions/:sid/back` | Go back one question. 409 if there is nowhere to go. |
| `POST /sessions/:sid/goto` | Jump along the respondent's route. Body: `{ questionId }`. 409 if the question is off the route. |
| `PUT /sessions/:sid/context` | Replace the session's context. |
| `DELETE /sessions/:sid` | Delete a session. |

### When a survey takes responses

A definition's `status`, `opensAt`, `closesAt` and `maxResponses` decide whether new sessions can start. When they
can't, starting one returns 403 with `reason`: `draft`, `closed`, `not_yet_open`, `past_close` or `full`
(`maxResponses` completed sessions across all versions). Sessions already started can still be finished. Creators can
start sessions on a draft with the API key, to preview it. Pass `now` to `createHandler` to control the clock.

### Webhooks

Pass `webhooks` to `createHandler` to POST session events to other systems:

```ts
createHandler({ store, webhooks: [{ url: 'https://example.com/hooks/survey', secret: process.env.HOOK_SECRET, events: ['complete'] }] });
```

Each delivery is a JSON `WebhookPayload`: `event` (`start`, `answer` or `complete`), `at`, `sessionId`,
`definitionId`, `definitionVersion`, `ending` (for `complete`), `questionId` (for `answer`) and the full `session`
state. Headers: `X-Survey-Skipper-Event`, and with a secret `X-Survey-Skipper-Signature: sha256=<hex HMAC-SHA256 of the
body>`; check it with `signWebhook(body, secret)`. A webhook can be limited to some `definitions`. Deliveries run in
the background, so they never slow down respondents, and a failed delivery (network error or non-2xx) is retried with
backoff (3 attempts by default), so events can arrive out of order. For control over retries, timeouts and error
reporting, pass `new WebhookSender(webhooks, { attempts, retryDelayMs, timeoutMs, onError })` instead of the list.

### Quotas

When a definition has `quotas`, the server counts completed sessions toward them (across all versions) and enforces
them: a respondent who lands in a full quota finishes on the quota's ending, either when a session starts (for quotas
on context) or when they move past a question. Screened-out sessions don't count.

A session view looks like this:

```json
{
  "sessionId": "…",
  "definitionId": "commute",
  "definitionVersion": 1,
  "question": { "id": "role", "type": "single", "displayText": "Your role, Ana?", "answers": [] },
  "page": [],
  "finished": false,
  "canGoBack": true,
  "state": { "answers": {}, "history": [] }
}
```

`question` and `page` items are the definition's question JSON plus `displayText`, the text in the session's locale
with placeholders filled in. `state` is the full `session.toJSON()`.

`ending` is the named ending once the session finishes (omitted while it is unset).

Errors are `{ "error": "message" }`, plus `errors` keyed by question id for validation failures. Status codes: 400 for
a malformed body or definition, 401 for a creator route without the key, 403 when the survey is not taking responses,
404 for an unknown route, definition or session, 405 (with `Allow`) for a known path with the wrong method, 409 for
Back or jump with nowhere to go, 413 for an oversized body, 422 for invalid answers.

## Development

From this folder, `pnpm run check` runs typecheck, lint, tests (`node:test` against an in-process server) and build.
Build `survey-skipper` and `survey-skipper-yaml` first.
