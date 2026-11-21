Feature: Exporting responses
  Sessions turn into one row per respondent, as data or as CSV.

  Background:
    Given an export definition:
      """
      {
        "id": "pets",
        "version": 2,
        "questions": [
          { "id": "name", "type": "text" },
          { "id": "pets", "type": "multi", "answers": [{ "value": "cat" }, { "value": "dog" }] },
          { "id": "why", "type": "text", "rules": [{ "end": "done" }] }
        ]
      }
      """

  Scenario: Rows follow the definition's question order
    Given an exported session "s1" answering name "Ana", pets ["cat","dog"] and why "=1+1, \"really\""
    And an exported session "s2" answering name "Bo" only
    When the responses are exported
    Then the columns are "sessionId, definitionVersion, finished, ending, startedAt, completedAt, durationMs, name, pets, why"
    And row 1 has name "Ana", pets ["cat","dog"], finished true and ending "done"
    And row 1 took 6000 ms
    And row 2 has name "Bo", pets null, finished false and ending null
    And the CSV is:
      """
      sessionId,definitionVersion,finished,ending,startedAt,completedAt,durationMs,name,pets,why
      s1,2,true,done,2026-01-01T00:00:00.000Z,2026-01-01T00:00:06.000Z,6000,Ana,cat;dog,"'=1+1, ""really"""
      s2,2,false,,2026-01-01T00:00:00.000Z,,,Bo,,
      """

  Scenario: Extra columns on request
    Given an exported session "s1" answering name "Ana", pets ["cat"] and why "ok"
    When the responses are exported with timings and context
    Then the columns include "time:name, time:pets, context:source"
    And row 1 has "context:source" "ad" and "time:name" 2000
