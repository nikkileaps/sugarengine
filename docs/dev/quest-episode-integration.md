# Quest-Episode Integration

This document explains how quests connect to episodes and how the auto-start mechanism works at runtime.

## Overview

Episodes are the primary unit of content delivery. Each episode can have a **main quest** that:
1. Auto-starts when the episode begins
2. Defines when the episode is complete
3. Controls NPC dialogue routing based on quest objectives

## Setting Up in the Editor

### 1. Create Your Dialogue

In the Dialogues tab, create the dialogue exchange you want to trigger. Give it a descriptive name (e.g., "Ethan Introduction").

### 2. Create the Quest

In the Quests tab:

1. Create a new quest (e.g., "Meet Ethan")
   - **Important**: The quest is automatically associated with the current episode via `episodeId`
   - All quests with the episode's ID will auto-start when the episode begins
2. Add a stage with a "Talk to NPC" objective
3. Configure the objective:
   - **Type**: Talk to NPC
   - **NPC**: Select the target NPC (e.g., Ethan)
   - **Dialogue**: Select the dialogue to trigger (e.g., "Ethan Introduction")
   - **Complete When**: "Dialogue ends" (or a specific node ID)

The `dialogue` field is critical - it tells the runtime which dialogue to use instead of the NPC's default.

### 3. Link Quest to Episode

1. Click the gear icon next to the episode name in the header
2. In Episode Details, set **Main Quest** to your quest
3. This stores `completionCondition: { type: 'quest', questId: '...' }` on the episode

### 4. Configure Start Region

Also in Episode Details, set the **Start Region** where the player spawns.

## Runtime Flow

```
Game.init()
    └─> EpisodeManager.initialize()
    └─> registerProjectContent() [dev mode]

sceneManager.onNewGame()
    ├─> Clear state (inventory, quests, pickups)
    ├─> Load start region
    ├─> getEpisodeQuests()
    │       └─> Filter quests where quest.episodeId === currentEpisode
    │       └─> Return array of quest IDs
    └─> For each quest ID:
            └─> quests.startQuest(questId)
            └─> Quest becomes active
            └─> First stage objectives initialized

Player approaches NPC, presses E
    └─> engine.onInteract(npcId, npcDefaultDialogue)
            └─> quests.getQuestDialogueForNpc(npcId)
                    └─> Search active quests for:
                        - type === 'talk'
                        - target === npcId
                        - has dialogue property
                    └─> Return { questId, objectiveId, dialogue, completeOn }
            └─> If found: dialogue.start(questDialogue)
            └─> If not found: dialogue.start(npcDefaultDialogue)

Dialogue ends
    └─> If completeOn === 'dialogueEnd'
            └─> quests.completeObjective(questId, objectiveId)
                    └─> Check if stage complete
                    └─> Advance to next stage or complete quest
```

## Key Code Locations

| Component | File | Purpose |
|-----------|------|---------|
| Episode types | `src/engine/episodes/types.ts` | `Episode.completionCondition` definition |
| Episode loading | `src/engine/episodes/EpisodeManager.ts` | `getEpisode()`, manifest building |
| Quest auto-start | `src/engine/core/Game.ts` | `getEpisodeMainQuest()`, `onNewGame` handler |
| Dialogue routing | `src/engine/quests/QuestManager.ts` | `getQuestDialogueForNpc()` |
| NPC interaction | `src/engine/core/Game.ts:334` | `onInteract` handler that checks quest dialogue |
| Editor episode UI | `src/editor/components/EpisodeDetailsDialog.tsx` | Main Quest selector |
| Editor objective UI | `src/editor/panels/quest/ObjectiveModal.tsx` | Dialogue picker for talk objectives |

## Quest Objective Structure

For the dialogue routing to work, the quest objective needs:

```typescript
{
  id: string;
  type: 'talk';           // Must be 'talk' for NPC dialogue
  target: string;         // NPC ID (e.g., 'ethan')
  description: string;    // Shown in quest journal
  dialogue?: string;      // Dialogue ID to trigger (required for quest dialogue)
  completeOn?: 'dialogueEnd' | string;  // When to mark complete
}
```

If `dialogue` is not set, the objective will still trigger on NPC interaction, but it will use the NPC's default dialogue (or nothing if no default).

## Development vs Production

The same code path works for both modes:

**Development Mode (Preview):**
- `projectData` passed to Game contains episodes with `completionCondition`
- EpisodeManager builds manifest from in-memory project data
- `getEpisodeMainQuest()` reads `completionCondition.questId`

**Production Mode:**
- EpisodeManager fetches manifest from server
- Episode data includes `completionCondition`
- Same `getEpisodeMainQuest()` logic applies

## Completion Condition Types

Currently supported:

```typescript
type CompletionCondition =
  | { type: 'quest'; questId: string }           // Single quest (main quest)
  | { type: 'allQuests'; questIds: string[] }    // All listed quests
  | { type: 'anyQuest'; questIds: string[] }     // Any listed quest
  | { type: 'questCount'; questIds: string[]; count: number };  // N of M quests
```

The editor UI currently only supports `type: 'quest'` (single main quest). Other types are used for more complex episode progression requirements.

## Troubleshooting

**Quest doesn't auto-start:**
- Check Episode Details has Main Quest set
- Verify `completionCondition` is saved (check project file JSON)
- Check console for `[Game] Registered project content` log

**Dialogue doesn't trigger when talking to NPC:**
- Verify the quest objective has `dialogue` set (not empty)
- Verify `target` matches the NPC's ID exactly
- Check quest is active: `quests.getActiveQuests()` in console

**Objective doesn't complete:**
- Check `completeOn` setting
- If set to a node ID, verify that node exists and is reached
- Check console for `[Dialogue Event]` logs
