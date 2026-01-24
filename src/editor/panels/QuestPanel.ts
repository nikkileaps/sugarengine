/**
 * QuestPanel - Editor for quests with stage flow visualization
 */

import { EntryList, EntryListItem, Inspector } from '../components';
import type { FieldDefinition } from '../components';
import { editorStore } from '../store';
import { generateUUID, shortId } from '../utils';

// Quest types (matching engine)
interface QuestObjective {
  id: string;
  type: 'talk' | 'location' | 'collect' | 'trigger' | 'custom';
  target: string;
  description: string;
  count?: number;
  optional?: boolean;
  completed?: boolean;
  // For 'talk' objectives - which dialogue to trigger (overrides NPC default)
  dialogue?: string;
  // When does the objective complete? 'dialogueEnd' (default) or specific node id
  completeOn?: 'dialogueEnd' | string;
}

interface QuestStage {
  id: string;
  description: string;
  objectives: QuestObjective[];
  next?: string;
  onComplete?: string;
}

interface QuestReward {
  type: 'item' | 'xp';
  itemId?: string;
  amount?: number;
}

interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  startStage: string;
  stages: QuestStage[];
  rewards?: QuestReward[];
}

// Available data for pickers (will be populated from other panels)
let availableNPCs: { id: string; name: string }[] = [];
let availableItems: { id: string; name: string }[] = [];
let availableDialogues: { id: string; name: string }[] = [];

export function setAvailableNPCs(npcs: { id: string; name: string }[]): void {
  availableNPCs = npcs;
}

export function setAvailableItems(items: { id: string; name: string }[]): void {
  availableItems = items;
}

export function setAvailableDialogues(dialogues: { id: string; name: string }[]): void {
  availableDialogues = dialogues;
}

