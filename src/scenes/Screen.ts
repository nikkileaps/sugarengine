import { MenuItem, ScreenShowOptions } from './types';

/**
 * Abstract base class for menu screens
 * Provides keyboard navigation and common UI patterns
 */
export abstract class Screen {
  protected container: HTMLElement;
  protected element: HTMLDivElement;
  protected isActive = false;
  protected menuItems: MenuItem[] = [];
  protected selectedIndex = 0;
  protected onBack: (() => void) | null = null;

  constructor(parentContainer: HTMLElement) {
    this.container = parentContainer;
    this.element = document.createElement('div');
    this.element.className = this.getClassName();
    this.injectStyles();
    this.buildUI();
    parentContainer.appendChild(this.element);

    // Bind keyboard handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  // Subclasses implement these
  protected abstract getClassName(): string;
  protected abstract getStyleId(): string;
  protected abstract getStyles(): string;
  protected abstract buildUI(): void;
  protected abstract onEscape(): void;

  /**
   * Show the screen
   */
  show(_options?: ScreenShowOptions): void {
    this.element.classList.add('visible');
    this.isActive = true;
    this.selectedIndex = this.findFirstEnabledIndex();
    this.updateSelection();
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Hide the screen
   */
  hide(): void {
    this.element.classList.remove('visible');
    this.isActive = false;
    window.removeEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Check if screen is visible
   */
  isVisible(): boolean {
    return this.isActive;
  }

  /**
   * Set back/close handler
   */
  setOnBack(handler: () => void): void {
    this.onBack = handler;
  }

  /**
   * Handle keyboard input
   */
  protected handleKeyDown(e: KeyboardEvent): void {
    if (!this.isActive) return;

    switch (e.code) {
      case 'ArrowUp':
        e.preventDefault();
        this.selectPrevious();
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.selectNext();
        break;
      case 'Enter':
      case 'Space':
        e.preventDefault();
        this.activateSelected();
        break;
      case 'Escape':
        e.preventDefault();
        this.onEscape();
        break;
    }
  }

  /**
   * Select next enabled menu item
   */
  protected selectNext(): void {
    let nextIndex = this.selectedIndex + 1;
    while (nextIndex < this.menuItems.length) {
      if (!this.menuItems[nextIndex]?.disabled) {
        this.selectedIndex = nextIndex;
        this.updateSelection();
        return;
      }
      nextIndex++;
    }
  }

  /**
   * Select previous enabled menu item
   */
  protected selectPrevious(): void {
    let prevIndex = this.selectedIndex - 1;
    while (prevIndex >= 0) {
      if (!this.menuItems[prevIndex]?.disabled) {
        this.selectedIndex = prevIndex;
        this.updateSelection();
        return;
      }
      prevIndex--;
    }
  }

  /**
   * Find first enabled menu item index
   */
  protected findFirstEnabledIndex(): number {
    for (let i = 0; i < this.menuItems.length; i++) {
      if (!this.menuItems[i]?.disabled) {
        return i;
      }
    }
    return 0;
  }

  /**
   * Activate currently selected menu item
   */
  protected activateSelected(): void {
    const item = this.menuItems[this.selectedIndex];
    if (item && !item.disabled) {
      item.action();
    }
  }

  /**
   * Update visual selection state
   */
  protected updateSelection(): void {
    const items = this.element.querySelectorAll('.menu-item');
    items.forEach((el, index) => {
      el.classList.toggle('selected', index === this.selectedIndex);
    });
  }

  /**
   * Inject styles into document
   */
  protected injectStyles(): void {
    if (document.getElementById(this.getStyleId())) return;
    const style = document.createElement('style');
    style.id = this.getStyleId();
    style.textContent = this.getStyles();
    document.head.appendChild(style);
  }

  /**
   * Create a menu button element
   */
  protected createMenuButton(item: MenuItem, index: number): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'menu-item';
    button.textContent = item.label;
    button.dataset.index = String(index);

    if (item.disabled) {
      button.classList.add('disabled');
      button.disabled = true;
    }

    if (index === this.selectedIndex) {
      button.classList.add('selected');
    }

    // Mouse interaction
    button.addEventListener('mouseenter', () => {
      if (!item.disabled) {
        this.selectedIndex = index;
        this.updateSelection();
      }
    });

    button.addEventListener('click', () => {
      if (!item.disabled) {
        item.action();
      }
    });

    return button;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.element.remove();
  }
}

/**
 * Common CSS for menu screens
 */
export const COMMON_SCREEN_STYLES = `
  /* Full screen container */
  .screen {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: none;
    justify-content: center;
    align-items: center;
    font-family: 'Segoe UI', system-ui, sans-serif;
    color: #f0e6d8;
    opacity: 0;
    transition: opacity 0.25s ease-out;
  }

  .screen.visible {
    display: flex;
    opacity: 1;
  }

  /* Menu item styling */
  .menu-item {
    display: block;
    width: 100%;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
    border: 1px solid rgba(180, 160, 140, 0.25);
    border-radius: 10px;
    padding: 14px 24px;
    color: #e8ddd0;
    font-size: 16px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease-out;
    text-align: center;
    margin-bottom: 8px;
  }

  .menu-item:hover:not(.disabled) {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.12) 0%, rgba(255, 255, 255, 0.06) 100%);
    border-color: rgba(180, 160, 140, 0.4);
  }

  .menu-item.selected {
    background: linear-gradient(135deg, rgba(136, 180, 220, 0.25) 0%, rgba(100, 140, 180, 0.15) 100%);
    border-color: rgba(136, 180, 220, 0.4);
    color: #a8d4f0;
  }

  .menu-item.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Key hint styling */
  .key-hint {
    font-size: 13px;
    color: rgba(240, 230, 216, 0.5);
    margin-top: 16px;
  }

  .key-hint .key {
    display: inline-block;
    background: rgba(136, 180, 220, 0.2);
    border: 1px solid rgba(136, 180, 220, 0.3);
    border-radius: 4px;
    padding: 2px 6px;
    font-weight: 600;
    font-size: 12px;
    color: #a8d4f0;
    margin: 0 4px;
  }
`;
