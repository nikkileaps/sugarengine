import { BaseStorageProvider } from './StorageProvider';
import { GameSaveData, SaveSlotMetadata, SaveResult, StorageCapabilities } from './types';

const SAVE_DIRECTORY = 'saves';
const MAX_SLOTS = 20;

// Type definitions for Tauri APIs (to avoid compile-time dependency)
type TauriPathAPI = { appDataDir: () => Promise<string> };
type TauriFsAPI = {
  mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  writeTextFile: (path: string, content: string) => Promise<void>;
  readTextFile: (path: string) => Promise<string>;
  remove: (path: string) => Promise<void>;
  readDir: (path: string) => Promise<{ name?: string }[]>;
};

/**
 * Tauri filesystem implementation for native apps.
 * Uses Tauri's plugin-fs for file operations.
 */
export class TauriFileProvider extends BaseStorageProvider {
  private initialized = false;
  private basePath: string = '';

  getCapabilities(): StorageCapabilities {
    return {
      supportsMultipleSlots: true,
      maxSlots: MAX_SLOTS,
      supportsAutoSave: true,
      requiresAuth: false
    };
  }

  async init(): Promise<SaveResult> {
    try {
      // Dynamic import to avoid errors in browser context
      const pathApi = await import('@tauri-apps/api/path') as unknown as TauriPathAPI;
      const fsApi = await import('@tauri-apps/plugin-fs' as string) as unknown as TauriFsAPI;

      // Get app data directory
      const appData = await pathApi.appDataDir();
      this.basePath = `${appData}${SAVE_DIRECTORY}`;

      // Create saves directory if it doesn't exist
      const dirExists = await fsApi.exists(this.basePath);
      if (!dirExists) {
        await fsApi.mkdir(this.basePath, { recursive: true });
      }

      this.initialized = true;
      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      return {
        success: false,
        error: `Failed to initialize Tauri storage: ${error}`
      };
    }
  }

  async save(slotId: string, data: GameSaveData): Promise<SaveResult> {
    if (!this.initialized) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      const { writeTextFile } = await import('@tauri-apps/plugin-fs' as string);
      const filePath = this.getFilePath(slotId);
      const json = this.serialize(data);
      await writeTextFile(filePath, json);
      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, error: `Failed to save: ${error}` };
    }
  }

  async load(slotId: string): Promise<GameSaveData | null> {
    if (!this.initialized) {
      console.error('Storage not initialized');
      return null;
    }

    try {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs' as string);
      const filePath = this.getFilePath(slotId);

      const fileExists = await exists(filePath);
      if (!fileExists) return null;

      const json = await readTextFile(filePath);
      return this.deserialize(json);
    } catch (e) {
      console.error('Failed to load save:', e);
      return null;
    }
  }

  async delete(slotId: string): Promise<SaveResult> {
    if (!this.initialized) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      const { remove, exists } = await import('@tauri-apps/plugin-fs' as string);
      const filePath = this.getFilePath(slotId);

      const fileExists = await exists(filePath);
      if (fileExists) {
        await remove(filePath);
      }

      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, error: `Failed to delete: ${error}` };
    }
  }

  async exists(slotId: string): Promise<boolean> {
    if (!this.initialized) return false;

    try {
      const { exists } = await import('@tauri-apps/plugin-fs' as string);
      const filePath = this.getFilePath(slotId);
      return await exists(filePath);
    } catch {
      return false;
    }
  }

  async listSlots(): Promise<SaveSlotMetadata[]> {
    if (!this.initialized) return [];

    try {
      const { readDir } = await import('@tauri-apps/plugin-fs' as string);
      const entries = await readDir(this.basePath);

      const slots: SaveSlotMetadata[] = [];

      for (const entry of entries) {
        if (entry.name?.endsWith('.json')) {
          const slotId = entry.name.replace('.json', '');
          const metadata = await this.getSlotMetadata(slotId);
          if (metadata) {
            slots.push(metadata);
          }
        }
      }

      // Sort by savedAt descending (most recent first)
      slots.sort((a, b) => b.savedAt - a.savedAt);

      return slots;
    } catch (e) {
      console.error('Failed to list slots:', e);
      return [];
    }
  }

  async getSlotMetadata(slotId: string): Promise<SaveSlotMetadata | null> {
    const data = await this.load(slotId);
    if (!data) return null;
    return this.extractMetadata(slotId, data);
  }

  private getFilePath(slotId: string): string {
    return `${this.basePath}/${slotId}.json`;
  }
}
