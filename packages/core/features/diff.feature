Feature: Definition diff
  diffDefinitions lists what changed between two versions of a survey.

  Scenario: Identical definitions have no changes
    Given definition A is {"id": "s", "questions": [{"id": "a", "answers": [{"value": 1}]}]}
    And definition B is {"id": "s", "questions": [{"id": "a", "answers": [{"value": 1}]}]}
    Then the diff is empty

  Scenario: Settings, questions and options
    Given definition A is:
      """
      {
        "id": "s", "version": 1, "title": "Old",
        "questions": [
          { "id": "a", "text": "Age?", "type": "number" },
          { "id": "b", "type": "single", "answers": [{ "value": "x", "text": "X" }, { "value": "y" }] },
          { "id": "c" }
        ]
      }
      """
    And definition B is:
      """
      {
        "id": "s", "version": 2, "title": "New",
        "questions": [
          { "id": "b", "type": "single", "answers": [{ "value": "x", "text": "Ex", "score": 1 }, { "value": "z" }] },
          { "id": "a", "text": "Your age?", "type": "number", "required": true },
          { "id": "d" }
        ]
      }
      """
    Then the diff messages are:
      """
      Changed the survey's title
      Changed the survey's version
      Removed question "c"
      Moved question "b"
      Removed option "y" from "b"
      Changed text on option "x" in "b"
      Changed score on option "x" in "b"
      Added option "z" to "b"
      Moved question "a"
      Changed the text of "a"
      Changed required on "a"
      Added question "d"
      """
