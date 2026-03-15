# ADR-SA-026: NPC Epistemology and Disclosure Model

## Status

Proposed

## Date

2026-03-13

## Context

The current ownership model distinguishes only:

- `npc`
- `player`
- `world`
- `beat`
- `unknown`

That is necessary but not sufficient. It answers "who owns this fact?" but not:

1. how the NPC knows it,
2. whether the NPC may assert it,
3. whether the NPC should hedge it,
4. whether the NPC may volunteer it,
5. whether the NPC should refuse to discuss it.

Without an epistemology layer, NPCs drift toward two bad extremes:

1. omniscient exposition,
2. overuse of flat uncertainty.

## Decision

Every evidence item used by SugarAgent must carry epistemic metadata. Planning and validation must use that metadata to decide whether the NPC may:

1. assert,
2. hedge,
3. recall,
4. refuse,
5. redirect.

## Domain Model

```ts
type KnowledgeClass =
  | 'self_profile'
  | 'routine_state'
  | 'witnessed_event'
  | 'public_fact'
  | 'rumor'
  | 'private_other'
  | 'faction_internal'
  | 'player_assertion'
  | 'beat_fact';

type AccessPolicy = 'assert' | 'hedged' | 'recall_only' | 'forbidden';
type DisclosurePolicy = 'volunteer_ok' | 'answer_only' | 'never';

interface EvidenceItem {
  evidenceId: string;
  factId?: string;
  ownerType: 'npc' | 'player' | 'world' | 'beat' | 'unknown';
  knowledgeClass: KnowledgeClass;
  accessPolicy: AccessPolicy;
  disclosurePolicy: DisclosurePolicy;
  entityIds: string[];
  text: string;
  confidence: number;
  provenance?: Record<string, unknown>;
}
```

## Default Policy Table

| `knowledgeClass` | default `accessPolicy` | default `disclosurePolicy` | NPC behavior |
|---|---|---|---|
| `self_profile` | `assert` | `answer_only` | Can answer directly about self |
| `routine_state` | `assert` | `volunteer_ok` | Can mention current task/location when observed from engine state |
| `witnessed_event` | `assert` or `hedged` | `answer_only` | Assert only when confidence is high, otherwise hedge |
| `public_fact` | `assert` | `answer_only` | Ordinary world knowledge |
| `rumor` | `hedged` | `answer_only` | Must never be phrased as certainty |
| `private_other` | `forbidden` | `never` | Must refuse or redirect unless explicit authored grant exists |
| `faction_internal` | `hedged` or `forbidden` | `answer_only` | Depends on authored permissions |
| `player_assertion` | `recall_only` | `answer_only` | May recall what the player said, not reclassify it as world truth |
| `beat_fact` | `assert` | `volunteer_ok` or `answer_only` | Determined by authored beat urgency |

## Planning Rules

1. A claim may use only evidence items whose `accessPolicy` permits the claim mode.
2. `private_other` facts are unavailable by default, even if retrieval found them.
3. `player_assertion` facts may be recalled as "you said..." but not rephrased as canonical world truth.
4. `rumor` evidence must produce `rumor` or strongly hedged `inferred` claims only.
5. `routine_state` should come from engine/runtime state first, not lore text.

## Algorithm Sketch

```ts
function deriveEpistemicPolicy(input: {
  evidence: RawEvidence;
  npcSnapshot: NpcStateSnapshot;
  beatContract?: BeatContract | null;
}): Pick<EvidenceItem, 'knowledgeClass' | 'accessPolicy' | 'disclosurePolicy'> {
  if (input.evidence.sourceType === 'self_profile') {
    return { knowledgeClass: 'self_profile', accessPolicy: 'assert', disclosurePolicy: 'answer_only' };
  }

  if (input.evidence.sourceType === 'player_fact') {
    return { knowledgeClass: 'player_assertion', accessPolicy: 'recall_only', disclosurePolicy: 'answer_only' };
  }

  if (input.evidence.sourceType === 'beat_fact') {
    return {
      knowledgeClass: 'beat_fact',
      accessPolicy: 'assert',
      disclosurePolicy: input.beatContract?.urgency === 'high' ? 'volunteer_ok' : 'answer_only',
    };
  }

  if (input.evidence.metadata?.visibility === 'rumor') {
    return { knowledgeClass: 'rumor', accessPolicy: 'hedged', disclosurePolicy: 'answer_only' };
  }

  if (input.evidence.metadata?.visibility === 'private_other') {
    return { knowledgeClass: 'private_other', accessPolicy: 'forbidden', disclosurePolicy: 'never' };
  }

  return { knowledgeClass: 'public_fact', accessPolicy: 'assert', disclosurePolicy: 'answer_only' };
}
```

## Engine Boundary

SugarEngine remains the authority for:

1. current NPC location and routine state when simulation exists,
2. quest/beat urgency,
3. hidden/private game state that SugarAgent must not reveal unless explicitly granted.

SugarAgent may not infer engine-private facts from public lore alone.

## SugarLang Compatibility

SugarLang may influence how a claim is phrased, but it must never alter:

1. `knowledgeClass`,
2. `accessPolicy`,
3. `disclosurePolicy`.

Those are factual-governance fields owned by SugarAgent.

## Consequences

Positive:

1. NPCs gain a usable middle ground between omniscience and refusal,
2. private information becomes a contract rather than a prompt instruction,
3. rumor-style responses become possible without contaminating canon.

Tradeoff:

1. lore ingestion and authoring schemas need new metadata,
2. missing metadata requires conservative defaults during migration.

## Acceptance Criteria

1. Every planned claim can be traced to evidence items with epistemic metadata.
2. An NPC cannot assert a `rumor` or `private_other` fact as certain truth.
3. Player assertions are recallable but are not elevated to world canon by default.
4. Engine-provided routine state is preferred over lore-derived routine descriptions when both exist.
