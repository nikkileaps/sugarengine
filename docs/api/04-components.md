# Components

Components are pure data containers attached to entities. They have no logic—all behavior comes from systems.

**Source**: `src/components/`

## Position

World position in 3D space.

```typescript
import { Position } from './components/Position';

new Position(x: number, y: number, z: number)
```

| Property | Type | Description |
|----------|------|-------------|
| `x` | `number` | X coordinate |
| `y` | `number` | Y coordinate (vertical) |
| `z` | `number` | Z coordinate |

## Velocity

Movement vector applied each frame.

```typescript
import { Velocity } from './components/Velocity';

new Velocity(x: number, y: number, z: number)
```

| Property | Type | Description |
|----------|------|-------------|
| `x` | `number` | X velocity |
| `y` | `number` | Y velocity |
| `z` | `number` | Z velocity |

## Renderable

Links an entity to a Three.js mesh for rendering.

```typescript
import { Renderable } from './components/Renderable';

new Renderable(mesh: THREE.Object3D, visible?: boolean)
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mesh` | `THREE.Object3D` | - | The 3D object to render |
| `visible` | `boolean` | `true` | Whether the mesh is visible |

## PlayerControlled

Marks an entity as controlled by player input.

```typescript
import { PlayerControlled } from './components/PlayerControlled';

new PlayerControlled(speed?: number)
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `speed` | `number` | `5` | Movement speed |

Only one entity should have this component at a time.

## NPC

Marks an entity as a non-player character.

```typescript
import { NPC } from './components/NPC';

new NPC(id: string, name: string, dialogueId?: string)
```

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique NPC identifier |
| `name` | `string` | Display name |
| `dialogueId` | `string?` | ID of dialogue tree to start on interact |

## NPCMovement

Waypoint-based movement for NPCs.

```typescript
import { NPCMovement, MovementBehavior } from './components/NPCMovement';

new NPCMovement(
  waypoints: Waypoint[],
  behavior: MovementBehavior,
  speed?: number
)
```

### Constructor Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `waypoints` | `Waypoint[]` | - | Array of positions to move between |
| `behavior` | `MovementBehavior` | - | How to traverse waypoints |
| `speed` | `number` | `2` | Movement speed |

### Waypoint

```typescript
interface Waypoint {
  x: number;
  y: number;
  z: number;
  pauseDuration?: number;  // Seconds to pause at this waypoint
}
```

### MovementBehavior

| Value | Description |
|-------|-------------|
| `'patrol'` | Loop through waypoints continuously |
| `'ping-pong'` | Go back and forth between waypoints |
| `'one-way'` | Stop at the last waypoint |

### Runtime State

These properties are managed by `NPCMovementSystem`:

| Property | Type | Description |
|----------|------|-------------|
| `currentWaypointIndex` | `number` | Current target waypoint |
| `direction` | `1 \| -1` | Direction through waypoints |
| `pauseTimer` | `number` | Time remaining in pause |
| `isPaused` | `boolean` | Currently paused at waypoint |
| `isMoving` | `boolean` | Currently moving |

### Scripted Movement

For cutscenes, NPCs can be moved to arbitrary positions:

| Property | Type | Description |
|----------|------|-------------|
| `scriptedTarget` | `{x, y, z}?` | Target for scripted movement |
| `onScriptedComplete` | `() => void` | Callback when scripted movement completes |

Use `engine.moveNPCTo()` rather than setting these directly.

## TriggerZone

Invisible zone that fires events when the player enters/exits.

```typescript
import { TriggerZone, TriggerEvent } from './components/TriggerZone';

new TriggerZone(
  id: string,
  bounds: { min: {x, y, z}, max: {x, y, z} },
  event: TriggerEvent
)
```

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique trigger identifier |
| `bounds.min` | `{x, y, z}` | Minimum corner of bounding box |
| `bounds.max` | `{x, y, z}` | Maximum corner of bounding box |
| `event` | `TriggerEvent` | Event data to fire |

### TriggerEvent

```typescript
interface TriggerEvent {
  type: string;         // 'transition', 'quest', or custom
  target?: string;      // Target region for transitions
  [key: string]: any;   // Additional custom data
}
```

### Methods

#### containsPoint()

Check if a point is inside the trigger zone.

```typescript
trigger.containsPoint(x: number, y: number, z: number): boolean
```

## ItemPickup

A collectible item in the world.

```typescript
import { ItemPickup } from './components/ItemPickup';

new ItemPickup(id: string, itemId: string, quantity?: number)
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | - | Unique pickup instance ID |
| `itemId` | `string` | - | Item definition ID |
| `quantity` | `number` | `1` | Amount to give when collected |

## Inspectable

An object that can be examined to view content (newspapers, signs, lore).

```typescript
import { Inspectable } from './components/Inspectable';

new Inspectable(id: string, inspectionId: string, promptText?: string)
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | - | Unique inspectable instance ID |
| `inspectionId` | `string` | - | ID of inspection content file |
| `promptText` | `string` | `'Inspect'` | Custom interaction prompt |

See [Inspection System](./12-inspection.md) for full documentation.

## Component Combinations

Common entity configurations:

### Player Entity
```typescript
world.addComponent(entity, new Position(0, 0, 0));
world.addComponent(entity, new Velocity(0, 0, 0));
world.addComponent(entity, new Renderable(playerMesh));
world.addComponent(entity, new PlayerControlled(5));
```

### Static NPC
```typescript
world.addComponent(entity, new Position(10, 0, 5));
world.addComponent(entity, new Renderable(npcMesh));
world.addComponent(entity, new NPC('shopkeeper', 'Shopkeeper', 'shop-dialogue'));
```

### Patrolling NPC
```typescript
world.addComponent(entity, new Position(0, 0, 0));
world.addComponent(entity, new Velocity(0, 0, 0));
world.addComponent(entity, new Renderable(guardMesh));
world.addComponent(entity, new NPC('guard', 'Guard', 'guard-dialogue'));
world.addComponent(entity, new NPCMovement(
  [
    { x: 0, y: 0, z: 0, pauseDuration: 2 },
    { x: 10, y: 0, z: 0, pauseDuration: 2 },
    { x: 10, y: 0, z: 10, pauseDuration: 2 },
    { x: 0, y: 0, z: 10, pauseDuration: 2 },
  ],
  'patrol',
  3
));
```

### World Pickup
```typescript
world.addComponent(entity, new Position(5, 0, 5));
world.addComponent(entity, new Renderable(coinMesh));
world.addComponent(entity, new ItemPickup('coin-01', 'gold-coin', 5));
```

### Inspectable Object
```typescript
world.addComponent(entity, new Position(3, 0.5, 2));
world.addComponent(entity, new Renderable(newspaperMesh));
world.addComponent(entity, new Inspectable('newspaper-01', 'daily-tribune', 'Read newspaper'));
```
