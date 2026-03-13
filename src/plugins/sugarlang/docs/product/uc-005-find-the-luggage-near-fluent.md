# UC-005: Find the Luggage for a Near-Fluent Player

## Summary

This use case defines the quest for a player who is close to fluent and should experience the scenario as a natural interaction rather than an obviously instructional sequence.

Support still exists.

It is just quiet.

## Persona

`Sofia`, age 29, is an advanced learner who can function comfortably in Spanish and wants the game to feel natural.

She can:

- handle descriptive detail
- infer missing information
- ask follow-up questions naturally
- report back with precise language

She does not want visible tutorial scaffolding.

## Placement Outcome

Initial placement sets something like:

- `targetLanguage = Spanish`
- `supportLanguage = English`
- `comprehensionBand = 4`
- `productionBand = 4`
- `vocabularyBand = 4`
- `grammarBand = 4`
- `repairBand = 3`
- `confidence = high`

## User Story

As a near-fluent player, I want the quest to feel like a believable in-world conversation while still preserving optional help and a trackable learning model.

## Product Goal

Offer the least intrusive learning surface while preserving:

- the same quest semantics
- provider-independent learner evidence
- the same grounded pickup and return loop
- optional fallback to scripted delivery

## What the Player Sees

The clerk opens with a richer description:

`Creo que alguien movió mi equipaje cuando anunciaron el cambio de andén. Era una maleta de cuero bastante gastada, con una cinta verde en el asa.`

By default, Sofia sees no translation and no visible chip tray.

The scene itself carries most of the meaning through:

- the station context
- the announcement board
- the worn leather suitcase
- the green ribbon

Sofia responds naturally.

Examples:

- `¿La dejaron cerca del mostrador de información?`
- `Voy a buscarla.`
- `Encontré la maleta. Estaba junto a la puerta lateral.`

If she wants support, she can ask for clarification or reveal one detail.

If she fails repeatedly, the product can still surface stronger repair, but only as a quiet fallback.

She finds, picks up, and returns the suitcase.

## Two Supported Delivery Modes

### Mode A: Scripted-Only

The scene uses authored advanced variants and bounded open text.

Evaluation remains deterministic at the task and slot level.

### Mode B: Scripted + SugarAgent

The game may optionally delegate selected turns to `sugaragent`.

`Sugarlang` still owns:

- pedagogical policy
- evidence collection
- response expectations
- post-turn evaluation
- fallback support behavior

## Interaction Model

- NPC delivery mode: scripted-only or optional `sugaragent`
- player response mode: open text within a bounded quest scene
- support-language policy: minimal, mostly on demand
- grounding intensity: naturalistic and world-first
- support level: low
- explicit correction: off by default
- chips: hidden by default, reserved for explicit fallback or help

## Evaluation Model

The core quest should still be completable without LLM grading.

The system should continue to evaluate:

- task success
- required semantic content
- correct object identification
- pickup success
- return success

If `sugaragent` is enabled, it changes turn realization quality.

It should not become the sole source of correctness.

## Success Criteria

The experience is successful if:

- Sofia feels she is having a mostly natural interaction
- the quest remains fully completable with `sugaragent` disabled
- optional support remains available but not foregrounded
- the grounded quest loop still carries the teaching referent through to completion

## Engineering Acceptance Notes

- Advanced-band scenes must support both provider configurations:
  - scripted-only
  - `sugaragent`-assisted
- Learner evidence must be comparable across both modes.
- If `sugaragent` is unavailable, the user must still get a coherent advanced scripted experience.
- Fallback support surfaces must exist, but they should not dominate the UI.

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. Reuse the same quest structure and suitcase setup as the lower-band use cases.
2. In `NPCs`, set the clerk interaction mode according to the shipped profile:
   - `scripted` for fully deterministic deployment
   - `hybrid` or `agent` only if the game explicitly enables `sugaragent`
3. In `Dialogues`, author richer advanced variants for the clerk description and completion beats.
4. Keep the pickup and return objectives identical to the lower bands.

### Proposed Sugarlang UI: Band-Specific Authoring

1. Author the `B4 Natural Interaction` row in the `Learner Band Matrix`.
2. In the `Repair and Support Policy Editor`, set:
   - no default translation
   - low-friction clarification
   - hidden fallback chip scaffolds or stronger help only after failure
3. In the `Response Scaffold Editor`, set:
   - open text as primary
   - no visible chip tray by default
4. In the `Grounding Map Editor`, bind:
   - `andén` to the platform context
   - `de cuero` and `gastada` to the suitcase appearance
   - `puerta lateral` to the return-location region
5. In the `Grounded Quest Binding Editor`, keep the advanced target suitcase bound through pickup and return.
6. In the `Evaluation Rules Editor`, define scene success intents and required slots.
7. In the `Provider Policy` subsection, choose one of:
   - `scripted-only`
   - `provider-optional`
   - `prefer-sugaragent-if-enabled`
8. In `Placement Preview`, test both advanced scripted mode and advanced `sugaragent` mode.

### AI-Assisted Authoring Path

Expected workflow:

1. Keep the English quest and advanced scene intent as the source content.
2. Ask the AI assistant:
   - `generate the B4 Spanish Sugarlang draft for Find the Luggage, keep support quiet, keep fallback hidden unless needed, and preserve the grounded pickup and return loop`
3. Let the assistant produce both the advanced scripted overlay and the optional provider policy for `sugaragent`.
4. Review or refine in chat or in the editor.

## Why This Use Case Matters

This use case proves the long-term relationship the product is aiming for:

`sugarlang` owns the learning system, and optional AI only enriches the conversation layer.
