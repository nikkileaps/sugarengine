# Save System

The save system provides persistent game state with support for multiple save slots and auto-save functionality.

**Source**: `src/save/`

## SaveManager

Main class for save/load operations.

**Source**: `src/save/SaveManager.ts`

### Constructor

```typescript
interface SaveManagerConfig {
  autoSaveEnabled: boolean;    // Default: true
  autoSaveSlotId: string;      // Default: 'autosave'
  autoSaveDebounceMs: number;  // Default: 5000
}

const saveManager = new SaveManager(config?: Partial<SaveManagerConfig>);
```

### Initialization

#### init()

Initialize the save manager and detect storage backend.

```typescript
await saveManager.init(): Promise<SaveResult>
```

Automatically selects:
- **TauriFileProvider**: When running as native app (filesystem)
- **LocalStorageProvider**: When running in browser (~5-10MB limit)

#### setGameSystems()

Connect the save manager to game systems for state capture/restoration.

```typescript
saveManager.setGameSystems(
  engine: SugarEngine,
  questManager: QuestManager,
  inventoryManager: InventoryManager
): void
```

Must be called after initialization.

#### setProvider()

Manually override the storage provider.

```typescript
saveManager.setProvider(provider: StorageProvider): void
```

## Save Operations

### save()

Save current game state to a slot.

```typescript
await saveManager.save(slotId: string): Promise<SaveResult>
```

### load()

Load game state from a slot.

```typescript
await saveManager.load(slotId: string): Promise<SaveResult>
```

### delete()

Delete a save slot.

```typescript
await saveManager.delete(slotId: string): Promise<SaveResult>
```

### SaveResult

```typescript
interface SaveResult {
  success: boolean;
  error?: string;
}
```

## Auto-Save

### autoSave()

Trigger an auto-save with a specific trigger type.

```typescript
await saveManager.autoSave(trigger: AutoSaveTrigger): Promise<void>
```

### AutoSaveTrigger

| Value | Description |
|-------|-------------|
| `'region-transition'` | Player changed regions |
| `'quest-complete'` | Player completed a quest |
| `'quest-start'` | Player started a quest |
| `'item-pickup'` | Player collected an item |
| `'manual'` | Manually triggered |

### Configuration

```typescript
saveManager.setAutoSaveEnabled(enabled: boolean): void
saveManager.isAutoSaveEnabled(): boolean
```

Auto-save is debounced (default 5 seconds) to prevent excessive saving.

## Slot Management

### exists()

Check if a save slot exists.

```typescript
await saveManager.exists(slotId: string): Promise<boolean>
```

### listSlots()

Get metadata for all save slots.

```typescript
await saveManager.listSlots(): Promise<SaveSlotMetadata[]>
```

### hasSaves()

Check if any saves exist.

```typescript
await saveManager.hasSaves(): Promise<boolean>
```

### getMostRecentSlot()

Get the ID of the most recently saved slot.

```typescript
await saveManager.getMostRecentSlot(): Promise<string | null>
```

### getSlotMetadata()

Get metadata for a specific slot.

```typescript
await saveManager.getSlotMetadata(slotId: string): Promise<SaveSlotMetadata | null>
```

### SaveSlotMetadata

```typescript
interface SaveSlotMetadata {
  slotId: string;
  savedAt: number;      // Unix timestamp
  playTime: number;     // Seconds played
  regionName: string;   // Current region display name
  questCount: number;   // Active quest count
}
```

## Pickup Tracking

Track which world pickups have been collected (to prevent respawn).

### markPickupCollected()

```typescript
saveManager.markPickupCollected(regionPath: string, pickupId: string): void
```

### isPickupCollected()

```typescript
saveManager.isPickupCollected(regionPath: string, pickupId: string): boolean
```

### getCollectedPickups()

Get all collected pickups for a region.

```typescript
saveManager.getCollectedPickups(regionPath: string): string[]
```

### clearCollectedPickups()

Clear all collected pickup data (for new game).

```typescript
saveManager.clearCollectedPickups(): void
```

## Play Time

### getPlayTimeFormatted()

Get formatted play time string (e.g., "2:30:15").

```typescript
saveManager.getPlayTimeFormatted(): string
```

## Event Handlers

