import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegionStreamingSystem, StreamingCallbacks } from './RegionStreamingSystem';
import type { RegionStreamingConfig, RegionData, Vec3 } from '../loaders';

const DEFAULT_CONFIG: RegionStreamingConfig = {
  regionSize: 64,
  streamingDistance: 1
};

function createMockRegion(id: string, gridX: number, gridZ: number): RegionData {
  return {
    id,
    name: `Region ${id}`,
    geometry: { path: `path-${id}` },
    gridPosition: { x: gridX, z: gridZ },
    playerSpawn: { x: 32, y: 0, z: 32 },
    npcs: [],
    triggers: []
  };
}

interface MockCallbacks extends StreamingCallbacks {
  loadedRegions: Set<string>;
  activeRegion: string | null;
  _playerPos: Vec3 | null;
  setPlayerPos: (pos: Vec3 | null) => void;
}

function createMockCallbacks(): MockCallbacks {
  const state = {
    loadedRegions: new Set<string>(),
    activeRegion: null as string | null,
    _playerPos: null as Vec3 | null
  };

  const callbacks: MockCallbacks = {
    loadedRegions: state.loadedRegions,
    activeRegion: state.activeRegion,
    _playerPos: state._playerPos,
    setPlayerPos: (pos: Vec3 | null) => {
      state._playerPos = pos;
    },
    loadRegion: vi.fn(async (regionId: string) => {
      state.loadedRegions.add(regionId);
    }),
    unloadRegion: vi.fn((regionId: string) => {
      state.loadedRegions.delete(regionId);
    }),
    setActiveRegion: vi.fn((regionId: string) => {
      state.activeRegion = regionId;
    }),
    isRegionLoaded: vi.fn((regionId: string) => state.loadedRegions.has(regionId)),
    getPlayerPosition: vi.fn(() => state._playerPos)
  };

  return callbacks;
}

