# ADR-018: Structured World State System

## Status

Accepted (Phases 1-3 implemented)

## Context

ADR-016 (Beats Graph) handles quest/narrative flow. ADR-017 (NPC Behavior Trees) handles NPC decision-making. These systems need to communicate without tight coupling.

The naive approach—raw string flags—leads to:
- Flag spaghetti ("what sets `flag_xyz_temp2`?")
- No type safety
- No tooling support
- Hard to debug

We need a **structured world state** system that:
1. Provides a clean contract between systems
2. Is queryable by both quests and NPCs
3. Supports tooling (what reads/writes this state?)
4. Scales to large games

## Decision

Implement a structured world state system that serves as the central source of truth for game state that multiple systems need to access.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SUGAR ENGINE                             │
│                                                                 │
│  ┌─────────────────────┐          ┌─────────────────────────┐  │
│  │    BEATS GRAPH      │          │   NPC BEHAVIOR TREES    │  │
│  │    (ADR-016)        │          │      (ADR-017)          │  │
│  │                     │          │                         │  │
│  │  Quest/Story Flow   │          │  NPC Decision-Making    │  │
│  │  - Objectives       │          │  - Dialogue selection   │  │
│  │  - Narratives       │          │  - Movement             │  │
│  │  - Conditions       │          │  - Schedules            │  │
│  │  - Actions          │          │  - Reactions            │  │
│  └──────────┬──────────┘          └────────────┬────────────┘  │
│             │                                  │                │
│             │    WRITES                READS   │                │
│             │                                  │                │
│             ▼                                  ▼                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   WORLD STATE (ADR-018)                  │  │
│  │                                                          │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐│  │
│  │  │   Quest     │ │    Flags    │ │      World         ││  │
│  │  │   State     │ │             │ │      State         ││  │
│  │  │             │ │ Key-value   │ │                    ││  │
│  │  │ - Active    │ │ pairs for   │ │ - Time of day     ││  │
│  │  │ - Stages    │ │ custom game │ │ - Weather         ││  │
│  │  │ - Completed │ │ state       │ │ - Region          ││  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘│  │
│  │                                                          │  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐│  │
│  │  │  Inventory  │ │   Player    │ │    Relationships   ││  │
│  │  │             │ │   Stats     │ │                    ││  │
│  │  │ - Items     │ │             │ │ - NPC affinity     ││  │
│  │  │ - Counts    │ │ - Resonance │ │ - Faction standing ││  │
│  │  │             │ │ - Battery   │ │                    ││  │
│  │  └─────────────┘ └─────────────┘ └─────────────────────┘│  │
│  │                                                          │  │
│  └──────────────────────────────────────────────────────────┘  │
│             │                                  │                │
│             │    READS                 READS   │                │
│             │                                  │                │
│             ▼                                  ▼                │
│  ┌─────────────────────┐          ┌─────────────────────────┐  │
│  │   DIALOGUE SYSTEM   │          │     OTHER SYSTEMS       │  │
│  │                     │          │                         │  │
│  │  Conditional        │          │  - UI (quest tracker)   │  │
│  │  dialogue branches  │          │  - Save/Load            │  │
│  │                     │          │  - Analytics            │  │
│  └─────────────────────┘          └─────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### State Categories

The world state is organized into **typed namespaces**:

```typescript
interface WorldState {
  // Quest-related state (managed by QuestManager)
  quest: QuestStateNamespace;

  // Player inventory (managed by InventoryManager)
  inventory: InventoryNamespace;

  // Player stats (managed by CasterManager, etc.)
  player: PlayerNamespace;

  // World environment (managed by Engine/Game)
  world: WorldNamespace;

  // Custom flags (managed by anyone via actions)
  flags: FlagsNamespace;

  // NPC relationships (managed by RelationshipManager)
  relationships: RelationshipsNamespace;
}
```

### Namespace Definitions

```typescript
// Quest state - read-only from outside QuestManager
interface QuestStateNamespace {
  isActive(questId: string): boolean;
  isCompleted(questId: string): boolean;
  isFailed(questId: string): boolean;

  getCurrentStage(questId: string): string | null;
  isStageActive(questId: string, stageId: string): boolean;
  isStageCompleted(questId: string, stageId: string): boolean;

  isNodeActive(questId: string, nodeId: string): boolean;
  isNodeCompleted(questId: string, nodeId: string): boolean;
}

// Inventory - read-only from outside InventoryManager
interface InventoryNamespace {
  hasItem(itemId: string): boolean;
  getItemCount(itemId: string): number;
  hasItemCount(itemId: string, count: number): boolean;
}

// Player stats
interface PlayerNamespace {
  getResonance(): number;  // 0-100
  getBattery(): number;    // 0-100
  getHealth(): number;     // 0-100

  hasSpell(spellId: string): boolean;
  getPosition(): Vec3;
  getCurrentRegion(): string | null;
}

// World environment
interface WorldNamespace {
  getTimeOfDay(): 'dawn' | 'day' | 'dusk' | 'night';
  getHour(): number;  // 0-23
  getWeather(): 'clear' | 'cloudy' | 'rain' | 'storm';
  getCurrentRegion(): string;  // Region the player is in
}

// Custom flags - typed to prevent stringly-typed chaos
interface FlagsNamespace {
  get(key: string): unknown;
  getBoolean(key: string): boolean;
  getNumber(key: string): number;
  getString(key: string): string;

  set(key: string, value: unknown): void;

  // For tooling
  getAllFlags(): Map<string, unknown>;
}

// NPC relationships
interface RelationshipsNamespace {
  getAffinity(npcId: string): number;  // -100 to 100
  getFactionStanding(factionId: string): number;
  hasMetNPC(npcId: string): boolean;
}
```

