import { ItemDefinition } from './types';

/**
 * Manages item definitions.
 * Items are registered via registerItem() from project data.
 */
export class ItemLoader {
  private items: Map<string, ItemDefinition> = new Map();

  /**
   * Initialize (no-op, items are registered via registerItem)
   */
  async load(): Promise<void> {
    // Items are registered directly via registerItem() from project data
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
    return this.items.size > 0;
  }

  /**
   * Register an item definition
   */
  registerItem(item: ItemDefinition): void {
    this.items.set(item.id, item);
  }
}
