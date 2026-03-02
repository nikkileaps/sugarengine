# ADR-SA-005: Dialogue Orchestration and Intent Gating

## Status

Accepted

## Context

Model output must never directly mutate canonical game state.
At the same time, authored episodes/quests need free-form delivery of specific story beats.
We need a contract where authored narrative goals remain deterministic while NPC dialogue remains LLM-driven.

## Decision

### 1) Turn orchestration precedence

1. Engine resolves scripted dialogue first.
2. If scripted flow does not fully resolve turn, engine passes optional active beat contract to SugarAgent.
3. SugarAgent generates free-form response constrained by the beat contract.

### 2) Engine-owned beat contract schema

Authored narrative data defines optional agent beat contracts:

```ts
interface AgentBeatContract {
  beatId: string;
  objective: string;
  requiredFacts: string[];
  forbiddenFacts?: string[];
  completionRule: "player_ack" | "player_action" | "engine_flag";
  completionTarget?: string;
  maxTurns?: number;
  fallbackScriptId?: string;
}
```

Engine owns this contract and quest progression state.

### 3) Required structured model output

SugarAgent must return schema-validated payload:

- `utterance`
- `emotion`
- `proposedIntents[]`
- `citations[]`
- `beatEvidence`:
  - `beatId`
  - `coveredFacts[]`
  - `uncoveredFacts[]`
  - `completionSignal`
  - `confidence`

### 4) Deterministic completion evaluation

Engine evaluates `beatEvidence` against authored contract rules and current world/quest state.
Only engine can mark beat complete and advance quest/episode state.

### 5) Intent gating remains mandatory

1. SugarAgent submits `proposedIntents[]` through plugin gate.
2. Engine validates and executes allowed intents only.
3. Rejected intents are returned to plugin for adjustment/logging.

### 6) Fallback behavior

If `maxTurns` is exceeded or beat confidence remains low:

1. Engine can force scripted fallback via `fallbackScriptId`.
2. Quest progression remains blocked until deterministic completion rule is satisfied.

## Consequences

Positive:

- Deterministic control over side effects.
- Prevents impossible world mutations.
- Supports authored beat-driven narrative with natural free-form NPC delivery.
- Keeps quest progression auditable and testable.

Tradeoff:

- Additional intent-mapping work for each new capability.
- Additional authoring/evaluation schema and tooling required for beat contracts.
- Beat-evidence extraction quality becomes a key reliability surface.

## MVP Test (End of Phase 4)

```bash
npm run sugaragent:sim -- --scenario beat-guard-alert --npc guard --ask "What is happening at the gate?"
```

Expected:

- Legal intents execute.
- Illegal intents are rejected with clear reason.
- NPC response remains free-form while covering required beat facts.
- Beat does not complete unless engine completion rule is satisfied.
- Fallback scripted line is used if beat cannot be completed within configured turn budget.

Developer note:

- Current MVP harness uses the shared SugarAgent session runtime (invoked by sim CLI) with scenario orchestration (`beat-guard-alert`) to validate intent gating + beat evidence + fallback behavior before full in-game wiring.
