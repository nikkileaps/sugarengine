import { QuestLoader } from './QuestLoader';
import {
  QuestState,
  QuestEvent,
  QuestObjective,
  LoadedQuest,
  ObjectiveType,
  BeatAction,
  BeatNodeType,
  ConditionExpression,
} from './types';

export type QuestEventHandler = (event: QuestEvent) => void;

/**
 * Handler for auto-triggered objectives (legacy: autoStart objectives)
 */
export type ObjectiveTriggerHandler = (
  questId: string,
  objective: QuestObjective
) => void;

/**
 * Handler for beat actions - Game.ts implements this to execute side effects
 */
export type BeatActionHandler = (action: BeatAction) => void;

/**
 * Handler for narrative node triggers
 * Game.ts implements this to play voiceovers, start dialogues, fire events
 * Must call completeObjective() when the narrative content finishes
 */
export type NarrativeTriggerHandler = (
  questId: string,
  objective: QuestObjective
) => void;

/**
 * Handler for condition evaluation - checks game state
 * Game.ts implements this so QuestManager can check inventory, flags, etc.
 */
export type ConditionCheckHandler = (condition: ConditionExpression) => boolean;

/**
 * Manages quest state, progression, and events
 *
 * Handles three node types (ADR-016):
 * - objective: Player actions (shows in HUD, waits for player)
 * - narrative: Auto-triggered system actions (voiceover, dialogue, event)
 * - condition: State checks / gates (waits until condition is true)
 */
export class QuestManager {
  private loader: QuestLoader;
  private activeQuests: Map<string, QuestState> = new Map();
  private completedQuests: Set<string> = new Set();
  private loadedQuests: Map<string, LoadedQuest> = new Map();

  // Tracked quest for HUD display
  private trackedQuestId: string | null = null;

  // Track which objectives are "active" (prerequisites met, ready to complete)
  // Map<questId, Set<objectiveId>>
  private activeObjectives: Map<string, Set<string>> = new Map();

  // Track pending condition nodes that need evaluation
  // Map<questId, Set<nodeId>>
  private pendingConditions: Map<string, Set<string>> = new Map();

  // Event handlers
  private onQuestStart: QuestEventHandler | null = null;
  private onQuestComplete: QuestEventHandler | null = null;
  private onQuestFail: QuestEventHandler | null = null;
  private onStageComplete: QuestEventHandler | null = null;
  private onObjectiveProgress: QuestEventHandler | null = null;
  private onObjectiveComplete: QuestEventHandler | null = null;
  private onObjectiveTrigger: ObjectiveTriggerHandler | null = null;

  // Beat system handlers (ADR-016)
  private onBeatAction: BeatActionHandler | null = null;
  private onNarrativeTrigger: NarrativeTriggerHandler | null = null;
  private conditionChecker: ConditionCheckHandler | null = null;

  constructor() {
    this.loader = new QuestLoader();
  }

  // ============================================
  // Event Handler Registration
  // ============================================

  setOnQuestStart(handler: QuestEventHandler): void {
    this.onQuestStart = handler;
  }

  setOnQuestComplete(handler: QuestEventHandler): void {
    this.onQuestComplete = handler;
  }

  setOnQuestFail(handler: QuestEventHandler): void {
    this.onQuestFail = handler;
  }

  setOnStageComplete(handler: QuestEventHandler): void {
    this.onStageComplete = handler;
  }

  setOnObjectiveProgress(handler: QuestEventHandler): void {
    this.onObjectiveProgress = handler;
  }

  setOnObjectiveComplete(handler: QuestEventHandler): void {
    this.onObjectiveComplete = handler;
  }

  /**
   * Set handler for auto-start objectives (legacy)
   * Called when an objective with autoStart=true becomes available
   */
  setOnObjectiveTrigger(handler: ObjectiveTriggerHandler): void {
    this.onObjectiveTrigger = handler;
  }

  /**
   * Set handler for beat action execution (ADR-016)
   * Game.ts implements this to handle: setFlag, giveItem, removeItem,
   * playSound, teleportNPC, setNPCState, emitEvent, moveNpc, etc.
   */
  setOnBeatAction(handler: BeatActionHandler): void {
    this.onBeatAction = handler;
  }

