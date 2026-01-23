import { QuestLoader } from './QuestLoader';
import {
  QuestState,
  QuestEvent,
  QuestObjective,
  LoadedQuest,
  ObjectiveType,
} from './types';

export type QuestEventHandler = (event: QuestEvent) => void;

/**
 * Manages quest state, progression, and events
 */
export class QuestManager {
  private loader: QuestLoader;
  private activeQuests: Map<string, QuestState> = new Map();
  private completedQuests: Set<string> = new Set();
  private loadedQuests: Map<string, LoadedQuest> = new Map();

  // Tracked quest for HUD display
  private trackedQuestId: string | null = null;

  // Event handlers
  private onQuestStart: QuestEventHandler | null = null;
  private onQuestComplete: QuestEventHandler | null = null;
  private onQuestFail: QuestEventHandler | null = null;
  private onStageComplete: QuestEventHandler | null = null;
  private onObjectiveProgress: QuestEventHandler | null = null;
  private onObjectiveComplete: QuestEventHandler | null = null;

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

      // Auto-track if no quest is tracked
      if (!this.trackedQuestId) {
        this.trackedQuestId = questId;
      }

      // Fire event
      this.fireEvent('quest-start', questId);

      console.log(`Quest started: ${loaded.definition.name}`);
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

    // Untrack if this was the tracked quest
    if (this.trackedQuestId === questId) {
      this.trackedQuestId = this.getFirstActiveQuestId();
    }

    this.fireEvent('quest-complete', questId);

    const loaded = this.loadedQuests.get(questId);
    console.log(`Quest completed: ${loaded?.definition.name ?? questId}`);
  }

  /**
   * Fail a quest
   */
  failQuest(questId: string): void {
    const state = this.activeQuests.get(questId);
    if (!state) return;

    state.status = 'failed';
    this.activeQuests.delete(questId);

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
    if (this.trackedQuestId === questId) {
      this.trackedQuestId = this.getFirstActiveQuestId();
    }
  }

  // ============================================
  // Objective Progression
  // ============================================

  /**
   * Trigger an objective by type and target ID
   * Called when player interacts with NPCs, enters triggers, etc.
   */
  triggerObjective(type: ObjectiveType, targetId: string): void {
    for (const [questId, state] of this.activeQuests) {
      const loaded = this.loadedQuests.get(questId);
      if (!loaded) continue;

      for (const [objId, objective] of state.objectiveProgress) {
        if (objective.completed) continue;
        if (objective.type !== type) continue;
        if (objective.target !== targetId) continue;

        // Found matching objective - complete it
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
   * Mark an objective as complete
   */
  completeObjective(questId: string, objectiveId: string): void {
    const state = this.activeQuests.get(questId);
    if (!state) return;

    const objective = state.objectiveProgress.get(objectiveId);
    if (!objective || objective.completed) return;

    objective.completed = true;

    // Fire event
    this.fireEvent('objective-complete', questId, objectiveId, objective);

    // Check if stage is complete
    this.checkStageComplete(questId);
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

    // Initialize objectives for new stage
    for (const obj of newStage.objectives) {
      state.objectiveProgress.set(obj.id, {
        ...obj,
        current: obj.current ?? 0,
        completed: false,
      });
    }
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
   * Get current objective for tracked quest
   */
  getTrackedObjective(): QuestObjective | null {
    if (!this.trackedQuestId) return null;

    const state = this.activeQuests.get(this.trackedQuestId);
    if (!state) return null;

    // Find first incomplete objective
    for (const objective of state.objectiveProgress.values()) {
      if (!objective.completed) {
        return objective;
      }
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
}
