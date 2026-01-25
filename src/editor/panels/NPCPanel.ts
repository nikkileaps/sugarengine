/**
 * NPCPanel - Editor for NPC database
 *
 * Features:
 * - NPC list with search/filter
 * - Portrait preview
 * - Reference tracking (shows dialogues/quests using this NPC)
 * - Quick-create dialogue for NPC
 * - Validation warnings
 */

import { BasePanel } from './BasePanel';
import { editorStore } from '../store';
import { generateUUID, shortId } from '../utils';
import type { FieldDefinition } from '../components';

interface NPCEntry {
  id: string;
  name: string;
  portrait?: string;
  description?: string;
  defaultDialogue?: string;
  faction?: string;
}

interface DialogueReference {
  id: string;
  name: string;
  type: 'speaker' | 'target';
}

interface QuestReference {
  id: string;
  name: string;
  stageName: string;
  objectiveDesc: string;
}

// Available data for reference tracking
let availableDialogues: { id: string; displayName?: string; nodes?: { speaker?: string }[] }[] = [];
let availableQuests: { id: string; name: string; stages: { id: string; description: string; objectives: { type: string; target: string; description: string }[] }[] }[] = [];

export function setAvailableDialogues(dialogues: typeof availableDialogues): void {
  availableDialogues = dialogues;
}

export function setAvailableQuests(quests: typeof availableQuests): void {
  availableQuests = quests;
}

const NPC_FIELDS: FieldDefinition[] = [
  { key: 'id', label: 'ID', type: 'text', required: true },
  { key: 'name', label: 'Display Name', type: 'text', required: true },
  { key: 'portrait', label: 'Portrait Path', type: 'text', placeholder: '/portraits/npc.png' },
  { key: 'description', label: 'Description', type: 'textarea', placeholder: 'Designer notes...' },
  { key: 'defaultDialogue', label: 'Default Dialogue', type: 'text', placeholder: 'dialogue-id' },
  { key: 'faction', label: 'Faction', type: 'text', placeholder: 'For reputation system' },
];

export class NPCPanel extends BasePanel {
  private npcs: Map<string, NPCEntry> = new Map();
  private currentNpcId: string | null = null;

  constructor() {
    super({
      title: 'NPCs',
      inspectorTitle: 'NPC Properties',
      inspectorFields: NPC_FIELDS,
      onCreate: () => this.createNewNPC(),
    });

    this.renderCenterPlaceholder();
  }

  addNPC(npc: NPCEntry): void {
    this.npcs.set(npc.id, npc);
    this.updateEntryList();
  }

  getNPCs(): NPCEntry[] {
    return Array.from(this.npcs.values());
  }

  clear(): void {
    this.npcs.clear();
    this.currentNpcId = null;
    this.updateEntryList();
    this.clearInspector();
    this.renderCenterPlaceholder();
  }

  private updateEntryList(): void {
    const items = Array.from(this.npcs.values()).map(n => {
      const warnings = this.validateNPC(n);
      // Show faction + short UUID for easy identification
      const factionInfo = n.faction ? `${n.faction} · ` : '';
      return {
        id: n.id,
        name: n.name,
        subtitle: `${factionInfo}${shortId(n.id)}`,
        icon: '👤',
        badge: warnings.length > 0 ? `${warnings.length}` : undefined,
        badgeColor: '#f38ba8',
      };
    });
    this.setEntries(items);
  }

  private validateNPC(npc: NPCEntry): string[] {
    const warnings: string[] = [];

    // Check if NPC has a dialogue
    if (!npc.defaultDialogue) {
      warnings.push('No default dialogue assigned');
    } else {
      // Check if dialogue exists
      const dialogueExists = availableDialogues.some(d => d.id === npc.defaultDialogue);
      if (!dialogueExists && availableDialogues.length > 0) {
        warnings.push(`Default dialogue "${npc.defaultDialogue}" not found`);
      }
    }

    return warnings;
  }

