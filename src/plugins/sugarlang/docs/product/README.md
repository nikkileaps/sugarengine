# Sugarlang Product Use Cases

## Purpose

This directory defines the canonical product story for `sugarlang`.

These docs should let product, design, engineering, and AI-assisted authoring all answer the same question:

What are we actually building?

The answer is not "a translation strip over a game."

The answer is:

- an immersive language-learning game
- where the player learns through quest context, grounded world meaning, and conversational repair
- where mixed target/support language is used deliberately and fades as the learner grows
- where `sugaragent` is optional, not required

## Source Documents

- [Sugarlang Strategic Architecture](../architecture/sugarlang-strategic-architecture.md)
- [Sugarlang AI-Assisted Authoring Workflow](./authoring-workflow.md)

Historical research context:

- [Language Learning Product Roadmap](../research/LANGUAGE_LEARNING_PRODUCT_ROADMAP.md)

## V1 Pedagogical Contract Docs

- [V1 Learner Band Matrix](./contracts/v1-learner-band-matrix.md)
- [V1 Language Content Model](./contracts/v1-language-content-model.md)
- [V1 Authoring Artifact Model](./contracts/v1-authoring-artifact-model.md)
- [V1 Grounded Quest Binding Model](./contracts/v1-grounded-quest-binding-model.md)
- [V1 Golden Slice: Find the Luggage](./contracts/v1-find-the-luggage-golden-slice.md)

These concrete use cases are written primarily from the `English support -> Spanish target` perspective because that is the main learner-testing path.

The same band and contract model must also support the opposite `Spanish support -> English target` pairing.

## Shared Quest Definition

All five use cases are different learner-facing realizations of the same quest:

- quest name: `Find the Luggage`
- setting: a train station or port terminal
- narrative objective: help an NPC identify and recover a missing piece of luggage
- core quest steps:
  1. talk to the station clerk or traveler
  2. understand the luggage description
  3. identify or ask about the luggage location
  4. locate and interact with the correct luggage in the world
  5. pick it up or otherwise complete the authored recovery action
  6. return and confirm completion

What changes across bands is not the quest truth.

What changes is:

- how much mixed support language is present in the initial line, repair, and happy-path responses
- which target-language words stay visible while support language carries the rest
- how strongly the scene and UI ground meaning
- how much productive language the player is asked for
- when chips, hints, and fallback scaffolds appear
- how strictly language form is evaluated versus communicative success

## What Makes Sugarlang Different

Sugarlang should not model language learning as:

- show target sentence
- show translation
- ask worksheet-style question

It should model language learning as:

- hear or read something in the target language
- try to understand through context
- signal confusion when needed
- receive repair through simpler phrasing, mixed support language, and grounded scene help
- act in the world
- re-encounter the same vocabulary in meaningful quest actions

That is the core product difference.

## Working Terms

These docs use the following terms in a strict way:

- `chip`
  - a selectable token or very short chunk
  - used to compose a response or insert target-language material into a response
- `word bank`
  - a bounded pool of candidate words or short chunks used to fill one or more authored blanks
  - may include plausible scene-grounded distractors, not just correct answers
- `response`
  - the utterance or action the player actually submits
- `response mode`
  - the way the response is produced, such as object selection, chip composition, word-bank blank fill, guided assembly, constrained text, open text, or a hybrid
- `response scaffold`
  - the UI support around the response mode, such as chips, word banks, blanks, hints, or insertion helpers
- `repair response`
  - a fallback response option available alongside the primary response mode
  - may be a fixed response such as `No entiendo` or `Señálalo`
  - may be a templated clarification response rendered in the target language, such as Spanish-target `¿Qué significa "__" en inglés?`
  - the support-language name inside that utterance should also be localized to the target language, such as `inglés` or `español`
  - in tap-only bands, the blank should be prefilled from the NPC line
  - manual clarification entry should appear only once typed interaction is introduced

Chips are not full responses.

## Four Core Product Levers

### 1. Repair-Driven Immersion

Every band should support repair.

The player should be able to signal things like:

- `I don't understand.`
- `Say it more simply.`
- `What does that mean?`
- `Point to it.`
- `Use my language.`

The exact surface form changes by band, but the product principle stays the same:

- target language comes first when appropriate
- repair is available when needed
- repair is delivered in-world, not as a detached classroom explanation

### 2. Mastery-Aware Mixed Language

Sugarlang should not default to full-line translation strips.

Instead, it should mix the target language and support language according to what the learner is expected to know.

If `maleta` is an active teaching item and `roja` is already being reinforced, but `ves` is still unknown, a repair can look more like:

- `Do you see la maleta roja?`

not:

- `Find the red maleta.`

The mixed-language policy should be:

- token-aware
- band-aware
- mastery-aware
- scene-aware
- natural-sounding

Mixed-language lines should sound like believable in-world helper utterances, not arbitrary token substitution.

That means:

- switch languages at natural clause or chunk boundaries when possible
- preserve full target-language teaching units or noun phrases where they carry the learning goal
- if a mixed line sounds unnatural, keep the line natural and move more support into the scaffold or repair instead of forcing the mix

The progression should be explicit:

- `B0`: the initial line and the happy-path response may be mostly support language with 1-3 active target items held in the target language
- `B1`: the initial line is still mixed, but more target-language chunks carry through; the happy-path response may already be fully target language if that sounds more natural
- `B2`: the initial line is mostly target language; support language moves into repair, helper prompts, or insert scaffolds
- `B3`: target language is the default; mixed language appears only on failure or by request
- `B4`: target language is effectively the whole experience unless the learner explicitly asks for help

### 3. Grounded Quest Action

Words should stay attached to real game referents and actions.

If the player is learning `maleta`, that referent should remain stable across:

- the NPC description
- repair lines
- chips and typed prompts
- object highlights
- inspect or pickup actions
- inventory item labels
- return or handoff steps

The player should not just identify a word.

The player should use that word while actually completing the quest.

### 4. Lexical Recycling and Spaced Retrieval

Sugarlang should deliberately re-introduce target vocabulary over time.

That means:

- the NPC uses the word
- the repair line uses the word again
- the chip sets and response scaffolds recycle the word
- the object label or inventory label uses the word
- the completion line uses the word again

This is planned lexical recycling and spaced retrieval, not random repetition.

The product should prefer response choices like:

- `Sí, I see la maleta roja.`
- `I don't see la maleta roja.`
- `Here is la maleta.`

over empty acknowledgements like:

- `Sí`
- `No`

when the scene can support richer vocabulary reuse without overloading the learner.

## Progressive Bands Across Those Levers

| Band | Core player experience | Support-language posture | Chip role | Grounding posture |
| --- | --- | --- | --- | --- |
| `B0 Anchored Recognition` | understand through context and build a heavily mixed response around a few active target words | heavy in the initial line, repair, and response scaffold | primary response mode | always-on highlights, pointing, object anchors |
| `B1 Guided Response` | fill in short quest-relevant responses with narrower but still visible mixed delivery | still present in the initial line and scaffold, but reduced from `B0` | word-bank blank fill and guided assembly | persistent object, color, and location bindings |
| `B2 Constrained Exchange` | type one short idea after a mostly target-language prompt, with visible structured help | moderate, mostly in repair and helper prompts | visible support scaffold, no longer the only path | object and region grounding still explicit |
| `B3 Independent Task Dialogue` | handle a short exchange and ask for clarification | low by default, available on request or failure | fallback or on-request help after failed typing | reveal-based grounding tied to task needs |
| `B4 Natural Interaction` | complete the task mostly through natural dialogue | minimal, mostly on demand | hidden behind help or repair affordances | world-first and naturalistic |

## Product Rules for Chips and Other Scaffolds

Chips stay in the product.

What changes is their role.

In these docs, chips are:

- selectable tokens
- very short chunks
- used for chip composition or typed insertion help

They are not the full response by themselves.
They are not repair responses.
Repair responses are a separate fallback surface that may appear alongside chips, not inside them.

The V1 rule is:

- `B0`: chip composition is the primary response mode
- `B1`: word-bank blank fill and guided assembly become primary
- `B2`: typing becomes primary, but chips may still appear as visible support scaffolds
- `B3`: typing is primary; chip scaffolds appear after failure or when the player requests help
- `B4`: chips are hidden by default and only surfaced as explicit fallback support

This preserves the good part of the current MVP while making the progression feel more immersive.

## Product Rules for Repair

Repair should be authored as part of the conversation contract, not bolted on as generic help UI.

Typical repair responses include:

- repeat
- simplify
- support-language rephrase
- point/highlight
- glossary reveal for one item
- repair responses such as `No entiendo` or `Señálalo`
- clarification responses rendered in the target language, such as Spanish-target `¿Qué significa "__" en inglés?`
- insert chips for key target-language words or short chunks

The product should prefer repair that uses:

- the world
- the quest state
- the active vocabulary

before resorting to explicit explanation.

## Product Rules for Grounding

Grounding is not just a highlight effect.

