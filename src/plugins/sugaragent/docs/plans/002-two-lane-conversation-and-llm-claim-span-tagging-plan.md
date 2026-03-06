# SugarAgent Two-Lane Conversation and LLM Claim-Span Tagging Plan

## Related ADR

- `src/plugins/sugaragent/docs/adr/023-two-lane-conversation-and-llm-claim-span-tagging.md`

## Goal

Implement ADR-023 with a staged loop where each checkpoint ends in a creator-testable MVP behavior in preview.

## Checkpoint 1: Contracts + Deterministic Span Materialization

### Actions

1. Add runtime/internal types for `claimTags` artifact (`quote`, `evidenceIds`, `subjectType`).
2. Implement deterministic quote-to-span mapper with explicit outcomes:
   - mapped,
   - missing quote,
   - ambiguous duplicate match,
   - overlap conflict.
3. Add diagnostics payload for mapping outcomes.

### Acceptance Criteria

1. Quote mapping utility deterministically maps valid quotes to offsets.
2. Invalid/ambiguous quote mappings produce explicit machine-readable failure reasons.

### MVP Verification

1. Run unit tests for mapper edge cases:
   - single match,
   - duplicate text in utterance,
   - missing quote,
   - overlapping quotes.
2. Confirm no runtime crash path on mapping failure.

## Checkpoint 2: Two-Pass Runtime Flow (Draft + Tag)

### Actions

1. Add Pass A for natural utterance generation.
2. Add Pass B claim-tag generation using frozen utterance + evidence table.
3. Wire diagnostics so each turn records:
   - pass A success/failure,
   - pass B success/failure,
   - claim tag count.

### Acceptance Criteria

1. Mixed replies can include social preface plus grounded claim in one utterance.
2. Claim tagging executes on grounded/mixed intents without blocking social-only turns.

### MVP Verification

1. In preview chat, ask a lore question and verify response can include both social opener and factual clause.
2. Confirm no immediate fallback solely due to mixed social+factual structure.

## Checkpoint 3: Evidence and Ownership Enforcement

### Actions

1. Validate each claim tag has non-empty `evidenceIds`.
2. Validate evidence IDs exist in allowed turn evidence pack.
3. Enforce self-query ownership constraints from ADR-012.
4. Add one repair pass when validation fails.

### Acceptance Criteria

1. Unsupported claim tags are rejected before turn acceptance.
2. Self-query cross-entity claims fail validation and trigger repair/abstain.

### MVP Verification

1. Ask self-identity prompts and verify other-entity facts are not accepted.
2. Ask world-lore prompts and verify accepted claim tags reference retrieved evidence IDs.

## Checkpoint 4: Player/NPC Validation Boundary Hardening

### Actions

1. Keep strict claim validation for NPC output only.
2. Keep player input validation scoped to deterministic progression contracts (objective/beat gate checks), not general fact-checking.
3. Add diagnostic flags showing whether validation decision came from NPC-output path or progression-gate path.

### Acceptance Criteria

1. Casual player statements are not globally fact-checked.
2. Deterministic progression checks remain enforceable where configured.

### MVP Verification

1. In preview chat, casual player text remains conversational.
2. In configured contract objective flow, progression gate checks still enforce deterministic conditions.

## Checkpoint 5: Heuristic Reduction and Cleanup

### Actions

1. Remove heuristic social-vs-factual classifiers from production correctness authority path.
2. Keep only minimal parser/safety fallbacks.
3. Update eval expectations to claim-tag contract path.

### Acceptance Criteria

1. Regex/social heuristics are no longer primary truth source for grounded validation.
2. Target regressions (`Yes!`, interjections, short acknowledgements) do not trigger unsupported-claim fallback by themselves.

### MVP Verification

1. Run targeted regression set including:
   - `Yes!` + factual follow-up,
   - pure acknowledgements,
   - mixed social+lore replies.
2. Verify fallbacks occur only on real unsupported factual spans.

## Risks

1. Extra model pass can increase per-turn latency on grounded/mixed turns.
2. Quote matching can fail when model paraphrases claim text between passes.
3. Retrieval quality still bounds factual correctness; claim-tag contract cannot recover absent evidence.

## Risk Controls

1. Limit claim-tag pass to grounded/mixed intents; bypass for pure social turns.
2. Use one repair pass max; hard timeout with safe fallback.
3. Emit detailed diagnostics for mapping and evidence failures to support quick tuning.

## Definition of Done

1. ADR-023 contract is active in preview/runtime path.
2. Grounded validation relies on claim-tag contract, not regex authority.
3. Mixed social+factual NPC responses work without false unsupported fallback on acknowledgements.
4. Regression/eval suite covers the known failure class that triggered ADR-023.
