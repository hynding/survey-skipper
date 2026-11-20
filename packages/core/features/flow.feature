Feature: Events, piped text and pages

  Background:
    Given a definition:
      """
      {
        "questions": [
          { "id": "q1", "section": "about", "text": "Hi {{context.name}}, do you drive?",
            "rules": [{ "if": { "==": [{ "var": "answer" }, "skip"] }, "goTo": "q4" }] },
          { "id": "make", "section": "about", "text": "What make?",
            "showIf": { "==": [{ "var": "answers.q1" }, "yes"] } },
          { "id": "q3", "section": "about", "text": "How long have you owned your {{answers.make}}?" },
          { "id": "q4", "section": "commute", "text": "You picked {{answers.q5}}.",
            "type": "number", "validation": { "max": 10 } },
          { "id": "q5", "section": "commute" }
        ]
      }
      """
    And a session for "alice" on the definition

  Scenario: Listeners hear answers, moves and completion
    Given "alice" records events
    When "alice" answers "yes"
    And "alice" asks for the next question
    And "alice" goes back
    Then the recorded events are "answer q1, navigate q1>make, back make>q1"

  Scenario: Completion is announced with the ending
    Given "alice" records events
    And "alice" is on question "q5"
    When "alice" asks for the next question
    Then the recorded events are "navigate q5>end, complete"

  Scenario: Rejected answers are announced
    Given "alice" records events
    And "alice" is on question "q4"
    When "alice" answers "q4" with JSON 99
    Then the recorded events are "invalid q4"

  Scenario: A removed listener hears nothing
    Given "alice" records events
    And events stop being recorded
    When "alice" answers "yes"
    Then the recorded events are ""

  Scenario: Question text fills in answers and context
    Given "alice" has the context:
      """
      { "name": "Ada" }
      """
    And "alice" answers "make" with JSON "Volvo"
    Then the text of "q1" for "alice" is "Hi Ada, do you drive?"
    And the text of "q3" for "alice" is "How long have you owned your Volvo?"

  Scenario: Lists are joined and missing values are blank
    Given "alice" sets "q5" to the list "cat,dog"
    Then the text of "q4" for "alice" is "You picked cat, dog."
    And the text of "q3" for "alice" is "How long have you owned your ?"

  Scenario: A page holds the shown questions of one section
    Then the page for "alice" is "q1, q3"

  Scenario: Answers inside a page change what it holds
    When "alice" answers "yes"
    Then the page for "alice" is "q1, make, q3"

  Scenario: A rule that leaves the section ends the page early
    When "alice" answers "skip"
    Then the page for "alice" is "q1"

  Scenario: Moving to the next page and back
    Given "alice" answers "yes"
    And "alice" answers "make" with JSON "Volvo"
    And "alice" answers "q3" with JSON "3 years"
    When "alice" moves to the next page
    Then the page for "alice" is "q4, q5"
    And going back takes "alice" to "q1"