  /**
   * Set handler for narrative node triggers (ADR-016)
   * Game.ts implements this to play voiceovers, start dialogues, fire events.
   * Handler MUST call completeObjective() when the content finishes.
   */
  setOnNarrativeTrigger(handler: NarrativeTriggerHandler): void {
    this.onNarrativeTrigger = handler;
  }

  /**
   * Set condition checker (ADR-016)
   * Game.ts implements this so QuestManager can evaluate conditions
   * against game state (inventory, flags, quest progress, etc.)
   */
  setConditionChecker(handler: ConditionCheckHandler): void {
    this.conditionChecker = handler;
  }

  // ============================================
  // Quest Lifecycle
  // ============================================

  /**
   * Start a quest by ID
   */
  async startQuest(questId: string): Promise<boolean> {
    // Don't start if already active
    if (this.activeQuests.has(questId)) {
      console.warn(`Quest ${questId} is already active`);
      return false;
    }

    // Don't start if completed (unless repeatable)
    if (this.completedQuests.has(questId)) {
      const loaded = this.loadedQuests.get(questId);
      if (loaded && !loaded.definition.repeatable) {
        console.warn(`Quest ${questId} is already completed and not repeatable`);
        return false;
      }
    }

    try {
      // Load quest definition
      const loaded = await this.loader.load(questId);
      this.loadedQuests.set(questId, loaded);

      // Create initial state
      const state: QuestState = {
        questId,
        status: 'active',
        currentStageId: loaded.definition.startStage,
        objectiveProgress: new Map(),
        startedAt: Date.now(),
      };

      // Initialize objective progress for first stage
      const startStage = loaded.stageMap.get(loaded.definition.startStage);
      if (startStage) {
        for (const obj of startStage.objectives) {
          state.objectiveProgress.set(obj.id, {
            ...obj,
            current: obj.current ?? 0,
            completed: false,
          });
        }
      }

      this.activeQuests.set(questId, state);

      // Initialize active objectives tracking and activate entry objectives
      if (startStage) {
        this.initializeStageObjectives(questId, startStage);
      }

      // Auto-track if no quest is tracked
      if (!this.trackedQuestId) {
        this.trackedQuestId = questId;
      }

      // Fire event
      this.fireEvent('quest-start', questId);

      return true;
    } catch (error) {
      console.error(`Failed to start quest ${questId}:`, error);
      return false;
    }
  }

  /**
   * Complete a quest
   */
  completeQuest(questId: string): void {
    const state = this.activeQuests.get(questId);
    if (!state) return;

    state.status = 'completed';
    state.completedAt = Date.now();

    this.activeQuests.delete(questId);
    this.completedQuests.add(questId);
    this.pendingConditions.delete(questId);

    // Untrack if this was the tracked quest
    if (this.trackedQuestId === questId) {
      this.trackedQuestId = this.getFirstActiveQuestId();
    }

    this.fireEvent('quest-complete', questId);
  }

  /**
   * Fail a quest
   */
  failQuest(questId: string): void {
    const state = this.activeQuests.get(questId);
    if (!state) return;

    state.status = 'failed';
    this.activeQuests.delete(questId);
    this.pendingConditions.delete(questId);

    // Untrack if this was the tracked quest
    if (this.trackedQuestId === questId) {
      this.trackedQuestId = this.getFirstActiveQuestId();
    }

    this.fireEvent('quest-fail', questId);
  }

  /**
   * Abandon a quest (remove without completing/failing)
   */
  abandonQuest(questId: string): void {
    this.activeQuests.delete(questId);
    this.pendingConditions.delete(questId);
    if (this.trackedQuestId === questId) {
      this.trackedQuestId = this.getFirstActiveQuestId();
    }
  }

  // ============================================
  // Beat Actions (ADR-016)
  // ============================================

  /**
   * Execute a list of beat actions (instant side effects)
   * Called on node enter and node complete
   */
  private executeActions(actions: BeatAction[] | undefined): void {
    if (!actions || actions.length === 0) return;

    for (const action of actions) {
      if (this.onBeatAction) {
        this.onBeatAction(action);
      }
    }
  }

  // ============================================
  // Objective Progression
  // ============================================

