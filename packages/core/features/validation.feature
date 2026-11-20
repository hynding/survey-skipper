Feature: Question types and validation
  session.answer() checks an answer against the question's type, options, required flag and validation rules,
  and only stores it when it passes.

  Background:
    Given a definition:
      """
      {
        "questions": [
          { "id": "color", "type": "single", "required": true, "answers": [{ "value": "red" }, { "value": "blue" }] },
          { "id": "pets", "type": "multi", "answers": [{ "value": "cat" }, { "value": "dog" }, { "value": "fish" }],
            "validation": { "minSelected": 1, "maxSelected": 2 } },
          { "id": "name", "type": "text", "validation": { "minLength": 2, "maxLength": 10, "pattern": "^[A-Za-z ]+$" } },
          { "id": "age", "type": "number", "validation": { "min": 0, "max": 120 } },
          { "id": "stars", "type": "rating" },
          { "id": "born", "type": "date", "validation": { "min": "1900-01-01" } },
          { "id": "agree", "type": "boolean" },
          { "id": "other", "type": "single", "answers": [{ "value": "a" }, { "isCustom": true }] },
          { "id": "free" }
        ]
      }
      """
    And a session for "alice" on the definition

  Scenario Outline: Answers are checked against their question
    When "alice" answers "<question>" with JSON <value>
    Then the answer is <result>

    Examples:
      | question | value              | result                    |
      | color    | "red"              | accepted                  |
      | color    | "green"            | rejected with option      |
      | color    | ["red"]            | rejected with type        |
      | color    | ""                 | rejected with required    |
      | pets     | ["cat", "dog"]     | accepted                  |
      | pets     | ["cat", "dog", "fish"] | rejected with maxSelected |
      | pets     | ["cow"]            | rejected with option      |
      | pets     | "cat"              | rejected with type        |
      | name     | "Ada"              | accepted                  |
      | name     | "A"                | rejected with minLength   |
      | name     | "Ada99"            | rejected with pattern     |
      | name     | 7                  | rejected with type        |
      | age      | 42                 | accepted                  |
      | age      | 130                | rejected with max         |
      | age      | "42"               | rejected with type        |
      | stars    | 5                  | accepted                  |
      | stars    | 6                  | rejected with max         |
      | stars    | 2.5                | rejected with type        |
      | born     | "1990-05-17"       | accepted                  |
      | born     | "1850-01-01"       | rejected with min         |
      | born     | "17/05/1990"       | rejected with type        |
      | agree    | true               | accepted                  |
      | agree    | "yes"              | rejected with type        |
      | other    | "anything"         | accepted                  |
      | free     | {"nested": "ok"}   | accepted                  |
      | free     | null               | accepted                  |

  Scenario: A rejected answer is not stored
    When "alice" answers "age" with JSON 130
    Then "alice" has not answered "age"

  Scenario: validate() reports a missing required answer
    Then validating "color" for "alice" reports required

  Scenario: Multiple-choice answers can be tested in rules
    Given a definition:
      """
      {
        "questions": [
          { "id": "pets", "type": "multi", "answers": [{ "value": "cat" }, { "value": "dog" }],
            "rules": [{ "if": { "in": ["dog", { "var": "answer" }] }, "goTo": "walks" }] },
          { "id": "litter" },
          { "id": "walks" }
        ]
      }
      """
    And a session for "bob" on the definition
    When "bob" answers "pets" with JSON ["cat", "dog"]
    And "bob" asks for the next question
    Then the current question for "bob" is "walks"

  Scenario: Boolean answers keep their type
    When "alice" answers "agree" with JSON false
    Then "alice" stored false for "agree"