  private findDialogueReferences(npcId: string): DialogueReference[] {
    const refs: DialogueReference[] = [];

    for (const dialogue of availableDialogues) {
      // Check if NPC appears as speaker in any nodes
      if (dialogue.nodes) {
        for (const node of dialogue.nodes) {
          if (node.speaker === npcId && !refs.some(r => r.id === dialogue.id)) {
            refs.push({
              id: dialogue.id,
              name: dialogue.displayName || dialogue.id,
              type: 'speaker',
            });
            break; // Only add once per dialogue
          }
        }
      }
    }

    return refs;
  }

  private findQuestReferences(npcId: string): QuestReference[] {
    const refs: QuestReference[] = [];

    for (const quest of availableQuests) {
      for (const stage of quest.stages) {
        for (const obj of stage.objectives) {
          if (obj.type === 'talk' && obj.target === npcId) {
            refs.push({
              id: quest.id,
              name: quest.name,
              stageName: stage.id,
              objectiveDesc: obj.description,
            });
          }
        }
      }
    }

    return refs;
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
      <div style="font-size: 48px;">👤</div>
      <div style="font-size: 16px;">Select an NPC to edit</div>
      <div style="font-size: 13px; max-width: 300px; text-align: center; line-height: 1.5;">
        Choose an NPC from the list on the left, or create a new one with the + button.
      </div>
    `;
    this.setCenterContent(placeholder);
  }

  private renderNPCDetail(npc: NPCEntry): void {
    const detail = document.createElement('div');
    detail.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    `;

    // Header with portrait
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      gap: 24px;
      align-items: flex-start;
    `;

    // Portrait
    const portrait = document.createElement('div');
    portrait.style.cssText = `
      width: 120px;
      height: 120px;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      overflow: hidden;
      position: relative;
    `;

    if (npc.portrait) {
      const img = document.createElement('img');
      img.src = npc.portrait;
      img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: cover;
      `;
      img.onerror = () => {
        img.style.display = 'none';
        portrait.textContent = '👤';
      };
      portrait.appendChild(img);
    } else {
      portrait.textContent = '👤';
    }

    // Upload overlay
    const uploadOverlay = document.createElement('div');
    uploadOverlay.style.cssText = `
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 4px;
      background: rgba(0,0,0,0.7);
      text-align: center;
      font-size: 10px;
      color: #a6adc8;
      cursor: pointer;
    `;
    uploadOverlay.textContent = 'Click to change';
    uploadOverlay.onclick = () => {
      const path = prompt('Enter portrait path:', npc.portrait || '/portraits/');
      if (path !== null) {
        npc.portrait = path;
        editorStore.setDirty(true);
        this.renderNPCDetail(npc);
      }
    };
    portrait.appendChild(uploadOverlay);
    header.appendChild(portrait);

    // Info
    const info = document.createElement('div');
    info.style.cssText = `flex: 1;`;

    const name = document.createElement('h2');
    name.textContent = npc.name;
    name.style.cssText = `
      margin: 0 0 8px 0;
      font-size: 24px;
      color: #cdd6f4;
    `;
    info.appendChild(name);

    // UUID display with copy button
    const idRow = document.createElement('div');
    idRow.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    `;

    const idLabel = document.createElement('span');
    idLabel.textContent = 'UUID:';
    idLabel.style.cssText = `
      font-size: 11px;
      color: #6c7086;
      text-transform: uppercase;
    `;
    idRow.appendChild(idLabel);

    const idValue = document.createElement('code');
    idValue.textContent = npc.id;
    idValue.style.cssText = `
      font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
      font-size: 12px;
      color: #89dceb;
      background: #181825;
      padding: 4px 8px;
      border-radius: 4px;
      user-select: all;
    `;
    idRow.appendChild(idValue);

    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋';
    copyBtn.title = 'Copy UUID';
    copyBtn.style.cssText = `
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 14px;
      opacity: 0.6;
      padding: 4px;
    `;
    copyBtn.onmouseenter = () => copyBtn.style.opacity = '1';
    copyBtn.onmouseleave = () => copyBtn.style.opacity = '0.6';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(npc.id);
      copyBtn.textContent = '✓';
      setTimeout(() => copyBtn.textContent = '📋', 1500);
    };
    idRow.appendChild(copyBtn);

    info.appendChild(idRow);

    if (npc.faction) {
      const factionBadge = document.createElement('span');
      factionBadge.textContent = npc.faction;
      factionBadge.style.cssText = `
        display: inline-block;
        padding: 4px 8px;
        background: #89b4fa22;
        color: #89b4fa;
        border-radius: 4px;
        font-size: 12px;
        margin-bottom: 12px;
      `;
      info.appendChild(factionBadge);
    }

    // Default dialogue link
    if (npc.defaultDialogue) {
      const dialogueLink = document.createElement('div');
      dialogueLink.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 8px;
      `;

