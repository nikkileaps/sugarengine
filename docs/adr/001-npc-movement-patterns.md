# ADR 001: NPC Movement Patterns

## Status

Accepted

## Context

Sugarengine needs NPCs that can move around the world for storytelling purposes. Examples include:
- A guard patrolling a route
- A shopkeeper pacing behind their counter
- An NPC walking toward the player to initiate a story event

Initially, we considered implementing a full time-of-day schedule system where NPCs would be at different locations based on in-game time (morning at the bakery, evening at home). However, this adds significant complexity:
- Requires a time system with configurable speed
- Requires named locations and location-to-position mapping
- Adds authoring burden for every NPC

For a narrative-focused game, simpler movement patterns that serve specific story beats are more useful than realistic daily routines.

## Decision

Implement waypoint-based movement patterns without a time system.

### Movement Behaviors

Three behavior modes for different use cases:

1. **patrol** - Loop through waypoints forever (guard routes, pacing)
2. **ping-pong** - Walk back and forth between waypoints (shopkeeper behind counter)
3. **one-way** - Walk to destination and stop (scripted story events)

### Architecture

Follow the existing ECS pattern:

- **NPCMovement component** - Stores waypoints, behavior type, speed, and runtime state
- **NPCMovementSystem** - Updates NPC velocity based on waypoint navigation
- Reuse existing **Velocity component** and **MovementSystem** for actual position updates

This separation means:
- NPCMovementSystem sets the velocity (decides where to go)
- MovementSystem applies velocity to position (actually moves)

### Data Format

Movement is optional per-NPC and defined in map.json:

```json
{
  "id": "guard",
  "position": { "x": 0, "y": 0, "z": 0 },
  "dialogue": "guard-greeting",
  "movement": {
    "behavior": "patrol",
    "speed": 1.5,
    "waypoints": [
      { "x": 0, "y": 0, "z": 0, "pause": 2 },
      { "x": 5, "y": 0, "z": 0, "pause": 1 }
    ]
  }
}
```

### Scripted Control API

For story events, the engine exposes:

```typescript
// Command NPC to walk somewhere (returns Promise)
await engine.moveNPCTo('stranger', { x: 0, y: 0, z: 2 });

// Pause/resume patrol (e.g., during dialogue)
engine.stopNPC('guard');
engine.resumeNPC('guard');
```

## Consequences

### Positive

- Simple to author - just waypoints and a behavior type
- No time system complexity
- Scripted API enables cutscene-style story moments
- Follows existing ECS patterns
- NPCs without movement definitions stay stationary (backward compatible)

### Negative

- No automatic daily routines - NPCs won't "go home at night" without explicit triggers
- Pathfinding is direct line-of-sight - NPCs may need carefully placed waypoints to avoid obstacles
- No collision detection for NPCs (they pass through walls) - acceptable for authored paths

### Future Considerations

If needed later, we could add:
- Time-based schedule system that swaps waypoint sets based on in-game time
- Simple obstacle avoidance or navmesh pathfinding
- NPC collision detection

## Files Changed

**New:**
- `src/components/NPCMovement.ts`
- `src/systems/NPCMovementSystem.ts`

**Modified:**
- `src/components/index.ts`
- `src/systems/index.ts`
- `src/loaders/RegionLoader.ts`
- `src/core/Engine.ts`
