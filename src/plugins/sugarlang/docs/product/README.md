# Sugarlang Product Use Cases

## Purpose

This directory contains concrete product use cases for the `sugarlang` plugin.

These documents are meant to be useful to:

- product owners defining user-facing outcomes
- engineers implementing runtime and editor capabilities
- designers authoring content in SugarEngine
- solo creators using AI assistance from chat, CLI, or editor workflows

Each use case describes the same quest, `"Find the Luggage"`, at a different learner placement level.

The point of the set is to show that:

- the narrative objective remains constant
- the language rendering changes by learner state
- the mix of target language and support language changes by learner state
- the amount and style of scene grounding changes by learner state
- the player response contract changes by learner state
- evaluation strictness and feedback behavior change by learner state
- `sugarlang` works with scripted dialogue alone
- `sugaragent` is optional and only adds value where open conversation is actually worth it

## Source Documents

- [Sugarlang Strategic Architecture](../architecture/sugarlang-strategic-architecture.md)
- [Sugarlang AI-Assisted Authoring Workflow](./authoring-workflow.md)

Historical research context:

- [Language Learning Product Roadmap](../research/LANGUAGE_LEARNING_PRODUCT_ROADMAP.md)

## V1 Pedagogical Contract Docs

- [V1 Learner Band Matrix](./contracts/v1-learner-band-matrix.md)
- [V1 Language Content Model](./contracts/v1-language-content-model.md)
- [V1 Authoring Artifact Model](./contracts/v1-authoring-artifact-model.md)
- [V1 Golden Slice: Find the Luggage](./contracts/v1-find-the-luggage-golden-slice.md)

## Shared Quest Definition

All five use cases are different player-facing realizations of the same quest:

- quest name: `Find the Luggage`
- setting: a train station or port terminal
- narrative objective: help an NPC identify and recover a missing piece of luggage
- core quest steps:
  1. talk to the station clerk or traveler
  2. understand the luggage description
  3. identify or ask about the luggage location
  4. retrieve or point out the correct luggage
  5. return and confirm completion

What changes across use cases is not the quest logic.

What changes is:

- the rendered language complexity
- the support-language policy
- the grounding intensity and grounding affordances
- the allowed input mode
- the support affordances
- the evaluation method
- whether optional free-form conversation is enabled

## Two Core Learning Levers

The product docs should treat two things as first-class design levers, not as optional polish.

### 1. Controlled Support-Language Mixing

Sugarlang should not think in binary terms like:

- target language only
- translation on or off

It should think in band-specific support-language policy.

That policy can determine:

- whether the NPC line is target-language-only or paired with support-language framing
- whether key target words stay visible inside a mostly native-language prompt
- whether glosses are inline, side-by-side, on tap, or hidden until requested
- whether hints, recasts, and objective prompts use the support language
- how quickly support-language scaffolding fades as the learner improves

Early bands should often preserve a few high-value target-language items inside otherwise easier support text.

Examples:

- `Find the maleta roja.`
- `Tap the maleta roja.`
- `Say where the maleta is.`

### 2. Scene-Grounded Meaning

Sugarlang should aggressively bind language to visible, interactive, in-world meaning.

That includes binding words and phrases to:

- world objects
- visible attributes such as color, size, and material
- spatial relations such as `near the door`
- gestures, focus targets, and camera emphasis
- quest-relevant actions such as inspect, pick up, point to, and return

The point is not just to show translated text.

The point is to let the player learn that:

- `maleta` is this suitcase
- `roja` is this visible red property
- `junto a la puerta` describes this spatial relation in the scene

That grounding should be strongest in beginner bands and become more implicit and naturalistic in advanced bands.

## Progressive Bands Across Those Levers

| Band | Support-language policy | Grounding strategy |
| --- | --- | --- |
| Absolute beginner | high support-language mix with protected target-language keywords | explicit object highlights, tap-to-inspect, visible vocabulary anchors |
| Guided beginner | medium-high support-language mix with guided target-language production | persistent noun/color/location bindings and hint-driven highlighting |
| Constrained conversation | medium support-language mix in prompts, hints, and glossary chips | scene-keyword chips tied to objects, regions, and attributes |
| Intermediate | low support-language mix, mostly on request | natural scene interpretation with optional grounding reveal |
| Near-fluent | minimal support-language use, mostly on demand | naturalistic world context with optional clarification tools |

## Current Authoring Baseline in SugarEngine

The current editor already gives designers a baseline workflow for the quest skeleton:

- `Dialogues` tab for authored dialogue trees
- `Quests` tab for quest stages and objectives
- `NPCs` tab for default dialogue and interaction mode
- `Regions` tab for placing NPCs, pickups, and inspectables
- `Episode Details` for main quest and start region

Relevant current behavior and docs:

- quest-to-dialogue routing is documented in `docs/dev/quest-episode-integration.md`
- the dialogue editor canvas and node inspector are documented in `docs/api/06-dialogue.md`

## English-First, AI-Assisted Authoring Model

The intended Sugarlang workflow is not manual pedagogy authoring from a blank form.

The intended workflow is:

1. author the game scene in English using normal SugarEngine quest/dialogue tools
2. ask Sugarlang to generate the language-learning draft for that scene
3. review and refine the generated overlay
4. preview the scene at different learner placements

This generation step should be available from:

- the editor UI
- chat with an AI assistant
- CLI or automation

All three should operate on the same underlying Sugarlang files and contracts.

## Runtime Language Model

For this product, the base game content is authored in English.

