# Plan 011: Remove The `evidence-first-pipeline` Compatibility Layer

## Status

Implemented.

Depends on:

- [Plan 009: Explicit Retrieve Stage Boundary And Orchestration](./009-explicit-retrieve-stage-boundary-and-orchestration.md)
- [Plan 010: Explicit Plan Stage Boundary And Orchestration](./010-explicit-plan-stage-boundary-and-orchestration.md)

Builds on:

- [ADR-025: Canonical Live Evidence-First Turn Pipeline](../adr/025-canonical-live-evidence-first-turn-pipeline.md)
- [ADR-035: Subject-Centric Evidence Selection And Relation-Distance](../adr/035-subject-centric-evidence-selection-and-relation-distance.md)

## Purpose

Remove [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts) as a compatibility surface and finish moving its remaining responsibilities to explicit lifecycle-stage homes.

The runtime now has:

1. an explicit `Retrieve` stage
2. an explicit `Plan` stage

But `evidence-first-pipeline.ts` still exists as a mixed compatibility layer that exports logic from multiple stages.

That file is now an architectural liability because it keeps older implicit boundaries alive after the explicit stages already exist.

## Problem Statement

Today [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts) still exports:

1. snapshot construction
2. epistemic enrichment
3. plan helper logic
4. deterministic social fallback
5. deterministic grounded realization
6. the old mixed pipeline wrapper

Current consumers:

1. [runtime.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/runtime.ts)
   - `buildNpcStateSnapshot(...)`
   - `realizeDeterministicPlan(...)`
2. [retrieve/stage.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/stage.ts)
   - `enrichEvidencePackWithEpistemics(...)`
3. [plan/stage.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/stage.ts)
   - `buildDeterministicSocialReply(...)`
   - `createEvidenceFirstTurnPlanV2(...)`
   - `validateAndRepairTurnPlanV2(...)`
   - `hasDirectAnswerableStateEvidence(...)`
   - `isEvidenceItemRelevantForTurn(...)`
4. legacy tests

So the wrapper is still acting like a bag of unrelated exports instead of a single-stage module.

That violates the architecture goals:

1. one source of truth
2. single enforcer
3. explicit lifecycle stages
4. one-way dependencies

## Goal

Delete [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts) by first relocating each remaining export to the stage or support module that actually owns it.

## Non-Negotiable Rules

1. `evidence-first-pipeline.ts` must end this plan deleted, not merely deprecated.
2. No behavior should depend on the old mixed pipeline wrapper remaining in place.
3. Each remaining export must move to one clear home:
   - a stage-local module if the logic is truly stage-specific, or
   - a neutral shared support module if the logic is used by more than one stage
4. Runtime must keep explicit stage orchestration:
   - `Interpret -> Retrieve -> Plan -> Generate -> Audit -> Repair`
5. Stages may consume:
   - prior-stage output objects, and
   - neutral shared support modules
   But stages must not import another stage's internal helpers.
6. The lifecycle is a globally linear pipeline, not a general graph or state machine.
7. Bounded retries or corrective passes may exist inside a stage, but they must not create upstream stage cycles.
8. No new duplicate helper surfaces should be introduced while removing the old one.

## Remaining Exports To Rehome

Current exports from [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts):

1. `buildNpcStateSnapshot(...)`
2. `enrichEvidencePackWithEpistemics(...)`
3. `isEvidenceItemRelevantForTurn(...)`
4. `buildDeterministicSocialReply(...)`
5. `hasDirectAnswerableStateEvidence(...)`
6. `createEvidenceFirstTurnPlanV2(...)`
7. `validateAndRepairTurnPlanV2(...)`
8. `realizeDeterministicPlan(...)`
9. `runEvidenceFirstPipeline(...)`

Intended destination:

1. `buildNpcStateSnapshot(...)`
   - move to a support module such as `snapshot.ts` or `turn-snapshot.ts`
2. `enrichEvidencePackWithEpistemics(...)`
   - move to a neutral shared evidence module such as `evidence/epistemics.ts` or `evidence-pack.ts`
3. `isEvidenceItemRelevantForTurn(...)`
   - move under [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan)
4. `buildDeterministicSocialReply(...)`
   - move to a neutral shared realization/materialization module, not under a stage directory
5. `hasDirectAnswerableStateEvidence(...)`
   - move under [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan)
