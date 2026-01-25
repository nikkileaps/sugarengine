/**
 * StructureDialog - Manages seasons and episodes
 *
 * Opened from Project > Structure menu item.
 * Allows creating, editing, and deleting seasons and episodes.
 */

import { generateUUID } from '../utils';
import type { Season, Episode } from '../../engine/episodes/types';

export interface StructureDialogConfig {
  onSeasonsChange: (seasons: Season[]) => void;
  onEpisodesChange: (episodes: Episode[]) => void;
  getRegions: () => { id: string; name: string }[];
}

export class StructureDialog {
  private overlay: HTMLElement | null = null;
  private seasons: Season[] = [];
  private episodes: Episode[] = [];
  private config: StructureDialogConfig;
  private selectedSeasonId: string | null = null;
  private selectedEpisodeId: string | null = null;

  constructor(config: StructureDialogConfig) {
    this.config = config;
  }

  setData(seasons: Season[], episodes: Episode[]): void {
    this.seasons = [...seasons];
    this.episodes = [...episodes];
  }

  open(): void {
    if (this.overlay) return;

    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `;
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) this.close();
    };

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #1e1e2e;
      border-radius: 12px;
      width: 700px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #313244;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const title = document.createElement('h2');
    title.textContent = 'Project Structure';
    title.style.cssText = 'margin: 0; font-size: 18px; color: #cdd6f4;';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: none;
      border: none;
      color: #6c7086;
      font-size: 18px;
      cursor: pointer;
      padding: 4px 8px;
    `;
    closeBtn.onclick = () => this.close();
    header.appendChild(closeBtn);
    dialog.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.style.cssText = `
      display: flex;
      flex: 1;
      overflow: hidden;
    `;

    // Left panel - Seasons
    const seasonsPanel = this.createSeasonsPanel();
    content.appendChild(seasonsPanel);

    // Middle panel - Episodes
    const episodesPanel = this.createEpisodesPanel();
    content.appendChild(episodesPanel);

    // Right panel - Details
    const detailsPanel = this.createDetailsPanel();
    content.appendChild(detailsPanel);

    dialog.appendChild(content);
    this.overlay.appendChild(dialog);
    document.body.appendChild(this.overlay);

    // Select first season if exists
    if (this.seasons.length > 0 && !this.selectedSeasonId) {
      const firstSeason = this.seasons[0];
      if (firstSeason) {
        this.selectedSeasonId = firstSeason.id;
        this.render();
      }
    }
  }

