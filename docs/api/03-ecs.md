# Entity-Component-System (ECS)

Sugarengine uses a pure ECS architecture for game objects. This provides maximum flexibility and composability.

**Source**: `src/ecs/`

## Overview

- **Entity**: A unique numeric ID (no data or behavior)
- **Component**: Pure data container with a `type` identifier
- **System**: Logic that operates on entities with specific components

## World

The `World` class is the central manager for the ECS.

**Source**: `src/ecs/World.ts`

### Creating a World

```typescript
import { World } from './ecs/World';

const world = new World();
```

Note: You typically access the world via `engine.world` rather than creating your own.

### Entity Management

#### createEntity()

Create a new entity.

```typescript
const entity = world.createEntity();
// Returns: number (entity ID)
```

#### removeEntity()

Remove an entity and all its components.

```typescript
world.removeEntity(entity);
```

### Component Management

#### addComponent()

Attach a component to an entity.

```typescript
import { Position } from './components/Position';

const entity = world.createEntity();
world.addComponent(entity, new Position(10, 0, 5));
```

#### getComponent()

Get a component from an entity. Returns `undefined` if not found.

```typescript
const pos = world.getComponent(entity, Position);
if (pos) {
  console.log(pos.x, pos.y, pos.z);
}
```

#### hasComponent()

Check if an entity has a component.

```typescript
if (world.hasComponent(entity, Position)) {
  // Entity has a position
}
```

#### removeComponent()

Remove a component from an entity.

```typescript
world.removeComponent(entity, Position);
```

### Querying Entities

#### query()

Find all entities with specific components. Returns an array of objects containing the entity and its components.

```typescript
// Query entities with Position and Velocity
const results = world.query(Position, Velocity);

for (const { entity, components } of results) {
  const [position, velocity] = components;
  position.x += velocity.x * delta;
}
```

You can query for any number of components:

```typescript
// Single component
const positioned = world.query(Position);

// Multiple components
const npcs = world.query(NPC, Position, Renderable);
```

### System Management

#### addSystem()

Register a system with the world.

```typescript
import { MovementSystem } from './systems/MovementSystem';

world.addSystem(new MovementSystem());
```

Systems are called in the order they were added.

#### update()

Update all systems. Called automatically by the engine each frame.

```typescript
world.update(deltaTime);
```

## Entity

Entities are simple numeric IDs created via a factory function.

**Source**: `src/ecs/Entity.ts`

```typescript
import { createEntity } from './ecs/Entity';

const entity = createEntity(); // Returns incrementing number
```

Note: You typically create entities via `world.createEntity()` instead.

## Component

Components are pure data containers that implement the `Component` interface.

**Source**: `src/ecs/Component.ts`

```typescript
interface Component {
  type: string;
}
```

### Creating Custom Components

```typescript
export class Health implements Component {
  static readonly type = 'Health';
  readonly type = Health.type;

  constructor(
    public current: number,
    public max: number
  ) {}
}
```

Key requirements:
- Static `type` property for queries
- Instance `type` property matching the static one
- Constructor initializes all data

## System

Systems contain game logic that operates on entities with specific components.

**Source**: `src/ecs/System.ts`

```typescript
abstract class System {
  abstract update(world: World, delta: number): void;
}
```

### Creating Custom Systems

```typescript
import { System } from './ecs/System';
import { World } from './ecs/World';
import { Health, Poison } from './components';

export class PoisonSystem extends System {
  update(world: World, delta: number): void {
    const poisoned = world.query(Health, Poison);

    for (const { entity, components } of poisoned) {
      const [health, poison] = components;

      health.current -= poison.damagePerSecond * delta;

      if (health.current <= 0) {
        world.removeEntity(entity);
      }
    }
  }
}
```

### System Ordering

Systems run in the order they're added. Plan dependencies carefully:

```typescript
// Correct order: input → physics → rendering
world.addSystem(new NPCMovementSystem());  // Sets velocities
world.addSystem(new MovementSystem());      // Applies velocities
world.addSystem(new RenderSystem());        // Syncs to meshes
```

## Complete Example

```typescript
import { World } from './ecs/World';
import { Position, Velocity, Renderable } from './components';
import { MovementSystem, RenderSystem } from './systems';

// Create world
const world = new World();

// Add systems
world.addSystem(new MovementSystem());
world.addSystem(new RenderSystem());

// Create entity with components
const player = world.createEntity();
world.addComponent(player, new Position(0, 0, 0));
world.addComponent(player, new Velocity(0, 0, 0));
world.addComponent(player, new Renderable(playerMesh));

// Game loop
function gameLoop(delta: number) {
  world.update(delta);
  requestAnimationFrame(gameLoop);
}
```
