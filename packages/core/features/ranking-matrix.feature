Feature: Ranking and matrix questions

  Background:
    Given a ranking and matrix definition:
      """
      {
        "id": "prefs",
        "questions": [
          { "id": "rank", "type": "ranking", "answers": [{ "value": "price" }, { "value": "speed" }, { "value": "support" }] },
          { "id": "top2", "type": "ranking", "validation": { "maxSelected": 2 },
            "answers": [{ "value": "a" }, { "value": "b" }, { "value": "c" }] },
          { "id": "grid", "type": "matrix", "required": true,
            "rows": [{ "value": "food", "text": "Food" }, { "value": "service", "text": "Service" }],
            "answers": [{ "value": 1, "text": "Bad" }, { "value": 2, "text": "OK" }, { "value": 3, "text": "Great" }],
            "rules": [{ "if": { "==": [{ "var": "answers.grid.food" }, 1] }, "end": "unhappy" }] },
          { "id": "end" }
        ]
      }
      """

  Scenario Outline: Ranking answers
    Then answering "<question>" with <value> gives "<result>"

    Examples:
      | question | value                         | result      |
      | rank     | ["speed","price","support"]   | ok          |
      | rank     | ["speed","price"]             | minSelected |
      | rank     | ["speed","speed","price"]     | duplicate   |
      | rank     | ["speed","price","cost"]      | option      |
      | rank     | "speed"                       | type        |
      | top2     | ["c","a"]                     | ok          |
      | top2     | ["c","a","b"]                 | maxSelected |

  Scenario Outline: Matrix answers
    Then answering "grid" with <value> gives "<result>"

    Examples:
      | value                          | result   |
      | {"food": 3, "service": 2}      | ok       |
      | {"food": 3}                    | required |
      | {"food": 3, "price": 2}        | option   |
      | {"food": 4, "service": 2}      | option   |
      | [3, 2]                         | type     |

  Scenario: Rules read matrix rows
    Given a ranking and matrix session that ranks and rates {"food": 1, "service": 3}
    Then the ranking and matrix session ended with "unhappy"

  Scenario: Aggregate and export handle both
    Given a ranking and matrix session that ranks and rates {"food": 3, "service": 2}
    And a ranking and matrix session that ranks and rates {"food": 3, "service": 3}
    Then the distribution of "grid" is {"food: 3": 2, "service: 2": 1, "service: 3": 1}
    And the export has columns "rank, top2, grid:food, grid:service, end"
    And export row 1 has "grid:food" 3 and "rank" ["speed","price","support"]
