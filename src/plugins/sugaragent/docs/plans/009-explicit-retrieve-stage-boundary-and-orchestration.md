# Plan 009: Explicit Retrieve Stage Boundary And Orchestration

## Status

Proposed.

Depends on:

- [Plan 008: Ring-Based Retrieval Architecture And Subject-Bounded Evidence Pools](./008-ring-based-retrieval-architecture-and-subject-bounded-evidence-pools.md)

Builds on:

- [ADR-019: Evidence Pack Governance And Corrective Retrieval](../adr/019-evidence-pack-governance-and-corrective-retrieval.md)
- [ADR-025: Canonical Live Evidence-First Turn Pipeline](../adr/025-canonical-live-evidence-first-turn-pipeline.md)
- [ADR-035: Subject-Centric Evidence Selection And Relation-Distance](../adr/035-subject-centric-evidence-selection-and-relation-distance.md)

## Purpose

Make the `Retrieve` stage a first-class architectural boundary in code.

Today, the lifecycle concept is important to how the team talks:

1. `Interpret`
2. `Retrieve`
3. `Plan`
4. `Generate`
5. `Audit`
6. `Repair`

But `Retrieve` does not currently exist as one explicit code-level stage entry point. Instead it is spread across:

1. governed retrieval
2. evidence normalization
3. epistemic enrichment
4. retrieval diagnostics
5. runtime-side orchestration glue

This plan creates one explicit retrieve-stage module and one kickoff entry point so:

1. the lifecycle is visible in code,
2. retrieval-specific logic lives together,
3. future ring-based retrieval work has a clean home,
4. runtime orchestration becomes easier to read and reason about.

## Problem Statement

Right now the runtime effectively performs the retrieve stage inline:

1. call governed retrieval,
2. build grounding evidence entries,
3. build evidence pack,
4. enrich evidence epistemically,
5. compute retrieval diagnostics,
6. pass partially transformed state onward to planning.

That makes the stage boundary fuzzy.

Consequences:

1. the lifecycle mental model is not reflected in the file structure,
2. retrieval logic is harder to discover,
3. stage ownership is harder to discuss precisely,
4. changes to retrieval tend to smear across `runtime.ts`, `retrieval-pipeline.ts`, `retrieval-governance.ts`, and `evidence-first-pipeline.ts`,
5. it becomes too easy for planning or runtime glue to quietly absorb retrieval responsibilities.

## Goal

Create one canonical retrieve-stage boundary with:

1. a dedicated `retrieve/` directory,
2. one stage kickoff entry point,
3. clear input and output contracts,
4. retrieval-only responsibilities kept inside that boundary.

## Non-Negotiable Rules

1. There must be one explicit retrieve-stage entry point.
2. `runtime.ts` should call that entry point instead of manually orchestrating retrieval substeps inline.
3. Retrieval-specific code should live under a dedicated `retrieve/` directory.
4. The new stage boundary must preserve one-way dependencies:
   - `Interpret -> Retrieve -> Plan`
5. `Plan` must consume retrieve outputs, not reconstruct retrieval decisions itself.
6. This refactor must not change behavior by default; it is primarily a structural clarification and relocation.
7. Ring-based retrieval from Plan 008 must have a natural home inside this stage.

## Intended Directory Shape

Create:

- [retrieve/](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve)

Suggested contents:

- [stage.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/stage.ts)
- [index.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/index.ts)
- [admission.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/admission.ts)
- [rings.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/rings.ts)
- [ranking.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/ranking.ts)
- [quality.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/quality.ts)
- [evidence-pack.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/evidence-pack.ts)
- [diagnostics.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/core/retrieve/diagnostics.ts)

Exact filenames can vary a little, but the stage boundary should be obvious from the directory and entry point.

## Canonical Entry Point

Introduce one explicit stage kickoff function:

```ts
async function runRetrieveStage(input: RetrieveStageInput): Promise<RetrieveStageResult>
```

or an equivalent small orchestrator class:

```ts
class RetrieveStage {
  async run(input: RetrieveStageInput): Promise<RetrieveStageResult>
}
```

Either is fine.

The important point is not class vs function.

The important point is:

1. there is one named retrieve-stage entry point,
2. it is the only thing `runtime.ts` calls for retrieval,
3. it owns the retrieve-stage choreography.

## Retrieve Stage Responsibilities

The retrieve stage should own:

1. deciding whether retrieval is attempted,
2. governed lore retrieval,
3. ring-based candidate admission and widening,
4. retrieval quality evaluation,
5. grounding evidence entry construction,
6. evidence pack normalization,
7. subject-relevance attachment,
8. epistemic enrichment,
9. compact retrieval diagnostics.

