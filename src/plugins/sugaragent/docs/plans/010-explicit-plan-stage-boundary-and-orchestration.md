# Plan 010: Explicit Plan Stage Boundary And Orchestration

## Status

Implemented.

Depends on:

- [Plan 007: Subject-Centric Evidence Selection And Relation-Distance Planning](./007-subject-centric-evidence-selection-and-relation-distance-planning.md)
- [Plan 008: Ring-Based Retrieval Architecture And Subject-Bounded Evidence Pools](./008-ring-based-retrieval-architecture-and-subject-bounded-evidence-pools.md)
- [Plan 009: Explicit Retrieve Stage Boundary And Orchestration](./009-explicit-retrieve-stage-boundary-and-orchestration.md)

Builds on:

- [ADR-019: Evidence Pack Governance And Corrective Retrieval](../adr/019-evidence-pack-governance-and-corrective-retrieval.md)
- [ADR-025: Canonical Live Evidence-First Turn Pipeline](../adr/025-canonical-live-evidence-first-turn-pipeline.md)
- [ADR-035: Subject-Centric Evidence Selection And Relation-Distance](../adr/035-subject-centric-evidence-selection-and-relation-distance.md)

## Purpose

Make the `Plan` stage a first-class architectural boundary in code.

Today the team talks about the lifecycle as:

1. `Interpret`
2. `Retrieve`
3. `Plan`
4. `Generate`
5. `Audit`
6. `Repair`

`Retrieve` now has an explicit stage boundary. `Plan` still does not.

Planning behavior is currently smeared across:

1. initiative policy resolution in [runtime.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/runtime.ts)
2. evidence-first plan creation in [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts)
3. claim selection helpers in [claim-planning.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/claim-planning.ts)
4. plan validation/repair in [turn-planning.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/turn-planning.ts)
5. planning diagnostics that are currently mixed into evidence-first pipeline output

This plan creates one explicit plan-stage boundary so:

1. the lifecycle is more visible in code,
2. planning responsibilities live together,
3. `Retrieve -> Plan -> Generate` handoffs are explicit,
4. `evidence-first-pipeline.ts` stops being an implicit mixed-stage orchestrator.

## Problem Statement

Right now the runtime effectively performs planning like this:

1. compute novelty and initiative inputs inline,
2. resolve initiative policy inline,
3. call `runEvidenceFirstPipeline(...)`,
4. inside that function, route turn path again,
5. create a plan,
6. validate/repair that plan,
7. realize the plan deterministically,
8. semantically verify the realization,
9. pass the result back to runtime.

That makes `Plan` unclear as a stage boundary.

Consequences:

1. planning is hard to point to as one canonical stage,
2. `evidence-first-pipeline.ts` owns logic from multiple lifecycle stages at once,
3. runtime still carries plan-stage orchestration glue,
4. it is too easy for Generate/Audit behavior to stay fused to Plan behavior,
5. lifecycle refactors risk becoming wrapper-on-wrapper instead of real stage extraction.

## Goal

Create one canonical `Plan` stage boundary with:

1. a dedicated [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan) directory,
2. one plan-stage kickoff entry point,
3. clear input and output contracts,
4. planning-only responsibilities kept inside that boundary.

## Non-Negotiable Rules

1. There must be one explicit plan-stage entry point.
2. Planning-specific code should live under a dedicated [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan) directory.
3. `runtime.ts` should call the plan-stage entry point instead of manually orchestrating plan substeps inline.
4. The new stage boundary must preserve one-way dependencies:
   - `Interpret -> Retrieve -> Plan -> Generate`
5. `Plan` must consume retrieve outputs and return a bounded plan handoff.
6. `Plan` must not keep hidden Generate/Audit/Repair ownership inside its stage wrapper.
7. Stages may consume prior-stage output objects and neutral shared support modules, but must not import another stage's internal helpers.
8. The lifecycle remains a globally linear pipeline rather than a graph or state machine.
9. This refactor should preserve behavior by default; it is primarily structural clarification and relocation.

## Intended Directory Shape

Create:

- [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan)

Suggested contents:

- [plan/index.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/index.ts)
- [plan/stage.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/stage.ts)
- [plan/initiative.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/initiative.ts)
- [plan/evidence-selection.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/evidence-selection.ts)
- [plan/claims.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/claims.ts)
- [plan/validation.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/validation.ts)
- [plan/diagnostics.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/diagnostics.ts)

Exact filenames can vary a little.

The important part is:

1. `plan/` is where plan-stage implementation lives,
2. `plan/index.ts` is the canonical stage surface,
3. runtime can point to one thing and say “this is Plan.”

## Canonical Entry Point

Introduce one explicit stage kickoff function:

```ts
async function runPlanStage(input: PlanStageInput): Promise<PlanStageResult>
```

`runPlanStage(...)` should be exported from [plan/index.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/index.ts), with the implementation living under [plan/stage.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/stage.ts).

That gives us:

1. one visible stage surface,
2. one implementation home,
3. one thing `runtime.ts` calls for planning.

## Plan Stage Responsibilities

The plan stage should own:

1. turn-path-aware planning entry decisions that belong to planning rather than retrieval,
2. initiative policy input preparation and initiative resolution,
3. plan-time evidence selection from the retrieved evidence pack,
4. claim planning and claim prioritization,
5. social/knowledge/recall plan construction,
6. plan validation and repair,
7. compact planning diagnostics,
8. one bounded handoff object for downstream generation.

The plan stage should not own:

1. interpretation
2. retrieval
3. deterministic realization
4. semantic verification of realized text
5. reply-parts model realization
6. memory persistence

## Proposed Input Contract

Example shape:

