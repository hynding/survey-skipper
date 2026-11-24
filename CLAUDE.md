# CLAUDE.md

Guidance for working in this repository. The [README](README.md) describes the project for users; this file covers
how to change it.

## What this is

Survey Skipper: customizable surveys whose path branches on JsonLogic rules and context. A pnpm 10 workspace of five
strict-TypeScript packages:

| Path | npm name | Notes |
| --- | --- | --- |
| `packages/core` | `survey-skipper` | The library. Dual ESM + CommonJS build (`dist/` and `dist/esm/`). Only runtime dependency: `json-logic-js`. Ships `schema/survey-definition.schema.json` as `survey-skipper/schema.json`. |
| `packages/yaml` | `survey-skipper-yaml` | `parseSurvey`, `loadSurvey`, `stringifySurvey`. Dual build. |
| `packages/react` | `survey-skipper-react` | `useSurvey()` hook. Dual build. |
| `apps/server` | `survey-skipper-server` | ESM only, no framework. Routes live in `src/fetch.ts` (`createFetchHandler`, browser-safe, exported as `survey-skipper-server/fetch`: keep Node-only imports out of it); `src/handler.ts` wraps it for `node:http` and adds webhooks. `FileStore`. `src/main.ts` is the CLI entry (env vars). |
| `apps/web` | `survey-skipper-web` (private) | Vite 8 + React 19. Hash routes in `src/App.tsx`; one component file per screen (`Home`, `Builder`, `Graph`, `Preview`, `Respondent`, `Results`, `Share`, `QuestionField`). Talks to the server through `src/api.ts`. `VITE_DEMO=true` (the GitHub Pages build, `.github/workflows/pages.yml`) runs the server in the page instead (`src/demo.ts`, samples in `src/samples.ts`). |

Dependency order: core → yaml, react → server → web. Packages import each other's **built `dist/`**, so a
package's typecheck and tests need its dependencies built first (`pnpm run check` and `pnpm run build` handle that).

### Core source map (`packages/core/src`)

- `definition.ts` `SurveyDefinition` (questions, answer map, settings, lifecycle, `toJSON`); `question.ts`,
  `answer.ts` the value types.
- `session.ts` `SurveySession`: routing, pages, Back / `goTo`, events, timeline, scoring, quotas, `toJSON`.
  `survey.ts` is the deprecated 2.x `Survey` wrapper, kept until 4.0.
- `rules.ts` JsonLogic evaluation and the custom operators (`answered`, `skipped`, `matches`).
- `validation.ts`, `plugins.ts` (custom operators, question types, validators), `scoring.ts`, `quotas.ts`.
- `builder.ts` fluent builder and condition helpers; `lint.ts`, `graph.ts`, `paths.ts`, `export.ts` (Mermaid / DOT).
- `analytics.ts` `aggregate`, `responses.ts` `toRows` / `toCSV`, `diff.ts` `diffDefinitions`, `versioning.ts`
  `migrateSession`, `storage.ts` stores and `resumeSession`.
- `index.ts` is the public API. Anything not exported there is internal.

## Commands

Node 22+ (CI runs 22 and 24). Run from the repo root unless noted.

```sh
pnpm install
pnpm run check                              # what CI runs: root tsc + every package's typecheck, lint, test, build
pnpm run build
pnpm --filter <name> run check              # one package, e.g. survey-skipper-server
pnpm --filter survey-skipper run test       # core Cucumber suite
pnpm --filter survey-skipper exec cucumber-js features/scoring.feature   # one feature file
pnpm --filter survey-skipper-server dev     # server from source via tsx
pnpm --filter survey-skipper-web dev        # web app, proxies /api to localhost:3000 (API_TARGET to override)
```

The whole check takes well under a minute.

## Conventions

- **Strict TypeScript everywhere**: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, and
  `typescript-eslint` strict type-checked lint. Don't silence rules without a reason in an inline comment.
- **Imports use `.js` extensions** in source (`nodenext` resolution), e.g. `from './session.js'`.
- **Tests come with every change.** Core: add or extend a `features/<topic>.feature` file plus
  `features/step_definitions/<topic>_steps.ts` (steps import from `../../src`). Other packages: `node:test` files in
  `test/`. Web tests render components with Testing Library and hit a real in-process `createHandler` server.
- **A feature PR updates, in the same PR**: the code, its tests, the package README(s), `docs/ROADMAP.md` (if it is a
  roadmap item), and the version in each changed package's `package.json` (minor bump for features). Commit messages
  look like `Add definition diff (M5, core 3.15)`.
- **New definition, question or answer fields must be added in three places**, or they are silently lost:
  1. the types and `toJSON` in core,
  2. `packages/core/schema/survey-definition.schema.json` (it uses `additionalProperties: false`),
  3. `stringifySurvey` in `packages/yaml/src/index.ts`, which whitelists fields (otherwise the builder drops them on
     save).
- **Keep answer types intact**: booleans stay booleans, multi answers are arrays, matrix answers are
  `{ row: column }` objects. Use `valueKey()` / `formatAnswerValue()` rather than `String(value)`.
- **Abandoned answers are kept by default** (moved to `abandonedAnswers` when a respondent changes route);
  `keepAbandonedAnswers: false` discards them. Don't change that default.
- Plugins registered with `registerOperator` etc. are process-global; tests that register them call
  `resetPlugins()`.
- The server's creator routes are marked `admin: true` in `handler.ts` and need the API key when one is set;
  respondent routes stay open.
- Saved JSON carries `schemaVersion` (`SCHEMA_VERSION`, currently 1). Bump it only for an incompatible format change
  and keep reading older input.

## Git and PRs

- Work on a feature branch and open a PR against `master`. CI must be green before merging.
- One PR per roadmap item or coherent change.
- If `master` moves under an open branch, merge `master` into the branch rather than rebasing (force-push is not
  available in the automated sessions).
