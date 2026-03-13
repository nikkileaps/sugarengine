# ADR-022: Evaluation Stack and Deployment Gate Governance

## Status

Accepted

## Context

A complex dialogue architecture can appear correct in isolated tests while failing in real interactions.
If release criteria are not tied to architecture contracts, drift and regressions accumulate.

We need deployment governance that directly reflects the final architecture.

## Decision

Adopt a mandatory, layered evaluation stack with blocking deployment gates.

## Architecture Contract

### Mandatory Evaluation Layers

1. Atomic factual support layer (FActScore-like)
   - claim-level support and unsupported-claim behavior.
2. RAG pipeline quality layer (RAGAs-like)
   - retrieval adequacy, faithfulness, and response relevance.
3. Human-labeled regression layer
   - curated scenario suites covering:
     - identity ownership leakage,
     - beat progression correctness,
     - fallback correctness,
     - conversation exhaustion quality,
     - mixed-initiative quality.

### Gate Policy

1. Deployment is blocked if any mandatory gate fails.
2. No single metric family can override failure in another family.
3. Mode-specific and initiative-specific gates are first-class, not optional add-ons.

### Regression Governance

1. Regression suites are versioned artifacts.
2. Known failure classes remain permanent regression scenarios unless explicitly retired with rationale.
3. Gate history must preserve comparability across artifact/model revisions.

### Observability Contract

Per-turn diagnostics must support gate attribution by including, at minimum:

- resolved mode,
- initiative decision,
- evidence quality path (including corrective retrieval),
- validation/verification outcomes,
- fallback reason when applicable.

## Non-Goals

1. This ADR does not define CI tooling details.
2. This ADR does not define exact threshold values.
3. This ADR does not define implementation sequencing.

## Consequences

### Positive

- Aligns release decisions with architectural correctness, not anecdotal quality.
- Improves long-term reliability and regression accountability.
- Makes tradeoffs visible across factual, narrative, and initiative behavior.

### Tradeoffs

- Requires disciplined maintenance of scenario suites and diagnostics contracts.

## Related

- ADR-019 (evidence/retrieval governance)
- ADR-020 (fact/provenance durability)
- ADR-021 (beat control plane)
