/**
 * ActionMenu - Vertical three-dot menu with dropdown actions
 */

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;  // Red styling for destructive actions
}

export interface ActionMenuConfig {
  items: ActionMenuItem[];
}

export class ActionMenu {
  private element: HTMLElement;
  private button: HTMLButtonElement;
  private dropdown: HTMLElement | null = null;
  private config: ActionMenuConfig;

  constructor(config: ActionMenuConfig) {
    this.config = config;

    this.element = document.createElement('div');
    this.element.className = 'action-menu';
    this.element.style.cssText = `
      position: relative;
      display: inline-block;
    `;

    // Three-dot button
    this.button = document.createElement('button');
    this.button.className = 'action-menu-trigger';
    this.button.innerHTML = '⋮';
    this.button.style.cssText = `
      width: 24px;
      height: 24px;
      border: none;
      background: transparent;
      color: #6c7086;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
    `;

    this.button.onmouseenter = () => {
      this.button.style.background = 'rgba(255, 255, 255, 0.1)';
      this.button.style.color = '#cdd6f4';
    };
    this.button.onmouseleave = () => {
      if (!this.dropdown) {
        this.button.style.background = 'transparent';
        this.button.style.color = '#6c7086';
      }
    };

    this.button.onclick = (e) => {
      e.stopPropagation();
      this.toggle();
    };

    this.element.appendChild(this.button);

    // Close on outside click
    document.addEventListener('click', () => this.close());
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private toggle(): void {
    if (this.dropdown) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    if (this.dropdown) return;

    this.dropdown = document.createElement('div');
    this.dropdown.className = 'action-menu-dropdown';
    this.dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      min-width: 120px;
      background: #1e1e2e;
      border: 1px solid #313244;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      z-index: 1000;
      overflow: hidden;
      margin-top: 4px;
    `;

    for (const item of this.config.items) {
      const menuItem = document.createElement('button');
      menuItem.className = 'action-menu-item';
      menuItem.textContent = item.label;
      menuItem.style.cssText = `
        width: 100%;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: ${item.danger ? '#f38ba8' : '#cdd6f4'};
        font-size: 13px;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s;
      `;

      menuItem.onmouseenter = () => {
        menuItem.style.background = item.danger ? 'rgba(243, 139, 168, 0.15)' : 'rgba(255, 255, 255, 0.1)';
      };
      menuItem.onmouseleave = () => {
        menuItem.style.background = 'transparent';
      };

      menuItem.onclick = (e) => {
        e.stopPropagation();
        item.onClick();
        this.close();
      };

      this.dropdown.appendChild(menuItem);
    }

    this.element.appendChild(this.dropdown);
    this.button.style.background = 'rgba(255, 255, 255, 0.1)';
    this.button.style.color = '#cdd6f4';
  }

  private close(): void {
    if (this.dropdown) {
      this.dropdown.remove();
      this.dropdown = null;
      this.button.style.background = 'transparent';
      this.button.style.color = '#6c7086';
    }
  }

  updateItems(items: ActionMenuItem[]): void {
    this.config.items = items;
    // If dropdown is open, refresh it
    if (this.dropdown) {
      this.close();
      this.open();
    }
  }
}
