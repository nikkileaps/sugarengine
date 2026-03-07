# ADR-024: Runtime-Owned Reply-Parts Grounding Contract

## Status

Accepted

## Context

ADR-023 introduced a two-lane conversation model and an LLM claim-tagging contract:

1. generate a natural NPC utterance,
2. generate exact quote tags over that utterance,
3. bind those quotes to evidence ids,
4. validate the quote/evidence contract deterministically.

That design was directionally correct in one important respect: it removed regex-only factual truth handling from the production path.

However, the exact quote plus raw evidence-id contract proved too brittle for the actual bundled local runtime/model in SugarAgent preview and in-engine use.

Observed failure modes included:

1. invalid JSON on the second pass,
2. parseable but invalid claim-tag shapes,
3. quote text copied from evidence snippets instead of the NPC utterance,
4. invented or mismatched evidence ids,
5. deterministic fallback despite retrieval having found the correct lore.

The failure was not retrieval. It was the contract between retrieval and accepted grounded NPC output.

## Decision

SugarAgent replaces the claim-tag contract with a runtime-owned reply-parts grounding contract.

### Core Model

The two-lane conversation model remains:

1. `social` lane:
   - greetings,
   - acknowledgements,
   - empathy,
   - banter,
   - clarifying questions.
2. `grounded` lane:
   - lore facts,
   - self-identity facts,
   - beat/quest facts,
   - other world claims that require support.

### New Structured Turn Contract

Instead of free-form `utterance` plus a second-pass `claimTags[]`, the model produces ordered reply parts in one structured response.

Conceptually:

```json
{
  "parts": [
    { "kind": "social", "text": "Sure." },
    { "kind": "grounded", "text": "The Wordlark Hollow Resort and Spa is just outside Earendale.", "support": ["E1"] }
  ],
  "emotion": "warm",
  "intent": "answer",
  "proposedIntents": [],
  "beatEvidence": {
    "coveredFacts": [],
    "uncoveredFacts": [],
    "completionSignal": "none",
    "confidence": 0
  }
}
```

### Evidence Slots

Runtime owns the evidence table and assigns turn-local slot ids:

1. `E1`
2. `E2`
3. `E3`

The model may reference only those slot ids in grounded parts.

The model must not emit raw provenance ids or raw internal evidence ids.

Runtime remains the sole owner of:

1. provenance mapping,
2. citation materialization,
3. ownership metadata,
4. final support validation.

### Runtime Materialization

Runtime concatenates reply parts into the final public turn output:

1. `utterance`
2. `citations`
3. `beatEvidence`

This preserves the public turn surface used by the preview UI and game/plugin host integration while replacing the internal grounding contract.

## Validation Policy

### Social Turns

Social-only turns may contain:

1. `social` parts,
2. optional `close` part,
3. no support references.

### Knowledge Turns

Knowledge turns must be one of:

1. at least one valid `grounded` part with valid support slots,
2. explicit `uncertain`,
3. explicit abstain/provider-unavailable behavior.

Knowledge turns must not be accepted if they contain only:

1. social filler,
2. unsupported factual wording,
3. vague clarification without grounded support or uncertainty.

### Self Query

For `self_query` turns:

1. grounded parts must use self-owned support,
2. otherwise the turn must repair or return uncertainty.

## Consequences

### Benefits

1. no post-hoc quote copying,
2. no quote-to-utterance remapping as the primary correctness mechanism,
3. no raw evidence-id emission by the model,
4. no second LLM pass dedicated only to claim tagging,
5. runtime owns more deterministic alignment work.

### Tradeoffs

1. grounded fidelity still depends on retrieval quality,
2. the model must still satisfy strict JSON,
3. reply-parts generation is less expressive than unconstrained free-form output,
4. any future tooling that needs exact spans must derive them from runtime-owned parts rather than from model-authored quote tags.

## Boundaries

This ADR does not:

1. move quest/objective authority out of the engine host,
2. restore regex-only correctness as the production truth path,
3. change plugin optionality,
4. change the preview/game-facing turn result contract.

## Builds On

1. ADR-012 for identity-aware retrieval and self-query boundaries.
2. ADR-016 for evidence-first dialogue architecture.
3. ADR-017 through ADR-022 for dual-mode conversation, governance, and validation boundaries.

## Supersedes

This ADR supersedes ADR-023 as the active grounded-turn contract.

ADR-023 remains useful as historical context for:

1. why regex-only truth handling was rejected,
2. why two-lane conversation remains required,
3. why deterministic boundary validation is still necessary.

Its exact quote plus raw evidence-id claim-tag contract is no longer the active production design.
