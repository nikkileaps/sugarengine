import { QuestManager } from '../quests';

/**
 * HUD element showing the currently tracked quest objective
 * Displays in top-right corner below notifications
 */
export class QuestTracker {
  private container: HTMLDivElement;
  private questName: HTMLDivElement;
  private objectiveText: HTMLDivElement;
  private progressText: HTMLDivElement;
  private questManager: QuestManager;

  constructor(parentContainer: HTMLElement, questManager: QuestManager) {
    this.questManager = questManager;
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'quest-tracker';

    // Quest name header
    this.questName = document.createElement('div');
    this.questName.className = 'quest-tracker-name';
    this.container.appendChild(this.questName);

    // Current objective
    this.objectiveText = document.createElement('div');
    this.objectiveText.className = 'quest-tracker-objective';
    this.container.appendChild(this.objectiveText);

    // Progress (for countable objectives)
    this.progressText = document.createElement('div');
    this.progressText.className = 'quest-tracker-progress';
    this.container.appendChild(this.progressText);

    parentContainer.appendChild(this.container);

    // Initial update
    this.update();
  }

  private injectStyles(): void {
    if (document.getElementById('quest-tracker-styles')) return;

    const style = document.createElement('style');
    style.id = 'quest-tracker-styles';
    style.textContent = `
      .quest-tracker {
        position: absolute;
        top: 80px;
        right: 20px;
        background: linear-gradient(180deg, rgba(25, 22, 35, 0.85) 0%, rgba(20, 18, 28, 0.85) 100%);
        border: 1px solid rgba(180, 160, 140, 0.25);
        border-radius: 10px;
        padding: 12px 16px;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0e6d8;
        min-width: 200px;
        max-width: 280px;
        z-index: 100;
        display: none;
      }

      .quest-tracker.visible {
        display: block;
      }

      .quest-tracker-name {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #a8d4f0;
        margin-bottom: 6px;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(180, 160, 140, 0.2);
      }

      .quest-tracker-objective {
        font-size: 14px;
        line-height: 1.4;
        color: #e8ddd0;
      }

      .quest-tracker-objective::before {
        content: '';
        display: inline-block;
        width: 8px;
        height: 8px;
        border: 2px solid rgba(168, 212, 240, 0.6);
        border-radius: 2px;
        margin-right: 8px;
        vertical-align: middle;
      }

      .quest-tracker-progress {
        font-size: 12px;
        color: rgba(240, 230, 216, 0.5);
        margin-top: 4px;
        margin-left: 18px;
        display: none;
      }

      .quest-tracker-progress.visible {
        display: block;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update the tracker display
   */
  update(): void {
    const questName = this.questManager.getTrackedQuestName();
    const objective = this.questManager.getTrackedObjective();

    if (!questName || !objective) {
      this.container.classList.remove('visible');
      return;
    }

    this.container.classList.add('visible');
    this.questName.textContent = questName;
    this.objectiveText.textContent = objective.description;

    // Show progress for countable objectives
    if (objective.count && objective.count > 1) {
      this.progressText.textContent = `${objective.current ?? 0} / ${objective.count}`;
      this.progressText.classList.add('visible');
    } else {
      this.progressText.classList.remove('visible');
    }
  }

  /**
   * Force show/hide
   */
  setVisible(visible: boolean): void {
    if (visible) {
      this.update();
    } else {
      this.container.classList.remove('visible');
    }
  }

  dispose(): void {
    this.container.remove();
  }
}
