/**
 * EditorApp - Main editor interface
 *
 * This is the primary interface when developing a game.
 * The game itself is previewed in a separate window.
 */

import { Toolbar } from './Toolbar';
import { PreviewManager } from './PreviewManager';
import { StatusBar, CommandPalette, KeyboardShortcuts } from './components';
import type { SearchableEntry } from './components';
import { editorStore, EditorTab, HistoryManager } from './store';
import {
  DialoguePanel,
  QuestPanel,
  NPCPanel,
  ItemPanel,
  InspectionPanel,
  setAvailableNPCs,
  setAvailableNPCsForDialogue,
  setAvailableItems,
  setAvailableDialogues,
  setAvailableQuests,
  setAvailableQuestsForItems,
} from './panels';

export class EditorApp {
  private container: HTMLElement;
  private toolbar: Toolbar;
  private previewManager: PreviewManager;
  private statusBar: StatusBar;
  private commandPalette: CommandPalette;
  private historyManager: HistoryManager;
  private mainContent!: HTMLElement;

  // Panel interface
  private dialoguePanel: DialoguePanel;
  private questPanel: QuestPanel;
  private npcPanel: NPCPanel;
  private itemPanel: ItemPanel;
  private inspectionPanel: InspectionPanel;
  private panels!: Map<EditorTab, { show: () => void; hide: () => void; getElement: () => HTMLElement }>;

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

    this.panels = new Map<EditorTab, { show: () => void; hide: () => void; getElement: () => HTMLElement }>();
    this.panels.set('dialogues', this.dialoguePanel);
    this.panels.set('quests', this.questPanel);
    this.panels.set('npcs', this.npcPanel);
    this.panels.set('items', this.itemPanel);
    this.panels.set('inspections', this.inspectionPanel);

    // Create layout
    this.createLayout();

    // Initialize subsystems
    this.previewManager = new PreviewManager();
    this.toolbar = new Toolbar({
      onPreview: () => this.previewManager.openPreview(),
      onPublish: () => this.handlePublish(),
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

    // Load existing data
    this.loadData();
  }

  private setupTabShortcuts(): void {
    const tabMap: Record<string, EditorTab> = {
      '1': 'dialogues',
      '2': 'quests',
      '3': 'npcs',
      '4': 'items',
      '5': 'inspections',
    };

    document.addEventListener('keydown', (e) => {
      // Don't trigger in input fields
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
    for (const [id, panel] of this.panels) {
      if (id === tab) {
        panel.show();
      } else {
        panel.hide();
      }
    }
  }

  private async loadData(): Promise<void> {
    this.statusBar.setStatus('Loading data...');

    try {
      // Load dialogues
      await this.loadDialogues();

      // Load quests
      await this.loadQuests();

      // Load NPCs
      await this.loadNPCs();

      // Load items
      await this.loadItems();

      // Load inspections
      await this.loadInspections();

      // Wire up cross-references between panels
      this.setupCrossReferences();

      // Initialize history with current state
      this.historyManager.initialize();

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

    // Set dialogues for NPC panel reference tracking
    // Extract speaker info from nodes
    setAvailableDialogues(dialogues.map(d => ({
      id: d.id,
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

  private async loadDialogues(): Promise<void> {
    try {
      // Try to load dialogue index
      const response = await fetch('/dialogue/index.json');
      if (response.ok) {
        const index = await response.json() as { dialogues: string[] };
        const loadedDialogues: { id: string; name: string }[] = [];
        for (const id of index.dialogues) {
          const dialogueRes = await fetch(`/dialogue/${id}.json`);
          if (dialogueRes.ok) {
            const dialogue = await dialogueRes.json();
            this.dialoguePanel.addDialogue(dialogue);
            // Collect for quest picker - try to get a friendly name from the first node's speaker
            const firstNode = dialogue.nodes?.find((n: { id: string }) => n.id === dialogue.startNode);
            const speaker = firstNode?.speaker;
            const name = speaker ? `${speaker}: ${dialogue.id}` : dialogue.id;
            loadedDialogues.push({ id: dialogue.id, name });
          }
        }
        // Update available dialogues for quest editor reference picker
        setAvailableDialogues(loadedDialogues);
      }
    } catch {
      // No dialogues to load
    }
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

  private async loadNPCs(): Promise<void> {
    try {
      const response = await fetch('/npcs/npcs.json');
      if (response.ok) {
        const data = await response.json() as { npcs: { id: string; name: string }[] };
        for (const npc of data.npcs) {
          this.npcPanel.addNPC(npc as Parameters<NPCPanel['addNPC']>[0]);
        }
        // Update available NPCs for quest editor and dialogue editor
        const npcList = data.npcs.map(n => ({ id: n.id, name: n.name }));
        setAvailableNPCs(npcList);
        setAvailableNPCsForDialogue(npcList);
      }
    } catch {
      // No NPCs to load
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

  private async handlePublish(): Promise<void> {
    // Check for unsaved changes
    if (editorStore.getState().isDirty) {
      const saveFirst = confirm(
        'You have unsaved changes. Would you like to save before publishing?'
      );
      if (saveFirst) {
        await this.saveAllData();
      }
    }

    // For now, just build and show instructions
    const confirmed = confirm(
      'This will build your game for production.\n\n' +
      'After building, you can:\n' +
      '1. Drag the "dist" folder to Netlify\n' +
      '2. Or use "netlify deploy" CLI\n\n' +
      'Proceed with build?'
    );

    if (confirmed) {
      alert(
        'To build for production, run:\n\n' +
        'npm run build\n\n' +
        'Then deploy the "dist" folder to Netlify.'
      );
    }
  }

  private getAllData() {
    return {
      dialogues: this.dialoguePanel.getDialogues(),
      quests: this.questPanel.getQuests(),
      npcs: this.npcPanel.getNPCs(),
      items: this.itemPanel.getItems(),
      inspections: this.inspectionPanel.getInspections(),
    };
  }

  private restoreAllData(data: ReturnType<typeof this.getAllData>): void {
    // Clear and restore each panel
    // Note: This is a simplified restore - in a full implementation,
    // panels would need clear() and bulk load methods
    console.log('Restoring state:', data);
    // For now, just log - full implementation would require panel changes
  }

  private async saveAllData(): Promise<void> {
    this.statusBar.setStatus('Saving...');

    // In a browser environment, we can't directly write to files
    // Instead, we'll log the data and prompt for download
    const data = {
      dialogues: this.dialoguePanel.getDialogues(),
      quests: this.questPanel.getQuests(),
      npcs: this.npcPanel.getNPCs(),
      items: this.itemPanel.getItems(),
      inspections: this.inspectionPanel.getInspections(),
    };

    console.log('Editor data to save:', data);

    // Create downloadable JSON
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'editor-export.json';
    a.click();
    URL.revokeObjectURL(url);

    editorStore.setDirty(false);
    this.statusBar.setStatus('Data exported');
  }
}
