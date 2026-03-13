# ADR-014: Optional Constrained Grounded Rewrite Pass

## Status

Proposed (Deferred)

## Context

ADR-013 improved factual safety by validating claims against allowed evidence, but response surface quality still has occasional phrasing issues when lore-grounded responses are produced from terse summaries.

Observed quality gap:

- Some grounded replies sound fragmentary or bookish (for example: "A town located ...").
- The current deterministic lore output path optimizes faithfulness over natural phrasing.
- We want better sentence fluency without reopening hallucination risk.

Constraint:

- Runtime latency is already noticeable.
- Adding another model pass on every turn is not acceptable right now.

## Decision

Design an **optional** constrained rewrite pass for grounded turns, but defer rollout until we have latency headroom.

The pass will:

1. Rewrite only for natural phrasing.
2. Use only turn-approved evidence.
3. Be re-validated by ADR-013 claim checks before acceptance.
4. Fall back immediately to deterministic grounded phrasing on any failure.

This keeps factual guarantees while improving fluency when enabled.

## Scope

In scope:

- Post-retrieval utterance rewrite for lore-grounded answers.
- Strict evidence-constrained prompt and response contract.
- Latency-budget and timeout controls.
- Observability + eval metrics.

Out of scope:

- General conversation rewriting.
- Persona restyling beyond concise phrasing cleanup.
- Unbounded multi-pass refinement loops.

## Rewrite Contract

### Trigger conditions

Rewrite is attempted only when all are true:

1. Turn is knowledge-seeking (`self_query`, `other_query`, `world_query`, `mixed_query`).
2. Reply is grounded from retrieval evidence.
3. Feature flag is enabled.
4. Remaining latency budget for the turn is above threshold.

### Prompt constraints

Rewrite prompt must include:

- Original grounded utterance.
- Allowed evidence snippets with stable `sourceId`s.
- Hard instruction: no new facts, no new entities, no timeline additions.
- Output schema:
  - `utterance`
  - `usedSourceIds[]`

### Hard validation

A rewritten candidate is accepted only if:

1. `usedSourceIds[]` is a subset of allowed source ids.
2. ADR-013 claim validator returns no unsupported claims against allowed evidence.
3. Self-query identity constraints (ADR-012 + ADR-013) still pass.

Else: reject rewrite and use deterministic grounded utterance.

## Latency + Failure Policy

1. Max one rewrite attempt (no iterative loop by default).
2. Strict rewrite timeout (shorter than primary generation timeout).
3. If timeout/parse/validation fails, skip rewrite and return original grounded output.
4. Never block turn completion due to rewrite failure.

## Runtime Flags

Add runtime config (default conservative):

- `rewriteGroundedResponses: false`
- `rewriteMaxAttempts: 1`
- `rewriteTimeoutMs: <short budget>`
- `rewriteMinRemainingBudgetMs: <guard threshold>`

Default remains `false` until perf gate is passed.

## Observability

Emit diagnostics for each grounded turn:

- `rewrite.attempted`
- `rewrite.accepted`
- `rewrite.rejectedReason` (`timeout|invalid_json|source_mismatch|claim_unsupported|identity_violation`)
- `rewrite.latencyMs`
- `rewrite.fallbackToDeterministic`

Aggregate counters:

- rewrite attempt/accept rate
- rewrite rejection reasons
- added p50/p95 latency

## Implementation Plan

### Phase 14A: Contract + Prompt Builder

1. Define rewrite request/response schema.
2. Implement evidence-bounded rewrite prompt builder.
3. Add source-id subset checker.

### Phase 14B: Runtime Integration (Flagged)

1. Add optional rewrite stage after grounded turn generation.
2. Enforce timeout + one-attempt limit.
3. Return deterministic grounded output on any rewrite failure.

### Phase 14C: Validation Coupling

1. Re-run ADR-013 claim validator on rewritten text.
2. Enforce self-query identity checks post-rewrite.
3. Reject on unsupported claims or cross-entity leakage.

### Phase 14D: Observability + Evals

1. Add rewrite diagnostics in sim/eval artifacts.
2. Add evals for phrasing quality + grounding retention.
3. Add latency comparison suite (flag off vs on).

### Phase 14E: Rollout Criteria

1. Keep feature off by default.
2. Enable only after perf + safety gates pass.
3. Roll back immediately if hallucination/latency regressions appear.

## Acceptance Criteria

1. With rewrite enabled, unsupported-claim rate does not regress relative to ADR-013 baseline.
2. Self-query identity leakage does not regress.
3. P95 per-turn latency increase remains within agreed budget.
4. On rewrite failures, deterministic grounded output is still returned (no blank/error turns).
5. Human review shows improved phrasing quality on targeted lore answers.

## Consequences

### Positive

- Better fluency for grounded responses.
- Maintains evidence-first safety posture.
- Fully reversible via feature flag.

### Tradeoffs

- Additional runtime complexity and tuning surface.
- More instrumentation and eval maintenance.
- Potential latency overhead when enabled.