6. `createEvidenceFirstTurnPlanV2(...)`
   - move under [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan)
7. `validateAndRepairTurnPlanV2(...)`
   - move under [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan)
8. `realizeDeterministicPlan(...)`
   - move to a neutral shared realization/materialization module such as `realization/` or `turn-realization/`
9. `runEvidenceFirstPipeline(...)`
   - delete after all callers/tests are migrated

## Refactor Strategy

### Phase 11A: Move Shared Evidence Helpers To Neutral Modules

Move cross-stage evidence shaping code out first:

1. `enrichEvidencePackWithEpistemics(...)` into a neutral shared module
2. keep that shared module below the stage layer so both `Retrieve` and later stages can consume it one-way
3. update [retrieve/stage.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/stage.ts) to import from the shared home

This removes the `Retrieve -> evidence-first-pipeline` dependency without making `Retrieve` the owner of cross-stage evidence logic.

### Phase 11B: Move Plan-Owned Helpers

Move plan-owned code into [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan):

1. `isEvidenceItemRelevantForTurn(...)`
2. `hasDirectAnswerableStateEvidence(...)`
3. `createEvidenceFirstTurnPlanV2(...)`
4. `validateAndRepairTurnPlanV2(...)`

Update [plan/stage.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/stage.ts) to import only from plan-local modules.

This removes the `Plan -> evidence-first-pipeline` dependency.

### Phase 11C: Move Shared Realization Helpers To Neutral Modules

Move deterministic realization helpers out of the wrapper into a neutral lower-level module:

1. move `buildDeterministicSocialReply(...)`
2. move `realizeDeterministicPlan(...)`

Suggested destination:

- `realization/`
- `turn-realization/`
- another neutral support module below the lifecycle-stage layer

The important point is:

1. these exports must stop living in a pipeline wrapper file
2. `Plan` must not import from a future `Generate` stage directory
3. both `Plan` and `Generate` may depend on neutral shared realization/materialization code one-way
4. `Generate` should consume `PlanStageResult` / validated-plan output, not plan-internal helpers

### Phase 11D: Move Snapshot Builder To Support Code

Move `buildNpcStateSnapshot(...)` to a neutral support module because it is not really `Retrieve`, `Plan`, or `Generate`.

Suggested destination:

- `snapshot.ts`
- `turn-snapshot.ts`

This should be a small support-module move, not a new lifecycle stage.

### Phase 11E: Delete The Wrapper

Once all imports are migrated:

1. update tests to import from real stage/support modules
2. delete `runEvidenceFirstPipeline(...)`
3. delete [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts)

There should be no re-export tombstone left behind.

## Migration Notes

The safe order is:

1. move shared evidence helpers
2. move plan-owned helpers
3. move shared realization helpers
4. move snapshot builder
5. migrate tests
6. delete wrapper file

Do not start by deleting the wrapper first.

The whole reason the wrapper still exists is that it currently hides cross-stage ownership.

The intended dependency shape after this plan is:

1. `Retrieve` consumes `Interpret` output and shared support modules
2. `Plan` consumes `RetrieveStageResult` and shared support modules
3. `Generate` consumes `PlanStageResult` / validated plan and shared support modules
4. no stage imports another stage's internal helper modules
5. the lifecycle proceeds forward stage-by-stage rather than branching into a graph of stage calls

## Acceptance Criteria

1. [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts) no longer exists.
2. `Retrieve` no longer imports anything from the old wrapper.
3. shared evidence shaping lives in a neutral support module rather than under a lifecycle-stage directory.
4. `Plan` no longer imports anything from the old wrapper.
5. shared realization/materialization lives in a neutral support module rather than under a lifecycle-stage directory.
6. `Plan` does not depend on a `Generate` stage module.
7. no stage imports another stage's internal helper modules.
8. the stage orchestration remains globally linear rather than becoming a graph or state machine.
9. snapshot construction has an explicit non-wrapper home.
10. runtime still orchestrates explicit stages in order.
11. targeted retrieve/plan/runtime regressions stay green.

## Non-Goals

1. No need to fully extract `Generate`, `Audit`, and `Repair` as explicit stage directories in the same patch, as long as deterministic realization leaves the old wrapper and moves to a neutral shared home.
2. No new online LLM pass.
3. No transport/plugin boundary changes.
4. No item/object referent work in this plan.