The retrieve stage should not own:

1. interpretation
2. initiative policy
3. claim planning
4. realization
5. audit
6. repair

## Proposed Input Contract

Example shape:

```ts
interface RetrieveStageInput {
  npcId: string;
  npcName: string;
  playerMessage: string;
  routing: RoutingResult;
  queryType: QueryType;
  mode: ConversationMode;
  loreArtifacts?: LoreArtifacts | null;
  npcProfile: NpcProfileLike;
  memoryFacts: MemoryFact[];
  history: ConversationTurn[];
  turnContext?: RuntimeTurnContextLike;
  beatContract?: BeatContractLike | null;
  embedTexts?: ((texts: string[]) => Promise<number[][]>) | null;
}
```

The exact contract can differ, but it should be stage-shaped rather than low-level-helper-shaped.

## Proposed Output Contract

Example shape:

```ts
interface RetrieveStageResult {
  attempted: boolean;
  retrieval: GovernedRetrievalDiagnosticsLike;
  loreMatches: LoreMatchCandidate[];
  groundingEvidenceEntries: GroundingEvidenceEntry[];
  evidencePack: EvidencePackLike;
  enrichedEvidencePack: EnrichedEvidencePack;
  diagnostics: RetrieveStageDiagnostics;
}
```

This output becomes the handoff from `Retrieve` to `Plan`.

That is the key architectural win:

1. Retrieve produces one bounded result,
2. Plan consumes it,
3. the lifecycle handoff is explicit in code.

## Refactor Strategy

### Phase 9A: Stage Contract Extraction

Define the retrieve-stage input/output contracts and the canonical entry point.

Deliverables:

1. `RetrieveStageInput`
2. `RetrieveStageResult`
3. `runRetrieveStage(...)` or `RetrieveStage.run(...)`

### Phase 9B: Move Runtime-Orchestrated Retrieval Glue

Move the current inline retrieval choreography from [runtime.ts](/Users/nikki/projects/sugarengine/packages/sugaragent-runtime-core/src/session/runtime.ts) into the retrieve stage:

1. scope preparation
2. `runGovernedLoreRetrieval(...)`
3. evidence entry building
4. evidence pack building
5. epistemic enrichment
6. retrieval diagnostics emission

`runtime.ts` should become:

1. call Interpret
2. call Retrieve
3. call Plan
4. continue with downstream lifecycle stages

### Phase 9C: Retrieval Submodule Organization

Move retrieval-owned helper logic under `retrieve/`:

1. admission/rings
2. ranking
3. quality
4. evidence-pack assembly
5. diagnostics

This phase may initially re-export existing implementations while files are moved incrementally.

### Phase 9D: Integrate Plan 008

Use the new retrieve-stage boundary as the home for ring-based retrieval.

This is the main reason Plan 009 should follow Plan 008 rather than precede it too early:

1. Plan 008 defines the retrieval architecture,
2. Plan 009 gives that architecture an explicit stage boundary in code.

### Phase 9E: Tests And Stage-Level Evals

Add explicit retrieve-stage tests:

1. self query retrieval
2. world overview retrieval
3. associated-evidence widening
4. diagnostics shape

These tests should exercise the stage entry point, not only the lower-level helpers.

## Migration Notes

During migration, it is acceptable to:

1. keep existing helper modules alive temporarily,
2. move orchestration first,
3. collapse lower-level helpers afterward.

But the end state should not preserve:

1. one implicit retrieve stage in `runtime.ts`,
2. plus a second explicit retrieve stage wrapper elsewhere.

There must be one canonical stage boundary.

## Acceptance Criteria

1. There is a dedicated `retrieve/` directory under runtime-core session core.
2. There is one explicit retrieve-stage kickoff entry point.
3. `runtime.ts` no longer manually orchestrates retrieval substeps inline.
4. The retrieve stage returns one bounded handoff object for planning.
5. Ring-based retrieval from Plan 008 lives under the retrieve-stage boundary.
6. The lifecycle `Interpret -> Retrieve -> Plan -> Generate -> Audit -> Repair` is visible in the runtime orchestration code.
7. Retrieval behavior remains unchanged except for changes intentionally introduced by Plan 008.

## Non-Goals

1. No rewrite of the whole lifecycle into classes if small functions remain the better fit.
2. No new online LLM pass.
3. No change to plugin/browser transport boundaries.
4. No item/object referent work in this plan.

