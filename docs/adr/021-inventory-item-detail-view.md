# ADR-021: Inventory Item Detail View

## Status

Accepted (Implemented)

## Context

Items in the inventory grid currently show hover tooltips but have no click interaction. Players can pick up diverse items — newspapers, rugs, coffee — but cannot inspect or interact with them once in inventory. Different item types need different affordances when clicked:

- A **newspaper** should open a rich text viewer (and stay in inventory)
- A **rug** should show a large icon and description (and stay in inventory)
- A **coffee** should show a description with a "Drink" button (and be consumed/removed)

These are fundamentally different interaction patterns driven by what kind of item it is.

### The Problem

All items share a flat `ItemDefinition` with the same fields. There's no way to express "this item is readable" vs "this item is consumable" — and no mechanism to show different UIs based on item subtype. Adding a bag of optional fields (`viewContent?`, `viewSections?`, `useAction?`, etc.) directly on `ItemDefinition` would create a sprawling interface where most fields are irrelevant to most items. It also wouldn't communicate intent — you'd have to know which combinations of fields "go together."

### Prior Art

| System | Approach |
|--------|----------|
| Unity | ScriptableObject subtypes (ReadableItem, ConsumableItem) |
| Unreal | Gameplay Tags + polymorphic structs |
| Stardew Valley | Item categories with type-specific behavior |
| Zelda (BotW) | Material/food/equipment categories drive different menus |

All use some form of type discrimination to drive per-item-type UI and behavior.

### Existing Patterns

- **InspectionUI** (`src/engine/ui/InspectionUI.ts`): Full-screen overlay for world inspectables (signs, newspapers on tables). Supports sections with headings, styled in Catppuccin Mocha. Same visual style we want.
- **GiftUI** (`src/engine/ui/GiftUI.ts`): Demonstrates click-on-item-in-list pattern with callbacks. Shows items can be selected and acted upon.
- **InventoryUI** (`src/engine/ui/InventoryUI.ts`): Grid display with hover tooltips. Currently has NO click handlers on slots.
- **Inventory.removeItem()**: Already supports removing N items from a stack (used by gifting). Consumable items can reuse this.

## Decision

### 1. Discriminated Union for Item View Type

Add an `ItemView` discriminated union type and an optional `view` field on `ItemDefinition`:

```typescript
export type ItemView =
  | { type: 'readable'; content?: string; sections?: { heading?: string; text: string }[] }
  | { type: 'examine' }
  | { type: 'consumable'; action: string }

export interface ItemDefinition {
  // ... existing fields ...
  view?: ItemView;
}
```

**Why a discriminated union instead of flat fields:**
- Each variant carries only the fields it needs — no "which fields go with which viewType?" confusion
- TypeScript narrowing works naturally: `if (view.type === 'readable') { view.sections }` — full type safety
- Adding new item subtypes later (e.g., `equippable`, `combinable`) is additive — add a new union member, existing code unchanged
- The `view` field is optional — items without it keep current tooltip-only behavior

**Variant details:**

| Type | Fields | Behavior |
|------|--------|----------|
| `readable` | `content?`, `sections?` | Shows rich text viewer. Item stays in inventory. |
| `examine` | *(none — uses existing `description` + `icon`)* | Shows large icon + description. Item stays in inventory. |
| `consumable` | `action` (button label: "Drink", "Use") | Shows description + action button. Clicking removes 1 from stack. |

### 2. New UI Component: ItemViewUI

Create `ItemViewUI` — an imperative DOM class (same pattern as InspectionUI, GiftUI) that renders different content based on the item's `view.type`.

- Dark overlay + centered panel
- z-index 350 (above InventoryUI at 300, above InspectionUI at 250)
- Catppuccin Mocha styling matching InspectionUI
- Keyboard: ESC to close
- API: `show(item: ItemDefinition, onUse?: () => void)` / `hide()` / `isVisible()` / `dispose()`

### 3. Click Handler on InventoryUI

Add `onItemClick?: (itemId: string) => void` callback to InventoryUI. Slots for items with a `view` field get `cursor: pointer` and fire the callback on click.

### 4. Game.ts Wiring

Game.ts instantiates ItemViewUI and wires:
- `inventoryUI.onItemClick` → look up ItemDefinition → `itemViewUI.show(itemDef, onUse)`
- For consumable `onUse`: `inventory.removeItem(itemId, 1)`, show notification, close view, refresh grid
- `itemViewUI.isVisible()` added to `isUIBlocking()` check
- ItemViewUI closes when inventory closes

## Changes

### New Files

**`src/engine/ui/ItemViewUI.ts`**
- Imperative DOM component for item detail view
- Three render modes: readable (sections), examine (icon + description), consumable (description + action button)

### Modified Files

**`src/engine/inventory/types.ts`**
- Add `ItemView` discriminated union type
- Add `view?: ItemView` to `ItemDefinition`

**`src/engine/ui/InventoryUI.ts`**
- Add `onItemClick` callback
- Add click handler + cursor styling on slots with `view`

**`src/engine/core/Game.ts`**
- Instantiate ItemViewUI
- Wire onItemClick → show detail view
- Handle consumable use action
- Add to isUIBlocking

**`src/preview.ts`** and **`src/game.ts`**
- Same ItemViewUI wiring as Game.ts

**`src/engine/ui/index.ts`** and **`src/engine/index.ts`**
- Export ItemViewUI and ItemView type

**`src/editor/store/useEditorStore.ts`**
- Add `view?: ItemView` to `ItemData`

**`src/editor/panels/item/ItemPanel.tsx`**
- Add `view?: ItemView` to `ItemEntry`

**`src/editor/panels/item/ItemDetail.tsx`**
- Add "Interaction" card with view type selector
- Conditional fields: readable → content textarea, consumable → action input, examine → no extra fields

## Implementation Phases

### Phase 1: Type System
- Add `ItemView` union and `view` field to engine types
- Mirror in editor types (store, panel)

### Phase 2: ItemViewUI Component
- Create imperative DOM component with three render modes
- Style matching InspectionUI

### Phase 3: InventoryUI Click Handler
- Add onItemClick callback and click handling on slots

### Phase 4: Game Wiring
- Instantiate and wire in Game.ts, preview.ts, game.ts
- Handle consume action

### Phase 5: Editor UI
- View type selector and conditional fields in ItemDetail.tsx

## Consequences

### Positive

- Clean type discrimination — each item variant carries exactly the fields it needs
- TypeScript narrowing provides compile-time safety when handling variants
- Extensible — new item subtypes are additive union members
- Reuses existing patterns: InspectionUI styling, GiftUI click pattern, Inventory.removeItem for consuming
- Items without `view` are unaffected — fully backwards compatible

### Negative

- New UI component to maintain (ItemViewUI)
- Editor needs to construct/destructure union objects when view type changes
- Serialization: the `view` object is nested JSON, slightly more complex than flat fields

### Neutral

- `ItemView` union lives in `types.ts` alongside `ItemDefinition` — single source of truth
- No inline 3D viewer yet (examine shows icon + text) — can be added later as a new render mode
- Consumable use effects are simple (remove from stack) — a proper effects system is deferred
