import { System, World } from '../ecs';
import { Position, Velocity, Renderable } from '../components';
import { NPCMovement, Waypoint } from '../components/NPCMovement';

/**
 * System that handles NPC waypoint-based movement.
 * Sets velocity for NPCs based on their waypoint paths.
 * Must run BEFORE MovementSystem so velocities are set before positions are updated.
 */
export class NPCMovementSystem extends System {
  private arrivalThreshold = 0.15; // How close to waypoint to consider "arrived"

  update(world: World, delta: number): void {
    const npcs = world.query<[NPCMovement, Position, Velocity]>(
      NPCMovement,
      Position,
      Velocity
    );

    for (const { entity, components: [movement, position, velocity] } of npcs) {
      // If movement is disabled, zero velocity and skip
      if (!movement.isMoving) {
        velocity.x = 0;
        velocity.z = 0;
        continue;
      }

      // Handle scripted movement (overrides patrol)
      if (movement.scriptedTarget) {
        this.moveToward(movement, position, velocity, movement.scriptedTarget);

        if (this.hasArrived(position, movement.scriptedTarget)) {
          const callback = movement.onScriptedComplete;
          movement.scriptedTarget = null;
          movement.onScriptedComplete = null;
          velocity.x = 0;
          velocity.z = 0;
          if (callback) callback();
        }

        this.updateFacing(movement, velocity, entity, world);
        continue;
      }

      // No waypoints = stationary
      if (movement.waypoints.length === 0) {
        velocity.x = 0;
        velocity.z = 0;
        continue;
      }

      // Handle pause at waypoint
      if (movement.isPaused) {
        velocity.x = 0;
        velocity.z = 0;
        movement.pauseTimer -= delta;

        if (movement.pauseTimer <= 0) {
          movement.isPaused = false;
          this.advanceWaypoint(movement);
        }
        continue;
      }

      // One-way behavior: stop if reached end
      if (movement.hasReachedEnd) {
        velocity.x = 0;
        velocity.z = 0;
        continue;
      }

      // Move toward current waypoint
      const target = movement.waypoints[movement.currentWaypointIndex];
      if (!target) continue;

      this.moveToward(movement, position, velocity, target);

      // Check arrival
      if (this.hasArrived(position, target)) {
        const pauseDuration = target.pauseDuration ?? 0.5;
        movement.pauseTimer = pauseDuration;
        movement.isPaused = true;
      }

      // Update facing direction
      this.updateFacing(movement, velocity, entity, world);
    }
  }

  private moveToward(
    movement: NPCMovement,
    position: Position,
    velocity: Velocity,
    target: Waypoint
  ): void {
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance > this.arrivalThreshold) {
      velocity.x = (dx / distance) * movement.speed;
      velocity.z = (dz / distance) * movement.speed;
    } else {
      velocity.x = 0;
      velocity.z = 0;
    }
  }

  private hasArrived(position: Position, target: Waypoint): boolean {
    const dx = target.x - position.x;
    const dz = target.z - position.z;
    return Math.sqrt(dx * dx + dz * dz) <= this.arrivalThreshold;
  }

  private advanceWaypoint(movement: NPCMovement): void {
    const count = movement.waypoints.length;
    if (count === 0) return;

    switch (movement.behavior) {
      case 'patrol':
        // Loop back to start
        movement.currentWaypointIndex =
          (movement.currentWaypointIndex + 1) % count;
        break;

      case 'ping-pong':
        // Reverse direction at ends
        const nextIndex = movement.currentWaypointIndex + movement.direction;
        if (nextIndex >= count || nextIndex < 0) {
          movement.direction *= -1;
          movement.currentWaypointIndex += movement.direction;
        } else {
          movement.currentWaypointIndex = nextIndex;
        }
        break;

      case 'one-way':
        // Stop at the end
        if (movement.currentWaypointIndex >= count - 1) {
          movement.hasReachedEnd = true;
        } else {
          movement.currentWaypointIndex++;
        }
        break;
    }
  }

  private updateFacing(
    _movement: NPCMovement,
    velocity: Velocity,
    entity: number,
    world: World
  ): void {
    // Only update facing when actually moving
    if (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01) {
      const facingAngle = Math.atan2(velocity.x, velocity.z);

      // Rotate the mesh to face movement direction
      const renderable = world.getComponent<Renderable>(entity, Renderable);
      if (renderable) {
        renderable.mesh.rotation.y = facingAngle;
      }
    }
  }
}
