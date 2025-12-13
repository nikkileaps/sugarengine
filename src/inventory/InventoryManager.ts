import { ItemLoader } from './ItemLoader';
import { ItemDefinition, InventorySlot, ItemEvent } from './types';

export type ItemEventHandler = (event: ItemEvent) => void;

/**
 * Manages the player's inventory
 */
export class InventoryManager {
  private loader: ItemLoader;
  private items: Map<string, number> = new Map(); // itemId -> quantity

  // Event handlers
  private onItemAdded: ItemEventHandler | null = null;
  private onItemRemoved: ItemEventHandler | null = null;

  constructor() {
    this.loader = new ItemLoader();
  }

  /**
   * Initialize the inventory system (load item definitions)
   */
  async init(): Promise<void> {
    await this.loader.load();
  }

  // ============================================
  // Event Handler Registration
  // ============================================

  setOnItemAdded(handler: ItemEventHandler): void {
    this.onItemAdded = handler;
  }

  setOnItemRemoved(handler: ItemEventHandler): void {
    this.onItemRemoved = handler;
  }

  // ============================================
  // Item Operations
  // ============================================

  /**
   * Add item(s) to inventory
   * Returns true if successful
   */
  addItem(itemId: string, quantity: number = 1): boolean {
    const itemDef = this.loader.getItem(itemId);
    if (!itemDef) {
      console.warn(`Unknown item: ${itemId}`);
      return false;
    }

    const current = this.items.get(itemId) ?? 0;
    const maxStack = itemDef.stackable ? (itemDef.maxStack ?? 99) : 1;

    // Check if we can add (non-stackable items can only have 1)
    if (!itemDef.stackable && current > 0) {
      console.warn(`Cannot add more of non-stackable item: ${itemId}`);
      return false;
    }

    const newQuantity = Math.min(current + quantity, maxStack);
    const actualAdded = newQuantity - current;

    if (actualAdded <= 0) {
      return false;
    }

    this.items.set(itemId, newQuantity);

    // Fire event
    this.fireEvent('item-added', itemId, actualAdded, newQuantity);

    return true;
  }

  /**
   * Remove item(s) from inventory
   * Returns true if successful
   */
  removeItem(itemId: string, quantity: number = 1): boolean {
    const current = this.items.get(itemId) ?? 0;

    if (current < quantity) {
      return false;
    }

    const newQuantity = current - quantity;

    if (newQuantity <= 0) {
      this.items.delete(itemId);
    } else {
      this.items.set(itemId, newQuantity);
    }

    // Fire event
    this.fireEvent('item-removed', itemId, quantity, newQuantity);

    return true;
  }

  /**
   * Check if player has item(s)
   */
  hasItem(itemId: string, quantity: number = 1): boolean {
    return (this.items.get(itemId) ?? 0) >= quantity;
  }

  /**
   * Get quantity of an item
   */
  getQuantity(itemId: string): number {
    return this.items.get(itemId) ?? 0;
  }

  /**
   * Get all inventory slots
   */
  getItems(): InventorySlot[] {
    const slots: InventorySlot[] = [];
    for (const [itemId, quantity] of this.items) {
      slots.push({ itemId, quantity });
    }
    return slots;
  }

  /**
   * Get only giftable items
   */
  getGiftableItems(): InventorySlot[] {
    const slots: InventorySlot[] = [];
    for (const [itemId, quantity] of this.items) {
      const itemDef = this.loader.getItem(itemId);
      if (itemDef?.giftable) {
        slots.push({ itemId, quantity });
      }
    }
    return slots;
  }

  /**
   * Get item definition
   */
  getItemDefinition(itemId: string): ItemDefinition | null {
    return this.loader.getItem(itemId);
  }

  /**
   * Get total number of unique items
   */
  getUniqueItemCount(): number {
    return this.items.size;
  }

  /**
   * Clear all items
   */
  clear(): void {
    this.items.clear();
  }

  // ============================================
  // Helpers
  // ============================================

  private fireEvent(
    type: ItemEvent['type'],
    itemId: string,
    quantity: number,
    newTotal: number
  ): void {
    const itemDef = this.loader.getItem(itemId);
    const event: ItemEvent = {
      type,
      itemId,
      itemName: itemDef?.name ?? itemId,
      quantity,
      newTotal,
    };

    if (type === 'item-added' && this.onItemAdded) {
      this.onItemAdded(event);
    } else if (type === 'item-removed' && this.onItemRemoved) {
      this.onItemRemoved(event);
    }
  }

  /**
   * Get the item loader (for accessing item definitions)
   */
  getLoader(): ItemLoader {
    return this.loader;
  }
}
