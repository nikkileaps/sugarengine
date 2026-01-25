/**
 * BasePanel - Abstract base class for editor panels
 *
 * Each panel manages a three-column layout:
 * - Left: Entry list
 * - Center: Canvas/Editor
 * - Right: Inspector
 */

import { EntryList, EntryListItem, Inspector, FieldDefinition } from '../components';

export abstract class BasePanel {
  protected element: HTMLElement;
  protected entryList: EntryList;
  protected inspector: Inspector;
  protected centerPanel: HTMLElement;

  constructor(config: {
    title: string;
    inspectorTitle: string;
    inspectorFields: FieldDefinition[];
    onCreate?: () => void;
  }) {
    this.element = document.createElement('div');
    this.element.className = 'panel';
    this.element.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    // Entry list (left)
    this.entryList = new EntryList({
      title: config.title,
      onSelect: (id) => this.onEntrySelect(id),
      onCreate: config.onCreate,
    });
    this.element.appendChild(this.entryList.getElement());

    // Center panel
    this.centerPanel = document.createElement('div');
    this.centerPanel.style.cssText = `
      flex: 1;
      background: #1e1e2e;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;
    this.element.appendChild(this.centerPanel);

    // Inspector (right)
    this.inspector = new Inspector({
      title: config.inspectorTitle,
      fields: config.inspectorFields,
      onChange: (key, value) => this.onFieldChange(key, value),
    });
    this.element.appendChild(this.inspector.getElement());
  }

  getElement(): HTMLElement {
    return this.element;
  }

  show(): void {
    this.element.style.display = 'flex';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  protected setEntries(items: EntryListItem[]): void {
    this.entryList.setItems(items);
  }

  protected setInspectorData(data: Record<string, unknown>): void {
    this.inspector.setData(data);
  }

  protected clearInspector(): void {
    this.inspector.clear();
  }

  protected setCenterContent(content: HTMLElement): void {
    this.centerPanel.innerHTML = '';
    this.centerPanel.appendChild(content);
  }

  protected abstract onEntrySelect(id: string): void;
  protected abstract onFieldChange(key: string, value: unknown): void;

  /** Clear all data from the panel */
  abstract clear(): void;
}