### Condition Expressions

Both the beats graph (ADR-016) and behavior trees (ADR-017) use the same condition expression format:

```typescript
type WorldStateCondition =
  // Quest conditions
  | { type: 'questActive'; questId: string }
  | { type: 'questCompleted'; questId: string }
  | { type: 'questFailed'; questId: string }
  | { type: 'questStage'; questId: string; stageId: string; state: 'active' | 'completed' }
  | { type: 'questNode'; questId: string; nodeId: string; state: 'active' | 'completed' }

  // Inventory conditions
  | { type: 'hasItem'; itemId: string }
  | { type: 'hasItemCount'; itemId: string; count: number; comparison?: 'eq' | 'gte' | 'lte' }

  // Player conditions
  | { type: 'resonance'; value: number; comparison: 'eq' | 'gte' | 'lte' }
  | { type: 'battery'; value: number; comparison: 'eq' | 'gte' | 'lte' }
  | { type: 'hasSpell'; spellId: string }
  | { type: 'inRegion'; regionId: string }

  // World conditions
  | { type: 'timeOfDay'; value: 'dawn' | 'day' | 'dusk' | 'night' }
  | { type: 'hourRange'; min: number; max: number }
  | { type: 'weather'; value: 'clear' | 'cloudy' | 'rain' | 'storm' }

  // Flag conditions
  | { type: 'flag'; key: string; value?: unknown }
  | { type: 'flagEquals'; key: string; value: unknown }
  | { type: 'flagGreaterThan'; key: string; value: number }

  // Relationship conditions
  | { type: 'affinity'; npcId: string; value: number; comparison: 'eq' | 'gte' | 'lte' }
  | { type: 'factionStanding'; factionId: string; value: number; comparison: 'eq' | 'gte' | 'lte' }
  | { type: 'hasMetNPC'; npcId: string }

  // Compound conditions
  | { type: 'and'; conditions: WorldStateCondition[] }
  | { type: 'or'; conditions: WorldStateCondition[] }
  | { type: 'not'; condition: WorldStateCondition };
```

### Condition Evaluator

Single source of truth for evaluating conditions:

```typescript
class WorldStateEvaluator {
  constructor(
    private questManager: QuestManager,
    private inventory: InventoryManager,
    private caster: CasterManager,
    private world: WorldManager,
    private flags: FlagsManager,
    private relationships: RelationshipsManager
  ) {}

  check(condition: WorldStateCondition): boolean {
    switch (condition.type) {
      // Quest
      case 'questActive':
        return this.questManager.isQuestActive(condition.questId);
      case 'questCompleted':
        return this.questManager.isQuestCompleted(condition.questId);
      case 'questStage':
        if (condition.state === 'active') {
          return this.questManager.isStageActive(condition.questId, condition.stageId);
        }
        return this.questManager.isStageCompleted(condition.questId, condition.stageId);

      // Inventory
      case 'hasItem':
        return this.inventory.has(condition.itemId);
      case 'hasItemCount':
        const count = this.inventory.getCount(condition.itemId);
        return this.compare(count, condition.count, condition.comparison ?? 'gte');

      // Player
      case 'resonance':
        return this.compare(this.caster.getResonance(), condition.value, condition.comparison);
      case 'battery':
        return this.compare(this.caster.getBattery(), condition.value, condition.comparison);
      case 'hasSpell':
        return this.caster.hasSpell(condition.spellId);

      // World
      case 'timeOfDay':
        return this.world.getTimeOfDay() === condition.value;
      case 'hourRange':
        const hour = this.world.getHour();
        return hour >= condition.min && hour <= condition.max;

      // Flags
      case 'flag':
        const val = this.flags.get(condition.key);
        if (condition.value === undefined) {
          return val !== undefined && val !== false && val !== null;
        }
        return val === condition.value;

      // Compound
      case 'and':
        return condition.conditions.every(c => this.check(c));
      case 'or':
        return condition.conditions.some(c => this.check(c));
      case 'not':
        return !this.check(condition.condition);

      default:
        console.warn(`Unknown condition type: ${(condition as any).type}`);
        return false;
    }
  }

  private compare(actual: number, expected: number, comparison: 'eq' | 'gte' | 'lte'): boolean {
    switch (comparison) {
      case 'eq': return actual === expected;
      case 'gte': return actual >= expected;
      case 'lte': return actual <= expected;
    }
  }
}
```

