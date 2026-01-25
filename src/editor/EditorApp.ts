/**
 * EditorApp - Main editor interface
 *
 * This is the primary interface when developing a game.
 * The game itself is previewed in a separate window.
 */

import { Toolbar } from './Toolbar';
import { PreviewManager } from './PreviewManager';
import { StatusBar, CommandPalette, KeyboardShortcuts, ProjectManagerDialog } from './components';
import type { SearchableEntry } from './components';
import { editorStore, EditorTab, HistoryManager } from './store';
import {
  DialoguePanel,
  QuestPanel,
  NPCPanel,
  ItemPanel,
  InspectionPanel,
  RegionPanel,
  setAvailableNPCs,
  setAvailableNPCsForDialogue,
  setAvailableItems,
  setAvailableDialogues,
  setAvailableQuests,
  setAvailableQuestsForItems,
  setAvailableNPCsForRegion,
  setAvailableItemsForRegion,
  setAvailableInspectionsForRegion,
  setAvailableEpisodesForRegion,
} from './panels';
import type { Season, Episode } from '../engine/episodes/types';

export class EditorApp {
  private container: HTMLElement;
  private toolbar: Toolbar;
  private previewManager: PreviewManager;
  private statusBar: StatusBar;
  private commandPalette: CommandPalette;
  private projectManagerDialog: ProjectManagerDialog;
  private historyManager: HistoryManager;
  private mainContent!: HTMLElement;

  // Panel interface
  private dialoguePanel: DialoguePanel;
  private questPanel: QuestPanel;
  private npcPanel: NPCPanel;
  private itemPanel: ItemPanel;
  private inspectionPanel: InspectionPanel;
  private regionPanel: RegionPanel;
  private panels!: Map<EditorTab, { show: () => void; hide: () => void; getElement: () => HTMLElement }>;

  // Project data
  private projectName: string | null = null;
  private seasons: Season[] = [];
  private episodes: Episode[] = [];

  // Track current tab to avoid unnecessary re-renders
  private currentTab: EditorTab | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.innerHTML = '';

    // Set up editor styles
    this.setupStyles();

    // Initialize panels
    this.dialoguePanel = new DialoguePanel();
    this.questPanel = new QuestPanel();
    this.npcPanel = new NPCPanel();
    this.itemPanel = new ItemPanel();
    this.inspectionPanel = new InspectionPanel();
    this.regionPanel = new RegionPanel();

    this.panels = new Map<EditorTab, { show: () => void; hide: () => void; getElement: () => HTMLElement }>();
    this.panels.set('dialogues', this.dialoguePanel);
    this.panels.set('quests', this.questPanel);
    this.panels.set('npcs', this.npcPanel);
    this.panels.set('items', this.itemPanel);
    this.panels.set('inspections', this.inspectionPanel);
    this.panels.set('regions', this.regionPanel);

    // Create layout
    this.createLayout();

    // Initialize subsystems
    this.previewManager = new PreviewManager();

    // Project Manager Dialog
    this.projectManagerDialog = new ProjectManagerDialog({
      onProjectCreate: (name) => this.handleProjectCreate(name),
      onProjectOpen: () => this.handleLoad(),
      onProjectSave: () => this.handleSave(),
      onEpisodeSelect: (seasonId, episodeId) => this.handleEpisodeSelect(seasonId, episodeId),
      onSeasonsChange: (seasons) => this.handleSeasonsChange(seasons),
      onEpisodesChange: (episodes) => this.handleEpisodesChange(episodes),
      getRegions: () => this.regionPanel.getRegions().map(r => ({ id: r.id, name: r.name })),
    });

    // Toolbar
    this.toolbar = new Toolbar({
      onPreview: () => this.openPreview(),
      onOpenProjectManager: () => this.openProjectManager(),
    });

    // Status bar
    this.statusBar = new StatusBar();

    // Command palette (Cmd+K)
    this.commandPalette = new CommandPalette();

    // Keyboard shortcuts help (?) - instantiate for side effects (keyboard listener)
    new KeyboardShortcuts();

