import { QuestManager, QuestState, QuestObjective } from '../quests';

/**
 * Full-screen quest journal overlay
 * Shows active quests, objectives, and completed quests
 */
export class QuestJournal {
  private overlay: HTMLDivElement;
  private questList: HTMLDivElement;
  private questDetails: HTMLDivElement;
  private questManager: QuestManager;
  private selectedQuestId: string | null = null;
  private onClose: (() => void) | null = null;

  constructor(parentContainer: HTMLElement, questManager: QuestManager) {
    this.questManager = questManager;
    this.injectStyles();

    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'quest-journal-overlay';

    // Main panel
    const panel = document.createElement('div');
    panel.className = 'quest-journal-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'quest-journal-header';
    header.innerHTML = `
      <h2>Quest Journal</h2>
      <div class="quest-journal-hint">Press <span class="key">J</span> or <span class="key">Esc</span> to close</div>
    `;
    panel.appendChild(header);

    // Content area (split view)
    const content = document.createElement('div');
    content.className = 'quest-journal-content';

    // Left panel - quest list
    this.questList = document.createElement('div');
    this.questList.className = 'quest-journal-list';
    content.appendChild(this.questList);

    // Right panel - quest details
    this.questDetails = document.createElement('div');
    this.questDetails.className = 'quest-journal-details';
    content.appendChild(this.questDetails);

    panel.appendChild(content);
    this.overlay.appendChild(panel);
    parentContainer.appendChild(this.overlay);

    // Keyboard handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  private injectStyles(): void {
    if (document.getElementById('quest-journal-styles')) return;

    const style = document.createElement('style');
    style.id = 'quest-journal-styles';
    style.textContent = `
      .quest-journal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.75);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 300;
        opacity: 0;
        transition: opacity 0.2s ease-out;
      }

      .quest-journal-overlay.visible {
        display: flex;
        opacity: 1;
      }

      .quest-journal-panel {
        background: linear-gradient(180deg, rgba(40, 35, 50, 0.98) 0%, rgba(30, 27, 40, 0.98) 100%);
        border: 3px solid rgba(180, 160, 140, 0.4);
        border-radius: 16px;
        width: 90%;
        max-width: 800px;
        height: 80%;
        max-height: 600px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0e6d8;
        overflow: hidden;
      }

      .quest-journal-header {
        padding: 20px 24px;
        border-bottom: 2px solid rgba(180, 160, 140, 0.2);
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .quest-journal-header h2 {
        margin: 0;
        font-size: 22px;
        font-weight: 600;
        color: #f0e6d8;
      }

      .quest-journal-hint {
        font-size: 13px;
        color: rgba(240, 230, 216, 0.5);
      }

      .quest-journal-hint .key {
        display: inline-block;
        background: rgba(136, 180, 220, 0.2);
        border: 1px solid rgba(136, 180, 220, 0.3);
        border-radius: 4px;
        padding: 2px 6px;
        font-weight: 600;
        font-size: 12px;
        color: #a8d4f0;
      }

      .quest-journal-content {
        flex: 1;
        display: flex;
        overflow: hidden;
      }

      .quest-journal-list {
        width: 35%;
        border-right: 2px solid rgba(180, 160, 140, 0.2);
        overflow-y: auto;
        padding: 16px;
      }

      .quest-journal-details {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
      }

      .quest-list-section {
        margin-bottom: 20px;
      }

      .quest-list-section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: rgba(240, 230, 216, 0.5);
        margin-bottom: 10px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(180, 160, 140, 0.15);
      }

      .quest-list-item {
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        margin-bottom: 6px;
        transition: background 0.15s ease-out;
      }

      .quest-list-item:hover {
        background: rgba(255, 255, 255, 0.05);
      }

      .quest-list-item.selected {
        background: rgba(136, 180, 220, 0.15);
        border: 1px solid rgba(136, 180, 220, 0.3);
      }

      .quest-list-item.completed {
        opacity: 0.6;
      }

      .quest-list-item-name {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 4px;
      }

      .quest-list-item-status {
        font-size: 11px;
        color: rgba(240, 230, 216, 0.5);
      }

      .quest-details-empty {
        color: rgba(240, 230, 216, 0.4);
        text-align: center;
        padding-top: 40px;
        font-size: 15px;
      }

      .quest-details-name {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 8px;
        color: #f0e6d8;
      }

      .quest-details-description {
        font-size: 14px;
        line-height: 1.6;
        color: rgba(240, 230, 216, 0.8);
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(180, 160, 140, 0.15);
      }

      .quest-details-section-title {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #a8d4f0;
        margin-bottom: 12px;
      }

      .quest-objective {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px 0;
      }

      .quest-objective-checkbox {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(168, 212, 240, 0.5);
        border-radius: 4px;
        flex-shrink: 0;
        margin-top: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .quest-objective-checkbox.completed {
        background: rgba(136, 212, 160, 0.3);
        border-color: rgba(136, 212, 160, 0.6);
      }

      .quest-objective-checkbox.completed::after {
        content: '\\2713';
        color: #88d4a0;
        font-size: 12px;
        font-weight: bold;
      }

      .quest-objective-text {
        font-size: 14px;
        line-height: 1.4;
        color: #e8ddd0;
      }

      .quest-objective.completed .quest-objective-text {
        text-decoration: line-through;
        opacity: 0.6;
      }

      .quest-objective-progress {
        font-size: 12px;
        color: rgba(240, 230, 216, 0.5);
        margin-left: 26px;
      }

      .quest-track-btn {
        margin-top: 20px;
        background: linear-gradient(135deg, rgba(136, 180, 220, 0.2) 0%, rgba(100, 140, 180, 0.1) 100%);
        border: 1px solid rgba(136, 180, 220, 0.3);
        border-radius: 8px;
        padding: 10px 16px;
        color: #a8d4f0;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease-out;
        font-family: inherit;
      }

      .quest-track-btn:hover {
        background: linear-gradient(135deg, rgba(136, 180, 220, 0.3) 0%, rgba(100, 140, 180, 0.15) 100%);
        border-color: rgba(136, 180, 220, 0.5);
      }

      .quest-track-btn.tracking {
        background: rgba(136, 212, 160, 0.2);
        border-color: rgba(136, 212, 160, 0.4);
        color: #88d4a0;
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyJ' || e.code === 'Escape') {
      this.hide();
    }
  }

  /**
   * Show the journal
   */
  show(): void {
    this.refresh();
    this.overlay.classList.add('visible');
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Hide the journal
   */
  hide(): void {
    this.overlay.classList.remove('visible');
    window.removeEventListener('keydown', this.handleKeyDown);
    if (this.onClose) {
      this.onClose();
    }
  }

  /**
   * Check if journal is visible
   */
  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  /**
   * Toggle journal visibility
   */
  toggle(): void {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Set close callback
   */
  setOnClose(handler: () => void): void {
    this.onClose = handler;
  }

  /**
   * Refresh the journal content
   */
  refresh(): void {
    this.renderQuestList();
    this.renderQuestDetails();
  }

  private renderQuestList(): void {
    this.questList.innerHTML = '';

    const activeQuests = this.questManager.getActiveQuests();

    // Active quests section
    if (activeQuests.length > 0) {
      const section = document.createElement('div');
      section.className = 'quest-list-section';

      const title = document.createElement('div');
      title.className = 'quest-list-section-title';
      title.textContent = `Active Quests (${activeQuests.length})`;
      section.appendChild(title);

      for (const quest of activeQuests) {
        const item = this.createQuestListItem(quest);
        section.appendChild(item);
      }

      this.questList.appendChild(section);

      // Auto-select first quest if none selected
      if (!this.selectedQuestId && activeQuests.length > 0 && activeQuests[0]) {
        this.selectedQuestId = activeQuests[0].questId;
      }
    }

    // Empty state
    if (activeQuests.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'quest-details-empty';
      empty.textContent = 'No active quests';
      this.questList.appendChild(empty);
    }
  }

  private createQuestListItem(quest: QuestState): HTMLDivElement {
    const loaded = this.questManager.getQuestDefinition(quest.questId);
    const item = document.createElement('div');
    item.className = 'quest-list-item';
    if (quest.questId === this.selectedQuestId) {
      item.classList.add('selected');
    }
    if (quest.status === 'completed') {
      item.classList.add('completed');
    }

    const name = document.createElement('div');
    name.className = 'quest-list-item-name';
    name.textContent = loaded?.definition.name ?? quest.questId;

    const status = document.createElement('div');
    status.className = 'quest-list-item-status';
    const completedCount = this.getCompletedObjectiveCount(quest);
    const totalCount = quest.objectiveProgress.size;
    status.textContent = `${completedCount}/${totalCount} objectives`;

    item.appendChild(name);
    item.appendChild(status);

    item.addEventListener('click', () => {
      this.selectedQuestId = quest.questId;
      this.refresh();
    });

    return item;
  }

  private getCompletedObjectiveCount(quest: QuestState): number {
    let count = 0;
    for (const obj of quest.objectiveProgress.values()) {
      if (obj.completed) count++;
    }
    return count;
  }

  private renderQuestDetails(): void {
    this.questDetails.innerHTML = '';

    if (!this.selectedQuestId) {
      const empty = document.createElement('div');
      empty.className = 'quest-details-empty';
      empty.textContent = 'Select a quest to view details';
      this.questDetails.appendChild(empty);
      return;
    }

    const quest = this.questManager.getQuestState(this.selectedQuestId);
    const loaded = this.questManager.getQuestDefinition(this.selectedQuestId);

    if (!quest || !loaded) {
      const empty = document.createElement('div');
      empty.className = 'quest-details-empty';
      empty.textContent = 'Quest not found';
      this.questDetails.appendChild(empty);
      return;
    }

    // Quest name
    const nameEl = document.createElement('div');
    nameEl.className = 'quest-details-name';
    nameEl.textContent = loaded.definition.name;
    this.questDetails.appendChild(nameEl);

    // Quest description
    const descEl = document.createElement('div');
    descEl.className = 'quest-details-description';
    descEl.textContent = loaded.definition.description;
    this.questDetails.appendChild(descEl);

    // Objectives section
    const objTitle = document.createElement('div');
    objTitle.className = 'quest-details-section-title';
    objTitle.textContent = 'Objectives';
    this.questDetails.appendChild(objTitle);

    // Render objectives
    for (const objective of quest.objectiveProgress.values()) {
      const objEl = this.createObjectiveElement(objective);
      this.questDetails.appendChild(objEl);
    }

    // Track button
    const trackBtn = document.createElement('button');
    trackBtn.className = 'quest-track-btn';
    const isTracking = this.questManager.getTrackedQuestId() === this.selectedQuestId;
    trackBtn.textContent = isTracking ? 'Currently Tracking' : 'Track Quest';
    if (isTracking) {
      trackBtn.classList.add('tracking');
    }
    trackBtn.addEventListener('click', () => {
      this.questManager.setTrackedQuest(this.selectedQuestId);
      this.refresh();
    });
    this.questDetails.appendChild(trackBtn);
  }

  private createObjectiveElement(objective: QuestObjective): HTMLDivElement {
    const container = document.createElement('div');
    container.className = 'quest-objective';
    if (objective.completed) {
      container.classList.add('completed');
    }

    const checkbox = document.createElement('div');
    checkbox.className = 'quest-objective-checkbox';
    if (objective.completed) {
      checkbox.classList.add('completed');
    }

    const text = document.createElement('div');
    text.className = 'quest-objective-text';
    text.textContent = objective.description;

    container.appendChild(checkbox);
    container.appendChild(text);

    // Progress for countable objectives
    if (objective.count && objective.count > 1) {
      const progress = document.createElement('div');
      progress.className = 'quest-objective-progress';
      progress.textContent = `${objective.current ?? 0} / ${objective.count}`;
      container.appendChild(progress);
    }

    return container;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.overlay.remove();
  }
}
