# ADR-023: Two-Lane Conversation and LLM Claim-Span Tagging Contract

## Status

Proposed

## Date

2026-03-06

## Context

SugarAgent currently enforces factual grounding with a post-generation claim validator (ADR-013 lineage), but runtime behavior shows brittle failure cases when casual language and factual language are mixed in one reply.

Observed issue class:

- natural acknowledgement/interjection text (for example `Yes!`) can be treated as factual claims in some edge paths,
- model phrasing variance can trigger false unsupported-claim fallback,
- this hurts conversational quality for a game NPC even when lore retrieval is present.

At the same time, SugarAgent must preserve strict correctness for knowledge-bearing content (world facts, self-identity facts, beat facts), while remaining natural for social chat.

## Decision

Adopt a **two-lane turn contract** for NPC output:

1. `social lane`: free-form conversational text (greetings, empathy, banter, acknowledgements).
2. `grounded lane`: factual claim spans that must be evidence-backed.

Instead of relying on regex-heavy factual span inference, use an **LLM-assisted span-tagging contract**:

1. generate natural utterance,
2. tag factual claim quotes against that utterance with evidence IDs,
3. deterministically map quotes to spans and validate only grounded spans.

This makes LLMs responsible for semantic labeling while deterministic runtime remains the authority for contract and safety enforcement.

## Relationship to Prior ADRs

### Builds On

- ADR-012: identity-aware retrieval pools and self/other/world boundaries.
- ADR-013: evidence-based claim validation goals.
- ADR-014: optional constrained rewrite pass.
- ADR-016: evidence-first architecture (`route -> retrieve -> plan -> validate -> realize -> verify`).
- ADR-017..019: dual-mode policy and evidence governance.
- ADR-020: fact/provenance stability (`factId` durability).

### Corrects / Refines

- Refines ADR-013 implementation strategy by replacing regex-dominant factual-unit extraction with structured LLM claim tagging for mixed turns.
- Refines ADR-016 realization+verification boundary by introducing an explicit claim-tag artifact between realization and final verification.

### Supersedes (Implementation Scope Only)

This ADR supersedes **heuristic social-vs-factual sentence classification as the primary correctness mechanism** in production runtime paths.

It does **not** supersede ADR-013 intent or acceptance criteria; it changes how those goals are achieved.

## Scope and Validation Boundaries

### NPC Output (Primary Validation Target)

Validate grounded factual spans in NPC responses:

- world facts
- self-identity facts
- other-entity facts
- beat/quest factual commitments

### Player Input (Different Policy)

Do not globally fact-check player truthfulness. Player input is used for:

- intent/routing,
- memory extraction,
- quest/beat progression checks.

Hard validation of player statements applies only when statements are used to trigger deterministic state transitions (for example objective completion contracts).

## Contract

### Turn Artifact Schema (Conceptual)

```json
{
  "utterance": "Yes! The Wordlark Hollow Resort is just outside Earendale.",
  "claimTags": [
    {
      "quote": "The Wordlark Hollow Resort is just outside Earendale.",
      "evidenceIds": ["fact.67001bcb7ff658899ce1a098"],
      "subjectType": "world"
    }
  ]
}
```

Important: LLM emits `quote` strings, not numeric offsets.

Runtime computes offsets deterministically by matching each quote against utterance text.

### Why Quote-Based, Not Direct Offsets

- direct offset generation is fragile under tokenization/punctuation differences,
- quote matching is deterministic and robust for runtime validation.

## Runtime Pipeline

### 1) Evidence Pack Build (existing ADR-016 primitive)

Assemble allowed evidence IDs and text from:

- retrieved lore chunks/facts,
- identity/profile evidence,
- beat facts,
- bounded session evidence.

### 2) Pass A: Natural Utterance Generation

Model returns natural response text and baseline metadata.

### 3) Pass B: Claim Tagging

Model receives:

- frozen utterance,
- evidence table (`evidenceId -> snippet`),
- policy constraints (`self_query` etc.).

Model returns `claimTags[]` with exact quotes and evidence IDs.

### 4) Deterministic Span Materialization

Runtime:

- finds quote occurrences in utterance,
- maps them to spans,
- rejects ambiguous/unresolvable quotes,
- marks all non-claim text as social lane.

### 5) Grounding Validation

Validate only grounded spans:

- every claim tag has at least one valid evidence ID,
- evidence IDs are allowed for this turn and query type,
- self-query claims obey identity ownership rules.

### 6) Repair / Abstain

If claim tagging or validation fails:

1. one repair pass with explicit contract errors,
2. if still invalid, keep social-safe output and abstain on unsupported factual content.

## Guardrails and Determinism

Deterministic authority remains in runtime:

- schema and parse checks,
- quote-to-span mapping,
- evidence ownership validation,
- retry budget and fallback policy.

LLM authority:

- natural phrasing,
- semantic identification of factual claims in mixed text.

## Execution Tracking

Execution phases, rollout order, and MVP verification loops are tracked in the sister plan document:

- `src/plugins/sugaragent/docs/plans/002-two-lane-conversation-and-llm-claim-span-tagging-plan.md`

## Acceptance Criteria

1. Mixed social+factual replies validate correctly without regex-only classifiers in primary path.
2. Unsupported factual spans are rejected/repaired before acceptance in >=99% targeted evals.
3. Self-query cross-entity leakage remains <= ADR-013/ADR-016 thresholds.
4. Casual social responses do not degrade into over-abstention.
5. In-engine preview and packaged runtime use the same claim-tag contract path.

## Consequences

### Positive

- Better conversational naturalness for game NPC dialogue.
- Reduced brittleness from phrase-level regex heuristics.
- Clear separation of semantic tagging (LLM) vs correctness authority (deterministic runtime).

### Tradeoffs

- Additional model pass on knowledge/mixed turns.
- More runtime schema/telemetry complexity.
- Requires strong observability and eval discipline to prevent drift.

## Notes

This ADR intentionally preserves plugin isolation:

- public plugin API remains a single turn-level entry point,
- claim-tagging details remain internal to SugarAgent runtime.
