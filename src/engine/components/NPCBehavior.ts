/**
 * NPCBehavior component - Holds behavior tree and runtime state for an NPC.
 */

import { Component } from '../ecs';
import { BTNode } from '../behavior';

export type BehaviorMode = 'onInteraction' | 'continuous';

export class NPCBehavior implements Component {
  static readonly type = 'NPCBehavior';
  readonly type = NPCBehavior.type;

  /** ID of a node that returned 'running' (for continuous mode resume) */
  runningNodeId?: string;

  /** Per-NPC local state (patrol index, last seen position, etc.) */
  blackboard: Map<string, unknown> = new Map();

  constructor(
    /** Root of the behavior tree */
    public tree: BTNode,
    /** When to evaluate: on player interaction or every tick */
    public mode: BehaviorMode = 'onInteraction',
    /** Milliseconds between ticks for continuous mode */
    public tickInterval: number = 500
  ) {}
}
