/**
 * ItemPanel - Editor for item database
 *
 * Features:
 * - Item list with category filtering
 * - Icon preview
 * - Category color-coding
 * - Usage tracking (shows quests/dialogues using this item)
 * - Duplicate item button
 */

import { BasePanel } from './BasePanel';
import { editorStore } from '../store';
import { generateUUID, shortId } from '../utils';
import type { FieldDefinition } from '../components';

interface ItemDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: 'quest' | 'gift' | 'key' | 'misc';
  stackable: boolean;
  maxStack?: number;
  giftable: boolean;
}

interface QuestUsage {
  id: string;
  name: string;
  stageName: string;
  objectiveDesc: string;
  type: 'collect' | 'reward';
}

// Available data for usage tracking
let availableQuests: {
  id: string;
  name: string;
  stages: { id: string; description: string; objectives: { type: string; target: string; description: string }[] }[];
  rewards?: { type: string; itemId?: string }[];
}[] = [];

export function setAvailableQuestsForItems(quests: typeof availableQuests): void {
  availableQuests = quests;
}

const ITEM_FIELDS: FieldDefinition[] = [
  { key: 'id', label: 'ID', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
  { key: 'icon', label: 'Icon Path', type: 'text', placeholder: '/icons/item.png' },
  {
    key: 'category',
    label: 'Category',
    type: 'select',
    required: true,
    options: [
      { value: 'quest', label: 'Quest Item' },
      { value: 'gift', label: 'Gift' },
      { value: 'key', label: 'Key Item' },
      { value: 'misc', label: 'Miscellaneous' },
    ],
  },
  { key: 'stackable', label: 'Stackable', type: 'checkbox' },
  { key: 'maxStack', label: 'Max Stack', type: 'number' },
  { key: 'giftable', label: 'Giftable', type: 'checkbox' },
];

const CATEGORY_COLORS: Record<string, string> = {
  quest: '#f38ba8',
  gift: '#f9e2af',
  key: '#89b4fa',
  misc: '#a6adc8',
};

const CATEGORY_ICONS: Record<string, string> = {
  quest: '📜',
  gift: '🎁',
  key: '🔑',
  misc: '📦',
};

export class ItemPanel extends BasePanel {
  private items: Map<string, ItemDefinition> = new Map();
  private currentItemId: string | null = null;

  constructor() {
    super({
      title: 'Items',
      inspectorTitle: 'Item Properties',
      inspectorFields: ITEM_FIELDS,
      onCreate: () => this.createNewItem(),
    });

    this.renderCenterPlaceholder();
  }

  addItem(item: ItemDefinition): void {
    this.items.set(item.id, item);
    this.updateEntryList();
  }

  getItems(): ItemDefinition[] {
    return Array.from(this.items.values());
  }

  private updateEntryList(): void {
    const items = Array.from(this.items.values()).map(i => ({
      id: i.id,
      name: i.name,
      subtitle: `${i.category} · ${shortId(i.id)}`,
      icon: CATEGORY_ICONS[i.category] || '📦',
    }));
    this.setEntries(items);
  }

  private findQuestUsages(itemId: string): QuestUsage[] {
    const usages: QuestUsage[] = [];

    for (const quest of availableQuests) {
      // Check objectives
      for (const stage of quest.stages) {
        for (const obj of stage.objectives) {
          if (obj.type === 'collect' && obj.target === itemId) {
            usages.push({
              id: quest.id,
              name: quest.name,
              stageName: stage.id,
              objectiveDesc: obj.description,
              type: 'collect',
            });
          }
        }
      }

      // Check rewards
      if (quest.rewards) {
        for (const reward of quest.rewards) {
          if (reward.type === 'item' && reward.itemId === itemId) {
            usages.push({
              id: quest.id,
              name: quest.name,
              stageName: 'Rewards',
              objectiveDesc: 'Quest reward',
              type: 'reward',
            });
          }
        }
      }
    }

    return usages;
  }

  private renderCenterPlaceholder(): void {
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #6c7086;
      gap: 12px;
    `;
    placeholder.innerHTML = `
      <div style="font-size: 48px;">🎒</div>
      <div style="font-size: 16px;">Select an item to edit</div>
      <div style="font-size: 13px; max-width: 300px; text-align: center; line-height: 1.5;">
        Choose an item from the list on the left, or create a new one with the + button.
      </div>
    `;
    this.setCenterContent(placeholder);
  }

  private renderItemDetail(item: ItemDefinition): void {
    const detail = document.createElement('div');
    detail.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    `;

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    `;

    const duplicateBtn = document.createElement('button');
    duplicateBtn.textContent = 'Duplicate';
    duplicateBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #313244;
      border-radius: 4px;
      background: #313244;
      color: #cdd6f4;
      font-size: 12px;
      cursor: pointer;
    `;
    duplicateBtn.onclick = () => this.duplicateItem(item);
    toolbar.appendChild(duplicateBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #f38ba8;
      border-radius: 4px;
      background: transparent;
      color: #f38ba8;
      font-size: 12px;
      cursor: pointer;
    `;
    deleteBtn.onclick = () => this.deleteItem(item);
    toolbar.appendChild(deleteBtn);

    detail.appendChild(toolbar);

    // Header with icon
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      gap: 24px;
      align-items: flex-start;
    `;

    // Icon
    const iconContainer = document.createElement('div');
    iconContainer.style.cssText = `
      width: 80px;
      height: 80px;
      background: #181825;
      border: 2px solid ${CATEGORY_COLORS[item.category]};
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      overflow: hidden;
      position: relative;
    `;

    if (item.icon) {
      const img = document.createElement('img');
      img.src = item.icon;
      img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: contain;
      `;
      img.onerror = () => {
        img.style.display = 'none';
        iconContainer.textContent = CATEGORY_ICONS[item.category] || '📦';
      };
      iconContainer.appendChild(img);
    } else {
      iconContainer.textContent = CATEGORY_ICONS[item.category] || '📦';
    }

    // Upload overlay
    const uploadOverlay = document.createElement('div');
    uploadOverlay.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 4px;
      background: rgba(0,0,0,0.7);
      text-align: center;
      font-size: 9px;
      color: #a6adc8;
      cursor: pointer;
    `;
    uploadOverlay.textContent = 'Change';
    uploadOverlay.onclick = () => {
      const path = prompt('Enter icon path:', item.icon || '/icons/');
      if (path !== null) {
        item.icon = path;
        editorStore.setDirty(true);
        this.renderItemDetail(item);
      }
    };
    iconContainer.appendChild(uploadOverlay);
    header.appendChild(iconContainer);

    // Info
    const info = document.createElement('div');
    info.style.cssText = `flex: 1;`;

    const name = document.createElement('h2');
    name.textContent = item.name;
    name.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 20px;
      color: #cdd6f4;
    `;
    info.appendChild(name);

    const categoryBadge = document.createElement('span');
    categoryBadge.textContent = item.category;
    categoryBadge.style.cssText = `
      display: inline-block;
      padding: 4px 8px;
      background: ${CATEGORY_COLORS[item.category]}22;
      color: ${CATEGORY_COLORS[item.category]};
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 12px;
    `;
    info.appendChild(categoryBadge);

    const description = document.createElement('p');
    description.textContent = item.description || 'No description';
    description.style.cssText = `
      margin: 0;
      font-size: 13px;
      color: #a6adc8;
      line-height: 1.5;
    `;
    info.appendChild(description);

    header.appendChild(info);
    detail.appendChild(header);

    // Properties
    const propsSection = document.createElement('div');
    propsSection.style.cssText = `
      padding: 16px;
      background: #181825;
      border-radius: 8px;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    `;

    const props = [
      { label: 'Stackable', value: item.stackable ? 'Yes' : 'No', icon: item.stackable ? '✓' : '✗' },
      { label: 'Max Stack', value: item.stackable ? String(item.maxStack ?? '∞') : 'N/A', icon: null },
      { label: 'Giftable', value: item.giftable ? 'Yes' : 'No', icon: item.giftable ? '🎁' : null },
      { label: 'ID', value: item.id, icon: null, mono: true },
    ];

    for (const prop of props) {
      const propEl = document.createElement('div');

      const label = document.createElement('div');
      label.textContent = prop.label;
      label.style.cssText = `
        font-size: 11px;
        color: #6c7086;
        margin-bottom: 4px;
      `;
      propEl.appendChild(label);

      const valueContainer = document.createElement('div');
      valueContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: #cdd6f4;
        ${prop.mono ? 'font-family: monospace; font-size: 12px;' : ''}
      `;

      if (prop.icon) {
        const icon = document.createElement('span');
        icon.textContent = prop.icon;
        icon.style.fontSize = '12px';
        valueContainer.appendChild(icon);
      }

      const value = document.createElement('span');
      value.textContent = prop.value;
      valueContainer.appendChild(value);

      propEl.appendChild(valueContainer);
      propsSection.appendChild(propEl);
    }

    detail.appendChild(propsSection);

    // Usage section
    const usages = this.findQuestUsages(item.id);

    const usageSection = document.createElement('div');
    usageSection.style.cssText = `
      padding: 16px;
      background: #181825;
      border-radius: 8px;
    `;

    const usageTitle = document.createElement('h3');
    usageTitle.textContent = 'Usage';
    usageTitle.style.cssText = `
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #cdd6f4;
    `;
    usageSection.appendChild(usageTitle);

    if (usages.length === 0) {
      const noUsage = document.createElement('div');
      noUsage.textContent = 'This item is not used in any quests.';
      noUsage.style.cssText = `
        font-size: 12px;
        color: #6c7086;
        font-style: italic;
      `;
      usageSection.appendChild(noUsage);
    } else {
      // Group by type
      const collectUsages = usages.filter(u => u.type === 'collect');
      const rewardUsages = usages.filter(u => u.type === 'reward');

      if (collectUsages.length > 0) {
        const header = document.createElement('div');
        header.textContent = `Required in Quests (${collectUsages.length})`;
        header.style.cssText = `
          font-size: 11px;
          color: #6c7086;
          margin-bottom: 8px;
          text-transform: uppercase;
        `;
        usageSection.appendChild(header);

        for (const usage of collectUsages) {
          usageSection.appendChild(this.createUsageElement(usage));
        }
      }

      if (rewardUsages.length > 0) {
        const header = document.createElement('div');
        header.textContent = `Quest Rewards (${rewardUsages.length})`;
        header.style.cssText = `
          font-size: 11px;
          color: #6c7086;
          margin: ${collectUsages.length > 0 ? '12px' : '0'} 0 8px 0;
          text-transform: uppercase;
        `;
        usageSection.appendChild(header);

        for (const usage of rewardUsages) {
          usageSection.appendChild(this.createUsageElement(usage));
        }
      }
    }

    detail.appendChild(usageSection);

    this.setCenterContent(detail);
  }

  private createUsageElement(usage: QuestUsage): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `
      padding: 8px;
      margin-bottom: 4px;
      background: #1e1e2e;
      border-radius: 4px;
      cursor: pointer;
    `;
    el.onclick = () => {
      editorStore.setActiveTab('quests');
      editorStore.selectEntry(usage.id);
    };

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    const icon = document.createElement('span');
    icon.textContent = '📜';
    icon.style.fontSize = '14px';
    header.appendChild(icon);

    const name = document.createElement('span');
    name.textContent = usage.name;
    name.style.cssText = 'font-size: 13px; color: #cdd6f4;';
    header.appendChild(name);

    const badge = document.createElement('span');
    badge.textContent = usage.type === 'collect' ? 'objective' : 'reward';
    badge.style.cssText = `
      margin-left: auto;
      padding: 2px 6px;
      background: ${usage.type === 'collect' ? '#f9e2af22' : '#a6e3a122'};
      color: ${usage.type === 'collect' ? '#f9e2af' : '#a6e3a1'};
      border-radius: 3px;
      font-size: 10px;
    `;
    header.appendChild(badge);

    el.appendChild(header);

    const subtext = document.createElement('div');
    subtext.textContent = `${usage.stageName}: ${usage.objectiveDesc}`;
    subtext.style.cssText = `
      font-size: 11px;
      color: #6c7086;
      margin-top: 4px;
      margin-left: 22px;
    `;
    el.appendChild(subtext);

    return el;
  }

  private duplicateItem(item: ItemDefinition): void {
    const newId = generateUUID();
    const newItem: ItemDefinition = {
      ...item,
      id: newId,
      name: `${item.name} (Copy)`,
    };
    this.addItem(newItem);
    editorStore.selectEntry(newId);
    this.onEntrySelect(newId);
  }

  private deleteItem(item: ItemDefinition): void {
    const usages = this.findQuestUsages(item.id);
    if (usages.length > 0) {
      const confirmed = confirm(
        `This item is used in ${usages.length} quest(s).\n\nAre you sure you want to delete it?`
      );
      if (!confirmed) return;
    } else {
      const confirmed = confirm(`Delete "${item.name}"?`);
      if (!confirmed) return;
    }

    this.items.delete(item.id);
    this.currentItemId = null;
    editorStore.setDirty(true);
    this.updateEntryList();
    this.clearInspector();
    this.renderCenterPlaceholder();
  }

  private createNewItem(): void {
    const id = generateUUID();
    const item: ItemDefinition = {
      id,
      name: 'New Item',
      description: '',
      category: 'misc',
      stackable: true,
      maxStack: 99,
      giftable: false,
    };
    this.addItem(item);
    editorStore.selectEntry(id);
    this.onEntrySelect(id);
  }

  protected onEntrySelect(id: string): void {
    this.currentItemId = id;

    const item = this.items.get(id);
    if (item) {
      this.setInspectorData({
        id: item.id,
        name: item.name,
        description: item.description,
        icon: item.icon ?? '',
        category: item.category,
        stackable: item.stackable,
        maxStack: item.maxStack ?? 99,
        giftable: item.giftable,
      });
      this.renderItemDetail(item);
      this.entryList.setSelected(id);
    } else {
      this.clearInspector();
      this.renderCenterPlaceholder();
    }
  }

  protected onFieldChange(key: string, value: unknown): void {
    if (!this.currentItemId) return;

    const item = this.items.get(this.currentItemId);
    if (!item) return;

    (item as unknown as Record<string, unknown>)[key] = value;
    editorStore.setDirty(true);

    this.updateEntryList();
    this.renderItemDetail(item);
  }
}
