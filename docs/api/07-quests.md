# Quest System & Beats Graph

The quest system manages multi-stage quests using a **beats graph** - a directed graph of typed nodes within each stage. Each node represents a discrete moment: something the player does (objective), something the system triggers (narrative), or something the system checks (condition).

**Source**: `src/engine/quests/`

## Overview: Nodes, Not Just Objectives

A quest is divided into **stages**, and each stage contains a **beats graph** of interconnected nodes. Nodes have prerequisites - they activate only when all their prerequisite nodes have completed.

There are three node types:

| Type | Icon (editor) | When Active | Completes When | Visible in HUD |
|------|---------------|-------------|----------------|----------------|
| **objective** | Subtype icon | Shows in HUD, waits for player | Player performs action | Yes |
| **narrative** | `N` badge | Auto-fires immediately | Playback/trigger finishes | No |
| **condition** | `?` badge | Evaluates continuously | Condition becomes true | No |

### Nodes vs Actions

Nodes have duration or wait for something. **Actions** are instant, fire-and-forget side effects attached to nodes:

| Thing | Node or Action | Why |
|-------|----------------|-----|
| Voiceover plays | Node (narrative) | Player listens, takes time |
| Dialogue plays | Node (narrative) | Player engages, takes time |
| Check if player has item | Node (condition) | Waits for state |
| Set a flag | Action | Instant bookkeeping |
| Give item to player | Action | Instant state change |
| Play sound effect | Action | Fire-and-forget |
| Teleport NPC instantly | Action | Instant state change |

**The test**: "Does flow need to pause until this finishes?" Yes = node, no = action.

## Actions: onEnter and onComplete

Every node can have two action lists that fire at lifecycle points:

- **`onEnter`**: Fires when the node **activates** (prerequisites met), before the node starts
- **`onComplete`**: Fires when the node **completes**, before flow continues to dependent nodes

```
Prerequisites met
       |
       v
   onEnter actions fire (instant)
       |
       v
   Node runs (may have duration)
       |
       v
   onComplete actions fire (instant)
       |
       v
   Flow continues to dependent nodes
```

### Action Types

| Action | target | value | Effect |
|--------|--------|-------|--------|
| `setFlag` | Flag name (string) | Flag value | Sets a game flag via `FlagsManager` |
| `giveItem` | Item ID (UUID) | Quantity (number) | Adds item to inventory |
| `removeItem` | Item ID (UUID) | Quantity (number) | Removes item from inventory |
| `playSound` | Sound asset path | - | Plays a sound |
| `spawnVFX` | VFX ID (UUID) | Position `{x,y,z}` | Spawns a particle effect |
| `teleportNPC` | NPC ID (UUID) | Position `{x,y,z}` | Instantly moves an NPC |
| `moveNpc` | NPC ID (UUID) | Position `{x,y,z}` | Animated NPC movement |
| `setNPCState` | NPC ID (UUID) | State data | Changes NPC state |
| `emitEvent` | Event name (string) | - | Fires a custom event |
| `custom` | Custom key | Custom data | Escape hatch |

