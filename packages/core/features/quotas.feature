Feature: Quotas
  A survey can cap how many completed responses match a condition. Respondents who land in a full quota are
  finished with the quota's ending, and don't count toward any quota themselves.

  Background:
    Given a quota definition:
      """
      {
        "id": "panel",
        "quotas": [
          { "id": "young", "if": { "<": [{ "var": "answers.age" }, 30] }, "limit": 2, "end": "young_full" },
          { "id": "mobile", "if": { "==": [{ "var": "context.device" }, "mobile"] }, "limit": 1 }
        ],
        "questions": [
          { "id": "age", "type": "number" },
          { "id": "q2" },
          { "id": "q3" }
        ]
      }
      """

  Scenario: Completed sessions are counted per quota
    Given finished quota sessions with ages 20, 25, 40 on "desktop"
    And an unfinished quota session aged 22
    Then the quota counts are {"young": 2, "mobile": 0}
    And the quota status of "young" is 2 of 2, full

  Scenario: A respondent who lands in a full quota is screened out
    Given finished quota sessions with ages 20, 25 on "desktop"
    When a new respondent on "desktop" answers age 21
    Then the respondent is finished with ending "young_full"
    When a new respondent on "desktop" answers age 50
    Then the respondent is on "q2"

  Scenario: Screened-out respondents don't count
    Given finished quota sessions with ages 20, 25 on "desktop"
    When a new respondent on "desktop" answers age 21
    And the quotas are counted again including that respondent
    Then the quota counts are {"young": 2, "mobile": 0}

  Scenario: Context quotas can screen out before the first question
    Given finished quota sessions with ages 40 on "mobile"
    When a new respondent on "mobile" is checked against quotas
    Then the respondent is finished with ending "over_quota"

  Scenario: Without counts, quotas are not enforced
    When a respondent without quota counts answers age 21
    Then the respondent is on "q2"

  Scenario: Lint checks quotas
    Then linting a definition with quotas [{"id": "a", "limit": -1}, {"id": "a", "limit": 1, "if": {"var": "answers.nope"}}] finds "quota-limit, duplicate-id, unknown-reference"
