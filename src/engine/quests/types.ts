/**
 * Quest objective types (subtypes for objective beat nodes)
 */
export type ObjectiveType = 'talk' | 'voiceover' | 'location' | 'collect' | 'trigger' | 'custom';

// ============================================
// Beat Node Types (ADR-016)
// ============================================

/**
 * Beat node type - determines how the node behaves when activated
 * - objective: Player performs an action (shows in HUD, waits for player)
 * - narrative: System auto-triggers something (voiceover, dialogue, event)
 * - condition: System checks something (gate/wait until state is true)
 */
export type BeatNodeType = 'objective' | 'narrative' | 'condition';

/**
 * Narrative subtypes (auto-triggered system actions)
 */
export type NarrativeSubtype = 'voiceover' | 'dialogue' | 'cutscene' | 'event';

/**
 * Condition operators for condition beat nodes
 */
export type ConditionOperator = 'hasItem' | 'hasFlag' | 'questComplete' | 'stageComplete' | 'custom';

/**
 * Condition expression - evaluated by condition nodes to gate flow
 */
export interface ConditionExpression {
  operator: ConditionOperator;
  operand: string;              // Item ID, flag name, quest ID, etc.
  value?: string | number | boolean;  // For comparisons
  negate?: boolean;             // NOT modifier
}

// ============================================
// Beat Actions (ADR-016)
// ============================================

/**
 * Action types - instant, fire-and-forget side effects
 *
 * Actions are NOT nodes. They don't block flow or have duration.
 * They're instant bookkeeping or immediate feedback.
 */
export type ActionType =
  | 'setFlag'        // Set a world flag
  | 'giveItem'       // Add item to inventory
  | 'removeItem'     // Remove item from inventory
  | 'playSound'      // Fire-and-forget sound
  | 'spawnVFX'       // Fire-and-forget particle effect
  | 'teleportNPC'    // Instant NPC position change
  | 'setNPCState'    // Change NPC state/behavior
  | 'emitEvent'      // Fire a custom event
  | 'moveNpc'        // Animated NPC movement (legacy compat from ADR-015)
  | 'custom';        // Escape hatch

/**
 * A single beat action - instant side effect fired on node enter/complete
 *
 * ID conventions:
 * - UUIDs: NPC IDs, Item IDs, Dialogue IDs, Quest IDs, Trigger IDs
 * - Human-readable strings: Flag names, event names, sound asset paths
 */
export interface BeatAction {
  type: ActionType;
  target?: string;              // Flag name, item ID, NPC ID, sound path, etc.
  value?: unknown;              // Flag value, quantity, position, state, etc.

  // Legacy fields for moveNpc backward compat (ADR-015)
  npcId?: string;
  position?: { x: number; y: number; z: number };
}

// ============================================
// Legacy Action Types (ADR-015 compat)
// ============================================

/** @deprecated Use BeatAction with type 'moveNpc' instead */
export type ObjectiveActionType = 'moveNpc';

/** @deprecated Use BeatAction with type 'moveNpc' instead */
export interface MoveNpcAction {
  type: 'moveNpc';
  npcId: string;
  position: { x: number; y: number; z: number };
}

/** @deprecated Use BeatAction instead */
export type ObjectiveAction = MoveNpcAction;

// ============================================
// Quest Objective (Beat Node)
// ============================================

/**
 * A single quest objective / beat node
 *
 * This is the core unit of the beats graph. Each node is one of:
 * - objective: Something the player does (talk, collect, go to location)
 * - narrative: Something the system triggers (voiceover, dialogue, cutscene)
 * - condition: Something the system checks (has item, has flag, quest complete)
 */
export interface QuestObjective {
  id: string;
  type: ObjectiveType;            // Objective subtype (talk, collect, location, etc.)
  description: string;
  target?: string;                // NPC id, trigger id, item id, etc.
  count?: number;                 // For countable objectives (e.g., "collect 5 items")
  current?: number;               // Current progress for countable objectives
  completed: boolean;
  optional?: boolean;             // Optional objectives don't block stage completion

  // For 'talk' objectives - which dialogue to trigger (overrides NPC default)
  dialogue?: string;
  // When does the objective complete? 'dialogueEnd' (default) or specific node id
  completeOn?: 'dialogueEnd' | string;

  // Auto-start: if true, objective fires automatically when it becomes available
  // (at stage load for entry nodes, or when prerequisites complete for others)
  autoStart?: boolean;

  // Graph structure - objective IDs that must complete before this one activates
  prerequisites?: string[];

  // === Beat node type (ADR-016) ===
  // Defaults to 'objective' for backward compat with existing quest data
  nodeType?: BeatNodeType;

  // === Actions (ADR-016) ===
  // Instant side effects fired at node lifecycle points
  onEnter?: BeatAction[];         // Fires when node activates, before it runs
  onComplete?: BeatAction[];      // Fires when node completes, before flow continues

  // === Narrative-specific (ADR-016) ===
  narrativeType?: NarrativeSubtype;   // voiceover, dialogue, cutscene, event
  voiceoverText?: string;             // Text for voiceover narrative nodes
  dialogueId?: string;                // Dialogue ID for narrative dialogue trigger
  eventName?: string;                 // Event name for narrative event trigger

  // === Condition-specific (ADR-016) ===
  condition?: ConditionExpression;    // Expression evaluated by condition nodes

  // === Display control (ADR-016) ===
  showInHUD?: boolean;                // Default true for objectives, false for others
}

/**
 * A quest stage (group of objectives / beat nodes)
 */
export interface QuestStage {
  id: string;
  description: string;
  objectives: QuestObjective[];
  onComplete?: string;    // Event to fire when stage completes
  next?: string;          // Next stage id (if undefined, quest ends)

  // Graph structure - explicit entry points (if omitted, objectives without prerequisites are entries)
  startObjectives?: string[];
  // Editor-only: node positions for visual graph editor
  objectivePositions?: Record<string, { x: number; y: number }>;
}

/**
 * Reward given on quest completion
 */
export interface QuestReward {
  type: 'xp' | 'item' | 'currency' | 'custom';
  id?: string;            // Item id for item rewards
  amount?: number;
  data?: Record<string, unknown>;
}

/**
 * Full quest definition (loaded from JSON)
 */
export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  startStage: string;
  stages: QuestStage[];
  rewards?: QuestReward[];
  repeatable?: boolean;   // Can quest be done again after completion?
  episodeId?: string;     // UUID of the episode this quest belongs to
}

/**
 * Quest status
 */
export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';

/**
 * Runtime quest state (tracks player progress)
 */
export interface QuestState {
  questId: string;
  status: QuestStatus;
  currentStageId: string;
  objectiveProgress: Map<string, QuestObjective>;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Loaded quest with prebuilt maps for fast lookup
 */
export interface LoadedQuest {
  definition: QuestDefinition;
  stageMap: Map<string, QuestStage>;
  objectiveMap: Map<string, QuestObjective>;
}

/**
 * Quest event types for callbacks
 */
export type QuestEventType =
  | 'quest-start'
  | 'quest-complete'
  | 'quest-fail'
  | 'stage-complete'
  | 'objective-progress'
  | 'objective-complete';

/**
 * Quest event data
 */
export interface QuestEvent {
  type: QuestEventType;
  questId: string;
  questName: string;
  stageId?: string;
  objectiveId?: string;
  objective?: QuestObjective;
}
