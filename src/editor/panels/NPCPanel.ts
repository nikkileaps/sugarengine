/**
 * NPCPanel - Editor for NPC database
 */

import { BasePanel } from './BasePanel';
import { editorStore } from '../store';
import type { FieldDefinition } from '../components';

interface NPCEntry {
  id: string;
  name: string;
  portrait?: string;
  description?: string;
  defaultDialogue?: string;
  faction?: string;
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
    editorStore.setDirty(true);
  }

  getNPCs(): NPCEntry[] {
    return Array.from(this.npcs.values());
  }

  private updateEntryList(): void {
    const items = Array.from(this.npcs.values()).map(n => ({
      id: n.id,
      name: n.name,
      subtitle: n.faction ?? 'No faction',
      icon: '👤',
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

    // Portrait placeholder
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
    `;
    portrait.textContent = '👤';
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

    const id = document.createElement('div');
    id.textContent = npc.id;
    id.style.cssText = `
      font-family: monospace;
      font-size: 12px;
      color: #6c7086;
      margin-bottom: 12px;
    `;
    info.appendChild(id);

    if (npc.faction) {
      const faction = document.createElement('div');
      faction.innerHTML = `<strong>Faction:</strong> ${npc.faction}`;
      faction.style.cssText = `
        font-size: 13px;
        color: #a6adc8;
        margin-bottom: 8px;
      `;
      info.appendChild(faction);
    }

    if (npc.defaultDialogue) {
      const dialogue = document.createElement('div');
      dialogue.innerHTML = `<strong>Default Dialogue:</strong> ${npc.defaultDialogue}`;
      dialogue.style.cssText = `
        font-size: 13px;
        color: #a6adc8;
      `;
      info.appendChild(dialogue);
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
      `;
      descSection.appendChild(descText);

      detail.appendChild(descSection);
    }

    // References section (placeholder)
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

    const refPlaceholder = document.createElement('div');
    refPlaceholder.textContent = 'Dialogues and quests referencing this NPC will appear here.';
    refPlaceholder.style.cssText = `
      font-size: 12px;
      color: #6c7086;
      font-style: italic;
    `;
    refSection.appendChild(refPlaceholder);

    detail.appendChild(refSection);

    this.setCenterContent(detail);
  }

  private createNewNPC(): void {
    const id = `npc-${Date.now()}`;
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
