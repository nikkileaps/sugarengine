import { ItemDefinition, ItemsDatabase } from './types';

/**
 * Loads and caches item definitions from items.json
 */
export class ItemLoader {
  private items: Map<string, ItemDefinition> = new Map();
  private loaded = false;
  private loading: Promise<void> | null = null;

  /**
   * Load all item definitions
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    if (this.loading) {
      return this.loading;
    }

    this.loading = this.fetchItems();
    await this.loading;
    this.loading = null;
  }

  private async fetchItems(): Promise<void> {
    try {
      const response = await fetch('/items/items.json');
      if (!response.ok) {
        throw new Error(`Failed to load items: ${response.status}`);
      }

      const data: ItemsDatabase = await response.json();

      // Build lookup map
      for (const item of data.items) {
        this.items.set(item.id, item);
      }

      this.loaded = true;
      console.log(`Loaded ${this.items.size} item definitions`);
    } catch (error) {
      console.error('Failed to load items:', error);
      // Don't throw - allow game to continue without items
      this.loaded = true;
    }
  }

  /**
   * Get an item definition by ID
   */
  getItem(itemId: string): ItemDefinition | null {
    return this.items.get(itemId) ?? null;
  }

  /**
   * Get all item definitions
   */
  getAllItems(): ItemDefinition[] {
    return Array.from(this.items.values());
  }

  /**
   * Check if an item exists
   */
  hasItem(itemId: string): boolean {
    return this.items.has(itemId);
  }

  /**
   * Check if items are loaded
   */
  isLoaded(): boolean {
    return this.loaded;
  }
}
