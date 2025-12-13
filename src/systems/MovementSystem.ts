import { System, World } from '../ecs';
import { Position, Velocity, PlayerControlled } from '../components';
import { InputManager } from '../core/InputManager';

export class MovementSystem extends System {
  constructor(private input: InputManager) {
    super();
  }

  update(world: World, delta: number): void {
    // Handle player input -> velocity
    const playerEntities = world.query<[PlayerControlled, Velocity]>(PlayerControlled, Velocity);
    for (const { components: [playerControlled, velocity] } of playerEntities) {
      const { moveX, moveY } = this.input.getInput();

      // Convert screen-space input to isometric world movement
      const angle = Math.PI / 4; // 45 degrees
      velocity.x = (moveX * Math.cos(angle) - moveY * Math.sin(angle)) * playerControlled.speed;
      velocity.z = (moveX * Math.sin(angle) + moveY * Math.cos(angle)) * playerControlled.speed;
    }

    // Apply velocity to position
    const movingEntities = world.query<[Position, Velocity]>(Position, Velocity);
    for (const { components: [position, velocity] } of movingEntities) {
      position.x += velocity.x * delta;
      position.y += velocity.y * delta;
      position.z += velocity.z * delta;
    }
  }
}
