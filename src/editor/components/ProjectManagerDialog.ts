/**
 * ProjectManagerDialog - Central hub for project and narrative management
 *
 * Opens on app launch. Handles:
 * - Create/Open/Save projects
 * - Manage seasons and episodes
 * - Select episode to edit
 */

import { generateUUID } from '../utils';
import type { Season, Episode } from '../../engine/episodes/types';

export interface ProjectManagerConfig {
  onProjectCreate: (name: string) => void;
  onProjectOpen: () => void;
  onProjectSave: () => void;
  onEpisodeSelect: (seasonId: string, episodeId: string) => void;
  onSeasonsChange: (seasons: Season[]) => void;
  onEpisodesChange: (episodes: Episode[]) => void;
  getRegions: () => { id: string; name: string }[];
}

export class ProjectManagerDialog {
  private overlay: HTMLElement | null = null;
  private config: ProjectManagerConfig;
  private projectName: string | null = null;
  private seasons: Season[] = [];
  private episodes: Episode[] = [];
  private selectedSeasonId: string | null = null;
  private selectedEpisodeId: string | null = null;
  private hasUnsavedChanges: boolean = false;

  constructor(config: ProjectManagerConfig) {
    this.config = config;
  }

  setProject(name: string, seasons: Season[], episodes: Episode[]): void {
    this.projectName = name;
    this.seasons = [...seasons];
    this.episodes = [...episodes];
    this.hasUnsavedChanges = false;

    // Auto-select first season if exists
    if (this.seasons.length > 0 && !this.selectedSeasonId) {
      const firstSeason = this.seasons.sort((a, b) => a.order - b.order)[0];
      if (firstSeason) {
        this.selectedSeasonId = firstSeason.id;
      }
    }

    if (this.overlay) {
      this.render();
    }
  }

  clearProject(): void {
    this.projectName = null;
    this.seasons = [];
    this.episodes = [];
    this.selectedSeasonId = null;
    this.selectedEpisodeId = null;
    this.hasUnsavedChanges = false;

    if (this.overlay) {
      this.render();
    }
  }

  markDirty(): void {
    this.hasUnsavedChanges = true;
    if (this.overlay) {
      this.render();
    }
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
      background: rgba(0, 0, 0, 0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    `;

    this.render();
    document.body.appendChild(this.overlay);
  }

  close(): void {
    if (this.overlay) {
      document.body.removeChild(this.overlay);
      this.overlay = null;
    }
  }

  isOpen(): boolean {
    return this.overlay !== null;
  }

  private render(): void {
    if (!this.overlay) return;
    this.overlay.innerHTML = '';

    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #1e1e2e;
      border-radius: 16px;
      width: 800px;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6);
      overflow: hidden;
    `;

    // Header
    dialog.appendChild(this.createHeader());

    // Content
    const content = document.createElement('div');
    content.style.cssText = 'flex: 1; overflow: hidden; display: flex; flex-direction: column;';

    if (!this.projectName) {
      content.appendChild(this.createNoProjectView());
    } else {
      content.appendChild(this.createProjectView());
    }

    dialog.appendChild(content);
    this.overlay.appendChild(dialog);
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 20px 24px;
      border-bottom: 1px solid #313244;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;

    const titleArea = document.createElement('div');

    const title = document.createElement('h2');
    title.textContent = 'Project Manager';
    title.style.cssText = 'margin: 0; font-size: 18px; color: #cdd6f4;';
    titleArea.appendChild(title);

    if (this.projectName) {
      const subtitle = document.createElement('div');
      subtitle.style.cssText = 'font-size: 12px; color: #6c7086; margin-top: 4px;';
      subtitle.textContent = this.projectName + (this.hasUnsavedChanges ? ' (unsaved changes)' : '');
      titleArea.appendChild(subtitle);
    }

    header.appendChild(titleArea);

    // Only show close button if project is loaded and episode is selected
    if (this.projectName && this.selectedEpisodeId) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = `
        background: none;
        border: none;
        color: #6c7086;
        font-size: 20px;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
      `;
      closeBtn.onmouseenter = () => closeBtn.style.background = '#313244';
      closeBtn.onmouseleave = () => closeBtn.style.background = 'none';
      closeBtn.onclick = () => this.close();
      header.appendChild(closeBtn);
    }

    return header;
  }

