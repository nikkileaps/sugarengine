# V1 Authoring Artifact Model

## Purpose

This document defines the product-level authoring artifacts for V1 Sugarlang.

It answers:

- what content artifacts should exist
- what each artifact means
- where vocabulary should live logically
- where repair behavior should live
- where mixed-language delivery behavior should live
- how grounded quest actions should be represented

This is not a final schema specification.

It is the content contract the editor, AI assistant, and future implementation should all target.

## Product Decision

V1 Sugarlang content should be organized around reusable teaching artifacts, not ad hoc translated interaction files.

That means:

- shared lexicon lives once per target language
- shared band defaults live once per product
- one scenario is associated to one quest
- interactions live inside the scenario as the learner-facing communicative beats derived from that quest
- scenario-owned grounding and quest binding live with that quest overlay
- target-language scenario overlays reference those shared assets and add band-specific behavior, including how mixed language appears in initial delivery, repair, and happy-path response frames

## Base Rule

The base game stays in the normal English-authored SugarEngine project.

Sugarlang adds overlay artifacts under `plugins/sugarlang/`.

Those overlay artifacts are the canonical authored product content for language learning.

## V1 Artifact Types

### 1. Scenario Brief

Purpose:

- define the semantic Sugarlang overlay for one authored quest

Should answer:

- which quest this scenario belongs to
- what the quest-level communicative arc is
- what stable grounded referents matter across the quest
- which learner bands and target languages this scenario supports

Logical home:

- `plugins/sugarlang/scenarios/`

### 2. Interaction Set

Purpose:

- define the learner-facing communicative beats inside the scenario

Should answer:

- which interactions were derived from the quest graph
- which quest nodes and dialogue beats each interaction came from
- which NPCs and world objects each interaction binds to
- what success semantics and quest-completion hook each interaction owns

Logical home:

- `plugins/sugarlang/scenarios/`

### 3. Grounding Map

Purpose:

- define how language is tied to world context

Should answer:

- which object or region each concept points to
- which attributes are visible and teachable
- which highlights, camera cues, or inspect reveals are allowed

Logical home:

- `plugins/sugarlang/scenarios/`

### 4. Grounded Quest Binding

Purpose:

- define how a teaching referent stays attached to the actual quest loop

Should answer:

- which world object is being described
- whether the object is inspectable, clickable, or pickup-enabled
- which inventory item or held object it maps to after collection
- which quest objective or return step it satisfies
- which vocabulary should remain attached to that referent across the loop

Logical home:

- `plugins/sugarlang/scenarios/`

Product rule:

- grounded quest binding is scenario-owned because it expresses quest truth, not language-pack surface text

### 5. Shared Lexicon Pack

Purpose:

- define reusable teaching vocabulary for one target language

Should answer:

- what the stable shared lexicon rows and chunks are
- what the preferred target-language forms are
- what the glosses are
- when the item is normally introduced

Logical home:

- `plugins/sugarlang/languages/en/lexicon/`
- `plugins/sugarlang/languages/es/lexicon/`

### 6. Grammar and Chunk Ladder Pack

Purpose:

- define product-level grammar ceilings and chunk expectations by band

Should answer:

- what structures are allowed in `B0` through `B4`
- what should be recognition-only
- what should be allowed in production

Logical home:

- `plugins/sugarlang/languages/en/grammar/`
- `plugins/sugarlang/languages/es/grammar/`

### 7. Band Policy Pack

Purpose:

- define default learner-experience policy by band

Should answer:

- support-language posture
- repair posture
- grounding intensity
- allowed response modes
- failure recovery posture

Product rule:

- the band policy pack defines the default posture
- it does not own the final wording of interaction-specific mixed-language lines or response frames

Logical home:

- `plugins/sugarlang/defaults/`

### 8. Scenario Language Overlay

Purpose:

- define the target-language realization of one scenario and its interactions

Should answer:

