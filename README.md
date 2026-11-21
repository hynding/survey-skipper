# Survey Skipper

Create, manage, track, share and extend customizable surveys whose path branches on rules and context.

A survey is a plain JSON (or YAML) **definition**: questions, answer options, and [JsonLogic](https://jsonlogic.com)
rules that decide what each respondent sees next, based on their answers so far, computed variables, scores and
outside context such as role or locale. Each respondent runs a **session** against a definition. The core library
does the branching, validation, tracking and analytics; the other packages put it behind YAML, React, an HTTP API and
a web app.

## What's in the box

| Package | Path | Version | What it is |
| --- | --- | --- | --- |
| [`survey-skipper`](packages/core) | `packages/core` | 3.15 | The core library, framework-agnostic and published to npm (ESM and CommonJS). Definitions and sessions, JsonLogic rules, question types and validation, pages, Back and jump navigation, piped text, translations, scoring, randomization, carry-forward options, quotas, lifecycle, timeline and analytics, CSV export, definition diff and migration, lint and route simulation, plugins and storage. |
| [`survey-skipper-yaml`](packages/yaml) | `packages/yaml` | 0.8 | Read and write survey definitions, rules included, as YAML. |
| [`survey-skipper-react`](packages/react) | `packages/react` | 0.3 | `useSurvey()`, a React hook that runs a session in a component. |
| [`survey-skipper-server`](apps/server) | `apps/server` | 0.8 | An HTTP API (plain `node:http`) for definitions, sessions, responses, stats, quotas and webhooks, over any `SurveyStore`. |
| [`survey-skipper-web`](apps/web) | `apps/web` | 0.6 | The web app (Vite + React, private): survey list, YAML builder with live lint, graph, preview and diff, the respondent app, results dashboard, and share links and embeds. |

How they fit together:

```
survey-skipper (core)
├── survey-skipper-yaml ──┐
├── survey-skipper-react ─┤
└──────────── survey-skipper-server (uses core + yaml)
                          └── survey-skipper-web (uses all four; talks to the server over HTTP)
```

## A survey in 20 lines

```ts
import { SurveyDefinition, SurveySession } from 'survey-skipper';

const definition = new SurveyDefinition({
  id: 'commute',
  questions: [
    { id: 'age', type: 'number', required: true, rules: [{ if: { '<': [{ var: 'answer' }, 18] }, end: 'too_young' }] },
    { id: 'team', type: 'number', showIf: { '==': [{ var: 'context.role' }, 'manager'] } },
    { id: 'mode', type: 'single', answers: [{ value: 'car' }, { value: 'bike' }] },
  ],
});

const session = new SurveySession(definition, { context: { role: 'engineer' } });
session.answer({ value: 30 });   // => { ok: true, errors: [] }
session.getNextQuestion();       // => mode ('team' is only shown to managers)
session.back();                  // => age, answer kept
JSON.stringify(session);         // save it; pass the parsed JSON back to the constructor to resume
```

See the [core README](packages/core) for the full feature guide.

## Try the whole stack

Requires Node 22 or later and pnpm 10 (`corepack enable` picks up the version pinned in `package.json`).

```sh
pnpm install
pnpm run build
PORT=3000 pnpm --filter survey-skipper-server start   # API on http://localhost:3000 (in memory)
pnpm --filter survey-skipper-web dev                  # app on http://localhost:5173, /api proxied to the server
```

Open `#/builder`, write a survey in YAML, save it, then answer it at `#/s/<id>` and watch the results at
`#/results/<id>`. Set `DATA_DIR` on the server to keep data on disk, and `API_KEY` to protect creator routes. See the
[server](apps/server) and [web](apps/web) READMEs for more.

## Development

```sh
pnpm install
pnpm run check       # root tsc, then every package's typecheck, lint, test and build, in dependency order
pnpm run build       # build every package
pnpm run test        # every package's tests (build first: packages import each other's dist/)
pnpm --filter survey-skipper run check   # one package
```

- Libraries live in `packages/`, runnable apps in `apps/`. All are in one pnpm workspace and depend on each other
  with `workspace:^`.
- Shared dev tooling (TypeScript, ESLint, tsx, `@types/node`) is declared in the root `package.json`; a package
  declares only what is specific to it. Each package extends `tsconfig.base.json`, and `eslint.config.mjs` applies
  `typescript-eslint`'s strict type-checked rules everywhere.
- Tests: the core uses Cucumber (`packages/core/features/*.feature`); the other packages use `node:test` through tsx,
  with jsdom and Testing Library for React. The web app's tests run against a real in-process server.
- CI (`.github/workflows/ci.yml`) runs `pnpm run check` on Node 22 and 24 for every push and pull request.

[CLAUDE.md](CLAUDE.md) has the conventions in more detail. The [roadmap](docs/ROADMAP.md) records what was planned
and built, by feature ID; both rounds are complete.

## License

MIT
