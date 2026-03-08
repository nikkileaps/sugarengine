# UC-001: Find the Luggage for an Absolute Beginner

## Summary

This use case defines the `Find the Luggage` quest for a player placed at the earliest beginner level.

This player should succeed through:

- mixed native-language and target-language scaffolding
- visual grounding
- recognition
- single-word comprehension
- guided response selection

This use case must not depend on free-form text or `sugaragent`.

## Persona

`Mia`, age 24, just started learning Spanish.

She knows:

- a few greetings
- a few colors
- a few concrete nouns

She is not yet comfortable typing sentences in Spanish.

## Placement Outcome

Initial placement sets something like:

- `targetLanguage = Spanish`
- `comprehensionBand = 1`
- `productionBand = 0`
- `vocabularyBand = 1`
- `grammarBand = 0`
- `repairBand = 0`
- `confidence = low`

Derived reporting label may be `early A1`, but runtime behavior should use the richer learner state above.

## User Story

As an absolute beginner, I want to complete the first quest using very simple Spanish, some native-language support, and strong visual grounding, so that I feel capable instead of overwhelmed.

## Product Goal

Prove that the player can complete the first story task without:

- unrestricted typing
- grammar-heavy output
- open conversation

The player should leave the quest feeling:

- "I understood enough to help"
- "I learned a few useful words"
- "I can keep going"

## What the Player Sees

The quest begins when Mia approaches the station manager.

The manager says:

`¿Ves la maleta roja?`

Below the line, the game shows a support strip:

`Find the red maleta.`

The words `maleta` and `roja` are highlighted, and the scene shows three visible bags. One of them is clearly red.

If Mia taps:

- `maleta`, all luggage objects pulse briefly
- `roja`, the red suitcase gets a stronger outline

The player sees two large response buttons:

- `Sí`
- `No`

After choosing `Sí`, the clerk continues:

`Bien. Toca la maleta roja.`

The support strip updates to:

`Tap the maleta roja.`

If needed, the player can press:

- `Repetir`
- `Mostrar pista`
- `Traducir`

If she presses `Mostrar pista`, the camera centers the correct suitcase and briefly labels it `maleta roja`.

After the player clicks the correct luggage object in the world, the clerk asks for one last recognition step:

`La ____ es roja.`

Options:

- `maleta`
- `puerta`
- `mesa`

After choosing `maleta`, the quest completes with a short confirmation:

`Gracias. Aquí está la maleta.`

## Interaction Model

- NPC delivery mode: scripted provider only
- player response mode: choice buttons and one blank with a word bank
- support-language policy: high mixed-language support with protected target-language keywords
- grounding intensity: maximum
- support level: maximum
- correction mode: implicit only
- free-form text: disabled
- `sugaragent`: disabled or ignored

## Evaluation Model

Evaluation is strictly deterministic.

Accepted behaviors:

- choosing `Sí` to confirm recognition
- clicking the correct world object
- choosing `maleta` in the blank

No LLM is required for either turn production or turn evaluation.

The engine and `sugarlang` only need:

- object identity
- authored accepted choices
- authored blank answers

## Success Criteria

The experience is successful if:

- Mia completes the quest without typing any Spanish
- she sees at least one reinforced vocabulary item (`maleta`)
- she is not forced into a failure loop after one wrong click
- `sugarlang` records evidence showing recognition success and heavy support usage

## Engineering Acceptance Notes

- Placement in this band must select the highest-support quest variant.
- The response contract must be renderable using the existing dialogue UI plus simple support affordances.
- A wrong object click should trigger a gentle retry, not a hard failure.
- Learner evidence should record:
  - support-language scaffold usage
  - support usage
  - grounding aid usage
  - recognition accuracy
  - completion latency proxy
  - vocabulary exposure for `maleta` and `roja`

## Designer Setup in SugarEngine

### Existing UI: Base Quest Skeleton

1. In `Dialogues`, create a dialogue named `Find the Luggage - Clerk`.
2. Add nodes for:
   - greeting
   - luggage prompt
   - confirmation
   - completion
3. In `Quests`, create a quest named `Find the Luggage`.
4. Add objectives:
   - `talk` to the clerk
   - inspect or click the luggage object
   - `talk` to the clerk again for completion
5. In `NPCs`, assign the clerk to the quest dialogue.
6. In `Regions`, place three luggage objects and mark one as the target object.
7. In `Episode Details`, set this quest as the main quest for the tutorial episode.

### Proposed Sugarlang UI: Band-Specific Authoring

1. Open the first `talk` objective and attach a `Sugarlang Scenario`.
2. Set the scenario semantic task to:
   - `identify_target_luggage`
3. In the `Learner Band Matrix`, add an `early beginner` row.
4. In the `Support-Language Policy Editor`, configure:
   - a support strip in the native language
   - protected target-language tokens `maleta` and `roja`
   - translation available on request
5. In the `Grounding Map Editor`, bind:
   - `maleta` to the luggage objects
   - `roja` to the red color attribute on `luggage_red_01`
   - `maleta roja` to the target suitcase hint focus action
6. In the `Response Contract Editor`, configure:
   - turn 1: binary choice
   - turn 2: world-object selection
   - turn 3: single blank with a three-word bank
7. In the `Evaluation Rules Editor`, define:
   - accepted choice `Sí`
   - accepted object id `luggage_red_01`
   - accepted blank answer `maleta`
8. In `Support and Feedback`, enable:
   - repeat
   - hint
   - optional translation
9. In `Placement Preview`, preview the quest as `comprehensionBand=1, productionBand=0`.

### AI-Assisted Authoring Path

This use case should also be creatable without opening the Sugarlang UI first.

Expected workflow:

1. Author the English quest and dialogue as normal SugarEngine content.
2. Ask the AI assistant:
   - `generate the absolute beginner Spanish Sugarlang draft for the clerk scene in Find the Luggage with English support-language scaffolding and visible bindings for maleta and roja`
3. Let the assistant write the scenario draft, grounding map, beginner-band response contracts, and deterministic evaluation rules under `plugins/sugarlang/`.
4. Review or refine the result in chat or in the editor.

## Why This Use Case Matters

This use case proves the architecture can deliver a true language-learning quest without:

- LLM generation
- free-form player text
- plugin coupling to `sugaragent`

It is the clearest demonstration that `sugarlang` stands on its own.
