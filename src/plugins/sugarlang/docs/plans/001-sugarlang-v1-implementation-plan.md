# Sugarlang V1 Phased Implementation Plan

> Status: Superseded as the forward plan after the immersive pivot.
>
> This document is retained as the historical pre-pivot plan that guided the original Sugarlang Phase 1 and Phase 2 implementation work.
>
> Use `/Users/nikki/projects/sugarengine/src/plugins/sugarlang/docs/plans/000-sugarlang-immersive-pivot-memo.md` for the pivot rationale and `/Users/nikki/projects/sugarengine/src/plugins/sugarlang/docs/plans/002-sugarlang-immersive-pivot-rework-plan.md` for the current canonical forward plan.

## Related Docs

### Product

- `src/plugins/sugarlang/docs/product/README.md`
- `src/plugins/sugarlang/docs/product/authoring-workflow.md`
- `src/plugins/sugarlang/docs/product/uc-001-find-the-luggage-absolute-beginner.md`
- `src/plugins/sugarlang/docs/product/uc-002-find-the-luggage-guided-beginner.md`
- `src/plugins/sugarlang/docs/product/uc-003-find-the-luggage-constrained-conversation.md`
- `src/plugins/sugarlang/docs/product/uc-004-find-the-luggage-intermediate-clarification.md`
- `src/plugins/sugarlang/docs/product/uc-005-find-the-luggage-near-fluent.md`

### Product Contracts

- `src/plugins/sugarlang/docs/product/contracts/v1-learner-band-matrix.md`
- `src/plugins/sugarlang/docs/product/contracts/v1-language-content-model.md`
- `src/plugins/sugarlang/docs/product/contracts/v1-authoring-artifact-model.md`
- `src/plugins/sugarlang/docs/product/contracts/v1-find-the-luggage-golden-slice.md`

### Architecture

- `src/plugins/sugarlang/docs/architecture/sugarlang-strategic-architecture.md`

### ADRs

- `src/plugins/sugarlang/docs/adr/001-english-first-authoring-overlay-and-source-of-truth-model.md`
- `src/plugins/sugarlang/docs/adr/002-engine-owned-conversation-host-with-provider-and-middleware-composition.md`
- `src/plugins/sugarlang/docs/adr/003-shared-scene-semantics-and-response-contract-model.md`
- `src/plugins/sugarlang/docs/adr/004-multidimensional-learner-model-placement-and-turn-evidence-architecture.md`
- `src/plugins/sugarlang/docs/adr/005-deterministic-first-evaluation-feedback-and-support-architecture.md`
- `src/plugins/sugarlang/docs/adr/006-ai-runtime-abstraction-and-deployment-portability.md`
- `src/plugins/sugarlang/docs/adr/007-browser-local-data-storage-and-cache-architecture.md`
- `src/plugins/sugarlang/docs/adr/008-observability-replay-privacy-and-governance-architecture.md`

## Goal

Implement Sugarlang as a separate production-grade plugin that:

1. works with scripted dialogue and quest flows without SugarAgent,
2. optionally composes with SugarAgent for advanced free-flowing conversation,
3. ships a complete V1 pedagogical contract for English and Spanish,
4. supports English-first, AI-assisted content generation and refinement,
5. stays compatible with a browser-based game using local AI and local data stores,
6. does not block later growth toward commercial API models or self-hosted server inference.

## Planning Rules

1. Each phase must end with a usable preview in SugarEngine.
2. Product contracts are binding. Implementation is complete only when runtime behavior matches the V1 band matrix, language content model, authoring artifact model, and `Find the Luggage` golden slice.
3. The base game remains authored in English. Runtime only models `targetLanguage` and `supportLanguage`.
4. Sugarlang content remains file-based source of truth under the game root. Databases are caches, indexes, replay stores, or eval stores only.
5. Scripted-only learning is a first-class path. SugarAgent remains optional throughout the plan.
6. Any AI-assisted feature introduced in V1 must have deterministic fallbacks or bounded degradation when AI is unavailable.

## Phase Overview

