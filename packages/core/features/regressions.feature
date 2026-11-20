Feature: Regressions found in code review

  Scenario: Ask for several questions at once
    Given a 5 question survey of yes or no answers
    And I answer question 1 with yes
    When I ask for the next 3 questions
    Then I am returned questions 2 through 4

  Scenario: Ask for several questions near the end of the survey
    Given a 3 question survey of yes or no answers
    And I answer question 1 with yes
    When I ask for the next 5 questions
    Then I am returned questions 2 through 3

  Scenario: Answer several questions at once, and the last answer's mapping applies
    Given a 5 question survey of yes or no answers
    And question 3 answer yes maps to question 5
    And I answer question 1 with yes
    And I ask for the next 2 questions
    When I answer those questions with yes
    And I ask for the next question
    Then I am returned question 5

  Scenario: Mapping an empty answer is rejected
    Given a 2 question survey of yes or no answers
    When I map an empty answer on question 1 to question 2
    Then an error is raised matching "invalid for mapping"

  Scenario: Mapping to a question outside the survey is rejected
    Given a 2 question survey of yes or no answers
    When I map question 1 answer yes to a question outside the survey
    Then an error is raised matching "not part of this survey"

  Scenario: A stored mapping to an unknown question falls back to the next question
    Given a 3 question survey of yes or no answers where question 1 answer yes maps to "nope"
    And I answer question 1 with yes
    When I ask for the next question
    Then I am returned question 2

  Scenario: Pre-answered questions that route in a loop end the survey instead of overflowing
    Given a 3 question survey of yes or no answers
    And question 1 answer yes maps to question 2
    And question 2 answer yes maps to question 1
    And I pre-answer question 2 with yes
    And I answer question 1 with yes
    When I ask for the next question
    Then I do not receive another question

  Scenario: A question id of 0 can be looked up
    Given a survey whose question ids are numbers starting at 0
    When I go to question id 0
    Then the current question id is 0

  Scenario: A question without an id is rejected
    When I create a question without an id
    Then an error is raised matching "requires an id"

  Scenario: A survey restored from JSON keeps working
    Given a 3 question survey of yes or no answers
    And question 1 answer yes maps to question 3
    And I answer question 1 with yes
    When the survey is saved to JSON and restored
    And I ask for the next question
    Then I am returned question 3
