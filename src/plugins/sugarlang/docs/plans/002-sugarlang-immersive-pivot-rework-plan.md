# Sugarlang Immersive Pivot Rework Plan

## Status

This is the canonical forward implementation plan for Sugarlang after the immersive product pivot.

It assumes:

- the original Phase 1 and Phase 2 work from `001-sugarlang-v1-implementation-plan.md` has already produced a working baseline,
- the current product docs are the binding description of the intended product,
- the current architecture and ADR set have already been updated to match that product.

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
- `src/plugins/sugarlang/docs/product/contracts/v1-grounded-quest-binding-model.md`
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

### Planning Context

- `src/plugins/sugarlang/docs/plans/000-sugarlang-immersive-pivot-memo.md`
- `src/plugins/sugarlang/docs/plans/001-sugarlang-v1-implementation-plan.md`

## Goal

Rework the existing Sugarlang baseline into the immersive V1 product now described by the product docs:

1. immersive and repair-driven rather than translation-strip-first,
2. scripted-first and fully usable without SugarAgent,
3. grounded in quest actions, world context, and recurring vocabulary,
4. previewable band by band inside SugarEngine,
5. still compatible with optional SugarAgent composition and later production hardening.

## Planning Rules

1. This plan starts from the current implemented codebase, not from a blank slate.
2. The product README and product-contract docs are binding.
3. Each phase must end with a previewable milestone inside SugarEngine.
4. Rework aligned systems; do not rewrite foundational systems that already match the architecture.
5. Preserve scripted-only Sugarlang as a first-class path in every phase.
6. Preserve forward-compatible seams for later AI-runtime, replay, eval, and observability work.
7. Do not reintroduce translation-strip-first behavior, low-band typing, or token-spliced mixed-language surfaces.

## Current Baseline

The current implementation already provides a meaningful baseline:

1. the engine-owned conversation host exists,
2. provider/middleware composition exists,
3. Sugarlang exists as a separate plugin,
4. scripted conversation works as a first-class path,
5. learner state and deterministic evaluation exist in early form,
6. `Find the Luggage` content exists across the supported language directions and bands,
7. preview/testing has exposed the need for the immersive pivot.

That means the next plan is not about proving the architecture from scratch.

It is about:

- reworking the product surfaces and runtime contracts that still reflect the pre-pivot model,
- aligning the content/runtime/editor behavior to the updated product docs,
- hardening the result for continued iteration.

## Phase Overview

| Phase | Outcome | Preview target |
| --- | --- | --- |
| 1 | Low-band immersive rework | Play `Find the Luggage` in `B0` and `B1` with the new immersive contract: chips-only `B0`, word-bank `B1`, tap-only repair, natural mixed-language helper lines, grounded quest actions |
| 2 | Artifact/runtime alignment | Run the same low-band experience from the updated artifact model: scene language packs drive initial delivery, repair, happy-path response frames, and grounded band variants |
| 3 | Mid-band and evaluator alignment | Play `B2` and `B3` with the updated typed-response, degradation, and deterministic evaluation contract |
| 4 | Authoring and preview alignment | Persist, validate, preview, and iteratively refine the updated Sugarlang overlay model from the editor, an external AI assistant, or direct structured-file editing |
| 5 | Optional SugarAgent re-alignment and production hardening | Use the same Sugarlang scene model in scripted-only and SugarAgent-assisted advanced scenes, with replays, traces, and evals aligned to the post-pivot contract |
| 6 | Full Sugarlang authoring suite | Build the dedicated in-editor Sugarlang authoring surfaces and integrated draft/refinement workflow on top of the V1 artifact model |

## Coverage Map