    // Set up tab navigation shortcuts (1-5)
    this.setupTabShortcuts();

    // History manager (undo/redo)
    this.historyManager = new HistoryManager(
      () => this.getAllData(),
      (data) => this.restoreAllData(data as ReturnType<typeof this.getAllData>)
    );

    // Mount toolbar and status bar
    this.container.insertBefore(this.toolbar.getElement(), this.mainContent);
    this.container.appendChild(this.statusBar.getElement());

    // Subscribe to tab changes
    editorStore.subscribe((state) => {
      this.showPanel(state.activeTab);
    });

    // Show initial panel
    this.showPanel(editorStore.getState().activeTab);

    // Load data from JSON files (legacy support)
    this.loadLegacyData();

    // Open Project Manager on launch
    this.projectManagerDialog.open();
  }

  private setupTabShortcuts(): void {
    const tabMap: Record<string, EditorTab> = {
      '1': 'dialogues',
      '2': 'quests',
      '3': 'npcs',
      '4': 'items',
      '5': 'inspections',
      '6': 'regions',
    };

    document.addEventListener('keydown', (e) => {
      // Cmd+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        this.handleSave();
        return;
      }

      // Cmd+O to load
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        this.handleLoad();
        return;
      }

      // Don't trigger in input fields for other shortcuts
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Number keys for tab navigation
      if (tabMap[e.key] && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        editorStore.setActiveTab(tabMap[e.key]!);
      }
    });
  }

  private setupStyles(): void {
    this.container.style.cssText = `
      width: 100vw;
      height: 100vh;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      background: #1e1e2e;
      color: #cdd6f4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    `;
  }

  private createLayout(): void {
    // Main content area (contains panels)
    this.mainContent = document.createElement('div');
    this.mainContent.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    // Add all panels (hidden by default)
    for (const [, panel] of this.panels) {
      panel.hide();
      this.mainContent.appendChild(panel.getElement());
    }

    this.container.appendChild(this.mainContent);
  }

  private showPanel(tab: EditorTab): void {
    // Only update if tab actually changed
    if (tab === this.currentTab) return;

    this.currentTab = tab;

    for (const [id, panel] of this.panels) {
      if (id === tab) {
        panel.show();
      } else {
        panel.hide();
      }
    }

    // Refresh cross-references when switching panels to pick up any changes
    this.setupCrossReferences();
  }

  private async loadLegacyData(): Promise<void> {
    this.statusBar.setStatus('Loading data...');

    try {
      // Load quests
      await this.loadQuests();

      // Load items
      await this.loadItems();

      // Load inspections
      await this.loadInspections();

      this.statusBar.setStatus('Ready');
    } catch (error) {
      console.error('Failed to load data:', error);
      this.statusBar.setStatus('Failed to load some data');
    }
  }

  private setupCrossReferences(): void {
    // Get all loaded data
    const dialogues = this.dialoguePanel.getDialogues();
    const quests = this.questPanel.getQuests();
    const npcs = this.npcPanel.getNPCs();
    const items = this.itemPanel.getItems();
    const inspections = this.inspectionPanel.getInspections();

    // Set NPCs for dialogue panel speaker dropdown
    const npcList = npcs.map(n => ({ id: n.id, name: n.name }));
    setAvailableNPCs(npcList);
    setAvailableNPCsForDialogue(npcList);
    setAvailableNPCsForRegion(npcList);

    // Set items for region panel
    const itemList = items.map(i => ({ id: i.id, name: i.name }));
    setAvailableItemsForRegion(itemList);

    // Set inspections for region panel
    setAvailableInspectionsForRegion(inspections.map(i => ({
      id: i.id,
      displayName: i.title,
    })));

    // Set episodes for region panel availability
    setAvailableEpisodesForRegion(this.episodes.map(e => ({
      id: e.id,
      name: e.name,
    })));

    // Set dialogues for NPC panel reference tracking
    // Extract speaker info from nodes
    setAvailableDialogues(dialogues.map(d => ({
      id: d.id,
      displayName: d.displayName,
      nodes: d.nodes?.map(n => ({ speaker: n.speaker })),
    })));

    // Set quests for NPC panel and Item panel reference tracking
    const questData = quests.map(q => ({
      id: q.id,
      name: q.name,
      stages: q.stages,
      rewards: q.rewards,
    }));
    setAvailableQuests(questData);
    setAvailableQuestsForItems(questData);

    // Populate command palette
    this.populateCommandPalette();
  }

  private populateCommandPalette(): void {
    const entries: SearchableEntry[] = [];

    // Add dialogues
    for (const dialogue of this.dialoguePanel.getDialogues()) {
      const firstNode = dialogue.nodes?.[0];
      entries.push({
        id: dialogue.id,
        name: dialogue.id,
        type: 'dialogues',
        subtitle: firstNode?.text?.substring(0, 50) + (firstNode?.text && firstNode.text.length > 50 ? '...' : ''),
        content: dialogue.nodes?.map(n => n.text).join(' '),
      });
    }

    // Add quests
    for (const quest of this.questPanel.getQuests()) {
      entries.push({
        id: quest.id,
        name: quest.name,
        type: 'quests',
        subtitle: `${quest.stages?.length || 0} stages`,
        content: quest.description,
      });
    }

    // Add NPCs
    for (const npc of this.npcPanel.getNPCs()) {
      entries.push({
        id: npc.id,
        name: npc.name,
        type: 'npcs',
        subtitle: npc.faction || 'No faction',
        content: npc.description,
      });
    }

    // Add items
    for (const item of this.itemPanel.getItems()) {
      entries.push({
        id: item.id,
        name: item.name,
        type: 'items',
        subtitle: item.category,
        content: item.description,
      });
    }

    // Add inspections
    for (const inspection of this.inspectionPanel.getInspections()) {
      entries.push({
        id: inspection.id,
        name: inspection.title,
        type: 'inspections',
        subtitle: inspection.subtitle,
        content: inspection.content,
      });
    }

    this.commandPalette.setEntries(entries);
  }

  private async loadQuests(): Promise<void> {
    try {
      const response = await fetch('/quests/index.json');
      if (response.ok) {
        const index = await response.json() as { quests: string[] };
        for (const id of index.quests) {
          const questRes = await fetch(`/quests/${id}.json`);
          if (questRes.ok) {
            const quest = await questRes.json();
            this.questPanel.addQuest(quest);
          }
        }
      }
    } catch {
      // No quests to load
    }
  }

  private async loadItems(): Promise<void> {
    try {
      const response = await fetch('/items/items.json');
      if (response.ok) {
        const data = await response.json() as { items: { id: string; name: string }[] };
        for (const item of data.items) {
          this.itemPanel.addItem(item as Parameters<ItemPanel['addItem']>[0]);
        }
        // Update available items for quest editor reference picker
        setAvailableItems(data.items.map(i => ({ id: i.id, name: i.name })));
      }
    } catch {
      // No items to load
    }
  }

  private async loadInspections(): Promise<void> {
    try {
      const response = await fetch('/inspections/index.json');
      if (response.ok) {
        const index = await response.json() as { inspections: string[] };
        for (const id of index.inspections) {
          const inspRes = await fetch(`/inspections/${id}.json`);
          if (inspRes.ok) {
            const inspection = await inspRes.json();
            this.inspectionPanel.addInspection(inspection);
          }
        }
      }
    } catch {
      // No inspections to load
    }
  }

  private openPreview(): void {
    const projectData = this.getProjectData();
    const currentEpisodeId = editorStore.getState().currentEpisodeId;
    this.previewManager.openPreviewWithData(projectData, currentEpisodeId || undefined);
  }

  private openProjectManager(): void {
    // Update dialog with current data
    if (this.projectName) {
      this.projectManagerDialog.setProject(this.projectName, this.seasons, this.episodes);
    }
    this.projectManagerDialog.open();
  }

  private handleProjectCreate(name: string): void {
    // Clear existing data
    this.clearAllData();

    // Set project info
    this.projectName = name;

    // Create default season and episode
    const defaultSeason: Season = {
      id: this.generateUUID(),
      name: 'Season 1',
      order: 1,
    };
    const defaultEpisode: Episode = {
      id: this.generateUUID(),
      seasonId: defaultSeason.id,
      name: 'Episode 1',
      order: 1,
      startRegion: '',
    };

    this.seasons = [defaultSeason];
    this.episodes = [defaultEpisode];

    // Update state
    editorStore.setProjectLoaded(true, name);
    editorStore.setCurrentSeason(defaultSeason.id);
    editorStore.setCurrentEpisode(defaultEpisode.id);

    // Update toolbar
    this.toolbar.setProjectLoaded(true);
    this.toolbar.setCurrentContext(defaultSeason, defaultEpisode);

    // Update dialog
    this.projectManagerDialog.setProject(name, this.seasons, this.episodes);

    // Initialize history
    this.historyManager.initialize();

    this.statusBar.setStatus(`Created project: ${name}`);
  }

  private handleEpisodeSelect(seasonId: string, episodeId: string): void {
    editorStore.setCurrentSeason(seasonId);
    editorStore.setCurrentEpisode(episodeId);

    const season = this.seasons.find(s => s.id === seasonId);
    const episode = this.episodes.find(e => e.id === episodeId);

    this.toolbar.setCurrentContext(season || null, episode || null);
    this.setupCrossReferences();

    if (season && episode) {
      this.statusBar.setStatus(`Editing: ${season.name}, ${episode.name}`);
    }
  }

  private handleSeasonsChange(seasons: Season[]): void {
    this.seasons = seasons;
    editorStore.setDirty(true);
    this.setupCrossReferences();
  }

  private handleEpisodesChange(episodes: Episode[]): void {
    this.episodes = episodes;
    editorStore.setDirty(true);
    this.setupCrossReferences();
  }

  private clearAllData(): void {
    this.dialoguePanel.clear();
    this.questPanel.clear();
    this.npcPanel.clear();
    this.itemPanel.clear();
    this.inspectionPanel.clear();
    this.regionPanel.clear();
    this.seasons = [];
    this.episodes = [];
    this.projectName = null;

    editorStore.setProjectLoaded(false, null);
    editorStore.setCurrentSeason(null);
    editorStore.setCurrentEpisode(null);

    this.toolbar.setProjectLoaded(false);
    this.toolbar.setCurrentContext(null, null);
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private getProjectData() {
    return {
      version: 2,
      meta: {
        gameId: 'sugar-game',
        name: this.projectName || 'Sugar Engine Game',
      },
      seasons: this.seasons,
      episodes: this.episodes,
      dialogues: this.dialoguePanel.getDialogues(),
      quests: this.questPanel.getQuests(),
      npcs: this.npcPanel.getNPCs(),
      items: this.itemPanel.getItems(),
      inspections: this.inspectionPanel.getInspections(),
      regions: this.regionPanel.getRegions(),
    };
  }

  private getAllData() {
    return {
      dialogues: this.dialoguePanel.getDialogues(),
      quests: this.questPanel.getQuests(),
      npcs: this.npcPanel.getNPCs(),
      items: this.itemPanel.getItems(),
      inspections: this.inspectionPanel.getInspections(),
      regions: this.regionPanel.getRegions(),
    };
  }

  private restoreAllData(data: ReturnType<typeof this.getAllData>): void {
    // Clear and restore each panel
    // Note: This is a simplified restore - in a full implementation,
    // panels would need clear() and bulk load methods
    console.log('Restoring state:', data);
    // For now, just log - full implementation would require panel changes
  }

  private async handleSave(): Promise<void> {
    this.statusBar.setStatus('Saving...');

    const data = this.getProjectData();

    try {
      // Try File System Access API first (Chrome/Edge)
      if ('showSaveFilePicker' in window) {
        const handle = await (window as Window & { showSaveFilePicker: (options: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
          suggestedName: `${this.projectName || 'project'}.sgrgame`,
          types: [{
            description: 'Sugar Engine Project',
            accept: { 'application/json': ['.sgrgame'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(JSON.stringify(data, null, 2));
        await writable.close();
        editorStore.setDirty(false);
        this.statusBar.setStatus('Project saved');
        return;
      }
    } catch (e) {
      // User cancelled or API not available
      if ((e as Error).name === 'AbortError') {
        this.statusBar.setStatus('Save cancelled');
        return;
      }
    }

    // Fallback to download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.projectName || 'project'}.sgrgame`;
    a.click();
    URL.revokeObjectURL(url);

    editorStore.setDirty(false);
    this.statusBar.setStatus('Project downloaded');
  }

  private async handleLoad(): Promise<void> {
    try {
      // Try File System Access API first (Chrome/Edge)
      if ('showOpenFilePicker' in window) {
        const handles = await (window as Window & { showOpenFilePicker: (options: { types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle[]> }).showOpenFilePicker({
          types: [{
            description: 'Sugar Engine Project',
            accept: { 'application/json': ['.sgrgame', '.json'] },
          }],
        });
        const handle = handles[0];
        if (!handle) return;
        const file = await handle.getFile();
        const text = await file.text();
        await this.loadProjectData(text, file.name);
        return;
      }
    } catch (e) {
      // User cancelled or API not available
      if ((e as Error).name === 'AbortError') {
        return;
      }
    }

    // Fallback to file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sgrgame,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        const text = await file.text();
        await this.loadProjectData(text, file.name);
      }
    };
    input.click();
  }

  private async loadProjectData(jsonText: string, filename?: string): Promise<void> {
    this.statusBar.setStatus('Loading project...');

    try {
      const data = JSON.parse(jsonText);

      // Clear existing data
      this.clearAllData();

      // Extract project name from meta or filename
      this.projectName = data.meta?.name || filename?.replace('.sgrgame', '') || 'Untitled Project';

      // Load seasons and episodes (v2 format)
      for (const season of data.seasons || []) {
        this.seasons.push(season);
      }

      for (const episode of data.episodes || []) {
        this.episodes.push(episode);
      }

      // Set current episode context
      const firstSeason = this.seasons.sort((a, b) => a.order - b.order)[0];
      let firstEpisode: Episode | undefined;
      if (firstSeason) {
        editorStore.setCurrentSeason(firstSeason.id);
        firstEpisode = this.episodes
          .filter(e => e.seasonId === firstSeason.id)
          .sort((a, b) => a.order - b.order)[0];
        if (firstEpisode) {
          editorStore.setCurrentEpisode(firstEpisode.id);
        }
      }

      // Load dialogues
      for (const dialogue of data.dialogues || []) {
        this.dialoguePanel.addDialogue(dialogue);
      }

      // Load quests
      for (const quest of data.quests || []) {
        this.questPanel.addQuest(quest);
      }

      // Load NPCs
      for (const npc of data.npcs || []) {
        this.npcPanel.addNPC(npc);
      }

      // Load items
      for (const item of data.items || []) {
        this.itemPanel.addItem(item);
      }

      // Load inspections
      for (const inspection of data.inspections || []) {
        this.inspectionPanel.addInspection(inspection);
      }

      // Load regions (v2 format)
      for (const region of data.regions || []) {
        this.regionPanel.addRegion(region);
      }

      // Update project state
      editorStore.setProjectLoaded(true, this.projectName);
      this.toolbar.setProjectLoaded(true);
      this.toolbar.setCurrentContext(firstSeason || null, firstEpisode || null);

      // Update Project Manager dialog
      this.projectManagerDialog.setProject(this.projectName || 'Untitled', this.seasons, this.episodes);

      // Refresh cross-references
      this.setupCrossReferences();

      // Re-initialize history
      this.historyManager.initialize();

      editorStore.setDirty(false);
      this.statusBar.setStatus('Project loaded');

      // Close dialog if open
      if (this.projectManagerDialog.isOpen()) {
        // If we have an episode selected, close the dialog
        if (firstEpisode) {
          this.projectManagerDialog.close();
        }
      }
    } catch (e) {
      console.error('Failed to load project:', e);
      this.statusBar.setStatus('Failed to load project');
    }
  }
}
