# survey-skipper-yaml

Read and write [survey-skipper](../core) survey definitions, including their JsonLogic rules, as YAML.

```sh
npm install survey-skipper survey-skipper-yaml
```

```yaml
title: Commute survey
questions:
  - id: age
    rules:
      - if: { "<": [{ var: answer }, 18] }
        end: too_young
  - id: role
    showIf: { "==": [{ var: context.employed }, true] }
    answers:
      - value: manager
      - value: other
        text: Something else
  - id: commute
    rules:
      - if:
          and:
            - answered: role
            - "==": [{ var: answers.role }, manager]
        goTo: done
  - id: done
```

```ts
import { readFileSync } from 'node:fs';
import { SurveySession } from 'survey-skipper';
import { loadSurvey, stringifySurvey } from 'survey-skipper-yaml';

const definition = loadSurvey(readFileSync('commute.yaml', 'utf8'));
const session = new SurveySession(definition, { context: { employed: true } });

stringifySurvey(definition); // back to YAML; given a session, writes its definition only
```

## API

| Function | Returns |
| --- | --- |
| `parseSurvey(text)` | The plain `SurveyDefinitionInput` (no validation beyond the shape check below). |
| `loadSurvey(text)` | A `SurveyDefinition`, ready for `new SurveySession(definition)`. |
| `stringifySurvey(survey)` | YAML for a `SurveyDefinition`, a plain definition input, or a `SurveySession` (its definition only; answers, history and context are left out). |

- `parseSurvey` and `loadSurvey` throw a `TypeError` if the document is not a mapping with a `questions` list.
- Every definition field round-trips: metadata, `variables`, `translations`, lifecycle (`status`, `opensAt`,
  `closesAt`, `maxResponses`), `sections`, `quotas`, `answerMap`, and on questions `type`, `validation`, `required`,
  `section`, `randomize`, `answersFrom`, `rows`, `showIf`, `skipIf` and `rules`, plus option `score`, `fixed` and
  `isCustom`. Defaults are left out, so the output stays short.
- Quote the `"!"` operator, which YAML would read as a tag. Other operators can be left bare.
- [`survey-skipper-server`](../../apps/server) accepts YAML definitions (`Content-Type: application/yaml`), and the
  [web builder](../../apps/web) edits surveys as YAML.

## Compatibility

Needs `survey-skipper` 3.x (it is a peer dependency). Use the latest of both: each new definition field in the core
library is added here in the matching release, and an older `survey-skipper-yaml` drops fields it does not know
when writing. In 0.1.0, `loadSurvey` returned the deprecated `Survey`.

## Development

This package lives in the [survey-skipper monorepo](https://github.com/hynding/survey-skipper). From this folder,
`pnpm run check` runs typecheck, lint, tests (`node:test`) and build. Build `survey-skipper` first.
