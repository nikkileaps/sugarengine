/**
 * TabBar - Navigation tabs for switching between editor panels
 */

import { EditorTab, editorStore } from '../store/EditorStore';

interface TabDefinition {
  id: EditorTab;
  label: string;
  icon: string;
}

const TABS: TabDefinition[] = [
  { id: 'dialogues', label: 'Dialogues', icon: '💬' },
  { id: 'quests', label: 'Quests', icon: '📜' },
  { id: 'npcs', label: 'NPCs', icon: '👤' },
  { id: 'items', label: 'Items', icon: '🎒' },
  { id: 'inspections', label: 'Inspections', icon: '🔍' },
  { id: 'regions', label: 'Regions', icon: '🗺️' },
];

export class TabBar {
  private element: HTMLElement;
  private tabs: Map<EditorTab, HTMLElement> = new Map();

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'tab-bar';
    this.element.style.cssText = `
      display: flex;
      gap: 4px;
      padding: 0 8px;
    `;

    for (const tab of TABS) {
      const tabEl = this.createTab(tab);
      this.tabs.set(tab.id, tabEl);
      this.element.appendChild(tabEl);
    }

    // Subscribe to store changes
    editorStore.subscribe((state) => {
      this.updateActiveTab(state.activeTab);
    });

    // Set initial state
    this.updateActiveTab(editorStore.getState().activeTab);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private createTab(tab: TabDefinition): HTMLElement {
    const tabEl = document.createElement('button');
    tabEl.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: none;
      border-radius: 6px 6px 0 0;
      background: transparent;
      color: #6c7086;
      font-size: 13px;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
    `;

    const icon = document.createElement('span');
    icon.textContent = tab.icon;
    icon.style.fontSize = '14px';
    tabEl.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = tab.label;
    tabEl.appendChild(label);

    tabEl.onclick = () => editorStore.setActiveTab(tab.id);

    tabEl.onmouseenter = () => {
      if (editorStore.getState().activeTab !== tab.id) {
        tabEl.style.background = '#313244';
      }
    };
    tabEl.onmouseleave = () => {
      if (editorStore.getState().activeTab !== tab.id) {
        tabEl.style.background = 'transparent';
      }
    };

    return tabEl;
  }

  private updateActiveTab(activeTab: EditorTab): void {
    for (const [id, tabEl] of this.tabs) {
      if (id === activeTab) {
        tabEl.style.background = '#1e1e2e';
        tabEl.style.color = '#cdd6f4';
      } else {
        tabEl.style.background = 'transparent';
        tabEl.style.color = '#6c7086';
      }
    }
  }
}
