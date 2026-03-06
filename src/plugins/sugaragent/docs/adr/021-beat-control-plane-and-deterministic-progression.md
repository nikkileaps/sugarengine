# ADR-021: Beat Control Plane and Deterministic Progression Boundary

## Status

Accepted

## Context

Narrative NPCs must express authored beats naturally, but quest progression cannot be delegated to stochastic generation.
Without a dedicated beat control plane, systems drift toward either rigid script-only behavior or non-deterministic progression errors.

## Decision

Adopt a first-class beat control plane where:

1. beat obligations are represented as canonical contracts,
2. conversational expression may vary naturally,
3. progression authority remains deterministic and engine-owned.

## Architecture Contract

### Canonical Beat Contract

Beat contracts must include, at minimum:

- `beatId`, `questId`, `objectiveId`, `npcId`
- required fact references
- optional forbidden fact references
- completion rule and optional target
- turn budget
- optional scripted fallback reference

### Beat Evidence Contract

Narrative/hybrid turns must emit machine-readable beat evidence, including:

- beat identity
- covered and uncovered required facts
- completion signal
- confidence

### Deterministic Authority Boundary

1. SugarAgent may propose beat evidence.
2. Only engine evaluation may mark objective/beat completion.
3. Beat completion claims in NPC language do not imply deterministic completion.

### Fallback Boundary

If beat cannot be satisfied under contract constraints (for example turn-budget pressure), engine routes via configured deterministic fallback policy.

### Initiative Compatibility

Beat control plane must support proactive and reactive beat delivery through initiative policy, while preserving completion/fallback boundaries.

## Non-Goals

1. This ADR does not define editor workflows.
2. This ADR does not define model prompts.
3. This ADR does not define implementation phases.

## Consequences

### Positive

- Preserves authored narrative control without sacrificing conversational variation.
- Keeps quest progression auditable and testable.
- Prevents natural-language completion drift from mutating deterministic state.

### Tradeoffs

- Requires clear contractual alignment between quest data and conversational planning.

## Related

- ADR-017 (dual-mode model)
- ADR-018 (initiative policy)
- ADR-022 (gates and evaluation)
