# UC-003: Find the Luggage for a Constrained Conversational Learner

## Summary

This use case defines the first version of the quest where typing becomes primary, but the scene still stays bounded and strongly supported.

The player should feel like they are genuinely speaking in the game, not filling out a worksheet.

## Persona

`Elena`, age 19, is taking Spanish in school.

She can:

- ask simple questions
- understand straightforward instructions
- produce short present-tense sentences

She still benefits from a narrow task and visible structure.

## Placement Outcome

Initial placement sets something like:

- `targetLanguage = Spanish`
- `supportLanguage = English`
- `comprehensionBand = 2`
- `productionBand = 2`
- `vocabularyBand = 2`
- `grammarBand = 2`
- `repairBand = 1`
- `confidence = medium`

## User Story

As a learner who can type simple Spanish, I want the game to let me answer and ask short questions in the target language while still giving me repair and fallback support when I need it.

## Product Goal

Introduce typed production without collapsing into open conversation or full translation scaffolding.

## What the Player Sees

The clerk says:

`Perdí mi maleta negra. ¿Puedes ayudarme?`

Unlike `UC-001` and `UC-002`, the first line is now mostly target language by default.

Elena gets a short text box.

Typing is primary now.

She also sees a visible support chip tray beneath the box:

- insert chips:
  - `¿Dónde está`
  - `la maleta`
  - `negra`
- fallback repair responses:
  - `No entiendo`
  - `¿Qué significa "__" en inglés?`

She can type directly, use the insert chips to add key words or chunks, or combine both.

For the clarification response, Elena can tap `perdí` to prefill the blank, or type the unclear word if the scene allows it.

If she types `¿Dónde está la maleta negra?`, the clerk replies:

`Está cerca de la puerta.`

The nearby door region pulses briefly.

If Elena types something off-track or says she does not understand, the scene repairs with a shorter mixed-language line or a stronger suggestion.

Example repair:

`I lost mi maleta negra. Está cerca de la puerta.`

Elena then finds and picks up the black suitcase.

When she returns, she types or selects a short final report such as:

- `Aquí está la maleta negra.`

## Interaction Model

- NPC delivery mode: scripted provider only
- player response mode: short constrained text with visible insert chips, pickup, short report
- fallback repair responses: `No entiendo` and a clarification response template
- support-language policy: moderate and mostly repair-driven
- grounding intensity: medium-high
- support level: medium
- free-form text: limited to one short idea at a time
- `sugaragent`: not required

## Evaluation Model

Evaluation remains deterministic enough for production without an LLM.

The scene should define:

- accepted intent families
- required semantic slots
- tolerances for orthography and small form errors

Example:

- `Sí, te ayudo.` counts as `offer_help`
- `¿Dónde está la maleta negra?` counts as `ask_location`
- `Aquí está la maleta negra.` counts as `report_success`

Minor mistakes may still count if the communicative goal is clear.

## Success Criteria

The experience is successful if:

- Elena types at least one original sentence
- the game can still rescue her with repair and support chips if needed
- the quest advances on communicative success, not perfect form
- `maleta negra` stays tied to the object, pickup, and return

## Engineering Acceptance Notes

- The response contract must support constrained text with optional visible insert chips plus explicit fallback repair responses.
- Evaluation must support intent-plus-slot matching with normalization.
- A typed failure should be able to degrade into stronger chip-based support without breaking immersion.
- Evidence should distinguish:
  - typed success
  - success after repair
  - success after visible suggestion use
  - task success versus language-form quality

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. Reuse the existing quest structure from `UC-001` and `UC-002`.
2. Keep the same target luggage pickup and return path.
3. Keep the same quest objective order:
   - talk
   - collect
   - talk

### Proposed Sugarlang UI: Band-Specific Authoring

1. Author the `B2 Constrained Exchange` row in the `Learner Band Matrix`.
2. In the `Repair and Support Policy Editor`, set:
   - no default translated subtitle
   - support-language repair on confusion or failure
   - visible fallback repair responses
3. In the `Response Scaffold Editor`, configure:
   - short constrained text as primary
   - insert chips as visible support
   - fallback repair responses including `No entiendo` and `¿Qué significa "__" en inglés?`
   - pickup interaction
   - short return report
4. In the `Grounding Map Editor`, bind:
   - `maleta` to the luggage object class
   - `negra` to the black luggage attribute
   - `puerta` to the nearby door region
5. In the `Grounded Quest Binding Editor`, bind the black suitcase through pickup and return.
6. In the `Evaluation Rules Editor`, author accepted intent families, slot requirements, and tolerances.
7. In `Placement Preview`, verify that typing is primary but help is still readily available.

### AI-Assisted Authoring Path

Expected workflow:

1. Keep the English-authored quest as the source content.
2. Ask the AI assistant:
   - `generate the B2 Spanish Sugarlang draft for Find the Luggage with constrained text, visible insert chips, fallback repair responses for No entiendo and ¿Qué significa "__" en inglés?, let the clarification response prefill from perdí, and a stable maleta negra pickup and return loop`
3. Let the assistant write the response contract, grounding, grounded binding, repair variants, and deterministic evaluation rules.
4. Review or refine in chat or in the editor.

## Why This Use Case Matters

This is the first band where the player really feels like they are speaking in the game while still staying inside a deterministic product contract.