      const icon = document.createElement('span');
      icon.textContent = '💬';
      dialogueLink.appendChild(icon);

      const link = document.createElement('a');
      link.textContent = npc.defaultDialogue;
      link.href = '#';
      link.style.cssText = `
        color: #89b4fa;
        font-size: 13px;
        text-decoration: none;
      `;
      link.onclick = (e) => {
        e.preventDefault();
        // Switch to dialogues tab and select
        editorStore.setActiveTab('dialogues');
        editorStore.selectEntry(npc.defaultDialogue!);
      };
      dialogueLink.appendChild(link);

      info.appendChild(dialogueLink);
    }

    header.appendChild(info);
    detail.appendChild(header);

    // Description
    if (npc.description) {
      const descSection = document.createElement('div');
      descSection.style.cssText = `
        padding: 16px;
        background: #181825;
        border-radius: 8px;
      `;

      const descTitle = document.createElement('h3');
      descTitle.textContent = 'Notes';
      descTitle.style.cssText = `
        margin: 0 0 8px 0;
        font-size: 14px;
        color: #cdd6f4;
      `;
      descSection.appendChild(descTitle);

      const descText = document.createElement('p');
      descText.textContent = npc.description;
      descText.style.cssText = `
        margin: 0;
        font-size: 13px;
        color: #a6adc8;
        line-height: 1.5;
        white-space: pre-wrap;
      `;
      descSection.appendChild(descText);

      detail.appendChild(descSection);
    }

    // References section
    const dialogueRefs = this.findDialogueReferences(npc.id);
    const questRefs = this.findQuestReferences(npc.id);

    const refSection = document.createElement('div');
    refSection.style.cssText = `
      padding: 16px;
      background: #181825;
      border-radius: 8px;
    `;

    const refTitle = document.createElement('h3');
    refTitle.textContent = 'References';
    refTitle.style.cssText = `
      margin: 0 0 12px 0;
      font-size: 14px;
      color: #cdd6f4;
    `;
    refSection.appendChild(refTitle);

    if (dialogueRefs.length === 0 && questRefs.length === 0) {
      const noRefs = document.createElement('div');
      noRefs.textContent = 'This NPC is not referenced by any dialogues or quests.';
      noRefs.style.cssText = `
        font-size: 12px;
        color: #6c7086;
        font-style: italic;
      `;
      refSection.appendChild(noRefs);
    } else {
      // Dialogue references
      if (dialogueRefs.length > 0) {
        const dialogueHeader = document.createElement('div');
        dialogueHeader.textContent = `Dialogues (${dialogueRefs.length})`;
        dialogueHeader.style.cssText = `
          font-size: 11px;
          color: #6c7086;
          margin-bottom: 8px;
          text-transform: uppercase;
        `;
        refSection.appendChild(dialogueHeader);

        for (const ref of dialogueRefs) {
          const refEl = document.createElement('div');
          refEl.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            margin-bottom: 4px;
            background: #1e1e2e;
            border-radius: 4px;
            cursor: pointer;
          `;
          refEl.onclick = () => {
            editorStore.setActiveTab('dialogues');
            editorStore.selectEntry(ref.id);
          };

          const icon = document.createElement('span');
          icon.textContent = '💬';
          icon.style.fontSize = '14px';
          refEl.appendChild(icon);

          const name = document.createElement('span');
          name.textContent = ref.name;
          name.style.cssText = 'font-size: 13px; color: #cdd6f4;';
          refEl.appendChild(name);

          const badge = document.createElement('span');
          badge.textContent = ref.type;
          badge.style.cssText = `
            margin-left: auto;
            padding: 2px 6px;
            background: #89b4fa22;
            color: #89b4fa;
            border-radius: 3px;
            font-size: 10px;
          `;
          refEl.appendChild(badge);

          refSection.appendChild(refEl);
        }
      }

      // Quest references
      if (questRefs.length > 0) {
        const questHeader = document.createElement('div');
        questHeader.textContent = `Quests (${questRefs.length})`;
        questHeader.style.cssText = `
          font-size: 11px;
          color: #6c7086;
          margin: 12px 0 8px 0;
          text-transform: uppercase;
        `;
        refSection.appendChild(questHeader);

        for (const ref of questRefs) {
          const refEl = document.createElement('div');
          refEl.style.cssText = `
            padding: 8px;
            margin-bottom: 4px;
            background: #1e1e2e;
            border-radius: 4px;
            cursor: pointer;
          `;
          refEl.onclick = () => {
            editorStore.setActiveTab('quests');
            editorStore.selectEntry(ref.id);
          };

          const header = document.createElement('div');
          header.style.cssText = 'display: flex; align-items: center; gap: 8px;';

          const icon = document.createElement('span');
          icon.textContent = '📜';
          icon.style.fontSize = '14px';
          header.appendChild(icon);

          const name = document.createElement('span');
          name.textContent = ref.name;
          name.style.cssText = 'font-size: 13px; color: #cdd6f4;';
          header.appendChild(name);

          refEl.appendChild(header);

          const subtext = document.createElement('div');
          subtext.textContent = `Stage: ${ref.stageName} - ${ref.objectiveDesc}`;
          subtext.style.cssText = `
            font-size: 11px;
            color: #6c7086;
            margin-top: 4px;
            margin-left: 22px;
          `;
          refEl.appendChild(subtext);

          refSection.appendChild(refEl);
        }
      }
    }

    detail.appendChild(refSection);

    // Validation warnings
    const warnings = this.validateNPC(npc);
    if (warnings.length > 0) {
      const warningSection = document.createElement('div');
      warningSection.style.cssText = `
        padding: 16px;
        background: #f38ba822;
        border: 1px solid #f38ba8;
        border-radius: 8px;
      `;

      const warningTitle = document.createElement('h3');
      warningTitle.textContent = 'Warnings';
      warningTitle.style.cssText = `
        margin: 0 0 8px 0;
        font-size: 14px;
        color: #f38ba8;
      `;
      warningSection.appendChild(warningTitle);

      for (const warning of warnings) {
        const warningEl = document.createElement('div');
        warningEl.textContent = `• ${warning}`;
        warningEl.style.cssText = `
          font-size: 12px;
          color: #f38ba8;
          margin-bottom: 4px;
        `;
        warningSection.appendChild(warningEl);
      }

      detail.appendChild(warningSection);
    }

    this.setCenterContent(detail);
  }

  private createNewNPC(): void {
    const id = generateUUID();
    const npc: NPCEntry = {
      id,
      name: 'New NPC',
      description: '',
    };
    this.addNPC(npc);
    editorStore.selectEntry(id);
    this.onEntrySelect(id);
  }

  protected onEntrySelect(id: string): void {
    this.currentNpcId = id;

    const npc = this.npcs.get(id);
    if (npc) {
      this.setInspectorData({
        id: npc.id,
        name: npc.name,
        portrait: npc.portrait ?? '',
        description: npc.description ?? '',
        defaultDialogue: npc.defaultDialogue ?? '',
        faction: npc.faction ?? '',
      });
      this.renderNPCDetail(npc);
      this.entryList.setSelected(id);
    } else {
      this.clearInspector();
      this.renderCenterPlaceholder();
    }
  }

  protected onFieldChange(key: string, value: unknown): void {
    if (!this.currentNpcId) return;

    const npc = this.npcs.get(this.currentNpcId);
    if (!npc) return;

    (npc as unknown as Record<string, unknown>)[key] = value;
    editorStore.setDirty(true);

    this.updateEntryList();
    this.renderNPCDetail(npc);
  }
}
