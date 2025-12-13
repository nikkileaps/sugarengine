import { QuestDefinition, QuestStage, QuestObjective, LoadedQuest } from './types';

/**
 * Loads and caches quest definitions from JSON files
 */
export class QuestLoader {
  private cache: Map<string, LoadedQuest> = new Map();
  private loading: Map<string, Promise<LoadedQuest>> = new Map();

  /**
   * Load a quest by ID
   */
  async load(questId: string): Promise<LoadedQuest> {
    // Check cache first
    const cached = this.cache.get(questId);
    if (cached) {
      return cached;
    }

    // Check if already loading
    const existing = this.loading.get(questId);
    if (existing) {
      return existing;
    }

    // Start loading
    const promise = this.fetchQuest(questId);
    this.loading.set(questId, promise);

    try {
      const loaded = await promise;
      this.cache.set(questId, loaded);
      return loaded;
    } finally {
      this.loading.delete(questId);
    }
  }

  /**
   * Fetch and parse a quest JSON file
   */
  private async fetchQuest(questId: string): Promise<LoadedQuest> {
    const response = await fetch(`/quests/${questId}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load quest: ${questId} (${response.status})`);
    }

    const definition: QuestDefinition = await response.json();

    // Build lookup maps
    const stageMap = new Map<string, QuestStage>();
    const objectiveMap = new Map<string, QuestObjective>();

    for (const stage of definition.stages) {
      stageMap.set(stage.id, stage);
      for (const objective of stage.objectives) {
        objectiveMap.set(objective.id, objective);
      }
    }

    return {
      definition,
      stageMap,
      objectiveMap,
    };
  }

  /**
   * Preload multiple quests
   */
  async preloadAll(questIds: string[]): Promise<void> {
    await Promise.all(questIds.map((id) => this.load(id)));
  }

  /**
   * Check if a quest is cached
   */
  isCached(questId: string): boolean {
    return this.cache.has(questId);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
