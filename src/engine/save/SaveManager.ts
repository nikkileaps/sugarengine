import { StorageProvider } from './StorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
// TauriFileProvider is imported dynamically to avoid bundling Tauri deps in browser builds
import {
  GameSaveData,
  SaveSlotMetadata,
  SaveResult,
  SerializedQuestState,
  SerializedInventoryItem,
  SerializedObjectiveProgress,
  AutoSaveTrigger,
  SAVE_DATA_VERSION
} from './types';

// Forward declarations - actual imports would create circular deps
interface QuestManagerLike {
  getActiveQuests(): { questId: string; status: string; currentStageId: string; objectiveProgress: Map<string, unknown>; startedAt?: number; completedAt?: number }[];
  getTrackedQuestId(): string | null;
  getCompletedQuestIds?(): string[];
  setTrackedQuest(questId: string | null): void;
  clearAllQuests?(): void;
  markQuestCompleted?(questId: string): void;
  restoreQuestState?(savedState: SerializedQuestState): Promise<void>;
}

interface InventoryManagerLike {
  getItems(): { itemId: string; quantity: number }[];
  clear(): void;
  addItem(itemId: string, quantity: number): boolean;
}

interface EngineLike {
  getPlayerPosition?(): { x: number; y: number; z: number };
  getCurrentRegion?(): string;
  loadRegion(regionPath: string, spawnOverride?: { x: number; y: number; z: number }, collectedPickups?: string[]): Promise<void>;
}

interface CasterManagerLike {
  getCasterState(): { battery: number; resonance: number } | null;
  loadCasterState(state: { battery: number; resonance: number }): void;
}

export type SaveEventHandler = (trigger: AutoSaveTrigger, slotId: string) => void;

/**
 * Configuration for SaveManager
 */
export interface SaveManagerConfig {
  autoSaveEnabled: boolean;
  autoSaveSlotId: string;
  autoSaveDebounceMs: number;
}

const DEFAULT_CONFIG: SaveManagerConfig = {
  autoSaveEnabled: true,
  autoSaveSlotId: 'autosave',
  autoSaveDebounceMs: 5000
};

/**
 * Orchestrates save/load operations across all game systems
 */
export class SaveManager {
  private provider: StorageProvider;
  private config: SaveManagerConfig;
  private gameStartTime: number;
  private loadedPlayTime: number = 0;
  private lastAutoSaveTime: number = 0;
  private collectedPickups: Map<string, Set<string>> = new Map();

  // Event handlers
  private onAutoSaveHandler: SaveEventHandler | null = null;
  private onSaveCompleteHandler: ((slotId: string, success: boolean) => void) | null = null;
  private onLoadCompleteHandler: ((slotId: string, success: boolean) => void) | null = null;

  // Reference to game systems
  private engine: EngineLike | null = null;
  private questManager: QuestManagerLike | null = null;
  private inventoryManager: InventoryManagerLike | null = null;
  private casterManager: CasterManagerLike | null = null;

  constructor(config: Partial<SaveManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.gameStartTime = Date.now();

    // Default to localStorage, will be updated in init() if Tauri is detected
    this.provider = new LocalStorageProvider();
  }

  /**
   * Initialize the save system
   */
  async init(): Promise<SaveResult> {
    // Auto-detect and initialize the best storage provider
    await this.detectAndInitProvider();
    return await this.provider.init();
  }

  /**
   * Detect the best available storage provider
   */
  private async detectAndInitProvider(): Promise<void> {
    // Check if running in Tauri
    if (typeof window !== 'undefined' && '__TAURI__' in window) {
      try {
        // Dynamic import to avoid bundling Tauri deps in browser builds
        const { TauriFileProvider } = await import('./TauriFileProvider');
        this.provider = new TauriFileProvider();
      } catch {
        // Fall back to localStorage if Tauri import fails
        console.warn('Failed to load TauriFileProvider, using localStorage');
      }
    }
  }

  /**
   * Set the storage provider manually
   */
  setProvider(provider: StorageProvider): void {
    this.provider = provider;
  }

  /**
   * Connect game systems for state gathering
   */
  setGameSystems(
    engine: EngineLike,
    questManager: QuestManagerLike,
    inventoryManager: InventoryManagerLike,
    casterManager?: CasterManagerLike
  ): void {
    this.engine = engine;
    this.questManager = questManager;
    this.inventoryManager = inventoryManager;
    this.casterManager = casterManager ?? null;
  }

  // ============================================
  // Event Handlers
  // ============================================

  setOnAutoSave(handler: SaveEventHandler): void {
    this.onAutoSaveHandler = handler;
  }

  setOnSaveComplete(handler: (slotId: string, success: boolean) => void): void {
    this.onSaveCompleteHandler = handler;
  }

  setOnLoadComplete(handler: (slotId: string, success: boolean) => void): void {
    this.onLoadCompleteHandler = handler;
  }

  // ============================================
  // Save Operations
  // ============================================

