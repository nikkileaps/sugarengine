import { InventoryManager, InventorySlot, ItemDefinition } from '../inventory';

/**
 * Grid-based inventory bag overlay
 * Toggle with I key
 */
export class InventoryUI {
  private overlay: HTMLDivElement;
  private grid: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private inventory: InventoryManager;
  private onClose: (() => void) | null = null;

  private readonly GRID_COLS = 6;
  private readonly GRID_ROWS = 4;

  constructor(parentContainer: HTMLElement, inventory: InventoryManager) {
    this.inventory = inventory;
    this.injectStyles();

    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'inventory-overlay';

    // Panel
    const panel = document.createElement('div');
    panel.className = 'inventory-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'inventory-header';
    header.innerHTML = `
      <h2>Inventory</h2>
      <div class="inventory-hint">Press <span class="key">I</span> or <span class="key">Esc</span> to close</div>
    `;
    panel.appendChild(header);

    // Grid
    this.grid = document.createElement('div');
    this.grid.className = 'inventory-grid';
    panel.appendChild(this.grid);

    this.overlay.appendChild(panel);

    // Tooltip (outside panel for proper positioning)
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'inventory-tooltip';
    this.overlay.appendChild(this.tooltip);

    parentContainer.appendChild(this.overlay);

    // Keyboard handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  private injectStyles(): void {
    if (document.getElementById('inventory-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'inventory-ui-styles';
    style.textContent = `
      .inventory-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 300;
      }

      .inventory-overlay.visible {
        display: flex;
      }

      .inventory-panel {
        background: linear-gradient(180deg, rgba(40, 35, 50, 0.98) 0%, rgba(30, 27, 40, 0.98) 100%);
        border: 3px solid rgba(180, 160, 140, 0.4);
        border-radius: 16px;
        padding: 20px 24px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0e6d8;
      }

      .inventory-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 2px solid rgba(180, 160, 140, 0.2);
      }

      .inventory-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
      }

      .inventory-hint {
        font-size: 12px;
        color: rgba(240, 230, 216, 0.5);
      }

      .inventory-hint .key {
        display: inline-block;
        background: rgba(136, 180, 220, 0.2);
        border: 1px solid rgba(136, 180, 220, 0.3);
        border-radius: 4px;
        padding: 2px 6px;
        font-weight: 600;
        font-size: 11px;
        color: #a8d4f0;
      }

      .inventory-grid {
        display: grid;
        grid-template-columns: repeat(6, 56px);
        grid-template-rows: repeat(4, 56px);
        gap: 8px;
      }

      .inventory-slot {
        background: rgba(0, 0, 0, 0.3);
        border: 2px solid rgba(180, 160, 140, 0.2);
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        cursor: default;
        transition: all 0.15s ease-out;
      }

      .inventory-slot.has-item {
        cursor: pointer;
        border-color: rgba(180, 160, 140, 0.35);
        background: rgba(255, 255, 255, 0.05);
      }

      .inventory-slot.has-item:hover {
        border-color: rgba(168, 212, 240, 0.5);
        background: rgba(168, 212, 240, 0.1);
      }

      .inventory-slot-icon {
        font-size: 24px;
        margin-bottom: 2px;
      }

      .inventory-slot-quantity {
        position: absolute;
        bottom: 4px;
        right: 6px;
        font-size: 11px;
        font-weight: 600;
        color: rgba(240, 230, 216, 0.8);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      }

      .inventory-tooltip {
        position: absolute;
        background: rgba(20, 18, 28, 0.98);
        border: 2px solid rgba(180, 160, 140, 0.4);
        border-radius: 10px;
        padding: 12px 16px;
        max-width: 220px;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease-out;
        z-index: 310;
      }

      .inventory-tooltip.visible {
        opacity: 1;
      }

      .inventory-tooltip-name {
        font-size: 14px;
        font-weight: 600;
        color: #f0e6d8;
        margin-bottom: 6px;
      }

      .inventory-tooltip-category {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #a8d4f0;
        margin-bottom: 8px;
      }

      .inventory-tooltip-desc {
        font-size: 13px;
        line-height: 1.4;
        color: rgba(240, 230, 216, 0.7);
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyI' || e.code === 'Escape') {
      this.hide();
    }
  }

  /**
   * Show the inventory
   */
  show(): void {
    this.refresh();
    this.overlay.classList.add('visible');
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Hide the inventory
   */
  hide(): void {
    this.overlay.classList.remove('visible');
    this.tooltip.classList.remove('visible');
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.onClose) {
      this.onClose();
    }
  }

  /**
   * Check if inventory is visible
   */
  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Set close callback
   */
  setOnClose(handler: () => void): void {
    this.onClose = handler;
  }

  /**
   * Refresh the inventory display
   */
  refresh(): void {
    this.grid.innerHTML = '';

    const items = this.inventory.getItems();
    const totalSlots = this.GRID_COLS * this.GRID_ROWS;

    // Create item slots
    for (let i = 0; i < totalSlots; i++) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot';

      const item = items[i];
      if (item) {
        const itemDef = this.inventory.getItemDefinition(item.itemId);
        if (itemDef) {
          slot.classList.add('has-item');
          this.populateSlot(slot, item, itemDef);
        }
      }

      this.grid.appendChild(slot);
    }
  }

  private populateSlot(slot: HTMLElement, item: InventorySlot, itemDef: ItemDefinition): void {
    // Icon
    const icon = document.createElement('div');
    icon.className = 'inventory-slot-icon';
    icon.textContent = this.getCategoryIcon(itemDef.category);
    slot.appendChild(icon);

    // Quantity (if > 1)
    if (item.quantity > 1) {
      const qty = document.createElement('div');
      qty.className = 'inventory-slot-quantity';
      qty.textContent = String(item.quantity);
      slot.appendChild(qty);
    }

    // Tooltip events
    slot.addEventListener('mouseenter', (e) => {
      this.showTooltip(itemDef, e.clientX, e.clientY);
    });

    slot.addEventListener('mousemove', (e) => {
      this.positionTooltip(e.clientX, e.clientY);
    });

    slot.addEventListener('mouseleave', () => {
      this.tooltip.classList.remove('visible');
    });
  }

  private getCategoryIcon(category: string): string {
    switch (category) {
      case 'quest': return '📜';
      case 'gift': return '🎁';
      case 'key': return '🔑';
      default: return '✦';
    }
  }

  private showTooltip(itemDef: ItemDefinition, x: number, y: number): void {
    this.tooltip.innerHTML = `
      <div class="inventory-tooltip-name">${itemDef.name}</div>
      <div class="inventory-tooltip-category">${itemDef.category}</div>
      <div class="inventory-tooltip-desc">${itemDef.description}</div>
    `;
    this.positionTooltip(x, y);
    this.tooltip.classList.add('visible');
  }

  private positionTooltip(x: number, y: number): void {
    const rect = this.overlay.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();

    let left = x - rect.left + 15;
    let top = y - rect.top + 15;

    // Keep tooltip within bounds
    if (left + tooltipRect.width > rect.width - 20) {
      left = x - rect.left - tooltipRect.width - 15;
    }
    if (top + tooltipRect.height > rect.height - 20) {
      top = y - rect.top - tooltipRect.height - 15;
    }

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.overlay.remove();
  }
}
