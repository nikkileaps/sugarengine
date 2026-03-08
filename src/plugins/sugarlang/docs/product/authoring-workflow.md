# Sugarlang AI-Assisted Authoring Workflow

## Purpose

This document defines the intended creator workflow for Sugarlang authoring.

The central requirement is:

the creator should be able to author the game in English first and then ask Sugarlang, through the editor, chat, or CLI, to generate and refine the immersive language-learning overlay.

## Core Authoring Model

Sugarlang should be authored as an overlay on top of normal SugarEngine content.

The workflow is:

1. create quests, dialogue, NPCs, regions, world objects, pickups, and quest objectives as a normal game
2. keep that authored content in English
3. ask Sugarlang to infer the learning scenario, repair behavior, mixed-language support, grounding, and scene variants
4. refine the generated overlay through review, playtest, and regeneration

This keeps the creator focused on:

- narrative design
- quest structure
- world setup
- scene intent
- game feel

instead of forcing them to manually author pedagogical structure from scratch.

## Runtime Language Model

The base game is authored in English.

That is not a runtime variable.

The runtime-relevant language choices are:

- `target language`
- `support language`
  - the learner's scaffold language, usually their strongest or native language

For the initial product:

- first target languages: English and Spanish
- first support languages: English and Spanish
- normal player-facing language pairs:
  - English support -> Spanish target
  - Spanish support -> English target

## Source of Truth

Canonical Sugarlang content should live in human-readable files under the game root.

The canonical on-disk layout is defined in [ADR-SL-001](../adr/001-english-first-authoring-overlay-and-source-of-truth-model.md).

This workflow depends on that layout separating:

- project-level plugin settings
- scenario-owned semantic data
- scenario-owned grounding and grounded quest binding data
- shared defaults
- per-target-language scene packs
- eval artifacts
- disposable caches or SQLite indexes

SQLite may be useful for caches.

It should not be the source of truth for authored Sugarlang content.

## Authoring Clients

Sugarlang should support the same workflow from three equivalent clients.

### Editor Client

The creator selects a quest, objective, or dialogue scene and uses actions such as:

- `Generate Sugarlang Draft`
- `Regenerate Beginner Bands`
- `Regenerate Repair Policy`
- `Generate English Variants`
- `Generate Spanish Variants`
- `Rebuild Grounded Quest Binding`

### Chat Client

The creator talks to an AI assistant and says things like:

- `generate the Sugarlang draft for quest find-the-luggage`
- `rewrite the B0 and B1 variants to be more immersive and less translated`
- `make chips primary at B0 and fallback-only at B3`
- `bind maleta to the red suitcase pickup and the return step`
- `regenerate only the Spanish B2 variant with stronger repair behavior`

The assistant reads the English-authored game content and writes the same Sugarlang files the editor would use.

### CLI / Automation Client

This supports batch generation, validation, or recurring refresh jobs.

Examples:

- generate drafts for all scenes in an episode
- validate grounded bindings after a quest edit
- regenerate only one target language after source-scene changes

## Shared Generation Pipeline

All clients should use the same underlying generation pipeline:

1. read English-authored quest, dialogue, NPC, region, object, pickup, inventory, and objective structure
2. read visible scene context that can ground language
3. extract stable scene and object references
4. infer the semantic learning scenario
5. infer communicative task, success model, and grounded referents
6. infer a grounded quest binding chain for the scene
7. draft learner-band variants
8. draft repair behavior by band
9. draft mastery-aware mixed-language policies by band
10. draft response scaffolds, including when chips are primary versus fallback
11. draft evaluation rules and failure recovery
12. validate references and write round-trip-safe files

This prevents the editor and chat from drifting into separate authoring systems.

## What the AI Should Infer From the English Scene

The AI should not stop at literal translation.

It should infer:

- the communicative task
- the likely target vocabulary
- which words should be introduced, reinforced, or only passively visible
- which repair moves make sense in the scene
- which lines should stay target-language first
- where support-language mixing should appear during repair
- which quest actions can reinforce the vocabulary
- which world objects, regions, attributes, pickups, and inventory items should carry the meaning

For `Find the Luggage`, that means the AI should notice things like:

- luggage objects
- their colors and distinguishing features
- the door, counter, and nearby landmarks
- the pickup and inventory path for the correct suitcase
- the return step where the player hands it back

## Mixed-Language Drafting Rule

The AI should draft support-language use as a repair strategy, not as a default translation strip.

That means it should prefer outputs like:

- initial target-language line
- repair line with selective support-language mixing
- chip sets and response scaffolds that recycle target vocabulary

over outputs like:

- target line
- full translated subtitle
- bare `yes/no` choices

## Response Scaffold Drafting Rule

When the AI drafts response scaffolds, it should prefer chip sets, prompts, and text supports that recycle active vocabulary and reflect real quest actions.

Examples:

- chip-built response: `Sí, I see la maleta roja.`
- guided blank-fill response with word bank: `La maleta ____ está ____ .` with candidates `azul`, `roja`, `allí`, `aquí`
- natural mixed initial line: `Necesito la maleta azul. Can you show me where it is?`
- clarification repair response rendered in the target language, for example Spanish-target `¿Qué significa "__" en inglés?`
  - the support-language label inside the utterance should also be localized to the target language
- typed response using insert chips: `¿Dónde está la maleta negra?`
- guided return response: `Aquí está la maleta azul.`

It should not default to empty acknowledgements unless the band or scene truly requires them.

## Grounded Quest Binding Drafting Rule

The AI should draft the same referent through the full quest loop whenever the authored scene supports it:

- NPC description
- grounded world object
- inspect or pickup action
- inventory item
- return or handoff step

If the English-authored quest already has those mechanics, Sugarlang should bind to them rather than invent a detached language-only mini-interaction.

## Round-Trip Rules

Generated Sugarlang files should be safe to regenerate and refine.

That means:

- stable IDs are preserved
- scene and object references remain explicit
- creator edits survive regeneration where possible
- file formats remain diff-friendly
- states such as `draft`, `reviewed`, and `approved` are supported

## Typical Creator Flow

1. Author `Find the Luggage` in English, including the actual suitcase object, pickup, inventory item, and return step.
2. Ask the AI assistant:
   - `generate the Sugarlang draft for Find the Luggage in English and Spanish`
3. Review the generated scenario, grounding map, grounded quest binding, and band variants.
4. Ask follow-up refinements:
   - `make B0 more immersive and remove the translation-strip feel`
   - `keep chips primary at B0, but make B1 a real word-bank blank-fill band`
   - `make B3 chips appear only after failure`
   - `recycle maleta and roja more aggressively in the responses`
   - `bind the red suitcase to pickup and inventory so the word stays consistent after collection`
   - `allow missing accent marks in the B2 typed response`
5. Open the editor and preview the same scene across bands and language pairs.
6. Ship once the overlays are validated and playtested.

## Why This Workflow Matters

This workflow is essential because the likely creator for Sugarlang is:

- a solo developer
- a small team
- a designer who is not a language pedagogy expert

The system should let that creator author a good game first and then use AI to help turn it into a grounded, immersive language-learning experience.