- which interaction overlays exist for that scenario
- what initial-delivery lines or candidate lines exist for each interaction in the target language
- what the `focus`, `reinforcement`, and `ambient` vocabulary roles are for each interaction
- what repair variants exist for each interaction
- how support language is mixed in the initial line, repair, and happy-path response frames
- what response frames exist for chip composition, blank fill, guided assembly, or typed support
- which target-language items must remain visible in mixed-language delivery
- which support-language glue or helper chunks are allowed around those target-language items
- what response scaffolds and fallback scaffolds exist
- what evaluation and recovery rules apply
- what quest-success hooks are allowed for each interaction

Product rule:

- for bounded scripted dialogue beats, the first pass may be generated deterministically via band-based lexical substitution
- that first pass should still persist the full banded interaction bundle, not just translated NPC text
- later human or optional LLM surface polish may improve line phrasing without silently changing interaction identity, source bindings, vocabulary roles, response contracts, evaluation targets, or quest hooks

Logical home:

- `plugins/sugarlang/languages/en/scenes/`
- `plugins/sugarlang/languages/es/scenes/`

### 9. Preview and Eval Fixtures

Purpose:

- give product and QA stable examples for replay and review

Should answer:

- what a strong run looks like
- what a weak but successful run looks like
- what a failing run looks like
- what fallback repair path should appear

Logical home:

- `plugins/sugarlang/eval/`

## Canonical Layout Reference

The canonical on-disk layout is defined in [ADR-SL-001](../../adr/001-english-first-authoring-overlay-and-source-of-truth-model.md).

This product contract does not redefine that tree.

The important product decision here is the ownership split within that canonical layout.

## What Lives Once vs What Lives Per Scene

### Shared once per target language

- core lexicon
- grammar and chunk ladder
- reusable band names and meanings

### Shared once per product

- band defaults
- default repair posture labels
- default fallback policy labels

### Authored per scenario

- quest association
- semantic task
- referents
- interaction set
- grounding map
- grounded quest binding
- scenario success model

Product note:

- the grounded quest binding should own the stable scenario-level referent and any per-band concrete variant map

### Authored per scenario per target language

- interaction overlays
- learner-band interaction variants
- `focus`, `reinforcement`, and `ambient` vocabulary roles per interaction
- initial-delivery variants
- happy-path response frames
- repair variants
- mixed-language policy for that interaction's initial line, repair, and happy-path responses
- response scaffolds and fallback scaffolds
- evaluation rules
- quest-success hooks

### Authored per interaction per target language per band

Each persisted band variant should be reviewable as one structured interaction bundle.

At minimum, that bundle should capture:

- the interaction identity
- source quest-node refs
- source dialogue-beat refs
- involved NPC refs
- involved world-object refs
- the band-specific NPC line
- the `focus`, `reinforcement`, and `ambient` vocabulary-entry ids
- the primary response contract
- the visible response scaffold
- the repair ladder
- the evaluation target
- the allowed quest-success hook

See [Deterministic Banded Turn Generation](../../api/deterministic-banded-turn-generation.md).

## Product Rule for Vocabulary Storage

Vocabulary lives in two places with different roles.

### Shared language lexicon

This is the canonical reusable home of the vocabulary entry.

It is one shared per-target-language teaching dictionary for the whole game, not a separate lexicon per scenario or per band.

It should own:

- stable lexical entry id
- preferred target-language form
- gloss
- category
- first or introduction band
- default usage or teaching priority

Examples:

- `object.suitcase -> suitcase`
- `object.suitcase -> maleta`
- `repair.i_dont_understand -> I don't understand`
- `repair.i_dont_understand -> no entiendo`

### Scenario language overlay

This is the home of the scenario's and interaction's use of that vocabulary entry.

It should own:

- which interactions use the entry
- which interactions treat it as `focus`
- which interactions treat it as `reinforcement`
- which interactions allow it as `ambient`
- which items stay protected or highlighted in mixed-language delivery

Examples:

