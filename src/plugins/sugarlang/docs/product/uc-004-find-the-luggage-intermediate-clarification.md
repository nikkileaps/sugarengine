# UC-004: Find the Luggage for an Independent Intermediate Learner

## Summary

This use case defines the quest for a learner who can manage a short multi-turn interaction, ask for clarification, and recover from ambiguity.

Typing is primary.

Chips are no longer primary.

They appear after failure or on request.

## Persona

`Mateo`, age 27, uses Spanish while traveling and can manage everyday situations.

He can:

- ask follow-up questions
- describe objects and locations
- recover when he misunderstands something

He still benefits from bounded tasks and optional support.

## Placement Outcome

Initial placement sets something like:

- `targetLanguage = Spanish`
- `supportLanguage = English`
- `comprehensionBand = 3`
- `productionBand = 3`
- `vocabularyBand = 3`
- `grammarBand = 3`
- `repairBand = 2`
- `confidence = medium_to_high`

## User Story

As an intermediate learner, I want the game to trust me with a short real interaction and only surface stronger scaffolds if I ask for them or actually need them.

## Product Goal

Require the player to:

- interpret a richer description
- optionally ask a clarifying question
- locate, pick up, and return the right item
- report back with a short independent response

while staying deterministic and explainable.

## What the Player Sees

The clerk says:

`Estoy buscando una maleta pequeña con una cinta verde. La dejé al lado del mostrador.`

By default, Mateo sees only the Spanish line.

He types a response such as:

- `¿Qué significa mostrador?`
- `¿Está cerca de la puerta?`
- `Voy a buscar la maleta.`

If he types something off-track or asks for help, the scene reveals stronger repair:

- one glossary reveal
- one grounded highlight
- optional fallback chip tray

Example repair:

`El mostrador, the counter there. La maleta pequeña está al lado.`

If Mateo fails again, fallback chip sets can appear:

- `¿Qué significa`
- `mostrador`
- `cinta verde`
- `Voy a buscar`
- `la maleta`

Mateo then finds, picks up, and returns the correct suitcase.

He reports back with a short typed line:

- `Encontré la maleta con la cinta verde.`

## Interaction Model

- NPC delivery mode: scripted provider by default
- player response mode: short multi-turn text, pickup, short report-back
- support-language policy: low by default, stronger only on request or failure
- grounding intensity: medium and reveal-based
- support level: medium_to_low
- free-form text: allowed, but scoped to the scene objective
- `sugaragent`: optional, not necessary

## Evaluation Model

Evaluation can still be deterministic if the scene semantics are authored carefully.

The system should score:

- whether Mateo asked a valid clarification question
- whether he identified the correct feature or location
- whether he completed the pickup and report-back loop

It should tolerate:

- minor grammar issues
- alternate but valid location phrasing

It should not require:

- exact sentence matching
- default chip scaffolds always on screen
- an LLM judge

## Success Criteria

The experience is successful if:

- Mateo can complete the quest through a short believable interaction
- clarification is recognized as smart play, not failure
- chip scaffolds stay secondary and appear mainly after failure or on request
- the same referent survives description, pickup, and return

## Engineering Acceptance Notes

- The semantic scene contract must support clarification as a valid learner action.
- Evaluation must support multiple authored intent paths through the same quest.
- Fallback chip composition must be available after failed typing, but not shown as the default primary surface.
- Learner evidence should distinguish:
  - direct success
  - success after clarification
  - success after stronger fallback support
  - grounding reveal usage
  - support-language repair usage

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. Reuse the same quest and region setup from the earlier use cases.
2. Expand the clerk dialogue tree so the authored content supports clarification and report-back beats.
3. Keep the quest objectives deterministic:
   - talk
   - collect
   - talk
4. Keep the luggage identity and completion rules engine-owned.

### Proposed Sugarlang UI: Band-Specific Authoring

1. Author the `B3 Independent Task Dialogue` row in the `Learner Band Matrix`.
2. In the `Repair and Support Policy Editor`, configure:
   - no default translation
   - on-request clarification
   - fallback chip composition only after failure or explicit help
3. In the `Response Scaffold Editor`, configure:
   - short multi-turn text as primary
   - pickup interaction
   - short typed report-back
4. In the `Grounding Map Editor`, bind:
   - `mostrador` to the counter region
   - `cinta verde` to the distinguishing suitcase feature
5. In the `Grounded Quest Binding Editor`, bind the feature-bearing suitcase through pickup and return.
6. In the `Evaluation Rules Editor`, author accepted clarification intents, success slots, and fallback triggers.
7. In `Placement Preview`, verify that the scene feels like a short real interaction with backup support, not a scaffold-first exercise.

### AI-Assisted Authoring Path

Expected workflow:

1. Keep the authored English scene with its clarification beats.
2. Ask the AI assistant:
   - `generate the B3 Spanish Sugarlang draft for Find the Luggage; make typing primary, keep fallback chip composition only after failure, and bind the green-ribbon suitcase through pickup and return`
3. Let the assistant draft the repair policy, fallback chip sets, grounding, grounded binding, and evaluation tolerances.
4. Review or refine in chat or in the editor.

## Why This Use Case Matters

This is the point where Sugarlang should start to feel like adaptive gameplay rather than a visibly scaffolded lesson.