  /**
   * Save game to specified slot
   */
  async save(slotId: string): Promise<SaveResult> {
    if (!this.engine || !this.questManager || !this.inventoryManager) {
      return { success: false, error: 'Game systems not connected' };
    }

    try {
      const data = this.gatherGameState();
      const result = await this.provider.save(slotId, data);

      this.onSaveCompleteHandler?.(slotId, result.success);

      if (result.success) {
        console.log(`Game saved to slot: ${slotId}`);
      }

      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      this.onSaveCompleteHandler?.(slotId, false);
      return { success: false, error };
    }
  }

  /**
   * Trigger auto-save if enabled and not debounced
   */
  async autoSave(trigger: AutoSaveTrigger): Promise<void> {
    if (!this.config.autoSaveEnabled) return;

    const now = Date.now();
    if (now - this.lastAutoSaveTime < this.config.autoSaveDebounceMs) {
      return; // Debounced
    }

    this.lastAutoSaveTime = now;

    const result = await this.save(this.config.autoSaveSlotId);

    if (result.success) {
      this.onAutoSaveHandler?.(trigger, this.config.autoSaveSlotId);
    }
  }

  /**
   * Gather complete game state for saving
   */
  private gatherGameState(): GameSaveData {
    const playerState = this.gatherPlayerState();
    const questState = this.gatherQuestState();
    const inventoryState = this.gatherInventoryState();
    const casterState = this.gatherCasterState();

    return {
      version: SAVE_DATA_VERSION,
      savedAt: Date.now(),
      playTime: this.calculatePlayTime(),
      player: playerState,
      quests: questState,
      inventory: inventoryState,
      world: {
        collectedPickups: this.serializeCollectedPickups()
      },
      caster: casterState,
    };
  }

  private gatherCasterState(): GameSaveData['caster'] {
    if (!this.casterManager) return undefined;
    const state = this.casterManager.getCasterState();
    if (!state) return undefined;
    return state;
  }

  private gatherPlayerState(): GameSaveData['player'] {
    const position = this.engine!.getPlayerPosition?.() ?? { x: 0, y: 0, z: 0 };
    const currentRegion = this.engine!.getCurrentRegion?.();
    if (!currentRegion) {
      throw new Error('Cannot save: no region is currently loaded');
    }

    return {
      position,
      currentRegion
    };
  }

  private gatherQuestState(): GameSaveData['quests'] {
    const manager = this.questManager!;

    // Serialize active quests
    const activeQuests = manager.getActiveQuests().map(state =>
      this.serializeQuestState(state)
    );

    // Get completed quest IDs
    const completed = manager.getCompletedQuestIds?.() ?? [];

    return {
      active: activeQuests,
      completed,
      trackedQuestId: manager.getTrackedQuestId()
    };
  }

  private serializeQuestState(state: { questId: string; status: string; currentStageId: string; objectiveProgress: Map<string, unknown>; startedAt?: number; completedAt?: number }): SerializedQuestState {
    const objectives: SerializedObjectiveProgress[] = [];

    for (const [_id, obj] of state.objectiveProgress) {
      const o = obj as { id: string; type: string; description: string; target?: string; count?: number; current?: number; completed: boolean; optional?: boolean };
      objectives.push({
        id: o.id,
        type: o.type,
        description: o.description,
        target: o.target,
        count: o.count,
        current: o.current,
        completed: o.completed,
        optional: o.optional
      });
    }

    return {
      questId: state.questId,
      status: state.status as SerializedQuestState['status'],
      currentStageId: state.currentStageId,
      objectiveProgress: objectives,
      startedAt: state.startedAt,
      completedAt: state.completedAt
    };
  }

  private gatherInventoryState(): SerializedInventoryItem[] {
    const items = this.inventoryManager!.getItems();
    return items.map(slot => ({
      itemId: slot.itemId,
      quantity: slot.quantity
    }));
  }

  private serializeCollectedPickups(): { [region: string]: string[] } {
    const result: { [region: string]: string[] } = {};
    for (const [region, pickups] of this.collectedPickups) {
      result[region] = Array.from(pickups);
    }
    return result;
  }

  private calculatePlayTime(): number {
    return this.loadedPlayTime + (Date.now() - this.gameStartTime);
  }

  // ============================================
  // Load Operations
  // ============================================

  /**
   * Load game from specified slot
   */
  async load(slotId: string): Promise<SaveResult> {
    if (!this.engine || !this.questManager || !this.inventoryManager) {
      return { success: false, error: 'Game systems not connected' };
    }

    try {
      const data = await this.provider.load(slotId);

      if (!data) {
        this.onLoadCompleteHandler?.(slotId, false);
        return { success: false, error: 'Save data not found' };
      }

      // Validate version
      if (data.version !== SAVE_DATA_VERSION) {
        console.warn(`Save data version mismatch: ${data.version} vs ${SAVE_DATA_VERSION}`);
        // Future: implement migration
      }

      await this.restoreGameState(data);

      // Update play time tracking
      this.loadedPlayTime = data.playTime;
      this.gameStartTime = Date.now();

      this.onLoadCompleteHandler?.(slotId, true);
      console.log(`Game loaded from slot: ${slotId}`);
      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      this.onLoadCompleteHandler?.(slotId, false);
      return { success: false, error };
    }
  }

