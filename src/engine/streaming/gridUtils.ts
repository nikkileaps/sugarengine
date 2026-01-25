import type { Vec3, GridPosition, RegionStreamingConfig, RegionData } from '../loaders';

/**
 * Calculate the world offset for a region based on its grid position.
 * Grid (0,0) is centered at world origin.
 *
 * @param gridPosition - The region's grid cell coordinates
 * @param config - Streaming configuration with regionSize
 * @returns World offset (bottom-left corner of the region)
 */
export function getRegionWorldOffset(
  gridPosition: GridPosition,
  config: RegionStreamingConfig
): Vec3 {
  const halfSize = config.regionSize / 2;
  return {
    x: (gridPosition.x * config.regionSize) - halfSize,
    y: 0, // Regions are 2D grid, Y is always 0
    z: (gridPosition.z * config.regionSize) - halfSize
  };
}

/**
 * Convert local coordinates within a region to world coordinates.
 *
 * @param localPos - Position in local region coordinates (0 to regionSize)
 * @param gridPosition - The region's grid cell coordinates
 * @param config - Streaming configuration with regionSize
 * @returns World coordinates
 */
export function localToWorld(
  localPos: Vec3,
  gridPosition: GridPosition,
  config: RegionStreamingConfig
): Vec3 {
  const offset = getRegionWorldOffset(gridPosition, config);
  return {
    x: offset.x + localPos.x,
    y: localPos.y, // Y is passed through unchanged
    z: offset.z + localPos.z
  };
}

/**
 * Convert world coordinates to local coordinates within a region.
 *
 * @param worldPos - Position in world coordinates
 * @param gridPosition - The region's grid cell coordinates
 * @param config - Streaming configuration with regionSize
 * @returns Local region coordinates
 */
export function worldToLocal(
  worldPos: Vec3,
  gridPosition: GridPosition,
  config: RegionStreamingConfig
): Vec3 {
  const offset = getRegionWorldOffset(gridPosition, config);
  return {
    x: worldPos.x - offset.x,
    y: worldPos.y, // Y is passed through unchanged
    z: worldPos.z - offset.z
  };
}

/**
 * Determine which grid cell a world position falls into.
 *
 * @param worldPos - Position in world coordinates
 * @param config - Streaming configuration with regionSize
 * @returns Grid cell coordinates
 */
export function worldToGrid(
  worldPos: Vec3,
  config: RegionStreamingConfig
): GridPosition {
  const halfSize = config.regionSize / 2;
  return {
    x: Math.floor((worldPos.x + halfSize) / config.regionSize),
    z: Math.floor((worldPos.z + halfSize) / config.regionSize)
  };
}

/**
 * Get grid cell key string for use in Maps.
 *
 * @param gridPosition - Grid cell coordinates
 * @returns String key like "0,0" or "-1,2"
 */
export function gridKey(gridPosition: GridPosition): string {
  return `${gridPosition.x},${gridPosition.z}`;
}

/**
 * Parse a grid key string back to coordinates.
 *
 * @param key - String key like "0,0" or "-1,2"
 * @returns Grid cell coordinates
 */
export function parseGridKey(key: string): GridPosition {
  const parts = key.split(',').map(Number);
  return { x: parts[0] ?? 0, z: parts[1] ?? 0 };
}

/**
 * Get all grid cells within streaming distance of a center cell.
 * Returns only the cell coordinates, not whether regions exist there.
 *
 * @param center - Center grid cell
 * @param distance - Streaming distance in cells
 * @returns Array of grid positions within range
 */
export function getGridCellsInRange(
  center: GridPosition,
  distance: number
): GridPosition[] {
  const cells: GridPosition[] = [];

  for (let dx = -distance; dx <= distance; dx++) {
    for (let dz = -distance; dz <= distance; dz++) {
      cells.push({
        x: center.x + dx,
        z: center.z + dz
      });
    }
  }

  return cells;
}

/**
 * Calculate player spawn world position for an episode start.
 *
 * @param region - The start region data
 * @param config - Streaming configuration
 * @returns World coordinates for player spawn
 */
export function getEpisodeStartPosition(
  region: RegionData,
  config: RegionStreamingConfig
): Vec3 {
  return localToWorld(region.playerSpawn, region.gridPosition, config);
}