  close(): void {
    if (this.overlay) {
      document.body.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  private createSeasonsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'seasons-panel';
    panel.style.cssText = `
      width: 180px;
      border-right: 1px solid #313244;
      display: flex;
      flex-direction: column;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      border-bottom: 1px solid #313244;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const label = document.createElement('span');
    label.textContent = 'Seasons';
    label.style.cssText = 'font-size: 12px; color: #6c7086; font-weight: 600; text-transform: uppercase;';
    header.appendChild(label);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.style.cssText = `
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 4px;
      background: #45475a;
      color: #cdd6f4;
      cursor: pointer;
      font-size: 14px;
    `;
    addBtn.onclick = () => this.addSeason();
    header.appendChild(addBtn);
    panel.appendChild(header);

    const list = document.createElement('div');
    list.className = 'seasons-list';
    list.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';
    panel.appendChild(list);

    return panel;
  }

  private createEpisodesPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'episodes-panel';
    panel.style.cssText = `
      width: 200px;
      border-right: 1px solid #313244;
      display: flex;
      flex-direction: column;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      border-bottom: 1px solid #313244;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const label = document.createElement('span');
    label.textContent = 'Episodes';
    label.style.cssText = 'font-size: 12px; color: #6c7086; font-weight: 600; text-transform: uppercase;';
    header.appendChild(label);

    const addBtn = document.createElement('button');
    addBtn.className = 'add-episode-btn';
    addBtn.textContent = '+';
    addBtn.style.cssText = `
      width: 22px;
      height: 22px;
      border: none;
      border-radius: 4px;
      background: #45475a;
      color: #cdd6f4;
      cursor: pointer;
      font-size: 14px;
    `;
    addBtn.onclick = () => this.addEpisode();
    header.appendChild(addBtn);
    panel.appendChild(header);

    const list = document.createElement('div');
    list.className = 'episodes-list';
    list.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';
    panel.appendChild(list);

    return panel;
  }

  private createDetailsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'details-panel';
    panel.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 16px;
      overflow-y: auto;
    `;
    return panel;
  }

  private render(): void {
    if (!this.overlay) return;

    // Render seasons list
    const seasonsList = this.overlay.querySelector('.seasons-list') as HTMLElement;
    if (seasonsList) {
      seasonsList.innerHTML = '';
      const sortedSeasons = [...this.seasons].sort((a, b) => a.order - b.order);
      for (const season of sortedSeasons) {
        const item = this.createSeasonItem(season);
        seasonsList.appendChild(item);
      }
    }

    // Render episodes list
    const episodesList = this.overlay.querySelector('.episodes-list') as HTMLElement;
    const addEpisodeBtn = this.overlay.querySelector('.add-episode-btn') as HTMLButtonElement;
    if (episodesList) {
      episodesList.innerHTML = '';
      if (this.selectedSeasonId) {
        const seasonEpisodes = this.episodes
          .filter(e => e.seasonId === this.selectedSeasonId)
          .sort((a, b) => a.order - b.order);
        for (const episode of seasonEpisodes) {
          const item = this.createEpisodeItem(episode);
          episodesList.appendChild(item);
        }
        if (addEpisodeBtn) addEpisodeBtn.style.display = 'block';
      } else {
        const placeholder = document.createElement('div');
        placeholder.textContent = 'Select a season';
        placeholder.style.cssText = 'color: #6c7086; font-size: 12px; padding: 8px;';
        episodesList.appendChild(placeholder);
        if (addEpisodeBtn) addEpisodeBtn.style.display = 'none';
      }
    }

    // Render details panel
    const detailsPanel = this.overlay.querySelector('.details-panel') as HTMLElement;
    if (detailsPanel) {
      detailsPanel.innerHTML = '';
      if (this.selectedEpisodeId) {
        const episode = this.episodes.find(e => e.id === this.selectedEpisodeId);
        if (episode) {
          this.renderEpisodeDetails(detailsPanel, episode);
        }
      } else if (this.selectedSeasonId) {
        const season = this.seasons.find(s => s.id === this.selectedSeasonId);
        if (season) {
          this.renderSeasonDetails(detailsPanel, season);
        }
      } else {
        const placeholder = document.createElement('div');
        placeholder.textContent = 'Select a season or episode to edit';
        placeholder.style.cssText = 'color: #6c7086; font-size: 13px;';
        detailsPanel.appendChild(placeholder);
      }
    }
  }

  private createSeasonItem(season: Season): HTMLElement {
    const item = document.createElement('div');
    const isSelected = season.id === this.selectedSeasonId;
    item.style.cssText = `
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 4px;
      background: ${isSelected ? '#313244' : 'transparent'};
      color: ${isSelected ? '#cdd6f4' : '#a6adc8'};
      font-size: 13px;
    `;
    item.textContent = season.name;
    item.onclick = () => {
      this.selectedSeasonId = season.id;
      this.selectedEpisodeId = null;
      this.render();
    };
    return item;
  }

  private createEpisodeItem(episode: Episode): HTMLElement {
    const item = document.createElement('div');
    const isSelected = episode.id === this.selectedEpisodeId;
    item.style.cssText = `
      padding: 8px 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 4px;
      background: ${isSelected ? '#313244' : 'transparent'};
      color: ${isSelected ? '#cdd6f4' : '#a6adc8'};
      font-size: 13px;
    `;
    item.textContent = `E${episode.order}: ${episode.name}`;
    item.onclick = () => {
      this.selectedEpisodeId = episode.id;
      this.render();
    };
    return item;
  }

  private renderSeasonDetails(container: HTMLElement, season: Season): void {
    const title = document.createElement('h3');
    title.textContent = 'Season Details';
    title.style.cssText = 'margin: 0 0 16px 0; font-size: 14px; color: #cdd6f4;';
    container.appendChild(title);

    // Name field
    container.appendChild(this.createField('Name', season.name, (value) => {
      season.name = value;
      this.notifyChange();
    }));

    // Order field
    container.appendChild(this.createField('Order', String(season.order), (value) => {
      season.order = parseInt(value) || 1;
      this.notifyChange();
    }, 'number'));

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Season';
    deleteBtn.style.cssText = `
      margin-top: 24px;
      padding: 8px 16px;
      background: #f38ba822;
      border: 1px solid #f38ba8;
      border-radius: 6px;
      color: #f38ba8;
      font-size: 12px;
      cursor: pointer;
    `;
    deleteBtn.onclick = () => this.deleteSeason(season.id);
    container.appendChild(deleteBtn);
  }

  private renderEpisodeDetails(container: HTMLElement, episode: Episode): void {
    const title = document.createElement('h3');
    title.textContent = 'Episode Details';
    title.style.cssText = 'margin: 0 0 16px 0; font-size: 14px; color: #cdd6f4;';
    container.appendChild(title);

    // Name field
    container.appendChild(this.createField('Name', episode.name, (value) => {
      episode.name = value;
      this.notifyChange();
    }));

    // Order field
    container.appendChild(this.createField('Order', String(episode.order), (value) => {
      episode.order = parseInt(value) || 1;
      this.notifyChange();
    }, 'number'));

    // Start Region dropdown
    const regions = this.config.getRegions();
    container.appendChild(this.createSelectField('Start Region', episode.startRegion || '', [
      { value: '', label: '(none)' },
      ...regions.map(r => ({ value: r.id, label: r.name }))
    ], (value) => {
      episode.startRegion = value;
      this.notifyChange();
    }));

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Episode';
    deleteBtn.style.cssText = `
      margin-top: 24px;
      padding: 8px 16px;
      background: #f38ba822;
      border: 1px solid #f38ba8;
      border-radius: 6px;
      color: #f38ba8;
      font-size: 12px;
      cursor: pointer;
    `;
    deleteBtn.onclick = () => this.deleteEpisode(episode.id);
    container.appendChild(deleteBtn);
  }

  private createField(label: string, value: string, onChange: (value: string) => void, type = 'text'): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 16px;';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display: block; font-size: 12px; color: #6c7086; margin-bottom: 4px;';
    wrapper.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 6px;
      color: #cdd6f4;
      font-size: 13px;
      box-sizing: border-box;
    `;
    input.oninput = () => onChange(input.value);
    wrapper.appendChild(input);

    return wrapper;
  }