describe('RegionStreamingSystem', () => {
  let system: RegionStreamingSystem;
  let callbacks: MockCallbacks;

  beforeEach(() => {
    callbacks = createMockCallbacks();
    system = new RegionStreamingSystem(DEFAULT_CONFIG, callbacks);
  });

  describe('registerRegion', () => {
    it('registers a region by grid position', () => {
      const region = createMockRegion('r1', 0, 0);
      system.registerRegion(region);

      expect(system.getRegionAtGrid({ x: 0, z: 0 })).toBe(region);
      expect(system.getRegionById('r1')).toBe(region);
    });

    it('allows multiple regions at different positions', () => {
      const r1 = createMockRegion('r1', 0, 0);
      const r2 = createMockRegion('r2', 1, 0);
      const r3 = createMockRegion('r3', 0, 1);

      system.registerRegion(r1);
      system.registerRegion(r2);
      system.registerRegion(r3);

      expect(system.getRegionAtGrid({ x: 0, z: 0 })).toBe(r1);
      expect(system.getRegionAtGrid({ x: 1, z: 0 })).toBe(r2);
      expect(system.getRegionAtGrid({ x: 0, z: 1 })).toBe(r3);
    });
  });

  describe('update', () => {
    it('does nothing when player position is null', async () => {
      callbacks.setPlayerPos(null);
      system.registerRegion(createMockRegion('r1', 0, 0));

      await system.update();

      expect(callbacks.loadRegion).not.toHaveBeenCalled();
    });

    it('loads region when player is in its grid cell', async () => {
      const region = createMockRegion('r1', 0, 0);
      system.registerRegion(region);
      callbacks.setPlayerPos({ x: 0, y: 0, z: 0 }); // Center of grid (0,0)

      await system.update();

      expect(callbacks.loadRegion).toHaveBeenCalledWith('r1');
    });

    it('loads neighboring regions within streaming distance', async () => {
      // Register 3x3 grid of regions
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          system.registerRegion(createMockRegion(`r_${x}_${z}`, x, z));
        }
      }

      callbacks.setPlayerPos({ x: 0, y: 0, z: 0 }); // Center of grid (0,0)

      await system.update();

      // With streamingDistance=1, should load all 9 regions
      expect(callbacks.loadRegion).toHaveBeenCalledTimes(9);
    });

    it('only loads regions that exist (sparse grid)', async () => {
      // Only register center region
      system.registerRegion(createMockRegion('center', 0, 0));

      callbacks.setPlayerPos({ x: 0, y: 0, z: 0 });

      await system.update();

      // Only 1 region exists, only 1 should be loaded
      expect(callbacks.loadRegion).toHaveBeenCalledTimes(1);
      expect(callbacks.loadRegion).toHaveBeenCalledWith('center');
    });

    it('unloads regions when player moves out of range', async () => {
      const r1 = createMockRegion('r1', 0, 0);
      const r2 = createMockRegion('r2', 5, 0); // Far away

      system.registerRegion(r1);
      system.registerRegion(r2);

      // First, player at r1
      callbacks.setPlayerPos({ x: 0, y: 0, z: 0 });
      await system.update();

      expect(callbacks.loadRegion).toHaveBeenCalledWith('r1');
      expect(callbacks.loadRegion).not.toHaveBeenCalledWith('r2');

      // Now player moves to r2
      callbacks.setPlayerPos({ x: 5 * 64, y: 0, z: 0 }); // Grid (5, 0)
      await system.update();

      expect(callbacks.unloadRegion).toHaveBeenCalledWith('r1');
      expect(callbacks.loadRegion).toHaveBeenCalledWith('r2');
    });

    it('sets active region to the one player is in', async () => {
      const region = createMockRegion('r1', 0, 0);
      system.registerRegion(region);
      callbacks.setPlayerPos({ x: 0, y: 0, z: 0 });

      await system.update();

      expect(callbacks.setActiveRegion).toHaveBeenCalledWith('r1');
    });

    it('skips update if player has not moved to a new grid cell', async () => {
      const region = createMockRegion('r1', 0, 0);
      system.registerRegion(region);
      callbacks.setPlayerPos({ x: 0, y: 0, z: 0 });

      await system.update();
      expect(callbacks.loadRegion).toHaveBeenCalledTimes(1);

      // Move slightly but stay in same cell
      callbacks.setPlayerPos({ x: 10, y: 0, z: 10 });
      await system.update();

      // Should not trigger another load
      expect(callbacks.loadRegion).toHaveBeenCalledTimes(1);
    });

    it('does not reload regions that are still in range', async () => {
      // Test with two adjacent regions
      const r1 = createMockRegion('r1', 0, 0);
      const r2 = createMockRegion('r2', 1, 0);
      system.registerRegion(r1);
      system.registerRegion(r2);
      callbacks.setPlayerPos({ x: 0, y: 0, z: 0 });

      await system.update();
      // Both r1 and r2 loaded (r2 is within streamingDistance=1)
      expect(callbacks.loadRegion).toHaveBeenCalledWith('r1');
      expect(callbacks.loadRegion).toHaveBeenCalledWith('r2');

      // Move to r2 area - r1 is still in range
      callbacks.setPlayerPos({ x: 64, y: 0, z: 0 }); // Grid (1, 0)
      await system.update();

      // Neither should be reloaded
      const r1Calls = (callbacks.loadRegion as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'r1'
      );
      const r2Calls = (callbacks.loadRegion as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call: unknown[]) => call[0] === 'r2'
      );
      expect(r1Calls.length).toBe(1);
      expect(r2Calls.length).toBe(1);
    });
  });

  describe('forceLoadRegion', () => {
    it('loads a region regardless of player position', async () => {
      const region = createMockRegion('r1', 10, 10);
      system.registerRegion(region);
      callbacks.setPlayerPos({ x: 0, y: 0, z: 0 }); // Far from region

      await system.forceLoadRegion('r1');

      expect(callbacks.loadRegion).toHaveBeenCalledWith('r1');
    });

    it('does not reload if already loaded', async () => {
      const region = createMockRegion('r1', 0, 0);
      system.registerRegion(region);
      callbacks.loadedRegions.add('r1');

      await system.forceLoadRegion('r1');

      expect(callbacks.loadRegion).not.toHaveBeenCalled();
    });
  });

  describe('getRegionsInRange', () => {
    it('returns regions within streaming distance of a position', () => {
      const r1 = createMockRegion('r1', 0, 0);
      const r2 = createMockRegion('r2', 1, 0);
      const r3 = createMockRegion('r3', 10, 0); // Out of range

      system.registerRegion(r1);
      system.registerRegion(r2);
      system.registerRegion(r3);

      const inRange = system.getRegionsInRange({ x: 0, y: 0, z: 0 });

      expect(inRange).toContain(r1);
      expect(inRange).toContain(r2);
      expect(inRange).not.toContain(r3);
    });
  });

  describe('clear', () => {
    it('removes all registered regions', () => {
      system.registerRegion(createMockRegion('r1', 0, 0));
      system.registerRegion(createMockRegion('r2', 1, 0));

      system.clear();

      expect(system.getRegionById('r1')).toBeUndefined();
      expect(system.getRegionById('r2')).toBeUndefined();
      expect(system.getRegionAtGrid({ x: 0, z: 0 })).toBeUndefined();
    });
  });
});