| Phase | Outcome | Preview target |
| --- | --- | --- |
| 1 | Engine/plugin foundation plus beginner scripted slice | Play `Find the Luggage` in `B0` and `B1` with no SugarAgent, in both `en -> es` and `es -> en` pairings |
| 2 | Full scripted Sugarlang product slice | Play all five learner bands end to end with placement, adaptation, deterministic evaluation, support-language mixing, and grounding |
| 3 | AI-assisted authoring and editing workflow | Generate, inspect, refine, and preview Sugarlang overlays for an English-authored scene from editor, chat, or CLI |
| 4 | Optional SugarAgent composition plus production hardening | Switch between scripted-only and agent-assisted advanced scenes, inspect traces/replays, and run local evals without changing the core Sugarlang contract |

## Coverage Map

| Doc set | Primary implementation phase |
| --- | --- |
| Product README and use cases | Phases 1-4 |
| V1 learner band matrix | Phases 1-2 |
| V1 language content model | Phases 1-3 |
| V1 authoring artifact model | Phases 1 and 3 |
| V1 golden slice | Phases 1-2 |
| Strategic architecture | Phases 1-4 |
| ADR-001 to ADR-005 | Phases 1-3 |
| ADR-006 to ADR-008 | Phase 4, with compatibility seams introduced earlier where needed |

## Phase 1: Engine and Sugarlang Foundation

### Outcome

Establish the generic engine/plugin foundation and deliver the first playable Sugarlang preview as a scripted-only beginner experience.

This phase is successful when SugarEngine can run `Find the Luggage` as a Sugarlang scene without SugarAgent, using strong support-language mixing and explicit grounding for `B0 Anchored Recognition` and `B1 Guided Response`.

### Critical Migration Constraint

This is the hardest architectural refactor in the whole program.

The current engine conversation path is still built around a first-plugin-wins model and a large amount of SugarAgent-shaped logic in core runtime code.

Phase 1 is not complete if Sugarlang gets a new host while existing scripted and SugarAgent paths continue to bypass it.

The real requirement is:

1. migrate the current conversation path behind the engine-owned host,
2. preserve existing scripted behavior during that migration,
3. preserve existing SugarAgent behavior during that migration,
4. make Sugarlang use the same host from day one.

### Scope

#### Engine work

1. Replace the current first-plugin-wins conversation orchestration with the engine-owned host described in ADR-SL-002.
2. Migrate both the scripted dialogue path and the existing SugarAgent path behind that host so there is only one conversation orchestration model.
3. Split plugin participation into provider and middleware capabilities.
4. Define the normalized turn envelope, provider input constraint bundle, and host-owned execution boundary for dialogue, objective progression, and world actions.
5. Ensure the scripted dialogue path can act as a provider under the same host.
6. Expose runtime language context to the conversation host:
   - `targetLanguage`
   - `supportLanguage`
   - learner-band preview override
7. Add plugin namespaced save/load support needed for Sugarlang session state.

#### Forward-Compatible Seams Introduced in Phase 1

Phase 1 must introduce the compatibility seams needed for the later AI-runtime, replay, eval, and observability work so those are additive rather than breaking.

At minimum, the initial host and Sugarlang runtime contracts should already carry:

- stable session, turn, and trace identifiers
- a provider input constraint bundle with hard requirements and advisory preferences
- target-language and support-language context
- learner-band and support-policy identifiers
- response-contract identity and evaluator identity
- grounding and provenance references
- middleware annotation space for later replay, telemetry, and diagnostics
- evidence records that preserve both raw turn facts and derived scoring outcomes

#### Sugarlang plugin work

1. Create the standalone `sugarlang` plugin shell and registration path.
2. Implement loading for:
   - scenario briefs
   - grounding maps
   - shared defaults
   - English language packs
   - Spanish language packs
3. Implement runtime selection of the correct scene language pack based on `targetLanguage` and learner band.
4. Implement the first Sugarlang middleware path for:
   - support-language policy application
   - grounding metadata attachment
   - response-contract selection
5. Implement B0/B1 deterministic evaluation for:
   - yes/no
   - object selection
   - multiple choice
   - single blank fill
   - phrase assembly

#### UI and interaction work