  private createSelectField(label: string, value: string, options: { value: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 16px;';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display: block; font-size: 12px; color: #6c7086; margin-bottom: 4px;';
    wrapper.appendChild(labelEl);

    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      padding: 8px 12px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 6px;
      color: #cdd6f4;
      font-size: 13px;
      box-sizing: border-box;
    `;

    for (const opt of options) {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      option.selected = opt.value === value;
      select.appendChild(option);
    }

    select.onchange = () => onChange(select.value);
    wrapper.appendChild(select);

    return wrapper;
  }

  private addSeason(): void {
    const order = this.seasons.length + 1;
    const season: Season = {
      id: generateUUID(),
      name: `Season ${order}`,
      order
    };
    this.seasons.push(season);
    this.selectedSeasonId = season.id;
    this.selectedEpisodeId = null;
    this.notifyChange();
    this.render();
  }

  private addEpisode(): void {
    if (!this.selectedSeasonId) return;

    const seasonEpisodes = this.episodes.filter(e => e.seasonId === this.selectedSeasonId);
    const order = seasonEpisodes.length + 1;
    const episode: Episode = {
      id: generateUUID(),
      seasonId: this.selectedSeasonId,
      name: `Episode ${order}`,
      order,
      startRegion: ''
    };
    this.episodes.push(episode);
    this.selectedEpisodeId = episode.id;
    this.notifyChange();
    this.render();
  }

  private deleteSeason(seasonId: string): void {
    if (!confirm('Delete this season and all its episodes?')) return;

    this.seasons = this.seasons.filter(s => s.id !== seasonId);
    this.episodes = this.episodes.filter(e => e.seasonId !== seasonId);

    if (this.selectedSeasonId === seasonId) {
      this.selectedSeasonId = this.seasons[0]?.id || null;
      this.selectedEpisodeId = null;
    }

    this.notifyChange();
    this.render();
  }

  private deleteEpisode(episodeId: string): void {
    if (!confirm('Delete this episode?')) return;

    this.episodes = this.episodes.filter(e => e.id !== episodeId);

    if (this.selectedEpisodeId === episodeId) {
      this.selectedEpisodeId = null;
    }

    this.notifyChange();
    this.render();
  }

  private notifyChange(): void {
    this.config.onSeasonsChange([...this.seasons]);
    this.config.onEpisodesChange([...this.episodes]);
  }
}
