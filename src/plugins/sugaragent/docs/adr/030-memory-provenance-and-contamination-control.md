# ADR-SA-030: Memory Provenance and Contamination Control

## Status

Proposed

## Date

2026-03-13

## Context

Current conversational memory is useful but too permissive. It can:

1. promote loose player utterances into memory facts,
2. treat present-turn text as evidence too eagerly,
3. preserve statements that are really player assertions about the world rather than verified world facts,
4. allow hardcoded extraction heuristics to contaminate future turns.

That makes memory helpful in the short term but risky as a long-lived correctness source.

## Decision

SugarAgent memory becomes provenance-typed and conservative by default.

Only the following record classes are persistable:

1. `player_fact`
2. `npc_commitment`
3. `shared_event`
4. `topic_marker`
5. `relationship_signal`

No memory record becomes canonical world truth merely because it was said in dialogue.

## Domain Model

```ts
type MemoryRecordType =
  | 'player_fact'
  | 'npc_commitment'
  | 'shared_event'
  | 'topic_marker'
  | 'relationship_signal';

type MemorySource =
  | 'player_explicit'
  | 'npc_verified_turn'
  | 'engine_event'
  | 'beat_progress'
  | 'legacy_import';

interface MemoryRecord {
  memoryId: string;
  type: MemoryRecordType;
  ownerType: 'npc' | 'player' | 'world' | 'beat' | 'unknown';
  text: string;
  confidence: number;
  source: MemorySource;
  provenance?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}
```

## Persistence Rules

1. `player_fact`
   - only from explicit player self-assertions,
   - never from generic world claims,
   - never from NPC inference about the player.
2. `npc_commitment`
   - only from validated NPC statements that express future intention, promise, or offered help.
3. `shared_event`
   - only from engine-confirmed events or beat-confirmed progression,
   - not from unverified conversational speculation.
4. `topic_marker`
   - conversational bookkeeping only, not factual evidence of world state.
5. `relationship_signal`
   - derived from bounded interaction telemetry, not free-form lore claims.

## Explicit Player Fact Extraction

```ts
function extractExplicitPlayerFacts(message: string): MemoryWrite[] {
  const assertions = extractFirstPersonAssertions(message);
  return assertions
    .filter((assertion) => assertion.subject === 'player_self')
    .filter((assertion) => assertion.explicit === true)
    .filter((assertion) => assertion.claimType !== 'world_fact')
    .map((assertion) => ({
      type: 'player_fact',
      ownerType: 'player',
      text: assertion.normalizedText,
      source: 'player_explicit',
      confidence: 0.95,
    }));
}
```

## Mechanical Definition of "Explicit Player Self-Assertion"

For the canonical online path, "explicit" is intentionally narrower than natural conversation in general.

An utterance qualifies as an explicit player self-assertion only if all are true:

1. the grammatical subject is first-person singular or possessive (`I`, `I'm`, `I am`, `my`),
2. the predicate expresses a personal attribute, preference, origin, ability, commitment, or possession,
3. the clause does not merely wrap a world claim in player epistemic language.

Examples that should persist as `player_fact`:

1. `I'm from Portland.`
2. `My name is Nia.`
3. `I like coffee.`
4. `I speak Spanish.`
5. `I promised to come back tomorrow.`

Examples that should not persist as `player_fact`:

1. `I think the station is north of here.`
2. `I heard the mayor is hiding something.`
3. `There is a fire in the mountains.`
4. `I guess the bridge is closed.`

The first group is player-self state. The second group is world belief, rumor, or speculation and must not be elevated into player-memory facts.

## Canonical Online Extractor

The initial extractor remains deterministic and conservative.

```ts
function classifyFirstPersonClause(clause: Clause): 'player_fact' | 'world_belief' | 'ignore' {
  if (!clause.subjectIsFirstPerson) return 'ignore';
  if (clause.predicateType in ['identity', 'origin', 'preference', 'ability', 'commitment', 'possession']) {
    return 'player_fact';
  }
  if (clause.predicateType in ['belief', 'guess', 'report', 'world_locative', 'world_event']) {
    return 'world_belief';
  }
  return 'ignore';
}
```

Ambiguous clauses should be ignored or downgraded to a transient `topic_marker`, not forced into long-lived memory by another online LLM call.

## Memory Write Filter

```ts
function filterMemoryWrites(input: {
  plan: TurnPlan;
  verifiedTurn: SugarAgentTurnOutput;
  engineEvents: EngineEvent[];
}): MemoryWrite[] {
  const writes: MemoryWrite[] = [];

  for (const candidate of input.plan.memoryWrites) {
    if (candidate.type === 'player_fact' && candidate.source !== 'player_explicit') continue;
    if (candidate.type === 'shared_event' && !isEngineVerifiedSharedEvent(candidate, input.engineEvents)) continue;
    writes.push(candidate);
  }

  return writes;
}
```

## Legacy Memory Migration

Existing memory records may remain loadable, but they must be marked as:

- `source: legacy_import`
- reduced confidence unless re-verified

Legacy records must not be silently upgraded to trusted evidence without passing current validation rules.

## Heuristic Removal Rules

The following behaviors are explicitly disallowed in the new design:

1. hardcoded world-event heuristics embedded in player fact extraction,
2. automatic promotion of `there is ...` style player text into world truth,
3. immediate use of current-turn raw text as high-confidence evidence without persistence filtering.

## Engine Boundary

SugarEngine remains the authority for:

1. world events,
2. quest outcomes,
3. inventory and action verification,
4. any event that should become canonical shared state.

SugarAgent memory may mirror those outcomes, but it may not author them.

## SugarLang Compatibility

SugarLang may consume memory summaries for learner scaffolding, but it must not:

1. persist SugarAgent memory directly,
2. reinterpret player-language mistakes as world truth,
3. bypass provenance and confidence rules.

## Consequences

Positive:

1. memory becomes safer to use as evidence,
2. player assertions remain useful without contaminating canon,
3. long-running NPC sessions become more stable.

Tradeoff:

1. fewer records will be persistable without explicit verification,
2. some previous "helpful" recall behavior may become more conservative until better extraction exists,
3. the deterministic extractor will intentionally leave some borderline cases unmodeled in exchange for lower contamination risk.

## Acceptance Criteria

1. Player self-facts persist only from explicit self-assertions.
2. Shared events persist only from engine-verified or beat-verified sources.
3. Legacy records load safely but are provenance-marked.
4. World-claim heuristics and hardcoded event extraction are removed from the canonical memory write path.
