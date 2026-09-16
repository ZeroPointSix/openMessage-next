Feature: Bidirectional message round trip
  Scenario: A and B exchange messages in one interaction
    Given two enabled HTTP endpoints A and B
    When A sends "hello from A" to B
    And B replies "hello from B" to A in the same interaction
    Then B receives A's message and A receives B's reply over HTTP
    And the interaction lists both messages in order
    And both messages can be read back with their exact content
