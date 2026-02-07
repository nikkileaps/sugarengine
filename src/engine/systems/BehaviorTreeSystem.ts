/**
 * BehaviorTreeSystem - Evaluates behavior trees for NPCs.
 *
 * Two modes:
 * - onInteraction: Tree is evaluated on demand when player interacts with NPC
 * - continuous: Tree is ticked periodically for autonomous behavior
 */

import { System, World, Entity } from '../ecs';
import { NPC, NPCBehavior, NPCMovement } from '../components';
import { BehaviorTreeEvaluator, BTAction, BTCondition, BTContext } from '../behavior';

/** Callback to check a BT condition against game state */
export type BTConditionChecker = (npcId: string, condition: BTCondition) => boolean;

/** Callback to execute a BT action (wired from Game.ts) */
export type BTActionHandler = (npcId: string, action: BTAction) => void;

/** Tracks a running (async) action for continuous mode */
interface RunningAction {
  action: BTAction;
  elapsedMs: number;
}

export class BehaviorTreeSystem extends System {
  private evaluator = new BehaviorTreeEvaluator();
  private conditionChecker: BTConditionChecker | null = null;
  private actionHandler: BTActionHandler | null = null;

  /** Per-entity tick accumulator (ms since last tick) */
  private tickTimers: Map<Entity, number> = new Map();

  /** Per-entity running action state for continuous mode */
  private runningActions: Map<Entity, RunningAction> = new Map();

  /** Register a condition checker (wired from Game.ts) */
  setConditionChecker(checker: BTConditionChecker): void {
    this.conditionChecker = checker;
  }

  /** Register an action handler for continuous mode (wired from Game.ts) */
  setActionHandler(handler: BTActionHandler): void {
    this.actionHandler = handler;
  }

  /**
   * Evaluate an NPC's behavior tree for interaction.
   * Returns the action the NPC wants to take, or null.
   */
  evaluateForInteraction(npcEntity: Entity, world: World): BTAction | null {
    const npc = world.getComponent<NPC>(npcEntity, NPC);
    const behavior = world.getComponent<NPCBehavior>(npcEntity, NPCBehavior);
    if (!npc || !behavior) return null;

    const context = this.buildContext(npc, behavior);
    const result = this.evaluator.evaluate(behavior.tree, context);

    if (result.status === 'success' && result.action) {
      return result.action;
    }

    return null;
  }

  /**
   * Find the entity for an NPC by its ID.
   */
  findNPCEntity(npcId: string, world: World): Entity | null {
    const npcs = world.query<[NPC]>(NPC);
    for (const { entity, components: [npc] } of npcs) {
      if (npc.id === npcId) return entity;
    }
    return null;
  }

  /**
   * System update - ticks continuous behavior trees.
   */
  update(world: World, delta: number): void {
    const deltaMs = delta * 1000;
    const npcs = world.query<[NPC, NPCBehavior]>(NPC, NPCBehavior);

    for (const { entity, components: [npc, behavior] } of npcs) {
      if (behavior.mode !== 'continuous') continue;

      // Throttle ticks by tickInterval
      const timer = (this.tickTimers.get(entity) ?? 0) + deltaMs;
      if (timer < behavior.tickInterval) {
        this.tickTimers.set(entity, timer);
        continue;
      }
      this.tickTimers.set(entity, 0);

      // Check if we have a running action
      const running = this.runningActions.get(entity);
      if (running) {
        running.elapsedMs += behavior.tickInterval;

        if (!this.isActionComplete(entity, running, world)) {
          continue; // Still running, skip re-evaluation
        }

        // Action complete - clear running state
        this.runningActions.delete(entity);
        behavior.runningNodeId = undefined;
      }

      // Evaluate tree
      const context = this.buildContext(npc, behavior);
      const result = this.evaluator.evaluate(behavior.tree, context);

      if (result.status === 'success' && result.action) {
        this.startAction(entity, npc.id, result.action, behavior);
      }
    }
  }

  /**
   * Build the evaluation context for an NPC.
   */
  private buildContext(npc: NPC, behavior: NPCBehavior): BTContext {
    return {
      npcId: npc.id,
      checkCondition: (condition: BTCondition) => {
        if (this.conditionChecker) {
          return this.conditionChecker(npc.id, condition);
        }
        return false;
      },
      blackboard: behavior.blackboard,
    };
  }

  /**
   * Check if a running action is complete.
   */
  private isActionComplete(entity: Entity, running: RunningAction, world: World): boolean {
    switch (running.action.type) {
      case 'wait':
        return running.elapsedMs >= running.action.seconds * 1000;

      case 'moveTo': {
        // Check if NPC's scripted movement has completed
        const movement = world.getComponent<NPCMovement>(entity, NPCMovement);
        // Movement is complete when scriptedTarget is cleared (set to null on arrival)
        return !movement || movement.scriptedTarget === null;
      }

      default:
        // All other actions (dialogue, setFlag, emitEvent, etc.) are instant
        return true;
    }
  }

  /**
   * Start executing an action from the tree.
   */
  private startAction(entity: Entity, npcId: string, action: BTAction, behavior: NPCBehavior): void {
    // Track running actions (wait and moveTo are async)
    if (action.type === 'wait' || action.type === 'moveTo') {
      this.runningActions.set(entity, {
        action,
        elapsedMs: 0,
      });
      behavior.runningNodeId = 'running'; // Mark behavior as having a running node
    }

    // Execute via handler (Game.ts handles moveTo, setFlag, emitEvent, etc.)
    if (this.actionHandler) {
      this.actionHandler(npcId, action);
    }
  }

  /**
   * Clean up tracking state when an entity is removed.
   */
  removeEntity(entity: Entity): void {
    this.tickTimers.delete(entity);
    this.runningActions.delete(entity);
  }
}
