Feature: The skipped operator
  Rules can ask whether a question was routed past without being asked.

  Background:
    Given a skipping definition:
      """
      {
        "id": "jobs",
        "questions": [
          { "id": "employed", "type": "boolean" },
          { "id": "employer", "type": "text", "showIf": { "==": [{ "var": "answers.employed" }, true] } },
          { "id": "income", "type": "number",
            "rules": [{ "if": { "skipped": "employer" }, "end": "no_employer" }] },
          { "id": "end" }
        ]
      }
      """

  Scenario: A hidden question counts as skipped
    When a skipping respondent answers employed false and income 10
    Then the skipping respondent skipped "employer"
    And the skipping respondent finished with "no_employer"

  Scenario: An asked question does not
    When a skipping respondent answers employed true, employer "Acme" and income 10
    Then the skipping respondent skipped nothing
    And the skipping respondent is on "end"

  Scenario: Going back before the skip forgets it
    When a skipping respondent answers employed false and goes back
    Then the skipping respondent skipped nothing
    When the skipping respondent changes employed to true
    Then the skipping respondent is on "employer"

  Scenario: Lint checks skipped references
    Then linting the definition {"questions": [{"id": "a", "rules": [{"if": {"skipped": "zzz"}, "end": "x"}]}]} finds "unknown-reference"