  private createNoProjectView(): HTMLElement {
    const view = document.createElement('div');
    view.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 40px;
    `;

    const icon = document.createElement('div');
    icon.textContent = '🍬';
    icon.style.cssText = 'font-size: 64px; margin-bottom: 24px;';
    view.appendChild(icon);

    const message = document.createElement('p');
    message.textContent = 'Welcome to Sugar Engine';
    message.style.cssText = 'color: #cdd6f4; font-size: 20px; margin: 0 0 8px 0;';
    view.appendChild(message);

    const submessage = document.createElement('p');
    submessage.textContent = 'Create a new project or open an existing one to get started.';
    submessage.style.cssText = 'color: #6c7086; font-size: 14px; margin: 0 0 32px 0;';
    view.appendChild(submessage);

    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; gap: 16px;';

    const newBtn = this.createActionButton('+ New Project', '#a6e3a1', () => {
      this.showNewProjectPrompt();
    });
    buttons.appendChild(newBtn);

    const openBtn = this.createActionButton('📂 Open Project', '#89b4fa', () => {
      this.config.onProjectOpen();
    });
    buttons.appendChild(openBtn);

    view.appendChild(buttons);

    return view;
  }

  private createProjectView(): HTMLElement {
    const view = document.createElement('div');
    view.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    // Top action bar
    const actionBar = document.createElement('div');
    actionBar.style.cssText = `
      padding: 12px 24px;
      border-bottom: 1px solid #313244;
      display: flex;
      gap: 8px;
    `;

    const newBtn = this.createSmallButton('+ New', () => this.showNewProjectPrompt());
    actionBar.appendChild(newBtn);

    const openBtn = this.createSmallButton('📂 Open', () => this.config.onProjectOpen());
    actionBar.appendChild(openBtn);

    const saveBtn = this.createSmallButton('💾 Save', () => {
      this.config.onProjectSave();
      this.hasUnsavedChanges = false;
      this.render();
    });
    actionBar.appendChild(saveBtn);

    view.appendChild(actionBar);

    // Main content area
    const mainContent = document.createElement('div');
    mainContent.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    // Seasons panel
    mainContent.appendChild(this.createSeasonsPanel());

    // Episodes panel
    mainContent.appendChild(this.createEpisodesPanel());

    // Details panel
    mainContent.appendChild(this.createDetailsPanel());

    view.appendChild(mainContent);

    // Footer with Open Episode button
    view.appendChild(this.createFooter());

    return view;
  }

  private createSeasonsPanel(): HTMLElement {
    const panel = document.createElement('div');
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
    label.style.cssText = 'font-size: 11px; color: #6c7086; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;';
    header.appendChild(label);

    const addBtn = document.createElement('button');
    addBtn.textContent = '+';
    addBtn.title = 'Add Season';
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
    list.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';

    const sortedSeasons = [...this.seasons].sort((a, b) => a.order - b.order);
    for (const season of sortedSeasons) {
      list.appendChild(this.createSeasonItem(season));
    }

    if (this.seasons.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No seasons yet';
      empty.style.cssText = 'color: #6c7086; font-size: 12px; padding: 12px; text-align: center;';
      list.appendChild(empty);
    }

    panel.appendChild(list);
    return panel;
  }

  private createEpisodesPanel(): HTMLElement {
    const panel = document.createElement('div');
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
    label.style.cssText = 'font-size: 11px; color: #6c7086; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;';
    header.appendChild(label);

    if (this.selectedSeasonId) {
      const addBtn = document.createElement('button');
      addBtn.textContent = '+';
      addBtn.title = 'Add Episode';
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
    }

    panel.appendChild(header);

    const list = document.createElement('div');
    list.style.cssText = 'flex: 1; overflow-y: auto; padding: 8px;';

    if (this.selectedSeasonId) {
      const seasonEpisodes = this.episodes
        .filter(e => e.seasonId === this.selectedSeasonId)
        .sort((a, b) => a.order - b.order);

      for (const episode of seasonEpisodes) {
        list.appendChild(this.createEpisodeItem(episode));
      }

      if (seasonEpisodes.length === 0) {
        const empty = document.createElement('div');
        empty.textContent = 'No episodes yet';
        empty.style.cssText = 'color: #6c7086; font-size: 12px; padding: 12px; text-align: center;';
        list.appendChild(empty);
      }
    } else {
      const placeholder = document.createElement('div');
      placeholder.textContent = 'Select a season';
      placeholder.style.cssText = 'color: #6c7086; font-size: 12px; padding: 12px; text-align: center;';
      list.appendChild(placeholder);
    }

    panel.appendChild(list);
    return panel;
  }

  private createDetailsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      padding: 16px 20px;
      overflow-y: auto;
    `;

    if (this.selectedEpisodeId) {
      const episode = this.episodes.find(e => e.id === this.selectedEpisodeId);
      if (episode) {
        this.renderEpisodeDetails(panel, episode);
        return panel;
      }
    }

    if (this.selectedSeasonId) {
      const season = this.seasons.find(s => s.id === this.selectedSeasonId);
      if (season) {
        this.renderSeasonDetails(panel, season);
        return panel;
      }
    }

    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #6c7086;
      font-size: 13px;
    `;
    placeholder.textContent = 'Select a season or episode to edit';
    panel.appendChild(placeholder);

    return panel;
  }

  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px 24px;
      border-top: 1px solid #313244;
      display: flex;
      justify-content: flex-end;
    `;

    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open Episode →';
    const canOpen = this.selectedEpisodeId !== null;
    openBtn.disabled = !canOpen;
    openBtn.style.cssText = `
      padding: 10px 24px;
      border: none;
      border-radius: 8px;
      background: ${canOpen ? '#a6e3a1' : '#45475a'};
      color: ${canOpen ? '#1e1e2e' : '#6c7086'};
      font-size: 14px;
      font-weight: 600;
      cursor: ${canOpen ? 'pointer' : 'not-allowed'};
    `;

    if (canOpen) {
      openBtn.onclick = () => {
        const episode = this.episodes.find(e => e.id === this.selectedEpisodeId);
        if (episode) {
          this.config.onEpisodeSelect(episode.seasonId, episode.id);
          this.close();
        }
      };
    }

    footer.appendChild(openBtn);
    return footer;
  }

