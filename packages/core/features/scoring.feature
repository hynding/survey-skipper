Feature: Scoring
  Answer options can carry points. Sessions add them up, rules and text can use the total, and aggregate reports it.

  Background:
    Given a scored definition:
      """
      {
        "id": "quiz",
        "questions": [
          { "id": "capital", "section": "geo", "type": "single", "answers": [
            { "value": "paris", "score": 2 }, { "value": "lyon", "score": 0 }
          ] },
          { "id": "rivers", "section": "geo", "type": "multi", "answers": [
            { "value": "seine", "score": 1 }, { "value": "loire", "score": 1 }, { "value": "thames", "score": -1 }
          ] },
          { "id": "guess", "type": "single", "answers": [
            { "value": "a", "score": 1 }, { "value": "other", "isCustom": true, "score": 0.5 }
          ], "rules": [{ "if": { ">=": [{ "var": "score" }, 4] }, "end": "pass" }] },
          { "id": "retry", "text": "You scored {{score}} ({{scores.geo}} on geography). Try again?" }
        ]
      }
      """

  Scenario: Picked options add up, in total and by section
    Given a scored session answering capital "paris", rivers ["seine","thames"] and guess "a"
    Then its score is 3 with sections {"geo": 2}
    And it is on "retry" with text "You scored 3 (2 on geography). Try again?"

  Scenario: Rules can use the score
    Given a scored session answering capital "paris", rivers ["seine","loire"] and guess "a"
    Then its score is 5 with sections {"geo": 4}
    And it finished with ending "pass"

  Scenario: Custom answers score their custom option
    Given a scored session answering capital "lyon", rivers ["thames"] and guess "something else"
    Then its score is -0.5 with sections {"geo": -1}

  Scenario: Aggregate reports score totals of completed sessions
    Given a scored session answering capital "paris", rivers ["seine","loire"] and guess "a"
    And a scored session answering capital "lyon", rivers ["thames"] and guess "something else"
    When the scored sessions are aggregated with the definition
    Then the score stats are {"count": 1, "mean": 5, "min": 5, "max": 5, "distribution": {"5": 1}}
