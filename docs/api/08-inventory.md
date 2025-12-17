# Inventory System

The inventory system manages the player's items, with support for stacking, categories, and giftable items.

**Source**: `src/inventory/`

## InventoryManager

Main class for managing player inventory.

**Source**: `src/inventory/InventoryManager.ts`

### Constructor

```typescript
const inventory = new InventoryManager();
```

### Initialization

#### init()

Load item definitions from the items database. Must be called before use.

```typescript
await inventory.init(): Promise<void>
```

Items are loaded from `/public/items/items.json`.

## Item Operations

### addItem()

Add an item to the inventory.

```typescript
inventory.addItem(itemId: string, quantity?: number): boolean
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `itemId` | `string` | - | Item definition ID |
| `quantity` | `number` | `1` | Amount to add |

Returns `true` if added successfully, `false` if item doesn't exist in definitions.

**Example**:
```typescript
inventory.addItem('bread', 3);
inventory.addItem('old-key');  // Adds 1
```

### removeItem()

Remove an item from the inventory.

```typescript
inventory.removeItem(itemId: string, quantity?: number): boolean
```

Returns `true` if removed successfully, `false` if insufficient quantity.

### hasItem()

Check if the player has an item (optionally with minimum quantity).

```typescript
inventory.hasItem(itemId: string, quantity?: number): boolean
```

**Example**:
```typescript
if (inventory.hasItem('key')) {
  // Player has at least 1 key
}

if (inventory.hasItem('gold-coin', 10)) {
  // Player has at least 10 gold coins
}
```

### getQuantity()

Get the quantity of an item in the inventory.

```typescript
inventory.getQuantity(itemId: string): number
```

Returns `0` if item not in inventory.

### clear()

Remove all items from the inventory.

```typescript
inventory.clear(): void
```

## Inventory Queries

### getItems()

Get all items in the inventory.

```typescript
inventory.getItems(): InventorySlot[]
```

```typescript
interface InventorySlot {
  itemId: string;
  quantity: number;
  definition: ItemDefinition;
}
```

### getGiftableItems()

Get all items that can be given to NPCs.

```typescript
inventory.getGiftableItems(): InventorySlot[]
```

### getItemDefinition()

Get the definition of an item by ID.

```typescript
inventory.getItemDefinition(itemId: string): ItemDefinition | null
```

### getUniqueItemCount()

Get the number of unique items in the inventory (not total quantity).

```typescript
inventory.getUniqueItemCount(): number
```

## Event Handlers

### setOnItemAdded()

Called when an item is added to the inventory.

```typescript
inventory.setOnItemAdded(handler: (event: ItemEvent) => void): void
```

### setOnItemRemoved()

Called when an item is removed from the inventory.

```typescript
inventory.setOnItemRemoved(handler: (event: ItemEvent) => void): void
```

### ItemEvent

```typescript
interface ItemEvent {
  itemId: string;
  quantity: number;
  newTotal: number;
  definition: ItemDefinition;
}
```

## Item Data Format

Items are defined in `/public/items/items.json`.

### ItemsDatabase

```typescript
interface ItemsDatabase {
  items: ItemDefinition[];
}
```

### ItemDefinition

```typescript
interface ItemDefinition {
  id: string;              // Unique item identifier
  name: string;            // Display name
  description: string;     // Item description
  icon?: string;           // Icon path (optional)
  category: ItemCategory;  // Item type
  stackable: boolean;      // Can stack in inventory
  maxStack?: number;       // Max stack size (default 99)
  giftable: boolean;       // Can be given to NPCs
}
```

### ItemCategory

| Value | Description |
|-------|-------------|
| `'quest'` | Quest-related items |
| `'gift'` | Items for gifting to NPCs |
| `'key'` | Keys and access items |
| `'misc'` | Miscellaneous items |

## Example Items Database

`/public/items/items.json`:

```json
{
  "items": [
    {
      "id": "bread",
      "name": "Fresh Bread",
      "description": "Warm bread from the bakery. A favorite among villagers.",
      "category": "gift",
      "stackable": true,
      "maxStack": 10,
      "giftable": true
    },
    {
      "id": "old-key",
      "name": "Old Key",
      "description": "A rusty key. It might open something.",
      "category": "key",
      "stackable": false,
      "giftable": false
    },
    {
      "id": "village-map",
      "name": "Village Map",
      "description": "A hand-drawn map of the village and surrounding areas.",
      "category": "quest",
      "stackable": false,
      "giftable": false
    },
    {
      "id": "gold-coin",
      "name": "Gold Coin",
      "description": "Shiny currency accepted everywhere.",
      "category": "misc",
      "stackable": true,
      "maxStack": 999,
      "giftable": false
    },
    {
      "id": "flower",
      "name": "Wildflower",
      "description": "A beautiful flower picked from the meadow.",
      "category": "gift",
      "stackable": true,
      "maxStack": 5,
      "giftable": true
    }
  ]
}
```

## Integration Example

```typescript
const inventory = new InventoryManager();
await inventory.init();

// Connect to quest system
inventory.setOnItemAdded((event) => {
  quests.triggerObjective('collect', event.itemId);
  showNotification(`Obtained: ${event.definition.name} x${event.quantity}`);
});

// Connect to engine item pickups
engine.onItemPickup((pickupId, itemId, quantity) => {
  inventory.addItem(itemId, quantity);
  saveManager.markPickupCollected(engine.getCurrentRegion(), pickupId);
});

// Give starting items
inventory.addItem('village-map');
inventory.addItem('bread', 3);

// Check for quest item
if (inventory.hasItem('old-key')) {
  // Can unlock the door
}

// Gift item to NPC
const giftables = inventory.getGiftableItems();
if (giftables.length > 0) {
  const gift = giftables[0];
  inventory.removeItem(gift.itemId, 1);
  // Handle NPC reaction
}
```

## Stacking Behavior

- **Stackable items**: Multiple instances combine into one slot
- **Non-stackable items**: Each instance takes its own slot
- **maxStack**: Limits how many can stack (default 99 if not specified)

```typescript
// Stackable item
inventory.addItem('bread', 5);
inventory.addItem('bread', 3);
// Result: 1 slot with 8 bread

// Non-stackable item
inventory.addItem('old-key');
inventory.addItem('old-key');
// Result: 2 slots with 1 key each
```
