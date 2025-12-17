# Quest System

The quest system manages multi-stage quests with various objective types.

**Source**: `src/quests/`

## QuestManager

Main class for managing quests.

**Source**: `src/quests/QuestManager.ts`

### Constructor

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

Quest files are loaded from `/public/quests/{questId}.json`.

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

Automatically progress objectives that match a type and target.

```typescript
quests.triggerObjective(type: ObjectiveType, targetId: string): void
```

**ObjectiveType**: `'talk'` | `'location'` | `'collect'` | `'trigger'` | `'custom'`

**Example**:
```typescript
// When player talks to an NPC
engine.onInteract((npcId) => {
  quests.triggerObjective('talk', npcId);
});

// When player enters a trigger zone
engine.onTriggerEnter((event, triggerId) => {
  quests.triggerObjective('location', triggerId);
});

// When player collects an item
inventory.setOnItemAdded((event) => {
  quests.triggerObjective('collect', event.itemId);
});
```

### incrementObjective()

Manually increment a countable objective.

```typescript
quests.incrementObjective(questId: string, objectiveId: string, amount?: number): void
```

**Example**:
```typescript
// Increment "collect 10 apples" objective
quests.incrementObjective('harvest-quest', 'collect-apples', 1);
```

### completeObjective()

Manually mark an objective as complete.

```typescript
quests.completeObjective(questId: string, objectiveId: string): void
```

## Quest Queries

### getActiveQuests()

Get all currently active quests.

```typescript
quests.getActiveQuests(): QuestState[]
```

### getQuestState()

Get the state of a specific quest.

```typescript
quests.getQuestState(questId: string): QuestState | null
```

### getQuestDefinition()

Get the loaded definition of a quest.

```typescript
quests.getQuestDefinition(questId: string): LoadedQuest | null
```

### isQuestActive()

Check if a quest is currently active.

```typescript
quests.isQuestActive(questId: string): boolean
```

### isQuestCompleted()

Check if a quest has been completed.

```typescript
quests.isQuestCompleted(questId: string): boolean
```

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

Get the current objective of the tracked quest.

```typescript
quests.getTrackedObjective(): QuestObjective | null
```

## Event Handlers

### setOnQuestStart()

```typescript
quests.setOnQuestStart(handler: (event: QuestEvent) => void): void
```

### setOnQuestComplete()

```typescript
quests.setOnQuestComplete(handler: (event: QuestEvent) => void): void
```

### setOnQuestFail()

```typescript
quests.setOnQuestFail(handler: (event: QuestEvent) => void): void
```

### setOnStageComplete()

Called when a quest advances to the next stage.

```typescript
quests.setOnStageComplete(handler: (event: QuestEvent) => void): void
```

### setOnObjectiveProgress()

Called when an objective is incremented.

```typescript
quests.setOnObjectiveProgress(handler: (event: QuestEvent) => void): void
```

### setOnObjectiveComplete()

Called when an objective is completed.

```typescript
quests.setOnObjectiveComplete(handler: (event: QuestEvent) => void): void
```

### QuestEvent

```typescript
interface QuestEvent {
  questId: string;
  questName: string;
  stageId?: string;
  objectiveId?: string;
}
```

## Save/Load Support

### getCompletedQuestIds()

Get IDs of all completed quests.

```typescript
quests.getCompletedQuestIds(): string[]
```

### clearAllQuests()

Clear all active quests (for new game).

```typescript
quests.clearAllQuests(): void
```

### markQuestCompleted()

Mark a quest as completed without running it (for loading saves).

```typescript
quests.markQuestCompleted(questId: string): void
```

### restoreQuestState()

Restore quest state from a save file.

```typescript
await quests.restoreQuestState(savedState: SerializedQuestState): Promise<void>
```

## Quest Data Format

Quest files are JSON located in `/public/quests/`.

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
}
```

### QuestStage

```typescript
interface QuestStage {
  id: string;
  description: string;
  objectives: QuestObjective[];
  onComplete?: string;    // Event to fire when stage completes
  next?: string;          // Next stage ID (undefined = quest complete)
}
```

### QuestObjective

```typescript
interface QuestObjective {
  id: string;
  type: 'talk' | 'location' | 'collect' | 'trigger' | 'custom';
  description: string;
  target?: string;        // ID to match in triggerObjective
  count?: number;         // For countable objectives
  current?: number;       // Current progress
  completed: boolean;
  optional?: boolean;     // Optional objectives don't block progression
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

## Example Quest File

`/public/quests/intro-quest.json`:

```json
{
  "id": "intro-quest",
  "name": "Welcome to the Village",
  "description": "Meet the villagers and learn your way around.",
  "startStage": "meet-elder",
  "stages": [
    {
      "id": "meet-elder",
      "description": "Speak with the village elder",
      "objectives": [
        {
          "id": "talk-elder",
          "type": "talk",
          "description": "Talk to the Elder",
          "target": "elder-npc",
          "completed": false
        }
      ],
      "next": "explore-village"
    },
    {
      "id": "explore-village",
      "description": "Explore the village",
      "objectives": [
        {
          "id": "visit-shop",
          "type": "location",
          "description": "Visit the shop",
          "target": "shop-trigger",
          "completed": false
        },
        {
          "id": "visit-inn",
          "type": "location",
          "description": "Visit the inn",
          "target": "inn-trigger",
          "completed": false
        }
      ],
      "next": "collect-supplies"
    },
    {
      "id": "collect-supplies",
      "description": "Gather supplies",
      "objectives": [
        {
          "id": "collect-bread",
          "type": "collect",
          "description": "Collect bread (0/3)",
          "target": "bread",
          "count": 3,
          "current": 0,
          "completed": false
        }
      ],
      "onComplete": "supplies-gathered"
    }
  ],
  "rewards": [
    { "type": "item", "id": "village-map", "amount": 1 }
  ]
}
```

## Integration Example

```typescript
const quests = new QuestManager();

// Show notifications on quest events
quests.setOnQuestStart((event) => {
  showNotification(`Quest Started: ${event.questName}`);
});

quests.setOnQuestComplete((event) => {
  showNotification(`Quest Complete: ${event.questName}`);
  saveManager.autoSave('quest-complete');
});

quests.setOnObjectiveComplete((event) => {
  showNotification('Objective Complete!');
});

// Connect to engine events
engine.onInteract((npcId) => {
  quests.triggerObjective('talk', npcId);
});

engine.onTriggerEnter((event, triggerId) => {
  quests.triggerObjective('location', triggerId);
  quests.triggerObjective('trigger', triggerId);
});

// Connect to inventory
inventory.setOnItemAdded((event) => {
  quests.triggerObjective('collect', event.itemId);
});
```
