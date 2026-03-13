import { System, World } from '../ecs';
import { PluginManager } from './PluginManager';

/**
 * ECS bridge for plugin per-frame updates.
 *
 * Running plugin updates as a System keeps plugin ticks aligned with
 * the engine's deterministic update ordering and pause behavior.
 */
export class PluginSystem extends System {
  constructor(private plugins: PluginManager) {
    super();
  }

  update(_world: World, delta: number): void {
    this.plugins.update(delta);
  }
}
