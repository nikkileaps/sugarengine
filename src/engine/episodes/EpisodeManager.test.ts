import { describe, it, expect, beforeEach } from 'vitest';
import { EpisodeManager } from './EpisodeManager';
import type { RegionData, RegionStreamingConfig } from '../loaders';

const DEFAULT_CONFIG: RegionStreamingConfig = {
  regionSize: 64,
  streamingDistance: 1
};

function createMockRegion(id: string, gridX: number, gridZ: number, spawnX = 32, spawnZ = 32): RegionData {
  return {
    id,
    name: `Region ${id}`,
    geometry: { path: `path-${id}` },
    gridPosition: { x: gridX, z: gridZ },
    playerSpawn: { x: spawnX, y: 0, z: spawnZ },
    npcs: [],
    triggers: []
  };
}

describe('EpisodeManager', () => {
  let manager: EpisodeManager;
  let regions: Map<string, RegionData>;

  beforeEach(async () => {
    const projectData = {
      meta: { gameId: 'test-game', name: 'Test Game' },
      seasons: [
        { id: 'season1', name: 'Season 1', order: 1 }
      ],
      episodes: [
        { id: 'ep1', seasonId: 'season1', name: 'Episode 1', order: 1, startRegion: 'region1' },
        { id: 'ep2', seasonId: 'season1', name: 'Episode 2', order: 2, startRegion: 'region2' },
        { id: 'ep3', seasonId: 'season1', name: 'Episode 3', order: 3, startRegion: '' }
      ],
      quests: [],
      dialogues: []
    };

    manager = new EpisodeManager({
      developmentMode: true,
      projectData
    });
    await manager.initialize();

    regions = new Map();
    regions.set('region1', createMockRegion('region1', 0, 0));
    regions.set('region2', createMockRegion('region2', 1, 0));
  });

  describe('getEpisodeStartInfo', () => {
    it('returns start info for valid episode', () => {
      const startInfo = manager.getEpisodeStartInfo('ep1', regions, DEFAULT_CONFIG);

      expect(startInfo).not.toBeNull();
      expect(startInfo!.episodeId).toBe('ep1');
      expect(startInfo!.regionId).toBe('region1');
      // Center of grid (0,0) region with spawn at (32, 0, 32)
      // World offset is (-32, 0, -32), so world position is (0, 0, 0)
      expect(startInfo!.playerWorldPosition).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('calculates correct world position for non-zero grid', () => {
      const startInfo = manager.getEpisodeStartInfo('ep2', regions, DEFAULT_CONFIG);

      expect(startInfo).not.toBeNull();
      expect(startInfo!.regionId).toBe('region2');
      // Grid (1,0) has offset (32, 0, -32), spawn at (32, 0, 32)
      // World position: (32 + 32, 0, -32 + 32) = (64, 0, 0)
      expect(startInfo!.playerWorldPosition).toEqual({ x: 64, y: 0, z: 0 });
    });

    it('returns null for episode with no startRegion', () => {
      const startInfo = manager.getEpisodeStartInfo('ep3', regions, DEFAULT_CONFIG);
      expect(startInfo).toBeNull();
    });

    it('returns null for nonexistent episode', () => {
      const startInfo = manager.getEpisodeStartInfo('nonexistent', regions, DEFAULT_CONFIG);
      expect(startInfo).toBeNull();
    });

    it('returns null for episode with missing region', () => {
      const emptyRegions = new Map<string, RegionData>();
      const startInfo = manager.getEpisodeStartInfo('ep1', emptyRegions, DEFAULT_CONFIG);
      expect(startInfo).toBeNull();
    });
  });

  describe('getEpisodeRegions', () => {
    it('returns start region for valid episode', () => {
      const regionIds = manager.getEpisodeRegions('ep1');
      expect(regionIds).toContain('region1');
    });

    it('returns empty array for episode with no regions', () => {
      const regionIds = manager.getEpisodeRegions('ep3');
      expect(regionIds).toEqual([]);
    });

    it('returns empty array for nonexistent episode', () => {
      const regionIds = manager.getEpisodeRegions('nonexistent');
      expect(regionIds).toEqual([]);
    });
  });
});
