/**
 * Save data format version for migration support
 */
export const SAVE_DATA_VERSION = 2;

/**
 * Episode progression data
 */
export interface EpisodeProgressionData {
  currentEpisodeId: string;
  completedEpisodeIds: string[];
}

/**
 * Player position data
 */
export interface PlayerPositionData {
  x: number;
  y: number;
  z: number;
}

/**
 * Serializable quest objective progress
 */
export interface SerializedObjectiveProgress {
  id: string;
  type: string;
  description: string;
  target?: string;
  count?: number;
  current?: number;
  completed: boolean;
  optional?: boolean;
}

/**
 * Serializable quest state
 */
export interface SerializedQuestState {
  questId: string;
  status: 'available' | 'active' | 'completed' | 'failed';
  currentStageId: string;
  objectiveProgress: SerializedObjectiveProgress[];
  startedAt?: number;
  completedAt?: number;
}

/**
 * Inventory item data
 */
export interface SerializedInventoryItem {
  itemId: string;
  quantity: number;
}

/**
 * Collected pickup tracking per region
 */
export interface CollectedPickupsData {
  [regionPath: string]: string[];
}

/**
 * Complete game state for saving
 */
export interface GameSaveData {
  version: number;
  savedAt: number;
  playTime: number;

  player: {
    position: PlayerPositionData;
    currentRegion: string;
  };

  quests: {
    active: SerializedQuestState[];
    completed: string[];
    trackedQuestId: string | null;
  };

  inventory: SerializedInventoryItem[];

  world: {
    collectedPickups: CollectedPickupsData;
  };

  episodes?: EpisodeProgressionData;
}

/**
 * Save slot metadata for listing saves without loading full data
 */
export interface SaveSlotMetadata {
  slotId: string;
  savedAt: number;
  playTime: number;
  playerRegion: string;
  questCount: number;
  exists: boolean;
}

/**
 * Result of a save/load operation
 */
export interface SaveResult {
  success: boolean;
  error?: string;
}

/**
 * Storage provider capabilities
 */
export interface StorageCapabilities {
  supportsMultipleSlots: boolean;
  maxSlots: number;
  supportsAutoSave: boolean;
  requiresAuth: boolean;
}

/**
 * Auto-save trigger events
 */
export type AutoSaveTrigger =
  | 'region-transition'
  | 'quest-complete'
  | 'quest-start'
  | 'item-pickup'
  | 'manual';
