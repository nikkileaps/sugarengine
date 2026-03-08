# Sugarlang AI-Assisted Authoring Workflow

## Purpose

This document defines the intended creator workflow for Sugarlang authoring.

The central requirement is simple:

the creator should be able to build the game in English first and then ask Sugarlang, through either the editor or chat, to generate the language-learning layer.

## Core Authoring Model

Sugarlang should be authored as an overlay on top of normal SugarEngine content.

The workflow is:

1. create quests, dialogue, NPCs, regions, and world objects as a normal game
2. keep that authored content in English
3. generate Sugarlang scenarios and target-language variants from that authored structure
4. refine the generated overlay through review, editing, playtest, and regeneration

This keeps the creator focused on:

- narrative design
- quest structure
- scene intent
- game feel

instead of forcing them to become a manual linguistics data-entry operator.

## Runtime Language Model

Sugarlang should assume the base game content is authored in English.

That is just how the product is authored.

The runtime-relevant language choices are:

- `target language`
- `support language`

For the initial product:

- first target languages should be English and Spanish
- first support languages should be English and Spanish
- the normal player-facing pairs should be:
  - English support -> Spanish target
  - Spanish support -> English target

That distinction matters because:

- English-authored source content is the base narrative source
- English as a target language should work for Spanish-support learners
- Spanish as a target language should work for English-support learners
- creator-side validation may still preview either target pack directly
- support language is a player-facing choice, not a fixed English-only property

## Source of Truth

Canonical Sugarlang content should live in human-readable files under the game root.

The canonical on-disk layout is defined in [ADR-SL-001](../adr/001-english-first-authoring-overlay-and-source-of-truth-model.md).

This workflow depends on that layout separating:

- project-level plugin settings
- scenario-owned semantic and grounding data
- shared defaults
- per-target-language learning packs
- eval artifacts
- disposable caches or SQLite indexes

SQLite may be useful for caches.

It should not be the source of truth for authored Sugarlang content.

## Authoring Clients

Sugarlang should support the same workflow from three equivalent clients:

### Editor Client

The creator selects a quest, objective, or dialogue scene and uses a UI action such as:

- `Generate Sugarlang Draft`
- `Regenerate Beginner Band`
- `Generate English Variants`
- `Generate Spanish Variants`

### Chat Client

The creator talks to an AI assistant and says things like:

- `generate the Sugarlang draft for quest find-the-luggage`
- `generate the English beginner variants for the clerk scene`
- `generate the Spanish beginner variants for the clerk scene`
- `tighten the deterministic evaluation rules for the report-back step`

The assistant reads the English-authored game content and writes the same Sugarlang files the editor would use.

### CLI / Automation Client

This supports batch generation, CI validation, or recurring content refresh jobs.

Examples:

- generate drafts for all scenes in one episode
- validate Sugarlang references after quest edits
- regenerate one target language after source-scene changes

## Shared Generation Pipeline

All clients should use the same underlying pipeline:

1. read English-authored quest/dialogue scene structure
2. read world objects, regions, attributes, and other scene context that can ground language
3. extract stable scene references
4. infer semantic learning scenario
5. infer communicative task, grounding map, and success model
6. draft learner-band variants
7. draft support-language policies by learner band
8. draft response contracts and evaluation rules
9. validate references and output structure
10. write round-trip-safe files

This prevents the editor and chat from drifting into two incompatible authoring systems.

## Round-Trip Rules

Generated Sugarlang files should be safe to regenerate and refine.

That means:

- stable IDs must be preserved
- scene references must remain explicit
- generated sections should be updatable without destroying creator edits
- file formats should be diff-friendly
- status fields such as `draft`, `reviewed`, or `approved` should be supported

## What the AI Should Infer from the English Scene

The AI should not stop at literal translation.

When generating a Sugarlang draft from English-authored content, it should try to infer:

- the communicative task of the scene
- the likely learner-relevant nouns, verbs, descriptors, and spatial phrases
- which world objects, regions, and attributes can ground those terms
- which words should remain in the target language even when support-language scaffolding is present
- which bands should get inline glosses, dual-language prompts, or on-demand translation only
- which hints should highlight a referent in the world instead of only showing more text

For `Find the Luggage`, that means the AI should notice things like:

- luggage objects
- color differences between luggage
- the door, clerk desk, and nearby landmarks
- quest actions such as inspect, pick up, point out, and return

That is how Sugarlang turns authored game structure into grounded language-learning content.

## Typical Creator Flow

1. Author `Find the Luggage` in English.
2. Ask the AI assistant:
   - `generate the Sugarlang draft for Find the Luggage in English and Spanish`
3. Review the generated scenario and learner-band files.
4. Ask follow-up refinements:
   - `make the beginner version more visual and easier`
   - `use more English scaffolding in the first band but keep maleta, roja, and aquí in Spanish`
   - `bind maleta and roja to the visible red suitcase and make hints highlight it`
   - `allow minor accent mistakes in the short typed response`
   - `regenerate only the advanced band with more natural phrasing`
5. Open the editor and preview the quest at different learner placements.
6. Ship once the drafts are validated and playtested.

## Why This Workflow Matters

This workflow is essential because the likely creator for Sugarlang is:

- a solo developer
- a small team
- a designer who is not a language pedagogy expert

The system should amplify that creator, not burden them with manual pedagogical schema authoring as the default path.