That is a fixed authoring assumption, not a runtime concern.

The runtime only needs to model:

- `target language`
  - the language the player is intended to learn in a given run
- `support language`
  - the language used for scaffolding, glosses, hints, or mixed-language prompts

For the initial Sugarlang product, the recommended setup is:

- supported target languages: English and Spanish
- supported support languages: English and Spanish
- player-facing V1 language pairs:
  - `supportLanguage = English`, `targetLanguage = Spanish`
  - `supportLanguage = Spanish`, `targetLanguage = English`

That gives two useful product benefits:

- Spanish target with English support gives the core learner-facing flow you want to test
- English target with Spanish support proves the model works in the other direction too
- English target content still helps with creator-side evaluation of target-language accuracy and grading logic

## Source of Truth and Storage Model

Sugarlang content should be persisted as human-readable files under the game root.

The canonical on-disk layout is defined in [ADR-SL-001](../adr/001-english-first-authoring-overlay-and-source-of-truth-model.md).

At the product level, the important split is:

- project-level plugin configuration
- scenario-owned semantic and grounding data
- shared defaults
- per-target-language learning packs
- eval artifacts
- disposable caches or indexes

SQLite is acceptable for caches and derived artifacts.

It should not be the canonical source of authored Sugarlang content.

## Proposed Sugarlang Authoring Surfaces

These use cases assume the following proposed authoring UI is added to SugarEngine.

The exact field names and layouts are follow-on design work, but the product behaviors depend on these concepts existing somewhere in the shared Sugarlang authoring system, with the editor acting as one client of that system.

### 0. Draft Generation Actions

Purpose:

- generate Sugarlang drafts from English-authored quest/dialogue content
- regenerate only selected bands or languages
- support the same actions from editor UI and chat/CLI

### 1. Sugarlang Scenario Panel

Attached to a quest objective or dialogue node.

Purpose:

- bind the authored scene to a semantic learning scenario
- declare the target communicative task
- declare which world referents and attributes ground the language
- declare which learner bands the scenario supports

### 2. Learner Band Matrix

Purpose:

- define how the same scene behaves at different learner placements
- attach render variants, support-language policies, response contracts, and support levels by band

### 3. Response Contract Editor

Purpose:

- choose the player input mode for the turn
- define allowed response shapes
- define UI affordances such as choice chips, blanks, word banks, hints, repeat, or simplify

### 4. Support-Language Policy Editor

Purpose:

- define how the target language and support language are mixed by band
- decide whether support appears as inline glosses, dual-language prompts, sidecar hints, or on-demand translation
- protect specific target-language tokens so the learner still sees and uses them

### 5. Grounding Map Editor

Purpose:

- bind target-language words and phrases to world objects, regions, attributes, and actions
- define what gets highlighted, focused, or revealed when a grounding aid is shown
- let the same semantic scene drive both language presentation and world-context support

### 6. Evaluation Rules Editor

Purpose:

- define deterministic success rules
- define accepted answer sets, slot requirements, morphology checks, and intent checks
- decide when minor language errors still count as communicative success

### 7. Support and Feedback Panel

Purpose:

- set whether the turn supports hint, recast, repetition, or optional translation
- control how much corrective feedback is shown by band

### 8. Placement Preview Drawer

Purpose:

- preview the same quest at a selected learner placement
- playtest the full band-specific experience before shipping

## AI-Assisted Authoring Workflow

The expected creator workflow should allow commands like:

- `generate the Sugarlang draft for quest find-the-luggage`
- `generate only the beginner Spanish bands for the clerk intro scene`
- `regenerate the evaluation rules for the luggage report step`
- `make the beginner version use more English scaffolding but keep maleta and roja in Spanish`
- `bind the luggage vocabulary to the visible red suitcase and door region`

Those commands should produce or update the same on-disk Sugarlang artifacts the editor would edit.

The creator can then:

- review the files directly
- refine them in chat
- refine them in the editor
- preview them in the game

## Use Case Catalog

- [UC-001: Find the Luggage for an Absolute Beginner](./uc-001-find-the-luggage-absolute-beginner.md)
- [UC-002: Find the Luggage for a Guided Beginner](./uc-002-find-the-luggage-guided-beginner.md)
- [UC-003: Find the Luggage for a Constrained Conversational Learner](./uc-003-find-the-luggage-constrained-conversation.md)
- [UC-004: Find the Luggage for an Independent Intermediate Learner](./uc-004-find-the-luggage-intermediate-clarification.md)
- [UC-005: Find the Luggage for a Near-Fluent Player](./uc-005-find-the-luggage-near-fluent.md)

## How to Read the Use Cases

Each use case answers four questions:

1. What learner was placed into this band?
2. What exactly does the player see in the first quest?
3. How is the player response evaluated?
4. How would a designer or AI-assisted workflow author that experience in SugarEngine?

## Design Intent Across the Set

The set should make one architectural point unmistakably clear:

`sugarlang` is not "LLM tutoring."

It is an adaptive language-learning system that can:

- use fully deterministic authored dialogue and deterministic evaluation
- use constrained text input and strict rule-based checking
- optionally delegate turn realization to `sugaragent` only when free-form interaction is justified
- generate most of its overlay data from English-authored game content and then let the creator refine it
- deliberately mix target language with support language when that makes comprehension and retention stronger
- use rich in-world grounding so vocabulary and phrases are learned against visible meaning rather than floating text alone
- support multiple target languages over the same authored English game structure

That distinction is central to the plugin architecture and to the product strategy.
