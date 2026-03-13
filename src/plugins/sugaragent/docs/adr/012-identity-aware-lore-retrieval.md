# ADR-012: SugarAgent Identity-Aware Lore Retrieval

## Status

Accepted

## Context

ADR-011 wired SugarAgent to local provider/runtime and scoped lore retrieval, but NPC identity grounding is still weak when multiple lore scopes are configured.

Current failure mode:

- An NPC can have lore scopes for self, family, friends, and town history.
- On self-directed questions ("who are you?", "where are you from?", "tell me about your past"), retrieval can return related-entity chunks instead of self chunks.
- Result: NPC may answer with facts that belong to another character.

This blocks the goal of making NPCs feel like persistent world entities with coherent personal history.

Additional observed quality failure modes:

- After clearing session memory, NPCs can still imply prior familiarity ("you look familiar") on first contact.
- Low-confidence lore matches can override otherwise reasonable dialogue with off-topic "archive" lines.
- Result: responses feel ungrounded even when session persistence is behaving correctly.

## Decision

Add identity-aware retrieval and ranking so SugarAgent can distinguish:

1. **self facts** (about the speaking NPC),
2. **related facts** (friends/family/acquaintances),
3. **ambient/world facts** (location/history/factions).

Identity will be explicit in authored profile, not inferred only from freeform text.

Also add conversation-grounding hard guards so runtime behavior respects session state and retrieval confidence:

1. enforce first-meet behavior when no prior turns exist with that NPC,
2. prevent weak lore matches from overriding replies,
3. prefer uncertainty over fabricated or cross-entity facts.

## Schema Changes

Extend NPC `agentProfile` with:

- `selfEntityId?: string` (example: `npc.bub`)
- `selfLoreScopes?: string[]`
- `relatedLoreScopes?: string[]`

Keep existing fields:

- `persona`, `tone`, `constraints`, `loreScopes`

Compatibility rules:

1. If new fields are absent, existing behavior remains.
2. If `selfLoreScopes`/`relatedLoreScopes` are empty, fall back to `loreScopes`.
3. `loreScopes` is kept for backward compatibility and migration safety.

## Retrieval Policy

### 1) Turn intent classification

Before retrieval, classify question type:

- `self_query`: asks about NPC identity/background/memory/family role
- `other_query`: asks about another named entity
- `world_query`: asks about place/history/events
- `mixed_query`: combines self + world/other

This can be lightweight heuristic + optional model assist later.

### 2) Candidate pools

Build candidate pools in priority order:

1. self pool: `selfLoreScopes` + `entity_ids` contains `selfEntityId`
2. related pool: `relatedLoreScopes`
3. ambient pool: remaining configured scopes

### 3) Ranking adjustments

Apply score boosts/penalties on top of lexical relevance:

- strong boost for `entity_ids` exact match with `selfEntityId` on `self_query`
- penalty for non-self entity chunks on `self_query`
- boost for named target entity on `other_query`
- world/history boosts for `world_query`

### 4) Response guardrails

For `self_query`, answer must prefer self pool unless evidence is missing.
If no self evidence is found, respond with uncertainty instead of borrowing another entity’s facts.

### 5) Confidence gating and first-meet policy

- Compute retrieval confidence using score threshold + score margin against runner-up.
- Only apply lore-grounded override when confidence is high enough and query intent is knowledge-seeking.
- If confidence is low, keep conversational response (or emit uncertainty) instead of forcing "From the archives".
- Derive `isFirstMeeting` from per-NPC session history and pass it through turn context.
- When `isFirstMeeting=true`, disallow implied prior familiarity unless explicitly supported by evidence.

## Prompting Policy

Inject identity contract into runtime prompt:

- "You are `<npcName>` with canonical entity id `<selfEntityId>`."
- "For self questions, use only self-attributed evidence."
- "Do not answer self questions using facts attributed only to other entities."
- "If this is a first meeting, do not imply prior acquaintance."
- "If evidence is weak or missing, say you are not sure instead of inventing details."

