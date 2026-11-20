Feature: Survey definitions and respondent sessions
  A definition holds the questions and rules. Each respondent gets their own session.

  Background:
    Given a definition:
      """
      {
        "id": "commute",
        "version": 3,
        "questions": [
          { "id": "intro", "showIf": { "!=": [{ "var": "context.returning" }, true] } },
          { "id": "car", "skipIf": { "==": [{ "var": "context.transport" }, "bike"] } },
          { "id": "distance" }
        ]
      }
      """

  Scenario: Two sessions on one definition keep separate answers
    Given a session for "alice" on the definition
    And a session for "bob" on the definition
    When "alice" answers "yes"
    Then "alice" has answered "intro"
    And "bob" has not answered "intro"

  Scenario: showIf applies to the first question, using context set after the session starts
    Given a session for "alice" on the definition
    And "alice" has the context:
      """
      { "returning": true }
      """
    Then the current question for "alice" is "car"

  Scenario: skipIf routes past a question
    Given a session for "alice" on the definition
    And "alice" has the context:
      """
      { "transport": "bike" }
      """
    When "alice" answers "hello"
    And "alice" asks for the next question
    Then the current question for "alice" is "distance"

  Scenario: A pre-answered first question is routed past
    Given a session for "alice" on the definition
    When "alice" pre-answers "intro" with "seen"
    Then the current question for "alice" is "car"

  Scenario: A finished session restores as finished
    Given a session for "alice" on the definition
    And "alice" answers "a"
    And "alice" asks for the next question
    And "alice" answers "b"
    And "alice" asks for the next question
    And "alice" answers "c"
    And "alice" asks for the next question
    When "alice" is saved to JSON and restored
    Then "alice" is finished
    And "alice" can go back

  Scenario: Session JSON records the schema and definition versions
    Given a session for "alice" on the definition
    When "alice" is saved to JSON
    Then the saved session has schema version 1, definition "commute" and definition version 3

  Scenario: A definition from a newer schema is rejected
    When I load a definition with schema version 99
    Then an error is raised matching "newer than this library supports"

  Scenario: A session from a newer schema is rejected
    When I restore a session with schema version 99
    Then an error is raised matching "newer than this library supports"

  Scenario: The deprecated Survey class still combines both
    When I build a 2.x style Survey with a mapped answer
    Then it routes like a session