- the `greeting` interaction uses `hola` as `focus`
- the `describe_target_luggage` interaction uses `maleta` as `focus`
- the `describe_target_luggage` interaction uses `roja` as `reinforcement`
- the `return_target_luggage` interaction allows a few higher-band words as `ambient`
- the `describe_target_luggage` interaction uses the `B0` initial line `Do you see la maleta roja?`
- the `describe_target_luggage` interaction uses the `B1` response frame `La maleta ____ está ____ .`
- the interaction allows a B0 clarification repair response rendered in the target language, such as Spanish-target `¿Qué significa "__" en inglés?`, optionally prefilled from visible target tokens such as `maleta` or `roja`
- the interaction protects `maleta` and `roja` during mixed-language initial delivery, repair, and happy-path response building

The product needs both.

See [V1 Lexicon and Interaction Curriculum Model](./v1-lexicon-and-scene-curriculum-model.md).

## Product Rule for Mixed-Language Ownership

Mixed-language behavior lives in more than one layer, but those layers have different jobs.

### Shared language lexicon and grammar packs

These define:

- what reusable vocabulary entries and chunks exist
- what their preferred target-language forms are
- when they are normally introduced
- what kinds of structures are appropriate by band

They do not decide the final interaction-specific mixed wording.

### Band policy pack

This defines:

- how much support language is generally expected at each band
- when mixed language should move from initial delivery into repair-only support
- when response scaffolds should shift from chips to word banks to typing

It does not decide the actual mixed line the learner sees in a specific interaction.

### Scenario language overlay

This is the canonical home of the actual mixed-language realization for that interaction and band.

It should own:

- the initial NPC line for that interaction and band
- the repair variants for that interaction and band
- the happy-path response frame for that interaction and band
- the response scaffold attached to that frame
- the set of target-language items that must remain visible
- the allowed support-language glue around those items

Examples:

- `B0` initial line: `Do you see la maleta roja?`
- `B0` happy-path response: `Sí, I see la maleta roja.`
- `B1` initial line: `Necesito la maleta azul. Can you show me where it is?`
- `B1` response frame: `La maleta ____ está ____ .`

Scenario briefs, interaction sets, grounding maps, and grounded quest bindings should not own those surface lines.

They own interaction meaning and quest truth, not the mixed-language wording.

## Product Rule for Grounded Quest Binding

If an interaction teaches a quest-relevant referent, the product should try to bind that referent through the whole quest loop:

- description
- world object
- inspect or pickup action
- inventory or held item
- return or handoff step

That contract is defined in [V1 Grounded Quest Binding Model](./v1-grounded-quest-binding-model.md).

## Product Rule for Interaction-Local Vocabulary

Some interactions will need a word or chunk that is not yet in the shared lexicon.

V1 should allow:

- `interaction-local provisional vocabulary`

But repeated or stable items should be promoted into the shared lexicon.

## Product Rule for English and Spanish

English and Spanish should be parallel target-language overlays over the same scenario and interaction model.

That means:

- both point to the same scenario brief
- both point to the same grounding map
- both point to the same grounded quest binding
- both use the same band semantics
- both can have different surface lines and language-specific evaluation details

The same ownership split should also extend cleanly to additional target-language packs such as Italian.

## AI Generation Contract

When the AI assistant generates a scenario draft, it should produce or update:

- the scenario brief if missing
- the interaction set if missing or stale
- the grounding map if missing or stale
- the grounded quest binding if missing or stale
- the target-language scenario overlay for English
- the target-language scenario overlay for Spanish

It may also suggest:

- new vocabulary entries
- promotions of interaction-local vocabulary into the shared lexicon
- per-interaction `focus`, `reinforcement`, and `ambient` role suggestions
- grammar or chunk tags

## Product Review Questions

For every new scenario, product review should be able to answer:

- which interactions were derived from the quest
- which vocabulary entries are `focus`, `reinforcement`, or `ambient` in each interaction
- which repair variants exist
- what the initial mixed-language delivery is for each interaction and supported band
- what the happy-path response frame is for each interaction and supported band
- which referents carry the meaning
- whether the interaction uses one stable referent with per-band concrete variants
- how those referents bind to the real quest loop
- how support language behaves in each band
- whether English and Spanish overlays are parallel enough to compare meaningfully

If those answers are unclear, the content model is not concrete enough.
