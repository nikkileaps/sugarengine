/**
 * EpisodeSelector - Toolbar component for selecting current episode context
 *
 * Features:
 * - Season selector dropdown
 * - Episode selector dropdown
 * - Current episode badge
 * - New episode creation
 */

import { editorStore } from '../store';
import { generateUUID } from '../utils';
import type { Season, Episode } from '../../engine/episodes/types';

export interface EpisodeSelectorConfig {
  onSeasonChange?: (seasonId: string) => void;
  onEpisodeChange?: (episodeId: string) => void;
  onCreate?: () => void;
}

export class EpisodeSelector {
  private element: HTMLElement;
  private seasons: Season[] = [];
  private episodes: Episode[] = [];
  private config: EpisodeSelectorConfig;

  constructor(config: EpisodeSelectorConfig = {}) {
    this.config = config;

    this.element = document.createElement('div');
    this.element.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      border-right: 1px solid #313244;
    `;

    this.render();
  }

  setSeasons(seasons: Season[]): void {
    this.seasons = seasons;
    this.render();
  }

  setEpisodes(episodes: Episode[]): void {
    this.episodes = episodes;
    this.render();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.innerHTML = '';

    const state = editorStore.getState();
    const currentSeasonId = state.currentSeasonId;
    const currentEpisodeId = state.currentEpisodeId;

    // If no seasons exist, show "Create First Episode" button
    if (this.seasons.length === 0) {
      const createBtn = document.createElement('button');
      createBtn.textContent = '+ Create First Episode';
      createBtn.style.cssText = `
        padding: 6px 12px;
        background: #89b4fa22;
        border: 1px dashed #89b4fa;
        border-radius: 6px;
        color: #89b4fa;
        font-size: 12px;
        cursor: pointer;
      `;
      createBtn.onclick = () => this.showCreateEpisodeDialog(true);
      this.element.appendChild(createBtn);
      return;
    }

    // Season selector
    const seasonSelect = this.createSelect(
      this.seasons.map(s => ({ value: s.id, label: s.name })),
      currentSeasonId || this.seasons[0]?.id || '',
      (value) => {
        editorStore.setCurrentSeason(value);
        // Auto-select first episode in season
        const seasonEpisodes = this.episodes
          .filter(e => e.seasonId === value)
          .sort((a, b) => a.order - b.order);
        const firstEpisode = seasonEpisodes[0];
        if (firstEpisode) {
          editorStore.setCurrentEpisode(firstEpisode.id);
        }
        this.config.onSeasonChange?.(value);
        this.render();
      }
    );
    this.element.appendChild(seasonSelect);

    // Episode selector
    const seasonEpisodes = this.episodes
      .filter(e => e.seasonId === (currentSeasonId || this.seasons[0]?.id))
      .sort((a, b) => a.order - b.order);

    const episodeSelect = this.createSelect(
      seasonEpisodes.map(e => ({ value: e.id, label: `E${e.order}: ${e.name}` })),
      currentEpisodeId || seasonEpisodes[0]?.id || '',
      (value) => {
        editorStore.setCurrentEpisode(value);
        this.config.onEpisodeChange?.(value);
        this.render();
      }
    );
    this.element.appendChild(episodeSelect);

    // Add episode button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.title = 'Add new episode';
    addBtn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 0;
      background: #45475a;
      border: none;
      border-radius: 4px;
      color: #cdd6f4;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    addBtn.onclick = () => this.showCreateEpisodeDialog(false);
    this.element.appendChild(addBtn);
  }

  private createSelect(
    options: { value: string; label: string }[],
    value: string,
    onChange: (value: string) => void
  ): HTMLSelectElement {
    const select = document.createElement('select');
    select.style.cssText = `
      padding: 6px 10px;
      background: #313244;
      border: 1px solid #45475a;
      border-radius: 6px;
      color: #cdd6f4;
      font-size: 12px;
      cursor: pointer;
      min-width: 100px;
    `;

    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      option.selected = opt.value === value;
      select.appendChild(option);
    }

    select.onchange = () => onChange(select.value);
    return select;
  }

  private showCreateEpisodeDialog(isFirst: boolean): void {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #1e1e2e;
      border-radius: 12px;
      padding: 24px;
      width: 360px;
    `;

    const title = document.createElement('h3');
    title.textContent = isFirst ? 'Create Your First Episode' : 'Create New Episode';
    title.style.cssText = 'margin: 0 0 16px 0; color: #cdd6f4; font-size: 18px;';
    dialog.appendChild(title);

    // Season name (if first)
    let seasonInput: HTMLInputElement | null = null;
    if (isFirst) {
      const seasonLabel = document.createElement('label');
      seasonLabel.textContent = 'Season Name';
      seasonLabel.style.cssText = 'display: block; font-size: 12px; color: #6c7086; margin-bottom: 4px;';
      dialog.appendChild(seasonLabel);

      seasonInput = document.createElement('input');
      seasonInput.type = 'text';
      seasonInput.placeholder = 'Season 1';
      seasonInput.value = 'Season 1';
      seasonInput.style.cssText = `
        width: 100%;
        padding: 10px 12px;
        background: #181825;
        border: 1px solid #313244;
        border-radius: 6px;
        color: #cdd6f4;
        font-size: 14px;
        margin-bottom: 16px;
        box-sizing: border-box;
      `;
      dialog.appendChild(seasonInput);
    }

    // Episode name
    const episodeLabel = document.createElement('label');
    episodeLabel.textContent = 'Episode Name';
    episodeLabel.style.cssText = 'display: block; font-size: 12px; color: #6c7086; margin-bottom: 4px;';
    dialog.appendChild(episodeLabel);

    const episodeInput = document.createElement('input');
    episodeInput.type = 'text';
    episodeInput.placeholder = 'New Beginnings';
    const existingCount = this.episodes.filter(e => {
      const state = editorStore.getState();
      return e.seasonId === state.currentSeasonId;
    }).length;
    episodeInput.value = `Episode ${existingCount + 1}`;
    episodeInput.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 6px;
      color: #cdd6f4;
      font-size: 14px;
      margin-bottom: 24px;
      box-sizing: border-box;
    `;
    dialog.appendChild(episodeInput);

    // Buttons
    const buttonRow = document.createElement('div');
    buttonRow.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = `
      padding: 10px 20px;
      background: transparent;
      border: 1px solid #313244;
      border-radius: 6px;
      color: #6c7086;
      font-size: 13px;
      cursor: pointer;
    `;
    cancelBtn.onclick = () => overlay.remove();
    buttonRow.appendChild(cancelBtn);

    const createBtn = document.createElement('button');
    createBtn.textContent = 'Create';
    createBtn.style.cssText = `
      padding: 10px 20px;
      background: #89b4fa;
      border: none;
      border-radius: 6px;
      color: #1e1e2e;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    `;
    createBtn.onclick = () => {
      let seasonId: string;

      if (isFirst && seasonInput) {
        // Create new season
        seasonId = generateUUID();
        const season: Season = {
          id: seasonId,
          name: seasonInput.value || 'Season 1',
          order: 1,
        };
        this.seasons.push(season);
        editorStore.setCurrentSeason(seasonId);
      } else {
        seasonId = editorStore.getState().currentSeasonId || this.seasons[0]?.id || '';
      }

      // Create new episode
      const episodeId = generateUUID();
      const existingInSeason = this.episodes.filter(e => e.seasonId === seasonId).length || 0;
      const episode: Episode = {
        id: episodeId,
        seasonId,
        name: episodeInput.value || 'New Episode',
        order: existingInSeason + 1,
      };
      this.episodes.push(episode);
      editorStore.setCurrentEpisode(episodeId);
      editorStore.setDirty(true);

      this.config.onCreate?.();
      this.render();
      overlay.remove();
    };
    buttonRow.appendChild(createBtn);

    dialog.appendChild(buttonRow);
    overlay.appendChild(dialog);

    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    document.body.appendChild(overlay);
    (isFirst && seasonInput ? seasonInput : episodeInput).focus();
  }
}
