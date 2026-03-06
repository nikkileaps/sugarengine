# ADR-020: Fact ID and Provenance Durability Contract

## Status

Accepted

## Context

Evidence verification, replayability, and regression analysis depend on stable fact identity and durable provenance.
If fact IDs churn on non-semantic edits, or evidence spans drift without recovery semantics, verification quality degrades and regression gates become unreliable.

This is a data-platform contract, not an optional retrieval enhancement.

## Decision

Adopt a strict durability contract for lore facts and provenance artifacts.

## Architecture Contract

### Artifact Versioning

Lore artifacts must carry explicit version metadata, including:

- schema version,
- artifact version,
- source revision identifier.

### Fact Identity Stability

1. Non-semantic source edits must not produce new `factId` values.
2. Semantic fact changes require new `factId` values.
3. Fact supersession/deprecation relationships must be represented explicitly.

### Provenance Durability

Each fact must carry durable provenance anchors:

- source location offsets,
- resilient textual anchor signature.

Offset drift must trigger deterministic reattachment attempts via anchor matching.

### Verification Availability Rules

If provenance cannot be reattached above required confidence:

- fact is marked unavailable for strict verification,
- fact cannot satisfy production-grade claim acceptance.

### Migration Contract

Artifact upgrades must support deterministic mapping records:

- `oldFactId -> newFactId`

Eval/replay systems must consume mapping metadata to maintain longitudinal comparability.

## Non-Goals

1. This ADR does not define serialization formats.
2. This ADR does not define migration tooling implementation.
3. This ADR does not define sequencing.

## Consequences

### Positive

- Stabilizes verification and eval reproducibility across content evolution.
- Prevents silent grounding regressions from content-edit churn.
- Enables trustworthy regression comparisons over time.

### Tradeoffs

- Requires disciplined content lifecycle governance.

## Related

- ADR-019 (evidence governance)
- ADR-022 (evaluation and release gates)
