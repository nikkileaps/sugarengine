# ADR-019: Evidence-Pack Governance and Corrective Retrieval

## Status

Accepted

## Context

Evidence-first generation fails in practice when context is unbounded, retrieval quality is weak, or reranking cost is unmanaged.
Long-context dilution, retrieval misses, and hidden reranker cost are architecture risks.

We need explicit governance for evidence composition and retrieval correction, independent of implementation details.

## Decision

Adopt mandatory governance contracts for:

1. evidence-pack budgeting,
2. retrieval quality evaluation with bounded corrective retrieval,
3. reranker budgeting and caching as a first-class control plane.

## Architecture Contract

### Evidence-Pack Budget Contract

Every turn must obey deterministic evidence budgets, including:

- max facts
- max spans
- max context tokens
- max memory items
- max beat facts (narrative/hybrid)

Selection and truncation order must be deterministic and mode-aware.

### Retrieval Quality Contract

Before planning, retrieval quality must be scored for:

- coverage sufficiency
- contradiction risk
- support confidence

If quality is below threshold:

1. one corrective retrieval attempt is permitted,
2. after that, planner must produce clarify/abstain behavior.

No unbounded re-retrieval loops.

### Reranker Governance Contract

Reranking is treated as an explicitly budgeted stage.

Required controls:

- candidate cap by mode
- budget tiers aligned to latency SLOs
- deterministic cache keys including query, scope, artifact version, and model version
- cache invalidation on artifact or model version change
- production reranker class requirement: learned reranker (`cross-encoder` or equivalent) is mandatory for production correctness; heuristic-only rerankers are non-production fallback/test tools only.

Reranker cost and latency must be observable in turn diagnostics.

## Non-Goals

1. This ADR does not define numeric thresholds.
2. This ADR does not define specific ANN or reranker vendors.
3. This ADR does not define implementation sequencing.

## Consequences

### Positive

- Reduces long-context failure modes and hidden retrieval regressions.
- Makes latency/cost quality tradeoffs explicit and governable.
- Improves deterministic fallback behavior under weak retrieval.

### Tradeoffs

- Introduces tighter policy dependencies between retrieval and planner behavior.

## Related

- ADR-013 (claim verification)
- ADR-018 (initiative policy)
- ADR-022 (gate computation and governance)
