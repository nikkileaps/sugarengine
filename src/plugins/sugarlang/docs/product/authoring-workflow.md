# Sugarlang AI-Assisted Authoring Workflow

## Purpose

This document defines the intended creator workflow for Sugarlang authoring.

The central requirement is:

the creator should be able to author the game in English first and then ask Sugarlang, through the editor, an external workspace assistant operating on generated packets and files, or direct structured-file editing, to generate and refine the immersive language-learning overlay.

## Core Authoring Model

Sugarlang should be authored as an overlay on top of normal SugarEngine content.

The workflow is:

1. create quests, dialogue, NPCs, regions, world objects, pickups, and quest objectives as a normal game
2. keep that authored content in English
3. ask Sugarlang to run `Sync From Quest` and derive the scenario, interactions, grounding, quest bindings, and target-language overlays
4. refine the generated overlay through review, playtest, and regeneration

This keeps the creator focused on:

- narrative design
- quest structure
- world setup
- interaction intent
- game feel

instead of forcing them to manually author pedagogical structure from scratch.

The shared lexicon should be treated as cumulative by band for each supported target language.

That means:

- a learner placed at `B2` should immediately have the cumulative `B0 + B1 + B2` tracked vocabulary pool
- a learner placed at `B4` should have the full tracked vocabulary pool for the supported slice
- scenes then choose smaller `focus`, `reinforcement`, and `ambient` subsets from that cumulative pool

See [V1 Cumulative Banded Lexicon Contract](./contracts/v1-cumulative-banded-lexicon-contract.md).

For bounded scripted dialogue beats, `Sync From Quest` should also be able to do a deterministic first pass from the English quest dialogue beat itself.

That first pass should persist, per band:

- the NPC line
- `focus`, `reinforcement`, and `ambient`
- the response contract
- the visible response scaffold
- the repair ladder
- the evaluation target
- the quest-success hook

The writer should then be able to review those persisted results directly and optionally do a later surface-polish pass over the NPC lines and repair phrasing without changing the interaction structure underneath.

See [Deterministic Banded Turn Generation](../api/deterministic-banded-turn-generation.md).

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

Canonical Sugarlang content should live in human-readable JSON files under the game root.

The canonical on-disk layout is defined in [ADR-SL-001](../adr/001-english-first-authoring-overlay-and-source-of-truth-model.md).

This workflow depends on that layout separating:

- project-level plugin settings
- scenario-owned semantic data and interaction bindings
- scenario-owned grounding and grounded quest binding data
- shared defaults
- per-target-language scenario overlays
- eval artifacts
- disposable caches or SQLite indexes

SQLite may be useful for caches.

It should not be the source of truth for authored Sugarlang content.

## Authoring Workflows

Sugarlang should support the same workflow through three aligned workflows over one artifact model.

### Editor Client

The creator uses the editor to enable Sugarlang for the project, inspect artifacts, switch preview bands/language directions, validate artifacts, and reload previewed content.

V1 does not require a full dedicated Sugarlang authoring suite in the editor.

The minimum editor responsibilities are:

- project-level Sugarlang enablement and language-pair configuration
- scenario-first authoring and inspection
- `Sync From Quest`
- artifact-backed preview controls
- validation/error inspection
- opening or locating the relevant Sugarlang artifact files

Later editor-specific actions may include:

- `Regenerate Interaction`
- `Regenerate Beginner Bands`
- `Regenerate Repair Policy`
- `Regenerate English Overlay`
- `Regenerate Spanish Overlay`
- `Rebuild Grounded Quest Binding`

Those richer in-editor surfaces and actions are post-V1 work and belong to Phase 6 of the implementation plan, not Phase 4.

### External Assistant Client

The creator may also use an external workspace assistant such as Codex.

The preferred flow is not ad hoc prompting.

It is:

1. ask SugarEngine to generate a bounded packet for one authoring operation
2. use a generated assistant-task template
3. let the assistant read only the packet, the relevant artifacts, and the referenced docs
4. return to SugarEngine for validation and preview

