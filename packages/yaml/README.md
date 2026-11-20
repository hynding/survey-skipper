# survey-skipper-yaml

Write [survey-skipper](../core) survey definitions, including their JsonLogic rules, in YAML.

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

- `parseSurvey(text)` returns the plain `SurveyDefinitionInput`; `loadSurvey(text)` returns a `SurveyDefinition`.
- 0.2.0 needs `survey-skipper` 3.x. In 0.1.0, `loadSurvey` returned a `Survey`.
- Both throw a `TypeError` if the document is not a mapping with a `questions` list.
- Quote the `"!"` operator, which YAML would read as a tag. Other operators can be left bare.
