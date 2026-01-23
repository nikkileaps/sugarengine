import * as THREE from 'three';
import { Component } from '../ecs';

/**
 * Component for entities that should display a floating text label in the world.
 * Used for NPC names, item labels, etc.
 */
export class WorldLabel implements Component {
  static readonly type = 'WorldLabel';
  readonly type = WorldLabel.type;

  /** The Three.js sprite created by the system (managed internally) */
  sprite?: THREE.Sprite;

  constructor(
    /** Text to display */
    public text: string,
    /** Vertical offset above the entity position */
    public offsetY: number = 1.5,
    /** Font size in pixels (for canvas rendering) */
    public fontSize: number = 32,
    /** Text color */
    public color: string = '#ffffff',
    /** Whether the label is visible */
    public visible: boolean = true
  ) {}
}
