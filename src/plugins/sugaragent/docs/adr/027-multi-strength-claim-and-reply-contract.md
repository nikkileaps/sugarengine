# ADR-SA-027: Multi-Strength Claim and Reply Contract

## Status

Proposed

## Date

2026-03-13

## Context

The current runtime-owned reply contract effectively forces knowledge turns into a binary outcome:

1. grounded,
2. uncertain.

That is too coarse for believable NPC conversation. Real characters often answer in intermediate ways:

1. "I think..."
2. "I heard..."
3. "People say..."
4. "It sounds like..."

Without explicit contract support for those cases, the system either hallucinates confidence or collapses into repetitive uncertainty.

## Decision

SugarAgent adopts a multi-strength claim model and extends realization contracts accordingly.

### Claim modes

1. `grounded`
2. `inferred`
3. `rumor`

### Reply part kinds

1. `social`
2. `grounded`
3. `inferred`
4. `rumor`
5. `uncertain`
6. `close`

## Domain Model

```ts
type ClaimMode = 'grounded' | 'inferred' | 'rumor';
type RequiredHedge = 'none' | 'soft' | 'strong';

interface PlannedClaim {
  claimId: string;
  mode: ClaimMode;
  subject: string;
  ownerType: 'npc' | 'player' | 'world' | 'beat' | 'unknown';
  text: string;
  evidenceIds: string[];
  confidence: number;
  requiredHedge: RequiredHedge;
  maxSpecificity: 'exact' | 'bounded' | 'coarse';
}

interface ReplyPart {
  kind: 'social' | 'grounded' | 'inferred' | 'rumor' | 'uncertain' | 'close';
  text: string;
  support?: string[];
}
```

## Realization Rules

1. `grounded`
   - may be phrased directly,
   - must not exceed evidence specificity,
   - must not include hedge language unless stylistically appropriate.
2. `inferred`
   - must include soft hedge language,
   - must be derived from at least two compatible evidence items or one evidence item plus engine/runtime state.
3. `rumor`
   - must include strong hedge language,
   - must preserve uncertainty and social distance from the claim.
4. `uncertain`
   - is used when the system cannot produce a claim that satisfies contract rules.

## Hedge Policy

### Soft hedge examples

- `I think`
- `it seems`
- `it sounds like`
- `from what I know`

### Strong hedge examples

- `I heard`
- `people say`
- `rumor has it`
- `I cannot vouch for it, but`

The exact wording is realization-dependent, but the hedge strength must be preserved semantically.

## Planning Rules

```ts
function chooseClaimMode(evidenceItems: EvidenceItem[]): ClaimMode | 'uncertain' {
  if (evidenceItems.length === 0) return 'uncertain';
  if (evidenceItems.every((item) => item.accessPolicy === 'assert')) return 'grounded';
  if (evidenceItems.some((item) => item.knowledgeClass === 'rumor')) return 'rumor';
  if (evidenceItems.every((item) => item.accessPolicy === 'assert' || item.accessPolicy === 'hedged')) {
    return 'inferred';
  }
  return 'uncertain';
}

function requiredHedgeForMode(mode: ClaimMode): RequiredHedge {
  if (mode === 'grounded') return 'none';
  if (mode === 'inferred') return 'soft';
  return 'strong';
}
```

## Reply Contract Changes

The existing runtime-owned reply transport remains, but validation rules change:

1. `grounded` parts require valid support and no disallowed overstatement,
2. `inferred` parts require valid support plus hedge compliance,
3. `rumor` parts require valid support plus strong hedge compliance,
4. `uncertain` remains valid without support,
5. factual content may not be smuggled through `social` parts.

## Engine Boundary

This ADR does not move deterministic quest or world progression into SugarAgent.

`grounded`, `inferred`, and `rumor` are conversational truth modes, not authority modes. None of them may:

1. complete objectives,
2. mutate world state,
3. establish canonical engine facts.

## SugarLang Compatibility

SugarLang may simplify or band the wording of:

1. direct answers,
2. soft hedge language,
3. strong hedge language.

It may not collapse:

1. `rumor` into `grounded`,
2. `inferred` into certainty,
3. `uncertain` into a contentful answer.

## Consequences

Positive:

1. the NPC can remain conversational without fabricating canon,
2. the system has a contract-level middle ground between certainty and abstention,
3. rumor and inference become explicit and testable.

Tradeoff:

1. validators become more complex,
2. realization must track hedge strength, not only support references.

## Acceptance Criteria

1. Knowledge turns support `grounded`, `inferred`, `rumor`, and `uncertain` outcomes.
2. `inferred` and `rumor` replies are rejected if their hedge strength is missing or too weak.
3. `social` parts cannot be used to bypass factual-mode restrictions.