| Doc set | Primary implementation phase |
| --- | --- |
| Product README | Phases 1-5 |
| Use cases UC-001 to UC-005 | Phases 1-5 |
| V1 learner band matrix | Phases 1-3 |
| V1 language content model | Phases 1-4 |
| V1 authoring artifact model | Phases 2 and 4 |
| V1 grounded quest binding model | Phases 1-2 |
| V1 golden slice | Phases 1-3 |
| Strategic architecture | Phases 1-5 |
| ADR-001 to ADR-005 | Phases 1-4 |
| ADR-006 to ADR-008 | Phase 5, with compatibility seams preserved earlier |

## Phase 1: Low-Band Immersive Rework

### Outcome

Rework the existing low-band Sugarlang experience so it actually matches the current product definition of immersive learning.

This phase is successful when `B0` and `B1` no longer feel like translation-strip or worksheet interactions and instead feel like:

- context-first comprehension,
- mixed-language helper delivery,
- repair-driven recovery,
- grounded quest action,
- deliberate vocabulary recurrence.

### Scope

#### Response-mode rework

1. Make `B0` explicitly `chip composition` only.
2. Remove any `B0` assumption that a visible word bank or free typing is part of the happy path.
3. Make `B1` explicitly `word-bank blank fill` / `guided assembly`.
4. Ensure the `B1` word bank contains plausible scene-grounded candidates, including limited distractors where appropriate.
5. Ensure repair responses are separate UI affordances, not chips.

#### Clarification and repair rework

1. Make low-band clarification tap-only.
2. Ensure low-band repair responses behave as valid in-world responses, not out-of-band utility buttons.
3. Support the low-band repair set described by the product docs, including:
   - `No entiendo`
   - `Señálalo`
   - target-language clarification templates
4. Ensure repair increases support, simplifies phrasing, or adds grounding without breaking the scene flow.

#### Mixed-language surface rework

1. Replace translation-strip-first behavior with scene-authored mixed-language helper utterances.
2. Ensure mixed language is controlled by:
   - learner band,
   - support language,
   - target language,
   - target vocabulary exposure,
   - scene context.
3. Enforce the product rule that mixed-language lines must sound like believable in-world helper utterances.
4. If a mixed final response sounds unnatural, keep the completed response natural and move support into the prompt, scaffold, or repair.

#### Grounded quest-loop rework

1. Ensure `maleta` and the band-specific luggage variant stay linked across:
   - NPC dialogue,
   - object highlight,
   - object inspection,
   - pickup,
   - inventory/held state,
   - return objective.
2. Ensure the low-band experience repeatedly re-encounters the target vocabulary through those actions.
3. Verify that support and repair can point, highlight, or otherwise ground the correct referent without leaving the quest loop.

### Preview Target

A creator can preview `Find the Luggage` in `B0` and `B1` and see a clearly different low-band progression:

1. `B0` uses mixed-language initial delivery plus chip-built response composition.
2. `B1` uses mixed-language initial delivery plus word-bank blank fill.
3. Both bands use tap-only repair responses.
4. Both bands keep the player in the quest/world loop rather than relying on a translation strip.

### Exit Criteria

1. `B0` and `B1` match the current product README, learner-band matrix, and golden slice.
2. Low-band clarification is tap-only.
3. `B1` is visibly and mechanically distinct from `B0`.
4. Translation-strip-first behavior is removed from the canonical low-band experience.
5. The same quest progression still works deterministically.

## Phase 2: Artifact and Runtime Alignment

### Outcome

Align the running system with the updated artifact model so the post-pivot product is driven by the right authoring/runtime boundaries rather than by incidental implementation logic.

### Scope

#### Scene language pack alignment

1. Ensure scene language packs own:
   - initial delivery lines,
   - repair variants,
   - happy-path response frames,
   - allowed support-language glue,
   - protected target-language units.
2. Ensure runtime surface rendering is driven from that authored model rather than ad hoc response assembly.
3. Ensure low-band mixed-language behavior is selectable per scene and per band.

#### Grounded binding alignment

1. Implement the stable scenario-level referent plus per-band concrete-variant model from the grounded quest binding contract.
2. Ensure the runtime can resolve:
   - stable semantic referent,
   - band-specific world object,
   - quest action chain,
   - inventory linkage.
