# Engine API

The `SugarEngine` class is the core of the game engine, managing rendering, input, the ECS world, and region loading.

**Source**: `src/core/Engine.ts`

## Constructor

```typescript
interface EngineConfig {
  container: HTMLElement;
  camera: {
    style: 'isometric';
    zoom: {
      min: number;
      max: number;
      default: number;
    };
  };
}

const engine = new SugarEngine(config);
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `HTMLElement` | DOM element to render into |
| `camera.style` | `'isometric'` | Camera style (only isometric supported) |
| `camera.zoom.min` | `number` | Minimum zoom level |
| `camera.zoom.max` | `number` | Maximum zoom level |
| `camera.zoom.default` | `number` | Initial zoom level |

## Properties

```typescript
readonly world: World           // ECS world instance
readonly models: ModelLoader    // GLTF/GLB model loader
readonly regions: RegionLoader  // Region/map loader
```

## Region Loading

### loadRegion()

Loads a region from disk, creating entities for NPCs, triggers, and pickups.

```typescript
async loadRegion(
  regionPath: string,
  spawnOverride?: { x: number; y: number; z: number },
  collectedPickups?: string[]
): Promise<void>
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `regionPath` | `string` | Path to region (e.g., `/regions/village/`) |
| `spawnOverride` | `object` | Optional spawn position override |
| `collectedPickups` | `string[]` | IDs of pickups already collected (won't spawn) |

**Example**:
```typescript
// Load region with default spawn
await engine.loadRegion('/regions/village/');

// Load with custom spawn point
await engine.loadRegion('/regions/dungeon/', { x: 10, y: 0, z: 5 });

// Load excluding already-collected pickups
await engine.loadRegion('/regions/forest/', undefined, ['coin-1', 'coin-2']);
```

### getCurrentRegion()

Returns the path of the currently loaded region.

```typescript
getCurrentRegion(): string
```

## Player Management

### getPlayerPosition()

Returns the player's current world position.

```typescript
getPlayerPosition(): { x: number; y: number; z: number }
```

### setMovementEnabled()

Enable or disable player movement (useful during cutscenes/dialogue).

```typescript
setMovementEnabled(enabled: boolean): void
```

**Example**:
```typescript
// Disable movement during cutscene
engine.setMovementEnabled(false);
await dialogue.start('cutscene-01');
engine.setMovementEnabled(true);
```

## Input Checking

Methods to check current input state:

```typescript
isJournalPressed(): boolean      // J key
isEscapePressed(): boolean       // Escape key
isInventoryPressed(): boolean    // I key
isInteractPressed(): boolean     // E key
isGiftPressed(): boolean         // G key
consumeInteract(): void          // Clear interact state
```

Use `consumeInteract()` after handling an interaction to prevent double-triggers.

## Event Handlers

### onTriggerEnter() / onTriggerExit()

Called when player enters or exits a trigger zone.

```typescript
onTriggerEnter(handler: (event: TriggerEvent, triggerId: string) => void): void
onTriggerExit(handler: (event: TriggerEvent, triggerId: string) => void): void
```

**Example**:
```typescript
engine.onTriggerEnter((event, triggerId) => {
  if (event.type === 'transition') {
    engine.loadRegion(event.target);
  } else if (event.type === 'quest') {
    quests.triggerObjective('location', triggerId);
  }
});
```

### onInteract()

Called when player presses interact near an NPC.

```typescript
onInteract(handler: (npcId: string, dialogueId?: string) => void): void
```

**Example**:
```typescript
engine.onInteract((npcId, dialogueId) => {
  quests.triggerObjective('talk', npcId);
  if (dialogueId) {
    dialogue.start(dialogueId);
  }
});
```

### onNearbyNPCChange()

Called when the nearest interactable NPC changes (for UI prompts).

```typescript
onNearbyNPCChange(handler: (nearby: { id: string; dialogueId?: string } | null) => void): void
```

### onItemPickup()

Called when player collects an item pickup.

```typescript
onItemPickup(handler: (pickupId: string, itemId: string, quantity: number) => void): void
```

## NPC Control

### moveNPCTo()

Move an NPC to a target position (for cutscenes). Returns a promise that resolves when the NPC arrives.

```typescript
moveNPCTo(npcId: string, target: { x: number; y: number; z: number }): Promise<void>
```

**Example**:
```typescript
// Move NPC to player for conversation
await engine.moveNPCTo('stranger', { x: 0, y: 0, z: 2 });
await dialogue.start('stranger-intro');
```

### stopNPC() / resumeNPC()

Pause or resume an NPC's patrol movement.

```typescript
stopNPC(npcId: string): void
resumeNPC(npcId: string): void
```

## Item Pickups

### getNearbyPickup()

Get the pickup closest to the player (if any).

```typescript
getNearbyPickup(): { id: string; itemId: string; quantity: number } | null
```

### collectNearbyPickup()

Collect the nearest pickup. Returns `true` if a pickup was collected.

```typescript
collectNearbyPickup(): boolean
```

## Game Loop

### run()

Start the game loop.

```typescript
run(): void
```

### pause() / resume()

Pause or resume game updates (rendering continues).

```typescript
pause(): void
resume(): void
```

### isPausedState()

Check if the game is paused.

```typescript
isPausedState(): boolean
```

## Model Spawning

### spawnModel()

Spawn a 3D model at a position. Returns the entity ID.

```typescript
async spawnModel(url: string, x: number, y: number, z: number): Promise<number>
```

**Example**:
```typescript
const entityId = await engine.spawnModel('/models/tree.glb', 5, 0, 10);
```
