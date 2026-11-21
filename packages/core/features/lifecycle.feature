Feature: Survey lifecycle
  A definition says whether it takes new responses: its status, an open window and a response limit.

  Scenario Outline: Availability
    Given a lifecycle definition with <settings>
    Then at "<now>" with <responses> responses it is <result>

    Examples:
      | settings                                                                  | now                  | responses | result               |
      | {}                                                                        | 2026-05-01T00:00:00Z | 0         | accepting            |
      | {"status": "draft"}                                                       | 2026-05-01T00:00:00Z | 0         | closed: draft        |
      | {"status": "closed"}                                                      | 2026-05-01T00:00:00Z | 0         | closed: closed       |
      | {"status": "open", "opensAt": "2026-06-01T00:00:00Z"}                     | 2026-05-01T00:00:00Z | 0         | closed: not_yet_open |
      | {"opensAt": "2026-06-01T00:00:00Z", "closesAt": "2026-07-01T00:00:00Z"}   | 2026-06-15T00:00:00Z | 0         | accepting            |
      | {"closesAt": "2026-07-01T00:00:00Z"}                                      | 2026-07-01T00:00:00Z | 0         | closed: past_close   |
      | {"maxResponses": 2}                                                       | 2026-05-01T00:00:00Z | 1         | accepting            |
      | {"maxResponses": 2}                                                       | 2026-05-01T00:00:00Z | 2         | closed: full         |

  Scenario: Lifecycle settings survive a round trip
    Given a lifecycle definition with {"status": "open", "opensAt": "2026-06-01T00:00:00Z", "maxResponses": 5}
    Then its JSON keeps {"status": "open", "opensAt": "2026-06-01T00:00:00Z", "maxResponses": 5}

  Scenario: Bad dates are refused
    When I make a lifecycle definition with {"closesAt": "next tuesday"}
    Then it is refused with "closesAt must be an ISO 8601 date-time"
