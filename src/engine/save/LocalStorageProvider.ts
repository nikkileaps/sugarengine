import { BaseStorageProvider } from './StorageProvider';
import { GameSaveData, SaveSlotMetadata, SaveResult, StorageCapabilities } from './types';

const DEFAULT_STORAGE_PREFIX = 'sugarengine_save_';

/**
 * Browser localStorage implementation.
 * Best for web builds and development.
 */
export class LocalStorageProvider extends BaseStorageProvider {
  private readonly namespace: string;
  private readonly storagePrefix: string;

  constructor(namespace?: string) {
    super();
    this.namespace = typeof namespace === 'string' ? namespace.trim() : '';
    this.storagePrefix = this.namespace
      ? `${DEFAULT_STORAGE_PREFIX}${this.namespace}_`
      : DEFAULT_STORAGE_PREFIX;
  }

  /**
   * Copy legacy unscoped save keys into this provider's namespace on first run.
   * Legacy keys: sugarengine_save_<slotId>
   * Namespaced keys: sugarengine_save_<namespace>_<slotId>
   */
  async migrateLegacySaves(slotIds: string[]): Promise<void> {
    if (!this.namespace) return;

    try {
      const markerKey = `${this.storagePrefix}legacy_migrated_v1`;
      if (localStorage.getItem(markerKey) === '1') {
        return;
      }

      let migratedCount = 0;
      for (const slotId of slotIds) {
        const namespacedKey = this.getKey(slotId);
        if (localStorage.getItem(namespacedKey) !== null) {
          continue;
        }

        const legacyKey = `${DEFAULT_STORAGE_PREFIX}${slotId}`;
        const legacyData = localStorage.getItem(legacyKey);
        if (legacyData === null) {
          continue;
        }

        localStorage.setItem(namespacedKey, legacyData);
        migratedCount += 1;
      }

      localStorage.setItem(markerKey, '1');
      if (migratedCount > 0) {
        console.info(`[SaveMigration] Migrated ${migratedCount} legacy localStorage slot(s) into namespace '${this.namespace}'.`);
      }
    } catch (err) {
      console.warn('[SaveMigration] Failed localStorage migration:', err);
    }
  }

  getCapabilities(): StorageCapabilities {
    return {
      supportsMultipleSlots: true,
      maxSlots: 4, // autosave + 3 manual slots
      supportsAutoSave: true,
      requiresAuth: false
    };
  }

  async init(): Promise<SaveResult> {
    try {
      const testKey = '__sugarengine_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return { success: true };
    } catch (e) {
      return {
        success: false,
        error: 'localStorage is not available. Saves will not persist.'
      };
    }
  }

  async save(slotId: string, data: GameSaveData): Promise<SaveResult> {
    try {
      const key = this.getKey(slotId);
      const json = this.serialize(data);
      localStorage.setItem(key, json);
      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, error: `Failed to save: ${error}` };
    }
  }

  async load(slotId: string): Promise<GameSaveData | null> {
    try {
      const key = this.getKey(slotId);
      const json = localStorage.getItem(key);
      if (!json) return null;
      return this.deserialize(json);
    } catch (e) {
      console.error('Failed to load save:', e);
      return null;
    }
  }

  async delete(slotId: string): Promise<SaveResult> {
    try {
      const key = this.getKey(slotId);
      localStorage.removeItem(key);
      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, error: `Failed to delete: ${error}` };
    }
  }

  async exists(slotId: string): Promise<boolean> {
    const key = this.getKey(slotId);
    return localStorage.getItem(key) !== null;
  }

  async listSlots(): Promise<SaveSlotMetadata[]> {
    const slots: SaveSlotMetadata[] = [];

    // Check all known slot IDs (must match SaveLoadScreen's slotIds)
    const slotIds = ['autosave', 'slot1', 'slot2', 'slot3'];

    for (const slotId of slotIds) {
      const metadata = await this.getSlotMetadata(slotId);
      if (metadata) {
        slots.push(metadata);
      }
    }

    return slots;
  }

  async getSlotMetadata(slotId: string): Promise<SaveSlotMetadata | null> {
    const data = await this.load(slotId);
    if (!data) return null;
    return this.extractMetadata(slotId, data);
  }

  private getKey(slotId: string): string {
    return `${this.storagePrefix}${slotId}`;
  }
}
