import * as THREE from 'three';
import { Component } from '../ecs';

/**
 * Animator component - holds an AnimationMixer and named clips for an entity.
 * The AnimationSystem updates the mixer each frame and handles state transitions.
 */
export class Animator implements Component {
  static readonly type = 'Animator';
  readonly type = Animator.type;

  readonly mixer: THREE.AnimationMixer;
  private clips: Map<string, THREE.AnimationClip> = new Map();
  private actions: Map<string, THREE.AnimationAction> = new Map();
  currentState: string | null = null;

  constructor(root: THREE.Object3D) {
    this.mixer = new THREE.AnimationMixer(root);
  }

  /** Register a named animation clip */
  addClip(name: string, clip: THREE.AnimationClip): void {
    this.clips.set(name, clip);
    this.actions.set(name, this.mixer.clipAction(clip));
  }

  /** Check if a named clip is registered */
  hasClip(name: string): boolean {
    return this.clips.has(name);
  }

  /** Cross-fade to a named animation state. No-op if already in that state. */
  play(name: string, fadeDuration: number = 0.2): void {
    if (this.currentState === name) return;

    const nextAction = this.actions.get(name);
    if (!nextAction) return;

    const prevAction = this.currentState ? this.actions.get(this.currentState) : null;

    nextAction.reset();
    nextAction.play();

    if (prevAction) {
      nextAction.crossFadeFrom(prevAction, fadeDuration, true);
    }

    this.currentState = name;
  }

  /** Stop all animations */
  stop(): void {
    for (const action of this.actions.values()) {
      action.stop();
    }
    this.currentState = null;
  }
}
