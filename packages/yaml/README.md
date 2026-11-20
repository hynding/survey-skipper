# survey-skipper-yaml

Write [survey-skipper](../core) surveys, including their JsonLogic rules, in YAML.

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
import { loadSurvey, stringifySurvey } from 'survey-skipper-yaml';

const survey = loadSurvey(readFileSync('commute.yaml', 'utf8'));
survey.setContext({ employed: true });

stringifySurvey(survey); // the definition back as YAML, without answers, history or context
```

- `parseSurvey(text)` returns the plain `SurveyInput`; `loadSurvey(text)` returns a `Survey`.
- Both throw a `TypeError` if the document is not a mapping with a `questions` list.
- Quote the `"!"` operator, which YAML would read as a tag. Other operators can be left bare.
