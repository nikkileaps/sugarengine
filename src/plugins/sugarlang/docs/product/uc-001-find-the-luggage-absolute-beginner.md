# UC-001: Find the Luggage for an Absolute Beginner

## Summary

This use case defines `Find the Luggage` for the earliest beginner band.

The player should succeed through:

- scene context
- strong grounding
- repair-driven mixed-language help
- chip-built responses
- a real quest action loop

This use case must not depend on free typing or `sugaragent`.

## Persona

`Mia`, age 24, just started learning Spanish.

She knows:

- a few greetings
- a few concrete nouns
- a few colors

She is not comfortable typing Spanish.

## Placement Outcome

Initial placement sets something like:

- `targetLanguage = Spanish`
- `supportLanguage = English`
- `comprehensionBand = 1`
- `productionBand = 0`
- `vocabularyBand = 1`
- `grammarBand = 0`
- `repairBand = 0`
- `confidence = low`

Derived reporting label may be `pre-A1 / early A1`, but runtime behavior should use the richer learner state above.

## User Story

As an absolute beginner, I want to complete the first quest by using context, repair, and guided mixed-language responses, so that I feel immersed instead of graded.

## Product Goal

Prove that the player can complete a real quest loop without:

- unrestricted typing
- grammar-heavy output
- default translated subtitles
- open conversation

The player should leave feeling:

- `I understood enough to help.`
- `I learned a real word tied to a real object.`
- `I can keep going.`

## What the Player Sees

Mia approaches the station clerk.

The clerk says:

`Do you see la maleta roja?`

There is no always-visible translated strip under the line.

The scene itself already helps:

- three suitcases are visible
- one is clearly red

Mia sees a response builder with chips such as:

- response-building chips:
  - `Sí`
  - `I see`
  - `la`
  - `maleta`
  - `roja`
- fallback repair responses:
  - `No entiendo`
  - `Señálalo`
  - `¿Qué significa "__" en inglés?`

For the clarification response, Mia can either:

- tap `maleta` or `roja` in the NPC line to prefill the blank

This band is tap-only.

As Mia taps chips, the UI shows the response she is building.

Example built responses:

- `Sí, I see la maleta roja.`

If Mia uses the clarification repair response `¿Qué significa "maleta" en inglés?`, the clerk then repairs in mixed language:

`Suitcase. La maleta roja.`

At the same time:

- all suitcases pulse lightly
- the red suitcase gets a stronger outline

If Mia uses the repair response `Señálalo`, the same target suitcase is highlighted more strongly.

Mia then collects the correct suitcase and places it in her inventory.

- inventory or held state shows `maleta roja`

When Mia returns to the clerk, she gets one final guided response builder that produces:

- `Here is la maleta roja.`

The clerk replies:

`Gracias.`

The quest completes.

## Interaction Model

- NPC delivery mode: scripted provider only
- player response mode: chip composition, object click, pickup, chip-built return response
- fallback repair responses: `No entiendo`, `Señálalo`, and a clarification response template
- clarification entry: tap-only
- support-language policy: heavy in the initial line, repair, and response scaffold, but not as a translated subtitle strip
- grounding intensity: maximum
- support level: maximum
- correction mode: implicit only
- free-form text: disabled
- `sugaragent`: disabled or ignored

## Evaluation Model

Evaluation is strictly deterministic.

Accepted behaviors:

- building a correct chip-composed response
- using a valid repair response
- clicking the correct world object
- completing the pickup
- building the completion response

No LLM is required for turn production or evaluation.

The engine and `sugarlang` only need:

- authored chip sets
- authored repair responses
- object identity
- pickup success
- authored completion options

## Success Criteria

The experience is successful if:

- Mia completes the quest without typing Spanish
- she uses or sees `maleta` tied to the actual suitcase
- repair feels like part of the conversation, not detached UI translation
- the word `maleta` recurs in chip-built responses, object interaction, and return
- one wrong choice does not trap her

## Engineering Acceptance Notes

- Placement in this band must select the highest-support scene variant.
- Chips should be selectable tokens or very short chunks that let the player build a meaningful response, not be treated as the full response themselves.
- The same suitcase identity must flow through:
  - NPC description
  - world click
  - pickup state
  - return step
- The `B0` line and the happy-path response should both be visibly mixed-language, with active Spanish words preserved inside English support framing.
- A wrong click should trigger gentle repair, not hard failure.
- Learner evidence should record:
  - repair usage
  - support-language usage
  - grounding aid usage
  - recognition accuracy
  - pickup success
  - vocabulary exposure and reuse for `maleta` and `roja`

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. In `Dialogues`, create `Find the Luggage - Clerk`.
2. In `Quests`, create `Find the Luggage`.
3. Add objectives:
   - `talk` to the clerk
   - locate and `collect` the target suitcase
   - `talk` to the clerk again to return it
4. In `Regions`, place three suitcase objects and make the red suitcase pickup-enabled.
5. Ensure the pickup maps to a real inventory item and the return step consumes or validates that item.
6. In `NPCs`, assign the clerk to the quest dialogue.

### Proposed Sugarlang UI: Band-Specific Authoring

1. Attach a `Sugarlang Scenario` to the first clerk interaction.
2. Set the scenario semantic task to:
   - `identify_and_return_target_luggage`
3. In the `Learner Band Matrix`, author the `B0 Anchored Recognition` row.
4. In the `Repair and Support Policy Editor`, enable:
   - mastery-aware mixed initial delivery
   - mixed-language repair
   - point/highlight repair
   - repeat
5. In the `Response Scaffold Editor`, set:
   - primary response mode: chip composition
   - fallback repair responses: `No entiendo`, `Señálalo`, and `¿Qué significa "__" en inglés?`
   - clarification response should prefill from `maleta` or `roja` in the NPC line
   - grounded action: object click + pickup
   - completion response: one guided chip-built return response
6. In the `Grounding Map Editor`, bind:
   - `maleta` to the suitcase objects
   - `roja` to the red suitcase attribute
7. In the `Grounded Quest Binding Editor`, bind the same referent across:
   - red suitcase object
   - pickup
   - inventory label
   - return objective
8. In the `Evaluation Rules Editor`, define accepted chip sets and chip-built responses, accepted fallback repair responses, accepted object id, pickup success, and accepted return response.
9. In `Placement Preview`, verify the scene feels like an in-world beginner interaction, not a subtitle exercise.

### AI-Assisted Authoring Path

Expected workflow:

1. Author the English quest and the real suitcase pickup/return loop.
2. Ask the AI assistant:
   - `generate the B0 Spanish Sugarlang draft for Find the Luggage; keep it immersive, make the initial NPC line and the happy-path response heavily mixed English+Spanish, preserve maleta and roja in Spanish, make chip composition primary, add fallback repair responses for No entiendo, Señálalo, and ¿Qué significa "__" en inglés?, let the clarification response prefill from maleta or roja, and bind maleta to the red suitcase pickup and return`
3. Let the assistant write the scenario, grounding, grounded binding, beginner-band chip sets, fallback repair responses, clarification templates, and deterministic evaluation rules.
4. Review or refine in chat or in the editor.

## Why This Use Case Matters

This use case proves that the first quest can feel like a real game task while still being accessible to a true beginner.

It is the clearest proof that `sugarlang` is not just a translated dialogue overlay.
