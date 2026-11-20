Feature: Branching rules written in JsonLogic
  Questions carry ordered rules. The first rule whose condition holds decides where to go next.
  Conditions can read the current answer, any earlier answer, and the survey's context.

  Background:
    Given a survey defined as:
      """
      {
        "questions": [
          {
            "id": "age",
            "rules": [
              { "if": { "<": [{ "var": "answer" }, 18] }, "end": "too_young" },
              { "if": { ">=": [{ "var": "answer" }, 65] }, "goTo": "retired" }
            ]
          },
          { "id": "job" },
          {
            "id": "manager",
            "showIf": { "==": [{ "var": "context.role" }, "manager"] }
          },
          {
            "id": "commute",
            "rules": [
              { "if": { "and": [{ "answered": "job" }, { "==": [{ "var": "answers.job" }, "remote"] }] }, "goTo": "done" }
            ]
          },
          { "id": "retired" },
          { "id": "done" }
        ]
      }
      """

  Scenario: A rule on the current answer jumps ahead
    Given I answer "age" with "70"
    When I ask for the next question
    Then the next question is "retired"

  Scenario: No rule matches, so the survey continues in order
    Given I answer "age" with "30"
    When I ask for the next question
    Then the next question is "job"

  Scenario: An end rule finishes the survey with a named ending
    Given I answer "age" with "12"
    When I ask for the next question
    Then I do not receive another question
    And the survey ended as "too_young"

  Scenario: Going back from an ending clears it
    Given I answer "age" with "12"
    And I ask for the next question
    When I go back
    Then the next question is "age"
    And the survey has no ending

  Scenario: A question is hidden when its showIf condition fails
    Given I answer "age" with "30"
    And I ask for the next question
    And I answer "job" with "office"
    When I ask for the next question
    Then the next question is "commute"

  Scenario: Context shows a question, and can change mid-survey
    Given I answer "age" with "30"
    And I ask for the next question
    And the context is:
      """
      { "role": "manager" }
      """
    And I answer "job" with "office"
    When I ask for the next question
    Then the next question is "manager"

  Scenario: A rule reads an earlier answer
    Given I answer "age" with "30"
    And I ask for the next question
    And I answer "job" with "remote"
    And I ask for the next question
    And I answer "commute" with "bus"
    When I ask for the next question
    Then the next question is "done"

  Scenario: Rules are checked before the answer map
    Given answer "70" on "age" maps to "job" in the answer map
    And I answer "age" with "70"
    When I ask for the next question
    Then the next question is "retired"

  Scenario: The answer map still applies when no rule matches
    Given answer "30" on "age" maps to "commute" in the answer map
    And I answer "age" with "30"
    When I ask for the next question
    Then the next question is "commute"

  Scenario: A rule added in code takes effect
    Given I add a rule to "job" that goes to "done" when the answer is "none"
    And I answer "age" with "30"
    And I ask for the next question
    And I answer "job" with "none"
    When I ask for the next question
    Then the next question is "done"

  Scenario: A rule with an unknown target is ignored
    Given a survey defined as:
      """
      {
        "questions": [
          { "id": "a", "rules": [{ "goTo": "nowhere" }, { "goTo": "c" }] },
          { "id": "b" },
          { "id": "c" }
        ]
      }
      """
    And I answer "a" with "x"
    When I ask for the next question
    Then the next question is "c"

  Scenario: A rule needs exactly one of goTo or end
    When I add a rule to "job" with both goTo and end
    Then an error is raised matching "exactly one"

  Scenario: A rule cannot target a question outside the survey
    When I add a rule to "job" that goes to "elsewhere"
    Then an error is raised matching "not part of this survey"

  Scenario: A regular expression check with matches
    Given a survey defined as:
      """
      {
        "questions": [
          { "id": "zip", "rules": [{ "if": { "!": { "matches": [{ "var": "answer" }, "^\\d{5}$"] } }, "end": "bad_zip" }] },
          { "id": "next" }
        ]
      }
      """
    And I answer "zip" with "1234"
    When I ask for the next question
    Then I do not receive another question
    And the survey ended as "bad_zip"

  Scenario: Rules, context and ending survive a JSON round-trip
    Given the context is:
      """
      { "role": "manager" }
      """
    And I answer "age" with "12"
    And I ask for the next question
    When the whole survey is saved to JSON and restored
    Then the survey ended as "too_young"
    And the context role is "manager"
    And question "age" still has 2 rules