When proposing lexicon updates, the assistant should work against the cumulative band contract for the whole supported slice rather than only the currently selected quest.

Typical requests still look like:

- `generate the Sugarlang draft for quest find-the-luggage`
- `rewrite the B0 and B1 variants to be more immersive and less translated`
- `make chips primary at B0 and fallback-only at B3`
- `bind maleta to the red suitcase pickup and the return step`
- `regenerate only the Spanish B2 variant with stronger repair behavior`

But the assistant should work from the generated packet and its referenced files rather than from a manually assembled giant prompt.

The assistant writes the same Sugarlang files or structured proposal artifacts the editor preview will use.

### Direct Structured-File Editing

The creator can also edit the persisted Sugarlang artifacts directly when the AI draft or editor preview needs manual correction.

This is important for V1 because:

- the canonical source of truth is on disk
- the file format must stay human-reviewable
- external AI assistance should not be the only way to recover from bad output

## V1 Implementation Scope

The full end-state authoring vision includes AI-assisted draft generation and richer editor surfaces.

Phase 4 V1 implementation should be narrower:

1. canonical persisted Sugarlang artifacts on disk
2. loaders, serializers, and validators for those artifacts
3. minimal editor integration for enablement, preview, and inspection
4. bounded packet generation and external AI-assisted drafting/refinement through those same files

Phase 4 V1 does **not** require:

- a built-in chat client
- a CLI authoring path
- a full in-editor semantic/pedagogy authoring suite
- in-product LLM-driven pedagogical inference

## Shared Generation Pipeline

The full end-state pipeline is:

1. read the English-authored quest, quest graph, dialogue, NPC, region, object, pickup, inventory, and objective structure
2. traverse the quest graph and identify learner-facing communicative beats
3. derive one Sugarlang scenario for the quest
4. derive one or more interactions inside that scenario
5. bind each interaction back to source quest nodes, dialogue beats, NPCs, and world objects
6. infer or refresh grounded quest bindings for the quest-critical referents
7. look up or draft shared lexicon rows for the needed vocabulary
8. draft target-language interaction overlays and learner-band variants
9. draft repair behavior by band
10. draft mastery-aware mixed-language policies by band
11. draft response scaffolds, including when chips are primary versus fallback
12. draft evaluation rules and failure recovery
13. validate references and write round-trip-safe files

For bounded scripted dialogue beats, the first implementation path should be more concrete than "draft overlays."

It should:

1. read the English quest dialogue beat
2. derive the interaction
3. look up the needed shared vocabulary entries
4. apply the selected band policies
5. emit one persisted banded turn bundle per band

That bundle should contain:

- NPC line
- `focus`, `reinforcement`, and `ambient`
- response contract
- visible scaffold
- repair ladder
- evaluation target
- quest-success hook

In V1, the implemented code path must at least cover the structural derive path for `Sync From Quest`:

- scenario creation
- interaction derivation from the quest graph
- stable source bindings to quest nodes and dialogue beats
- grounded quest binding derivation
- deterministic first-pass banded turn generation via band-based lexical substitution
- artifact creation
- stable reference extraction
- validation
- file serialization/loading

Language-aware drafting, mixed-language authoring, and pedagogical refinement may still be performed by an external AI assistant or direct human editing against those same files.

For V1, the important constraint is that this later pass should usually operate as surface polish over an already-persisted interaction bundle, not as the only source of the interaction's structure.

This prevents the editor and external AI workflow from drifting into separate authoring systems.

## Bounded Packet Handoff

When the writer wants outside AI help, SugarEngine should prepare a bounded authoring packet for one operation such as:

- sync or regenerate the initial overlay for one quest
- regenerate one interaction
- regenerate `B0/B1` only
- regenerate one repair ladder
- rebuild one grounded quest binding

The system should also be able to generate a starter task handoff for the external assistant so the writer does not have to explain:

