import { ItemDefinition } from '../inventory';

/**
 * Detail view popup for inventory items.
 * Renders different content based on ItemDefinition.view type:
 * - readable: scrollable text with optional sections
 * - examine: large icon + description
 * - consumable: description + action button (e.g. "Drink")
 */
export class ItemViewUI {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private onUseCallback: (() => void) | null = null;

  constructor(parentContainer: HTMLElement) {
    this.injectStyles();

    this.overlay = document.createElement('div');
    this.overlay.className = 'itemview-overlay';

    this.panel = document.createElement('div');
    this.panel.className = 'itemview-panel';

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'itemview-content';
    this.panel.appendChild(this.contentEl);

    this.overlay.appendChild(this.panel);
    parentContainer.appendChild(this.overlay);

    this.boundHandleKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  }

  private injectStyles(): void {
    if (document.getElementById('itemview-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'itemview-ui-styles';
    style.textContent = `
      .itemview-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 350;
        opacity: 0;
        transition: opacity 0.2s ease-out;
      }

      .itemview-overlay.visible {
        display: flex;
        opacity: 1;
      }

      .itemview-panel {
        background: linear-gradient(180deg, rgba(45, 40, 55, 0.98) 0%, rgba(30, 27, 40, 0.99) 100%);
        border: 3px solid rgba(180, 160, 140, 0.4);
        border-radius: 16px;
        padding: 28px 32px;
        max-width: 520px;
        max-height: 75vh;
        width: 90%;
        display: flex;
        flex-direction: column;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0e6d8;
        box-shadow:
          0 12px 48px rgba(0, 0, 0, 0.6),
          0 0 0 1px rgba(255, 255, 255, 0.05) inset,
          0 2px 0 rgba(255, 255, 255, 0.03) inset;
        transform: scale(0.95) translateY(10px);
        opacity: 0;
        animation: itemviewSlideIn 0.25s ease-out forwards;
      }

      @keyframes itemviewSlideIn {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(10px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .itemview-content {
        flex: 1;
        overflow-y: auto;
        padding-right: 8px;
      }

      .itemview-content::-webkit-scrollbar {
        width: 6px;
      }

      .itemview-content::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
      }

      .itemview-content::-webkit-scrollbar-thumb {
        background: rgba(180, 160, 140, 0.3);
        border-radius: 3px;
      }

      .itemview-content::-webkit-scrollbar-thumb:hover {
        background: rgba(180, 160, 140, 0.5);
      }

      .itemview-title {
        font-size: 22px;
        font-weight: 700;
        color: #f0e6d8;
        margin-bottom: 6px;
        letter-spacing: 0.3px;
      }

      .itemview-category {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #a8d4f0;
        margin-bottom: 16px;
      }

      .itemview-description {
        font-size: 15px;
        line-height: 1.7;
        color: #e0d6c8;
        margin-bottom: 16px;
      }

      .itemview-section {
        margin-bottom: 20px;
      }

      .itemview-section:last-child {
        margin-bottom: 0;
      }

      .itemview-section-heading {
        font-size: 17px;
        font-weight: 600;
        color: #a8d4f0;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(168, 212, 240, 0.2);
      }

      .itemview-section-text {
        font-size: 15px;
        line-height: 1.7;
        color: #e0d6c8;
        white-space: pre-wrap;
      }

      .itemview-examine-icon {
        font-size: 64px;
        text-align: center;
        margin-bottom: 16px;
        padding: 16px;
      }

      .itemview-action-btn {
        display: block;
        width: 100%;
        padding: 12px 24px;
        margin-top: 8px;
        background: rgba(168, 212, 240, 0.15);
        border: 2px solid rgba(168, 212, 240, 0.3);
        border-radius: 10px;
        color: #a8d4f0;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease-out;
        font-family: inherit;
      }

      .itemview-action-btn:hover {
        background: rgba(168, 212, 240, 0.25);
        border-color: rgba(168, 212, 240, 0.5);
      }

      .itemview-close-hint {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid rgba(180, 160, 140, 0.15);
        font-size: 13px;
        color: rgba(240, 230, 216, 0.4);
        text-align: center;
      }

      .itemview-key {
        display: inline-block;
        padding: 2px 8px;
        background: rgba(136, 180, 220, 0.2);
        border: 1px solid rgba(136, 180, 220, 0.3);
        border-radius: 4px;
        font-weight: 600;
        color: #a8d4f0;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible()) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      this.hide();
    }
  }

  private getCategoryIcon(category: string): string {
    switch (category) {
      case 'quest': return '\uD83D\uDCDC';
      case 'gift': return '\uD83C\uDF81';
      case 'key': return '\uD83D\uDD11';
      default: return '\u2726';
    }
  }

  show(item: ItemDefinition, onUse?: () => void): void {
    this.onUseCallback = onUse ?? null;
    this.contentEl.innerHTML = '';

    const view = item.view;
    if (!view) return;

    // Title
    const title = document.createElement('div');
    title.className = 'itemview-title';
    title.textContent = item.name;
    this.contentEl.appendChild(title);

    // Category
    const category = document.createElement('div');
    category.className = 'itemview-category';
    category.textContent = item.category;
    this.contentEl.appendChild(category);

    switch (view.type) {
      case 'readable':
        this.renderReadable(item, view);
        break;
      case 'examine':
        this.renderExamine(item);
        break;
      case 'consumable':
        this.renderConsumable(item, view);
        break;
    }

    // Close hint
    const hint = document.createElement('div');
    hint.className = 'itemview-close-hint';
    hint.innerHTML = 'Press <span class="itemview-key">ESC</span> to close';
    this.contentEl.appendChild(hint);

    // Reset animation
    this.panel.style.animation = 'none';
    void this.panel.offsetHeight;
    this.panel.style.animation = 'itemviewSlideIn 0.25s ease-out forwards';

    this.overlay.classList.add('visible');
    window.addEventListener('keydown', this.boundHandleKeyDown);
  }

  private renderReadable(
    _item: ItemDefinition,
    view: { type: 'readable'; content?: string; sections?: { heading?: string; text: string }[] },
  ): void {
    if (view.sections && view.sections.length > 0) {
      for (const section of view.sections) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'itemview-section';

        if (section.heading) {
          const heading = document.createElement('div');
          heading.className = 'itemview-section-heading';
          heading.textContent = section.heading;
          sectionEl.appendChild(heading);
        }

        const text = document.createElement('div');
        text.className = 'itemview-section-text';
        text.textContent = section.text;
        sectionEl.appendChild(text);

        this.contentEl.appendChild(sectionEl);
      }
    } else if (view.content) {
      const text = document.createElement('div');
      text.className = 'itemview-section-text';
      text.textContent = view.content;
      this.contentEl.appendChild(text);
    }
  }

  private renderExamine(item: ItemDefinition): void {
    const iconEl = document.createElement('div');
    iconEl.className = 'itemview-examine-icon';
    iconEl.textContent = this.getCategoryIcon(item.category);
    this.contentEl.appendChild(iconEl);

    if (item.description) {
      const desc = document.createElement('div');
      desc.className = 'itemview-description';
      desc.textContent = item.description;
      this.contentEl.appendChild(desc);
    }
  }

  private renderConsumable(
    item: ItemDefinition,
    view: { type: 'consumable'; action: string },
  ): void {
    if (item.description) {
      const desc = document.createElement('div');
      desc.className = 'itemview-description';
      desc.textContent = item.description;
      this.contentEl.appendChild(desc);
    }

    const btn = document.createElement('button');
    btn.className = 'itemview-action-btn';
    btn.textContent = view.action;
    btn.addEventListener('click', () => {
      if (this.onUseCallback) {
        this.onUseCallback();
      }
    });
    this.contentEl.appendChild(btn);
  }

  hide(): void {
    this.overlay.classList.remove('visible');
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    this.onUseCallback = null;
  }

  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  dispose(): void {
    this.hide();
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    this.overlay.remove();
  }
}
