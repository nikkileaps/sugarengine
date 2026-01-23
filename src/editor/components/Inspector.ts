/**
 * Inspector - Right panel for editing entry properties
 *
 * Displays editable fields for the currently selected entry.
 */

export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox' | 'number';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];  // For select type
  placeholder?: string;
  required?: boolean;
}

export interface InspectorConfig {
  title: string;
  fields: FieldDefinition[];
  onChange: (key: string, value: unknown) => void;
}

export class Inspector {
  private element: HTMLElement;
  private contentContainer: HTMLElement;
  private config: InspectorConfig;
  private data: Record<string, unknown> = {};

  constructor(config: InspectorConfig) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'inspector';
    this.element.style.cssText = `
      width: 300px;
      min-width: 250px;
      background: #181825;
      border-left: 1px solid #313244;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      border-bottom: 1px solid #313244;
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
    this.element.appendChild(header);

    // Content container
    this.contentContainer = document.createElement('div');
    this.contentContainer.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    `;
    this.element.appendChild(this.contentContainer);

    this.renderEmpty();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setData(data: Record<string, unknown>): void {
    this.data = data;
    this.render();
  }

  clear(): void {
    this.data = {};
    this.renderEmpty();
  }

  private renderEmpty(): void {
    this.contentContainer.innerHTML = '';
    const empty = document.createElement('div');
    empty.style.cssText = `
      padding: 20px;
      text-align: center;
      color: #6c7086;
      font-size: 13px;
    `;
    empty.textContent = 'Select an entry to edit';
    this.contentContainer.appendChild(empty);
  }

  private render(): void {
    this.contentContainer.innerHTML = '';

    for (const field of this.config.fields) {
      const fieldGroup = document.createElement('div');
      fieldGroup.style.cssText = `margin-bottom: 16px;`;

      // Label
      const label = document.createElement('label');
      label.textContent = field.label;
      label.style.cssText = `
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: #a6adc8;
        margin-bottom: 6px;
      `;
      if (field.required) {
        const asterisk = document.createElement('span');
        asterisk.textContent = ' *';
        asterisk.style.color = '#f38ba8';
        label.appendChild(asterisk);
      }
      fieldGroup.appendChild(label);

      // Input
      const input = this.createInput(field);
      fieldGroup.appendChild(input);

      this.contentContainer.appendChild(fieldGroup);
    }
  }

  private createInput(field: FieldDefinition): HTMLElement {
    const baseStyle = `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #313244;
      border-radius: 6px;
      background: #1e1e2e;
      color: #cdd6f4;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      transition: border-color 0.15s;
    `;

    const value = this.data[field.key];

    switch (field.type) {
      case 'textarea': {
        const textarea = document.createElement('textarea');
        textarea.value = (value as string) ?? '';
        textarea.placeholder = field.placeholder ?? '';
        textarea.style.cssText = baseStyle + `
          min-height: 80px;
          resize: vertical;
        `;
        textarea.onfocus = () => textarea.style.borderColor = '#89b4fa';
        textarea.onblur = () => textarea.style.borderColor = '#313244';
        textarea.oninput = () => this.config.onChange(field.key, textarea.value);
        return textarea;
      }

      case 'select': {
        const select = document.createElement('select');
        select.style.cssText = baseStyle + `cursor: pointer;`;

        // Add empty option if not required
        if (!field.required) {
          const emptyOpt = document.createElement('option');
          emptyOpt.value = '';
          emptyOpt.textContent = '-- None --';
          select.appendChild(emptyOpt);
        }

        for (const opt of field.options ?? []) {
          const option = document.createElement('option');
          option.value = opt.value;
          option.textContent = opt.label;
          option.selected = value === opt.value;
          select.appendChild(option);
        }

        select.onfocus = () => select.style.borderColor = '#89b4fa';
        select.onblur = () => select.style.borderColor = '#313244';
        select.onchange = () => this.config.onChange(field.key, select.value);
        return select;
      }

      case 'checkbox': {
        const container = document.createElement('div');
        container.style.cssText = `display: flex; align-items: center; gap: 8px;`;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(value);
        checkbox.style.cssText = `
          width: 16px;
          height: 16px;
          cursor: pointer;
        `;
        checkbox.onchange = () => this.config.onChange(field.key, checkbox.checked);
        container.appendChild(checkbox);

        return container;
      }

      case 'number': {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = String(value ?? '');
        input.placeholder = field.placeholder ?? '';
        input.style.cssText = baseStyle;
        input.onfocus = () => input.style.borderColor = '#89b4fa';
        input.onblur = () => input.style.borderColor = '#313244';
        input.oninput = () => this.config.onChange(field.key, Number(input.value) || 0);
        return input;
      }

      case 'text':
      default: {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = (value as string) ?? '';
        input.placeholder = field.placeholder ?? '';
        input.style.cssText = baseStyle;
        input.onfocus = () => input.style.borderColor = '#89b4fa';
        input.onblur = () => input.style.borderColor = '#313244';
        input.oninput = () => this.config.onChange(field.key, input.value);
        return input;
      }
    }
  }
}