- what operation is in scope
- what files are in scope
- what product rules matter
- what write boundaries must be respected

That packet-plus-handoff model is the practical bridge between:

- editor-driven authoring
- Codex-style workspace assistance
- direct structured-file editing

## What Later AI Refinement Should Infer From the English Scene

After the deterministic first pass exists, a later human or AI refinement step should not stop at literal translation.

It should infer:

- the communicative task
- the quest interaction boundaries
- candidate vocabulary entries and chunks
- which entries should be `focus`, `reinforcement`, or only ambient in this interaction
- which repair moves make sense in the interaction
- which lines should stay target-language first
- where support-language mixing should appear during repair
- which quest actions can reinforce the vocabulary
- which world objects, regions, attributes, pickups, and inventory items should carry the meaning

For `Find the Luggage`, that means the refinement pass should notice things like:

- luggage objects
- their colors and distinguishing features
- the door, counter, and nearby landmarks
- the pickup and inventory path for the correct suitcase
- the return step where the player hands it back

## Mixed-Language Drafting Rule for Later Refinement

When a later human or AI pass refines the generated lines, it should draft support-language use as a repair strategy, not as a default translation strip.

That means it should prefer outputs like:

- initial target-language line
- repair line with selective support-language mixing
- chip sets and response scaffolds that recycle target vocabulary

over outputs like:

- target line
- full translated subtitle
- bare `yes/no` choices

## Response Scaffold Drafting Rule

When a later refinement pass adjusts response scaffolds, it should prefer chip sets, prompts, and text supports that recycle active vocabulary and reflect real quest actions.

Examples:

- chip-built response: `Sí, I see la maleta roja.`
- guided blank-fill response with word bank: `La maleta ____ está ____ .` with candidates `azul`, `roja`, `allí`, `aquí`
- natural mixed initial line: `Necesito la maleta azul. Can you show me where it is?`
- clarification repair response rendered in the target language, for example Spanish-target `¿Qué significa "__" en inglés?`
  - the support-language label inside the utterance should also be localized to the target language
- typed response using insert chips: `¿Dónde está la maleta negra?`
- staged B2 repair ladder:
  - first failure: `Show me more words`, `Say it more simply`
  - third failure: `Say it in {supportLanguage}`
- guided return response: `Aquí está la maleta azul.`

It should not default to empty acknowledgements unless the band or interaction truly requires them.

## Grounded Quest Binding Drafting Rule

When a later refinement pass touches grounded quest bindings, it should keep the same referent through the full quest loop whenever the authored interaction supports it:

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
- interaction and object references remain explicit
- creator edits survive regeneration where possible
- file formats remain diff-friendly
- states such as `draft`, `reviewed`, and `approved` are supported

## Typical Creator Flow

1. Author `Find the Luggage` in English, including the actual suitcase object, pickup, inventory item, and return step.
2. Run `Sync From Quest` to generate the first structured Sugarlang overlay for the quest.
3. Review the generated scenario, grounding map, grounded quest binding, and band variants.
4. Ask follow-up refinements when the generated lines or scaffolds need help:
   - `make B0 more immersive and remove the translation-strip feel`
   - `keep chips primary at B0, but make B1 a real word-bank blank-fill band`
   - `make B3 chips appear only after failure`
   - `recycle maleta and roja more aggressively in the responses`
   - `bind the red suitcase to pickup and inventory so the word stays consistent after collection`
   - `allow missing accent marks in the B2 typed response`
5. Use a human pass or outside AI assistant only for the scoped parts that still need refinement.
6. Open the editor and preview the same interactions across bands and language pairs.
7. Ship once the overlays are validated and playtested.

## Why This Workflow Matters

This workflow is essential because the likely creator for Sugarlang is:

- a solo developer
- a small team
- a designer who is not a language pedagogy expert

The system should let that creator author a good game first and then use AI to help turn it into a grounded, immersive language-learning experience.
