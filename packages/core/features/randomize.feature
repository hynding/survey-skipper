Feature: Randomized order
  Options and section questions can be shuffled. Each session keeps its own order, saved with its seed.

  Background:
    Given a randomized definition:
      """
      {
        "id": "brands",
        "sections": { "ratings": { "randomize": true } },
        "questions": [
          { "id": "pick", "type": "single", "randomize": true, "answers": [
            { "value": "a" }, { "value": "b" }, { "value": "c" }, { "value": "d" }, { "value": "e" },
            { "value": "none", "fixed": true }, { "value": "other", "isCustom": true }
          ], "rules": [{ "if": { "==": [{ "var": "answer" }, "none"] }, "goTo": "r1" }] },
          { "id": "why", "type": "text" },
          { "id": "r1", "section": "ratings", "type": "rating" },
          { "id": "r2", "section": "ratings", "type": "rating" },
          { "id": "r3", "section": "ratings", "type": "rating" },
          { "id": "r4", "section": "ratings", "type": "rating" },
          { "id": "end", "type": "text" }
        ]
      }
      """

  Scenario: Options are shuffled, with fixed and custom options kept in place
    Given 20 randomized sessions
    Then every session shows "none" 6th and "other" 7th
    And the sessions don't all show the options in the same order

  Scenario: The order survives saving and restoring
    Given a randomized session with seed 7
    When it is saved and restored
    Then it shows the same option order
    And it asks the same section order

  Scenario: A section's questions are asked in the session's order, all of them, once
    Given 20 randomized sessions
    Then every session asks r1, r2, r3 and r4 exactly once between "why" and "end"
    And the sessions don't all ask the section in the same order

  Scenario: A rule that goes to a randomized section enters it at its shuffled start
    Given 20 randomized sessions
    Then every session that answers "none" goes straight to its section's first question

  Scenario: A page holds the whole section in its order
    Given a randomized session with seed 3
    When it answers "a" and "because"
    Then its page is the section in its order
