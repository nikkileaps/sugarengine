import { describe, it, expect } from 'vitest';
import {
  getRegionWorldOffset,
  localToWorld,
  worldToLocal,
  worldToGrid,
  gridKey,
  parseGridKey,
  getGridCellsInRange,
  getEpisodeStartPosition
} from './gridUtils';
import type { RegionStreamingConfig, RegionData, GridPosition, Vec3 } from '../loaders';

const DEFAULT_CONFIG: RegionStreamingConfig = {
  regionSize: 64,
  streamingDistance: 1
};

describe('gridUtils', () => {
  describe('getRegionWorldOffset', () => {
    it('returns origin-centered offset for grid (0,0)', () => {
      const offset = getRegionWorldOffset({ x: 0, z: 0 }, DEFAULT_CONFIG);
      // Grid (0,0) spans from (-32, 0, -32) to (32, 0, 32)
      expect(offset).toEqual({ x: -32, y: 0, z: -32 });
    });

    it('returns correct offset for grid (1,0)', () => {
      const offset = getRegionWorldOffset({ x: 1, z: 0 }, DEFAULT_CONFIG);
      // Grid (1,0) spans from (32, 0, -32) to (96, 0, 32)
      expect(offset).toEqual({ x: 32, y: 0, z: -32 });
    });

    it('returns correct offset for grid (-1,0)', () => {
      const offset = getRegionWorldOffset({ x: -1, z: 0 }, DEFAULT_CONFIG);
      // Grid (-1,0) spans from (-96, 0, -32) to (-32, 0, 32)
      expect(offset).toEqual({ x: -96, y: 0, z: -32 });
    });

    it('returns correct offset for grid (0,1)', () => {
      const offset = getRegionWorldOffset({ x: 0, z: 1 }, DEFAULT_CONFIG);
      expect(offset).toEqual({ x: -32, y: 0, z: 32 });
    });

    it('returns correct offset for grid (-1,-1)', () => {
      const offset = getRegionWorldOffset({ x: -1, z: -1 }, DEFAULT_CONFIG);
      expect(offset).toEqual({ x: -96, y: 0, z: -96 });
    });

    it('works with different region sizes', () => {
      const smallConfig: RegionStreamingConfig = { regionSize: 32, streamingDistance: 1 };
      const offset = getRegionWorldOffset({ x: 1, z: 1 }, smallConfig);
      expect(offset).toEqual({ x: 16, y: 0, z: 16 });
    });
  });

  describe('localToWorld', () => {
    it('converts local origin to world position for grid (0,0)', () => {
      const world = localToWorld({ x: 0, y: 0, z: 0 }, { x: 0, z: 0 }, DEFAULT_CONFIG);
      expect(world).toEqual({ x: -32, y: 0, z: -32 });
    });

    it('converts local center to world origin for grid (0,0)', () => {
      const world = localToWorld({ x: 32, y: 0, z: 32 }, { x: 0, z: 0 }, DEFAULT_CONFIG);
      expect(world).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('preserves Y coordinate', () => {
      const world = localToWorld({ x: 0, y: 5, z: 0 }, { x: 0, z: 0 }, DEFAULT_CONFIG);
      expect(world.y).toBe(5);
    });

    it('converts position in grid (1,0)', () => {
      const world = localToWorld({ x: 10, y: 0, z: 10 }, { x: 1, z: 0 }, DEFAULT_CONFIG);
      expect(world).toEqual({ x: 42, y: 0, z: -22 });
    });
  });

  describe('worldToLocal', () => {
    it('converts world origin to local for grid (0,0)', () => {
      const local = worldToLocal({ x: 0, y: 0, z: 0 }, { x: 0, z: 0 }, DEFAULT_CONFIG);
      expect(local).toEqual({ x: 32, y: 0, z: 32 });
    });

    it('is inverse of localToWorld', () => {
      const gridPos: GridPosition = { x: 1, z: -1 };
      const localPos: Vec3 = { x: 15, y: 3, z: 25 };

      const world = localToWorld(localPos, gridPos, DEFAULT_CONFIG);
      const backToLocal = worldToLocal(world, gridPos, DEFAULT_CONFIG);

      expect(backToLocal.x).toBeCloseTo(localPos.x);
      expect(backToLocal.y).toBeCloseTo(localPos.y);
      expect(backToLocal.z).toBeCloseTo(localPos.z);
    });
  });

  describe('worldToGrid', () => {
    it('returns (0,0) for world origin', () => {
      const grid = worldToGrid({ x: 0, y: 0, z: 0 }, DEFAULT_CONFIG);
      expect(grid).toEqual({ x: 0, z: 0 });
    });

    it('returns (0,0) for positions within grid (0,0)', () => {
      expect(worldToGrid({ x: 31, y: 0, z: 31 }, DEFAULT_CONFIG)).toEqual({ x: 0, z: 0 });
      expect(worldToGrid({ x: -31, y: 0, z: -31 }, DEFAULT_CONFIG)).toEqual({ x: 0, z: 0 });
    });

    it('returns (1,0) for positions in grid (1,0)', () => {
      expect(worldToGrid({ x: 33, y: 0, z: 0 }, DEFAULT_CONFIG)).toEqual({ x: 1, z: 0 });
      expect(worldToGrid({ x: 50, y: 0, z: 0 }, DEFAULT_CONFIG)).toEqual({ x: 1, z: 0 });
    });

    it('returns (-1,0) for positions in grid (-1,0)', () => {
      expect(worldToGrid({ x: -33, y: 0, z: 0 }, DEFAULT_CONFIG)).toEqual({ x: -1, z: 0 });
      expect(worldToGrid({ x: -50, y: 0, z: 0 }, DEFAULT_CONFIG)).toEqual({ x: -1, z: 0 });
    });

    it('handles boundaries correctly', () => {
      // At exactly x=32, should be in grid (1,0)
      expect(worldToGrid({ x: 32, y: 0, z: 0 }, DEFAULT_CONFIG)).toEqual({ x: 1, z: 0 });
      // At exactly x=-32, should still be in grid (0,0)
      expect(worldToGrid({ x: -32, y: 0, z: 0 }, DEFAULT_CONFIG)).toEqual({ x: 0, z: 0 });
    });
  });

  describe('gridKey and parseGridKey', () => {
    it('creates correct key string', () => {
      expect(gridKey({ x: 0, z: 0 })).toBe('0,0');
      expect(gridKey({ x: 1, z: -2 })).toBe('1,-2');
      expect(gridKey({ x: -5, z: 10 })).toBe('-5,10');
    });

    it('parses key string back to coordinates', () => {
      expect(parseGridKey('0,0')).toEqual({ x: 0, z: 0 });
      expect(parseGridKey('1,-2')).toEqual({ x: 1, z: -2 });
      expect(parseGridKey('-5,10')).toEqual({ x: -5, z: 10 });
    });

    it('roundtrips correctly', () => {
      const original: GridPosition = { x: -3, z: 7 };
      expect(parseGridKey(gridKey(original))).toEqual(original);
    });
  });

  describe('getGridCellsInRange', () => {
    it('returns single cell for distance 0', () => {
      const cells = getGridCellsInRange({ x: 0, z: 0 }, 0);
      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ x: 0, z: 0 });
    });

    it('returns 9 cells for distance 1', () => {
      const cells = getGridCellsInRange({ x: 0, z: 0 }, 1);
      expect(cells).toHaveLength(9); // 3x3 grid
    });

    it('returns 25 cells for distance 2', () => {
      const cells = getGridCellsInRange({ x: 0, z: 0 }, 2);
      expect(cells).toHaveLength(25); // 5x5 grid
    });

    it('centers around the given cell', () => {
      const cells = getGridCellsInRange({ x: 5, z: -3 }, 1);
      expect(cells).toContainEqual({ x: 5, z: -3 }); // center
      expect(cells).toContainEqual({ x: 4, z: -3 }); // left
      expect(cells).toContainEqual({ x: 6, z: -3 }); // right
      expect(cells).toContainEqual({ x: 5, z: -2 }); // up
      expect(cells).toContainEqual({ x: 5, z: -4 }); // down
    });
  });

  describe('getEpisodeStartPosition', () => {
    it('calculates correct world position for player spawn', () => {
      const region: RegionData = {
        id: 'test-region',
        name: 'Test Region',
        geometry: { path: 'test' },
        gridPosition: { x: 0, z: 0 },
        playerSpawn: { x: 32, y: 0, z: 32 }, // Center of region
        npcs: [],
        triggers: []
      };

      const pos = getEpisodeStartPosition(region, DEFAULT_CONFIG);
      // Center of grid (0,0) should be world origin
      expect(pos).toEqual({ x: 0, y: 0, z: 0 });
    });

    it('calculates correct position for non-zero grid', () => {
      const region: RegionData = {
        id: 'test-region',
        name: 'Test Region',
        geometry: { path: 'test' },
        gridPosition: { x: 1, z: 0 },
        playerSpawn: { x: 0, y: 0, z: 0 }, // Corner of region
        npcs: [],
        triggers: []
      };

      const pos = getEpisodeStartPosition(region, DEFAULT_CONFIG);
      // Grid (1,0) offset is (32, 0, -32), plus local (0,0,0)
      expect(pos).toEqual({ x: 32, y: 0, z: -32 });
    });

    it('preserves Y coordinate from player spawn', () => {
      const region: RegionData = {
        id: 'test-region',
        name: 'Test Region',
        geometry: { path: 'test' },
        gridPosition: { x: 0, z: 0 },
        playerSpawn: { x: 10, y: 5, z: 10 },
        npcs: [],
        triggers: []
      };

      const pos = getEpisodeStartPosition(region, DEFAULT_CONFIG);
      expect(pos.y).toBe(5);
    });
  });
});