3. Ensure grounding maps, scene language packs, and runtime quest state all reference the same stable identities.

#### Runtime contract alignment

1. Align the runtime response-contract model with the updated product taxonomy:
   - chip composition,
   - word-bank blank fill,
   - repair response,
   - typed response,
   - degradation path.
2. Align the middleware/provider constraint bundle with the updated mixed-language, scaffold, and grounded-variant rules.
3. Ensure learner evidence captures:
   - which surface type was shown,
   - which repair path was used,
   - which grounded aids were offered or used,
   - which band variant was active.

### Preview Target

A creator can inspect a `Find the Luggage` scene and verify that the low-band runtime behavior is being driven by the post-pivot artifact model rather than by pre-pivot assumptions embedded in the runtime.

### Exit Criteria

1. Scene language packs are the canonical source for low-band surface behavior.
2. Stable scenario referents and band variants are represented consistently through the quest loop.
3. Runtime response modes and evidence capture match the updated contracts.
4. The implementation no longer depends on pre-pivot artifact assumptions.

## Phase 3: Mid-Band and Evaluator Alignment

### Outcome

Bring `B2` and `B3` into alignment with the current product so the progression from low-band support to typed interaction feels coherent and deterministic.

### Scope

#### Response progression

1. Make `B2` the first typed band with bounded typed clarification support.
2. Keep insert-bank or bounded support available where the product contract expects it.
3. Make `B3` typing-first, with stronger scaffolds available only as fallback or recovery.
4. Preserve repair-driven interaction at mid bands, but with less visible support than `B0/B1`.

#### Evaluator alignment

1. Update deterministic evaluators so they cleanly cover:
   - word-bank blank fill,
   - typed clarification,
   - constrained one-sentence responses,
   - repair-driven degradation paths.
2. Keep the separation between:
   - communicative success,
   - language accuracy,
   - support dependence.
3. Ensure repeated failure can degrade to stronger support without breaking quest progression.

#### Vocabulary and recurrence alignment

1. Verify that previously introduced vocabulary is deliberately recycled through:
   - NPC prompts,
   - player responses,
   - repair,
   - world actions,
   - return/completion steps.
2. Ensure the product’s recurrence and reinforcement rules are visible in the actual scene behavior.

### Preview Target

A creator can preview `B2` and `B3`, fail and recover through support, and confirm that the typed-band behavior still feels like immersive quest interaction rather than a detached text exercise.

### Exit Criteria

1. `B2` and `B3` match the current learner-band matrix, use cases, and golden slice.
2. Deterministic evaluation reflects the revised response taxonomy.
3. Typed-band degradation paths work without collapsing into dead ends.
4. Quest completion remains based on communicative/task success rather than perfect grammar.

## Phase 4: Authoring and Preview Alignment

### Outcome

Build the V1 authoring foundation for the post-pivot Sugarlang model:

- canonical on-disk artifact persistence,
- loader/serializer/validator support,
- minimal editor integration for preview and inspection,
- one shared artifact model that can also be edited directly or by an external AI assistant.

This phase does **not** require building a full in-product AI generation stack or a full dedicated Sugarlang editor suite.

### Scope

#### Artifact persistence and loading

1. Implement the canonical Sugarlang on-disk layout under `plugins/sugarlang/`.
2. Use human-readable JSON files as the canonical persisted artifact format for V1.
3. Implement loaders, serializers, and validation for:
   - scenario artifacts,
   - shared defaults,
   - per-language scene packs,
   - grounded quest bindings,
   - grounding maps.
4. Migrate the canonical `Find the Luggage` content out of TypeScript module exports into those persisted artifacts.
5. If temporary import bridges are needed during migration, keep them transitional and non-canonical.

#### Structural draft scaffolding

