/**
 * Editor Toolbar
 *
 * Contains tabs and main actions: Preview, etc.
 */

import { TabBar } from './components';
import type { Season, Episode } from '../engine/episodes/types';

export interface ToolbarOptions {
  onPreview: () => void;
  onOpenProjectManager: () => void;
}

export class Toolbar {
  private element: HTMLElement;
  private tabBar: TabBar;
  private projectButtonText!: HTMLElement;
  private previewBtn: HTMLElement;
  private projectLoaded: boolean = false;
  private currentSeason: Season | null = null;
  private currentEpisode: Episode | null = null;

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

    // Project button (opens Project Manager dialog)
    const projectBtnContainer = this.createProjectButton(options.onOpenProjectManager);
    this.element.appendChild(projectBtnContainer);

    // Tab bar
    this.tabBar = new TabBar();
    this.element.appendChild(this.tabBar.getElement());

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    this.element.appendChild(spacer);

    // Preview button
    this.previewBtn = this.createButton('▶ Preview', '#a6e3a1', options.onPreview);
    this.element.appendChild(this.previewBtn);

    // Initial state: disabled until project loaded
    this.updateState();
  }

  private createProjectButton(onClick: () => void): HTMLElement {
    const button = document.createElement('button');
    button.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border: none;
      border-radius: 6px;
      background: #89b4fa22;
      color: #89b4fa;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    `;

    const icon = document.createElement('span');
    icon.textContent = '📁';
    button.appendChild(icon);

    this.projectButtonText = document.createElement('span');
    this.projectButtonText.textContent = 'Open Project';
    button.appendChild(this.projectButtonText);

    button.addEventListener('mouseenter', () => {
      button.style.background = '#89b4fa44';
    });
    button.addEventListener('mouseleave', () => {
      button.style.background = '#89b4fa22';
    });
    button.addEventListener('click', onClick);

    return button;
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

  private updateState(): void {
    // Update project button text
    if (this.projectLoaded && this.currentSeason && this.currentEpisode) {
      this.projectButtonText.textContent = `${this.currentSeason.name}, E${this.currentEpisode.order} ▾`;
    } else if (this.projectLoaded) {
      this.projectButtonText.textContent = 'Select Episode ▾';
    } else {
      this.projectButtonText.textContent = 'Open Project';
    }

    // Update tab bar and preview button state
    const tabBarElement = this.tabBar.getElement();
    const disabled = !this.projectLoaded || !this.currentEpisode;

    tabBarElement.style.opacity = disabled ? '0.5' : '1';
    tabBarElement.style.pointerEvents = disabled ? 'none' : 'auto';

    this.previewBtn.style.opacity = disabled ? '0.5' : '1';
    (this.previewBtn as HTMLButtonElement).disabled = disabled;
    this.previewBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }

  getElement(): HTMLElement {
    return this.element;
  }

  setProjectLoaded(loaded: boolean): void {
    this.projectLoaded = loaded;
    this.updateState();
  }

  setCurrentContext(season: Season | null, episode: Episode | null): void {
    this.currentSeason = season;
    this.currentEpisode = episode;
    this.updateState();
  }
}
