/**
 * DialoguePanel - Editor for dialogue trees
 *
 * Displays dialogue entries in the left panel and a node graph in the center.
 */

import { BasePanel } from './BasePanel';
import { editorStore } from '../store';
import type { FieldDefinition } from '../components';
import type { DialogueTree, DialogueNode } from '../../engine/dialogue/types';

const DIALOGUE_FIELDS: FieldDefinition[] = [
  { key: 'id', label: 'ID', type: 'text', required: true },
  { key: 'speaker', label: 'Speaker', type: 'text', placeholder: 'NPC name or "Player"' },
  { key: 'text', label: 'Text', type: 'textarea', required: true },
  { key: 'next', label: 'Next Node', type: 'text', placeholder: 'Node ID (if no choices)' },
  { key: 'onEnter', label: 'On Enter Event', type: 'text', placeholder: 'Event to fire' },
];

export class DialoguePanel extends BasePanel {
  private dialogues: Map<string, DialogueTree> = new Map();
  private currentDialogueId: string | null = null;
  private currentNodeId: string | null = null;

  constructor() {
    super({
      title: 'Dialogues',
      inspectorTitle: 'Node Properties',
      inspectorFields: DIALOGUE_FIELDS,
      onCreate: () => this.createNewDialogue(),
    });

    this.renderCenterPlaceholder();
  }

  async loadDialogues(_basePath = '/dialogue/'): Promise<void> {
    // In a real implementation, this would load from a file list
    // For now, we'll provide a method to add dialogues
    this.updateEntryList();
  }

  addDialogue(dialogue: DialogueTree): void {
    this.dialogues.set(dialogue.id, dialogue);
    this.updateEntryList();
    editorStore.setDirty(true);
  }

  getDialogues(): DialogueTree[] {
    return Array.from(this.dialogues.values());
  }