  /**
   * Trigger an objective by type and target ID
   * Called when player interacts with NPCs, enters triggers, etc.
   * Only matches objective-type nodes (not narrative/condition)
   */
  triggerObjective(type: ObjectiveType, targetId: string): void {
    for (const [questId, state] of this.activeQuests) {
      const loaded = this.loadedQuests.get(questId);
      if (!loaded) continue;

      for (const [objId, objective] of state.objectiveProgress) {
        if (objective.completed) continue;

        // Only match objective-type nodes (or legacy nodes without nodeType)
        const nodeType = objective.nodeType ?? 'objective';
        if (nodeType !== 'objective') continue;

        if (objective.type !== type) continue;
        if (objective.target !== targetId) continue;

        // Check if objective is active (prerequisites met)
        if (!this.isObjectiveActive(questId, objId)) continue;

        // Found matching active objective - complete it
        if (objective.count && objective.count > 1) {
          // Countable objective - increment
          this.incrementObjective(questId, objId);
        } else {
          // Single objective - complete
          this.completeObjective(questId, objId);
        }
      }
    }
  }

  /**
   * Increment a countable objective
   */
  incrementObjective(questId: string, objectiveId: string, amount: number = 1): void {
    const state = this.activeQuests.get(questId);
    if (!state) return;

    const objective = state.objectiveProgress.get(objectiveId);
    if (!objective || objective.completed) return;

    objective.current = (objective.current ?? 0) + amount;

    // Fire progress event
    this.fireEvent('objective-progress', questId, objectiveId, objective);

    // Check if completed
    if (objective.count && objective.current >= objective.count) {
      this.completeObjective(questId, objectiveId);
    }
  }

  /**
   * Mark an objective/node as complete
   */
  completeObjective(questId: string, objectiveId: string): void {
    const state = this.activeQuests.get(questId);
    if (!state) return;

    const objective = state.objectiveProgress.get(objectiveId);
    if (!objective || objective.completed) return;

    // Check if objective is active (prerequisites met)
    // For backward compatibility, allow completion if activeObjectives not tracking this quest
    const activeSet = this.activeObjectives.get(questId);
    if (activeSet && !activeSet.has(objectiveId)) {
      // Objective not yet active - prerequisites not met
      return;
    }

    objective.completed = true;

    // Remove from active set
    activeSet?.delete(objectiveId);

    // Remove from pending conditions if it was a condition node
    this.pendingConditions.get(questId)?.delete(objectiveId);

    // Fire event
    this.fireEvent('objective-complete', questId, objectiveId, objective);

    // Fire onComplete actions (ADR-016)
    this.executeActions(objective.onComplete);

    // Cascade: check if this completion unlocks other objectives
    this.cascadeActivateObjectives(questId, objectiveId);

    // Check if stage is complete
    this.checkStageComplete(questId);
  }

  /**
   * After completing an objective, check if it unlocks other objectives
   */
  private cascadeActivateObjectives(questId: string, completedObjectiveId: string): void {
    const state = this.activeQuests.get(questId);
    const loaded = this.loadedQuests.get(questId);
    if (!state || !loaded) return;

    const currentStage = loaded.stageMap.get(state.currentStageId);
    if (!currentStage) return;

    // Check each objective in the stage
    for (const obj of currentStage.objectives) {
      // Skip if no prerequisites or already completed/active
      if (!obj.prerequisites || obj.prerequisites.length === 0) continue;
      if (state.objectiveProgress.get(obj.id)?.completed) continue;
      if (this.isObjectiveActive(questId, obj.id)) continue;

      // Check if completed objective is a prerequisite
      if (!obj.prerequisites.includes(completedObjectiveId)) continue;

      // Check if ALL prerequisites are now satisfied
      const allPrereqsMet = obj.prerequisites.every(prereqId => {
        const prereqObj = state.objectiveProgress.get(prereqId);
        return prereqObj?.completed === true;
      });

      if (allPrereqsMet) {
        this.activateNode(questId, obj);
      }
    }
  }

