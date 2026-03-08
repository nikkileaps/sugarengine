# UC-003: Find the Luggage for a Constrained Conversational Learner

## Summary

This use case defines the first version of the quest where the player types a short response, but the response is still tightly bounded by the scene.

The goal is to support typed production while keeping evaluation deterministic enough for production use without an LLM.

## Persona

`Elena`, age 19, is taking Spanish in school.

She can:

- ask simple questions
- understand straightforward instructions
- produce short present-tense sentences

She still needs the task to be narrow and predictable.

## Placement Outcome

Initial placement sets something like:

- `comprehensionBand = 2`
- `productionBand = 2`
- `vocabularyBand = 2`
- `grammarBand = 2`
- `repairBand = 1`
- `confidence = medium`

Derived reporting label may be `A2 / low B1`.

## User Story

As a learner who can type simple Spanish, I want the game to let me ask short questions and answer directly, while still telling me clearly what kind of response is expected.

## Product Goal

Introduce short typed responses without collapsing into open conversation.

## What the Player Sees

The station clerk says:

`Perdí mi maleta. Es negra. ¿Puedes ayudarme?`

Below the line, Elena sees optional scene keywords:

- `maleta = suitcase`
- `negra = black`
- `puerta = door`

If she taps one of those keywords, the related object or region in the scene highlights briefly.

Elena is offered a short response prompt:

`Escribe una frase corta para responder.`

Support text beneath the prompt says:

`Type one short Spanish sentence.`

Example valid responses:

- `Sí, te ayudo.`
- `¿Dónde está la maleta?`

If she asks where it is, the clerk answers:

`Está cerca de la puerta.`

The nearby door region briefly pulses when that line appears.

The game then asks Elena to report back with a short typed response after she finds it:

`Escribe una frase corta: la maleta + estar + aquí/allí`

This still allows typing, but the response contract is constrained to one short idea.

## Interaction Model

- NPC delivery mode: scripted provider only
- player response mode: short constrained text
- support-language policy: medium support-language use in prompts, hints, and glossary chips
- grounding intensity: medium-high
- support level: medium
- free-form text: limited to one sentence
- `sugaragent`: not required

## Evaluation Model

Evaluation should remain deterministic enough to avoid LLM dependency.

That means the authored scene must declare:

- acceptable intent classes
- required lexical slots
- optional morphology tolerances

Examples:

- `Sí, te ayudo.` counts as `offer_help`
- `¿Dónde está la maleta?` counts as `ask_location`
- `La maleta está aquí.` counts as `report_location`

Minor mistakes may still count if the communicative goal is achieved.

Example:

- `Donde esta la maleta` should still count as a successful location question

## Success Criteria

The experience is successful if:

- Elena types at least one original sentence
- the system evaluates her answer without LLM grading
- the quest advances on communicative success, not perfect orthography
- evidence records the difference between intent success and language-form weakness

## Engineering Acceptance Notes

- The response contract must support a max-length constrained text input.
- The evaluation layer must support intent-plus-slot matching.
- The system must distinguish:
  - task success
  - vocabulary success
  - grammar quality
- support-language scaffold usage
- grounding aid usage
- A misspelled but clearly interpretable question should not hard-fail the quest.

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. Reuse the existing quest structure from UC-001 and UC-002.
2. Keep the same luggage target and quest completion path.
3. In the dialogue tree, keep the clerk lines authored as regular dialogue nodes.
4. Use the existing quest objective sequence:
   - talk
   - inspect/retrieve
   - talk

### Proposed Sugarlang UI: Band-Specific Authoring

1. Add a `constrained conversation` learner-band row in the `Learner Band Matrix`.
2. In the `Support-Language Policy Editor`, set:
   - prompt copy in the support language
   - optional glossary chips for target-language scene keywords
   - no full-sentence translation by default
3. In the `Grounding Map Editor`, bind:
   - `maleta` to the luggage object class
   - `negra` to the black luggage attribute
   - `puerta` to the nearby door region
4. In the `Response Contract Editor`, set:
   - turn 1 response mode: short constrained text
   - turn 2 response mode: short constrained report
5. In the `Evaluation Rules Editor`, define accepted intent classes:
   - `offer_help`
   - `ask_location`
   - `report_location`
6. Define slot requirements:
   - `maleta`
   - location term such as `aquí`, `allí`, or authored equivalents
7. Define tolerances:
   - allow missing accent marks
   - allow punctuation omission
   - do not require perfect morphology for quest success
8. In `Support and Feedback`, enable:
   - hint on request
   - optional recast after successful but imperfect input
9. In `Placement Preview`, test that the scene stays constrained and does not become free-form chat.

### AI-Assisted Authoring Path

Expected workflow:

1. Keep the English scene and quest semantics as the source content.
2. Ask the AI assistant:
   - `generate the constrained conversation Spanish Sugarlang draft for the Find the Luggage clerk interaction with support-language glossary chips and grounding for maleta, negra, and puerta`
3. Let the assistant write the support-language policy, grounding map, constrained text response contract, accepted intent families, and deterministic slot-based evaluation rules.
4. Review or refine the result in chat or in the editor.

## Why This Use Case Matters

This is the first point where players feel like they are genuinely "speaking" in the game.

Architecturally, it is also the proof point that `sugarlang` can support typed language production without depending on `sugaragent` or an LLM judge.