const QUEST_FIELDS: FieldDefinition[] = [
  { key: 'id', label: 'Quest ID', type: 'text', required: true },
  { key: 'name', label: 'Quest Name', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
];

const OBJECTIVE_TYPES = [
  { value: 'talk', label: 'Talk to NPC' },
  { value: 'location', label: 'Go to Location' },
  { value: 'collect', label: 'Collect Item' },
  { value: 'trigger', label: 'Trigger Event' },
  { value: 'custom', label: 'Custom' },
];

export class QuestPanel {
  private element: HTMLElement;
  private entryList: EntryList;
  private inspector: Inspector;
  private centerPanel: HTMLElement;

  private quests: Map<string, QuestDefinition> = new Map();
  private currentQuestId: string | null = null;
  private selectedStageId: string | null = null;
  private selectedObjectiveId: string | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'panel quest-panel';
    this.element.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    // Entry list (left)
    this.entryList = new EntryList({
      title: 'Quests',
      onSelect: (id) => this.onQuestSelect(id),
      onCreate: () => this.createNewQuest(),
    });
    this.element.appendChild(this.entryList.getElement());

    // Center panel
    this.centerPanel = document.createElement('div');
    this.centerPanel.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #1e1e2e;
    `;
    this.element.appendChild(this.centerPanel);

    // Inspector (right)
    this.inspector = new Inspector({
      title: 'Properties',
      fields: QUEST_FIELDS,
      onChange: (key, value) => this.onFieldChange(key, value),
    });
    this.element.appendChild(this.inspector.getElement());

    this.renderCenterPlaceholder();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  show(): void {
    this.element.style.display = 'flex';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  addQuest(quest: QuestDefinition): void {
    this.quests.set(quest.id, quest);
    this.updateEntryList();
  }

  getQuests(): QuestDefinition[] {
    return Array.from(this.quests.values());
  }

  private updateEntryList(): void {
    const items: EntryListItem[] = Array.from(this.quests.values()).map(q => ({
      id: q.id,
      name: q.name,
      subtitle: `${q.stages.length} stage${q.stages.length !== 1 ? 's' : ''} · ${shortId(q.id)}`,
      icon: '📜',
    }));
    this.entryList.setItems(items);
  }

  private renderCenterPlaceholder(): void {
    this.centerPanel.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #6c7086;
      gap: 12px;
    `;
    placeholder.innerHTML = `
      <div style="font-size: 48px;">📜</div>
      <div style="font-size: 16px;">Select a quest to edit</div>
      <div style="font-size: 13px; max-width: 300px; text-align: center; line-height: 1.5;">
        Choose a quest from the list on the left, or create a new one with the + button.
      </div>
    `;
    this.centerPanel.appendChild(placeholder);
  }

  private renderQuestEditor(quest: QuestDefinition): void {
    this.centerPanel.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      padding: 12px 16px;
      background: #181825;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      gap: 12px;
    `;

    const title = document.createElement('span');
    title.textContent = quest.name;
    title.style.cssText = 'font-weight: 600; font-size: 16px; color: #cdd6f4;';
    toolbar.appendChild(title);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    toolbar.appendChild(spacer);

    const addStageBtn = document.createElement('button');
    addStageBtn.textContent = '+ Add Stage';
    addStageBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #313244;
      border-radius: 4px;
      background: #313244;
      color: #cdd6f4;
      font-size: 12px;
      cursor: pointer;
    `;
    addStageBtn.onclick = () => this.addStage(quest);
    toolbar.appendChild(addStageBtn);

    this.centerPanel.appendChild(toolbar);

    // Main content area
    const content = document.createElement('div');
    content.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 20px;
    `;

    // Quest description
    const descSection = document.createElement('div');
    descSection.style.cssText = `
      margin-bottom: 24px;
      padding: 16px;
      background: #181825;
      border-radius: 8px;
    `;

    const descText = document.createElement('p');
    descText.textContent = quest.description || 'No description';
    descText.style.cssText = 'margin: 0; color: #a6adc8; line-height: 1.5;';
    descSection.appendChild(descText);

    content.appendChild(descSection);

    // Stage flow
    const stageFlow = document.createElement('div');
    stageFlow.style.cssText = `
      display: flex;
      gap: 20px;
      overflow-x: auto;
      padding-bottom: 20px;
    `;

    // Build stage order starting from startStage
    const stageOrder = this.getStageOrder(quest);

    for (let i = 0; i < stageOrder.length; i++) {
      const stage = stageOrder[i]!;
      const isStart = stage.id === quest.startStage;
      const isSelected = stage.id === this.selectedStageId;

      const stageCard = this.createStageCard(quest, stage, i + 1, isStart, isSelected);
      stageFlow.appendChild(stageCard);

      // Arrow between stages
      if (i < stageOrder.length - 1) {
        const arrow = document.createElement('div');
        arrow.style.cssText = `
          display: flex;
          align-items: center;
          font-size: 24px;
          color: #45475a;
        `;
        arrow.textContent = '→';
        stageFlow.appendChild(arrow);
      }
    }

    content.appendChild(stageFlow);

    // Rewards section
    if (quest.rewards && quest.rewards.length > 0) {
      const rewardsSection = document.createElement('div');
      rewardsSection.style.cssText = `
        margin-top: 24px;
        padding: 16px;
        background: #181825;
        border-radius: 8px;
      `;

      const rewardsTitle = document.createElement('h3');
      rewardsTitle.textContent = '🎁 Rewards';
      rewardsTitle.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; color: #f9e2af;';
      rewardsSection.appendChild(rewardsTitle);

      for (const reward of quest.rewards) {
        const rewardEl = document.createElement('div');
        rewardEl.style.cssText = 'color: #a6adc8; font-size: 13px;';
        if (reward.type === 'xp') {
          rewardEl.textContent = `+${reward.amount} XP`;
        } else if (reward.type === 'item') {
          rewardEl.textContent = `Item: ${reward.itemId} x${reward.amount ?? 1}`;
        }
        rewardsSection.appendChild(rewardEl);
      }

      content.appendChild(rewardsSection);
    }

    // Validation warnings
    const warnings = this.validateQuest(quest);
    if (warnings.length > 0) {
      const warningsSection = document.createElement('div');
      warningsSection.style.cssText = `
        margin-top: 24px;
        padding: 16px;
        background: #f38ba822;
        border: 1px solid #f38ba8;
        border-radius: 8px;
      `;

      const warningsTitle = document.createElement('h3');
      warningsTitle.textContent = '⚠ Validation Warnings';
      warningsTitle.style.cssText = 'margin: 0 0 12px 0; font-size: 14px; color: #f38ba8;';
      warningsSection.appendChild(warningsTitle);

      for (const warning of warnings) {
        const warningEl = document.createElement('div');
        warningEl.textContent = `• ${warning}`;
        warningEl.style.cssText = 'color: #f38ba8; font-size: 13px; margin-bottom: 4px;';
        warningsSection.appendChild(warningEl);
      }

      content.appendChild(warningsSection);
    }

    this.centerPanel.appendChild(content);
  }

  private getStageOrder(quest: QuestDefinition): QuestStage[] {
    const stageMap = new Map<string, QuestStage>();
    for (const stage of quest.stages) {
      stageMap.set(stage.id, stage);
    }

    const ordered: QuestStage[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = quest.startStage;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const stage = stageMap.get(currentId);
      if (stage) {
        ordered.push(stage);
        currentId = stage.next;
      } else {
        break;
      }
    }

    // Add any orphaned stages
    for (const stage of quest.stages) {
      if (!visited.has(stage.id)) {
        ordered.push(stage);
      }
    }

    return ordered;
  }

  private createStageCard(
    quest: QuestDefinition,
    stage: QuestStage,
    stageNum: number,
    isStart: boolean,
    isSelected: boolean
  ): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = `
      min-width: 280px;
      max-width: 320px;
      background: #181825;
      border: 2px solid ${isSelected ? '#89b4fa' : isStart ? '#a6e3a1' : '#313244'};
      border-radius: 12px;
      overflow: hidden;
      cursor: pointer;
      transition: border-color 0.15s;
    `;

    card.onclick = () => this.selectStage(quest, stage);

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      background: ${isStart ? '#a6e3a122' : '#313244'};
      display: flex;
      align-items: center;
      gap: 8px;
    `;

    if (isStart) {
      const startIcon = document.createElement('span');
      startIcon.textContent = '▶';
      startIcon.style.cssText = 'color: #a6e3a1; font-size: 12px;';
      header.appendChild(startIcon);
    }

    const stageLabel = document.createElement('span');
    stageLabel.textContent = `Stage ${stageNum}: ${stage.id}`;
    stageLabel.style.cssText = `
      font-weight: 600;
      font-size: 13px;
      color: ${isStart ? '#a6e3a1' : '#cdd6f4'};
    `;
    header.appendChild(stageLabel);

    card.appendChild(header);

    // Description
    const desc = document.createElement('div');
    desc.textContent = stage.description;
    desc.style.cssText = `
      padding: 12px 16px;
      font-size: 13px;
      color: #a6adc8;
      border-bottom: 1px solid #313244;
    `;
    card.appendChild(desc);

    // Objectives
    const objectivesContainer = document.createElement('div');
    objectivesContainer.style.cssText = 'padding: 12px 16px;';

    const objTitle = document.createElement('div');
    objTitle.textContent = 'Objectives';
    objTitle.style.cssText = 'font-size: 11px; color: #6c7086; margin-bottom: 8px; text-transform: uppercase;';
    objectivesContainer.appendChild(objTitle);

    for (const obj of stage.objectives) {
      const objEl = this.createObjectiveElement(quest, stage, obj);
      objectivesContainer.appendChild(objEl);
    }

    // Add objective button
    const addObjBtn = document.createElement('button');
    addObjBtn.textContent = '+ Add Objective';
    addObjBtn.style.cssText = `
      width: 100%;
      margin-top: 8px;
      padding: 6px;
      border: 1px dashed #313244;
      border-radius: 4px;
      background: transparent;
      color: #6c7086;
      font-size: 11px;
      cursor: pointer;
    `;
    addObjBtn.onclick = (e) => {
      e.stopPropagation();
      this.addObjective(quest, stage);
    };
    objectivesContainer.appendChild(addObjBtn);

    card.appendChild(objectivesContainer);

    // Next stage indicator
    if (stage.next) {
      const nextIndicator = document.createElement('div');
      nextIndicator.style.cssText = `
        padding: 8px 16px;
        background: #313244;
        font-size: 11px;
        color: #6c7086;
      `;
      nextIndicator.textContent = `Next → ${stage.next}`;
      card.appendChild(nextIndicator);
    } else if (stage.onComplete) {
      const completeIndicator = document.createElement('div');
      completeIndicator.style.cssText = `
        padding: 8px 16px;
        background: #a6e3a122;
        font-size: 11px;
        color: #a6e3a1;
      `;
      completeIndicator.textContent = `✓ Completes quest (${stage.onComplete})`;
      card.appendChild(completeIndicator);
    }

    return card;
  }

  private createObjectiveElement(
    quest: QuestDefinition,
    stage: QuestStage,
    obj: QuestObjective
  ): HTMLElement {
    const el = document.createElement('div');
    const isSelected = obj.id === this.selectedObjectiveId;
    el.style.cssText = `
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 8px;
      margin-bottom: 4px;
      background: ${isSelected ? '#313244' : 'transparent'};
      border-radius: 4px;
      cursor: pointer;
    `;

    el.onclick = (e) => {
      e.stopPropagation();
      this.selectObjective(quest, stage, obj);
    };

    // Type icon
    const icon = document.createElement('span');
    icon.style.cssText = 'font-size: 14px;';
    switch (obj.type) {
      case 'talk': icon.textContent = '💬'; break;
      case 'location': icon.textContent = '📍'; break;
      case 'collect': icon.textContent = '📦'; break;
      case 'trigger': icon.textContent = '⚡'; break;
      default: icon.textContent = '⭐'; break;
    }
    el.appendChild(icon);

    // Content
    const content = document.createElement('div');
    content.style.cssText = 'flex: 1; min-width: 0;';

    const descEl = document.createElement('div');
    descEl.textContent = obj.description;
    descEl.style.cssText = `
      font-size: 12px;
      color: #cdd6f4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
    content.appendChild(descEl);

    const targetEl = document.createElement('div');
    targetEl.textContent = `${obj.type}: ${obj.target}`;
    targetEl.style.cssText = 'font-size: 10px; color: #6c7086; margin-top: 2px;';
    content.appendChild(targetEl);

    el.appendChild(content);

    // Optional badge
    if (obj.optional) {
      const badge = document.createElement('span');
      badge.textContent = 'OPT';
      badge.style.cssText = `
        padding: 2px 4px;
        background: #f9e2af22;
        color: #f9e2af;
        font-size: 9px;
        border-radius: 2px;
      `;
      el.appendChild(badge);
    }

    return el;
  }

  private selectStage(quest: QuestDefinition, stage: QuestStage): void {
    this.selectedStageId = stage.id;
    this.selectedObjectiveId = null;

    // Update inspector to show stage properties
    this.inspector.setData({
      id: quest.id,
      name: quest.name,
      description: quest.description,
    });

    this.renderQuestEditor(quest);
  }

  private selectObjective(quest: QuestDefinition, stage: QuestStage, obj: QuestObjective): void {
    this.selectedStageId = stage.id;
    this.selectedObjectiveId = obj.id;

    // Show objective editor modal
    this.showObjectiveEditor(quest, stage, obj);
  }

  private showObjectiveEditor(quest: QuestDefinition, stage: QuestStage, obj: QuestObjective): void {
    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      width: 400px;
      max-width: 90%;
      background: #1e1e2e;
      border: 1px solid #313244;
      border-radius: 12px;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px;
      background: #181825;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    const title = document.createElement('span');
    title.textContent = 'Edit Objective';
    title.style.cssText = 'font-weight: 600; color: #cdd6f4;';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #a6adc8;
      font-size: 16px;
      cursor: pointer;
    `;
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // Form
    const form = document.createElement('div');
    form.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 16px;';

    // Type selector
    form.appendChild(this.createFormField('Type', () => {
      const select = document.createElement('select');
      select.style.cssText = this.getInputStyle();
      for (const type of OBJECTIVE_TYPES) {
        const option = document.createElement('option');
        option.value = type.value;
        option.textContent = type.label;
        option.selected = obj.type === type.value;
        select.appendChild(option);
      }
      select.onchange = () => {
        obj.type = select.value as QuestObjective['type'];
        editorStore.setDirty(true);
        // Show/hide dialogue fields based on type
        const dialogueField = form.querySelector('#dialogue-field') as HTMLElement;
        const completeOnField = form.querySelector('#complete-on-field') as HTMLElement;
        if (dialogueField) dialogueField.style.display = obj.type === 'talk' ? 'block' : 'none';
        if (completeOnField) completeOnField.style.display = obj.type === 'talk' ? 'block' : 'none';
      };
      return select;
    }));

    // Description
    form.appendChild(this.createFormField('Description', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = obj.description;
      input.style.cssText = this.getInputStyle();
      input.oninput = () => {
        obj.description = input.value;
        editorStore.setDirty(true);
      };
      return input;
    }));

    // Target with picker
    form.appendChild(this.createFormField('Target', () => {
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; gap: 8px;';

      const input = document.createElement('input');
      input.type = 'text';
      input.value = obj.target;
      input.style.cssText = this.getInputStyle() + 'flex: 1;';
      input.oninput = () => {
        obj.target = input.value;
        editorStore.setDirty(true);
      };
      container.appendChild(input);

      // Picker button based on type
      if (obj.type === 'talk' && availableNPCs.length > 0) {
        const picker = this.createPickerButton('NPC', availableNPCs, (id) => {
          input.value = id;
          obj.target = id;
          editorStore.setDirty(true);
        });
        container.appendChild(picker);
      } else if (obj.type === 'collect' && availableItems.length > 0) {
        const picker = this.createPickerButton('Item', availableItems, (id) => {
          input.value = id;
          obj.target = id;
          editorStore.setDirty(true);
        });
        container.appendChild(picker);
      }

      return container;
    }));

    // Dialogue picker (only for 'talk' type)
    const dialogueField = this.createFormField('Dialogue', () => {
      const container = document.createElement('div');
      container.style.cssText = 'position: relative;';

      // Create searchable select
      const selectWrapper = document.createElement('div');
      selectWrapper.style.cssText = `
        position: relative;
        width: 100%;
      `;

      const selectedDisplay = document.createElement('div');
      selectedDisplay.style.cssText = `
        ${this.getInputStyle()}
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        min-height: 38px;
      `;

      const updateDisplay = () => {
        if (obj.dialogue) {
          const dialogue = availableDialogues.find(d => d.id === obj.dialogue);
          selectedDisplay.innerHTML = `
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="color: #89b4fa;">💬</span>
              <span>${dialogue?.name ?? obj.dialogue}</span>
            </span>
            <span style="color: #6c7086;">▼</span>
          `;
        } else {
          selectedDisplay.innerHTML = `
            <span style="color: #6c7086;">Use NPC's default dialogue</span>
            <span style="color: #6c7086;">▼</span>
          `;
        }
      };
      updateDisplay();

      selectWrapper.appendChild(selectedDisplay);

      // Dropdown
      const dropdown = document.createElement('div');
      dropdown.style.cssText = `
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        background: #1e1e2e;
        border: 1px solid #313244;
        border-radius: 6px;
        margin-top: 4px;
        max-height: 250px;
        overflow-y: auto;
        z-index: 1002;
        display: none;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      `;

      // Search input
      const searchContainer = document.createElement('div');
      searchContainer.style.cssText = `
        padding: 8px;
        border-bottom: 1px solid #313244;
        position: sticky;
        top: 0;
        background: #1e1e2e;
      `;
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search dialogues...';
      searchInput.style.cssText = `
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #313244;
        border-radius: 4px;
        background: #181825;
        color: #cdd6f4;
        font-size: 12px;
        outline: none;
      `;
      searchContainer.appendChild(searchInput);
      dropdown.appendChild(searchContainer);

      // Options container
      const optionsContainer = document.createElement('div');
      dropdown.appendChild(optionsContainer);

      const renderOptions = (filter: string = '') => {
        optionsContainer.innerHTML = '';
        const filterLower = filter.toLowerCase();

        // "None" option
        const noneOption = document.createElement('div');
        noneOption.style.cssText = `
          padding: 10px 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid #313244;
          color: #6c7086;
          font-style: italic;
        `;
        noneOption.innerHTML = `
          <span>🚫</span>
          <span>Use NPC's default dialogue</span>
        `;
        noneOption.onmouseenter = () => noneOption.style.background = '#313244';
        noneOption.onmouseleave = () => noneOption.style.background = 'transparent';
        noneOption.onclick = () => {
          obj.dialogue = undefined;
          editorStore.setDirty(true);
          updateDisplay();
          dropdown.style.display = 'none';
        };
        optionsContainer.appendChild(noneOption);

        // Dialogue options
        const filtered = availableDialogues.filter(d =>
          d.id.toLowerCase().includes(filterLower) ||
          d.name.toLowerCase().includes(filterLower)
        );

        if (filtered.length === 0 && filter) {
          const noResults = document.createElement('div');
          noResults.style.cssText = 'padding: 12px; color: #6c7086; text-align: center; font-size: 12px;';
          noResults.textContent = 'No dialogues found';
          optionsContainer.appendChild(noResults);
        }

        for (const dialogue of filtered) {
          const option = document.createElement('div');
          const isSelected = obj.dialogue === dialogue.id;
          option.style.cssText = `
            padding: 10px 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 10px;
            background: ${isSelected ? '#313244' : 'transparent'};
          `;
          option.innerHTML = `
            <span style="font-size: 16px;">💬</span>
            <div style="flex: 1; min-width: 0;">
              <div style="font-size: 13px; color: #cdd6f4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${dialogue.name}
              </div>
              <div style="font-size: 10px; color: #6c7086; margin-top: 2px;">
                ${dialogue.id}
              </div>
            </div>
            ${isSelected ? '<span style="color: #a6e3a1;">✓</span>' : ''}
          `;
          option.onmouseenter = () => { if (!isSelected) option.style.background = '#313244'; };
          option.onmouseleave = () => { if (!isSelected) option.style.background = 'transparent'; };
          option.onclick = () => {
            obj.dialogue = dialogue.id;
            editorStore.setDirty(true);
            updateDisplay();
            dropdown.style.display = 'none';
          };
          optionsContainer.appendChild(option);
        }
      };

      searchInput.oninput = () => renderOptions(searchInput.value);

      // Toggle dropdown
      selectedDisplay.onclick = () => {
        const isOpen = dropdown.style.display === 'block';
        dropdown.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) {
          searchInput.value = '';
          renderOptions();
          setTimeout(() => searchInput.focus(), 0);
        }
      };

      // Close on click outside
      const closeHandler = (e: MouseEvent) => {
        if (!selectWrapper.contains(e.target as Node)) {
          dropdown.style.display = 'none';
        }
      };
      document.addEventListener('click', closeHandler);

      selectWrapper.appendChild(dropdown);
      container.appendChild(selectWrapper);

      return container;
    });
    dialogueField.id = 'dialogue-field';
    dialogueField.style.display = obj.type === 'talk' ? 'block' : 'none';
    form.appendChild(dialogueField);

    // Complete on (only for 'talk' type with dialogue)
    const completeOnField = this.createFormField('Complete When', () => {
      const select = document.createElement('select');
      select.style.cssText = this.getInputStyle();

      const endOption = document.createElement('option');
      endOption.value = 'dialogueEnd';
      endOption.textContent = 'Dialogue ends';
      endOption.selected = !obj.completeOn || obj.completeOn === 'dialogueEnd';
      select.appendChild(endOption);

      // TODO: Could add node picker here for specific node completion

      select.onchange = () => {
        obj.completeOn = select.value as 'dialogueEnd' | string;
        editorStore.setDirty(true);
      };
      return select;
    });
    completeOnField.id = 'complete-on-field';
    completeOnField.style.display = obj.type === 'talk' ? 'block' : 'none';
    form.appendChild(completeOnField);

    // Optional checkbox
    form.appendChild(this.createFormField('Optional', () => {
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = obj.optional ?? false;
      checkbox.style.cssText = 'width: 18px; height: 18px;';
      checkbox.onchange = () => {
        obj.optional = checkbox.checked;
        editorStore.setDirty(true);
      };
      return checkbox;
    }));

    modal.appendChild(form);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 16px;
      background: #181825;
      border-top: 1px solid #313244;
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    `;

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.style.cssText = `
      padding: 8px 16px;
      border: 1px solid #f38ba8;
      border-radius: 6px;
      background: transparent;
      color: #f38ba8;
      font-size: 13px;
      cursor: pointer;
      margin-right: auto;
    `;
    deleteBtn.onclick = () => {
      stage.objectives = stage.objectives.filter(o => o.id !== obj.id);
      editorStore.setDirty(true);
      overlay.remove();
      this.renderQuestEditor(quest);
    };
    footer.appendChild(deleteBtn);

    const doneBtn = document.createElement('button');
    doneBtn.textContent = 'Done';
    doneBtn.style.cssText = `
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      background: #89b4fa;
      color: #1e1e2e;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    `;
    doneBtn.onclick = () => {
      overlay.remove();
      this.renderQuestEditor(quest);
    };
    footer.appendChild(doneBtn);

    modal.appendChild(footer);

    overlay.appendChild(modal);
    overlay.onclick = (e) => {
      if (e.target === overlay) overlay.remove();
    };

    document.body.appendChild(overlay);
  }

  private createFormField(label: string, createInput: () => HTMLElement): HTMLElement {
    const field = document.createElement('div');

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = `
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: #a6adc8;
      margin-bottom: 6px;
    `;
    field.appendChild(labelEl);

    field.appendChild(createInput());

    return field;
  }

  private createPickerButton(
    label: string,
    items: { id: string; name: string }[],
    onSelect: (id: string) => void
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.textContent = `Pick ${label}`;
    btn.style.cssText = `
      padding: 8px 12px;
      border: 1px solid #313244;
      border-radius: 6px;
      background: #313244;
      color: #cdd6f4;
      font-size: 12px;
      cursor: pointer;
      white-space: nowrap;
    `;

    btn.onclick = () => {
      // Create dropdown
      const dropdown = document.createElement('div');
      dropdown.style.cssText = `
        position: absolute;
        background: #1e1e2e;
        border: 1px solid #313244;
        border-radius: 6px;
        max-height: 200px;
        overflow-y: auto;
        z-index: 1001;
        min-width: 150px;
      `;

      const rect = btn.getBoundingClientRect();
      dropdown.style.top = `${rect.bottom + 4}px`;
      dropdown.style.left = `${rect.left}px`;

      for (const item of items) {
        const option = document.createElement('div');
        option.textContent = `${item.name} (${item.id})`;
        option.style.cssText = `
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
          color: #cdd6f4;
        `;
        option.onmouseenter = () => option.style.background = '#313244';
        option.onmouseleave = () => option.style.background = 'transparent';
        option.onclick = () => {
          onSelect(item.id);
          dropdown.remove();
        };
        dropdown.appendChild(option);
      }

      document.body.appendChild(dropdown);

      // Close on click outside
      const closeDropdown = (e: MouseEvent) => {
        if (!dropdown.contains(e.target as Node)) {
          dropdown.remove();
          document.removeEventListener('click', closeDropdown);
        }
      };
      setTimeout(() => document.addEventListener('click', closeDropdown), 0);
    };

    return btn;
  }

  private getInputStyle(): string {
    return `
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #313244;
      border-radius: 6px;
      background: #181825;
      color: #cdd6f4;
      font-size: 13px;
      outline: none;
    `;
  }

  private validateQuest(quest: QuestDefinition): string[] {
    const warnings: string[] = [];

    // Check if start stage exists
    if (!quest.stages.find(s => s.id === quest.startStage)) {
      warnings.push(`Start stage "${quest.startStage}" not found`);
    }

    // Check stage references
    for (const stage of quest.stages) {
      if (stage.next && !quest.stages.find(s => s.id === stage.next)) {
        warnings.push(`Stage "${stage.id}" references non-existent stage "${stage.next}"`);
      }

      // Check for empty objectives
      if (stage.objectives.length === 0) {
        warnings.push(`Stage "${stage.id}" has no objectives`);
      }

      // Check objective targets
      for (const obj of stage.objectives) {
        if (!obj.target) {
          warnings.push(`Objective "${obj.id}" in stage "${stage.id}" has no target`);
        }
      }
    }

    return warnings;
  }

  private addStage(quest: QuestDefinition): void {
    const stageId = generateUUID();
    const newStage: QuestStage = {
      id: stageId,
      description: 'New stage',
      objectives: [],
    };

    // If there are existing stages, link the last one to this new one
    if (quest.stages.length > 0) {
      const lastStage = quest.stages[quest.stages.length - 1]!;
      if (!lastStage.onComplete) {
        lastStage.next = stageId;
      }
    }

    quest.stages.push(newStage);
    editorStore.setDirty(true);
    this.updateEntryList();
    this.renderQuestEditor(quest);
  }

  private addObjective(quest: QuestDefinition, stage: QuestStage): void {
    const objId = generateUUID();
    const newObj: QuestObjective = {
      id: objId,
      type: 'talk',
      target: '',
      description: 'New objective',
    };

    stage.objectives.push(newObj);
    editorStore.setDirty(true);
    this.renderQuestEditor(quest);
    this.showObjectiveEditor(quest, stage, newObj);
  }

  private createNewQuest(): void {
    const id = generateUUID();
    const quest: QuestDefinition = {
      id,
      name: 'New Quest',
      description: 'Quest description...',
      startStage: 'start',
      stages: [
        {
          id: 'start',
          description: 'First stage',
          objectives: [
            {
              id: 'obj-1',
              type: 'talk',
              target: '',
              description: 'Talk to someone',
            },
          ],
        },
      ],
    };
    this.addQuest(quest);
    editorStore.selectEntry(id);
    this.onQuestSelect(id);
  }

  private onQuestSelect(id: string): void {
    this.currentQuestId = id;
    this.selectedStageId = null;
    this.selectedObjectiveId = null;

    const quest = this.quests.get(id);
    if (quest) {
      this.inspector.setData({
        id: quest.id,
        name: quest.name,
        description: quest.description,
      });
      this.renderQuestEditor(quest);
      this.entryList.setSelected(id);
    } else {
      this.inspector.clear();
      this.renderCenterPlaceholder();
    }
  }

  private onFieldChange(key: string, value: unknown): void {
    if (!this.currentQuestId) return;

    const quest = this.quests.get(this.currentQuestId);
    if (!quest) return;

    (quest as unknown as Record<string, unknown>)[key] = value;
    editorStore.setDirty(true);

    this.updateEntryList();
    this.renderQuestEditor(quest);
  }
}