For V1, grounding should be able to bind language to:

- world objects
- visible attributes such as color, size, or material
- regions and landmarks
- quest actions such as inspect, pick up, point to, return, or give
- inventory objects after pickup

The grounded quest binding contract is defined in [V1 Grounded Quest Binding Model](./contracts/v1-grounded-quest-binding-model.md).

## Current Authoring Baseline in SugarEngine

The current editor already gives designers the base quest skeleton:

- `Dialogues` for authored dialogue trees
- `Quests` for quest stages and objectives
- `NPCs` for default dialogue and interaction mode
- `Regions` for placing NPCs, pickups, inspectables, and landmarks
- `Episode Details` for main quest and start region

Relevant current engine behavior:

- quest-to-dialogue routing is documented in `docs/dev/quest-episode-integration.md`
- dialogue authoring behavior is documented in `docs/api/06-dialogue.md`

## English-First, AI-Assisted Authoring Model

The creator workflow remains:

1. author the game in English using normal SugarEngine tools
2. ask Sugarlang to generate the learning overlay
3. review and refine the generated overlay
4. preview the same scene across learner bands and language pairs

This generation step should be available from:

- the editor UI
- chat with an AI assistant
- CLI or automation

All three should target the same Sugarlang files and contracts.

## Runtime Language Model

The base game is authored in English.

That is not a runtime setting.

The runtime only needs to model:

- `target language`
  - the language the player is learning
- `support language`
  - the learner's scaffold language, usually their strongest or native language
  - used for scaffolding, repair, hints, and mixed-language prompts

For the initial product:

- supported target languages: English and Spanish
- supported support languages: English and Spanish
- normal player-facing pairs:
  - `supportLanguage = English`, `targetLanguage = Spanish`
  - `supportLanguage = Spanish`, `targetLanguage = English`

## Source of Truth and Storage Model

Sugarlang content should be persisted as human-readable files under the game root.

The canonical on-disk layout is defined in [ADR-SL-001](../adr/001-english-first-authoring-overlay-and-source-of-truth-model.md).

At the product level, the important split is:

- project-level plugin configuration
- scenario-owned semantic and grounding data
- scenario-owned grounded quest binding data
- shared defaults
- per-target-language learning packs
- eval artifacts
- disposable caches or indexes

SQLite is acceptable for caches and derived artifacts.

It should not be the canonical source of authored Sugarlang content.

## Proposed Sugarlang Authoring Surfaces

These use cases assume the following Sugarlang authoring surfaces exist somewhere in the shared authoring system, with the editor acting as one client of that system.

### 0. Draft Generation Actions

Purpose:

- generate or regenerate Sugarlang drafts from English-authored content
- support the same actions from editor, chat, and CLI

### 1. Sugarlang Scenario Panel

Purpose:

- bind the authored scene to a semantic learning scenario
- declare the communicative task
- declare scene-supported learner bands

### 2. Learner Band Matrix

Purpose:

- define how the same scene behaves at `B0` through `B4`
- declare response posture, repair posture, support-language posture, and success expectations by band

### 3. Repair and Support Policy Editor

Purpose:

- define what happens when the learner does not understand
- choose allowed repair responses such as repeat, simplify, support-language rephrase, pointing, `No entiendo`, `Señálalo`, and target-language clarification templates such as Spanish-target `¿Qué significa "__" en inglés?`
- decide when those repairs are primary, visible, on request, or failure-triggered

### 4. Response Scaffold Editor

Purpose:

- choose primary response modes
- choose fallback response modes
- define chips, word banks, blanks, constrained text, insert helpers, and fallback repair responses
- ensure response choices recycle active vocabulary where appropriate

### 5. Grounding Map Editor

Purpose:

- bind concepts to objects, attributes, landmarks, and regions
- bind repair responses to highlights, pointing, inspect reveals, and camera focus

### 6. Grounded Quest Binding Editor

Purpose:

- bind the same referent across world object, pickup, inventory, return, and quest progression
- ensure the learner-facing vocabulary remains attached to the real quest object throughout the loop

### 7. Placement and Preview Panel

Purpose:

- preview the same scene at different bands and language pairs
- verify that chip use, repair behavior, and grounding intensity change correctly across progression

## Product Litmus Test

If a beginner scene still feels like:

- a translated subtitle
- a worksheet
- a disconnected multiple-choice overlay

then it is not yet Sugarlang in the form these docs describe.

If it feels like:

- an in-world interaction
- with visible quest stakes
- grounded referents
- meaningful repair
- and progressive vocabulary reuse

then the product is on the right track.
