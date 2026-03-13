# ADR-015: Hybrid Intent Routing And Evidence Policy

## Status

Accepted

## Context

SugarAgent currently routes turn intent in session runtime using heuristic regex cues in `classifyTurnQueryType`.

Current behavior classifies into:

- `conversation`
- `self_query`
- `other_query`
- `world_query`
- `mixed_query`

This has produced quality failures:

- Relationship/session-memory prompts (for example, "do you remember me?") are routed as `self_query`.
- `self_query` then activates self-evidence guardrails intended for biography/background claims.
- Result: inappropriate uncertainty responses or unrelated lore injection in normal conversation.

ADR-013 improved grounding safety, but strict claim policy depends on correct turn routing. When routing is wrong, safety policy is applied to the wrong evidence class.

Constraints:

- Runtime must stay low-latency.
- We should not add an additional full LLM pass for intent routing.
- Behavior must remain deterministic/auditable for debugging and evals.

## Decision

Introduce a **hybrid intent router**: deterministic feature extraction + lightweight scored classification + deterministic policy execution.

Key decisions:

1. Add finer-grained interaction intents:
   - `social_chat`
   - `session_recall`
   - `identity_self`
   - `lore_world`
   - `lore_other`
   - `mixed_knowledge`
   - `unclear`
2. Keep rules/regex as input features, not final routing truth.
3. Add confidence and ambiguity thresholds before policy commitment.
4. Route each intent to strict evidence boundaries.
5. Do not add extra LLM calls in baseline implementation.

## Intent Policy Matrix

### `social_chat`

- Purpose: greeting, rapport, feelings, lightweight banter.
- Evidence: optional recent conversation context.
- Disallow: lore override.
- Guardrail: no forced uncertainty due to missing lore.

### `session_recall`

- Purpose: "have we met", "what did I tell you", memory/relationship continuity.
- Evidence: session memory + recent dialogue history only.
- Disallow: lore override by default.
- Fallback: memory-uncertain phrasing (not lore uncertainty).

### `identity_self`

- Purpose: biography/background/identity claims about NPC.
- Evidence: self identity + self lore scopes + allowed self facts.
- Guardrails: ADR-012 self-entity rules + ADR-013 claim validation.
- Fallback: self uncertainty.

### `lore_world` / `lore_other`

- Purpose: world facts / facts about non-self entities.
- Evidence: lore retrieval pools + beat facts.
- Guardrails: ADR-013 claim validation.
- Fallback: world uncertainty.

### `mixed_knowledge`

- Purpose: multi-part knowledge question.
- Evidence: routed by dominant sub-intent or split response policy.
- Guardrails: all applicable claim checks.

### `unclear`

- Purpose: low-confidence or ambiguous intent.
- Action: safe conversational default or short clarification question.
- Disallow: hard lore override.

## Router Design

### 1) Feature extraction (deterministic)

Use lightweight lexical/context features, including:

- question form and interrogative tokens
- memory cues (`remember`, `met before`, `last time`, `told you`)
- biography cues (`your past`, `your family`, `where are you from`)
- world/entity cues (place/event/entity names)
- temporal/relational cues (prior turns, first-meeting state)

### 2) Scoring/classification

Compute intent scores via weighted feature model.

Output:

- `intent`
- `confidence`
- `margin`
- `candidateScores`

### 3) Confidence gating

- If confidence below threshold or margin below ambiguity threshold => `unclear`.
- `unclear` routes to low-risk policy path.

## Runtime Integration

1. Replace direct `classifyTurnQueryType` usage with `routeTurnIntent` result.
2. Map routed intent to existing retrieval/guardrail pipeline:
   - `identity_self` -> current `self_query` path.
   - `lore_world` -> current `world_query` path.
   - `lore_other` -> current `other_query` path.
   - `mixed_knowledge` -> current `mixed_query` path.
   - `session_recall` + `social_chat` + `unclear` -> non-lore-first policy paths.
3. Keep ADR-013 claim validation strict for knowledge intents.
4. Relax strict claim repair for `social_chat`/`session_recall` (unless explicit factual world claim is generated).

## Observability

Add turn diagnostics:

- `routing.intent`
- `routing.confidence`
- `routing.margin`
- `routing.candidates`
- `routing.policyPath`
- `routing.ambiguityFallback`

Add counters:

- intent distribution by route
- ambiguous-route count
- session-recall misroute rate
- lore override count by intent

## Implementation Plan

### Phase 15A: Intent Taxonomy + Router Skeleton

1. Define new intent taxonomy/types.
2. Implement deterministic feature extractor.
3. Implement scored router with confidence/margin outputs.

### Phase 15B: Policy Wiring

1. Add policy matrix executor for each routed intent.
2. Route `session_recall` away from lore override path.
3. Add memory-first fallback responses for session-recall turns.

### Phase 15C: Guardrail Alignment

1. Keep ADR-013 strict checks for knowledge intents.
2. Prevent hard uncertainty forcing on social/session-recall turns.
3. Preserve self-identity constraints only on `identity_self`/relevant mixed routes.

### Phase 15D: Observability + Evals

1. Emit routing diagnostics in sim/eval outputs.
2. Add eval set for known failures:
   - "do you remember me?"
   - "have we met before?"
   - "I said my name is X" (statement, not recall question)
3. Measure route precision and downstream conversation quality.

### Phase 15E: Optional Learned Router Upgrade

1. Train lightweight local classifier from labeled transcripts (optional).
2. Keep deterministic feature/rule layer as guardrail and fallback.
3. Roll out only if accuracy improves without latency regression.

## Acceptance Criteria

1. `session_recall` prompts are routed to memory policy with high precision on eval set.
2. Misrouted lore injections on memory/relationship prompts are reduced to <1% in targeted evals.
3. Conversation turns do not emit lore uncertainty when the user is doing social chat.
4. ADR-013 factual safety for true knowledge intents remains unchanged or better.
5. P95 per-turn latency does not regress beyond agreed budget.

## Consequences

### Positive

- Better conversational coherence and relationship continuity.
- Fewer policy mismatches between routing and grounding validation.
- Maintains low-latency architecture while improving behavior.

### Tradeoffs

- More runtime logic and routing complexity.
- Additional tuning for thresholds/weights.
- Larger eval surface area for routing regressions.

## Implementation Status (March 4, 2026)

Implemented in session runtime:

- Hybrid scored router with confidence/margin diagnostics.
- New routing intents and policy paths (`social_chat`, `session_recall`, `identity_self`, `lore_world`, `lore_other`, `mixed_knowledge`, `unclear`).
- Policy wiring that routes `session_recall` away from lore override and self-identity uncertainty forcing.
- Routing observability surfaced in sim/eval outputs.

## References (Design Inputs)

- Rasa fallback classifier (confidence + ambiguity thresholds)
- Dialogflow CX intent matching + fallback routes
- Amazon Lex confidence/disambiguation policies
- DIET architecture for lightweight intent/entity modeling
- Sentence-BERT / efficient embedding-based intent similarity