1. Add the response-mode rendering needed for B0/B1.
2. Add support-language scaffolding UI for beginner bands.
3. Add grounding affordances for:
   - object highlight
   - attribute highlight
   - tap-to-inspect
   - hint-driven camera focus
4. Add a preview control that lets the creator run the scene in:
   - `supportLanguage = English`, `targetLanguage = Spanish`
   - `supportLanguage = Spanish`, `targetLanguage = English`
   - `B0`
   - `B1`

#### Content and product work

1. Create the canonical Sugarlang artifact set for `Find the Luggage`:
   - scenario brief
   - grounding map
   - shared band policy defaults
   - English shared lexicon and grammar starter packs
   - Spanish shared lexicon and grammar starter packs
   - English and Spanish scene language packs for B0/B1
2. Implement only the subset of the language content model needed for:
   - suitcase / `maleta`
   - red / `roja`
   - blue / `azul`
   - yes / `sí`
   - here / `aquí`
   - there / `allí`
   - is / `está`
3. Ensure support-language mixing and grounding behavior match the beginner use cases and golden slice.

### Preview Target

A creator can open SugarEngine preview, choose either English-support/Spanish-target or Spanish-support/English-target, force `B0` or `B1`, and play the first Sugarlang-enabled `Find the Luggage` scene end to end with:

1. scripted-only conversation,
2. mixed-language support strips,
3. visible world grounding,
4. deterministic evaluation,
5. correct quest-state outcomes.

### Exit Criteria

1. The engine no longer assumes a single conversation-owning plugin path.
2. Sugarlang runs as a separate plugin without SugarAgent enabled.
3. The same authored quest logic produces two language-learning realizations:
   - English support, Spanish target
   - Spanish support, English target
4. `B0` and `B1` runtime behavior matches the learner-band matrix and golden slice.
5. Existing SugarAgent conversations still work after the host migration, even though the Phase 1 Sugarlang preview does not require SugarAgent.
6. Quest progression remains engine-owned and deterministic.
7. Sugarlang authored content lives under the game root as file-based source of truth.

## Phase 2: Full Scripted Sugarlang Product Slice

### Outcome

Complete the scripted-only Sugarlang product so the entire five-band experience is real, testable, and aligned with the use case set.

This phase is successful when `Find the Luggage` can be experienced across all five bands with one underlying quest, one semantic scenario, two supported target languages, and no requirement for SugarAgent or an LLM.

### Scope

#### Learner model and placement

1. Implement the multidimensional learner state from ADR-SL-004.
2. Implement initial placement flow and persistence of placement outcome.
3. Implement the mapping from multidimensional learner state to V1 canonical band presets:
   - `B0 Anchored Recognition`
   - `B1 Guided Response`
   - `B2 Constrained Exchange`
   - `B3 Independent Task Dialogue`
   - `B4 Natural Interaction`
4. Track support-language usage, grounding-aid usage, repair behavior, and task success as turn evidence.

#### Sugarlang runtime and adaptation

1. Implement provider-neutral response-contract handling for B2-B4.
2. Implement support-language policy progression across all five bands.
3. Implement grounding progression across all five bands.
4. Implement adaptation logic that chooses the correct response contract, hint style, support-language behavior, and grounding intensity from learner state plus scenario semantics.
5. Keep CEFR-style labels derived and secondary.

#### Deterministic evaluation and feedback

1. Extend evaluation to cover:
   - short constrained text
   - one-sentence typed responses
   - bounded intent expression
   - slot and semantic success checks
2. Separate:
   - task success
   - language accuracy
   - support dependence
   - fluency/readiness signals
3. Implement feedback strategies by band:
   - immediate confirmation
   - delayed correction
   - optional hinting
   - support-on-request
4. Ensure quest success does not collapse into perfect grammar requirements.

#### Content and product completion

1. Finish the V1 `Find the Luggage` content packs for both English and Spanish targets.
2. Implement the full golden-slice concept progression, including advanced referents and vocabulary.
3. Ensure the scripted product can realize all five documented use cases:
   - UC-001 through UC-005
4. Add runtime selection of learner placement and preview override.
5. Add creator-side preview tools to compare adjacent bands and both language pairings.

### Preview Target