  /**
   * Check if all required objectives in current stage are complete
   */
  private checkStageComplete(questId: string): void {
    const state = this.activeQuests.get(questId);
    const loaded = this.loadedQuests.get(questId);
    if (!state || !loaded) return;

    const currentStage = loaded.stageMap.get(state.currentStageId);
    if (!currentStage) return;

    // Check all non-optional objectives
    for (const obj of currentStage.objectives) {
      if (obj.optional) continue;
      const progress = state.objectiveProgress.get(obj.id);
      if (!progress?.completed) return; // Not all complete
    }

    // Stage complete!
    this.fireEvent('stage-complete', questId, state.currentStageId);

    // Move to next stage or complete quest
    if (currentStage.next) {
      this.advanceToStage(questId, currentStage.next);
    } else {
      this.completeQuest(questId);
    }
  }

  /**
   * Advance to a new stage
   */
  private advanceToStage(questId: string, stageId: string): void {
    const state = this.activeQuests.get(questId);
    const loaded = this.loadedQuests.get(questId);
    if (!state || !loaded) return;

    const newStage = loaded.stageMap.get(stageId);
    if (!newStage) {
      console.error(`Stage not found: ${stageId}`);
      return;
    }

    state.currentStageId = stageId;

    // Clear pending conditions for this quest
    this.pendingConditions.delete(questId);

    // Initialize objectives for new stage
    for (const obj of newStage.objectives) {
      state.objectiveProgress.set(obj.id, {
        ...obj,
        current: obj.current ?? 0,
        completed: false,
      });
    }

    // Initialize active objectives and activate entry objectives
    this.initializeStageObjectives(questId, newStage);
  }

  // ============================================
  // Node Activation (ADR-016)
  // ============================================

  /**
   * Initialize objectives for a stage - activate entry nodes
   */
  private initializeStageObjectives(questId: string, stage: import('./types').QuestStage): void {
    // Clear and create fresh active set for this quest
    this.activeObjectives.set(questId, new Set());

    // Determine entry objectives
    const entryObjectiveIds = new Set<string>();

    if (stage.startObjectives && stage.startObjectives.length > 0) {
      // Use explicit start objectives if defined
      for (const id of stage.startObjectives) {
        entryObjectiveIds.add(id);
      }
    } else {
      // Otherwise, objectives without prerequisites are entry points
      for (const obj of stage.objectives) {
        if (!obj.prerequisites || obj.prerequisites.length === 0) {
          entryObjectiveIds.add(obj.id);
        }
      }
    }

    // Activate entry nodes
    for (const objId of entryObjectiveIds) {
      const obj = stage.objectives.find(o => o.id === objId);
      if (obj) {
        this.activateNode(questId, obj);
      }
    }
  }

  /**
   * Activate a node based on its type (ADR-016)
   *
   * - objective: Add to active set, show in HUD, wait for player action
   * - narrative: Auto-fire trigger, complete when content finishes
   * - condition: Register for evaluation, check immediately
   */
  private activateNode(questId: string, obj: QuestObjective): void {
    const nodeType: BeatNodeType = obj.nodeType ?? 'objective';

    // Mark as active
    this.activateObjectiveTracking(questId, obj.id);

    // Fire onEnter actions (before the node runs)
    this.executeActions(obj.onEnter);

    switch (nodeType) {
      case 'objective':
        this.activateObjectiveNode(questId, obj);
        break;
      case 'narrative':
        this.activateNarrativeNode(questId, obj);
        break;
      case 'condition':
        this.activateConditionNode(questId, obj);
        break;
    }
  }

  /**
   * Activate an objective node (player action)
   * Shows in HUD, waits for player to perform action
   */
  private activateObjectiveNode(questId: string, obj: QuestObjective): void {
    // Fire auto-start for legacy compatibility
    if (obj.autoStart && this.onObjectiveTrigger) {
      const progressObj = this.activeQuests.get(questId)?.objectiveProgress.get(obj.id);
      if (progressObj) {
        this.onObjectiveTrigger(questId, progressObj);
      }
    }
  }

  /**
   * Activate a narrative node (auto-triggered)
   * Fires immediately, completes when content finishes
   */
  private activateNarrativeNode(questId: string, obj: QuestObjective): void {
    if (this.onNarrativeTrigger) {
      const progressObj = this.activeQuests.get(questId)?.objectiveProgress.get(obj.id);
      if (progressObj) {
        this.onNarrativeTrigger(questId, progressObj);
      }
    } else {
      // No narrative handler - auto-complete so flow isn't blocked
      console.warn(`[QuestManager] No narrative handler for node ${obj.id}, auto-completing`);
      this.completeObjective(questId, obj.id);
    }
  }