  /**
   * Restore game state from save data
   */
  private async restoreGameState(data: GameSaveData): Promise<void> {
    // 1. Restore world state FIRST (so we know which pickups are collected)
    this.restoreWorldState(data.world);

    // 2. Load the region with collected pickups filtered out
    const collectedInRegion = this.getCollectedPickups(data.player.currentRegion);
    await this.engine!.loadRegion(data.player.currentRegion, data.player.position, collectedInRegion);

    // 3. Restore quest state
    await this.restoreQuestState(data.quests);

    // 4. Restore inventory state
    this.restoreInventoryState(data.inventory);

    // 5. Restore caster state
    this.restoreCasterState(data.caster);
  }

  private restoreCasterState(caster: GameSaveData['caster']): void {
    if (!this.casterManager) return;

    if (caster) {
      this.casterManager.loadCasterState(caster);
    }
    // If no caster data, the Caster component will use defaults when initialized
  }

  private async restoreQuestState(quests: GameSaveData['quests']): Promise<void> {
    const manager = this.questManager!;

    // Clear current state
    manager.clearAllQuests?.();

    // Restore completed quests
    for (const questId of quests.completed) {
      manager.markQuestCompleted?.(questId);
    }

    // Restore active quests with their progress
    for (const savedState of quests.active) {
      await manager.restoreQuestState?.(savedState);
    }

    // Restore tracked quest
    if (quests.trackedQuestId) {
      manager.setTrackedQuest(quests.trackedQuestId);
    }
  }

  private restoreInventoryState(inventory: SerializedInventoryItem[]): void {
    const manager = this.inventoryManager!;

    // Clear current inventory
    manager.clear();

    // Add items back
    for (const item of inventory) {
      manager.addItem(item.itemId, item.quantity);
    }
  }

  private restoreWorldState(world: GameSaveData['world']): void {
    // Restore collected pickups
    this.collectedPickups.clear();
    for (const [region, pickups] of Object.entries(world.collectedPickups)) {
      this.collectedPickups.set(region, new Set(pickups));
    }
  }

  // ============================================
  // Pickup Tracking
  // ============================================

  /**
   * Mark a pickup as collected
   */
  markPickupCollected(regionPath: string, pickupId: string): void {
    let regionPickups = this.collectedPickups.get(regionPath);
    if (!regionPickups) {
      regionPickups = new Set();
      this.collectedPickups.set(regionPath, regionPickups);
    }
    regionPickups.add(pickupId);
  }

  /**
   * Check if a pickup has been collected
   */
  isPickupCollected(regionPath: string, pickupId: string): boolean {
    return this.collectedPickups.get(regionPath)?.has(pickupId) ?? false;
  }

  /**
   * Get collected pickups for a region
   */
  getCollectedPickups(regionPath: string): string[] {
    return Array.from(this.collectedPickups.get(regionPath) ?? []);
  }

  /**
   * Clear all collected pickups (for new game)
   */
  clearCollectedPickups(): void {
    this.collectedPickups.clear();
  }

  // ============================================
  // Slot Management
  // ============================================

  async delete(slotId: string): Promise<SaveResult> {
    return await this.provider.delete(slotId);
  }

  async exists(slotId: string): Promise<boolean> {
    return await this.provider.exists(slotId);
  }

  async listSlots(): Promise<SaveSlotMetadata[]> {
    return await this.provider.listSlots();
  }

  /**
   * Check if any save slots exist
   */
  async hasSaves(): Promise<boolean> {
    const slots = await this.provider.listSlots();
    return slots.length > 0;
  }

  /**
   * Get the most recently saved slot ID
   */
  async getMostRecentSlot(): Promise<string | null> {
    const slots = await this.provider.listSlots();
    if (slots.length === 0) return null;

    // Find slot with highest savedAt timestamp
    let mostRecent = slots[0]!;
    for (const slot of slots) {
      if (slot.savedAt > mostRecent.savedAt) {
        mostRecent = slot;
      }
    }
    return mostRecent.slotId;
  }

  async getSlotMetadata(slotId: string): Promise<SaveSlotMetadata | null> {
    return await this.provider.getSlotMetadata(slotId);
  }

  // ============================================
  // Configuration
  // ============================================

  setAutoSaveEnabled(enabled: boolean): void {
    this.config.autoSaveEnabled = enabled;
  }

  isAutoSaveEnabled(): boolean {
    return this.config.autoSaveEnabled;
  }

  /**
   * Get formatted play time string
   */
  getPlayTimeFormatted(): string {
    const ms = this.calculatePlayTime();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
