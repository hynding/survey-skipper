# Survey Skipper

Customizable surveys whose path branches on rules and context. Framework-agnostic: bring your own UI and storage.

Written in TypeScript and published as both ES modules and CommonJS, with type declarations.

## Install

```sh
npm install survey-skipper
```

## Usage

A **`SurveyDefinition`** is the survey as its creator writes it: questions, answer options, rules and settings. A
**`SurveySession`** is one respondent working through it: their answers, context, position and history. Any number of
sessions can share one definition.

```ts
import { SurveyDefinition, SurveySession } from 'survey-skipper';

const definition = new SurveyDefinition({
  id: 'commute',
  version: 1,
  questions: [
    {
      id: 'age',
      text: 'How old are you?',
      rules: [
        { if: { '<': [{ var: 'answer' }, 18] }, end: 'too_young' },
        { if: { '>=': [{ var: 'answer' }, 65] }, goTo: 'retired' },
      ],
    },
    { id: 'team', text: 'How big is your team?', showIf: { '==': [{ var: 'context.role' }, 'manager'] } },
    { id: 'commute', text: 'How do you get to work?', answers: [{ value: 'car' }, { value: 'bike' }] },
    { id: 'retired', text: 'How long have you been retired?' },
  ],
});

const session = new SurveySession(definition);
session.setContext({ role: 'engineer' });

session.getQuestion();          // => age
session.setAnswer({ value: 30 });
session.getNextQuestion();      // => commute ('team' is hidden for non-managers)
session.back();                 // => age, with its answer kept

session.setAnswer({ value: 12 });
session.getNextQuestion();      // => null
session.ending;                 // => 'too_young'
```

### Rules and context

