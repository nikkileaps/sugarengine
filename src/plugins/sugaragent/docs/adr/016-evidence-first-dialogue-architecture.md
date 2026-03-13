# ADR-016: Evidence-First Dialogue Architecture (Plan, Ground, Realize)

## Status

Accepted

## Date

2026-03-04

## Context

SugarAgent currently combines:

- intent routing (ADR-015),
- identity-aware retrieval (ADR-012),
- claim validation and repair (ADR-013),
- additional guardrails and heuristics.

This has improved behavior, but the control model is still mostly **post-hoc**:

1. generate a reply,
2. detect problems,
3. retry/repair/fallback.

That pattern is good as a safety net, but not ideal as the primary architecture. It increases complexity, can feel brittle, and still allows class-of-error escapes (for example, wrong subject ownership like assigning NPC lore to the player).

## Problem

We need a comprehensive, durable solution where:

- grounding and identity ownership are enforced **before** free-form wording,
- “I do not know” behavior is first-class (not a failure case),
- quality improves without endless regex growth,
- latency remains acceptable for gameplay.

## Decision

Adopt an **evidence-first dialogue pipeline** for knowledge-bearing turns:

`route -> retrieve -> claim-plan -> validate-plan -> realize -> verify -> persist`

This architecture makes factual control pre-generative, with post-hoc validation retained as a thin backstop.

## Scope

This ADR defines runtime architecture for SugarAgent conversational turns, especially:

- `identity_self`
- `lore_world`
- `lore_other`
- `mixed_knowledge`
- `session_recall` when memory claims are made

`social_chat` stays on a fast path unless it crosses into factual claims.

## Architecture

### 1) Route Turn (existing ADR-015 base)

Use hybrid intent routing with confidence and policy path. Routing determines whether turn uses:

- `fast_chat` path (single generation, minimal checks), or
- `grounded_knowledge` path (full evidence-first flow).

### 2) Build Evidence Pack (new primary step)

Construct a typed evidence pack per turn:

- retrieval candidates from allowed scopes,
- session memory facts,
- recent player-introduced facts,
- active beat facts,
- NPC profile/self identity facts.

Each evidence item must include:

- `evidenceId`
- `sourceType`
- `entityIds`
- `ownerType` (`npc | player | world | beat | unknown`)
- `text`
- `confidence`

This explicitly solves ownership confusion at data level.

### 3) Claim Plan Pass (new)

Run a structured planner model call to produce a turn plan, not final prose.

Plan schema (conceptual):

```json
{
  "speechAct": "answer|clarify|recall|uncertain|ask",
  "claims": [
    {
      "subject": "npc|player|world_entity_id",
      "predicate": "string",
      "object": "string",
      "evidenceIds": ["ev_12", "ev_03"],
      "confidence": 0.0
    }
  ],
  "questionBack": "optional",
  "memoryWrite": [
    { "type": "player_fact", "text": "..." }
  ]
}
```

Rule: no factual claim without at least one evidence id.

### 4) Deterministic Plan Validation (new)

Validate plan before realization:

- every `evidenceId` exists in evidence pack,
- `subject` is compatible with evidence ownership/entity,
- self/other/world policy boundaries hold,
- low-support claims are removed or converted to explicit uncertainty.

If invalid:

1. one repair pass with explicit structured errors,
2. if still invalid, emit uncertainty/clarification plan.

### 5) Realization Pass (new)

Generate natural language from validated plan + persona/tone constraints.

Critical rule:

- Realizer cannot introduce new factual claims outside plan.

Use constrained structured output for intermediate artifacts and strict parser checks.

### 6) Final Verification (keep, narrower role)

Retain claim validator (ADR-013 lineage) as final guardrail:

- ensure realized utterance semantically matches plan,
- reject newly introduced unsupported claims,
- fallback to safe uncertainty when needed.

This is now a backstop, not the main control strategy.

### 7) Memory Persistence (updated)

Persist typed memory events with ownership:

- `player_fact`
- `npc_commitment`
- `shared_event`

Never store inferred player traits unless explicitly stated by player.

## Why This Is Better

1. Moves correctness left: claim legitimacy is decided before wording.
2. Prevents subject/ownership leakage by contract, not patch.
3. Keeps post-hoc checks but reduces their burden and complexity.
4. Supports future model/provider changes with stable interfaces.

## Implementation Plan

### Phase 16A: Contracts and Pipeline Activation

1. Add `TurnPlan` and `EvidenceItem` runtime types.
2. Activate V2 as the default runtime path.
3. Add telemetry fields for plan/validation decisions.

### Phase 16B: Evidence Pack and Ownership Graph

1. Build unified evidence pack composer.
2. Add deterministic ownership/entity attribution rules.
3. Add dedupe + confidence scoring + provenance metadata.

### Phase 16C: Planner Pass

1. Implement structured claim planner prompt + schema.
2. Add one repair loop for malformed/invalid plan.
3. Add deterministic uncertainty plan fallback.

### Phase 16D: Plan Validator

