# Survey Skipper roadmap

Status: decisions answered on 2026-11-20 (see section 5). **Built: C1 and C3 (3.0 definition/session split with
`toJSON` and schema versions), C2 (Back navigation), P1 (pnpm monorepo), R1, R2, R3, R4 and R6 (JsonLogic rules, context, showIf/skipIf, named endings, YAML package).** Other items are still proposals.

Goal of the project: **create, manage, track, share and extend customizable surveys whose path branches on rules and
context.** This plan maps that goal onto the library as it stands at v2.0.0 (strict TypeScript, PR #1).

## 1. Where the library is today

About 250 lines across `Answer`, `Question` and `Survey`.

What works well:

- Linear surveys with value-based jumps (`answerMap[from][value] = to`), plus a wildcard key for custom answers.
- Pre-answers: answering a later question now, so it is skipped but still routes.
- Batches of consecutive questions, loop protection, JSON round-trip through the constructor.
- A clean, framework-agnostic core with no runtime dependencies.

What limits it against the goal:

| Gap | Why it matters |
| --- | --- |
| Definition and response are one mutable object (`Survey` holds questions, rules, answers and the cursor `index`). | You can't run many respondents against one survey, version a survey, or store responses separately. Almost every other feature wants this split. |
| Branching is exact string equality on one answer. `1` and `"1"` collide; booleans become `1`/`0`. | No ranges, no "any of", no conditions on earlier answers, no external context (user role, locale, A/B bucket). This is the core promise of the project. |
| No history. `getNextQuestion` moves forward only and overwrites `index`. | No "Back" button, no record of the path a respondent took, nothing to track. |
| Questions have no type or validation; answers are single-valued. | No multi-select, numeric, rating, date or required questions. |
| No `toJSON`, no schema, no format version. Persistence relies on the constructor accepting its own fields. | Hard to share, store, or migrate surveys safely. |
| `getNextQuestions(n)` returns the next `n` by array order, ignoring branches inside the batch; only the last answer in `setAnswers` routes. | Batches (pages) can show questions a respondent should have skipped. |
| No way to check a survey: dangling targets fall back silently, unreachable questions go unnoticed. | Authoring mistakes reach respondents. |
| No events or hooks. | Nothing to plug analytics, storage or UI into. |

## 2. Proposed features

Grouped by the goal's verbs. Scope: **S** is about a day, **M** a few days, **L** a week or more.

### Core model (enables everything else)

| ID | Feature | Scope |
| --- | --- | --- |
| C1 | ✅ Built (3.0). **Split definition from session.** `SurveyDefinition` (questions, rules, answer map, settings, `version`) and `SurveySession` (answers, context, position, history, ending). `Survey` remains as a deprecated wrapper until 4.0. | L |
| C2 | **Navigation history.** ✅ Built. `history`, `back()`, `canGoBack()`, `getPath()`. Changing an earlier answer moves answers on the abandoned route to `abandonedAnswers` (default) or discards them (`keepAbandonedAnswers: false`). Still to do: `goTo(id)` that respects reachability. | M |
| C3 | ✅ Built (3.0). **Serialization.** `toJSON()` on both classes with `schemaVersion` (1); constructors restore from it and reject newer schemas. Sessions record `definitionId` / `definitionVersion`. Not yet: migrations between schema versions. | S |
| C4 | **Typed answer values.** Preserve `string | number | boolean | string[] | null` instead of stringifying; answer keys stop colliding. | S |

### Branching rules and context

| ID | Feature | Scope |
| --- | --- | --- |
| R1 | ✅ Built (2.2). **Rule engine.** Ordered `rules` on each question: `{ if?, goTo }` or `{ if?, end }`, first match wins; the `answerMap` still applies after rules, then the next question. Rules live on the current `Survey`; they move to `SurveyDefinition` with C1. | M |
| R2 | ✅ Built (2.2). **Condition language: JsonLogic** via `json-logic-js` (core's first runtime dependency). Data: `answer`, `answers.<id>`, `context.<key>`. Extra operators: `answered`, `matches`. YAML authoring in the `survey-skipper-yaml` package. Not yet: a `skipped` operator. | M |
| R3 | ✅ Built (2.2). **Context.** `context` on the survey, readable as `context.*`, replaceable mid-survey with `setContext()`. | S |
| R4 | ✅ Built (3.0). **Display conditions.** `showIf` and `skipIf`; routed-past questions keep their rules. The first question is checked lazily when the session is first read. | S |
| R5 | **Computed variables and scoring.** Named expressions (`score = sum of answers in section A`) usable in conditions, piping and results. | M |
| R6 | ✅ Built (2.2). **End states.** `{ end: 'qualified' }` rules finish the survey and set `survey.ending`. | S |

### Create (authoring)

| ID | Feature | Scope |
| --- | --- | --- |
| A1 | **Question types.** `single`, `multi`, `text`, `number`, `rating`, `date`, `boolean`, each with typed answer values and options. | M |
| A2 | **Validation.** `required`, `min`/`max`, `minSelected`/`maxSelected`, `pattern`, custom validators. `session.answer()` returns errors instead of silently storing junk. | M |
| A3 | **Sections / pages.** Group questions; `getNextPage()` evaluates branching inside the page so batches are correct (replaces `getNextQuestions(n)`). | M |
| A4 | **Piping.** Templates in question text: `"How long have you owned your {{answers.make}}?"`, resolved per session. | S |
| A5 | **Fluent builder.** `survey('id').question('car', q => q.single(['yes','no'])).when(eq('car','no')).goTo('commute')` with full type inference. | M |

### Manage

| ID | Feature | Scope |
| --- | --- | --- |
| M1 | **Static analysis / lint.** `validateDefinition()` reports dangling targets, unreachable questions, cycles, conditions referencing later or unknown questions, type mismatches (`gt` on a text question). | M |
| M2 | **Versioning.** Definitions carry a version; sessions record which version they ran against; a helper maps answers across versions by question id. | M |
| M3 | **Path simulation.** Enumerate every possible path (or sample them) for testing: "can a respondent reach `screened_out` without answering `age`?" | M |

### Track

| ID | Feature | Scope |
| --- | --- | --- |
| T1 | **Events.** `onAnswer`, `onNavigate`, `onBack`, `onComplete`, `onValidationError` on the session; plain listener API, no dependency. | S |
| T2 | **Response timeline.** Session keeps timestamped events (shown, answered, changed, skipped), so time-per-question and edits are recoverable. | S |
| T3 | **Aggregation helpers.** Given many sessions: answer distributions, completion and drop-off per question, path frequency (which branches people actually take). Pure functions over session JSON. | M |

### Share

| ID | Feature | Scope |
| --- | --- | --- |
| S1 | **Published JSON Schema** for the definition format, so other tools and languages can author and validate surveys. | S |
| S2 | **Graph export.** Definition to Mermaid / Graphviz DOT, for docs and reviews of branching logic. | S |
| S3 | **Dual ESM + CJS build** and a browser-friendly bundle. | S |

### Extend

| ID | Feature | Scope |
| --- | --- | --- |
| E1 | **Plugin registry.** Register custom condition operators, question types and validators (`registerOperator('withinRadius', fn)`). | M |
| E2 | **Storage adapter interface.** `load/save` for sessions and definitions, with an in-memory adapter and a `localStorage` example. Back-ends stay out of core. | S |
| E3 | **i18n.** Per-locale text for questions and options, chosen from context. | M |
| E4 | **UI bindings** as separate packages, starting with a React `useSurvey()` hook. | L |

### Service and UI (decided: build all three, in one repo)

| ID | Feature | Scope |
| --- | --- | --- |
| P1 | ✅ Built. **pnpm workspace monorepo.** `packages/core` (published as `survey-skipper`), `packages/yaml`, `packages/react`, `apps/server`, `apps/web`. Shared tsconfig, eslint and CI. | M |
| SV1 | **Survey service.** HTTP API for definitions (CRUD, versions), sessions (start, answer, back) and responses, on top of E2 storage adapters. | L |
| UI1 | **Respondent UI.** Renders a session: question types, validation, Back, progress, with abandoned answers prefilled when a question comes round again. | L |
| UI2 | **Builder UI.** Edit questions and JsonLogic/YAML rules, see the branching graph (S2) and lint results (M1) live. | L |

## 3. Phased build plan

Each phase ends in a release. Phases 1 and 2 are the heart of the project; later phases can be reordered to taste.

### Phase 1: Foundations (release 2.1, non-breaking)
**C4, C3, C2, M1 (basic), T1**

- Typed values, `toJSON`/`fromJSON` with `schemaVersion`, back navigation and history, a first `validateDefinition()`
  (dangling targets, unreachable questions), and events.
- All built on the current `Survey` so nothing breaks yet.
- Dependencies: none. Scope: about 1 to 1.5 weeks.
- Why first: cheap, immediately useful, and every later phase leans on history, events and serialization.

### Phase 2: Monorepo, rules and context (release 3.0, breaking)
**P1, C1, R1, R2, R3, R4, R6**

- Start with P1: move the library into `packages/core` under a pnpm workspace before the big rework, so later
  packages land in place.

- Introduce `SurveyDefinition` + `SurveySession`, the JSON condition language, context, display conditions and named
  endings. `answerMap` compiles to rules; `Survey` stays as a deprecated wrapper for one release.
- Dependencies: Phase 1 (history makes pruning on answer-change possible; serialization defines the new shapes).
- Scope: about 2 to 3 weeks. Highest value, highest risk: the condition format becomes a public contract, so it should
  be reviewed before code is written (a short design doc / ADR).

### Phase 3: Richer questions (3.1)
**A1, A2, A3, A4**

- Question types, validation, pages with correct in-page branching, piping.
- Dependencies: C1 and R2 (types feed operator checks; pages need the rule evaluator).
- Scope: about 2 weeks.

### Phase 4: Authoring and sharing (3.2)
**A5, S1, S2, S3, M1 (full), M3**

- Fluent builder, JSON Schema, graph export, ESM build, full linter and path simulation.
- Dependencies: the definition format must be stable (end of Phase 3). S3 can be pulled forward any time.
- Scope: about 1.5 to 2 weeks.

### Phase 5: Tracking and analytics (3.3)
**T2, T3, R5, M2**

- Timeline, aggregation helpers, computed variables and scoring, versioning.
- Dependencies: T1 (events), C1 (sessions as data). R5 needs R2.
- Scope: about 1.5 weeks.

### Phase 6: Ecosystem (3.x)
**E1, E2, E3, E4**

- Plugin registry (custom operators register into JsonLogic), storage adapters, i18n, React bindings.
- Dependencies: E1 needs R2 and A1/A2 to be extension points; E4 needs the session API settled.
- Scope: 2 weeks plus, mostly separable.

### Phase 7: Service and apps
**SV1, UI1, UI2**

- The service on storage adapters, then the respondent UI on the React bindings, then the builder.
- Dependencies: P1, E2, E4; UI2 also needs S2 and M1.
- Scope: several weeks; each app is its own track.

### Dependency sketch

```mermaid
graph LR
  C4[C4 typed values] --> R2
  C3[C3 serialization] --> C1
  C2[C2 history] --> C1
  T1[T1 events] --> T2
  C1[C1 definition/session split] --> R1
  R1[R1 rule engine] --> R2[R2 conditions]
  R2 --> R3[R3 context]
  R2 --> R4[R4 showIf]
  R2 --> R5[R5 computed vars]
  R2 --> A3[A3 pages]
  C1 --> A1[A1 question types]
  A1 --> A2[A2 validation]
  A2 --> E1[E1 plugins]
  R2 --> E1
  C1 --> S1[S1 JSON Schema]
  R2 --> M1[M1 full lint]
  M1 --> M3[M3 path simulation]
  T2[T2 timeline] --> T3[T3 aggregation]
  C1 --> E4[E4 React bindings]
```

## 4. Recommended first picks

If you only build three things, build these, in order:

1. **C2 history + back navigation** (built): the most visible gap for anyone using the library in a real form.
2. **R1 + R2 rule engine with JsonLogic conditions**: this is what "branching paths given a set of rules" means, and today
   it is limited to exact matches on one answer.
3. **R3 context**: unlocks "and context" from the goal with very little code once R2 exists.

C1 (the split) is the biggest structural change; doing it together with R1/R2 in one breaking release avoids two rounds
of churn for users.

## 5. Decisions (answered 2026-11-20)

1. **Breaking 3.0 release:** yes. The definition/session split (C1) ships in 3.0.
2. **Library, service or UI:** all three, in a pnpm monorepo (P1, SV1, UI1, UI2).
3. **Condition format:** JsonLogic, with YAML authoring support (R2).
4. **Answer changes:** keep answers on the abandoned route, marked as abandoned, with an option for survey creators to
   discard them instead (built in C2: `abandonedAnswers`, `keepAbandonedAnswers`).
