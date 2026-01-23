import * as THREE from 'three';
import { System, World } from '../ecs';
import { Position, Velocity, Renderable } from '../components';

export class RenderSystem extends System {
  constructor(private scene: THREE.Scene) {
    super();
  }

  update(world: World, _delta: number): void {
    const entities = world.query<[Position, Renderable]>(Position, Renderable);

    for (const { entity, components: [position, renderable] } of entities) {
      // Sync position to mesh
      renderable.mesh.position.set(position.x, position.y, position.z);
      renderable.mesh.visible = renderable.visible;

      // Add to scene if not already
      if (!renderable.mesh.parent) {
        this.scene.add(renderable.mesh);
      }

      // Rotate to face movement direction
      const velocity = world.getComponent<Velocity>(entity, Velocity);
      if (velocity && (velocity.x !== 0 || velocity.z !== 0)) {
        renderable.mesh.rotation.y = Math.atan2(velocity.x, velocity.z);
      }
    }
  }
}
