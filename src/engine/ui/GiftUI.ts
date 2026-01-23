import { InventoryManager, InventorySlot, ItemDefinition } from '../inventory';

export type GiftHandler = (npcId: string, itemId: string) => void;

/**
 * UI for giving items to NPCs
 * Shows when near an NPC and player presses G
 */
export class GiftUI {
  private overlay: HTMLDivElement;
  private itemList: HTMLDivElement;
  private inventory: InventoryManager;
  private currentNpcId: string | null = null;
  private onGift: GiftHandler | null = null;
  private onClose: (() => void) | null = null;

  constructor(parentContainer: HTMLElement, inventory: InventoryManager) {
    this.inventory = inventory;
    this.injectStyles();

    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'gift-overlay';

    // Panel
    const panel = document.createElement('div');
    panel.className = 'gift-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'gift-header';
    header.innerHTML = `
      <h3>Give Gift</h3>
      <div class="gift-hint">Click an item to give, or press <span class="key">Esc</span> to cancel</div>
    `;
    panel.appendChild(header);

    // Item list
    this.itemList = document.createElement('div');
    this.itemList.className = 'gift-item-list';
    panel.appendChild(this.itemList);

    this.overlay.appendChild(panel);
    parentContainer.appendChild(this.overlay);

    // Click outside to close
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    // Keyboard handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  private injectStyles(): void {
    if (document.getElementById('gift-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'gift-ui-styles';
    style.textContent = `
      .gift-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 280;
      }

      .gift-overlay.visible {
        display: flex;
      }

      .gift-panel {
        background: linear-gradient(180deg, rgba(45, 40, 35, 0.98) 0%, rgba(35, 30, 28, 0.98) 100%);
        border: 3px solid rgba(200, 160, 120, 0.4);
        border-radius: 14px;
        padding: 18px 22px;
        min-width: 280px;
        max-width: 320px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0e6d8;
      }

      .gift-header {
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 2px solid rgba(200, 160, 120, 0.2);
      }

      .gift-header h3 {
        margin: 0 0 6px 0;
        font-size: 17px;
        font-weight: 600;
        color: #f0d888;
      }

      .gift-hint {
        font-size: 11px;
        color: rgba(240, 230, 216, 0.5);
      }

      .gift-hint .key {
        display: inline-block;
        background: rgba(200, 160, 120, 0.2);
        border: 1px solid rgba(200, 160, 120, 0.3);
        border-radius: 4px;
        padding: 1px 5px;
        font-weight: 600;
        font-size: 10px;
        color: #f0d888;
      }

      .gift-item-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 300px;
        overflow-y: auto;
      }

      .gift-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(200, 160, 120, 0.2);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease-out;
      }

      .gift-item:hover {
        background: rgba(200, 160, 120, 0.15);
        border-color: rgba(200, 160, 120, 0.4);
      }

      .gift-item-icon {
        font-size: 20px;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(200, 160, 120, 0.15);
        border-radius: 6px;
        flex-shrink: 0;
      }

      .gift-item-info {
        flex: 1;
        min-width: 0;
      }

      .gift-item-name {
        font-size: 14px;
        font-weight: 500;
        color: #f0e6d8;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .gift-item-quantity {
        font-size: 11px;
        color: rgba(240, 230, 216, 0.5);
      }

      .gift-empty {
        text-align: center;
        color: rgba(240, 230, 216, 0.4);
        padding: 20px;
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'Escape' || e.code === 'KeyG') {
      this.hide();
    }
  }

  /**
   * Show the gift UI for a specific NPC
   */
  show(npcId: string): void {
    this.currentNpcId = npcId;
    this.refresh();
    this.overlay.classList.add('visible');
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Hide the gift UI
   */
  hide(): void {
    this.overlay.classList.remove('visible');
    this.currentNpcId = null;
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.onClose) {
      this.onClose();
    }
  }

  /**
   * Check if gift UI is visible
   */
  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  /**
   * Set gift callback
   */
  setOnGift(handler: GiftHandler): void {
    this.onGift = handler;
  }

  /**
   * Set close callback
   */
  setOnClose(handler: () => void): void {
    this.onClose = handler;
  }

  /**
   * Refresh the item list
   */
  private refresh(): void {
    this.itemList.innerHTML = '';

    const giftableItems = this.inventory.getGiftableItems();

    if (giftableItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'gift-empty';
      empty.textContent = 'No giftable items';
      this.itemList.appendChild(empty);
      return;
    }

    for (const slot of giftableItems) {
      const itemDef = this.inventory.getItemDefinition(slot.itemId);
      if (!itemDef) continue;

      const item = this.createItemElement(slot, itemDef);
      this.itemList.appendChild(item);
    }
  }

  private createItemElement(slot: InventorySlot, itemDef: ItemDefinition): HTMLElement {
    const item = document.createElement('div');
    item.className = 'gift-item';

    // Icon
    const icon = document.createElement('div');
    icon.className = 'gift-item-icon';
    icon.textContent = this.getCategoryIcon(itemDef.category);
    item.appendChild(icon);

    // Info
    const info = document.createElement('div');
    info.className = 'gift-item-info';

    const name = document.createElement('div');
    name.className = 'gift-item-name';
    name.textContent = itemDef.name;
    info.appendChild(name);

    if (slot.quantity > 1) {
      const qty = document.createElement('div');
      qty.className = 'gift-item-quantity';
      qty.textContent = `x${slot.quantity}`;
      info.appendChild(qty);
    }

    item.appendChild(info);

    // Click to give
    item.addEventListener('click', () => {
      if (this.currentNpcId && this.onGift) {
        this.onGift(this.currentNpcId, slot.itemId);
        this.hide();
      }
    });

    return item;
  }

  private getCategoryIcon(category: string): string {
    switch (category) {
      case 'quest': return '📜';
      case 'gift': return '🎁';
      case 'key': return '🔑';
      default: return '✦';
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.overlay.remove();
  }
}