  private createSeasonItem(season: Season): HTMLElement {
    const item = document.createElement('div');
    const isSelected = season.id === this.selectedSeasonId;
    item.style.cssText = `
      padding: 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 4px;
      background: ${isSelected ? '#313244' : 'transparent'};
      color: ${isSelected ? '#cdd6f4' : '#a6adc8'};
      font-size: 13px;
      transition: background 0.1s;
    `;
    item.textContent = season.name;

    item.onmouseenter = () => {
      if (!isSelected) item.style.background = '#252536';
    };
    item.onmouseleave = () => {
      if (!isSelected) item.style.background = 'transparent';
    };

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
      padding: 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      margin-bottom: 4px;
      background: ${isSelected ? '#313244' : 'transparent'};
      color: ${isSelected ? '#cdd6f4' : '#a6adc8'};
      font-size: 13px;
      transition: background 0.1s;
    `;
    item.textContent = `E${episode.order}: ${episode.name}`;

    item.onmouseenter = () => {
      if (!isSelected) item.style.background = '#252536';
    };
    item.onmouseleave = () => {
      if (!isSelected) item.style.background = 'transparent';
    };

    item.onclick = () => {
      this.selectedEpisodeId = episode.id;
      this.render();
    };

    // Double-click to open
    item.ondblclick = () => {
      this.config.onEpisodeSelect(episode.seasonId, episode.id);
      this.close();
    };

    return item;
  }

  private renderSeasonDetails(container: HTMLElement, season: Season): void {
    const title = document.createElement('h3');
    title.textContent = 'Season Details';
    title.style.cssText = 'margin: 0 0 20px 0; font-size: 14px; color: #a6adc8; font-weight: 600;';
    container.appendChild(title);

    container.appendChild(this.createField('Name', season.name, (value) => {
      season.name = value;
      this.notifyChange();
    }));

    container.appendChild(this.createField('Order', String(season.order), (value) => {
      season.order = parseInt(value) || 1;
      this.notifyChange();
    }, 'number'));

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    container.appendChild(spacer);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Season';
    deleteBtn.style.cssText = `
      padding: 8px 16px;
      background: transparent;
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
    title.style.cssText = 'margin: 0 0 20px 0; font-size: 14px; color: #a6adc8; font-weight: 600;';
    container.appendChild(title);

    container.appendChild(this.createField('Name', episode.name, (value) => {
      episode.name = value;
      this.notifyChange();
    }));

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

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    container.appendChild(spacer);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Episode';
    deleteBtn.style.cssText = `
      padding: 8px 16px;
      background: transparent;
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
    labelEl.style.cssText = 'display: block; font-size: 12px; color: #6c7086; margin-bottom: 6px;';
    wrapper.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 6px;
      color: #cdd6f4;
      font-size: 13px;
      box-sizing: border-box;
    `;
    input.onfocus = () => input.style.borderColor = '#89b4fa';
    input.onblur = () => input.style.borderColor = '#313244';
    input.oninput = () => onChange(input.value);
    wrapper.appendChild(input);

    return wrapper;
  }

