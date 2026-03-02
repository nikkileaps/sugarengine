import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SaveManager } from './SaveManager';
import type {
  GameSaveData,
  SaveResult,
  SaveSlotMetadata,
  StorageCapabilities,
} from './types';
import type { StorageProvider } from './StorageProvider';
import { SAVE_DATA_VERSION } from './types';

class InMemoryStorageProvider implements StorageProvider {
  private slots = new Map<string, GameSaveData>();

  getCapabilities(): StorageCapabilities {
    return {
      supportsMultipleSlots: true,
      maxSlots: 10,
      supportsAutoSave: true,
      requiresAuth: false,
    };
  }

  async init(): Promise<SaveResult> {
    return { success: true };
  }

  async save(slotId: string, data: GameSaveData): Promise<SaveResult> {
    this.slots.set(slotId, structuredClone(data));
    return { success: true };
  }

  async load(slotId: string): Promise<GameSaveData | null> {
    const data = this.slots.get(slotId);
    return data ? structuredClone(data) : null;
  }

  async delete(slotId: string): Promise<SaveResult> {
    this.slots.delete(slotId);
    return { success: true };
  }

  async exists(slotId: string): Promise<boolean> {
    return this.slots.has(slotId);
  }

  async listSlots(): Promise<SaveSlotMetadata[]> {
    const slots: SaveSlotMetadata[] = [];
    for (const [slotId, data] of this.slots) {
      slots.push({
        slotId,
        savedAt: data.savedAt,
        playTime: data.playTime,
        playerRegion: data.player.currentRegion,
        questCount: data.quests.active.length + data.quests.completed.length,
        exists: true,
      });
    }
    return slots;
  }

  async getSlotMetadata(slotId: string): Promise<SaveSlotMetadata | null> {
    const data = this.slots.get(slotId);
    if (!data) return null;
    return {
      slotId,
      savedAt: data.savedAt,
      playTime: data.playTime,
      playerRegion: data.player.currentRegion,
      questCount: data.quests.active.length + data.quests.completed.length,
      exists: true,
    };
  }

  getRaw(slotId: string): GameSaveData | undefined {
    return this.slots.get(slotId);
  }
}

describe('SaveManager plugin persistence', () => {
  let saveManager: SaveManager;
  let provider: InMemoryStorageProvider;

  const engine = {
    getPlayerPosition: () => ({ x: 1, y: 2, z: 3 }),
    getCurrentRegion: () => 'start-region',
    loadRegion: vi.fn(async () => {}),
  };

  const questManager = {
    getActiveQuests: () => [{
      questId: 'q1',
      status: 'active',
      currentStageId: 'stage1',
      objectiveProgress: new Map<string, unknown>(),
      startedAt: 1,
    }],
    getTrackedQuestId: () => null,
    getCompletedQuestIds: () => ['q0'],
    setTrackedQuest: vi.fn(),
    clearAllQuests: vi.fn(),
    markQuestCompleted: vi.fn(),
    restoreQuestState: vi.fn(async () => {}),
  };

  const inventoryManager = {
    getItems: () => [{ itemId: 'apple', quantity: 2 }],
    clear: vi.fn(),
    addItem: vi.fn(() => true),
  };

  const casterManager = {
    getCasterState: () => ({ battery: 80, resonance: 20 }),
    loadCasterState: vi.fn(),
  };

  beforeEach(async () => {
    provider = new InMemoryStorageProvider();
    saveManager = new SaveManager({ autoSaveEnabled: false });
    saveManager.setProvider(provider);
    await saveManager.init();
  });

  it('stores plugin state in save data when bridge is configured', async () => {
    const pluginBridge = {
      serializePluginState: () => ({ sugaragent: { memoryCount: 5 } }),
      loadPluginState: vi.fn(),
    };

    saveManager.setGameSystems(
      engine,
      questManager,
      inventoryManager,
      casterManager,
      pluginBridge,
    );

    const result = await saveManager.save('slot-plugins');
    expect(result.success).toBe(true);

    const stored = provider.getRaw('slot-plugins');
    expect(stored?.version).toBe(SAVE_DATA_VERSION);
    expect(stored?.plugins).toEqual({ sugaragent: { memoryCount: 5 } });
  });

  it('loads plugin state when present and stays safe when absent', async () => {
    const loadPluginState = vi.fn();
    const pluginBridge = {
      serializePluginState: () => ({}),
      loadPluginState,
    };

    saveManager.setGameSystems(
      engine,
      questManager,
      inventoryManager,
      casterManager,
      pluginBridge,
    );

    await provider.save('slot-with-plugins', {
      version: SAVE_DATA_VERSION,
      savedAt: Date.now(),
      playTime: 123,
      player: {
        position: { x: 1, y: 2, z: 3 },
        currentRegion: 'start-region',
      },
      quests: {
        active: [],
        completed: [],
        trackedQuestId: null,
      },
      inventory: [],
      world: { collectedPickups: {} },
      plugins: { sugaragent: { memoryCount: 2 } },
    });

    await provider.save('slot-without-plugins', {
      version: SAVE_DATA_VERSION,
      savedAt: Date.now(),
      playTime: 456,
      player: {
        position: { x: 1, y: 2, z: 3 },
        currentRegion: 'start-region',
      },
      quests: {
        active: [],
        completed: [],
        trackedQuestId: null,
      },
      inventory: [],
      world: { collectedPickups: {} },
    });

    const withPlugins = await saveManager.load('slot-with-plugins');
    expect(withPlugins.success).toBe(true);
    expect(loadPluginState).toHaveBeenCalledWith({ sugaragent: { memoryCount: 2 } });

    const withoutPlugins = await saveManager.load('slot-without-plugins');
    expect(withoutPlugins.success).toBe(true);
    expect(loadPluginState).toHaveBeenLastCalledWith(undefined);
  });

  it('loads safely when save contains plugin state but no plugin bridge is configured', async () => {
    saveManager.setGameSystems(
      engine,
      questManager,
      inventoryManager,
      casterManager,
    );

    await provider.save('slot-plugin-disabled', {
      version: SAVE_DATA_VERSION,
      savedAt: Date.now(),
      playTime: 999,
      player: {
        position: { x: 1, y: 2, z: 3 },
        currentRegion: 'start-region',
      },
      quests: {
        active: [],
        completed: [],
        trackedQuestId: null,
      },
      inventory: [],
      world: { collectedPickups: {} },
      plugins: { sugaragent: { memoryCount: 42 } },
    });

    const result = await saveManager.load('slot-plugin-disabled');
    expect(result.success).toBe(true);
  });
});