A creator can start a new run, choose support language and target language, complete placement, and immediately play `Find the Luggage` in the assigned band. The creator can then override the band and compare all five use-case realizations in preview, all with scripted-only Sugarlang behavior.

### Exit Criteria

1. All five learner bands are implemented and previewable.
2. Both language directions are supported:
   - English support, Spanish target
   - Spanish support, English target
3. The runtime behavior matches:
   - the learner-band matrix,
   - the language content model,
   - the golden slice,
   - all five product use cases.
4. Deterministic evaluation covers the scripted V1 response modes without requiring an LLM.
5. Learner evidence and placement are persisted and affect subsequent scene behavior.

## Phase 3: AI-Assisted Authoring and Content Operations

### Outcome

Make Sugarlang authorable the way the product docs describe: English scene first, Sugarlang overlay generated and refined second, with the editor, chat, and CLI all acting on the same on-disk source of truth.

This phase is successful when a creator can author a normal English quest or dialogue scene, ask Sugarlang to generate the learning overlay, review the generated artifacts, refine them, and preview the result without hand-authoring every pedagogical structure from scratch.

### Scope

#### Shared generation pipeline

1. Implement the shared draft-generation service described in the product README and authoring workflow.
2. Ensure the service can infer from English-authored content:
   - semantic task
   - success model
   - world grounding references
   - target concepts
   - band policy suggestions
   - response contracts
   - deterministic evaluation candidates
3. Ensure the same service can write round-trip-safe Sugarlang artifacts under the game root.
4. Add validation so generated content is checked against the product contracts before preview.

#### Authoring clients

1. Implement editor entry points for:
   - generate draft
   - regenerate scene language packs
   - preview by band and language pair
2. Implement chat-friendly generation commands so an AI assistant can read English-authored content and produce or refine Sugarlang files directly.
3. Implement CLI or automation entry points that call the same generation pipeline.
4. Keep all three clients behaviorally aligned against the same storage model and validation rules.

#### Phase 1 demo scaffolding removal

Phase 1 introduced temporary scaffolding to enable preview testing before the editor has proper sugarlang UI. Phase 3 must remove or replace these:

1. **Hardcoded `sugarlang: true` in Editor.tsx** — The `handlePreview` function injects `sugarlang: true` into project data to activate the demo bundle. Replace with a proper project-level plugin toggle (persisted in `.sgrgame`), matching how `sugaragent` is toggled via the Plugins dialog.
2. **Name-based NPC matching** — The sugarlang provider falls back to case-insensitive NPC display name matching (`npcNames` on `ScenarioBrief`, `npcNameScenarioMap` in the plugin) because Phase 1 has no editor UI to map NPC UUIDs to scenarios. Once the editor's scenario panel lets creators select NPCs from the project NPC list, the mapping should use actual NPC UUIDs and the name-based fallback can be removed (or demoted to a legacy compat path).

#### Editor surfaces

1. Implement the authoring surfaces called for in the product README:
   - Sugarlang scenario panel
   - learner band matrix editor/view
   - response-contract editor
   - support-language policy editor
   - grounding map editor
   - evaluation rules editor
   - support and feedback panel
   - placement preview drawer
2. Make these surfaces usable for refinement, not just generation.
3. Ensure manual edits survive regeneration unless explicitly replaced.

#### Content operations

1. Implement validators for the authoring artifact model.
2. Implement diff-friendly generation and merge behavior.
3. Add fixtures and smoke checks for generated Sugarlang content.
4. Generate at least one non-`Find the Luggage` sample scene to prove the authoring flow generalizes.

### Preview Target

A creator authors or edits an English scene, asks Sugarlang from the editor or chat to generate the overlay, reviews the generated scenario brief, grounding map, defaults, and per-language scene packs, adjusts them, and previews the scene across bands and language pairs.

### Exit Criteria

1. Sugarlang authoring is no longer dependent on manual JSON creation.
2. The same source-of-truth artifacts are editable through editor, chat, and CLI workflows.
3. Generated content is validated before runtime use.
4. Regeneration is safe enough for iterative solo-creator use.
5. The authoring workflow matches the product README and authoring-workflow docs.

## Phase 4: Optional SugarAgent Composition and Production Hardening

