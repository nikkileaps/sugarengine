/**
 * StatusBar - Bottom bar for validation warnings and status
 */

import { editorStore, ValidationError } from '../store/EditorStore';

export class StatusBar {
  private element: HTMLElement;
  private statusText: HTMLElement;
  private errorCount: HTMLElement;
  private warningCount: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'status-bar';
    this.element.style.cssText = `
      height: 28px;
      background: #11111b;
      border-top: 1px solid #313244;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 16px;
      font-size: 12px;
      color: #6c7086;
    `;

    // Status text (left)
    this.statusText = document.createElement('span');
    this.statusText.textContent = 'Ready';
    this.element.appendChild(this.statusText);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Error count
    this.errorCount = document.createElement('span');
    this.errorCount.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      color: #f38ba8;
    `;
    this.element.appendChild(this.errorCount);

    // Warning count
    this.warningCount = document.createElement('span');
    this.warningCount.style.cssText = `
      display: flex;
      align-items: center;
      gap: 4px;
      color: #f9e2af;
    `;
    this.element.appendChild(this.warningCount);

    // Subscribe to store changes
    editorStore.subscribe((state) => {
      this.updateValidation(state.validationErrors);
      this.updateDirtyStatus(state.isDirty);
    });

    this.updateValidation([]);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setStatus(text: string): void {
    this.statusText.textContent = text;
  }

  private updateValidation(errors: ValidationError[]): void {
    const errorList = errors.filter(e => e.type === 'error');
    const warningList = errors.filter(e => e.type === 'warning');

    if (errorList.length > 0) {
      this.errorCount.innerHTML = `<span>✕</span> ${errorList.length} error${errorList.length !== 1 ? 's' : ''}`;
      this.errorCount.style.display = 'flex';
    } else {
      this.errorCount.style.display = 'none';
    }

    if (warningList.length > 0) {
      this.warningCount.innerHTML = `<span>⚠</span> ${warningList.length} warning${warningList.length !== 1 ? 's' : ''}`;
      this.warningCount.style.display = 'flex';
    } else {
      this.warningCount.style.display = 'none';
    }
  }

  private updateDirtyStatus(isDirty: boolean): void {
    if (isDirty) {
      this.statusText.textContent = 'Unsaved changes';
      this.statusText.style.color = '#f9e2af';
    } else {
      this.statusText.textContent = 'Ready';
      this.statusText.style.color = '#6c7086';
    }
  }
}