1. Implement a non-LLM structural drafting path that can read existing English-authored game structure and emit correctly shaped Sugarlang artifact skeletons.
2. Limit that drafting scope to:
   - stable source references,
   - scenario shells,
   - grounding/binding shells,
   - per-language scene-pack shells,
   - status fields and validation metadata.
3. Do **not** require semantic inference, natural-language drafting, or mixed-language pedagogy generation inside Phase 4 product code.
4. Reserve language-specific drafting and refinement for:
   - direct human editing of the artifact files,
   - external AI-assisted generation/refinement operating on those same files.

#### Minimal editor and preview alignment

1. Update editor preview and refinement surfaces to reflect:
   - project-level Sugarlang enablement/config,
   - artifact-backed language/band preview switching,
   - validation and artifact inspection,
   - the current band behaviors described by the product docs.
2. Replace the hardcoded preview-only Sugarlang toggle with artifact-backed/project-backed preview wiring.
3. Add a minimal Sugarlang inspection surface rather than a full seven-panel authoring suite.
4. V1 does **not** require dedicated editor panels for:
   - semantic scenario authoring,
   - repair policy editing,
   - grounding map editing,
   - grounded quest binding editing,
   - full learner-band matrix editing.
5. Preserve round-trip-safe file editing and preview reload behavior.

#### External AI and direct-file editing alignment

1. Treat chat-based AI authoring in V1 as an external assistant operating on workspace files, not as a built-in editor chat client.
2. Ensure the artifact model, loader, and validator make that workflow safe and repeatable.
3. Do not add a CLI authoring path in V1.

#### Preview and validation alignment

1. Add validations for the updated artifact boundaries and band contracts.
2. Ensure the creator can preview both language directions and adjacent bands with the new low-band and mid-band behavior from persisted artifacts.
3. Add regression fixtures for the post-pivot golden slice.

### Preview Target

A creator can enable Sugarlang for a project, load persisted Sugarlang artifacts from disk, preview the result across bands and language directions, inspect validation output, edit the structured artifact files directly or through an external AI assistant, and then reload the preview against the same artifact model.

### Exit Criteria

1. Canonical Sugarlang content is persisted as JSON artifacts under the game root rather than as TypeScript-only demo content.
2. Loader/serializer/validator support the current artifact model and product contracts.
3. The editor can preview and inspect those artifacts without relying on hardcoded demo wiring.
4. External AI-assisted editing and direct structured-file editing both operate safely on the same artifact model.
5. Preview tooling makes the band progression and language-pair progression easy to inspect.

## Phase 5: Optional SugarAgent Re-Alignment and Production Hardening

### Outcome

Finish the post-pivot production shape so Sugarlang remains complete without SugarAgent, but composes cleanly with SugarAgent where advanced free-form interaction is valuable.

### Scope

#### SugarAgent re-alignment

1. Ensure SugarAgent composition consumes the same updated Sugarlang constraint bundle used by scripted scenes.
2. Ensure Sugarlang still owns:
   - pedagogical policy,
   - learner-band behavior,
   - support-language policy,
   - repair/degradation expectations,
   - evidence capture.
3. Ensure agent-assisted scenes do not regress the immersive/repair-driven product into translation-strip behavior.

#### Observability and replay

1. Ensure traces and replays preserve the post-pivot surface model, including:
   - initial delivery type,
   - repair path,
   - response mode,
   - support language,
   - grounded variant,
   - evaluator result.
2. Add eval and replay fixtures for both scripted-only and SugarAgent-assisted advanced scenes.

#### Hardening

1. Verify plugin-off, scripted-only, and SugarAgent-assisted modes remain safe.
2. Verify save/load continuity under the updated contracts.
3. Verify the implementation still preserves future compatibility with local AI, commercial API usage, and self-hosted inference.

### Preview Target

A creator can preview an advanced scene in both scripted-only and SugarAgent-assisted mode and confirm that the same Sugarlang scene semantics, learner model, support policy, and evidence model remain in effect.

### Exit Criteria

