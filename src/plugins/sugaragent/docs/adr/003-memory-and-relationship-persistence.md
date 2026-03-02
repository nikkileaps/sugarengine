# ADR-SA-003: Memory and Relationship Persistence

## Status

Accepted

## Context

Persistent NPC continuity requires memory and relationship state across sessions.

## Decision

### 1) Authoritative store for MVP (Phase 3)

Use **save-slot JSON** as the authoritative persistent store via engine `SaveManager`.

SugarAgent state is serialized into:

- `GameSaveData.plugins.sugaragent`

This means storage backend is inherited from engine save providers:

- Browser: `LocalStorageProvider`
- Desktop app: `TauriFileProvider` (filesystem JSON)
- Mobile app targets: platform save provider (same `GameSaveData` contract)

No separate database is required for Phase 3.

### 2) Plugin state shape (V1)

Persist a versioned plugin envelope:

```ts
interface SugarAgentPluginStateV1 {
  schemaVersion: 1;
  updatedAt: number;
  playerModel: {
    targetLanguage?: string;
    estimatedLevel?: string;
    confidence?: number;
  };
  npcs: Record<string, NPCMemoryStateV1>;
  dialogueSessions?: Record<string, DialogueSessionStateV1>;
}

interface NPCMemoryStateV1 {
  relationship: {
    affinity: number;
    trust: number;
    respect: number;
    tension: number;
    lastUpdated: number;
  };
  episodic: EpisodicMemoryRecordV1[];
  semantic: SemanticBeliefRecordV1[];
  conversationSummaries: ConversationSummaryV1[];
}

interface DialogueSessionStateV1 {
  npcId: string;
  activeBeatId?: string;
  coveredFacts?: string[];
  uncoveredFacts?: string[];
  turnCount: number;
  updatedAt: number;
}
```

`dialogueSessions` is resumable plugin context only. Canonical quest/episode beat completion state remains engine-owned.

### 3) Write policy

1. Only salient events are persisted (promises, gifts, conflicts, quest-relevant facts, emotionally weighted turns).
2. Relationship deltas are updated per salient turn.
3. Raw turn logs are not stored indefinitely.
4. Save snapshots are produced through `serializeState()` when engine saves.

### 4) Compaction policy

To control save size:

- cap episodic memory count per NPC (bounded ring buffer)
- summarize old episodic clusters into semantic/summaries
- drop low-salience stale items first

### 5) Embeddings/index persistence policy

For Phase 3:

- persist memory text + metadata
- do not require full vector index persistence in save payload
- rebuild or lazily regenerate runtime retrieval cache after load

This avoids oversized save files and keeps slot portability.

### 6) Migration policy

- Store `schemaVersion` in plugin envelope.
- Add deterministic migrators for future schema revisions.
- If migration fails, plugin can load partial state safely (never break core game load).

### 7) Future extension (not Phase 3)

If memory volume grows beyond practical save-slot size, add an optional plugin-local DB cache
(for example SQLite), but keep save-slot snapshot as the portable canonical baseline unless a
new ADR intentionally changes authority.

## Consequences

Positive:

- Long-term continuity for NPC interactions.
- Save compatibility with non-plugin games.
- Save portability across desktop/mobile providers using one schema.

Tradeoff:

- JSON payload size pressure requires strict compaction rules.
- Rebuilding runtime retrieval cache after load adds startup cost.
- Session beat context must stay compact to avoid save bloat.

## MVP Test (End of Phase 3)

```bash
npm run sugaragent:sim -- --npc baker --session memory-smoke
```

Procedure:

1. Tell NPC a salient fact (promise, gift, conflict).
2. Save and reload session.
3. Ask NPC to recall.
4. If an authored beat is active, confirm session resumes beat context without auto-completing engine quest state.

Expected:

- NPC recalls salient fact.
- State is loaded from plugin namespace.
- Save file/slot contains `plugins.sugaragent` with versioned plugin state.
- Beat progress remains an engine validation outcome, not a plugin direct write.

Developer note:

- Sim session persistence for MVP writes to `.sugaragent-sim-sessions/<session>.json`.