Each question can carry ordered branching rules written in [JsonLogic](https://jsonlogic.com). When the session leaves
a question, the first rule whose `if` holds decides where to go: `goTo` a question, or `end` the survey with a named
ending (`session.ending`). A rule without `if` always matches. If no rule matches, the definition's answer map applies,
then the next question in order.

Conditions are evaluated against:

| Path | Value |
| --- | --- |
| `answer` | The answer to the question being left, or `null`. |
| `answers.<questionId>` | Any valid answer so far. Abandoned answers are not included. |
| `context.<key>` | The session's `context`. Change it any time with `setContext()`. |

Beyond the standard JsonLogic operators, two are registered: `{ "answered": "q1" }` and
`{ "matches": [value, "regex"] }`. They are added to the shared `json-logic-js` instance, so other code using that
library sees them too.

- `showIf` asks a question only when its condition holds; `skipIf` routes past it when its condition holds. A routed-past
  question is not asked, but its own rules still decide where to go next. This includes the first question: it is
  checked the first time the session is read, so context set before then counts.
- `definition.addRule(question, rule)` adds a rule in code. It throws a `TypeError` unless the rule has exactly one of
  `goTo` or `end`, and a `RangeError` for a question outside the survey. Rules loaded from JSON with an unknown `goTo`
  are ignored.
- Question ids are read as JsonLogic paths, so ids containing `.` cannot be referenced in `answers.<id>`.
- To write definitions in YAML, use [`survey-skipper-yaml`](../yaml).

### Question types and validation

Give a question a `type` to say what answer it expects, mark it `required`, and add `validation` rules:

| `type` | Value | Rules that apply |
| --- | --- | --- |
| `single` | One of the answer options (anything, if a custom option exists) | |
| `multi` | A list of answer options | `minSelected`, `maxSelected` |
| `text` | A string | `minLength`, `maxLength`, `pattern` |
| `number` | A finite number | `min`, `max` |
| `rating` | A whole number on a scale | `min`, `max` (default 1 to 5) |
| `date` | `YYYY-MM-DD` | `min`, `max` as dates |
| `boolean` | `true` or `false` | |
| `ranking` | The answer options as a list, most preferred first, each once | `maxSelected` to rank only the top few |
| `matrix` | `{ [row]: column }`: one answer option (column) for each of the question's `rows` | `required` means every row |

```ts
const result = session.answer({ value: 130 }); // the current question is { type: 'number', validation: { max: 120 } }
result; // => { ok: false, errors: [{ code: 'max', message: 'Must be at most 120' }] }
```

- `session.answer(answer, question?)` validates, and stores the answer only if it passes.
  `session.setAnswer(...)` still stores without checking.
- `session.validate(question?)` checks the stored answer, which reports `required` for a missing one.
- `validateAnswer(question, answer)` is the same check as a standalone function.
- Error codes: `required`, `type`, `option`, `min`, `max`, `minLength`, `maxLength`, `pattern`, `minSelected`,
  `maxSelected`, `duplicate`. Messages are plain English defaults; map codes to your own text as needed.
- Answers keep their types: booleans stay `true`/`false` (2.x and 3.0 stored them as `1`/`0`), and multiple-choice
  answers are lists, which rules can test with `{ "in": ["dog", { "var": "answer" }] }`. In the answer map, a list
  answer's key is its values joined with `,`.
- Matrix answers are objects, so rules read a row with `{ "var": "answers.grid.food" }`. `aggregate()` counts each
  row as `row: column`, and `toRows()` / `toCSV()` give each row its own `<id>:<row>` column. `AnswerValue` now
  includes `MatrixValue`; `isMatrix()`, `formatAnswerValue()` and `valueKey()` help handle it.

```ts
{ id: 'grid', type: 'matrix', rows: [{ value: 'food' }, { value: 'service' }],
  answers: [{ value: 1, text: 'Bad' }, { value: 2, text: 'OK' }, { value: 3, text: 'Great' }] }
```

### Pages, piped text and events

**Pages.** Give consecutive questions the same `section` to show them together. `session.getPage()` returns the current
question plus the following questions in its section along the route the current answers lead to, leaving out hidden
ones. Call it again after each answer, since an answer can show, hide or jump past questions on the same page.
`session.nextPage()` moves past the page and returns the next one; going back from there returns to the first question
of the page you left.

```ts
let page = session.getPage();        // => [q1, q3]  (q2 is hidden until q1 is answered)
session.answer({ value: 'yes' }, q1);
page = session.getPage();            // => [q1, q2, q3]
session.answer({ value: 'Volvo' }, q2);
session.nextPage();                  // => the next section's questions
```

**Piped text.** Question text can include `{{answers.<id>}}`, `{{context.<key>}}` and `{{answer}}`.
`session.getQuestionText(question?)` fills them in; `session.renderText(template)` does the same for any string. Lists
are joined with `, ` and missing values become empty text.

**Events.** `session.on(event, listener)` returns a function that removes the listener.

| Event | Payload | When |
| --- | --- | --- |
| `answer` | `{ question, answer }` | An answer was stored |
| `invalid` | `{ question, errors }` | `answer()` rejected an answer |
| `navigate` | `{ from, to }` | The session moved forward (`to` is `null` at the end) |
| `back` | `{ from, to }` | The session went back |
| `complete` | `{ ending }` | The session finished |


### Carry-forward options

`answersFrom` builds a choice question's options from an earlier one:

```ts
{ id: 'uses', type: 'multi', answers: [{ value: 'netflix' }, { value: 'hulu' }, { value: 'disney' }] },
{ id: 'favorite', type: 'single', answersFrom: { question: 'uses' } },
{ id: 'consider', type: 'multi', answersFrom: { question: 'uses', include: 'unselected' },
  answers: [{ value: 'none', text: 'None of these', fixed: true }] },
```

`include` is `selected` (the default), `unselected` or `all`. The question's own `answers` come after the carried
ones. `session.getOptions(question)` returns the result, and `session.answer()` validates against it. When nothing
carries forward, the question is routed past. Custom options are not carried.

### Scoring

Give answer options a `score` to build quizzes, assessments or lead scoring:

```ts
{ id: 'capital', section: 'geo', type: 'single', answers: [{ value: 'paris', score: 2 }, { value: 'lyon', score: 0 }] }
```

`session.getScore()` returns `{ total, sections }`: the points of every option picked (each picked option of a multi
answer counts), with totals per question `section`. Custom answers score the question's custom option. Rules,
`showIf`, variables and piped text can read `score` and `scores.<section>`, for example
`{ if: { '>=': [{ var: 'score' }, 4] }, end: 'pass' }` or `"You scored {{score}}"`. Pass the definition as the second
argument of `aggregate()` to get `score` statistics (count, mean, min, max, distribution) over completed sessions.

### Randomized order

- `randomize: true` on a question shuffles its answer options. Options with `fixed: true` (such as "None of these")
  and custom options keep their place. Read the order with `session.getOptions(question)`.
- `sections: { ratings: { randomize: true } }` on the definition asks the consecutive questions of that section in a
  random order. Rules still apply, and a rule that goes to the section's first question enters it at its shuffled
  start.
- The order comes from the session's `seed`, which is saved with it, so it stays the same across Back, resume and
  reload. Pass `{ seed }` in the session state to choose it, or `{ random }` in the options to control new seeds.
### Going back

`session.back()` returns to the previous question the respondent was shown (or `null` at the start; check with
`canGoBack()`). Answers are kept, so a UI can prefill them. Moving forward along the same route asks those questions
again rather than skipping them.

If the respondent changes an answer and takes a different route, answers on the route they left move from `answers` to
`abandonedAnswers`: they no longer route or skip, but are not lost. Set `keepAbandonedAnswers: false` on the definition
to discard them instead. `getPath()` lists the questions shown so far.

`session.goTo(id)` jumps to a question on the respondent's route, as if they pressed Back or Next several times. That
works for earlier questions, and for questions they stepped back past while every answer on the way is still valid.
Anything else would bypass the rules, so it throws a `RangeError`. Check with `canGoTo(id)`, for example to enable
links in a step list.

### When a survey takes responses

A definition can say when it takes new responses: `status` (`draft`, `open` or `closed`; unset means open), `opensAt`
and `closesAt` (ISO 8601 date-times) and `maxResponses`. `definition.availability({ now?, responses? })` returns
`{ accepting, reason? }`, where `reason` is `draft`, `closed`, `not_yet_open`, `past_close` or `full`. Pass the number
of completed responses as `responses` to check `maxResponses`. `isAcceptingResponses(...)` returns just the boolean.
Sessions themselves don't check it, so a respondent who already started can finish.

### Saving and restoring

Both classes have `toJSON()`, so `JSON.stringify` works directly. Pass the parsed JSON back to the constructor:

```ts
const savedDefinition = JSON.stringify(definition);
const savedSession = JSON.stringify(session);

const restored = new SurveySession(new SurveyDefinition(JSON.parse(savedDefinition)), JSON.parse(savedSession));
```

Saved JSON carries `schemaVersion` (currently `SCHEMA_VERSION`, 1). Input from a newer schema is rejected with a
`RangeError`. A saved session also records `definitionId` and `definitionVersion`, so you can tell which definition it
ran against.

### Tracking and analytics

- **Timeline:** every session keeps `session.timeline`, a list of `{ type, questionId?, value?, ending?, at }` events:
  `shown`, `answered`, `changed`, `skipped` (routed past), `back` and `complete`. It is saved with the session. Pass
  `{ now }` as the third constructor argument to control the clock. `timeOnQuestions(timeline)` adds up the
  milliseconds spent on each question.
- **Computed variables:** a definition's `variables` maps names to JsonLogic expressions, evaluated in order. Read them
  as `vars.<name>` in rules, `showIf` / `skipIf` and piped text, or with `session.getVariables()`.

  ```ts
  variables: {
    total: { '+': [{ var: 'answers.a' }, { var: 'answers.b' }] },
    promoter: { '>=': [{ var: 'vars.total' }, 15] },
  }
  ```

- **Aggregation:** `aggregate(sessions)` takes live sessions or saved session JSON and returns completion counts and
  rate, endings, per-question `shown` / `answered` / `droppedOff` counts and answer `distribution`, and the most common
  routes.
- **Export:** `toRows(definition, sessions, options?)` returns `{ columns, rows }` with one row per respondent:
  `sessionId`, `definitionVersion`, `finished`, `ending`, `startedAt`, `completedAt`, `durationMs`, then one column per
  question in the definition's order. `toCSV(...)` returns the same as CSV, joining list answers with `;` and
  defusing spreadsheet formulas. Options: `includeAbandoned`, `includeTimings` (`time:<id>` columns) and
  `includeContext` (`context:<key>` columns). Sessions can be live, saved JSON, or `{ sessionId, state }` entries from
  `store.listSessions()`.
- **Versioning:** `migrateSession(savedState, newDefinition)` moves a saved session onto a changed definition.
  Answers to removed questions, or answers that no longer validate, move to `abandonedAnswers`. If the respondent's
  current question was removed, the session resumes at its first unanswered question. It returns the new state and a
  report of what was kept, removed and invalid.

### Plugins, storage and translations

- **Plugins:** `registerOperator(name, fn)` adds a JsonLogic operator (built-in names are refused).
  `registerQuestionType(name, check)` adds a question type whose `check(value, question)` returns an error message or
  `undefined`. `registerValidator(name, fn)` adds a validator that questions use through
  `validation: { custom: [{ name, args?, message? }] }`; failures have code `custom` and the validator's name.
  Registrations are global to the process; `resetPlugins()` clears them. `lintDefinition` flags unregistered types and
  validators.
- **Storage:** `SurveyStore` is an async interface for saving and loading definitions (by id and version) and
  sessions (by your own session id). `MemoryStore` keeps everything in memory, and `WebStorageStore(localStorage)`
  works in browsers or with any `getItem` / `setItem` storage. `resumeSession(store, sessionId)` loads a session
  together with the exact definition version it ran against.
- **Translations:** questions take `translations: { fr: { text, answers: { <value>: 'text' } } }`, and definitions take
  `defaultLocale` and `translations: { fr: { title, description } }`. The session's locale is `context.locale`, falling
  back from `fr-CA` to `fr` to the plain text. Use `getQuestionText`, `getAnswerText(option)`, `getTitle` and
  `getDescription`.

### Authoring tools

```ts
import { survey, lt, gte, eq, lintDefinition, simulatePaths, runScript, toMermaid } from 'survey-skipper';

const definition = survey('commute', { version: 1 })
  .question('age', { type: 'number' }, (q) => q.end('too_young', lt('answer', 18)).goTo('retired', gte('answer', 65)))
  .question('drive', { type: 'boolean' }, (q) => q.goTo('done', eq('answer', false)))
  .question('make', { type: 'text' })
  .question('retired', {}, (q) => q.goTo('done'))
  .question('done')
  .build();

lintDefinition(definition);                              // => [] when nothing is wrong
simulatePaths(definition);                               // every structural route, with endings
runScript(definition, { answers: { age: 12 } });         // => { questions: ['age'], finished: true, ending: 'too_young' }
toMermaid(definition);                                   // a flowchart of the branching (also toDot)
```

- **Builder:** `survey(id, options)` and `.question(id, options, (q) => ...)`, where `q` offers `goTo(target, if?)`,
  `end(ending, if?)`, `showIf`, `skipIf` and `required`. Condition helpers build JsonLogic: `eq`, `ne`, `gt`, `gte`,
  `lt`, `lte`, `oneOf`, `includes`, `answered`, `matches`, `and`, `or`, `not`, `v`. `.toInput()` gives the plain JSON
  instead of a definition.
- **Lint:** `lintDefinition` reports duplicate ids, malformed rules, unknown targets, rules after an always-matching
  rule, unreachable questions, conditions that read unknown questions, bad regular expressions and choice questions
  without options. Each issue has a `severity`, `code`, `message` and `questionId`.
- **Routes:** `simulatePaths` follows every rule, answer-map entry and fall-through without evaluating conditions,
  so it shows the survey's shape. `runScript` runs a real session with scripted answers and shows the route a
  respondent would actually take. `getEdges` exposes the underlying graph.
- **JSON Schema:** `survey-skipper/schema.json` (draft 2020-12) describes saved definitions, for editors and other
  languages.

### More

- **Answer map**: the older, value-based way to branch: `definition.mapAnswer(fromQuestion, answer, toQuestion)` writes
  `answerMap[fromQuestionId][answerKey] = toQuestionId`. The key is the answer's value, or the definition's `customKey`
  (default `'*'`) for custom answers.
- **Pre-answers**: `session.setAnswer(answer, laterQuestion)` answers a later question now. When the session reaches it,
  it is routed past, but its own rules and mapping still decide where to go next.
- **Batches** (older than pages): `getNextQuestions(n)` returns up to `n` consecutive questions; `setAnswers(answers)`
  answers them in order. Only the last answer's routing affects what comes next. Prefer `section` and `getPage()`.
- `getNextQuestion()` returns `null` when the session is finished, including when answered questions route in a loop
  with nowhere left to go.

### Errors

- `new Question({...})` throws a `TypeError` without an `id`.
- `mapAnswer` throws a `TypeError` for an empty answer value, and a `RangeError` if the target question is not in the
  survey.
- `addRule` throws as described above.
- Constructors throw a `RangeError` for a `schemaVersion` newer than this library supports.

## Upgrading from 2.x

`Survey` still works in 3.0 but is deprecated and will be removed in 4.0. It is now a `SurveySession` that builds its
own definition from the combined input. To migrate:

| 2.x | 3.0 |
| --- | --- |
| `new Survey({ questions, answerMap, ...state })` | `new SurveySession(new SurveyDefinition({ questions, answerMap }), state)` |
| `survey.mapAnswer(...)`, `survey.addRule(...)` | `definition.mapAnswer(...)`, `definition.addRule(...)` |
| `survey.questions`, `survey.answerMap` | `definition.questions`, `definition.answerMap` (also `session.questions`) |
| `new Survey({ keepAbandonedAnswers })` | `new SurveyDefinition({ keepAbandonedAnswers })` |
| Saving selected fields by hand | `JSON.stringify(definition)` and `JSON.stringify(session)` |

Behaviour changes, which apply to `Survey` too:

- The first question is now checked like any other: if it is hidden by `showIf` / `skipIf`, or already answered before
  the session is first read, the session starts at the next question.

## Development

This package lives in the [survey-skipper monorepo](https://github.com/hynding/survey-skipper). See the root README for
setup; from this folder, `pnpm run check` runs typecheck, lint, tests and build for this package only.
