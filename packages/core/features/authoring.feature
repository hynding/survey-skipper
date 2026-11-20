Feature: Authoring tools
  Lint a definition, list its routes, run scripted respondents, draw it, validate it against the JSON Schema,
  and build it in code.

  Background:
    Given a definition:
      """
      {
        "id": "commute",
        "questions": [
          { "id": "age", "type": "number", "text": "How old are you?",
            "rules": [
              { "if": { "<": [{ "var": "answer" }, 18] }, "end": "too_young" },
              { "if": { ">=": [{ "var": "answer" }, 65] }, "goTo": "retired" }
            ] },
          { "id": "drive", "type": "boolean", "rules": [{ "if": { "==": [{ "var": "answer" }, false] }, "goTo": "done" }] },
          { "id": "make", "type": "text" },
          { "id": "retired", "rules": [{ "goTo": "done" }] },
          { "id": "done" }
        ]
      }
      """

  Scenario: A clean definition has no lint issues
    Then linting finds nothing

  Scenario: Lint finds authoring mistakes
    Given a definition:
      """
      {
        "questions": [
          { "id": "a", "type": "single",
            "rules": [{ "goTo": "b" }, { "goTo": "c" }, { "goTo": "ghost" }],
            "showIf": { "==": [{ "var": "answers.nobody" }, 1] } },
          { "id": "b", "validation": { "pattern": "([" }, "rules": [{ "end": "x" }] },
          { "id": "c" },
          { "id": "b" }
        ]
      }
      """
    Then linting finds "duplicate-id, unreachable-rule, unknown-target, unreachable-rule, unknown-reference, missing-options, invalid-pattern, unreachable-question"

  Scenario: Every structural route is listed
    Then the routes are:
      | route                        | ending    |
      | age                          | too_young |
      | age > retired > done         |           |
      | age > drive > done           |           |
      | age > drive > make > retired > done |    |

  Scenario Outline: A scripted respondent takes the expected route
    When a respondent answers <answers>
    Then they see "<route>" and finish <ending>

    Examples:
      | answers                                   | route                   | ending      |
      | {"age": 12}                               | age                     | "too_young" |
      | {"age": 70, "retired": "x", "done": "y"}  | age, retired, done      | normally    |
      | {"age": 30, "drive": false, "done": "y"}  | age, drive, done        | normally    |
      | {"age": 30, "drive": true}                | age, drive, make        | unfinished  |

  Scenario: The graph can be drawn in Mermaid and DOT
    Then the Mermaid drawing has an edge from "age" to the "too_young" ending
    And the DOT drawing is a digraph with 5 questions

  Scenario: Saved definitions match the JSON Schema
    Then the saved definition matches the JSON Schema
    And a definition with a rule that has both goTo and end does not match the JSON Schema

  Scenario: The builder produces the same routing
    Given the same survey made with the builder
    When a respondent answers {"age": 12}
    Then they see "age" and finish "too_young"
    And linting finds nothing
