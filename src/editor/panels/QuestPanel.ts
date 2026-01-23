/**
 * QuestPanel - Editor for quests
 */

import { BasePanel } from './BasePanel';
import { editorStore } from '../store';
import type { FieldDefinition } from '../components';

// Quest types (matching engine)
interface QuestObjective {
  id: string;
  type: 'talk' | 'location' | 'collect' | 'trigger' | 'custom';
  target: string;
  description: string;
  count?: number;
  optional?: boolean;
}

interface QuestStage {
  id: string;
  objectives: QuestObjective[];
}

interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  stages: QuestStage[];
  rewards?: {
    items?: { id: string; quantity: number }[];
    experience?: number;
  };
}

const QUEST_FIELDS: FieldDefinition[] = [
  { key: 'id', label: 'ID', type: 'text', required: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'description', label: 'Description', type: 'textarea' },
];

export class QuestPanel extends BasePanel {
  private quests: Map<string, QuestDefinition> = new Map();
  private currentQuestId: string | null = null;

  constructor() {
    super({
      title: 'Quests',
      inspectorTitle: 'Quest Properties',
      inspectorFields: QUEST_FIELDS,
      onCreate: () => this.createNewQuest(),
    });

    this.renderCenterPlaceholder();
  }

  addQuest(quest: QuestDefinition): void {
    this.quests.set(quest.id, quest);
    this.updateEntryList();
    editorStore.setDirty(true);
  }

  getQuests(): QuestDefinition[] {
    return Array.from(this.quests.values());
  }

  private updateEntryList(): void {
    const items = Array.from(this.quests.values()).map(q => ({
      id: q.id,
      name: q.name,
      subtitle: `${q.stages.length} stage${q.stages.length !== 1 ? 's' : ''}`,
      icon: '📜',
    }));
    this.setEntries(items);
  }

  private renderCenterPlaceholder(): void {
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
    this.setCenterContent(placeholder);
  }

  private renderQuestEditor(quest: QuestDefinition): void {
    const editor = document.createElement('div');
    editor.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding-bottom: 16px;
      border-bottom: 1px solid #313244;
    `;

    const title = document.createElement('h2');
    title.textContent = quest.name;
    title.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 18px;
      color: #cdd6f4;
    `;
    header.appendChild(title);

    const desc = document.createElement('p');
    desc.textContent = quest.description || 'No description';
    desc.style.cssText = `
      margin: 0;
      font-size: 13px;
      color: #a6adc8;
    `;
    header.appendChild(desc);

    editor.appendChild(header);

    // Stage flow
    const stageFlow = document.createElement('div');
    stageFlow.style.cssText = `
      display: flex;
      gap: 16px;
      overflow-x: auto;
      padding: 16px 0;
    `;

    for (let i = 0; i < quest.stages.length; i++) {
      const stage = quest.stages[i]!;
      const stageEl = this.createStageElement(stage, i + 1);
      stageFlow.appendChild(stageEl);

      // Arrow between stages
      if (i < quest.stages.length - 1) {
        const arrow = document.createElement('div');
        arrow.textContent = '→';
        arrow.style.cssText = `
          display: flex;
          align-items: center;
          font-size: 24px;
          color: #45475a;
        `;
        stageFlow.appendChild(arrow);
      }
    }

    editor.appendChild(stageFlow);

    // Add stage button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Stage';
    addBtn.style.cssText = `
      padding: 12px;
      border: 2px dashed #313244;
      border-radius: 8px;
      background: transparent;
      color: #6c7086;
      font-size: 13px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
      align-self: flex-start;
    `;
    addBtn.onmouseenter = () => {
      addBtn.style.borderColor = '#45475a';
      addBtn.style.color = '#cdd6f4';
    };
    addBtn.onmouseleave = () => {
      addBtn.style.borderColor = '#313244';
      addBtn.style.color = '#6c7086';
    };
    addBtn.onclick = () => this.addStageToQuest();
    editor.appendChild(addBtn);

    this.setCenterContent(editor);
  }

  private createStageElement(stage: QuestStage, stageNum: number): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText = `
      min-width: 200px;
      padding: 16px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 8px;
    `;

    const header = document.createElement('div');
    header.textContent = `Stage ${stageNum}`;
    header.style.cssText = `
      font-size: 14px;
      font-weight: 600;
      color: #cdd6f4;
      margin-bottom: 12px;
    `;
    el.appendChild(header);

    // Objectives
    for (const obj of stage.objectives) {
      const objEl = document.createElement('div');
      objEl.style.cssText = `
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
      `;

      const icon = document.createElement('span');
      icon.textContent = obj.optional ? '◯' : '○';
      icon.style.color = obj.optional ? '#f9e2af' : '#a6e3a1';
      objEl.appendChild(icon);

      const text = document.createElement('span');
      text.textContent = obj.description;
      text.style.color = '#a6adc8';
      objEl.appendChild(text);

      el.appendChild(objEl);
    }

    // Add objective button
    const addObj = document.createElement('button');
    addObj.textContent = '+ Objective';
    addObj.style.cssText = `
      margin-top: 8px;
      padding: 4px 8px;
      border: 1px dashed #313244;
      border-radius: 4px;
      background: transparent;
      color: #6c7086;
      font-size: 11px;
      cursor: pointer;
    `;
    el.appendChild(addObj);

    return el;
  }

  private createNewQuest(): void {
    const id = `quest-${Date.now()}`;
    const quest: QuestDefinition = {
      id,
      name: 'New Quest',
      description: 'Quest description...',
      stages: [
        {
          id: 'stage-1',
          objectives: [
            {
              id: 'obj-1',
              type: 'talk',
              target: 'npc-id',
              description: 'Talk to the NPC',
            },
          ],
        },
      ],
    };
    this.addQuest(quest);
    editorStore.selectEntry(id);
    this.onEntrySelect(id);
  }

  private addStageToQuest(): void {
    if (!this.currentQuestId) return;

    const quest = this.quests.get(this.currentQuestId);
    if (!quest) return;

    const stageId = `stage-${Date.now()}`;
    quest.stages.push({
      id: stageId,
      objectives: [],
    });

    editorStore.setDirty(true);
    this.updateEntryList();
    this.renderQuestEditor(quest);
  }

  protected onEntrySelect(id: string): void {
    this.currentQuestId = id;

    const quest = this.quests.get(id);
    if (quest) {
      this.setInspectorData({
        id: quest.id,
        name: quest.name,
        description: quest.description,
      });
      this.renderQuestEditor(quest);
      this.entryList.setSelected(id);
    } else {
      this.clearInspector();
      this.renderCenterPlaceholder();
    }
  }

  protected onFieldChange(key: string, value: unknown): void {
    if (!this.currentQuestId) return;

    const quest = this.quests.get(this.currentQuestId);
    if (!quest) return;

    (quest as unknown as Record<string, unknown>)[key] = value;
    editorStore.setDirty(true);

    this.updateEntryList();
    this.renderQuestEditor(quest);
  }
}
