# UC-002: Find the Luggage for a Guided Beginner

## Summary

This use case defines the same quest for a learner who can recognize familiar words and build short fixed phrases, but still benefits from strong scaffolding, mixed-language support, and visible world anchors.

The design goal is to move the player from pure recognition into guided production.

## Persona

`Noah`, age 31, has been using a beginner app for a few weeks.

He can:

- recognize common nouns
- understand simple present-tense requests
- assemble short phrases from prompts

He is still not comfortable writing unconstrained sentences.

## Placement Outcome

Initial placement sets something like:

- `comprehensionBand = 1`
- `productionBand = 1`
- `vocabularyBand = 1`
- `grammarBand = 1`
- `repairBand = 0`
- `confidence = low_to_medium`

Derived reporting label may be `late A1 / early A2`.

## User Story

As a beginner who can produce a little language, I want the game to ask me for short, guided Spanish responses so I can start speaking without getting stuck.

## Product Goal

Require more output than UC-001, but keep every turn bounded enough to evaluate without an LLM.

## What the Player Sees

The station clerk opens with:

`Necesito la maleta azul.`

A support strip appears below:

`You need the blue maleta.`

Then:

`¿Dónde está?`

If Noah taps `maleta`, the luggage objects pulse.

If he taps `azul`, the blue suitcase is outlined.

Instead of open typing, Noah sees a word bank and a sentence frame:

`La maleta está _____.`

Word chips:

- `aquí`
- `allí`
- `grande`

After selecting the correct location word, the clerk gives a second guided production turn:

`Escribe una frase corta: "Aquí está la maleta."`

The UI presents the phrase as reorderable chips first, then a short confirm button.

If Noah struggles, he can ask for:

- `Repetir`
- `Más fácil`
- `Pista`

## Interaction Model

- NPC delivery mode: scripted provider only
- player response mode: word bank, blank fill, short fixed-phrase assembly
- support-language policy: medium-high mixed-language support in prompts and hints
- grounding intensity: high
- support level: high
- free-form text: disabled
- `sugaragent`: not required

## Evaluation Model

Evaluation remains deterministic.

Accepted behavior types:

- correct chip selection for location
- valid assembly of the fixed phrase
- allowed exact variants if the designer enables them

This can be implemented with:

- answer set matching
- ordered token checking
- optional alternate accepted sequences

No LLM is required.

## Success Criteria

The experience is successful if:

- Noah produces at least one guided Spanish sentence
- he succeeds with bounded assistance
- the system records that he can move beyond recognition into phrase construction
- the quest still feels like narrative play, not a worksheet

## Engineering Acceptance Notes

- This band must unlock phrase assembly without unlocking unconstrained typing.
- The response contract must support word-bank ordering.
- The evaluation layer must accept minor authored permutations without enabling open-text ambiguity.
- Evidence should record:
  - response accuracy
  - support-language scaffold usage
  - grounding aid usage
  - number of hint requests
  - whether production required retries

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. Reuse the same `Find the Luggage` quest, dialogue, NPC, and region setup as UC-001.
2. Keep the same quest semantics and target luggage object.
3. Keep the same deterministic quest completion path.

### Proposed Sugarlang UI: Band-Specific Authoring

1. In the same `Sugarlang Scenario`, add a `guided beginner` learner-band row.
2. Set the turn goal to:
   - recognize luggage description
   - produce a short location phrase
3. In the `Support-Language Policy Editor`, configure:
   - an English support strip with protected target-language tokens
   - translation not shown by default, but available via hint or simplify
4. In the `Grounding Map Editor`, bind:
   - `maleta` to the luggage objects
   - `azul` to the blue luggage color property
   - location cues to the relevant region or object marker
5. In the `Response Contract Editor`, configure:
   - turn 1: blank with word chips
   - turn 2: phrase assembly from a fixed token set
6. In the `Evaluation Rules Editor`, define:
   - accepted location tokens
   - accepted phrase token order
   - optional alternates if you allow `Aquí está la maleta azul`
7. In `Support and Feedback`, enable:
   - repeat
   - simplify
   - hint
   - no explicit grammar explanation
8. In `Placement Preview`, verify the player sees guided production rather than simple recognition.

### AI-Assisted Authoring Path

Expected workflow:

1. Reuse the same English-authored quest and dialogue scene.
2. Ask the AI assistant:
   - `generate the guided beginner Spanish Sugarlang draft for Find the Luggage with English support strips and grounding for maleta, azul, and the target location`
3. Let the assistant add or update the guided beginner learner-band row, support-language policy, grounding map, word-bank response contracts, and deterministic phrase-assembly rules.
4. Review or refine the generated draft in chat or in the editor.

## Why This Use Case Matters

This use case is the bridge between tutorial recognition and real output.

It proves `sugarlang` can progressively raise production demands while staying fully deterministic and fully compatible with the scripted quest stack.
