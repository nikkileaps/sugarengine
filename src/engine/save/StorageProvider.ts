import { GameSaveData, SaveSlotMetadata, SaveResult, StorageCapabilities } from './types';

/**
 * Abstract interface for storage backends.
 * Implementations: LocalStorage, Tauri FS, Cloud API
 */
export interface StorageProvider {
  /**
   * Get storage capabilities
   */
  getCapabilities(): StorageCapabilities;

  /**
   * Initialize the storage provider.
   * May involve checking permissions, creating directories, etc.
   */
  init(): Promise<SaveResult>;

  /**
   * Save game data to a slot
   */
  save(slotId: string, data: GameSaveData): Promise<SaveResult>;

  /**
   * Load game data from a slot
   */
  load(slotId: string): Promise<GameSaveData | null>;

  /**
   * Delete a save slot
   */
  delete(slotId: string): Promise<SaveResult>;

  /**
   * Check if a save slot exists
   */
  exists(slotId: string): Promise<boolean>;

  /**
   * Get metadata for all save slots
   */
  listSlots(): Promise<SaveSlotMetadata[]>;

  /**
   * Get metadata for a specific slot without loading full data
   */
  getSlotMetadata(slotId: string): Promise<SaveSlotMetadata | null>;
}

/**
 * Base class with common utility methods
 */
export abstract class BaseStorageProvider implements StorageProvider {
  abstract getCapabilities(): StorageCapabilities;
  abstract init(): Promise<SaveResult>;
  abstract save(slotId: string, data: GameSaveData): Promise<SaveResult>;
  abstract load(slotId: string): Promise<GameSaveData | null>;
  abstract delete(slotId: string): Promise<SaveResult>;
  abstract exists(slotId: string): Promise<boolean>;
  abstract listSlots(): Promise<SaveSlotMetadata[]>;
  abstract getSlotMetadata(slotId: string): Promise<SaveSlotMetadata | null>;

  /**
   * Extract metadata from full save data
   */
  protected extractMetadata(slotId: string, data: GameSaveData): SaveSlotMetadata {
    return {
      slotId,
      savedAt: data.savedAt,
      playTime: data.playTime,
      playerRegion: data.player.currentRegion,
      questCount: data.quests.active.length + data.quests.completed.length,
      exists: true
    };
  }

  /**
   * Serialize data to JSON string
   */
  protected serialize(data: GameSaveData): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Parse JSON string to save data
   */
  protected deserialize(json: string): GameSaveData | null {
    try {
      return JSON.parse(json) as GameSaveData;
    } catch (e) {
      console.error('Failed to parse save data:', e);
      return null;
    }
  }
}
