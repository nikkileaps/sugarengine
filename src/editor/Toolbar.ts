/**
 * Editor Toolbar
 *
 * Contains tabs and main actions: Preview, Publish, etc.
 */

import { TabBar, EpisodeSelector } from './components';
import type { Season, Episode } from '../engine/episodes/types';

export interface ToolbarOptions {
  onPreview: () => void;
  onSave: () => void;
  onLoad: () => void;
  onPublish: () => void;
  onEpisodeChange?: (episodeId: string) => void;
  onSeasonChange?: (seasonId: string) => void;
  onEpisodeCreate?: () => void;
}

export class Toolbar {
  private element: HTMLElement;
  private tabBar: TabBar;
  private episodeSelector: EpisodeSelector;

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

    // Episode selector
    this.episodeSelector = new EpisodeSelector({
      onEpisodeChange: options.onEpisodeChange,
      onSeasonChange: options.onSeasonChange,
      onCreate: options.onEpisodeCreate,
    });
    this.element.appendChild(this.episodeSelector.getElement());

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

    // Project dropdown menu
    const projectMenu = this.createProjectMenu(options);
    this.element.appendChild(projectMenu);
  }

  private createProjectMenu(options: ToolbarOptions): HTMLElement {
    const container = document.createElement('div');
    container.style.cssText = `
      position: relative;
    `;

    // Project button
    const button = document.createElement('button');
    button.textContent = '📁 Project ▾';
    button.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: #89b4fa22;
      color: #89b4fa;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    `;

    // Dropdown menu
    const dropdown = document.createElement('div');
    dropdown.style.cssText = `
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      background: #1e1e2e;
      border: 1px solid #313244;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      min-width: 160px;
      z-index: 1000;
      display: none;
      overflow: hidden;
    `;

    // Menu items
    const menuItems = [
      { label: '💾 Save', onClick: options.onSave, shortcut: '⌘S' },
      { label: '📂 Load', onClick: options.onLoad, shortcut: '⌘O' },
      { type: 'divider' as const },
      { label: '🚀 Publish', onClick: options.onPublish },
    ];

    for (const item of menuItems) {
      if ('type' in item && item.type === 'divider') {
        const divider = document.createElement('div');
        divider.style.cssText = `
          height: 1px;
          background: #313244;
          margin: 4px 0;
        `;
        dropdown.appendChild(divider);
        continue;
      }

      const menuItem = document.createElement('button');
      menuItem.style.cssText = `
        width: 100%;
        padding: 10px 16px;
        border: none;
        background: transparent;
        color: #cdd6f4;
        font-size: 13px;
        text-align: left;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: background 0.1s;
      `;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = item.label!;
      menuItem.appendChild(labelSpan);

      if ('shortcut' in item && item.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.textContent = item.shortcut;
        shortcutSpan.style.cssText = `
          color: #6c7086;
          font-size: 11px;
        `;
        menuItem.appendChild(shortcutSpan);
      }

      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = '#313244';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      menuItem.addEventListener('click', () => {
        dropdown.style.display = 'none';
        item.onClick!();
      });

      dropdown.appendChild(menuItem);
    }

    container.appendChild(dropdown);

    // Toggle dropdown
    let isOpen = false;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen = !isOpen;
      dropdown.style.display = isOpen ? 'block' : 'none';
      button.style.background = isOpen ? '#89b4fa44' : '#89b4fa22';
    });

    button.addEventListener('mouseenter', () => {
      if (!isOpen) button.style.background = '#89b4fa44';
    });
    button.addEventListener('mouseleave', () => {
      if (!isOpen) button.style.background = '#89b4fa22';
    });

    // Close on outside click
    document.addEventListener('click', () => {
      if (isOpen) {
        isOpen = false;
        dropdown.style.display = 'none';
        button.style.background = '#89b4fa22';
      }
    });

    container.appendChild(button);

    return container;
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

  setSeasons(seasons: Season[]): void {
    this.episodeSelector.setSeasons(seasons);
  }

  setEpisodes(episodes: Episode[]): void {
    this.episodeSelector.setEpisodes(episodes);
  }
}
