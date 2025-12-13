/**
 * Item category for filtering/display
 */
export type ItemCategory = 'quest' | 'gift' | 'key' | 'misc';

/**
 * Item definition (loaded from items.json)
 */
export interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;           // Path to icon image (optional)
  category: ItemCategory;
  stackable: boolean;
  maxStack?: number;       // Max stack size (default 99 if stackable)
  giftable: boolean;       // Can be given to NPCs
}

/**
 * An item slot in the inventory
 */
export interface InventorySlot {
  itemId: string;
  quantity: number;
}

/**
 * Data for an item pickup in the world
 */
export interface ItemPickupData {
  id: string;              // Unique pickup ID
  itemId: string;          // Item definition ID
  quantity?: number;       // Default 1
  position: {
    x: number;
    y: number;
    z: number;
  };
}

/**
 * Loaded items database
 */
export interface ItemsDatabase {
  items: ItemDefinition[];
}

/**
 * Item event types for callbacks
 */
export type ItemEventType = 'item-added' | 'item-removed' | 'item-used';

/**
 * Item event data
 */
export interface ItemEvent {
  type: ItemEventType;
  itemId: string;
  itemName: string;
  quantity: number;
  newTotal: number;
}
