/**
 * Editor Toolbar
 *
 * Contains tabs and main actions: Preview, Publish, etc.
 */

import { TabBar } from './components';

export interface ToolbarOptions {
  onPreview: () => void;
  onPublish: () => void;
}

export class Toolbar {
  private element: HTMLElement;
  private tabBar: TabBar;

  constructor(options: ToolbarOptions) {
    this.element = document.createElement('div');
    this.element.style.cssText = `
      height: 48px;
      background: #181825;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      padding: 0 16px;
      gap: 12px;
    `;

    // Logo/title
    const title = document.createElement('div');
    title.style.cssText = `
      font-weight: 600;
      font-size: 14px;
      color: #cdd6f4;
      padding-right: 16px;
      border-right: 1px solid #313244;
    `;
    title.textContent = '🍬 Sugar Engine';
    this.element.appendChild(title);

    // Tab bar
    this.tabBar = new TabBar();
    this.element.appendChild(this.tabBar.getElement());

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Preview button
    const previewBtn = this.createButton('▶ Preview', '#a6e3a1', options.onPreview);
    this.element.appendChild(previewBtn);

    // Publish button
    const publishBtn = this.createButton('🚀 Publish', '#89b4fa', options.onPublish);
    this.element.appendChild(publishBtn);
  }

  private createButton(text: string, color: string, onClick: () => void): HTMLElement {
    const button = document.createElement('button');
    button.textContent = text;
    button.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: ${color}22;
      color: ${color};
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    `;

    button.addEventListener('mouseenter', () => {
      button.style.background = `${color}44`;
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = `${color}22`;
    });
    button.addEventListener('click', onClick);

    return button;
  }

  getElement(): HTMLElement {
    return this.element;
  }
}