```ts
interface PlanStageInput {
  playerMessage: string;
  recentNpcReplies: string[];
  routing: RoutingResult;
  retrieve: RetrieveStageResult;
  snapshot: TurnSnapshotLike;
  beatContract?: BeatContractLike | null;
  derivedContext: RuntimeDerivedContextLike;
  topicCoverage: TopicCoverageContextLike;
  loreEntityIds?: string[];
}
```

The exact type names can differ, but the contract should be stage-shaped, not helper-shaped.

Important point:

`Plan` should consume the bounded output of `Retrieve`, not reconstruct retrieval work on its own.

## Proposed Output Contract

Example shape:

```ts
interface PlanStageResult {
  turnRouting: TurnRoutingDecision;
  initiativePolicy: InitiativePolicyLike;
  plan: TurnPlan;
  validatedPlan: ValidatedTurnPlan;
  plannerMeta: PlannerMetaLike;
  diagnostics: PlanStageDiagnostics;
}
```

This output becomes the handoff from `Plan` to `Generate`.

That is the key architectural win:

1. `Retrieve` returns a bounded retrieval result,
2. `Plan` consumes it and returns a bounded plan result,
3. `Generate` consumes the validated plan instead of knowing planning internals,
4. no downstream stage reaches into `Plan` internals directly.

## Current Planning Seams To Consolidate

This plan is intentionally grounded in the code that exists today.

The main planning seams are currently:

1. initiative policy resolution in [runtime.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/runtime.ts) and [initiative.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/initiative.ts)
2. evidence-first plan creation in [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts)
3. claim planning in [claim-planning.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/claim-planning.ts)
4. plan validation/repair in [turn-planning.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/turn-planning.ts)

The plan-stage extraction should consolidate those seams instead of inventing a second planning path.

## Refactor Strategy

### Phase 10A: Stage Contract Extraction

Define the plan-stage input/output contracts and the canonical entry point.

Deliverables:

1. `PlanStageInput`
2. `PlanStageResult`
3. `runPlanStage(...)`
4. [plan/index.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/index.ts) as the canonical stage surface

### Phase 10B: Move Runtime-Orchestrated Planning Glue

Move the current inline planning choreography from [runtime.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/runtime.ts) into the plan stage:

1. novelty-state computation inputs
2. relevant-evidence filtering for initiative
3. retrieval-confidence handoff into initiative
4. initiative policy resolution
5. plan-stage diagnostics preparation

After this phase, `runtime.ts` should conceptually read:

1. call Interpret
2. call Retrieve
3. call Plan
4. call Generate
5. continue downstream

### Phase 10C: Extract Planning Logic Out Of `evidence-first-pipeline.ts`

Move plan-specific responsibilities out of [evidence-first-pipeline.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts):

1. turn-path-aware planning branch selection
2. `createEvidenceFirstTurnPlanV2(...)`
3. planning diagnostics assembly
4. `validateAndRepairTurnPlanV2(...)`

The end state should be:

1. plan creation and validation live under [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan)
2. deterministic realization and semantic verification no longer hide inside the same planning orchestrator

### Phase 10D: Stage-Level Organization

Move planning-owned helper logic under [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan):

1. initiative
2. evidence selection
3. claims
4. validation
5. diagnostics

This phase may initially re-export existing implementations while files move incrementally.

### Phase 10E: Tighten The `Plan -> Generate` Boundary

Make the downstream handoff explicit:

1. `Plan` returns `validatedPlan`
2. `Generate` consumes `validatedPlan`
3. deterministic realization and reply-parts realization are no longer called from inside the plan stage

This does not require fully extracting `Generate` in the same change, but it does require the plan-stage output to be clean enough for that next step.

### Phase 10F: Tests And Stage-Level Evals

Add explicit plan-stage tests:

1. social fast plan creation
2. self knowledge plan creation
3. world overview plan creation
4. initiative-driven clarify / abstain / close outcomes
5. plan validation and repair behavior
6. compact diagnostics shape

These tests should exercise the stage entry point, not only lower-level helpers.

## Migration Notes

During migration, it is acceptable to:

1. keep existing helper modules alive temporarily,
2. move orchestration first,
3. re-export older helpers through the new `plan/` directory while files are being relocated,
4. leave `Generate` extraction for the follow-on plan if the handoff is already explicit.

But the end state should not preserve:

1. one implicit plan stage inside `runtime.ts`,
2. plus a second explicit plan-stage wrapper elsewhere,
3. plus `evidence-first-pipeline.ts` still secretly owning planning orchestration.

There must be one canonical plan-stage boundary.

## Acceptance Criteria

1. There is a dedicated [plan/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan) directory under runtime-core session core.
2. There is one explicit `runPlanStage(...)` kickoff entry point exposed from [plan/index.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/plan/index.ts).
3. `runtime.ts` no longer manually orchestrates planning substeps inline.
4. `Plan` consumes the bounded retrieve-stage result instead of reconstructing retrieval internally.
5. Plan creation and plan validation live under the plan-stage boundary.
6. Deterministic realization and semantic verification are no longer hidden inside the same plan-stage orchestrator.
7. The lifecycle `Interpret -> Retrieve -> Plan -> Generate -> Audit -> Repair` is more visible in runtime orchestration code.
8. No stage imports plan-internal helper modules directly; downstream stages consume plan-stage outputs instead.
9. Planning behavior remains unchanged except for the explicit stage-boundary refactor itself.

## Non-Goals

1. No full rewrite of the whole lifecycle into classes if small functions remain the better fit.
2. No new online LLM pass.
3. No change to plugin/browser transport boundaries.
4. No item/object referent work in this plan.
5. No requirement to fully extract `Generate`, `Audit`, or `Repair` in the same implementation, as long as the `Plan -> Generate` handoff is made explicit.
