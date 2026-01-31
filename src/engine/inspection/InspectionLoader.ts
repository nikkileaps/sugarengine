import { InspectionData, LoadedInspection } from './types';

/**
 * Loads and caches inspection content from JSON files
 */
export class InspectionLoader {
  private cache: Map<string, LoadedInspection> = new Map();

  /**
   * Load inspection content from a JSON file
   */
  async load(inspectionId: string, basePath = '/inspections/'): Promise<LoadedInspection> {
    // Check cache first
    const cached = this.cache.get(inspectionId);
    if (cached) return cached;

    // Load from file
    const response = await fetch(`${basePath}${inspectionId}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load inspection: ${inspectionId}`);
    }

    const data: InspectionData = await response.json();

    const loaded: LoadedInspection = { data };
    this.cache.set(inspectionId, loaded);

    return loaded;
  }

  /**
   * Preload multiple inspections
   */
  async preloadAll(inspectionIds: string[], basePath = '/inspections/'): Promise<void> {
    await Promise.all(inspectionIds.map(id => this.load(id, basePath)));
  }

  /**
   * Get a cached inspection (returns undefined if not loaded)
   */
  get(inspectionId: string): LoadedInspection | undefined {
    return this.cache.get(inspectionId);
  }

  /**
   * Register an inspection directly (for development mode)
   */
  register(inspectionId: string, data: InspectionData): void {
    this.cache.set(inspectionId, { data });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
