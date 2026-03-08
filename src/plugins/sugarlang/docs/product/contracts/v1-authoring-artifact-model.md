# V1 Authoring Artifact Model

## Purpose

This document defines the product-level authoring artifacts for V1 Sugarlang.

It answers:

- what content artifacts should exist
- what each artifact means
- where vocabulary should live logically
- what should be shared across scenes versus authored per scene

This is not a final schema specification.

It is the content contract the editor, AI assistant, and future implementation should all target.

## Product Decision

V1 Sugarlang content should be organized around reusable teaching artifacts, not just ad hoc translated scene files.

That means:

- shared lexicon lives once per target language
- shared band defaults live once per product
- scene-specific overlays reference those shared assets
- grounding maps live with the semantic scene

## Base Rule

The base game content stays in the normal English-authored SugarEngine project.

Sugarlang adds overlay artifacts under `plugins/sugarlang/`.

Those overlay artifacts are the canonical product content for language learning.

## V1 Artifact Types

### 1. Scenario Brief

Purpose:

- define the semantic learning scenario for one authored scene or objective

Should answer:

- what is the communicative task
- what counts as task success
- which world referents matter
- which bands the scene supports

Logical home:

- `plugins/sugarlang/scenarios/`

### 2. Grounding Map

Purpose:

- define how language is tied to world context

Should answer:

- which object or region each concept points to
- which attributes are visible and teachable
- which hints, highlights, or camera focus actions are allowed

Logical home:

- `plugins/sugarlang/scenarios/`

Product rule:

- grounding maps are scenario-owned, because the world referents belong to the scene

### 3. Shared Lexicon Pack

Purpose:

- define the reusable teaching vocabulary for one target language

Should answer:

- what the stable teachable concepts are
- what the preferred target-language forms are
- what the English glosses are
- when the item is normally introduced

Logical home:

- `plugins/sugarlang/languages/en/lexicon/`
- `plugins/sugarlang/languages/es/lexicon/`

Product rule:

- vocabulary should be stored primarily here, not duplicated raw into every scene

### 4. Grammar Ladder Pack

Purpose:

- define the product-level grammar ceilings and allowed structures by band

Should answer:

- what structures are allowed in `B0` through `B4`
- what should be only recognition
- what should be allowed in production

Logical home:

- `plugins/sugarlang/languages/en/grammar/`
- `plugins/sugarlang/languages/es/grammar/`

### 5. Band Policy Pack

Purpose:

- define default player-experience policy by band

Should answer:

- support-language behavior
- grounding intensity
- allowed response modes
- correction posture

Logical home:

- `plugins/sugarlang/defaults/`

Product rule:

- these are product defaults, not scene content

### 6. Scene Language Pack

Purpose:

- define the target-language realization of one scenario

Should answer:

- what lines or candidate lines exist in the target language
- what the active teaching concepts are in this scene
- what support-language strategy each band uses
- what response contracts and evaluation rules apply

Logical home:

- `plugins/sugarlang/languages/en/scenes/`
- `plugins/sugarlang/languages/es/scenes/`

Product rule:

- this is where the scene becomes English-target or Spanish-target

### 7. Preview and Eval Fixtures

Purpose:

- give product and QA stable examples for replay and review

Should answer:

- what a good run looks like
- what a weak but still successful run looks like
- what an actually failing run looks like

Logical home:

- `plugins/sugarlang/eval/`

## Canonical Layout Reference

The canonical on-disk layout is defined in [ADR-SL-001](../../adr/001-english-first-authoring-overlay-and-source-of-truth-model.md).

This product contract does not redefine that tree.

The important product decision here is the ownership split within that canonical layout.

## What Lives Once vs What Lives Per Scene

### Shared once per target language

- core lexicon
- grammar ladder
- reusable support-language policy labels
- reusable band names and meanings

### Authored per scenario

- semantic task
- referents
- grounding map
- scene success model

### Authored per scenario per target language

- learner-band scene variants
- active teaching concepts for that scene
- support-language behavior in that scene
- response contracts
- evaluation rules

## Product Rule for Vocabulary Storage

This is the V1 answer to "where do the vocabulary words live?"

They should live in two places with different roles:

### Shared language lexicon

This is the canonical reusable home of the word as a teaching item.

Examples:

- `object.suitcase -> suitcase`
- `object.suitcase -> maleta`
- `color.red -> red`
- `color.red -> roja`

### Scene language pack

This is the home of the scene's use of that word.

Examples:

- this scene actively teaches `maleta`
- this scene passively uses `andén`
- this scene protects `roja` as a visible keyword in mixed-language support

The product should not choose between those two.

It needs both.

## Product Rule for Scene-Local Vocabulary

Sometimes a scene will need a word that is not yet in the shared lexicon.

V1 should allow:

- `scene-local provisional vocabulary`

But it should expect that provisional items get promoted into the shared lexicon when they recur or become part of the stable domain.

## Product Rule for English and Spanish

English and Spanish should be parallel target-language packs over the same scenario model.

That means:

- both point to the same scenario brief
- both point to the same grounding map
- both use the same band semantics
- both can have different surface lines and language-specific evaluation details

This is how one English-authored game can ship multiple target-language experiences without creating separate games.

## AI Generation Contract

When the AI assistant generates a scene draft, it should produce or update:

- the scenario brief if missing
- the grounding map if missing or stale
- the target-language scene pack for English
- the target-language scene pack for Spanish

It may also suggest:

- new lexicon items
- promotions of scene-local vocabulary into the shared lexicon
- grammar tags or band-introduction suggestions

## Product Review Questions

For every new scene, product review should be able to answer:

- which shared lexicon items are active here
- which scene-local items are provisional
- which referents carry the meaning
- how support language behaves in each band
- whether English and Spanish packs are parallel enough to compare meaningfully

If those answers are unclear, the content model is not concrete enough.
