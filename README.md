# Survey Skipper
A simple but smart survey system, agnostic of service implementation, to allow skipping questions based on predetermined
answers.

Written in TypeScript and published as CommonJS with type declarations.

## Install

```sh
npm install survey-skipper
```

## Usage

```ts
import { Answer, Question, Survey } from 'survey-skipper';

const yes = () => new Answer({ value: 'yes' });
const no = () => new Answer({ value: 'no' });

const q1 = new Question({ id: 'q1', text: 'Do you own a car?', answers: [yes(), no()] });
const q2 = new Question({ id: 'q2', text: 'What make is it?', answers: [new Answer({ isCustom: true })] });
const q3 = new Question({ id: 'q3', text: 'How do you get to work?', answers: [yes(), no()] });

const survey = new Survey({ questions: [q1, q2, q3] });

// Answering "no" to q1 skips straight to q3.
survey.mapAnswer(q1, q1.answers[1]!, q3);

survey.setAnswer(new Answer({ value: 'no' }));
survey.getNextQuestion(); // => q3
```

### Concepts

- **Answer map**: `answerMap[fromQuestionId][answerKey] = toQuestionId`. The key is the answer's value, or the survey's
  `customKey` (default `'*'`) for custom answers. Unmapped answers move on to the next question in order.
- **Pre-answers**: `setAnswer(answer, futureQuestion)` answers a later question now. When the survey reaches it, it is
  skipped, but its own mapping still decides where to go next.
- **Batches**: `getNextQuestions(n)` returns up to `n` consecutive questions; `setAnswers(answers)` answers them in order.
  Only the last answer's mapping affects what comes next.
- **Persistence**: a survey's `questions`, `answers` and `answerMap` can be saved as JSON and passed back to
  `new Survey({...})`, along with `currentQuestionId`. Plain objects are turned back into `Question` / `Answer`
  instances.
- `getNextQuestion()` returns `null` when the survey is finished, including when pre-answered questions route in a
  loop with nowhere left to go.

### Errors

- `new Question({...})` throws a `TypeError` without an `id`.
- `mapAnswer` throws a `TypeError` for an empty answer value, and a `RangeError` if the target question is not in the
  survey.

## Development

Requires Node 22 or later for the dev tooling (the published library runs on Node 20+).

```sh
npm ci
npm run typecheck   # tsc --noEmit
npm run lint        # eslint (typescript-eslint strict, type-checked)
npm test            # cucumber-js feature tests
npm run build       # emits dist/
npm run check       # all of the above
```
