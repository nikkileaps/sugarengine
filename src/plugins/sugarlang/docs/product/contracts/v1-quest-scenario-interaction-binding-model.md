# V1 Quest, Scenario, Interaction, and Binding Model

## Purpose

This document defines the plain-English domain model for how Sugarlang sits on top of normal SugarEngine quest content.

It answers:

- what a `quest`, `scenario`, `interaction`, and `turn` actually are
- how Sugarlang binds back to quest nodes, dialogue beats, NPCs, and world objects
- what `Sync From Quest` should derive
- how runtime uses those bindings to advance the quest without replacing the quest system

This is a product and architecture contract.

It is not a code schema.

## Core Rule

SugarEngine remains the source of truth for the game.

Sugarlang is the language-learning overlay for that same game.

The plain domain model is:

- `Quest`
  - the normal SugarEngine progression graph
- `Scenario`
  - the Sugarlang overlay for one quest
- `Interaction`
  - one learner-facing communicative beat inside that scenario
- `Turn`
  - one exchange inside an interaction

The important ownership rule is:

- one quest may have one Sugarlang scenario
- one scenario may have many interactions
- bands change how an interaction is rendered
- bands do not create separate quests or separate stories

## Plain-English Entity Definitions

### Quest

The engine-owned graph.

It owns:

- quest stages
- quest nodes
- objective gates
- dialogue attachment
- world-state transitions
- pickups, inventory, and return loops

Sugarlang should not duplicate or replace any of that.

### Scenario

The Sugarlang overlay for one quest.

It owns:

- the association to the quest
- supported target and support language pairs
- stable grounded referents that matter across the quest
- the set of derived interactions for that quest
- scenario-level quest bindings

The scenario is not one band.

The scenario is not one line of dialogue.

The scenario is the quest-sized Sugarlang wrapper.

### Interaction

One learner-facing communicative beat inside the scenario.

An interaction is the Sugarlang-sized unit that corresponds to something like:

- greet the station manager
- ask for help
- describe the missing suitcase
- inspect the clue
- return the recovered item

An interaction may bind to one or more:

- quest nodes
- dialogue beats
- NPCs
- world objects or regions

Not every quest node becomes an interaction.

Pure condition gates or invisible plumbing nodes usually stay quest-only.

### Turn

One exchange inside an interaction.

Examples:

- NPC initial line
- learner reply opportunity
- repair line
- confirmation line

Turns belong inside an interaction.

They do not replace the quest node structure.

## Source Bindings

Each interaction should bind back to the authored game content it came from.

At minimum, an interaction should be able to name:

- the quest it belongs to
- the source quest node or nodes it was derived from
- the source dialogue beat or beats it was derived from
- the involved NPC or NPCs
- the involved world object, region, pickup, or inventory identity

That is how Sugarlang stays tied to the real authored narrative instead of becoming a detached lesson system.

## Grounding and Quest Binding

Sugarlang needs two different but related binding layers.

### Grounding link

A grounding link says:

- this vocabulary entry points to this world object, region, or visible attribute

Example:

- `maleta` -> the red suitcase on the platform
- `roja` -> the suitcase's red color

### Quest binding

A quest binding says:

- this grounded referent stays the same quest-critical thing through the quest loop

That binding may connect:

1. world object
2. learner-facing action
3. pickup identity
4. inventory identity
5. return or completion step

Example:

- the same suitcase described by the station manager
- the same suitcase the player picks up
- the same suitcase shown in inventory
- the same suitcase returned to complete the objective

Interactions should reuse those stable bindings instead of creating new referents every time the player talks to someone.

## Lexicon Relationship

The lexicon is separate from the quest graph.

It owns the shared vocabulary entries for one target language.

Interactions do not own their own long-term dictionaries.

Instead:

- the scenario and its interactions pull from the shared lexicon
- interactions assign current roles like `focus`, `reinforcement`, and `ambient`
- runtime uses those roles when rendering and evaluating the interaction

