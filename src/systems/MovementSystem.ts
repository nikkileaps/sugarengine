import * as THREE from 'three';
import { System, World } from '../ecs';
import { Position, Velocity, PlayerControlled } from '../components';
import { InputManager } from '../core/InputManager';

export class MovementSystem extends System {
  private raycaster: THREE.Raycaster;
  private collisionDistance = 0.5; // How close to walls before stopping
  private playerHeight = 1.0; // Ray origin height (above ground cubes)

  constructor(
    private input: InputManager,
    private scene: THREE.Scene
  ) {
    super();
    this.raycaster = new THREE.Raycaster();
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

    // Apply velocity to position with collision detection
    const movingEntities = world.query<[Position, Velocity]>(Position, Velocity);
    for (const { entity, components: [position, velocity] } of movingEntities) {
      // Only do collision for player-controlled entities
      const isPlayer = world.hasComponent(entity, PlayerControlled);

      if (isPlayer) {
        const origin = new THREE.Vector3(position.x, position.y + this.playerHeight, position.z);

        // Check X movement
        if (velocity.x !== 0) {
          const dirX = new THREE.Vector3(Math.sign(velocity.x), 0, 0);
          if (!this.checkCollision(origin, dirX)) {
            position.x += velocity.x * delta;
          }
        }

        // Check Z movement
        if (velocity.z !== 0) {
          const dirZ = new THREE.Vector3(0, 0, Math.sign(velocity.z));
          origin.x = position.x;
          if (!this.checkCollision(origin, dirZ)) {
            position.z += velocity.z * delta;
          }
        }

        position.y += velocity.y * delta;
      } else {
        // Non-player entities move without collision
        position.x += velocity.x * delta;
        position.y += velocity.y * delta;
        position.z += velocity.z * delta;
      }
    }
  }

  private checkCollision(origin: THREE.Vector3, direction: THREE.Vector3): boolean {
    this.raycaster.set(origin, direction);
    this.raycaster.far = this.collisionDistance;

    // Get all meshes except player and NPCs
    const collidables: THREE.Object3D[] = [];
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh &&
          !child.name.startsWith('player') &&
          !child.name.startsWith('npc-')) {
        collidables.push(child);
      }
    });

    const intersects = this.raycaster.intersectObjects(collidables, true);

    // Only count collisions with mostly-vertical surfaces (walls, not floors)
    for (const hit of intersects) {
      if (hit.face) {
        // Get world normal of the face
        const normal = hit.face.normal.clone();
        normal.transformDirection(hit.object.matrixWorld);

        // If normal is mostly horizontal (Y component near 0), it's a wall
        if (Math.abs(normal.y) < 0.5) {
          return true;
        }
      }
    }

    return false;
  }
}
