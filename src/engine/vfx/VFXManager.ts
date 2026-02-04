/**
 * VFXManager - Orchestrates particle effects
 *
 * Uses different emitter implementations based on effect type:
 * - FlameEmitter for fire/smoke effects
 * - SparkleEmitter for twinkling sparkle effects
 */

import * as THREE from 'three';
import type { VFXDefinition } from './types';
import { FlameEmitter } from './FlameEmitter';
import { SparkleEmitter } from './SparkleEmitter';

// Common emitter interface
export interface Emitter {
  readonly id: string;
  readonly definition: VFXDefinition;
  play(): void;
  stop(): void;
  isPlaying(): boolean;
  hasActiveParticles(): boolean;
  update(delta: number): void;
  setPosition(x: number, y: number, z: number): void;
  getPosition(): THREE.Vector3;
  dispose(scene: THREE.Scene): void;
}

/**
 * VFXManager - Central manager for all particle effects
 */
export class VFXManager {
  private scene: THREE.Scene;
  private definitions: Map<string, VFXDefinition> = new Map();
  private emitters: Map<string, Emitter> = new Map();
  private emitterIdCounter: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Register a VFX definition
   */
  registerDefinition(definition: VFXDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  /**
   * Get a registered definition
   */
  getDefinition(id: string): VFXDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Get all registered definitions
   */
  getAllDefinitions(): VFXDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Clear all definitions
   */
  clearDefinitions(): void {
    this.definitions.clear();
  }

  /**
   * Create an emitter instance (automatically chooses correct type)
   */
  createEmitter(
    vfxId: string,
    position: THREE.Vector3 = new THREE.Vector3(),
    scale: number = 1,
    autoPlay: boolean = true
  ): Emitter | null {
    const definition = this.definitions.get(vfxId);
    if (!definition) {
      console.warn(`[VFXManager] Unknown VFX definition: ${vfxId}`);
      return null;
    }

    const id = `emitter-${this.emitterIdCounter++}`;

    // Choose emitter type based on geometry
    let emitter: Emitter;
    if (definition.geometry === 'sparkle') {
      emitter = new SparkleEmitter(id, definition, this.scene, position, scale);
    } else {
      emitter = new FlameEmitter(id, definition, this.scene, position, scale);
    }

    this.emitters.set(id, emitter);

    if (autoPlay) {
      emitter.play();
    }

    return emitter;
  }

  /**
   * Get an emitter by ID
   */
  getEmitter(id: string): Emitter | undefined {
    return this.emitters.get(id);
  }

  /**
   * Remove an emitter
   */
  removeEmitter(id: string): void {
    const emitter = this.emitters.get(id);
    if (emitter) {
      emitter.dispose(this.scene);
      this.emitters.delete(id);
    }
  }

  /**
   * Update all emitters
   */
  update(delta: number): void {
    // Update all emitters
    for (const emitter of this.emitters.values()) {
      emitter.update(delta);
    }

    // Clean up finished non-looping emitters
    for (const [id, emitter] of this.emitters) {
      if (!emitter.isPlaying() && !emitter.hasActiveParticles()) {
        if (!emitter.definition.loop) {
          this.removeEmitter(id);
        }
      }
    }
  }

  /**
   * Dispose all emitters
   */
  dispose(): void {
    for (const [id] of this.emitters) {
      this.removeEmitter(id);
    }
  }
}

// Re-export emitter types for external use
export { FlameEmitter } from './FlameEmitter';
export { SparkleEmitter } from './SparkleEmitter';
