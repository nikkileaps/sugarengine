import { ItemDefinition, ItemView } from '../../inventory';
import { ReadableView, LayoutResult, createCloseHint, createHeader } from './layoutTypes';
import { bookStyles, renderBook } from './BookLayout';
import { newspaperStyles, renderNewspaper } from './NewspaperLayout';
import { letterStyles, renderLetter } from './LetterLayout';
import { postcardStyles, renderPostcard } from './PostcardLayout';
import { flyerStyles, renderFlyer } from './FlyerLayout';

/**
 * Detail view popup for inventory items.
 * Orchestrates layout rendering and manages overlay, panel, pagination, keyboard.
 */
export class ItemViewUI {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private onUseCallback: (() => void) | null = null;

  // Pagination state (shared by book/newspaper)
  private bookPages: HTMLElement[] = [];
  private currentPage = 0;
  private pageIndicator: HTMLDivElement | null = null;
  private zoomIndicator: HTMLSpanElement | null = null;

  // Current layout result
  private currentResult: LayoutResult | null = null;

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

    // Block wheel events from reaching the game camera when overlay is visible
    this.overlay.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });

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

      /* Page navigation */
      .itemview-page-nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(180, 160, 140, 0.15);
        user-select: none;
      }

      .itemview-page-btn {
        background: rgba(168, 212, 240, 0.1);
        border: 1px solid rgba(168, 212, 240, 0.2);
        border-radius: 8px;
        color: #a8d4f0;
        font-size: 14px;
        font-weight: 600;
        padding: 6px 16px;
        cursor: pointer;
        transition: all 0.15s ease-out;
        font-family: inherit;
        min-width: 80px;
      }

      .itemview-page-btn:hover:not(:disabled) {
        background: rgba(168, 212, 240, 0.2);
        border-color: rgba(168, 212, 240, 0.4);
      }

      .itemview-page-btn:disabled {
        opacity: 0.3;
        cursor: default;
      }

      .itemview-page-indicator {
        font-size: 13px;
        color: rgba(240, 230, 216, 0.4);
      }

      .itemview-page-hint {
        font-size: 11px;
        color: rgba(240, 230, 216, 0.3);
        text-align: center;
        margin-top: 8px;
      }

      /* Zoom controls */
      .itemview-zoom-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .itemview-zoom-btn {
        background: rgba(168, 212, 240, 0.1);
        border: 1px solid rgba(168, 212, 240, 0.2);
        border-radius: 6px;
        color: #a8d4f0;
        font-size: 16px;
        font-weight: 700;
        width: 28px;
        height: 28px;
        cursor: pointer;
        transition: all 0.15s ease-out;
        font-family: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
      }

      .itemview-zoom-btn:hover {
        background: rgba(168, 212, 240, 0.2);
        border-color: rgba(168, 212, 240, 0.4);
      }

      .itemview-zoom-level {
        font-size: 12px;
        color: rgba(240, 230, 216, 0.4);
        min-width: 40px;
        text-align: center;
      }

      ${bookStyles}
      ${newspaperStyles}
      ${letterStyles}
      ${postcardStyles}
      ${flyerStyles}
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible()) return;

    if (e.code === 'Escape') {
      e.preventDefault();
      this.hide();
      return;
    }

    // Let layout handle key first
    if (this.currentResult?.onKeyDown?.(e.code)) {
      e.preventDefault();
      return;
    }

    // Page navigation for book/newspaper
    if (this.bookPages.length > 0) {
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        e.preventDefault();
        this.goToPage(this.currentPage + 1);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.goToPage(this.currentPage - 1);
      }
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
    this.bookPages = [];
    this.currentPage = 0;
    this.pageIndicator = null;
    this.zoomIndicator = null;

    // Remove previous panel mode class
    if (this.currentResult?.panelClass) {
      this.panel.classList.remove(this.currentResult.panelClass);
    }
    this.currentResult = null;

    // Reset content styles that layouts may have changed
    this.contentEl.style.overflow = '';
    this.contentEl.style.display = '';
    this.contentEl.style.flexDirection = '';

    const view = item.view;
    if (!view) return;

    switch (view.type) {
      case 'readable':
        this.currentResult = this.renderReadable(item, view);
        break;
      case 'examine':
        this.renderExamine(item);
        break;
      case 'consumable':
        this.renderConsumable(item, view);
        break;
    }

    // Apply layout result
    if (this.currentResult) {
      if (this.currentResult.panelClass) {
        this.panel.classList.add(this.currentResult.panelClass);
      }
      if (this.currentResult.pages.length > 0) {
        this.bookPages = this.currentResult.pages;
        this.appendPageNav(this.currentResult);
        if (this.currentResult.bindPageJumps) {
          this.currentResult.bindPageJumps((i) => this.goToPage(i));
        }
        if (this.currentResult.setZoomLabelEl && this.zoomIndicator) {
          this.currentResult.setZoomLabelEl(this.zoomIndicator);
        }
        this.goToPage(0);
      }
    }

    // Reset animation
    this.panel.style.animation = 'none';
    void this.panel.offsetHeight;
    this.panel.style.animation = 'itemviewSlideIn 0.25s ease-out forwards';

    this.overlay.classList.add('visible');
    window.addEventListener('keydown', this.boundHandleKeyDown);
  }

  private renderReadable(item: ItemDefinition, view: ReadableView): LayoutResult | null {
    switch (view.layout) {
      case 'book':
        return renderBook(this.contentEl, item, view);
      case 'newspaper':
        return renderNewspaper(this.contentEl, item, view);
      case 'letter':
        return renderLetter(this.contentEl, item, view);
      case 'postcard':
        return renderPostcard(this.contentEl, item, view);
      case 'flyer':
        return renderFlyer(this.contentEl, item, view);
      default:
        this.renderDefaultReadable(item, view);
        return null;
    }
  }

  // ========================================
  // Default readable (no layout) — scrollable text
  // ========================================

  private renderDefaultReadable(item: ItemDefinition, view: ReadableView): void {
    this.contentEl.appendChild(createHeader(item));

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

    this.contentEl.appendChild(createCloseHint('ESC'));
  }

  // ========================================
  // Examine layout
  // ========================================

  private renderExamine(item: ItemDefinition): void {
    this.contentEl.appendChild(createHeader(item));

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

    this.contentEl.appendChild(createCloseHint('ESC'));
  }

  // ========================================
  // Consumable layout
  // ========================================

  private renderConsumable(item: ItemDefinition, view: Extract<ItemView, { type: 'consumable' }>): void {
    this.contentEl.appendChild(createHeader(item));

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

    this.contentEl.appendChild(createCloseHint('ESC'));
  }

  // ========================================
  // Page navigation (shared by book/newspaper)
  // ========================================

  private appendPageNav(result: LayoutResult): void {
    const nav = document.createElement('div');
    nav.className = 'itemview-page-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'itemview-page-btn';
    prevBtn.textContent = '\u2190 Prev';
    prevBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    nav.appendChild(prevBtn);

    // Center section: page indicator + optional zoom
    const centerSection = document.createElement('div');
    centerSection.style.display = 'flex';
    centerSection.style.flexDirection = 'column';
    centerSection.style.alignItems = 'center';
    centerSection.style.gap = '6px';

    this.pageIndicator = document.createElement('div');
    this.pageIndicator.className = 'itemview-page-indicator';
    centerSection.appendChild(this.pageIndicator);

    if (result.withZoom) {
      const zoomControls = document.createElement('div');
      zoomControls.className = 'itemview-zoom-controls';

      const zoomOut = document.createElement('button');
      zoomOut.className = 'itemview-zoom-btn';
      zoomOut.textContent = '\u2212';
      zoomOut.addEventListener('click', () => {
        result.zoomOut?.();
        if (this.zoomIndicator && result.getZoomLabel) {
          this.zoomIndicator.textContent = result.getZoomLabel();
        }
      });
      zoomControls.appendChild(zoomOut);

      this.zoomIndicator = document.createElement('span');
      this.zoomIndicator.className = 'itemview-zoom-level';
      this.zoomIndicator.textContent = result.getZoomLabel?.() ?? '100%';
      zoomControls.appendChild(this.zoomIndicator);

      const zoomIn = document.createElement('button');
      zoomIn.className = 'itemview-zoom-btn';
      zoomIn.textContent = '+';
      zoomIn.addEventListener('click', () => {
        result.zoomIn?.();
        if (this.zoomIndicator && result.getZoomLabel) {
          this.zoomIndicator.textContent = result.getZoomLabel();
        }
      });
      zoomControls.appendChild(zoomIn);

      centerSection.appendChild(zoomControls);
    }

    nav.appendChild(centerSection);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'itemview-page-btn';
    nextBtn.textContent = 'Next \u2192';
    nextBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
    nav.appendChild(nextBtn);

    this.contentEl.appendChild(nav);

    const hint = document.createElement('div');
    hint.className = 'itemview-page-hint';
    const hintText = result.withZoom
      ? 'Scroll to zoom \u00b7 drag to pan \u00b7 <span class="itemview-key">\u2190</span> <span class="itemview-key">\u2192</span> to turn pages \u00b7 <span class="itemview-key">ESC</span> to close'
      : 'Use <span class="itemview-key">\u2190</span> <span class="itemview-key">\u2192</span> arrow keys or <span class="itemview-key">ESC</span> to close';
    hint.innerHTML = hintText;
    this.contentEl.appendChild(hint);
  }

  private goToPage(pageIndex: number): void {
    if (pageIndex < 0 || pageIndex >= this.bookPages.length) return;

    // Hide current page
    this.bookPages[this.currentPage]?.classList.remove('active');

    this.currentPage = pageIndex;

    // Show new page
    this.bookPages[this.currentPage]?.classList.add('active');

    // Notify layout of page change
    this.currentResult?.onPageChange?.(pageIndex);

    // Update zoom label if applicable
    if (this.zoomIndicator && this.currentResult?.getZoomLabel) {
      this.zoomIndicator.textContent = this.currentResult.getZoomLabel();
    }

    // Update indicator
    if (this.pageIndicator) {
      this.pageIndicator.textContent = `${this.currentPage + 1} / ${this.bookPages.length}`;
    }

    // Update button states
    const nav = this.contentEl.querySelector('.itemview-page-nav');
    if (nav) {
      const buttons = nav.querySelectorAll('.itemview-page-btn');
      const prevBtn = buttons[0] as HTMLButtonElement;
      const nextBtn = buttons[1] as HTMLButtonElement;
      if (prevBtn) prevBtn.disabled = this.currentPage === 0;
      if (nextBtn) nextBtn.disabled = this.currentPage === this.bookPages.length - 1;
    }
  }

  hide(): void {
    this.overlay.classList.remove('visible');
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    this.onUseCallback = null;

    // Notify layout
    this.currentResult?.onHide?.();

    this.bookPages = [];
    this.currentPage = 0;
    this.pageIndicator = null;
    this.zoomIndicator = null;

    // Reset content styles that layouts may have changed
    this.contentEl.style.overflow = '';
    this.contentEl.style.display = '';
    this.contentEl.style.flexDirection = '';
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
