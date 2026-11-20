Feature: Going back through a survey
  A respondent can step back to earlier questions and change their mind.
  Answers left behind on a route they no longer take are kept aside, or discarded if the survey says so.

  Scenario: There is nothing to go back to at the start
    Given a 2 question survey of yes or no answers
    When I go back
    Then I am not moved
    And the current question is question 1

  Scenario: Go back to the previous question
    Given a 3 question survey of yes or no answers
    And I answer question 1 with yes
    And I ask for the next question
    When I go back
    Then I am returned question 1
    And question 1 is still answered yes

  Scenario: Going back and forward again asks answered questions instead of skipping them
    Given a 3 question survey of yes or no answers
    And I answer question 1 with yes
    And I ask for the next question
    And I answer question 2 with yes
    And I ask for the next question
    And I go back
    And I go back
    When I ask for the next question
    Then I am returned question 2
    And question 2 is still answered yes
    And when I ask for the next question I am returned question 3

  Scenario: Taking a different route keeps the left-behind answers aside
    Given a 3 question survey of yes or no answers
    And question 1 answer yes maps to question 3
    And I answer question 1 with no
    And I ask for the next question
    And I answer question 2 with yes
    And I ask for the next question
    And I go back
    And I go back
    And I answer question 1 with yes
    When I ask for the next question
    Then I am returned question 3
    And question 2 has an abandoned answer of yes
    And question 2 has no active answer
    And the path is questions 1, 3

  Scenario: Taking a different route can discard the left-behind answers
    Given a 3 question survey of yes or no answers that discards abandoned answers
    And question 1 answer yes maps to question 3
    And I answer question 1 with no
    And I ask for the next question
    And I answer question 2 with yes
    And I ask for the next question
    And I go back
    And I go back
    And I answer question 1 with yes
    When I ask for the next question
    Then I am returned question 3
    And question 2 has no abandoned answer
    And question 2 has no active answer

  Scenario: Returning to an abandoned question asks it again
    Given a 3 question survey of yes or no answers
    And question 1 answer yes maps to question 3
    And I answer question 1 with no
    And I ask for the next question
    And I answer question 2 with yes
    And I ask for the next question
    And I go back
    And I go back
    And I answer question 1 with yes
    And I ask for the next question
    And I go back
    And I answer question 1 with no
    When I ask for the next question
    Then I am returned question 2
    And when I answer question 2 with no it has no abandoned answer

  Scenario: Going back from the end of the survey
    Given a 2 question survey of yes or no answers
    And I answer question 1 with yes
    And I ask for the next question
    And I answer question 2 with yes
    And I ask for the next question
    When I go back
    Then I am returned question 2

  Scenario: Navigation survives a JSON round-trip
    Given a 3 question survey of yes or no answers
    And question 1 answer yes maps to question 3
    And I answer question 1 with no
    And I ask for the next question
    And I answer question 2 with yes
    And I ask for the next question
    And I go back
    And I go back
    And I answer question 1 with yes
    And I ask for the next question
    When the survey and its navigation are saved to JSON and restored
    And I go back
    Then I am returned question 1
    And question 2 has an abandoned answer of yes
