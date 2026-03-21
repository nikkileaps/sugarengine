# Plan 012: Explicit Interpret Stage Boundary And Orchestration

## Status

Implemented.

Depends on:

- [Plan 009: Explicit Retrieve Stage Boundary And Orchestration](./009-explicit-retrieve-stage-boundary-and-orchestration.md)
- [Plan 010: Explicit Plan Stage Boundary And Orchestration](./010-explicit-plan-stage-boundary-and-orchestration.md)
- [Plan 011: Remove Evidence-First-Pipeline Compatibility Layer](./011-remove-evidence-first-pipeline-compatibility-layer.md)

## Purpose

Make `Interpret` a first-class stage boundary in code, just like `Retrieve` and `Plan`.

## Outcome

This plan adds:

- [interpret/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/interpret)
- [index.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/interpret/index.ts)
- [stage.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/interpret/stage.ts)

`runtime.ts` now calls a single `runInterpretStage(...)` entry point that owns:

1. initial query interpretation
2. semantic facet enhancement
3. lore-entity route refinement
4. primary referent selection
5. relation-policy attachment
6. final query-type derivation

The stage returns a bounded `InterpretStageResult` that `Retrieve` can consume without reaching back into interpretation internals.

## Architecture Rules

1. `Interpret` remains upstream of `Retrieve`.
2. Stages consume prior-stage outputs and neutral shared modules only.
3. Stages do not import each other's internal helpers.
4. The lifecycle remains globally linear:
   - `Interpret -> Retrieve -> Plan -> Generate -> Audit -> Repair`

## Verification

Implemented with dedicated stage coverage in:

- [stage.test.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/interpret/stage.test.ts)

And verified against the existing runtime retrieval/planning regressions.