  /**
   * Activate a condition node (state check / gate)
   * Evaluates continuously, completes when condition is true
   */
  private activateConditionNode(questId: string, obj: QuestObjective): void {
    // Check immediately - condition might already be satisfied
    if (obj.condition && this.checkCondition(obj.condition)) {
      this.completeObjective(questId, obj.id);
      return;
    }

    // Register for continuous evaluation
    let condSet = this.pendingConditions.get(questId);
    if (!condSet) {
      condSet = new Set();
      this.pendingConditions.set(questId, condSet);
    }
    condSet.add(obj.id);
  }

  /**
   * Add objective to active tracking set
   */
  private activateObjectiveTracking(questId: string, objectiveId: string): void {
    let activeSet = this.activeObjectives.get(questId);
    if (!activeSet) {
      activeSet = new Set();
      this.activeObjectives.set(questId, activeSet);
    }
    activeSet.add(objectiveId);
  }

  // ============================================
  // Condition Evaluation (ADR-016)
  // ============================================

  /**
   * Evaluate all pending condition nodes
   * Called when game state changes (inventory, flags, quest progress, etc.)
   */
  evaluateConditions(): void {
    // Collect completions first to avoid modifying the map during iteration
    const completions: { questId: string; nodeId: string }[] = [];

    for (const [questId, conditionIds] of this.pendingConditions) {
      const state = this.activeQuests.get(questId);
      if (!state) continue;

      for (const nodeId of conditionIds) {
        const obj = state.objectiveProgress.get(nodeId);
        if (!obj || obj.completed) continue;

        if (obj.condition && this.checkCondition(obj.condition)) {
          completions.push({ questId, nodeId });
        }
      }
    }

    // Process completions
    for (const { questId, nodeId } of completions) {
      this.completeObjective(questId, nodeId);
    }
  }

  /**
   * Check a condition expression against game state
   */
  private checkCondition(condition: ConditionExpression): boolean {
    if (this.conditionChecker) {
      const result = this.conditionChecker(condition);
      return condition.negate ? !result : result;
    }

    // Fallback: built-in checks for quest state
    let result = false;
    switch (condition.operator) {
      case 'questComplete':
        result = this.completedQuests.has(condition.operand);
        break;
      case 'stageComplete': {
        // operand format: "questId:stageId"
        const parts = condition.operand.split(':');
        const scQuestId = parts[0];
        const scStageId = parts[1];
        if (scQuestId && scStageId) {
          const questState = this.activeQuests.get(scQuestId);
          if (questState) {
            // Stage is complete if we've moved past it
            const loaded = this.loadedQuests.get(scQuestId);
            if (loaded) {
              const stageIndex = loaded.definition.stages.findIndex(s => s.id === scStageId);
              const currentIndex = loaded.definition.stages.findIndex(s => s.id === questState.currentStageId);
              result = currentIndex > stageIndex;
            }
          }
        }
        break;
      }
      default:
        // hasItem, hasFlag, custom - require conditionChecker from Game.ts
        console.warn(`[QuestManager] No condition checker for operator: ${condition.operator}`);
        result = false;
    }

    return condition.negate ? !result : result;
  }

  /**
   * Check if an objective is active (prerequisites met)
   */
  isObjectiveActive(questId: string, objectiveId: string): boolean {
    const activeSet = this.activeObjectives.get(questId);
    return activeSet?.has(objectiveId) ?? false;
  }

  /**
   * Get the state of a specific beat node / objective within a stage (ADR-017)
   * Returns 'active' if prerequisites met and not completed, 'completed' if done, null if not found.
   */
  getObjectiveState(questId: string, objectiveId: string): 'active' | 'completed' | null {
    const questState = this.activeQuests.get(questId);
    if (!questState) {
      if (this.completedQuests.has(questId)) return 'completed';
      return null;
    }

    const objective = questState.objectiveProgress.get(objectiveId);
    if (!objective) return null;

    if (objective.completed) return 'completed';
    if (this.isObjectiveActive(questId, objectiveId)) return 'active';

    // Exists but prerequisites not met yet
    return null;
  }

