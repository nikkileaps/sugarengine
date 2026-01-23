/**
 * KeyboardShortcuts - Help modal showing available shortcuts
 *
 * Opens with ? or Cmd+/
 */

export interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  { keys: ['Cmd', 'K'], description: 'Open quick search', category: 'Navigation' },
  { keys: ['1'], description: 'Go to Dialogues tab', category: 'Navigation' },
  { keys: ['2'], description: 'Go to Quests tab', category: 'Navigation' },
  { keys: ['3'], description: 'Go to NPCs tab', category: 'Navigation' },
  { keys: ['4'], description: 'Go to Items tab', category: 'Navigation' },
  { keys: ['5'], description: 'Go to Inspections tab', category: 'Navigation' },

  // Editing
  { keys: ['Cmd', 'Z'], description: 'Undo', category: 'Editing' },
  { keys: ['Cmd', 'Shift', 'Z'], description: 'Redo', category: 'Editing' },
  { keys: ['Cmd', 'S'], description: 'Save / Export data', category: 'Editing' },
  { keys: ['N'], description: 'Create new entry', category: 'Editing' },
  { keys: ['Delete'], description: 'Delete selected entry', category: 'Editing' },

  // Dialogue Editor
  { keys: ['Space'], description: 'Play/Pause playtest', category: 'Dialogue' },
  { keys: ['R'], description: 'Reset playtest', category: 'Dialogue' },
  { keys: ['A'], description: 'Auto-layout nodes', category: 'Dialogue' },

  // General
  { keys: ['?'], description: 'Show keyboard shortcuts', category: 'General' },
  { keys: ['Esc'], description: 'Close modal / Cancel', category: 'General' },
];

export class KeyboardShortcuts {
  private overlay: HTMLElement | null = null;
  private isOpen = false;

  constructor() {
    this.setupKeyboardShortcut();
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener('keydown', (e) => {
      // Don't trigger in input fields
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // ? key to show shortcuts
      if (e.key === '?' || ((e.metaKey || e.ctrlKey) && e.key === '/')) {
        e.preventDefault();
        this.toggle();
      }

      // Escape to close
      if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.close();
      }
    });
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay?.remove();
    this.overlay = null;
  }

  private render(): void {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) this.close();
    };

    const modal = document.createElement('div');
    modal.style.cssText = `
      width: 600px;
      max-width: 90vw;
      max-height: 80vh;
      background: #1e1e2e;
      border: 1px solid #313244;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Keyboard Shortcuts';
    title.style.cssText = 'margin: 0; font-size: 18px; color: #cdd6f4;';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #a6adc8;
      font-size: 18px;
      cursor: pointer;
    `;
    closeBtn.onclick = () => this.close();
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 24px;
    `;

    // Group shortcuts by category
    const categories = new Map<string, Shortcut[]>();
    for (const shortcut of SHORTCUTS) {
      if (!categories.has(shortcut.category)) {
        categories.set(shortcut.category, []);
      }
      categories.get(shortcut.category)!.push(shortcut);
    }

    for (const [category, shortcuts] of categories) {
      const section = document.createElement('div');
      section.style.cssText = 'margin-bottom: 24px;';

      const categoryTitle = document.createElement('h3');
      categoryTitle.textContent = category;
      categoryTitle.style.cssText = `
        margin: 0 0 12px 0;
        font-size: 12px;
        font-weight: 600;
        color: #89b4fa;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      `;
      section.appendChild(categoryTitle);

      const list = document.createElement('div');
      list.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

      for (const shortcut of shortcuts) {
        const row = document.createElement('div');
        row.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 12px;
          background: #181825;
          border-radius: 6px;
        `;

        const description = document.createElement('span');
        description.textContent = shortcut.description;
        description.style.cssText = 'font-size: 13px; color: #cdd6f4;';
        row.appendChild(description);

        const keysContainer = document.createElement('div');
        keysContainer.style.cssText = 'display: flex; gap: 4px;';

        for (let i = 0; i < shortcut.keys.length; i++) {
          const key = shortcut.keys[i]!;
          const kbd = document.createElement('kbd');
          kbd.textContent = key === 'Cmd' ? (navigator.platform.includes('Mac') ? '⌘' : 'Ctrl') : key;
          kbd.style.cssText = `
            padding: 4px 8px;
            background: #313244;
            border-radius: 4px;
            font-size: 12px;
            font-family: inherit;
            color: #a6adc8;
            min-width: 24px;
            text-align: center;
          `;
          keysContainer.appendChild(kbd);

          if (i < shortcut.keys.length - 1) {
            const plus = document.createElement('span');
            plus.textContent = '+';
            plus.style.cssText = 'color: #6c7086; font-size: 12px; display: flex; align-items: center;';
            keysContainer.appendChild(plus);
          }
        }

        row.appendChild(keysContainer);
        list.appendChild(row);
      }

      section.appendChild(list);
      content.appendChild(section);
    }

    modal.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 24px;
      border-top: 1px solid #313244;
      text-align: center;
      font-size: 12px;
      color: #6c7086;
    `;
    footer.textContent = 'Press ? anywhere to show this help';
    modal.appendChild(footer);

    this.overlay.appendChild(modal);
    document.body.appendChild(this.overlay);
  }
}
