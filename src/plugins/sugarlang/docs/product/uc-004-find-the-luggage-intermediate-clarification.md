# UC-004: Find the Luggage for an Independent Intermediate Learner

## Summary

This use case defines the quest for a learner who can manage a short multi-turn interaction, ask for clarification, and recover from ambiguity.

The player should feel that the game trusts them more, but the system should still keep the quest pedagogically bounded.

## Persona

`Mateo`, age 27, uses Spanish while traveling and can manage everyday situations.

He can:

- ask follow-up questions
- describe objects and locations
- recover when he misunderstands something

He still benefits from bounded tasks and optional support.

## Placement Outcome

Initial placement sets something like:

- `comprehensionBand = 3`
- `productionBand = 3`
- `vocabularyBand = 3`
- `grammarBand = 3`
- `repairBand = 2`
- `confidence = medium_to_high`

Derived reporting label may be `B1 / low B2`.

## User Story

As an intermediate learner, I want the game to let me handle a short real interaction with mild ambiguity, so that the quest feels like authentic language use rather than a classroom drill.

## Product Goal

Require the player to:

- interpret a richer description
- optionally ask a clarifying question
- report back with a short independent response

while keeping the system testable and explainable.

## What the Player Sees

The station clerk says:

`Estoy buscando una maleta pequeña que dejé al lado del mostrador, pero ya no está allí. Tiene una cinta verde.`

By default, Mateo sees only the Spanish line.

If he requests support, the UI can reveal grounded help such as:

- `mostrador = counter`
- `cinta verde = green ribbon`

Each reveal highlights the related location or luggage feature in the scene instead of only showing more text.

Mateo can respond with one of two paths:

- ask for clarification
- act on the description directly

Example valid typed responses:

- `¿Es grande o pequeña?`
- `¿Está cerca de la puerta?`
- `Voy a buscarla.`

After locating the luggage, he reports back:

- `Encontré la maleta con la cinta verde.`
- `Está junto a la puerta.`

The UI still offers:

- `Pista`
- `Repite más simple`

but these are secondary, not primary.

## Interaction Model

- NPC delivery mode: scripted provider by default
- player response mode: short multi-turn text
- support-language policy: low by default, available on request
- grounding intensity: medium, mostly revealed through optional support
- support level: medium_to_low
- free-form text: allowed, but still scoped to the scene objective
- `sugaragent`: optional, not necessary

## Evaluation Model

Evaluation can still be deterministic if the scene semantics are authored carefully.

The system should score:

- whether Mateo asked a valid clarification question
- whether he identified the correct description features
- whether he reported successful retrieval

The system should tolerate:

- minor grammar issues
- alternate but valid location phrasing

The system should not require:

- exact sentence matching
- full LLM semantic grading

## Success Criteria

The experience is successful if:

- Mateo can complete the quest through a short, believable interaction
- the system recognizes successful clarification behavior
- the quest does not collapse into open-ended ambiguity
- support options remain available but not intrusive

## Engineering Acceptance Notes

- The semantic scene contract must support clarification as a valid learner action.
- Evaluation must support multiple authored intent paths through the same quest.
- Learner evidence should distinguish:
  - direct success
  - success after clarification
  - success after support request
- support-language reveal usage
- grounding reveal usage
- Scripted-only provider mode must remain fully functional for this band.

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. Reuse the same quest and region setup from the prior use cases.
2. Expand the clerk dialogue tree so the authored node can branch to:
   - clarification response
   - direct action confirmation
3. Keep the quest objectives deterministic:
   - talk
   - retrieve
   - talk
4. Keep the luggage identity and completion rules engine-owned.

### Proposed Sugarlang UI: Band-Specific Authoring

1. Add an `intermediate` learner-band row to the `Learner Band Matrix`.
2. Set the semantic task to require at least one of:
   - successful direct interpretation
   - valid clarification request
3. In the `Support-Language Policy Editor`, configure:
   - no always-visible translation
   - on-demand glossary reveal for difficult terms only
4. In the `Grounding Map Editor`, bind:
   - `mostrador` to the counter region
   - `cinta verde` to the distinguishing luggage feature
   - location and feature hints to contextual scene highlights
5. In the `Response Contract Editor`, configure:
   - short text with two-sentence maximum
   - optional support buttons
6. In the `Evaluation Rules Editor`, author accepted intent families:
   - `clarify_attribute`
   - `clarify_location`
   - `commit_to_search`
   - `report_success`
7. Add required semantic slots for success:
   - luggage identity
   - location or distinguishing feature
8. In `Support and Feedback`, set:
   - hints available
   - simplification available
   - recast on success with visible language errors
9. In `Placement Preview`, verify that the player experience feels like a short real conversation rather than a fixed worksheet.

### AI-Assisted Authoring Path

Expected workflow:

1. Keep the authored English scene with its clarification branch points.
2. Ask the AI assistant:
   - `generate the intermediate clarification Spanish Sugarlang draft for Find the Luggage with on-demand English glossary support and grounding for mostrador and cinta verde`
3. Let the assistant draft the accepted clarification intents, support-language policy, grounding map, and evaluation tolerances.
4. Review or refine the result in chat or in the editor.

## Why This Use Case Matters

This is the use case where `sugarlang` starts to feel like adaptive gameplay rather than adaptive prompting.

It proves the system can support realistic task-oriented dialogue while keeping evaluation deterministic and keeping `sugaragent` optional.
