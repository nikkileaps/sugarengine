/**
 * ItemPanel - Editor for item database
 */

import { BasePanel } from './BasePanel';
import { editorStore } from '../store';
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
    editorStore.setDirty(true);
  }

  getItems(): ItemDefinition[] {
    return Array.from(this.items.values());
  }

  private updateEntryList(): void {
    const items = Array.from(this.items.values()).map(i => ({
      id: i.id,
      name: i.name,
      subtitle: i.category,
      icon: '🎒',
    }));
    this.setEntries(items);
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

    // Header with icon
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      gap: 24px;
      align-items: flex-start;
    `;

    // Icon placeholder
    const icon = document.createElement('div');
    icon.style.cssText = `
      width: 80px;
      height: 80px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
    `;
    icon.textContent = '📦';
    header.appendChild(icon);

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
      { label: 'Stackable', value: item.stackable ? 'Yes' : 'No' },
      { label: 'Max Stack', value: item.stackable ? String(item.maxStack ?? '∞') : 'N/A' },
      { label: 'Giftable', value: item.giftable ? 'Yes' : 'No' },
      { label: 'ID', value: item.id },
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

      const value = document.createElement('div');
      value.textContent = prop.value;
      value.style.cssText = `
        font-size: 14px;
        color: #cdd6f4;
      `;
      propEl.appendChild(value);

      propsSection.appendChild(propEl);
    }

    detail.appendChild(propsSection);

    // Usage section (placeholder)
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

    const usagePlaceholder = document.createElement('div');
    usagePlaceholder.textContent = 'Quests and dialogues using this item will appear here.';
    usagePlaceholder.style.cssText = `
      font-size: 12px;
      color: #6c7086;
      font-style: italic;
    `;
    usageSection.appendChild(usagePlaceholder);

    detail.appendChild(usageSection);

    this.setCenterContent(detail);
  }

  private createNewItem(): void {
    const id = `item-${Date.now()}`;
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
