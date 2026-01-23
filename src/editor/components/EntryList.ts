/**
 * EntryList - Left panel component for listing entries
 *
 * Displays a searchable, filterable list of entries (dialogues, quests, etc.)
 */

export interface EntryListItem {
  id: string;
  name: string;
  subtitle?: string;
  icon?: string;
}

export interface EntryListConfig {
  title: string;
  placeholder?: string;
  onSelect: (id: string) => void;
  onCreate?: () => void;
}

export class EntryList {
  private element: HTMLElement;
  private listContainer: HTMLElement;
  private searchInput: HTMLInputElement;
  private items: EntryListItem[] = [];
  private selectedId: string | null = null;
  private config: EntryListConfig;

  constructor(config: EntryListConfig) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'entry-list';
    this.element.style.cssText = `
      width: 250px;
      min-width: 200px;
      background: #181825;
      border-right: 1px solid #313244;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // Header with title and add button
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    const title = document.createElement('h3');
    title.textContent = config.title;
    title.style.cssText = `
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #cdd6f4;
    `;
    header.appendChild(title);

    if (config.onCreate) {
      const addBtn = document.createElement('button');
      addBtn.textContent = '+';
      addBtn.title = `New ${config.title.slice(0, -1)}`;
      addBtn.style.cssText = `
        width: 24px;
        height: 24px;
        border: none;
        border-radius: 4px;
        background: #45475a;
        color: #cdd6f4;
        font-size: 16px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.15s;
      `;
      addBtn.onmouseenter = () => addBtn.style.background = '#585b70';
      addBtn.onmouseleave = () => addBtn.style.background = '#45475a';
      addBtn.onclick = () => config.onCreate?.();
      header.appendChild(addBtn);
    }

    this.element.appendChild(header);

    // Search input
    const searchContainer = document.createElement('div');
    searchContainer.style.cssText = `
      padding: 8px 12px;
      border-bottom: 1px solid #313244;
    `;

    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = config.placeholder ?? 'Search...';
    this.searchInput.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #313244;
      border-radius: 6px;
      background: #1e1e2e;
      color: #cdd6f4;
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s;
    `;
    this.searchInput.onfocus = () => this.searchInput.style.borderColor = '#89b4fa';
    this.searchInput.onblur = () => this.searchInput.style.borderColor = '#313244';
    this.searchInput.oninput = () => this.render();

    searchContainer.appendChild(this.searchInput);
    this.element.appendChild(searchContainer);

    // List container
    this.listContainer = document.createElement('div');
    this.listContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    `;
    this.element.appendChild(this.listContainer);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setItems(items: EntryListItem[]): void {
    this.items = items;
    this.render();
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.render();
  }

  private render(): void {
    const query = this.searchInput.value.toLowerCase();
    const filtered = this.items.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.subtitle?.toLowerCase().includes(query) ||
      item.id.toLowerCase().includes(query)
    );

    this.listContainer.innerHTML = '';

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = `
        padding: 20px;
        text-align: center;
        color: #6c7086;
        font-size: 13px;
      `;
      empty.textContent = this.items.length === 0 ? 'No entries yet' : 'No matches found';
      this.listContainer.appendChild(empty);
      return;
    }

    for (const item of filtered) {
      const row = document.createElement('div');
      const isSelected = item.id === this.selectedId;
      row.style.cssText = `
        padding: 10px 12px;
        margin-bottom: 4px;
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s;
        background: ${isSelected ? '#313244' : 'transparent'};
      `;
      row.onmouseenter = () => {
        if (!isSelected) row.style.background = '#1e1e2e';
      };
      row.onmouseleave = () => {
        row.style.background = isSelected ? '#313244' : 'transparent';
      };
      row.onclick = () => {
        this.selectedId = item.id;
        this.config.onSelect(item.id);
        this.render();
      };

      // Icon + text
      const content = document.createElement('div');
      content.style.cssText = `display: flex; align-items: center; gap: 8px;`;

      if (item.icon) {
        const icon = document.createElement('span');
        icon.textContent = item.icon;
        icon.style.fontSize = '16px';
        content.appendChild(icon);
      }

      const textContainer = document.createElement('div');
      textContainer.style.cssText = `flex: 1; min-width: 0;`;

      const name = document.createElement('div');
      name.textContent = item.name;
      name.style.cssText = `
        font-size: 13px;
        color: #cdd6f4;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      `;
      textContainer.appendChild(name);

      if (item.subtitle) {
        const subtitle = document.createElement('div');
        subtitle.textContent = item.subtitle;
        subtitle.style.cssText = `
          font-size: 11px;
          color: #6c7086;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        `;
        textContainer.appendChild(subtitle);
      }

      content.appendChild(textContainer);
      row.appendChild(content);
      this.listContainer.appendChild(row);
    }
  }
}