### Outcome

Complete the final production shape: Sugarlang remains fully usable without SugarAgent, but can also compose with SugarAgent for advanced free-form conversation while preserving all core Sugarlang contracts and observability guarantees.

This phase is successful when the same Sugarlang scene model can power:

1. scripted-only language learning,
2. agent-assisted advanced interaction,
3. browser-local AI by default,
4. future commercial API and self-hosted server growth without architectural rework.

### Scope

#### SugarAgent composition

1. Integrate SugarAgent as an optional provider under the engine-owned conversation host.
2. Run Sugarlang as middleware over SugarAgent turns using the normalized turn envelope.
3. Apply Sugarlang policy to agent-assisted scenes:
   - target/support language policy
   - band policy
   - response-contract constraints where applicable
   - pedagogical validation
   - evidence capture
4. Preserve scripted-only scenes and provider independence.

#### AI runtime abstraction

1. Implement the AI runtime abstraction from ADR-SL-006 with browser-local execution as the default baseline.
2. Keep deployment topology separate from Sugarlang capability decisions.
3. Ensure the first implementation does not hardcode one inference vendor into the Sugarlang core contract.
4. Add the seams required for future:
   - commercial API via server boundary
   - self-hosted OpenAI-compatible server
5. Do not make V1 depend on those future topologies being present.

#### Local data, replay, and observability

1. Implement the local data model described in ADR-SL-007:
   - file-based authored source of truth
   - local relational store for derived runtime state where needed
   - pluggable caches
   - optional vector storage without making it canonical
2. Implement the replay, trace, and eval pipeline from ADR-SL-008.
3. Capture normalized traces with:
   - language pair
   - band
   - support-language policy path
   - response contract
   - grounding aids shown and used
   - evaluation results
   - task outcomes
4. Implement privacy and retention defaults that are explicit and inspectable.

#### Product hardening

1. Build eval fixtures around the golden slice and generated content.
2. Verify the same Sugarlang logic works across:
   - scripted-only scenes
   - mixed scenes
   - SugarAgent-assisted scenes
3. Verify plugin-off baseline remains safe.
4. Verify Sugarlang save/load continuity and preview determinism.

### Preview Target

A creator can preview the advanced `Find the Luggage` experience in two modes:

1. scripted-only Sugarlang,
2. SugarAgent-assisted Sugarlang

and inspect the resulting traces, replays, and evaluation outputs locally. The scene still uses the same Sugarlang scenario, band policy, support-language policy, and grounding model in both modes.

### Exit Criteria

1. Sugarlang remains complete and useful without SugarAgent.
2. SugarAgent composition works without collapsing plugin boundaries.
3. Browser-local AI is the default supported deployment path for agent-assisted scenes.
4. The implementation is not orthogonal to later commercial API or self-hosted server adoption.
5. Replay, observability, privacy, and eval tooling are in place for ongoing iteration.

## Validation Rules Across All Phases

After each phase:

1. run targeted automated tests for the phase surface,
2. run typecheck and build,
3. run a manual preview of the new milestone,
4. update Sugarlang docs where runtime behavior or authoring workflow changed,
5. capture at least one replay fixture or preview artifact for regression use.

## Definition of V1 Complete

Sugarlang V1 is complete when all of the following are true:

1. `Find the Luggage` is playable in all five bands with one quest and two supported language directions.
2. Support-language mixing and grounding are first-class runtime behaviors, not one-off scene hacks.
3. Scripted dialogue alone is sufficient for the full V1 use-case set.
4. SugarAgent is optional and composes through the engine host and middleware model.
5. English-authored scenes can be turned into Sugarlang overlays through editor, chat, or CLI.
6. The learner model, placement flow, evaluation model, and feedback behavior match the product contracts.
7. The source-of-truth, observability, and privacy model match the architecture and ADR set.

## Non-Goals for This Plan

1. This plan does not attempt to ship more than English and Spanish in V1.
2. This plan does not require commercial API inference for V1.
3. This plan does not require a self-hosted model server for V1.
4. This plan does not broaden the initial content scope beyond the defined V1 vertical slice plus one or more authoring-proof scenes.