### Change Notifications

Systems can subscribe to state changes for reactive updates:

```typescript
type StateChangeListener = (change: StateChange) => void;

interface StateChange {
  namespace: 'quest' | 'inventory' | 'player' | 'world' | 'flags' | 'relationships';
  key: string;
  oldValue: unknown;
  newValue: unknown;
}

class WorldState {
  private listeners: Set<StateChangeListener> = new Set();

  subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Called by managers when state changes
  notify(change: StateChange): void {
    for (const listener of this.listeners) {
      listener(change);
    }
  }
}
```

This enables:
- Beats graph condition nodes to re-evaluate when relevant state changes
- NPC behavior trees to react to state changes (if in continuous mode)
- UI to update (quest tracker, inventory display)

### Flag Naming Conventions

To prevent flag chaos, establish conventions:

```
Namespace Format:
  <system>.<entity>.<property>

Examples:
  quest.flying_home.started
  quest.flying_home.guard_bribed
  npc.guard_01.angry
  world.manor.door_unlocked
  player.tutorial.completed
  chapter.1.finished
```

**Editor tooling** enforces and suggests these patterns.

### Tooling: State Inspector

Editor panel showing:
1. All current state values
2. What systems read each value
3. What systems write each value
4. State change history (for debugging)

```
┌─────────────────────────────────────────────────────────────┐
│ World State Inspector                          [Live] [Log] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ▼ Quest State                                               │
│   flying_home: active (stage: build_resonance)              │
│     └─ readers: Guard BT, Merchant BT                       │
│                                                             │
│ ▼ Inventory                                                 │
│   <rug-uuid> "Flying Rug": 1                                │
│     └─ readers: Quest "Flying Home" condition               │
│                                                             │
│ ▼ Player                                                    │
│   resonance: 23%                                            │
│   battery: 87%                                              │
│     └─ readers: Quest "Flying Home" condition               │
│                                                             │
│ ▼ Flags                                                     │
│   quest.flying_home.tried_to_fly: true                      │
│     └─ set by: Quest "Flying Home" node "Try Flying"        │
│     └─ read by: Guard BT, Holly dialogue                    │
│                                                             │
│ ▼ World                                                     │
│   timeOfDay: day                                            │
│   region: town_square                                       │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ Recent Changes:                                             │
│   12:34:56 flags.quest.flying_home.tried_to_fly = true      │
│   12:34:52 player.resonance = 23 (was 20)                   │
│   12:34:45 quest.flying_home.stage = build_resonance        │
└─────────────────────────────────────────────────────────────┘
```

### Serialization (Save/Load)

World state is the primary save data:

```typescript
interface SaveData {
  version: number;
  timestamp: number;

  worldState: {
    // Quest state is handled by QuestManager serialization
    activeQuests: SerializedQuestState[];
    completedQuests: string[];

    // Inventory
    items: { itemId: string; count: number }[];

    // Player
    resonance: number;
    battery: number;
    position: Vec3;
    region: string;

    // Flags
    flags: { key: string; value: unknown }[];

    // Relationships
    npcAffinity: { npcId: string; value: number }[];
    factionStanding: { factionId: string; value: number }[];
    metNpcs: string[];

    // World
    timeOfDay: number;  // Total minutes elapsed
    weather: string;
  };
}
```

## Implementation Phases

### Phase 1: Core Infrastructure
1. Define WorldState interface and namespaces
2. Create WorldStateEvaluator
3. Implement condition types
4. Wire into existing managers (QuestManager, InventoryManager, etc.)

### Phase 2: Integration
1. Update ADR-016 condition nodes to use WorldStateEvaluator
2. Update ADR-017 behavior tree conditions to use WorldStateEvaluator
3. Add change notifications

### Phase 3: Flags System
1. Implement FlagsManager
2. Add flag actions to beats graph
3. Naming convention enforcement in editor

### Phase 4: Tooling
1. World State Inspector panel
2. "What reads/writes this" cross-references
3. State change logging

### Phase 5: Save/Load
1. Serialization format
2. Save game creation
3. Load game restoration
4. Version migration

## Consequences

### Positive

- Single source of truth for game state
- Type-safe conditions (no magic strings)
- Decoupled systems communicate cleanly
- Tooling can show data flow
- Easy to debug (inspect state, see history)
- Natural save/load boundary

### Negative

- More infrastructure to build
- All state access goes through WorldState (indirection)
- Need discipline to use namespaces properly

### Neutral

- Managers become providers of WorldState namespaces
- Condition evaluation is centralized
- Flag naming requires conventions

## Future Considerations

1. **State Snapshots**: Save state at key moments for debugging
2. **Time Travel**: Rewind state for testing/debugging
3. **State Diffing**: Compare two save files
4. **Multiplayer**: State synchronization
5. **Mod Support**: Mods can add custom namespaces
6. **Analytics**: Track state for player behavior analysis
7. **Achievements**: Trigger achievements based on state conditions
