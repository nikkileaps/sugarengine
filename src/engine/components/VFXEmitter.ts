/**
 * VFXEmitter Component - Marks an entity as a VFX emitter
 */

import type { Component } from '../ecs/Component';

export class VFXEmitter implements Component {
  static readonly type = 'VFXEmitter';
  readonly type = VFXEmitter.type;

  constructor(
    /** Unique instance ID */
    public instanceId: string,
    /** VFX definition ID */
    public vfxId: string,
    /** Whether the emitter is currently playing */
    public playing: boolean = false,
    /** Scale multiplier */
    public scale: number = 1
  ) {}
}
