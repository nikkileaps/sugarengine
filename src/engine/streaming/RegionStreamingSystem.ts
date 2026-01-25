import type { RegionStreamingConfig, GridPosition, RegionData, Vec3 } from '../loaders';
import { worldToGrid, gridKey, getGridCellsInRange } from './gridUtils';

/**
 * Callback interface for the streaming system to interact with the engine.
 */
export interface StreamingCallbacks {
  /** Load a region by ID */
  loadRegion: (regionId: string) => Promise<void>;
  /** Unload a region by ID */
  unloadRegion: (regionId: string) => void;
  /** Set the active region for lighting/fog */
  setActiveRegion: (regionId: string) => void;
  /** Check if a region is loaded */
  isRegionLoaded: (regionId: string) => boolean;
  /** Get player's current world position */
  getPlayerPosition: () => Vec3 | null;
}

/**
 * Manages automatic loading and unloading of regions based on player position.
 *
 * Usage:
 * 1. Create with streaming config and callbacks
 * 2. Register all regions via registerRegion()
 * 3. Call update() each frame (or throttled)
 */
export class RegionStreamingSystem {
  private config: RegionStreamingConfig;
  private callbacks: StreamingCallbacks;
  private regionsByGrid: Map<string, RegionData> = new Map();
  private regionsById: Map<string, RegionData> = new Map();
  private lastPlayerGridX: number | null = null;
  private lastPlayerGridZ: number | null = null;
  private isUpdating: boolean = false;
  private pendingLoads: Set<string> = new Set();

  constructor(config: RegionStreamingConfig, callbacks: StreamingCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  /**
   * Register a region for streaming.
   */
  registerRegion(region: RegionData): void {
    this.regionsById.set(region.id, region);
    if (region.gridPosition) {
      const key = gridKey(region.gridPosition);
      this.regionsByGrid.set(key, region);
    }
  }

  /**
   * Clear all registered regions.
   */
  clear(): void {
    this.regionsByGrid.clear();
    this.regionsById.clear();
    this.lastPlayerGridX = null;
    this.lastPlayerGridZ = null;
  }

  /**
   * Get a region by its grid position.
   */
  getRegionAtGrid(pos: GridPosition): RegionData | undefined {
    return this.regionsByGrid.get(gridKey(pos));
  }

  /**
   * Get a region by ID.
   */
  getRegionById(id: string): RegionData | undefined {
    return this.regionsById.get(id);
  }

  /**
   * Update the streaming system. Call this every frame or throttled.
   * Checks player position and loads/unloads regions as needed.
   */
  async update(): Promise<void> {
    // Prevent concurrent updates
    if (this.isUpdating) return;

    const playerPos = this.callbacks.getPlayerPosition();
    if (!playerPos) return;

    // Determine which grid cell the player is in
    const playerGrid = worldToGrid(playerPos, this.config);

    // Check if player moved to a new grid cell
    if (playerGrid.x === this.lastPlayerGridX && playerGrid.z === this.lastPlayerGridZ) {
      return; // No change, skip update
    }

    this.isUpdating = true;
    this.lastPlayerGridX = playerGrid.x;
    this.lastPlayerGridZ = playerGrid.z;

    try {
      // Get all grid cells that should be loaded
      const neededCells = getGridCellsInRange(playerGrid, this.config.streamingDistance);
      const neededRegionIds = new Set<string>();

      // Find regions that exist in the needed cells
      for (const cell of neededCells) {
        const region = this.getRegionAtGrid(cell);
        if (region) {
          neededRegionIds.add(region.id);
        }
      }

      // Determine which regions to load and unload
      const toLoad: string[] = [];
      const toUnload: string[] = [];

      // Find regions to load
      for (const regionId of neededRegionIds) {
        if (!this.callbacks.isRegionLoaded(regionId) && !this.pendingLoads.has(regionId)) {
          toLoad.push(regionId);
          this.pendingLoads.add(regionId);
        }
      }

      // Find regions to unload (loaded but not needed)
      for (const region of this.regionsById.values()) {
        if (this.callbacks.isRegionLoaded(region.id) && !neededRegionIds.has(region.id)) {
          toUnload.push(region.id);
        }
      }

      // Unload regions first (frees memory)
      for (const regionId of toUnload) {
        this.callbacks.unloadRegion(regionId);
      }

      // Load needed regions
      for (const regionId of toLoad) {
        try {
          await this.callbacks.loadRegion(regionId);
        } finally {
          this.pendingLoads.delete(regionId);
        }
      }

      // Set active region (the one the player is in)
      const playerRegion = this.getRegionAtGrid(playerGrid);
      if (playerRegion && this.callbacks.isRegionLoaded(playerRegion.id)) {
        this.callbacks.setActiveRegion(playerRegion.id);
      }

    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Force load a specific region (for episode start, teleports, etc.)
   */
  async forceLoadRegion(regionId: string): Promise<void> {
    if (this.callbacks.isRegionLoaded(regionId)) return;

    await this.callbacks.loadRegion(regionId);

    // Update grid tracking based on region position
    const region = this.regionsById.get(regionId);
    if (region?.gridPosition) {
      this.lastPlayerGridX = region.gridPosition.x;
      this.lastPlayerGridZ = region.gridPosition.z;
    }
  }

  /**
   * Get all regions within streaming distance of a position.
   */
  getRegionsInRange(worldPos: Vec3): RegionData[] {
    const playerGrid = worldToGrid(worldPos, this.config);
    const cells = getGridCellsInRange(playerGrid, this.config.streamingDistance);
    const regions: RegionData[] = [];

    for (const cell of cells) {
      const region = this.getRegionAtGrid(cell);
      if (region) {
        regions.push(region);
      }
    }

    return regions;
  }
}