### setOnAutoSave()

Called when auto-save triggers.

```typescript
saveManager.setOnAutoSave(handler: (trigger: AutoSaveTrigger, slotId: string) => void): void
```

### setOnSaveComplete()

Called when any save completes.

```typescript
saveManager.setOnSaveComplete(handler: (slotId: string, success: boolean) => void): void
```

### setOnLoadComplete()

Called when any load completes.

```typescript
saveManager.setOnLoadComplete(handler: (slotId: string, success: boolean) => void): void
```

## Save Data Format

The internal save data structure:

```typescript
interface GameSaveData {
  version: number;          // Save format version
  savedAt: number;          // Unix timestamp
  playTime: number;         // Seconds played

  player: {
    position: { x: number; y: number; z: number };
    currentRegion: string;
  };

  quests: {
    active: SerializedQuestState[];
    completed: string[];
    trackedQuestId: string | null;
  };

  inventory: SerializedInventoryItem[];

  world: {
    collectedPickups: { [regionPath: string]: string[] };
  };
}
```

## Storage Providers

### StorageProvider Interface

```typescript
interface StorageProvider {
  getCapabilities(): StorageCapabilities;
  init(): Promise<SaveResult>;
  save(slotId: string, data: GameSaveData): Promise<SaveResult>;
  load(slotId: string): Promise<GameSaveData | null>;
  delete(slotId: string): Promise<SaveResult>;
  exists(slotId: string): Promise<boolean>;
  listSlots(): Promise<SaveSlotMetadata[]>;
  getSlotMetadata(slotId: string): Promise<SaveSlotMetadata | null>;
}
```

### StorageCapabilities

```typescript
interface StorageCapabilities {
  maxSlots: number;           // Max save slots (-1 = unlimited)
  maxSizeBytes: number;       // Max save size (-1 = unlimited)
  supportsMetadata: boolean;  // Can store slot metadata
}
```

### LocalStorageProvider

Browser-based storage using `localStorage`.

- **Limit**: ~5-10MB total (browser-dependent)
- **Persistence**: Until browser data cleared
- **Use case**: Web builds

### TauriFileProvider

Filesystem storage for native apps.

- **Limit**: Unlimited (disk space)
- **Location**: App data directory
- **Persistence**: Until manually deleted
- **Use case**: Desktop builds via Tauri

## Integration Example

```typescript
const saveManager = new SaveManager({
  autoSaveEnabled: true,
  autoSaveSlotId: 'autosave',
  autoSaveDebounceMs: 5000
});

await saveManager.init();
saveManager.setGameSystems(engine, quests, inventory);

// Auto-save on quest events
quests.setOnQuestComplete(() => {
  saveManager.autoSave('quest-complete');
});

quests.setOnQuestStart(() => {
  saveManager.autoSave('quest-start');
});

// Auto-save on region change
engine.onTriggerEnter(async (event) => {
  if (event.type === 'transition') {
    await engine.loadRegion(event.target);
    saveManager.autoSave('region-transition');
  }
});

// Track collected pickups
engine.onItemPickup((pickupId, itemId, quantity) => {
  inventory.addItem(itemId, quantity);
  saveManager.markPickupCollected(engine.getCurrentRegion(), pickupId);
  saveManager.autoSave('item-pickup');
});

// Manual save
await saveManager.save('slot-1');

// Load game
const result = await saveManager.load('slot-1');
if (result.success) {
  engine.run();
}

// New game
inventory.clear();
quests.clearAllQuests();
saveManager.clearCollectedPickups();
await engine.loadRegion('/regions/starting-area/');
```

## New Game vs Continue

### New Game

```typescript
async function newGame() {
  inventory.clear();
  quests.clearAllQuests();
  saveManager.clearCollectedPickups();

  await engine.loadRegion('/regions/starting-area/');

  // Give starting items
  inventory.addItem('village-map');

  // Start intro quest
  await quests.startQuest('intro-quest');

  engine.run();
}
```

### Continue

```typescript
async function continueGame() {
  const mostRecent = await saveManager.getMostRecentSlot();
  if (mostRecent) {
    const result = await saveManager.load(mostRecent);
    if (result.success) {
      engine.run();
    }
  }
}
```
