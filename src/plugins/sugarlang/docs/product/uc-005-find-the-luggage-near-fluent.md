# UC-005: Find the Luggage for a Near-Fluent Player

## Summary

This use case defines the quest for a player who is close to fluent and should experience the scenario as a natural conversation rather than a heavily scaffolded exercise.

This is the band where optional `sugaragent` integration starts to add real product value, but it must still remain optional.

## Persona

`Sofia`, age 29, is an advanced learner who can function comfortably in Spanish and wants the game to feel natural.

She can:

- handle descriptive detail
- infer missing information
- ask follow-up questions naturally
- report back with precise language

She does not want excessive scaffolding.

## Placement Outcome

Initial placement sets something like:

- `comprehensionBand = 4`
- `productionBand = 4`
- `vocabularyBand = 4`
- `grammarBand = 4`
- `repairBand = 3`
- `confidence = high`

Derived reporting label may be `high B2 / C1`.

## User Story

As a near-fluent player, I want the first quest to feel like a believable in-world interaction, so that the game respects my ability while still tracking my learning progress.

## Product Goal

Offer the least intrusive learning surface while preserving:

- the same quest semantics
- provider-independent learner evidence
- optional fallback to fully scripted delivery

## What the Player Sees

The clerk opens with a richer description:

`Creo que alguien movió mi equipaje cuando anunciaron el cambio de andén. Era una maleta de cuero bastante gastada, con una cinta verde en el asa.`

By default, Sofia does not see a translation.

The scene itself provides most of the meaning through context:

- the station announcement board
- the worn leather suitcase
- the green ribbon on the handle

If she wants support, she can ask for clarification or reveal a translation of one detail, but that support is secondary.

Sofia can respond naturally.

Examples:

- `¿La dejaron cerca del mostrador de información?`
- `Voy a buscarla. Si la encuentro, vuelvo enseguida.`
- `Encontré la maleta. Estaba junto a la puerta lateral.`

The UI does not foreground hints, but still allows:

- `Pedir aclaración`
- `Repetir más simple`

### Two Supported Delivery Modes

#### Mode A: Scripted-Only

The scene uses authored advanced variants and open text prompts.

Evaluation remains deterministic at the task and slot level.

#### Mode B: Scripted + SugarAgent

The scene delegates selected turns to the optional `sugaragent` provider.

`Sugarlang` still owns:

- pedagogical policy
- evidence collection
- response-mode expectations
- post-turn evaluation

## Interaction Model

- NPC delivery mode: scripted-only or optional `sugaragent`
- player response mode: open text within a scene objective
- support-language policy: minimal, mostly on demand
- grounding intensity: naturalistic and world-first
- support level: low
- explicit correction: off by default
- `sugaragent`: optional enhancement, never required for quest support

## Evaluation Model

The core quest should still be completable without LLM grading.

That means the system should continue to evaluate:

- task success
- required semantic content
- location reporting
- object identification

If `sugaragent` is enabled, it only changes turn realization quality.

It should not become the sole source of evaluation truth.

## Success Criteria

The experience is successful if:

- Sofia feels she is having a mostly natural interaction
- the quest remains fully completable with `sugaragent` disabled
- `sugaragent`, when enabled, improves conversational richness rather than system correctness
- `sugarlang` still records stable learner evidence either way

## Engineering Acceptance Notes

- Advanced-band scenes must support both provider configurations:
  - scripted-only
  - `sugaragent`-assisted
- The learner evidence pipeline must be the same in both modes.
- The provider swap must not change quest semantics or deterministic completion rules.
- If `sugaragent` is unavailable, the user must still get a coherent advanced scripted experience.
- On-demand support-language usage and contextual grounding usage should still be observable even when rare.

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. Reuse the same quest structure and luggage object setup as the lower-band use cases.
2. In `NPCs`, set the clerk interaction mode according to the shipped game profile:
   - `scripted` for fully deterministic deployment
   - `hybrid` or `agent` only if the game explicitly enables `sugaragent`
3. In `Dialogues`, author richer advanced variants for the clerk's description and completion lines.
4. Keep the quest objectives and completion logic identical to lower bands.

### Proposed Sugarlang UI: Band-Specific Authoring

1. Add an `advanced` learner-band row to the `Learner Band Matrix`.
2. In the `Support-Language Policy Editor`, set:
   - no default translation
   - optional clarification and translation of the last detail only
3. In the `Grounding Map Editor`, bind:
   - `andén` to the platform or announcement context
   - `cinta verde` to the suitcase feature
   - `puerta lateral` or equivalent report-back terms to the correct region
4. Set support level to low and response mode to open text.
5. In the `Evaluation Rules Editor`, define:
   - the scene success intents
   - required luggage-identification slots
   - acceptable report-back intents
6. In `Support and Feedback`, disable visible correction by default, but leave clarification tools available.
7. In the `Provider Policy` subsection of the scenario, choose one of:
   - `scripted-only`
   - `provider-optional`
   - `prefer-sugaragent-if-enabled`
8. In `Placement Preview`, test both:
   - advanced scripted mode
   - advanced `sugaragent` mode

### AI-Assisted Authoring Path

Expected workflow:

1. Keep the English quest and advanced scene intent as the source content.
2. Ask the AI assistant:
   - `generate the advanced Spanish Sugarlang draft for Find the Luggage, prefer SugarAgent if enabled, and keep support-language help on demand only`
3. Let the assistant produce both:
   - the advanced scripted learner-band overlay
   - the provider-policy settings for optional `sugaragent` turns
   - the grounding map for the richer luggage description
4. Review or refine the result in chat or in the editor.

## Why This Use Case Matters

This use case proves the architecture's most important long-term claim:

`sugarlang` owns the learning system, and `sugaragent` is only an optional conversation provider.

That is the final-state relationship the production architecture is designed to support.
