# ADR-017: Dual-Mode NPC Conversation Model

## Status

Accepted

## Context

SugarAgent must support two distinct but unified conversational experiences:

1. NPCs that converse naturally as grounded characters without authored quest beats.
2. NPCs that deliver authored narrative beats with natural variation while quest progression remains deterministic.

Treating either as a special-case path causes drift and inconsistent behavior contracts.

## Decision

Adopt a single dual-mode conversation architecture with per-turn mode resolution:

- `character`
- `narrative`
- `hybrid`

Mode is a runtime contract, not a UI-only label.

## Architecture Contract

### Mode Definitions

1. `character`
   - No active beat obligation.
   - Response quality is governed by identity/lore grounding, memory, and conversation-quality policy.
2. `narrative`
   - Active beat obligation is present.
   - Response must satisfy beat coverage constraints while preserving natural language variation.
3. `hybrid`
   - Both free conversation and beat progression are active.
   - Beat urgency/policy may preempt optional social elaboration.

### Mode Resolution Inputs

Mode must be resolved each turn from:

- NPC interaction mode policy,
- active quest/objective beat binding,
- engine interaction policy and conversation state.

### Required Guarantees

1. Mode transitions are explicit and diagnosable.
2. No mode may bypass evidence-grounding and ownership constraints.
3. `narrative` and `hybrid` modes cannot claim deterministic completion authority.
4. `character` mode cannot fabricate beat progress to preserve flow.

## Non-Goals

1. This ADR does not define UI controls for configuring mode.
2. This ADR does not define model prompts.
3. This ADR does not define implementation sequencing.

## Consequences

### Positive

- Unifies behavior across NPC archetypes under one architecture.
- Prevents ad-hoc special-case logic for quest vs non-quest NPCs.
- Improves testability via explicit per-turn mode diagnostics.

### Tradeoffs

- Requires strict contract discipline where mode influences multiple subsystems.

## Related

- Strategic architecture: `docs/architecture/001-sugaragent-strategic-architecture.md`
- ADR-018 (initiative control plane)
- ADR-021 (beat control plane)