  private createSelectField(label: string, value: string, options: { value: string; label: string }[], onChange: (value: string) => void): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom: 16px;';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'display: block; font-size: 12px; color: #6c7086; margin-bottom: 6px;';
    wrapper.appendChild(labelEl);

    const select = document.createElement('select');
    select.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 6px;
      color: #cdd6f4;
      font-size: 13px;
      box-sizing: border-box;
      cursor: pointer;
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

  private createActionButton(text: string, color: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 14px 28px;
      border: none;
      border-radius: 8px;
      background: ${color}22;
      color: ${color};
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.15s;
    `;
    btn.onmouseenter = () => btn.style.background = `${color}44`;
    btn.onmouseleave = () => btn.style.background = `${color}22`;
    btn.onclick = onClick;
    return btn;
  }

  private createSmallButton(text: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #313244;
      border-radius: 6px;
      background: transparent;
      color: #a6adc8;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    `;
    btn.onmouseenter = () => {
      btn.style.background = '#313244';
      btn.style.color = '#cdd6f4';
    };
    btn.onmouseleave = () => {
      btn.style.background = 'transparent';
      btn.style.color = '#a6adc8';
    };
    btn.onclick = onClick;
    return btn;
  }

  private showNewProjectPrompt(): void {
    const name = prompt('Enter project name:', 'My Game');
    if (name) {
      this.config.onProjectCreate(name);
    }
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
    const seasonEpisodes = this.episodes.filter(e => e.seasonId === seasonId);
    if (seasonEpisodes.length > 0) {
      if (!confirm(`Delete this season and its ${seasonEpisodes.length} episode(s)?`)) return;
    }

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
    this.hasUnsavedChanges = true;
    this.config.onSeasonsChange([...this.seasons]);
    this.config.onEpisodesChange([...this.episodes]);
  }
}
