Feature: Plugins, storage and translations

  Scenario: A registered operator works in rules
    Given the operator "near" is registered
    And a definition:
      """
      {
        "questions": [
          { "id": "guess", "rules": [{ "if": { "near": [{ "var": "answer" }, 50] }, "end": "close" }] },
          { "id": "again" }
        ]
      }
      """
    And a session for "alice" on the definition
    When "alice" answers "48"
    And "alice" asks for the next question
    Then "alice" is finished

  Scenario: Built-in operators cannot be replaced
    When I try to register the operator "=="
    Then an error is raised matching "built-in operator"

  Scenario: A registered question type and validator check answers
    Given the question type "email" is registered
    And the validator "notDomain" is registered
    And a definition:
      """
      {
        "questions": [
          { "id": "mail", "type": "email",
            "validation": { "custom": [{ "name": "notDomain", "args": "example.com" }] } }
        ]
      }
      """
    And a session for "alice" on the definition
    When "alice" answers "mail" with JSON "nope"
    Then the answer is rejected with type
    When "alice" answers "mail" with JSON "ada@example.com"
    Then the answer is rejected with custom
    When "alice" answers "mail" with JSON "ada@lovelace.org"
    Then the answer is accepted

  Scenario: Lint flags unregistered types and validators
    Given a definition:
      """
      { "questions": [{ "id": "a", "type": "colour", "validation": { "custom": [{ "name": "ghost" }] } }] }
      """
    Then linting finds "unknown-type, unknown-validator"

  Scenario: Sessions are saved and resumed against the right definition version
    Given a definition:
      """
      { "id": "s", "version": 1, "questions": [{ "id": "a" }, { "id": "b" }] }
      """
    And the definition is saved to a memory store
    And a session for "alice" on the definition
    And "alice" answers "x"
    And "alice" asks for the next question
    And "alice" is saved to the store as "alice-1"
    And version 2 of the definition is saved to the store
    When "alice-1" is resumed from the store
    Then the resumed session is on "b" with definition version 1
    And the store lists 1 session for definition "s"
    And the store's latest version of "s" is 2

  Scenario: Text follows the session's locale
    Given a definition:
      """
      {
        "title": "Commute",
        "defaultLocale": "en",
        "translations": { "fr": { "title": "Trajet" } },
        "questions": [
          { "id": "mode", "text": "How do you get to work?",
            "answers": [{ "value": "bike", "text": "Bike" }],
            "translations": { "fr": { "text": "Comment allez-vous au travail ?", "answers": { "bike": "Vélo" } } } }
        ]
      }
      """
    And a session for "alice" on the definition
    And "alice" has the context:
      """
      { "locale": "fr-CA" }
      """
    Then "alice" sees the title "Trajet", question "Comment allez-vous au travail ?" and option "Vélo"
    Given a session for "bob" on the definition
    Then "bob" sees the title "Commute", question "How do you get to work?" and option "Bike"