See [V1 Lexicon and Interaction Curriculum Model](./v1-lexicon-and-scene-curriculum-model.md).
See [V1 Cumulative Banded Lexicon Contract](./v1-cumulative-banded-lexicon-contract.md).

## Sync From Quest

`Sync From Quest` should be the primary derive or regenerate action for V1.

Its job is not to hand-author every band.

Its job is to read the normal authored quest content and derive the Sugarlang overlay from it.

At a high level it should:

1. read the selected quest and traverse its graph
2. find the quest beats that are real learner-facing communicative steps
3. derive or update the scenario's interactions from those beats
4. bind each interaction back to quest nodes, dialogue beats, NPCs, and world objects
5. derive or update stable quest bindings for the grounded referents
6. look up reusable vocabulary in the shared lexicon
7. flag or draft missing shared vocabulary entries
8. generate or refresh the interaction overlays for each supported target language and learner band

This means the normal authoring order stays:

1. author the quest in SugarEngine
2. sync the Sugarlang overlay from that quest
3. review and refine the generated overlay

### Talk objectives with dialogue

For a bounded `Talk` objective with attached English dialogue, the first pass should be concrete.

If the authored beat is something like:

- `Hello. My name is Bippity. I am the Station Master.`

then `Sync From Quest` should be able to:

1. derive turns
2. look up the needed shared vocabulary entries
3. assign `focus`, `reinforcement`, and `ambient` by band
4. generate one persisted banded turn bundle per band

That bundle should not contain only translated NPC text.

It should also contain:

- the response contract
- the visible response scaffold
- the repair ladder
- the evaluation target
- the quest-success hook

This is what makes the result playable and reviewable immediately.

Later human or optional LLM passes may improve line phrasing, jokes, or idiomatic wording, but they should usually work as surface polish over the already-persisted interaction bundle instead of replacing the binding model underneath.

See [Deterministic Banded Turn Generation](../../api/deterministic-banded-turn-generation.md).

## Runtime Resolution

At runtime the engine should not ask, "Which band-specific interaction variant should I run?"

It should ask:

1. what quest is active
2. which Sugarlang scenario is associated with that quest
3. which interaction in that scenario matches the current quest state and NPC or world context
4. how should that interaction be rendered for this learner's target language and band

The runtime flow should therefore be:

1. resolve active quest state
2. resolve scenario for that quest
3. resolve active interaction inside that scenario
4. load the correct target-language interaction overlay
5. choose the current band variant
6. render the turns, support posture, repair path, and grounding help
7. evaluate the learner response
8. if successful, emit the allowed quest-completion recommendation back to the engine

The engine still owns final quest progression.

Sugarlang recommends.

The engine validates and applies.

## Product Rules

### 1. Scenario association stays at the quest level

Sugarlang should not require separate top-level scenarios for every objective or node.

The smaller unit inside the scenario is the interaction.

### 2. Not every quest node becomes an interaction

Only learner-facing communicative beats should become interactions.

Condition gates and invisible plumbing should stay in the quest system.

### 3. Bands are render modes, not separate quest truth

The same interaction can render differently at `B0` and `B4`.

That does not make them different quest steps.

### 4. Quest completion remains engine-owned

Sugarlang may recommend that an interaction success should complete or advance a quest step.

The engine still applies the actual deterministic progression.

### 5. English-authored dialogue is source material, not sacred output

The English dialogue beat is the narrative source that Sugarlang derives from.

It does not have to be the final learner-facing line shown at every band in every target language.

## Review Questions

For any Sugarlang-enabled quest, product review should be able to answer:

- which quest the scenario belongs to
- which interactions were derived from that quest
- which quest nodes and dialogue beats each interaction came from
- which world objects and grounded referents each interaction cares about
- which stable quest bindings carry those referents through pickup, inventory, and return
- how interaction success feeds back into quest progression

If those answers are not clear, the Sugarlang overlay model is not concrete enough.