  // ============================================
  // Queries
  // ============================================

  /**
   * Get all active quests
   */
  getActiveQuests(): QuestState[] {
    return Array.from(this.activeQuests.values());
  }

  /**
   * Get state of a specific quest
   */
  getQuestState(questId: string): QuestState | null {
    return this.activeQuests.get(questId) ?? null;
  }

  /**
   * Get loaded quest definition
   */
  getQuestDefinition(questId: string): LoadedQuest | null {
    return this.loadedQuests.get(questId) ?? null;
  }

  /**
   * Check if a quest is active
   */
  isQuestActive(questId: string): boolean {
    return this.activeQuests.has(questId);
  }

  /**
   * Check if a quest is completed
   */
  isQuestCompleted(questId: string): boolean {
    return this.completedQuests.has(questId);
  }

  /**
   * Get stage state for behavior tree conditions (ADR-017)
   * Returns 'active' if stage is current, 'completed' if past, null if not found.
   */
  getStageState(questId: string, stageId: string): 'active' | 'completed' | null {
    const questState = this.activeQuests.get(questId);
    if (!questState) {
      // Quest might be completed
      if (this.completedQuests.has(questId)) return 'completed';
      return null;
    }

    // Current stage is active
    if (questState.currentStageId === stageId) return 'active';

    // Check if we've moved past it
    const loaded = this.loadedQuests.get(questId);
    if (loaded) {
      const stageIndex = loaded.definition.stages.findIndex(s => s.id === stageId);
      const currentIndex = loaded.definition.stages.findIndex(s => s.id === questState.currentStageId);
      if (stageIndex >= 0 && currentIndex > stageIndex) return 'completed';
    }

    return null;
  }

  /**
   * Get the tracked quest ID
   */
  getTrackedQuestId(): string | null {
    return this.trackedQuestId;
  }

  /**
   * Set the tracked quest
   */
  setTrackedQuest(questId: string | null): void {
    if (questId === null || this.activeQuests.has(questId)) {
      this.trackedQuestId = questId;
    }
  }

  /**
   * Get current objective for tracked quest (HUD display)
   * Returns the first active incomplete objective-type node
   * Skips narrative and condition nodes (they're invisible to the player)
   */
  getTrackedObjective(): QuestObjective | null {
    if (!this.trackedQuestId) return null;

    const state = this.activeQuests.get(this.trackedQuestId);
    if (!state) return null;

    // Find first active incomplete objective node
    for (const objective of state.objectiveProgress.values()) {
      if (objective.completed) continue;
      if (!this.isObjectiveActive(this.trackedQuestId, objective.id)) continue;

      // Only show objective-type nodes in HUD (skip narrative/condition)
      const nodeType = objective.nodeType ?? 'objective';
      if (nodeType !== 'objective') continue;

      // Respect showInHUD override
      if (objective.showInHUD === false) continue;

      return objective;
    }

    return null;
  }

  /**
   * Get tracked quest name
   */
  getTrackedQuestName(): string | null {
    if (!this.trackedQuestId) return null;
    const loaded = this.loadedQuests.get(this.trackedQuestId);
    return loaded?.definition.name ?? null;
  }

  /**
   * Find a quest objective that wants to talk to a specific NPC.
   * Returns the objective info if found, including which dialogue to use.
   * Only returns objectives that are active (prerequisites met).
   */
  getQuestDialogueForNpc(npcId: string): {
    questId: string;
    objectiveId: string;
    dialogue: string;
    completeOn: 'dialogueEnd' | string;
  } | null {
    for (const [questId, state] of this.activeQuests) {
      for (const [objId, objective] of state.objectiveProgress) {
        if (objective.completed) continue;
        if (objective.type !== 'talk') continue;
        if (objective.target !== npcId) continue;
        if (!objective.dialogue) continue; // No specific dialogue = use NPC default

        // Only match objective-type nodes
        const nodeType = objective.nodeType ?? 'objective';
        if (nodeType !== 'objective') continue;

        // Only return if objective is active (prerequisites met)
        if (!this.isObjectiveActive(questId, objId)) continue;

        return {
          questId,
          objectiveId: objId,
          dialogue: objective.dialogue,
          completeOn: objective.completeOn ?? 'dialogueEnd'
        };
      }
    }
    return null;
  }

