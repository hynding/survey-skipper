Feature: Tracking and analytics
  Sessions keep a timeline, definitions can compute variables, many sessions can be summarized,
  and saved sessions can move to a newer definition.

  Background:
    Given a definition:
      """
      {
        "id": "nps",
        "version": 1,
        "variables": {
          "total": { "+": [{ "var": "answers.a" }, { "var": "answers.b" }] },
          "promoter": { ">=": [{ "var": "vars.total" }, 15] }
        },
        "questions": [
          { "id": "a", "type": "number" },
          { "id": "b", "type": "number", "text": "Total so far: {{vars.total}}" },
          { "id": "c", "rules": [{ "if": { "var": "vars.promoter" }, "end": "promoter" }] },
          { "id": "d" }
        ]
      }
      """

  Scenario: The timeline records what happened, with times
    Given a session for "alice" on the definition with a clock ticking one second per event
    When "alice" answers "a" with JSON 3
    And "alice" asks for the next question
    And "alice" answers "b" with JSON 4
    And "alice" answers "b" with JSON 5
    And "alice" goes back
    Then the timeline for "alice" is "shown a, answered a, shown b, answered b, changed b, back a"
    And "alice" spent 2000 ms on "a" and 3000 ms on "b"

  Scenario: Computed variables feed rules and text
    Given a session for "alice" on the definition
    When "alice" answers "a" with JSON 9
    And "alice" asks for the next question
    And "alice" answers "b" with JSON 8
    Then the variables for "alice" are {"total": 17, "promoter": true}
    And the text of "b" for "alice" is "Total so far: 17"
    When "alice" asks for the next question
    And "alice" answers "c" with JSON "ok"
    And "alice" asks for the next question
    Then "alice" is finished

  Scenario: Many sessions are summarized
    Given these sessions finished with answers:
      | a | b | c   | d   |
      | 9 | 8 | ok  |     |
      | 1 | 2 | ok  | yes |
      | 1 | 3 |     |     |
    Then the summary has 3 sessions, 2 completed and endings {"promoter": 1, "(none)": 1}
    And question "a" was answered 3 times with {"1": 2, "9": 1}
    And question "c" lost 1 respondent
    And the most common route is "a, b, c"

  Scenario: A saved session moves to a newer definition
    Given a session for "alice" on the definition
    And "alice" answers "a" with JSON 3
    And "alice" asks for the next question
    And "alice" answers "b" with JSON 4
    And "alice" asks for the next question
    When "alice" is migrated to version 2, where "b" became text and "c" was removed
    Then the migration kept "a", flagged "b" as invalid and restarted
    And "alice" resumes at "b"
    And "alice" has an abandoned answer for "b"
