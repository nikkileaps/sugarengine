# Systems

Systems contain game logic that operates on entities with specific components. They run each frame in the order they were added to the world.

**Source**: `src/systems/`

## System Execution Order

Systems must be ordered correctly to avoid bugs:

1. **NPCMovementSystem** - Sets NPC velocities based on waypoints
2. **MovementSystem** - Applies velocities to positions, handles collision
3. **RenderSystem** - Syncs entity positions to Three.js meshes
4. **TriggerSystem** - Detects player entering/exiting trigger zones
5. **InteractionSystem** - Detects nearby NPCs, handles interaction

## NPCMovementSystem

Manages waypoint-based NPC movement.

**Source**: `src/systems/NPCMovementSystem.ts`

**Operates on**: `NPCMovement` + `Position` + `Velocity`

### Behavior

- Calculates direction to current waypoint
- Sets velocity toward waypoint
- Handles pause timers at waypoints
- Supports patrol, ping-pong, and one-way behaviors
- Handles scripted movement for cutscenes

### Scripted Movement

When `scriptedTarget` is set on an `NPCMovement` component:
- Normal waypoint movement is suspended
- NPC moves toward the scripted target
- When reached, `onScriptedComplete` callback fires
- Normal movement resumes (unless stopped)

## MovementSystem

Handles player input and applies velocity to position.

**Source**: `src/systems/MovementSystem.ts`

**Operates on**:
- `PlayerControlled` + `Velocity` (for input)
- `Position` + `Velocity` (for movement)

### Behavior

For player-controlled entities:
- Reads input from `InputManager`
- Converts to isometric movement direction
- Sets velocity based on input and speed
- Performs collision detection via raycasting

For all entities with Position + Velocity:
- Applies velocity to position each frame

### Collision Detection

- Uses raycasting against scene geometry
- Only applied to player-controlled entities
- Prevents walking through walls and objects

### Movement Locks

Movement can be disabled by multiple systems simultaneously using a lock-based approach. Each system adds/removes its own named lock, and movement is only allowed when no locks exist.

**Source**: `src/core/InputManager.ts`

```typescript
// Add a lock (disables movement)
engine.addMovementLock('dialogue');

// Remove a lock (movement resumes only if no other locks exist)
engine.removeMovementLock('dialogue');

// Check if movement is allowed
engine.isMovementAllowed(); // true if no locks
```

**Built-in lock reasons:**

| Lock | Added by | Description |
|------|----------|-------------|
| `'pause'` | Engine | Game is paused |
| `'dialogue'` | Game | Dialogue is active |
| `'inspection'` | Game | Inspection panel is open |
| `'resonance'` | Game | Resonance mini-game is active |
| `'journal'` | Preview/Game UI | Quest journal is open |
| `'inventory'` | Preview/Game UI | Inventory is open |
| `'gift'` | Preview/Game UI | Gift UI is open |
| `'spellMenu'` | Preview/Game UI | Spell menu is open |

This prevents race conditions where one system might re-enable movement while another still needs it disabled. Each system only manages its own lock.

## RenderSystem

Synchronizes entity positions to Three.js meshes.

**Source**: `src/systems/RenderSystem.ts`

**Operates on**: `Position` + `Renderable`

### Behavior

- Copies `Position` component values to mesh position
- Updates mesh visibility based on `Renderable.visible`

This system bridges the ECS world and the Three.js scene graph.

## TriggerSystem

Detects player entering and exiting trigger zones.

**Source**: `src/systems/TriggerSystem.ts`

**Operates on**:
- `PlayerControlled` + `Position` (to find player)
- `TriggerZone` (all trigger zones)

### Behavior

- Tracks which triggers the player is currently inside
- Fires `onTriggerEnter` when player enters a zone
- Fires `onTriggerExit` when player leaves a zone
- Uses AABB (axis-aligned bounding box) containment

### Event Handlers

Set via the engine:

```typescript
engine.onTriggerEnter((event, triggerId) => {
  console.log(`Entered trigger ${triggerId}`, event);
});

engine.onTriggerExit((event, triggerId) => {
  console.log(`Exited trigger ${triggerId}`, event);
});
```

## InteractionSystem

Detects nearby NPCs and handles interaction input.

**Source**: `src/systems/InteractionSystem.ts`

**Operates on**:
- `PlayerControlled` + `Position` (to find player)
- `NPC` + `Position` (all NPCs)

### Behavior

- Finds the nearest NPC within interaction range
- Notifies when the nearest NPC changes (for UI prompts)
- Detects interact key press (E)
- Fires `onInteract` callback with NPC info

### Interaction Range

NPCs must be within a fixed distance to be interactable. The system automatically selects the closest one.

### Event Handlers

Set via the engine:

```typescript
// Called when nearest interactable NPC changes
engine.onNearbyNPCChange((nearby) => {
  if (nearby) {
    showPrompt(`Press E to talk to ${nearby.id}`);
  } else {
    hidePrompt();
  }
});

// Called when player presses interact near an NPC
engine.onInteract((npcId, dialogueId) => {
  console.log(`Interacting with ${npcId}`);
  if (dialogueId) {
    dialogue.start(dialogueId);
  }
});
```

## Creating Custom Systems

Extend the `System` base class:

```typescript
import { System } from './ecs/System';
import { World } from './ecs/World';

export class MySystem extends System {
  update(world: World, delta: number): void {
    // Query for entities with required components
    const entities = world.query(ComponentA, ComponentB);

    for (const { entity, components } of entities) {
      const [compA, compB] = components;

      // Implement your logic here
      compA.value += compB.rate * delta;
    }
  }
}
```

### Registration

Add systems to the world in the correct order:

```typescript
// In Engine constructor or initialization
world.addSystem(new MySystem());
```

### Best Practices

1. **Single Responsibility**: Each system should do one thing
2. **Query Efficiency**: Cache query results if components rarely change
3. **Order Matters**: Plan system execution order carefully
4. **No Side Effects**: Avoid modifying components you didn't query for
5. **Delta Time**: Always multiply by `delta` for frame-rate independence