1. Validate evidence references and ownership compatibility.
2. Enforce self/other/world policy boundaries.
3. Reject player-attribution claims unsupported by player evidence.

### Phase 16E: Realizer Pass

1. Implement style realization from validated plan.
2. Add anti-injection rule: no new factual units outside plan.
3. Keep outputs concise and in player language.

### Phase 16F: Unanswerable and Abstention Policy

1. Add calibrated abstention behavior for missing/weak evidence.
2. Prefer “not sure” + clarifying question over fabricated facts.
3. Track abstention quality metrics by intent.

### Phase 16G: Eval Harness Upgrade

1. Add plan-level gold tests (ownership, evidence linkage, abstention).
2. Add regression suites for known failures (including NPC/player ownership swaps).
3. Add dashboard metrics and release gates.

### Phase 16H: Legacy Guardrail Reduction

1. Remove superseded regex/heuristic patches where V2 guarantees cover them.
2. Keep only low-level parser/safety guardrails.
3. Document retained vs removed rules for maintainability.

## Acceptance Criteria

1. Unsupported factual claim rate on knowledge intents: `<= 1.0%` in eval suite.
2. Ownership leakage (NPC lore attributed to player without player evidence): `<= 0.2%`.
3. Citation/evidence coverage for accepted knowledge claims: `>= 95%`.
4. Unanswerable handling quality (correct abstain/clarify behavior): `>= 90%`.
5. P95 latency:
   - `social_chat`: no meaningful regression (target `<= +5%` vs current).
   - knowledge intents: bounded increase (target `<= +35%`) with quality gains.

## Migration and Compatibility

1. Keep runtime diagnostics reporting `pipeline.version=v2` and plan/grounding decisions.
2. Validate with smoke/eval regression gates before each release.
3. Remove deprecated pipeline toggle surfaces to avoid split-path drift.

## Consequences

### Positive

- Architectural shift from reactive patching to proactive grounding.
- Cleaner reasoning about correctness and provenance.
- Lower long-term maintenance cost and fewer “one-off” fixes.

### Tradeoffs

- More implementation work now (new planner/realizer contracts).
- Extra model step on knowledge turns.
- Requires disciplined schema/version management.

## Implementation Status (March 4, 2026)

Implemented:

1. V2 pipeline is always-on across SugarAgent session runtime, sim/eval CLI, and preview middleware.
2. Evidence pack contracts with typed ownership attribution (`npc|player|world|beat|unknown`) and provenance metadata.
3. Evidence-first planner pass (`createEvidenceFirstTurnPlan`) for knowledge and memory-recall intents.
4. Deterministic plan validation/repair enforcing subject/evidence ownership compatibility before realization.
5. Deterministic realization pass from validated plan, including abstention-first behavior when evidence is insufficient.
6. Final claim verification retained as backstop (ADR-013 validator) after realization.
7. Typed session memory events persisted with ownership (`player_fact`, `npc_commitment`) in session state.
8. Eval upgrades:
   - per-turn pipeline diagnostics capture,
   - v2 diagnostics in run/replay artifacts,
   - ownership attribution smoke case.
9. Legacy pipeline toggle surfaces were removed to prevent split-path regressions.

## Research and Practice Basis

This ADR aligns with current evidence-grounded generation practices:

1. Retrieval-augmented generation foundations:
   - Lewis et al., “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks” (NeurIPS 2020)  
     https://arxiv.org/abs/2005.11401
2. Plan-then-act tool use patterns:
   - Yao et al., “ReAct: Synergizing Reasoning and Acting in Language Models” (ICLR 2023)  
     https://arxiv.org/abs/2210.03629
3. Adaptive retrieval and critique:
   - Asai et al., “Self-RAG” (2023)  
     https://arxiv.org/abs/2310.11511
   - Yan et al., “Corrective Retrieval Augmented Generation” (2024)  
     https://arxiv.org/abs/2401.15884
4. Attribution and revision:
   - Gao et al., “RARR” (ACL 2023)  
     https://aclanthology.org/2023.acl-long.910/
5. Atomic factual precision metrics:
   - Min et al., “FActScore” (EMNLP 2023)  
     https://aclanthology.org/2023.emnlp-main.741/
6. RAG pipeline evaluation without full gold labels:
   - Es et al., “RAGAs” (EACL Demo 2024)  
     https://aclanthology.org/2024.eacl-demo.16/
7. Long-context caution (why we keep selective evidence packs):
   - Liu et al., “Lost in the Middle” (TACL 2024)  
     https://aclanthology.org/2024.tacl-1.9/
8. Structured constrained generation:
   - Scholak et al., “PICARD” (EMNLP 2021)  
     https://aclanthology.org/2021.emnlp-main.779/
   - Tuccio et al., “GRAMMAR-LLM” (Findings ACL 2025)  
     https://aclanthology.org/2025.findings-acl.177/
9. Unanswerable-aware evaluation:
   - Peng et al., “Unanswerability Evaluation for Retrieval Augmented Generation” (2024/2025)  
     https://arxiv.org/abs/2412.12300
