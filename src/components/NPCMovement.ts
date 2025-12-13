import { Component } from '../ecs';

export type MovementBehavior = 'patrol' | 'ping-pong' | 'one-way';

export interface Waypoint {
  x: number;
  y: number;
  z: number;
  pauseDuration?: number; // seconds to pause at this waypoint (default: 0.5)
}

/**
 * Component for NPC waypoint-based movement patterns.
 * NPCs with this component will navigate between waypoints automatically.
 */
export class NPCMovement implements Component {
  static readonly type = 'NPCMovement';
  readonly type = NPCMovement.type;

  // Runtime state
  currentWaypointIndex: number = 0;
  direction: 1 | -1 = 1; // For ping-pong: 1 = forward, -1 = backward
  pauseTimer: number = 0;
  isPaused: boolean = false;
  isMoving: boolean = true; // Can be set false to halt NPC
  hasReachedEnd: boolean = false; // For one-way: true when finished

  // Scripted movement override
  scriptedTarget: Waypoint | null = null;
  onScriptedComplete: (() => void) | null = null;

  constructor(
    public waypoints: Waypoint[] = [],
    public behavior: MovementBehavior = 'patrol',
    public speed: number = 2
  ) {}
}
