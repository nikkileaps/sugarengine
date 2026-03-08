# UC-002: Find the Luggage for a Guided Beginner

## Summary

This use case defines the same quest for a learner who can recognize familiar words and build short fixed phrases with help.

The player should still feel immersed in a real quest, but should now produce short language chunks rather than only recognize them.

## Persona

`Noah`, age 31, has been using beginner Spanish apps for a few weeks.

He can:

- recognize common nouns
- understand simple requests
- assemble short phrases from prompts

He still does not want unconstrained typing.

## Placement Outcome

Initial placement sets something like:

- `targetLanguage = Spanish`
- `supportLanguage = English`
- `comprehensionBand = 1`
- `productionBand = 1`
- `vocabularyBand = 1`
- `grammarBand = 1`
- `repairBand = 0`
- `confidence = low_to_medium`

## User Story

As a guided beginner, I want to build short quest-relevant phrases with visible support, so that I start producing the language while still feeling grounded in the scene.

## Product Goal

Raise production demands beyond `UC-001` while keeping the experience:

- deterministic
- grounded
- immersive
- free of worksheet-style translation strips

## What the Player Sees

The clerk says:

`Necesito la maleta azul. Can you show me where it is?`

Noah sees the blue suitcase among the luggage in the scene.

He sees response scaffolds:

- a guided response frame with blanks
- a short word bank
- a location frame
- fallback repair responses:
  - `No entiendo`
  - `Señálala`
  - `¿Qué significa "__" en inglés?`

For the clarification response, Noah can tap `necesito` or `azul` to prefill the blank.

This band is still tap-only.

Example response frame:

- `La maleta ____ está ____ .`

Example word bank:

- `azul`
- `roja`
- `allí`
- `aquí`

Noah fills the blanks from the word bank.

Example completed response:

- `La maleta azul está allí.`

At `B1`, the support can stay in the prompt and the scaffold while the completed response is already fully Spanish if that sounds more natural.

If Noah asks for repair, the clerk narrows the line:

`La maleta azul. It's over there.`

The relevant region or suitcase pulses.

After Noah identifies the right suitcase, he picks it up.

The item in inventory stays labeled as the same referent.

When he returns to the clerk, the UI asks him to complete a guided handoff phrase.

Example:

- `Aquí está la maleta azul.`

## Interaction Model

- NPC delivery mode: scripted provider only
- player response mode: word bank, blank fill, guided assembly, pickup, return assembly
- fallback repair responses: `No entiendo`, `Señálala`, and a clarification response template
- clarification entry: tap-only
- support-language policy: mixed in the initial line, repair, and scaffold, but narrower than `B0`; support is stronger in repair than in later happy-path turns
- grounding intensity: high
- support level: high
- free-form text: disabled
- `sugaragent`: not required

## Evaluation Model

Evaluation remains deterministic.

Accepted behavior types:

- correct blank fill from the word bank
- correct guided assembly
- valid fallback repair response if used
- correct pickup
- correct guided return phrase

No LLM is required.

## Success Criteria

The experience is successful if:

- Noah produces at least one short quest-relevant phrase
- the scene recycles `maleta` and `azul` through response, pickup, and return
- repair helps him stay in the scene instead of dumping a translation beneath every line
- the quest still feels like narrative play

## Engineering Acceptance Notes

- This band must unlock phrase building without unlocking unconstrained typing.
- The main response surface should now be blank-fill with a bounded word bank, not `B0`-style chip composition.
- Word-bank distractors should be plausible scene-grounded alternatives, such as the wrong visible suitcase color or the wrong visible location cue.
- The `B1` line and scaffold should still be mixed-language, but with more Spanish carry-through than `B0`.
- Mixed-language lines should read like a believable helper utterance, not token-spliced UI text.
- Pickup and inventory state must stay aligned with the same taught referent.
- Evidence should record:
  - response accuracy
  - repair usage
  - support-language usage
  - grounding aid usage
  - pickup success
  - whether production required retries

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. Reuse the same `Find the Luggage` quest, dialogue, NPC, and region setup as `UC-001`.
2. Keep the same pickup and return path.
3. Keep the same deterministic quest completion rules.

### Proposed Sugarlang UI: Band-Specific Authoring

1. In the same `Sugarlang Scenario`, author the `B1 Guided Response` row.
2. Set the turn goals to:
   - understand a suitcase description
   - produce a short location phrase
   - return the item with a guided phrase
3. In the `Repair and Support Policy Editor`, configure:
   - mastery-aware mixed initial delivery with more Spanish carry-through than `B0`
   - natural-sounding mixed utterances only
   - mixed-language repair
   - repeat
   - simplify
   - stronger point/highlight on failure
4. In the `Response Scaffold Editor`, configure:
   - turn 1: guided location frame with one or more blanks
   - a short word bank with plausible scene-grounded distractors
   - fallback repair responses: `No entiendo`, `Señálala`, and `¿Qué significa "__" en inglés?`
   - clarification response should prefill from `necesito` or `azul` in the NPC line
   - turn 2: pickup interaction
   - turn 3: guided return phrase
5. In the `Grounding Map Editor`, bind:
   - `maleta` to the luggage objects
   - `azul` to the blue luggage attribute
   - location cues to the relevant region
6. In the `Grounded Quest Binding Editor`, keep the suitcase binding intact through pickup and return.
7. In the `Evaluation Rules Editor`, define accepted phrase patterns and guided assembly outcomes.
   - treat the word bank as a bounded candidate pool, not a chip-composition tray
8. In `Placement Preview`, verify that the player is producing more language than in `B0`, but is still visibly supported.

### AI-Assisted Authoring Path

Expected workflow:

1. Reuse the same English-authored quest and object loop.
2. Ask the AI assistant:
   - `generate the B1 Spanish Sugarlang draft for Find the Luggage with a guided blank-fill response frame, a short word bank with scene-grounded distractors, an initial NPC line that is mixed but more Spanish-forward than B0 and still sounds like a believable helper utterance, fallback repair responses for No entiendo, Señálala, and ¿Qué significa "__" en inglés?, clarification prefilling from necesito or azul, and a stable maleta azul binding through pickup and return`
3. Let the assistant add or update the `B1` variant, repair policy, grounding, grounded binding, and deterministic phrase rules.
4. Review or refine in chat or in the editor.

## Why This Use Case Matters

This use case is the bridge from recognition to guided production.

It proves that Sugarlang can ask for more language without dropping the immersive quest structure.