`setFlag` actions write to `game.flags` (the [FlagsManager](./014-world-state.md#flagsmanager)), which automatically triggers condition re-evaluation via the world state notifier.

### When to use onEnter vs onComplete

| Use Case | When |
|----------|------|
| `onEnter` | Set up state before node runs. "When player starts talking to guard, play ambient music." |
| `onComplete` | React to completion. "When player finishes talking, set flag and play sound." |

Most actions go in `onComplete`. Use `onEnter` for setup that must happen before the node's main behavior.

## Objective Nodes

Objective nodes represent things the **player** does. They show in the HUD and wait for a matching trigger.

**Subtypes**: `'talk'` | `'voiceover'` | `'location'` | `'collect'` | `'trigger'` | `'custom'`

When an objective activates, it registers for matching via `triggerObjective()`. When the engine detects the player talking to an NPC, entering a trigger zone, or picking up an item, it calls `triggerObjective(type, targetId)` and any matching active objective completes.

Talk objectives can override the NPC's default dialogue by setting `dialogue` on the node. The `completeOn` field controls when the objective completes: `'dialogueEnd'` (default) or a specific dialogue node ID.

## Narrative Nodes

Narrative nodes are **system-triggered**. They fire immediately when activated and complete when their content finishes.

**Subtypes**:

| Subtype | What happens | Completes when |
|---------|-------------|----------------|
| `voiceover` | Starts a monologue dialogue | Dialogue ends |
| `dialogue` | Starts a dialogue tree | Dialogue ends |
| `event` | Fires a custom event | Immediately |
| `cutscene` | Plays a cutscene (future) | Cutscene ends |

If no handler is set, narrative nodes auto-complete so flow isn't blocked.

## Condition Nodes

Condition nodes are **gates** that wait until a condition is true. They check immediately when activated - if already satisfied, they complete instantly. Otherwise they register for continuous re-evaluation.

Conditions are evaluated through the [World State System](./014-world-state.md). The world state notifier automatically re-evaluates all pending conditions whenever flags, inventory, or quest state changes.

### ConditionExpression

```typescript
interface ConditionExpression {
  operator: 'hasItem' | 'hasFlag' | 'questComplete' | 'stageComplete' | 'custom';
  operand: string;        // Item ID, flag name, quest ID, "questId:stageId"
  value?: unknown;        // For flag value comparisons
  negate?: boolean;       // Invert the result
}
```

| Operator | Operand | What it checks |
|----------|---------|----------------|
| `hasItem` | Item ID | Player has this item in inventory |
| `hasFlag` | Flag name | Flag is set (truthy), or equals `value` if provided |
| `questComplete` | Quest ID | Quest has been completed |
| `stageComplete` | `"questId:stageId"` | Stage has been completed (moved past) |
| `custom` | Custom key | Not yet implemented |

## Key Patterns

**Item Gate** - Condition lets player collect at any time, passes immediately if already owned:
```
[Collect Key] --> [? Has Key] --> [Go to Door]
```

**Narrative Sandwich** - Voiceovers bookend a player action:
```
[N: "Here we go"] --> [Talk to NPC] --> [N: "That went well"]
```

**Parallel with Join** - Multiple requirements converge:
```
[Find Clue A] ---\
                  +--> [? All clues found] --> [Confront Suspect]
[Find Clue B] ---/
```

**Any-of Gate** - Either path grants access via flag:
```
[Talk to Guard] ---\
                    +--> [? Has permission] --> [Enter Castle]
[Bribe Guard]  ---/
```

**Actions on Completion** - Instant effects when a node completes:
```
[Talk to Merchant]
  onComplete:
    - giveItem: map
    - setFlag: "received_map"
    - playSound: "sfx/paper"
        |
        v
[Go to Forest]
```

## QuestManager

Main class for managing quests.

**Source**: `src/engine/quests/QuestManager.ts`

```typescript
const quests = new QuestManager();
```

## Quest Lifecycle

### startQuest()

Start a quest by ID. Loads the quest definition if not cached.

```typescript
await quests.startQuest(questId: string): Promise<boolean>
```

Returns `true` if quest started successfully, `false` if already active or failed to load.

### completeQuest()

Mark a quest as completed.

```typescript
quests.completeQuest(questId: string): void
```

### failQuest()

Mark a quest as failed.

```typescript
quests.failQuest(questId: string): void
```

### abandonQuest()

Remove a quest from active quests without completing or failing.

```typescript
quests.abandonQuest(questId: string): void
```

## Objective Progression

### triggerObjective()

Automatically progress objectives that match a type and target. Only matches active objective-type nodes.

```typescript
quests.triggerObjective(type: ObjectiveType, targetId: string): void
```

**ObjectiveType**: `'talk'` | `'voiceover'` | `'location'` | `'collect'` | `'trigger'` | `'custom'`

### incrementObjective()

Manually increment a countable objective.

```typescript
quests.incrementObjective(questId: string, objectiveId: string, amount?: number): void
```

### completeObjective()

Manually mark a node as complete. Works for all node types. Fires `onComplete` actions, cascades to dependents, and checks for stage completion.

```typescript
quests.completeObjective(questId: string, objectiveId: string): void
```

### evaluateConditions()

Re-evaluate all pending condition nodes across all active quests. Called automatically by the world state notifier when state changes - you don't normally need to call this directly.

```typescript
quests.evaluateConditions(): void
```

## Quest Queries

### getActiveQuests()

```typescript
quests.getActiveQuests(): QuestState[]
```

### getQuestState()

```typescript
quests.getQuestState(questId: string): QuestState | null
```

### getQuestDefinition()

```typescript
quests.getQuestDefinition(questId: string): LoadedQuest | null
```

### isQuestActive()

```typescript
quests.isQuestActive(questId: string): boolean
```

### isQuestCompleted()

```typescript
quests.isQuestCompleted(questId: string): boolean
```

### getStageState()

Check stage-level state. Returns `'active'` if the stage is current, `'completed'` if the quest has moved past it, `null` if not found.

```typescript
quests.getStageState(questId: string, stageId: string): 'active' | 'completed' | null
```

### getObjectiveState()

Check individual beat node state within the current stage. Returns `'active'` if prerequisites met and not completed, `'completed'` if done, `null` if not found or prerequisites not met.

```typescript
quests.getObjectiveState(questId: string, objectiveId: string): 'active' | 'completed' | null
```

Used by behavior tree conditions to check specific beat node progress. See [NPC System - Checking Beat Node State](./013-npc.md#checking-beat-node-state).

## Quest Tracking

The player can track one quest at a time for HUD display.

### getTrackedQuestId()

```typescript
quests.getTrackedQuestId(): string | null
```

### setTrackedQuest()

```typescript
quests.setTrackedQuest(questId: string | null): void
```

### getTrackedQuestName()

```typescript
quests.getTrackedQuestName(): string | null
```

### getTrackedObjective()

Get the current HUD-visible objective of the tracked quest. Only returns active, incomplete, objective-type nodes with `showInHUD !== false`.

```typescript
quests.getTrackedObjective(): QuestObjective | null
```

### getQuestDialogueForNpc()

Find an active talk objective targeting a specific NPC that has a dialogue override. Used by the [interaction priority chain](./013-npc.md#interaction-priority-chain).

```typescript
quests.getQuestDialogueForNpc(npcId: string): {
  questId: string;
  objectiveId: string;
  dialogue: string;
  completeOn: 'dialogueEnd' | string;
} | null
```

## Event Handlers

### Quest Events

```typescript
quests.setOnQuestStart(handler: (event: QuestEvent) => void): void
quests.setOnQuestComplete(handler: (event: QuestEvent) => void): void
quests.setOnQuestFail(handler: (event: QuestEvent) => void): void
quests.setOnStageComplete(handler: (event: QuestEvent) => void): void
quests.setOnObjectiveProgress(handler: (event: QuestEvent) => void): void
quests.setOnObjectiveComplete(handler: (event: QuestEvent) => void): void
```

### Beat System Handlers

```typescript
// Called when an objective with autoStart becomes available (legacy)
quests.setOnObjectiveTrigger(handler: (questId: string, objective: QuestObjective) => void): void

// Called for each beat action (setFlag, giveItem, etc.)
// Game.ts implements this to execute the side effects
quests.setOnBeatAction(handler: (action: BeatAction) => void): void

// Called when a narrative node activates
// Handler must call completeObjective() when content finishes
quests.setOnNarrativeTrigger(handler: (questId: string, objective: QuestObjective) => void): void

// Called to evaluate a condition against game state
// Game.ts wires this to the WorldStateEvaluator via adapters
quests.setConditionChecker(handler: (condition: ConditionExpression) => boolean): void

// Called when quest/stage state changes (for world state notifications)
quests.setOnStateChange(handler: () => void): void
```

### QuestEvent

```typescript
interface QuestEvent {
  type: QuestEventType;
  questId: string;
  questName: string;
  stageId?: string;
  objectiveId?: string;
  objective?: QuestObjective;
}
```

## Save/Load Support

```typescript
quests.getCompletedQuestIds(): string[]
quests.clearAllQuests(): void
quests.markQuestCompleted(questId: string): void
await quests.restoreQuestState(savedState: SerializedQuestState): Promise<void>
```

## Data Format

### QuestDefinition

```typescript
interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  startStage: string;
  stages: QuestStage[];
  rewards?: QuestReward[];
  repeatable?: boolean;
  episodeId?: string;
}
```

### QuestStage

```typescript
interface QuestStage {
  id: string;
  description: string;
  objectives: QuestObjective[];   // All beat nodes in the stage
  onComplete?: string;            // Event to fire when stage completes
  next?: string;                  // Next stage ID (undefined = quest complete)
  startObjectives?: string[];     // Explicit entry points (default: nodes with no prerequisites)
  objectivePositions?: Record<string, { x: number; y: number }>;  // Editor-only: node positions
}
```

### QuestObjective (Beat Node)

```typescript
interface QuestObjective {
  id: string;
  type: ObjectiveType;
  description: string;
  target?: string;                // NPC ID, trigger ID, item ID
  count?: number;                 // For countable objectives
  current?: number;
  completed: boolean;
  optional?: boolean;             // Optional nodes don't block stage completion

  // Graph structure
  prerequisites?: string[];       // Node IDs that must complete first

  // Node type (default: 'objective')
  nodeType?: 'objective' | 'narrative' | 'condition';

  // Actions (instant side effects)
  onEnter?: BeatAction[];
  onComplete?: BeatAction[];

  // Objective-specific
  dialogue?: string;              // For talk objectives: dialogue override
  completeOn?: 'dialogueEnd' | string;  // When to complete
  autoStart?: boolean;            // Auto-fire when available (legacy)
  showInHUD?: boolean;            // Default true for objectives

  // Narrative-specific
  narrativeType?: 'voiceover' | 'dialogue' | 'cutscene' | 'event';
  voiceoverText?: string;
  dialogueId?: string;
  eventName?: string;

  // Condition-specific
  condition?: ConditionExpression;
}
```

### BeatAction

```typescript
interface BeatAction {
  type: 'setFlag' | 'giveItem' | 'removeItem' | 'playSound' | 'spawnVFX'
      | 'teleportNPC' | 'setNPCState' | 'emitEvent' | 'moveNpc' | 'custom';
  target?: string;
  value?: unknown;

  // Legacy fields for moveNpc (ADR-015 compat)
  npcId?: string;
  position?: { x: number; y: number; z: number };
}
```

### QuestReward

```typescript
interface QuestReward {
  type: 'xp' | 'item' | 'currency' | 'custom';
  id?: string;
  amount?: number;
  data?: Record<string, unknown>;
}
```

## Example: Quest with Beats Graph

```json
{
  "id": "escape-manor",
  "name": "Escape the Manor",
  "description": "Find a way out of the old manor.",
  "startStage": "find-key",
  "stages": [
    {
      "id": "find-key",
      "description": "Search the manor for a way out",
      "startObjectives": ["voiceover-start", "collect-key"],
      "objectives": [
        {
          "id": "voiceover-start",
          "type": "custom",
          "description": "",
          "nodeType": "narrative",
          "narrativeType": "voiceover",
          "dialogueId": "manor-intro-voiceover",
          "completed": false
        },
        {
          "id": "collect-key",
          "type": "collect",
          "description": "Find the manor key",
          "target": "manor-key",
          "completed": false
        },
        {
          "id": "has-key-gate",
          "type": "custom",
          "description": "",
          "nodeType": "condition",
          "condition": { "operator": "hasItem", "operand": "manor-key" },
          "prerequisites": ["collect-key"],
          "completed": false
        },
        {
          "id": "go-to-door",
          "type": "location",
          "description": "Go to the front door",
          "target": "manor-exit-trigger",
          "prerequisites": ["voiceover-start", "has-key-gate"],
          "onComplete": [
            { "type": "setFlag", "target": "manor_escaped", "value": true },
            { "type": "playSound", "target": "sfx/door-unlock" }
          ],
          "completed": false
        }
      ],
      "objectivePositions": {
        "voiceover-start": { "x": 50, "y": 50 },
        "collect-key": { "x": 50, "y": 200 },
        "has-key-gate": { "x": 250, "y": 200 },
        "go-to-door": { "x": 450, "y": 125 }
      }
    }
  ]
}
```

This stage has two parallel entry points: a voiceover plays while the player searches for the key. The condition gate waits until the key is in inventory. The final objective requires both the voiceover and the gate to complete. On completion, a flag is set and a sound plays.

## Integration with Other Systems

The quest system connects to other systems through `Game.ts`:

- **Inventory** changes trigger condition re-evaluation via the [World State System](./014-world-state.md)
- **Flag** changes (from `setFlag` actions) trigger re-evaluation automatically
- **Behavior trees** can check quest/stage/node state via `getStageState()` and `getObjectiveState()`. See [NPC System](./013-npc.md)
- **Dialogue** events can trigger quest objectives via the `"quest:<type>:<target>"` event format
