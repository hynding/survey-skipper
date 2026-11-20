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

```ts
const result = session.answer({ value: 130 }); // the current question is { type: 'number', validation: { max: 120 } }
result; // => { ok: false, errors: [{ code: 'max', message: 'Must be at most 120' }] }
```

- `session.answer(answer, question?)` validates, and stores the answer only if it passes.
  `session.setAnswer(...)` still stores without checking.
- `session.validate(question?)` checks the stored answer, which reports `required` for a missing one.
- `validateAnswer(question, answer)` is the same check as a standalone function.
- Error codes: `required`, `type`, `option`, `min`, `max`, `minLength`, `maxLength`, `pattern`, `minSelected`,
  `maxSelected`. Messages are plain English defaults; map codes to your own text as needed.
- Answers keep their types: booleans stay `true`/`false` (2.x and 3.0 stored them as `1`/`0`), and multiple-choice
  answers are lists, which rules can test with `{ "in": ["dog", { "var": "answer" }] }`. In the answer map, a list
  answer's key is its values joined with `,`.

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

### Going back

`session.back()` returns to the previous question the respondent was shown (or `null` at the start; check with
`canGoBack()`). Answers are kept, so a UI can prefill them. Moving forward along the same route asks those questions
again rather than skipping them.

If the respondent changes an answer and takes a different route, answers on the route they left move from `answers` to
`abandonedAnswers`: they no longer route or skip, but are not lost. Set `keepAbandonedAnswers: false` on the definition
to discard them instead. `getPath()` lists the questions shown so far.

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
- **Versioning:** `migrateSession(savedState, newDefinition)` moves a saved session onto a changed definition.
  Answers to removed questions, or answers that no longer validate, move to `abandonedAnswers`. If the respondent's
  current question was removed, the session resumes at its first unanswered question. It returns the new state and a
  report of what was kept, removed and invalid.

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
