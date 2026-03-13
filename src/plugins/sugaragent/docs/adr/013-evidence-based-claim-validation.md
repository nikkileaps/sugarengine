# ADR-013: SugarAgent Evidence-Based Claim Validation

## Status

Accepted

## Context

ADR-012 improves retrieval intent handling and conversation grounding, but it does not yet provide a strict claim-level verifier for generated NPC utterances.

Current gap:

- A response can still include plausible but unsupported world facts.
- Regex-based guardrails catch common patterns but do not guarantee factual grounding.
- We need deterministic, inspectable validation that each substantive claim in an NPC reply is backed by known evidence.

## Dependency

This ADR is downstream of ADR-012 and must not be implemented until ADR-012 is completed.

Required ADR-012 completion before ADR-013 starts:

1. 12A: identity fields in authoring/types (`selfEntityId`, `selfLoreScopes`, `relatedLoreScopes`)
2. 12B: identity-aware retrieval pools and ranking
3. 12C: self-query evidence safety rules
4. 12D: editor UX and validation for identity fields
5. 12E: identity-focused tests/evals
6. 12F: conversation grounding hardening

## Decision

Add a claim validation layer between model generation and final turn acceptance.

For each generated reply:

1. Extract candidate factual claims.
2. Attempt to align each claim to allowed evidence.
3. Reject or repair replies that contain unsupported claims.
4. Fall back to uncertainty or safe conversational response if claims remain unsupported.

This validator is runtime policy, not a one-off content rule.

## Evidence Model

Allowed evidence sources (in priority order):

1. Retrieved lore chunks selected for the turn (with source ids)
2. NPC self identity/profile evidence from ADR-012 (`selfEntityId` + self pool)
3. Authoring beat contract facts active for the turn
4. Session memory facts explicitly stored for this NPC/player pair
5. Player-provided facts in current/recent conversation turns

Disallowed as evidence:

- Model prior/world knowledge not present in sources above
- Facts from non-self entities when answering `self_query` (unless explicitly asked as `other_query`)

## Validation Policy

### 1) Claim extraction

Split reply into sentence-level claim units.
Ignore non-factual social language (greetings, politeness, acknowledgements).

### 2) Support scoring

For each claim, compute support against evidence set:

- lexical/semantic overlap score
- entity-id alignment score
- query-type compatibility (`self_query`, `other_query`, `world_query`, `mixed_query`)

### 3) Decision thresholds

- `supported`: score >= accept threshold
- `weak`: between weak and accept thresholds
- `unsupported`: below weak threshold

Turn acceptance requires:

1. no `unsupported` factual claims
2. for `self_query`, at least one `supported` self-evidence claim or explicit uncertainty output

### 4) Repair/fallback flow

If unsupported claims exist:

1. retry generation with explicit repair reason listing unsupported claims
2. constrain retry to cited evidence
3. after max attempts, emit grounded uncertainty/safe response

## Runtime Contract Additions

Add internal grounding diagnostics (debug/observability only):

- `grounding.claimChecks[]`:
  - `claim`
  - `status` (`supported|weak|unsupported|non_factual`)
  - `evidenceSourceIds[]`
  - `score`
- `grounding.summary`:
  - `supportedCount`
  - `unsupportedCount`
  - `decision` (`accept|repair|fallback`)

This metadata is for logs/evals, not required UI output.

## Implementation Plan

### Phase 13A: Claim Validator Core

1. Implement claim unit extraction utility.
2. Implement evidence matcher/scorer.
3. Implement support status classification.

### Phase 13B: Runtime Integration

1. Run validator on each candidate output before acceptance.
2. Wire validator result into repair reason and retry loop.
3. Enforce fallback when unsupported claims persist.

### Phase 13C: Query-Type/Identity Enforcement

1. Enforce stricter self-query validation using ADR-012 identity model.
2. Prevent cross-entity contamination for self answers.
3. Require uncertainty when self evidence is absent.

### Phase 13D: Observability

1. Emit structured grounding diagnostics to runtime logs.
2. Surface aggregate counters for unsupported-claim rejections.
3. Add debug visibility in sim/eval output.

### Phase 13E: Tests + Evals

1. Unit tests for claim extraction/scoring/classification.
2. Integration tests for repair and fallback behavior.
3. Eval set for hallucination suppression and identity correctness.

## Acceptance Criteria

1. Unsupported factual claims are rejected or repaired before turn acceptance in >=99% of targeted tests.
2. Self-query cross-entity claim leakage is <1% on identity eval set.
3. Grounding diagnostics are present for every accepted/rejected turn in sim/eval mode.
4. Gameplay remains resilient: validator failures never crash turns; safe fallback always returns.

## Consequences

### Positive

- Stronger factual grounding than pattern-only guardrails
- Deterministic, auditable rejection reasons
- Better alignment with authored lore/identity boundaries

### Tradeoffs

- More runtime complexity and latency per turn
- Additional tuning surface (thresholds and matcher quality)
- Larger test/eval maintenance burden
