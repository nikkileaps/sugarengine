/**
 * CommandPalette - Global search (Cmd+K / Ctrl+K)
 *
 * Searches across all dialogues, quests, NPCs, items, and inspections.
 * Allows quick navigation to any entry.
 */

import { editorStore, EditorTab } from '../store';

export interface SearchableEntry {
  id: string;
  name: string;
  type: EditorTab;
  subtitle?: string;
  content?: string; // For full-text search
}

export class CommandPalette {
  private overlay: HTMLElement | null = null;
  private input: HTMLInputElement | null = null;
  private resultsList: HTMLElement | null = null;
  private entries: SearchableEntry[] = [];
  private filteredEntries: SearchableEntry[] = [];
  private selectedIndex = 0;
  private isOpen = false;

  constructor() {
    this.setupKeyboardShortcut();
  }

  setEntries(entries: SearchableEntry[]): void {
    this.entries = entries;
  }

  private setupKeyboardShortcut(): void {
    document.addEventListener('keydown', (e) => {
      // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
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
    this.selectedIndex = 0;
    this.filteredEntries = this.entries.slice(0, 10);
    this.render();
    setTimeout(() => this.input?.focus(), 0);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.overlay?.remove();
    this.overlay = null;
    this.input = null;
    this.resultsList = null;
  }

  private render(): void {
    // Create overlay
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 100px;
      z-index: 10000;
    `;
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) this.close();
    };

    // Create palette container
    const palette = document.createElement('div');
    palette.style.cssText = `
      width: 560px;
      max-width: 90vw;
      background: #1e1e2e;
      border: 1px solid #313244;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 16px 64px rgba(0, 0, 0, 0.5);
    `;

    // Search input container
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = `
      padding: 16px;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      gap: 12px;
    `;

    // Search icon
    const searchIcon = document.createElement('span');
    searchIcon.textContent = '🔍';
    searchIcon.style.cssText = 'font-size: 18px; opacity: 0.6;';
    inputContainer.appendChild(searchIcon);

    // Input
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.placeholder = 'Search dialogues, quests, NPCs, items...';
    this.input.style.cssText = `
      flex: 1;
      background: transparent;
      border: none;
      color: #cdd6f4;
      font-size: 16px;
      outline: none;
    `;
    this.input.oninput = () => this.onSearchChange();
    this.input.onkeydown = (e) => this.onKeyDown(e);
    inputContainer.appendChild(this.input);

    // Shortcut hint
    const hint = document.createElement('span');
    hint.textContent = 'esc';
    hint.style.cssText = `
      padding: 4px 8px;
      background: #313244;
      border-radius: 4px;
      font-size: 11px;
      color: #6c7086;
    `;
    inputContainer.appendChild(hint);

    palette.appendChild(inputContainer);

    // Results list
    this.resultsList = document.createElement('div');
    this.resultsList.style.cssText = `
      max-height: 400px;
      overflow-y: auto;
    `;
    palette.appendChild(this.resultsList);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 12px 16px;
      border-top: 1px solid #313244;
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: #6c7086;
    `;
    footer.innerHTML = `
      <span><kbd style="background:#313244;padding:2px 6px;border-radius:3px;">↑↓</kbd> navigate</span>
      <span><kbd style="background:#313244;padding:2px 6px;border-radius:3px;">↵</kbd> select</span>
      <span><kbd style="background:#313244;padding:2px 6px;border-radius:3px;">esc</kbd> close</span>
    `;
    palette.appendChild(footer);

    this.overlay.appendChild(palette);
    document.body.appendChild(this.overlay);

    this.renderResults();
  }

  private renderResults(): void {
    if (!this.resultsList) return;
    this.resultsList.innerHTML = '';

    if (this.filteredEntries.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `
        padding: 32px;
        text-align: center;
        color: #6c7086;
        font-size: 14px;
      `;
      empty.textContent = this.input?.value ? 'No results found' : 'Start typing to search...';
      this.resultsList.appendChild(empty);
      return;
    }

    for (let i = 0; i < this.filteredEntries.length; i++) {
      const entry = this.filteredEntries[i]!;
      const isSelected = i === this.selectedIndex;

      const item = document.createElement('div');
      item.style.cssText = `
        padding: 12px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        background: ${isSelected ? '#313244' : 'transparent'};
        border-left: 3px solid ${isSelected ? '#89b4fa' : 'transparent'};
      `;
      item.onmouseenter = () => {
        this.selectedIndex = i;
        this.renderResults();
      };
      item.onclick = () => this.selectEntry(entry);

      // Type icon
      const icon = document.createElement('span');
      icon.textContent = this.getTypeIcon(entry.type);
      icon.style.cssText = 'font-size: 18px;';
      item.appendChild(icon);

      // Content
      const content = document.createElement('div');
      content.style.cssText = 'flex: 1; min-width: 0;';

      const name = document.createElement('div');
      name.textContent = entry.name;
      name.style.cssText = `
        font-size: 14px;
        color: #cdd6f4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      content.appendChild(name);

      if (entry.subtitle) {
        const subtitle = document.createElement('div');
        subtitle.textContent = entry.subtitle;
        subtitle.style.cssText = `
          font-size: 12px;
          color: #6c7086;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        `;
        content.appendChild(subtitle);
      }

      item.appendChild(content);

      // Type badge
      const badge = document.createElement('span');
      badge.textContent = this.getTypeLabel(entry.type);
      badge.style.cssText = `
        padding: 4px 8px;
        background: ${this.getTypeColor(entry.type)}22;
        color: ${this.getTypeColor(entry.type)};
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
      `;
      item.appendChild(badge);

      this.resultsList.appendChild(item);
    }
  }

  private onSearchChange(): void {
    const query = this.input?.value.toLowerCase() || '';
    this.selectedIndex = 0;

    if (!query) {
      this.filteredEntries = this.entries.slice(0, 10);
    } else {
      this.filteredEntries = this.entries
        .filter(entry => {
          const nameMatch = entry.name.toLowerCase().includes(query);
          const idMatch = entry.id.toLowerCase().includes(query);
          const subtitleMatch = entry.subtitle?.toLowerCase().includes(query);
          const contentMatch = entry.content?.toLowerCase().includes(query);
          return nameMatch || idMatch || subtitleMatch || contentMatch;
        })
        .slice(0, 15);
    }

    this.renderResults();
  }

  private onKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.filteredEntries.length - 1);
        this.renderResults();
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.renderResults();
        break;
      case 'Enter':
        e.preventDefault();
        if (this.filteredEntries[this.selectedIndex]) {
          this.selectEntry(this.filteredEntries[this.selectedIndex]!);
        }
        break;
    }
  }

  private selectEntry(entry: SearchableEntry): void {
    this.close();
    editorStore.setActiveTab(entry.type);
    editorStore.selectEntry(entry.id);
  }

  private getTypeIcon(type: EditorTab): string {
    switch (type) {
      case 'dialogues': return '💬';
      case 'quests': return '📜';
      case 'npcs': return '👤';
      case 'items': return '🎒';
      case 'inspections': return '🔍';
      default: return '📄';
    }
  }

  private getTypeLabel(type: EditorTab): string {
    switch (type) {
      case 'dialogues': return 'Dialogue';
      case 'quests': return 'Quest';
      case 'npcs': return 'NPC';
      case 'items': return 'Item';
      case 'inspections': return 'Inspection';
      default: return type;
    }
  }

  private getTypeColor(type: EditorTab): string {
    switch (type) {
      case 'dialogues': return '#89b4fa';
      case 'quests': return '#f9e2af';
      case 'npcs': return '#a6e3a1';
      case 'items': return '#f38ba8';
      case 'inspections': return '#cba6f7';
      default: return '#a6adc8';
    }
  }
}
