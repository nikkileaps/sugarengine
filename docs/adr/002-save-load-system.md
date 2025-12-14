# ADR 002: Save/Load Game State System

## Status

Accepted

## Context

Sugarengine needs to persist game state so players can save progress and resume later. The game tracks:
- Quest progress (active quests, completed quests, objective progress)
- Inventory items
- Player position and current region
- Collected world pickups

The system needs to work in multiple environments:
- **Browser** (development, web builds) - localStorage
- **Native app** (Tauri) - filesystem
- **Future** - cloud storage via REST API

## Decision

Implement a save/load system with a **storage provider abstraction** that allows swapping backends without changing game logic.

### Storage Provider Interface

```typescript
interface StorageProvider {
  init(): Promise<SaveResult>;
  save(slotId: string, data: GameSaveData): Promise<SaveResult>;
  load(slotId: string): Promise<GameSaveData | null>;
  delete(slotId: string): Promise<SaveResult>;
  exists(slotId: string): Promise<boolean>;
  listSlots(): Promise<SaveSlotMetadata[]>;
}
```

### Implementations

1. **LocalStorageProvider** - Uses browser localStorage. Simple, synchronous under the hood but exposed as async for interface consistency. ~5-10MB limit.

2. **TauriFileProvider** - Uses Tauri's plugin-fs to read/write JSON files to the app data directory. Works in native builds only.

3. **CloudStorageProvider** (future) - Stub implementation ready for REST API integration when needed.

### SaveManager

A coordinator class that:
- Auto-detects the best available provider (Tauri if available, else localStorage)
- Gathers state from QuestManager, InventoryManager, and Engine
- Handles JSON serialization with version numbers for future migration
- Manages multiple save slots plus a dedicated autosave slot
- Tracks collected pickups per region (so they don't respawn)

### Auto-Save Triggers

Auto-save fires on:
- Region transitions
- Quest completion
- Quest start
- Item pickup (debounced)

Debounce prevents spam-saving (minimum 5-10 seconds between saves).

### Save Data Format

```json
{
  "version": 1,
  "savedAt": 1702500000000,
  "playTime": 3600000,
  "player": {
    "position": { "x": 5.2, "y": 0.75, "z": -3.1 },
    "currentRegion": "/regions/forest/"
  },
  "quests": {
    "active": [...],
    "completed": ["tutorial-quest"],
    "trackedQuestId": "intro-quest"
  },
  "inventory": [
    { "itemId": "fresh-bread", "quantity": 2 }
  ],
  "world": {
    "collectedPickups": {
      "/regions/test/": ["pickup-coin-1"]
    }
  }
}
```

## Consequences

### Positive

- **Extensible** - Adding cloud storage only requires implementing StorageProvider interface
- **Platform-agnostic** - Same SaveManager API works in browser and native
- **Multiple slots** - Players can have multiple save files
- **Auto-save** - Progress is preserved automatically
- **Versioned** - Save format includes version for future migrations
- **Minimal coupling** - Managers expose getState/loadState, SaveManager orchestrates

### Negative

- **No encryption** - Save files are plain JSON (fine for single-player narrative game)
- **No compression** - Could add gzip if saves grow large
- **Tauri dependency** - TauriFileProvider requires Tauri plugin-fs setup

### What Gets Saved vs Not Saved

**Saved:**
- Quest progress and completion status
- Inventory contents
- Player position and region
- Which pickups have been collected
- Total play time

**Not Saved (regenerated on load):**
- ECS entity IDs
- Loaded quest/item definitions
- 3D meshes and geometry
- NPC patrol state (resets to start of patrol)

## Files Changed

**New:**
- `src/save/types.ts`
- `src/save/StorageProvider.ts`
- `src/save/LocalStorageProvider.ts`
- `src/save/TauriFileProvider.ts`
- `src/save/SaveManager.ts`
- `src/save/index.ts`

**Modified:**
- `src/quests/QuestManager.ts` - Add state serialization methods
- `src/inventory/InventoryManager.ts` - Add clear() method
- `src/core/Engine.ts` - Add getPlayerPosition(), getCurrentRegion()
- `src/main.ts` - Wire up SaveManager with auto-save triggers
