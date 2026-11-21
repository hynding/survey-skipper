Feature: Carry-forward options
  A choice question can build its options from what the respondent picked, or didn't pick, earlier.

  Background:
    Given a carry-forward definition:
      """
      {
        "id": "streaming",
        "questions": [
          { "id": "uses", "type": "multi", "answers": [
            { "value": "netflix", "text": "Netflix" }, { "value": "hulu", "text": "Hulu" },
            { "value": "disney", "text": "Disney+" }, { "value": "other", "isCustom": true }
          ] },
          { "id": "favorite", "type": "single", "answersFrom": { "question": "uses" } },
          { "id": "consider", "type": "multi", "answersFrom": { "question": "uses", "include": "unselected" },
            "answers": [{ "value": "none", "text": "None of these", "fixed": true }] },
          { "id": "done" }
        ]
      }
      """

  Scenario: Picked options carry forward
    Given a carry-forward session that picked ["netflix","disney"]
    Then the options for "favorite" are "netflix, disney"
    And the options for "consider" are "hulu, none"
    And answering "favorite" with "hulu" fails with "option"
    And answering "favorite" with "disney" succeeds

  Scenario: A question with nothing to carry forward is skipped, even with its own options
    Given a carry-forward session that picked ["netflix","hulu","disney"]
    When it answers "favorite" with "hulu" and moves on
    Then the carry-forward session is on "done"

  Scenario: Nothing picked means no favorite question
    Given a carry-forward session that picked ["other-thing"]
    Then moving on from "uses" reaches "consider"

  Scenario: Lint knows carried questions have options
    Then linting the carry-forward definition finds no problems
