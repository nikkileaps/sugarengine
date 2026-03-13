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
  - `sí`
  - `te ayudo`
  - `la maleta`

She can type directly, use the insert chips to add key words or chunks, or combine both.

At first exposure, the stronger repair controls are not yet visible.

If Elena fails once, the scene reveals stronger repair controls such as:

- `Show me more words`
- `Say it more simply`

`Show me more words` expands the insert tray with more useful chunks such as:

- `¿Dónde está`
- `negra`
- `cerca de`
- `la puerta`

`Say it more simply` keeps the line in Spanish, but rephrases it closer to `B1` support.

If Elena fails again, both repair actions stay available with stronger outputs.

If Elena fails a third time, the scene adds a final rescue:

- `Say it in English`

In the general product contract, that final label must be dynamic from `supportLanguage`.

Clarification can still exist at `B2`. Elena can tap `perdí` to prefill a clarification response, or type the unclear word because typed interaction now exists at this band.

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
- player response mode: short constrained text with a small visible insert tray, pickup, short report
- fallback repair controls:
  - first and second failure: `Show me more words`, `Say it more simply`
  - third failure: add `Say it in {supportLanguage}`
  - clarification may also be available when the scene authors it
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
- the game can still rescue her with a staged repair ladder and expanded insert support if needed
- the quest advances on communicative success, not perfect form
- `maleta negra` stays tied to the object, pickup, and return

## Engineering Acceptance Notes

- The response contract must support constrained text with a small visible insert tray plus a staged repair ladder that can be revealed and strengthened after failure.
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
   - failure-triggered repair ladder
3. In the `Response Scaffold Editor`, configure:
   - short constrained text as primary
   - a small visible insert tray on first exposure
   - `Show me more words` to expand the tray after failure
   - `Say it more simply` to rephrase in the target language at a lower band expression level
   - `Say it in {supportLanguage}` as the final rescue step
   - repair controls hidden on first exposure and revealed after failure
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
   - `generate the B2 Spanish Sugarlang draft for Find the Luggage with constrained text, a small visible insert tray on first exposure, Show me more words and Say it more simply after first failure, Say it in English as the third-failure rescue, optional clarification prefilling from perdí, and a stable maleta negra pickup and return loop`
3. Let the assistant write the response contract, grounding, grounded binding, repair variants, and deterministic evaluation rules.
4. Review or refine in chat or in the editor.

## Why This Use Case Matters

This is the first band where the player really feels like they are speaking in the game while still staying inside a deterministic product contract.
