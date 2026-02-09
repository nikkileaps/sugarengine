import { System, World } from '../ecs';
import { Velocity } from '../components/Velocity';
import { Animator } from '../components/Animator';

/**
 * AnimationSystem - Updates animation mixers and transitions animations
 * based on entity movement state.
 *
 * Run order: after MovementSystem (velocities set), before RenderSystem (mesh synced).
 */
export class AnimationSystem extends System {
  update(world: World, delta: number): void {
    // Update all animation mixers
    const animated = world.query<[Animator]>(Animator);
    for (const { components: [animator] } of animated) {
      animator.mixer.update(delta);
    }

    // Auto-transition walk/idle based on velocity
    const movingAnimated = world.query<[Animator, Velocity]>(Animator, Velocity);
    for (const { components: [animator, velocity] } of movingAnimated) {
      const isMoving = velocity.x !== 0 || velocity.z !== 0;
      const target = isMoving ? 'walk' : 'idle';

      if (animator.hasClip(target)) {
        animator.play(target);
      }
    }
  }
}
