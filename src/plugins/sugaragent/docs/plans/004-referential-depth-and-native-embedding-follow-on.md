# Plan 004: Referential Depth and Native Embedding Follow-On

Builds on:

- [Plan 003: Query Interpretation and Local Embedding Implementation](./003-query-interpretation-and-local-embedding-implementation-plan.md)
- [ADR-SA-032: Shared Query Interpretation and Semantic Routing Layer](../adr/032-shared-query-interpretation-and-semantic-routing-layer.md)
- [ADR-SA-033: Local Embedding Runtime and Vector Artifact Contract](../adr/033-local-embedding-runtime-and-vector-artifact-contract.md)

## Purpose

Plan 003 intentionally stops at a shallow, explicit referent-resolution boundary and preview-first embedding/runtime integration.

That boundary is a deliberate sequencing choice, not the final target.

Plan 004 carries the work from that bounded first implementation to fuller conversational depth by addressing:

1. deeper cross-turn referent resolution,
2. richer topic/reference continuity,
3. native embedding runtime parity for packaged targets.

This plan exists so the first implementation is not mistaken for the end state.

## Scope

### Workstream A: Referential depth expansion

Goal:

Extend referent resolution beyond the shallow Plan 003 window without allowing silent guessing.

Target capabilities:

1. multi-turn entity carryover beyond the last one or two turns,
2. pronoun resolution against multiple recent candidates with explicit confidence ranking,
3. topic-linked location references such as `there`, `that town`, `that place`,
4. conflict handling when multiple plausible referents exist,
5. memory-aware referent reuse when session continuity makes it safe.

Guardrails:

1. no silent referent guessing under multi-candidate ambiguity,
2. referent resolution remains observable in diagnostics,
3. unsupported referents still degrade to clarification or scoped uncertainty.

### Workstream B: Topic/reference memory integration

Goal:

Make topic tracking and referent resolution reinforce each other.

Target capabilities:

1. topic state explicitly stores resolved referents,
2. active topic and prior referents can be reused across follow-up questions,
3. topic exhaustion does not erase referent continuity prematurely,
4. referent continuity is reset when a new dominant topic is established.

### Workstream C: Native embedding parity

Goal:

Expose the same logical embedding behavior through native runtime paths used by packaged targets.

Target capabilities:

1. native `embed(texts[])` parity with preview ONNX-backed behavior,
2. shared model-id and vector-dimension semantics,
3. compatible vector artifact loading across preview and native runtimes,
4. shared degraded-mode and diagnostics behavior.

## Preconditions

Plan 004 should not begin until:

1. Plan 003 interpretation diagnostics are stable,
2. preview `embed()` is real and vector retrieval is working,
3. the shallow referent boundary is covered by tests,
4. lexical-only and embedding-assisted interpretation floors are both stable.

## Implementation Direction

### Phase 4A: Referential candidate memory

Implement:

1. explicit referent candidate store in topic/session state,
2. recency and salience weighting,
3. candidate pruning and ambiguity diagnostics.

### Phase 4B: Multi-turn referent scoring

Implement:

1. ranked referent candidates from recent turns,
2. pronoun resolution using recency, topic alignment, and semantic compatibility,
3. explicit ambiguity thresholds and fallback policy.

### Phase 4C: Native runtime embedding service

Implement:

1. native embedding model lifecycle behind `embed(texts[])`,
2. artifact compatibility checks,
3. shared vector normalization and diagnostics.

### Phase 4D: Cross-environment parity evals

Run evals across:

1. preview,
2. native desktop,
3. any mobile/native targets when available.

Check:

1. vector retrieval parity,
2. interpretation parity,
3. degraded-mode behavior,
4. referent-resolution consistency.

## Acceptance Criteria

1. Referent resolution can safely reuse entities/topics beyond the immediate last turn.
2. Pronoun-only follow-ups improve measurably without a jump in false referent guesses.
3. Native packaged runtime exposes a real embedding implementation compatible with preview artifacts.
4. Preview and native runtime diagnostics agree on embedding availability and degraded mode.
5. Plan 003’s shallow referent boundary is replaced by a broader, still-explicit referent policy rather than being left as a permanent stub.