  // ============================================
  // Helpers
  // ============================================

  private getFirstActiveQuestId(): string | null {
    const first = this.activeQuests.keys().next();
    return first.done ? null : first.value;
  }

  private fireEvent(
    type: QuestEvent['type'],
    questId: string,
    stageOrObjectiveId?: string,
    objective?: QuestObjective
  ): void {
    const loaded = this.loadedQuests.get(questId);
    const event: QuestEvent = {
      type,
      questId,
      questName: loaded?.definition.name ?? questId,
      stageId: type === 'stage-complete' ? stageOrObjectiveId : undefined,
      objectiveId: type.startsWith('objective') ? stageOrObjectiveId : undefined,
      objective,
    };

    switch (type) {
      case 'quest-start':
        this.onQuestStart?.(event);
        break;
      case 'quest-complete':
        this.onQuestComplete?.(event);
        break;
      case 'quest-fail':
        this.onQuestFail?.(event);
        break;
      case 'stage-complete':
        this.onStageComplete?.(event);
        break;
      case 'objective-progress':
        this.onObjectiveProgress?.(event);
        break;
      case 'objective-complete':
        this.onObjectiveComplete?.(event);
        break;
    }
  }

  /**
   * Preload quests
   */
  async preload(questIds: string[]): Promise<void> {
    await this.loader.preloadAll(questIds);
  }

  // ============================================
  // Save/Load Support
  // ============================================

  /**
   * Get all completed quest IDs (for saving)
   */
  getCompletedQuestIds(): string[] {
    return Array.from(this.completedQuests);
  }

  /**
   * Clear all quest state (for loading)
   */
  clearAllQuests(): void {
    this.activeQuests.clear();
    this.completedQuests.clear();
    this.activeObjectives.clear();
    this.pendingConditions.clear();
    this.trackedQuestId = null;
  }

  /**
   * Mark a quest as completed without triggering events (for loading)
   */
  markQuestCompleted(questId: string): void {
    this.completedQuests.add(questId);
  }

  /**
   * Restore a quest state from save data (for loading)
   */
  async restoreQuestState(savedState: {
    questId: string;
    status: string;
    currentStageId: string;
    objectiveProgress: { id: string; type: string; description: string; target?: string; count?: number; current?: number; completed: boolean; optional?: boolean }[];
    startedAt?: number;
    completedAt?: number;
  }): Promise<void> {
    // Load quest definition first
    const loaded = await this.loader.load(savedState.questId);
    this.loadedQuests.set(savedState.questId, loaded);

    // Convert serialized objectives back to Map
    const objectiveProgress = new Map<string, QuestObjective>();
    for (const obj of savedState.objectiveProgress) {
      objectiveProgress.set(obj.id, {
        id: obj.id,
        type: obj.type as ObjectiveType,
        description: obj.description,
        target: obj.target,
        count: obj.count,
        current: obj.current,
        completed: obj.completed,
        optional: obj.optional
      });
    }

    // Create QuestState
    const state: QuestState = {
      questId: savedState.questId,
      status: savedState.status as QuestState['status'],
      currentStageId: savedState.currentStageId,
      objectiveProgress,
      startedAt: savedState.startedAt,
      completedAt: savedState.completedAt
    };

    this.activeQuests.set(savedState.questId, state);
  }

  /**
   * Register a quest directly (for development mode)
   */
  registerQuest(questId: string, quest: unknown): void {
    this.loader.register(questId, quest as import('./types').QuestDefinition);
  }

  /**
   * Get an objective by ID from any active quest's current stage
   */
  getObjectiveById(objectiveId: string): QuestObjective | null {
    for (const [, state] of this.activeQuests) {
      const objective = state.objectiveProgress.get(objectiveId);
      if (objective) {
        return objective;
      }
    }
    return null;
  }

  /**
   * Get the quest ID that contains a given objective
   */
  getQuestIdForObjective(objectiveId: string): string | null {
    for (const [questId, state] of this.activeQuests) {
      if (state.objectiveProgress.has(objectiveId)) {
        return questId;
      }
    }
    return null;
  }
}
