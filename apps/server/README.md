# survey-skipper-server

An HTTP API for [survey-skipper](../../packages/core): store survey definitions, run respondent sessions and read
responses and stats. It uses only Node's `http` module and any `SurveyStore`.

## Run it

```sh
pnpm --filter survey-skipper-server build
PORT=3000 DATA_DIR=./data API_KEY=change-me CORS_ORIGIN='*' pnpm --filter survey-skipper-server start
```

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on. |
| `DATA_DIR` | unset (in memory) | Keep definitions and sessions as JSON files in this directory (`FileStore`). |
| `API_KEY` | unset (open) | Require `Authorization: Bearer <key>` on creator routes. |
| `CORS_ORIGIN` | unset (off) | Value for `Access-Control-Allow-Origin`, for browser apps on another origin. |

## Use it in your own server

```ts
import { createServer } from 'node:http';
import { createHandler, FileStore } from 'survey-skipper-server';

const handler = createHandler({ store: new FileStore('./data'), apiKey: process.env.API_KEY });
createServer((req, res) => void handler(req, res)).listen(3000);
```

Any `SurveyStore` works, so you can plug in your own database adapter.

## Routes

All bodies are JSON. 🔑 marks creator routes that need the API key when one is set.

| Route | What it does |
| --- | --- |
| `GET /health` | `{ ok: true }` |
| `GET /definitions` | Latest version of every definition: id, version, title, description, question count. |
| 🔑 `POST /definitions` | Save a definition (JSON, or YAML with `Content-Type: application/yaml`). It needs an `id`. Returns `{ definition, lint }`. |
| `GET /definitions/:id?version=` | A definition, latest version by default. |
| `GET /definitions/:id/lint` | Lint issues for a definition. |
| `POST /definitions/:id/sessions` | Start a session. Body: `{ context?, version? }`. Returns a session view (201). |
| 🔑 `GET /definitions/:id/sessions` | Saved sessions for a definition. |
| 🔑 `GET /definitions/:id/stats?version=` | `aggregate()` over its sessions: completion, endings, distributions, drop-off, paths. |
| 🔑 `GET /definitions/:id/responses.csv` | One row per session as CSV (`toCSV()`), as a download. Query: `version`, and `abandoned=1`, `timings=1`, `context=1` for extra columns. |
| 🔑 `GET /definitions/:id/responses.json` | The same as `{ columns, rows }` (`toRows()`). |
| `GET /sessions/:sid` | The session view. |
| `POST /sessions/:sid/answers` | Answer. Body: `{ value, questionId?, text? }`, current question by default. 422 with `errors` if invalid. |
| `POST /sessions/:sid/next` | Validate the current page and move on. 422 with `errors` if anything is missing or invalid. |
| `POST /sessions/:sid/back` | Go back one question. 409 if there is nowhere to go. |
| `POST /sessions/:sid/goto` | Jump along the respondent's route. Body: `{ questionId }`. 409 if the question is off the route. |
| `PUT /sessions/:sid/context` | Replace the session's context. |
| `DELETE /sessions/:sid` | Delete a session. |

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

Errors are `{ "error": "message" }`, plus `errors` keyed by question id for validation failures.