  private updateEntryList(): void {
    const items = Array.from(this.dialogues.values()).map(d => ({
      id: d.id,
      name: d.id,
      subtitle: `${d.nodes.length} nodes`,
      icon: '💬',
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
      <div style="font-size: 48px;">💬</div>
      <div style="font-size: 16px;">Select a dialogue to edit</div>
      <div style="font-size: 13px; max-width: 300px; text-align: center; line-height: 1.5;">
        Choose a dialogue from the list on the left, or create a new one with the + button.
      </div>
    `;
    this.setCenterContent(placeholder);
  }

  private renderDialogueCanvas(dialogue: DialogueTree): void {
    const canvas = document.createElement('div');
    canvas.style.cssText = `
      flex: 1;
      overflow: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    `;

    // Header with dialogue info
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid #313244;
    `;

    const title = document.createElement('h2');
    title.textContent = dialogue.id;
    title.style.cssText = `
      margin: 0;
      font-size: 18px;
      color: #cdd6f4;
    `;
    header.appendChild(title);

    const startBadge = document.createElement('span');
    startBadge.textContent = `Start: ${dialogue.startNode}`;
    startBadge.style.cssText = `
      padding: 4px 8px;
      background: #313244;
      border-radius: 4px;
      font-size: 12px;
      color: #a6adc8;
    `;
    header.appendChild(startBadge);

    canvas.appendChild(header);

    // Node list (placeholder for real node graph)
    const nodeList = document.createElement('div');
    nodeList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    for (const node of dialogue.nodes) {
      const nodeEl = this.createNodeElement(node);
      nodeEl.onclick = () => this.selectNode(node);
      nodeList.appendChild(nodeEl);
    }

    canvas.appendChild(nodeList);

    // Add node button
    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Node';
    addBtn.style.cssText = `
      padding: 12px;
      border: 2px dashed #313244;
      border-radius: 8px;
      background: transparent;
      color: #6c7086;
      font-size: 13px;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    `;
    addBtn.onmouseenter = () => {
      addBtn.style.borderColor = '#45475a';
      addBtn.style.color = '#cdd6f4';
    };
    addBtn.onmouseleave = () => {
      addBtn.style.borderColor = '#313244';
      addBtn.style.color = '#6c7086';
    };
    addBtn.onclick = () => this.addNodeToDialogue();
    canvas.appendChild(addBtn);

    this.setCenterContent(canvas);
  }

  private createNodeElement(node: DialogueNode): HTMLElement {
    const el = document.createElement('div');
    const isSelected = node.id === this.currentNodeId;
    el.style.cssText = `
      padding: 12px 16px;
      background: ${isSelected ? '#313244' : '#181825'};
      border: 1px solid ${isSelected ? '#89b4fa' : '#313244'};
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
    `;

    el.onmouseenter = () => {
      if (!isSelected) el.style.background = '#1e1e2e';
    };
    el.onmouseleave = () => {
      if (!isSelected) el.style.background = '#181825';
    };

    // Node header
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    `;

    const idBadge = document.createElement('span');
    idBadge.textContent = node.id;
    idBadge.style.cssText = `
      padding: 2px 6px;
      background: #45475a;
      border-radius: 4px;
      font-size: 11px;
      font-family: monospace;
      color: #cdd6f4;
    `;
    header.appendChild(idBadge);

    if (node.speaker) {
      const speaker = document.createElement('span');
      speaker.textContent = node.speaker;
      speaker.style.cssText = `
        font-size: 12px;
        font-weight: 600;
        color: #89b4fa;
      `;
      header.appendChild(speaker);
    }

    el.appendChild(header);

    // Node text
    const text = document.createElement('div');
    text.textContent = node.text.length > 100 ? node.text.slice(0, 100) + '...' : node.text;
    text.style.cssText = `
      font-size: 13px;
      color: #a6adc8;
      line-height: 1.4;
    `;
    el.appendChild(text);

    // Choices or next
    if (node.choices && node.choices.length > 0) {
      const choicesInfo = document.createElement('div');
      choicesInfo.textContent = `${node.choices.length} choice${node.choices.length !== 1 ? 's' : ''}`;
      choicesInfo.style.cssText = `
        margin-top: 8px;
        font-size: 11px;
        color: #f9e2af;
      `;
      el.appendChild(choicesInfo);
    } else if (node.next) {
      const nextInfo = document.createElement('div');
      nextInfo.textContent = `→ ${node.next}`;
      nextInfo.style.cssText = `
        margin-top: 8px;
        font-size: 11px;
        color: #a6e3a1;
      `;
      el.appendChild(nextInfo);
    }

    return el;
  }

  private selectNode(node: DialogueNode): void {
    this.currentNodeId = node.id;
    this.setInspectorData({
      id: node.id,
      speaker: node.speaker ?? '',
      text: node.text,
      next: node.next ?? '',
      onEnter: node.onEnter ?? '',
    });
    // Re-render to show selection
    const dialogue = this.dialogues.get(this.currentDialogueId!);
    if (dialogue) {
      this.renderDialogueCanvas(dialogue);
    }
  }

  private createNewDialogue(): void {
    const id = `dialogue-${Date.now()}`;
    const dialogue: DialogueTree = {
      id,
      startNode: 'start',
      nodes: [
        {
          id: 'start',
          speaker: 'NPC',
          text: 'Hello! This is a new dialogue.',
        },
      ],
    };
    this.addDialogue(dialogue);
    editorStore.selectEntry(id);
    this.onEntrySelect(id);
  }

  private addNodeToDialogue(): void {
    if (!this.currentDialogueId) return;

    const dialogue = this.dialogues.get(this.currentDialogueId);
    if (!dialogue) return;

    const nodeId = `node-${Date.now()}`;
    const newNode: DialogueNode = {
      id: nodeId,
      speaker: 'NPC',
      text: 'New dialogue text...',
    };

    dialogue.nodes.push(newNode);
    editorStore.setDirty(true);
    this.updateEntryList();
    this.renderDialogueCanvas(dialogue);
    this.selectNode(newNode);
  }

  protected onEntrySelect(id: string): void {
    this.currentDialogueId = id;
    this.currentNodeId = null;
    this.clearInspector();

    const dialogue = this.dialogues.get(id);
    if (dialogue) {
      this.renderDialogueCanvas(dialogue);
      this.entryList.setSelected(id);
    } else {
      this.renderCenterPlaceholder();
    }
  }

  protected onFieldChange(key: string, value: unknown): void {
    if (!this.currentDialogueId || !this.currentNodeId) return;

    const dialogue = this.dialogues.get(this.currentDialogueId);
    if (!dialogue) return;

    const node = dialogue.nodes.find(n => n.id === this.currentNodeId);
    if (!node) return;

    // Update the node
    (node as unknown as Record<string, unknown>)[key] = value;
    editorStore.setDirty(true);

    // Re-render
    this.updateEntryList();
    this.renderDialogueCanvas(dialogue);
  }
}