1. Sugarlang remains complete and useful without SugarAgent.
2. SugarAgent composition respects the post-pivot Sugarlang contract.
3. Replay, eval, and observability reflect the post-pivot runtime model.
4. The production shape remains compatible with later AI-topology changes.

## Phase 6: Full Sugarlang Authoring Suite

### Status

Post-V1 expansion phase. Not required for V1 complete.

### Outcome

Build the richer integrated Sugarlang authoring environment on top of the V1 artifact model, validation layer, and preview/runtime foundation.

This is the phase where Sugarlang stops being primarily:

- persisted files,
- external AI-assisted edits,
- minimal editor preview/config

and becomes a first-class in-editor authoring system.

### Scope

#### Dedicated editor surfaces

1. Build the dedicated Sugarlang editor panels described by the product docs, including:
   - scenario panel,
   - learner band matrix,
   - repair/support policy editor,
   - response scaffold editor,
   - grounding map editor,
   - grounded quest binding editor,
   - placement and preview panel.
2. Make those panels artifact-backed rather than introducing a second hidden authoring model.
3. Ensure edits remain round-trip-safe with direct file editing and external AI-assisted edits.

#### Integrated draft and refinement actions

1. Add integrated editor actions such as:
   - `Generate Sugarlang Draft`
   - `Regenerate Beginner Bands`
   - `Regenerate Repair Policy`
   - `Generate English Variants`
   - `Generate Spanish Variants`
   - `Rebuild Grounded Quest Binding`
2. Ensure these actions operate on the same artifact model and validation rules already established in Phase 4.
3. Keep built-in generation optional and replaceable so future local-model, API-model, or self-hosted model deployments can plug into the same workflow.

#### Rich preview and review tooling

1. Expand preview tooling so creators can compare:
   - adjacent bands,
   - support-language and target-language pairs,
   - repair ladder states,
   - grounded variant behavior.
2. Add artifact-aware diff/review flows so generated changes can be inspected before acceptance.
3. Add stronger validation/reporting for drift between base authored scenes and Sugarlang overlays.

### Preview Target

A creator can stay inside the editor, generate or refine a Sugarlang scene draft, inspect and edit the scenario/band/repair/grounding artifacts through dedicated panels, preview the result immediately, and still fall back to direct artifact editing or external AI-assisted edits without model drift.

### Exit Criteria

1. The full Sugarlang editor suite exists and is backed by the same artifact model used in V1.
2. Integrated draft/refinement actions operate safely on those artifacts.
3. Direct file editing, external AI-assisted editing, and editor-driven editing remain interoperable.
4. The dedicated authoring experience does not create a second source of truth.

## Validation Rules Across All Phases

After each phase:

1. run targeted automated tests for the changed surface,
2. run typecheck and build,
3. run a manual preview of the new milestone,
4. update docs if the implemented runtime behavior changes,
5. capture or refresh a replay fixture, preview artifact, or test scenario for regression use.

## Definition of V1 Complete

Sugarlang V1 is complete when all of the following are true:

1. `Find the Luggage` is playable across all five bands and both supported language directions under the post-pivot product contract.
2. Low-band behavior is immersive and repair-driven rather than translation-strip-first.
3. Mixed-language delivery behaves like an in-world helper utterance rather than token-spliced UI.
4. Grounded quest actions and recurring vocabulary are visible parts of the experience, not incidental embellishments.
5. Scripted-only Sugarlang fully supports the documented use cases.
6. Optional SugarAgent composition works without changing Sugarlang ownership boundaries.
7. Editor preview/config, external AI-assisted file generation, and direct structured-file editing operate on the same updated artifact model.

Phase 6 is explicitly outside this definition of V1 complete.

## Non-Goals for This Plan

1. This plan does not restart the implementation from scratch.
2. This plan does not require abandoning aligned foundational work from the existing codebase.
3. This plan does not expand V1 beyond English and Spanish.
4. This plan does not make commercial API inference or a self-hosted model server mandatory for V1.
