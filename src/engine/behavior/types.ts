/**
 * Behavior Tree types (ADR-017)
 *
 * Behavior trees drive NPC decision-making. The tree is evaluated
 * top-down, and nodes return success/failure/running.
 */

// ============================================
// Node Return Status
// ============================================

export type BTStatus = 'success' | 'failure' | 'running';

export interface BTResult {
  status: BTStatus;
  action?: BTAction;
}

// ============================================
// Node Types
// ============================================

export type BTNodeType =
  // Control
  | 'selector'
  | 'sequence'
  | 'parallel'
  // Decorators
  | 'inverter'
  | 'repeater'
  | 'succeeder'
  | 'untilFail'
  // Leaves
  | 'condition'
  | 'action';

// ============================================
// Node Definitions
// ============================================

/** Base node - all BT nodes have these fields */
export interface BTNodeBase {
  id: string;
  type: BTNodeType;
  name?: string;
}

/** Control nodes - have ordered children */
export interface BTControlNode extends BTNodeBase {
  type: 'selector' | 'sequence' | 'parallel';
  children: BTNode[];
}

/** Parallel node - configurable success policy */
export interface BTParallelNode extends BTNodeBase {
  type: 'parallel';
  children: BTNode[];
  policy: 'requireAll' | 'requireOne';
}

/** Decorator nodes - single child, modify behavior */
export interface BTDecoratorNode extends BTNodeBase {
  type: 'inverter' | 'repeater' | 'succeeder' | 'untilFail';
  child: BTNode;
  count?: number;  // For repeater: how many times
}

/** Condition node - checks world/game state */
export interface BTConditionNode extends BTNodeBase {
  type: 'condition';
  condition: BTCondition;
}

/** Action node - performs an NPC action */
export interface BTActionNode extends BTNodeBase {
  type: 'action';
  action: BTAction;
}

/** Union of all node types */
export type BTNode =
  | BTControlNode
  | BTParallelNode
  | BTDecoratorNode
  | BTConditionNode
  | BTActionNode;

// ============================================
// Conditions (what NPCs can check)
// ============================================

export type BTConditionType =
  | 'questStage'
  | 'hasItem'
  | 'hasFlag'
  | 'timeOfDay'
  | 'atLocation'
  | 'custom';

export type BTCondition =
  | { type: 'questStage'; questId: string; stageId: string; nodeId?: string; state: 'active' | 'completed' }
  | { type: 'hasItem'; itemId: string; count?: number }
  | { type: 'hasFlag'; flag: string; value?: unknown }
  | { type: 'timeOfDay'; value: string }
  | { type: 'atLocation'; locationId: string; radius?: number }
  | { type: 'custom'; check: string; params?: unknown };

// ============================================
// Actions (what NPCs can do)
// ============================================

export type BTActionType =
  | 'dialogue'
  | 'moveTo'
  | 'wait'
  | 'animate'
  | 'lookAt'
  | 'setFlag'
  | 'emitEvent'
  | 'custom';

export type BTAction =
  | { type: 'dialogue'; dialogueId: string }
  | { type: 'moveTo'; target: string | { x: number; y: number; z: number } }
  | { type: 'wait'; seconds: number }
  | { type: 'animate'; animation: string }
  | { type: 'lookAt'; target: string }
  | { type: 'setFlag'; flag: string; value: unknown }
  | { type: 'emitEvent'; event: string; data?: unknown }
  | { type: 'custom'; handler: string; params?: unknown };

// ============================================
// Evaluation Context
// ============================================

/** Passed to the evaluator so conditions and actions can access game state */
export interface BTContext {
  /** The NPC's entity ID */
  npcId: string;
  /** Check a condition against game state */
  checkCondition: (condition: BTCondition) => boolean;
  /** NPC's per-instance local state */
  blackboard: Map<string, unknown>;
}
