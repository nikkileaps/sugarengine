/**
 * Quest objective types
 */
export type ObjectiveType = 'talk' | 'voiceover' | 'location' | 'collect' | 'trigger' | 'custom';

/**
 * A single quest objective
 */
/**
 * Trigger conditions for auto-firing objectives
 */
export type ObjectiveTrigger = 'onStageStart';

/**
 * Actions that can be triggered when an objective completes
 */
export type ObjectiveActionType = 'moveNpc' | 'triggerObjective';

export interface MoveNpcAction {
  type: 'moveNpc';
  npcId: string;
  position: { x: number; y: number; z: number };
}

export interface TriggerObjectiveAction {
  type: 'triggerObjective';
  objectiveId: string;
}

export type ObjectiveAction = MoveNpcAction | TriggerObjectiveAction;

export interface QuestObjective {
  id: string;
  type: ObjectiveType;
  description: string;
  target?: string;        // NPC id, trigger id, item id, etc.
  count?: number;         // For countable objectives (e.g., "collect 5 items")
  current?: number;       // Current progress for countable objectives
  completed: boolean;
  optional?: boolean;     // Optional objectives don't block stage completion

  // For 'talk' objectives - which dialogue to trigger (overrides NPC default)
  dialogue?: string;
  // When does the objective complete? 'dialogueEnd' (default) or specific node id
  completeOn?: 'dialogueEnd' | string;

  // Auto-trigger condition - if set, objective fires automatically
  trigger?: ObjectiveTrigger;

  // Actions to perform when this objective completes
  onComplete?: ObjectiveAction[];
}

/**
 * A quest stage (group of objectives)
 */
export interface QuestStage {
  id: string;
  description: string;
  objectives: QuestObjective[];
  onComplete?: string;    // Event to fire when stage completes
  next?: string;          // Next stage id (if undefined, quest ends)
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
