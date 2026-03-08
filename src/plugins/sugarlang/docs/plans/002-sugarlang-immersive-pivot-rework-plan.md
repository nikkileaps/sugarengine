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
| 4 | Authoring and preview alignment | Generate, refine, and preview the updated Sugarlang overlay model from editor, chat, or CLI |
| 5 | Optional SugarAgent re-alignment and production hardening | Use the same Sugarlang scene model in scripted-only and SugarAgent-assisted advanced scenes, with replays, traces, and evals aligned to the post-pivot contract |

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

Make the post-pivot Sugarlang model easy to generate, refine, and preview through the same shared artifact model from editor, chat, and CLI entry points.

### Scope

#### Generation alignment

1. Update the shared draft-generation pipeline so it produces the post-pivot artifact model.
2. Ensure generation can draft:
   - natural mixed-language initial lines,
   - repair variants,
   - happy-path response frames,
   - band-specific grounded variants,
   - response-mode selections,
   - evaluator candidates.
3. Ensure generation respects the natural-helper-utterance rule instead of producing token-spliced mixed lines.

#### Authoring surface alignment

1. Update editor preview and refinement surfaces to reflect:
   - `B0` chips,
   - `B1` word-bank blank fill,
   - low-band repair responses,
   - grounded band variants,
   - scene-language-pack ownership of low-band surfaces.
2. Ensure chat and CLI entry points operate on the same artifact model and validation rules.
3. Preserve round-trip-safe editing and regeneration.

#### Preview and validation alignment

1. Add validations for the updated artifact boundaries and band contracts.
2. Ensure the creator can preview both language directions and adjacent bands with the new low-band and mid-band behavior.
3. Add regression fixtures for the post-pivot golden slice.

### Preview Target

A creator can ask Sugarlang from the editor, chat, or CLI to generate or refine a scene, then preview the result and see the post-pivot low-band and mid-band behavior directly from the generated artifacts.

### Exit Criteria

1. Authoring/generation tools produce the same product the current docs describe.
2. The editor, chat, and CLI operate on one artifact model.
3. Regeneration respects the post-pivot ownership boundaries.
4. Preview tooling makes the band progression and language-pair progression easy to inspect.

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
7. Editor, chat, and CLI authoring flows operate on the same updated artifact model.

## Non-Goals for This Plan

1. This plan does not restart the implementation from scratch.
2. This plan does not require abandoning aligned foundational work from the existing codebase.
3. This plan does not expand V1 beyond English and Spanish.
4. This plan does not make commercial API inference or a self-hosted model server mandatory for V1.
