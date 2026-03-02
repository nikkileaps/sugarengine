# ADR-SA-009: Deterministic Memory Compaction and Semantic Rollups

## Status

Proposed (Deferred until ADR-001..008 implementation is complete)

## Context

ADR-SA-003 defined compaction goals (bounded memory, summarization/rollups, stale eviction), but the current implementation primarily applies bounded recency caps.

That is enough for Phase 3 MVP verification, but not enough for long-running games where save payload growth and memory quality drift become real risks.

We want a deterministic compaction layer that:

1. Preserves authored progression authority in engine systems.
2. Keeps `GameSaveData.plugins.sugaragent` bounded and portable.
3. Produces stable, testable rollups without requiring LLM calls.

## Decision

### 1) Scope and authority

Compaction applies only to SugarAgent plugin state under `plugins.sugaragent`.
It must not mutate canonical quest/episode/world progression owned by engine systems.

### 2) Deterministic-only compaction

Compaction and rollup generation must be deterministic:

1. No model calls.
2. No random IDs.
3. Same input state => same compacted output state.

Rollup IDs should be derived from stable keys (for example hash of NPC ID + time bucket + event types).

### 3) Compaction triggers

Run compaction at controlled points:

1. Before `serializeState()` returns payload.
2. After `loadState()` normalization/migration.
3. Optionally after high-volume event bursts (guarded by cheap threshold checks).

### 4) Episodic -> rollup strategy

Compaction pipeline per NPC:

1. Partition episodic memories into:
   - keep set (high salience, recent, or beat-critical)
   - compact set (older, lower salience, redundant)
2. Group compact set into deterministic clusters by stable keys:
   - memory type/tag class
   - quest/beat related tags when present
   - time bucket window
3. Emit rollups into:
   - `conversationSummaries[]` for conversational recap
   - `semantic[]` for persistent beliefs/facts
4. Remove compacted episodic records after rollups are emitted.

### 5) Eviction policy

When still over budget after rollups:

1. Drop lowest-salience oldest records first.
2. Preserve minimum anchor count per NPC for:
   - high salience memories
   - most recent memories
   - beat-related markers

### 6) Save-size budgets

Set explicit per-NPC and global targets in plugin constants.

Initial target class:

1. episodic budget (strict cap)
2. summary budget (strict cap)
3. semantic budget (strict cap)
4. dialogue session budget (strict cap)
5. optional total serialized byte budget guard

### 7) Schema handling

If fields required for compaction provenance are added, use additive schema updates and deterministic migrators.

No migration failure may block game load.

## Phased Implementation (Deferred)

### Phase 9A: Deterministic compaction core

1. Introduce stable-ID helpers and deterministic sort/group utilities.
2. Remove remaining nondeterministic ID generation in compaction paths.
3. Add unit tests proving same input state yields byte-stable compacted output.

MVP checkpoint:

1. Repeated serialize/load cycles over the same fixture produce identical compacted state.

### Phase 9B: Rollup generation

1. Implement episodic clustering and rollup emission.
2. Preserve beat-critical and high-salience anchors.
3. Ensure compaction reduces episodic count while keeping recall utility.

MVP checkpoint:

1. Seed session with repeated low-salience events + a few high-salience events.
2. Verify high-salience anchors survive, low-value repeats are rolled up.
3. Verify recall prompt still returns key facts.

### Phase 9C: Budget and save guardrails

1. Add global payload checks (count/byte-size guardrails).
2. Add deterministic final-eviction stage when still over budget.
3. Add telemetry counters for compacted/dropped/rolled-up records.

MVP checkpoint:

1. Stress test with synthetic memory flood.
2. Verify payload stays within configured limits.
3. Verify load/serialize remains stable and fast.

## Consequences

Positive:

1. Better long-run save stability.
2. Higher memory quality under pressure.
3. Fully testable deterministic behavior.

Tradeoffs:

1. More state-management complexity.
2. Rollup heuristics may need tuning for recall quality.
3. Additional regression surface for migrations and save compatibility.

## Validation Plan (When Scheduled)

1. Unit tests for grouping, rollup emission, eviction ordering, deterministic IDs.
2. Integration tests for plugin save/load with compaction active.
3. Sim smoke script for seeded memory -> compaction -> recall verification.

## Execution Order

Schedule this ADR only after currently accepted ADR roadmap items (001..008) are implemented and stabilized.