## Implementation Plan

### Phase 12A: Authoring + Types

1. Extend editor store/types for `selfEntityId`, `selfLoreScopes`, `relatedLoreScopes`.
2. Extend engine plugin request types and provider/runtime request types.
3. Preserve backward compatibility with existing `loreScopes`.

### Phase 12B: Runtime Retrieval Engine

1. Add turn query classifier (`self/other/world/mixed`).
2. Add pool-based retrieval in `lore-lib` and session runtime.
3. Add identity-weighted ranking and self-query penalties.

### Phase 12C: Prompt + Safety Enforcement

1. Add identity contract block to llama prompt builder.
2. Add post-retrieval/self-query sanity checks:
   - reject citations that are only non-self for self questions,
   - force uncertainty response when self evidence is absent.

### Phase 12D: Editor UX + Validation

1. NPC panel fields for identity-aware settings.
2. Validation:
   - warn when `interactionMode=agent` and no `selfEntityId`,
   - warn when identity fields exist but no matching lore scopes.

### Phase 12E: Tests + Evals

1. Unit tests for classifier and ranking.
2. Integration tests for self vs related scope behavior.
3. Eval cases:
   - self identity recall precision,
   - cross-entity contamination rate.

### Phase 12F: Conversation Grounding Hardening

1. Add runtime turn-state fields:
   - `isFirstMeeting` (derived from empty per-NPC history),
   - `turnIndexWithNpc`.
2. Add output validators/repair rules:
   - reject first-meet lines that imply prior familiarity,
   - retry with repair prompt, fallback to safe first-meet response if needed.
3. Add retrieval confidence gate:
   - require minimum top score and minimum top-vs-second margin before lore override,
   - restrict override to knowledge-seeking intents (`self_query`/`other_query`/`world_query`/`mixed_query`),
   - default to non-lore conversational reply or explicit uncertainty when confidence is low.
4. Add regression tests/evals for:
   - post-reset first-contact behavior,
   - low-confidence lore queries not producing off-topic archive lines.

## Implementation Status (March 4, 2026)

All phases in this ADR are implemented:

- 12A complete:
  - identity fields added to editor/engine/provider/runtime/authoring contracts:
    - `selfEntityId`
    - `selfLoreScopes`
    - `relatedLoreScopes`
- 12B complete:
  - query-type-aware retrieval now applies identity-weighted scoring and self/related/ambient pool ranking.
- 12C complete:
  - runtime prompt includes identity contract when identity config exists.
  - self-query lore override now requires self-supporting evidence; otherwise runtime emits uncertainty.
- 12D complete:
  - NPC editor surface includes identity fields and validation warnings for missing identity configuration in agent/hybrid mode.
- 12E complete:
  - identity-focused retrieval/unit tests and sim/eval coverage added.
- 12F complete:
  - first-meeting guards, repair/fallback path, confidence gating, and regression tests are wired.

## Acceptance Criteria

1. With mixed scopes configured, self questions resolve to self facts in >95% of eval prompts.
2. Cross-entity contamination on self questions is <2%.
3. Related-entity questions still work when explicitly asked.
4. Existing projects with only `loreScopes` continue to function without migration.
5. After session reset, first-contact prompts do not imply prior relationship in >=99% of eval runs.
6. Low-confidence retrieval does not force lore override; off-topic archive responses are reduced to <2% in targeted eval set.

## Consequences

### Positive

- NPC responses remain identity-consistent even with broad lore scope coverage.
- Supports richer social networks (family/friends) without collapsing character boundaries.
- Improves believability and authored narrative control.
- Prevents common immersion breaks after memory reset and weak-lore matches.

### Tradeoffs

- More authoring fields and validation complexity.
- Additional retrieval/ranking logic and test surface.
- Requires stronger lore metadata hygiene (`entity_ids` quality matters more).
- Slightly more conservative responses (more uncertainty when evidence is weak).
