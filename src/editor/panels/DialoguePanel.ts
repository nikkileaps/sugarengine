/**
 * DialoguePanel - Editor for dialogue trees with node canvas
 *
 * Displays dialogue entries in the left panel and a node graph in the center.
 */

import { EntryList, EntryListItem, Inspector, NodeCanvas, CanvasNode, CanvasConnection } from '../components';
import type { FieldDefinition } from '../components';
import { editorStore } from '../store';
import type { DialogueTree, DialogueNode } from '../../engine/dialogue/types';

const NODE_FIELDS: FieldDefinition[] = [
  { key: 'id', label: 'Node ID', type: 'text', required: true },
  { key: 'speaker', label: 'Speaker', type: 'text', placeholder: 'NPC name or "Player"' },
  { key: 'text', label: 'Dialogue Text', type: 'textarea', required: true },
  { key: 'next', label: 'Next Node', type: 'text', placeholder: 'Node ID (if no choices)' },
  { key: 'onEnter', label: 'On Enter Event', type: 'text', placeholder: 'Event to fire' },
];

// Auto-layout constants
const NODE_SPACING_X = 280;
const NODE_SPACING_Y = 150;

export class DialoguePanel {
  private element: HTMLElement;
  private entryList: EntryList;
  private inspector: Inspector;
  private centerPanel: HTMLElement;
  private nodeCanvas: NodeCanvas | null = null;
  private playtestPanel: HTMLElement | null = null;

  private dialogues: Map<string, DialogueTree> = new Map();
  private nodePositions: Map<string, Map<string, { x: number; y: number }>> = new Map();
  private currentDialogueId: string | null = null;
  private currentNodeId: string | null = null;

  // Playtest state
  private isPlaytesting = false;
  private playtestNodeId: string | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'panel dialogue-panel';
    this.element.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    // Entry list (left)
    this.entryList = new EntryList({
      title: 'Dialogues',
      onSelect: (id) => this.onDialogueSelect(id),
      onCreate: () => this.createNewDialogue(),
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
      title: 'Node Properties',
      fields: NODE_FIELDS,
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

  async loadDialogues(_basePath = '/dialogue/'): Promise<void> {
    this.updateEntryList();
  }

  addDialogue(dialogue: DialogueTree): void {
    this.dialogues.set(dialogue.id, dialogue);
    // Auto-layout nodes if no positions saved
    if (!this.nodePositions.has(dialogue.id)) {
      this.autoLayoutNodes(dialogue);
    }
    this.updateEntryList();
    editorStore.setDirty(true);
  }

  getDialogues(): DialogueTree[] {
    return Array.from(this.dialogues.values());
  }

  private updateEntryList(): void {
    const items: EntryListItem[] = Array.from(this.dialogues.values()).map(d => ({
      id: d.id,
      name: d.id,
      subtitle: `${d.nodes.length} nodes`,
      icon: '💬',
    }));
    this.entryList.setItems(items);
  }

  private autoLayoutNodes(dialogue: DialogueTree): void {
    const positions = new Map<string, { x: number; y: number }>();

    // Build adjacency for BFS layout
    const nodeMap = new Map<string, DialogueNode>();
    for (const node of dialogue.nodes) {
      nodeMap.set(node.id, node);
    }

    // BFS from start node
    const visited = new Set<string>();
    const queue: { id: string; depth: number; lane: number }[] = [];
    const depthCounts = new Map<number, number>();

    queue.push({ id: dialogue.startNode, depth: 0, lane: 0 });

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const lane = depthCounts.get(depth) ?? 0;
      depthCounts.set(depth, lane + 1);

      positions.set(id, {
        x: 50 + depth * NODE_SPACING_X,
        y: 50 + lane * NODE_SPACING_Y,
      });

      const node = nodeMap.get(id);
      if (!node) continue;

      // Add children to queue
      if (node.choices) {
        for (const choice of node.choices) {
          if (!visited.has(choice.next)) {
            queue.push({ id: choice.next, depth: depth + 1, lane: 0 });
          }
        }
      } else if (node.next && !visited.has(node.next)) {
        queue.push({ id: node.next, depth: depth + 1, lane: 0 });
      }
    }

    // Add any unvisited nodes at the bottom
    let extraY = (Math.max(...Array.from(depthCounts.values()), 0) + 1) * NODE_SPACING_Y;
    for (const node of dialogue.nodes) {
      if (!positions.has(node.id)) {
        positions.set(node.id, { x: 50, y: extraY });
        extraY += NODE_SPACING_Y;
      }
    }

    this.nodePositions.set(dialogue.id, positions);
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
      <div style="font-size: 48px;">💬</div>
      <div style="font-size: 16px;">Select a dialogue to edit</div>
      <div style="font-size: 13px; max-width: 300px; text-align: center; line-height: 1.5;">
        Choose a dialogue from the list on the left, or create a new one with the + button.
      </div>
    `;
    this.centerPanel.appendChild(placeholder);
  }

  private renderDialogueCanvas(dialogue: DialogueTree): void {
    this.centerPanel.innerHTML = '';

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      padding: 8px 12px;
      background: #181825;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      gap: 12px;
    `;

    // Title
    const title = document.createElement('span');
    title.textContent = dialogue.id;
    title.style.cssText = `
      font-weight: 600;
      color: #cdd6f4;
    `;
    toolbar.appendChild(title);

    // Start node badge
    const startBadge = document.createElement('span');
    startBadge.textContent = `Start: ${dialogue.startNode}`;
    startBadge.style.cssText = `
      padding: 2px 8px;
      background: #313244;
      border-radius: 4px;
      font-size: 11px;
      color: #a6adc8;
    `;
    toolbar.appendChild(startBadge);

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    toolbar.appendChild(spacer);

    // Add node button
    const addNodeBtn = document.createElement('button');
    addNodeBtn.textContent = '+ Add Node';
    addNodeBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #313244;
      border-radius: 4px;
      background: #313244;
      color: #cdd6f4;
      font-size: 12px;
      cursor: pointer;
    `;
    addNodeBtn.onclick = () => this.addNodeToDialogue();
    toolbar.appendChild(addNodeBtn);

    // Fit view button
    const fitBtn = document.createElement('button');
    fitBtn.textContent = 'Fit View';
    fitBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #313244;
      border-radius: 4px;
      background: transparent;
      color: #a6adc8;
      font-size: 12px;
      cursor: pointer;
    `;
    fitBtn.onclick = () => this.nodeCanvas?.fitToContent();
    toolbar.appendChild(fitBtn);

    // Playtest button
    const playtestBtn = document.createElement('button');
    playtestBtn.textContent = '▶ Playtest';
    playtestBtn.style.cssText = `
      padding: 6px 12px;
      border: 1px solid #a6e3a1;
      border-radius: 4px;
      background: #a6e3a122;
      color: #a6e3a1;
      font-size: 12px;
      cursor: pointer;
    `;
    playtestBtn.onclick = () => this.startPlaytest();
    toolbar.appendChild(playtestBtn);

    this.centerPanel.appendChild(toolbar);

    // Canvas container
    const canvasContainer = document.createElement('div');
    canvasContainer.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
    `;

    // Node canvas
    this.nodeCanvas = new NodeCanvas({
      onNodeSelect: (nodeId) => this.selectNode(nodeId),
      onNodeMove: (nodeId, pos) => this.onNodeMove(nodeId, pos),
      onCanvasClick: () => this.deselectNode(),
      renderNode: (node, el) => this.renderNodeContent(dialogue, node, el),
    });
    canvasContainer.appendChild(this.nodeCanvas.getElement());

    this.centerPanel.appendChild(canvasContainer);

    // Convert dialogue nodes to canvas nodes
    this.updateCanvas(dialogue);

    // Fit to content after a short delay to let nodes render
    setTimeout(() => this.nodeCanvas?.fitToContent(), 100);
  }

  private updateCanvas(dialogue: DialogueTree): void {
    if (!this.nodeCanvas) return;

    const positions = this.nodePositions.get(dialogue.id) ?? new Map();

    // Create canvas nodes
    const canvasNodes: CanvasNode[] = dialogue.nodes.map(node => ({
      id: node.id,
      position: positions.get(node.id) ?? { x: 50, y: 50 },
    }));

    // Create connections
    const connections: CanvasConnection[] = [];
    for (const node of dialogue.nodes) {
      if (node.choices) {
        for (let i = 0; i < node.choices.length; i++) {
          const choice = node.choices[i]!;
          connections.push({
            fromId: node.id,
            toId: choice.next,
            fromPort: `choice-${i}`,
            color: this.getChoiceColor(i),
          });
        }
      } else if (node.next) {
        connections.push({
          fromId: node.id,
          toId: node.next,
          color: '#45475a',
        });
      }
    }

    this.nodeCanvas.setNodes(canvasNodes);
    this.nodeCanvas.setConnections(connections);
  }

  private getChoiceColor(index: number): string {
    const colors = ['#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8', '#cba6f7'];
    return colors[index % colors.length] ?? '#89b4fa';
  }

  private renderNodeContent(dialogue: DialogueTree, canvasNode: CanvasNode, element: HTMLElement): void {
    const node = dialogue.nodes.find(n => n.id === canvasNode.id);
    if (!node) {
      element.innerHTML = '<div style="padding: 12px; color: #f38ba8;">Node not found</div>';
      return;
    }

    const isStart = node.id === dialogue.startNode;
    const isPlaytestActive = this.isPlaytesting && node.id === this.playtestNodeId;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 8px 12px;
      background: ${isStart ? '#a6e3a122' : isPlaytestActive ? '#89b4fa22' : '#313244'};
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      gap: 8px;
      border-radius: 6px 6px 0 0;
    `;

    if (isStart) {
      const startIcon = document.createElement('span');
      startIcon.textContent = '▶';
      startIcon.style.cssText = 'color: #a6e3a1; font-size: 10px;';
      header.appendChild(startIcon);
    }

    const idLabel = document.createElement('span');
    idLabel.textContent = node.id;
    idLabel.style.cssText = `
      font-family: monospace;
      font-size: 11px;
      color: ${isStart ? '#a6e3a1' : '#a6adc8'};
    `;
    header.appendChild(idLabel);

    if (node.speaker) {
      const speaker = document.createElement('span');
      speaker.textContent = node.speaker;
      speaker.style.cssText = `
        margin-left: auto;
        font-size: 11px;
        font-weight: 600;
        color: #89b4fa;
      `;
      header.appendChild(speaker);
    }

    element.appendChild(header);

    // Text content
    const textDiv = document.createElement('div');
    textDiv.style.cssText = `
      padding: 10px 12px;
      font-size: 12px;
      color: #cdd6f4;
      line-height: 1.4;
      max-height: 60px;
      overflow: hidden;
    `;
    textDiv.textContent = node.text.length > 80 ? node.text.slice(0, 80) + '...' : node.text;
    element.appendChild(textDiv);

    // Choices or next indicator
    if (node.choices && node.choices.length > 0) {
      const choicesDiv = document.createElement('div');
      choicesDiv.style.cssText = `
        padding: 8px 12px;
        border-top: 1px solid #313244;
        display: flex;
        flex-direction: column;
        gap: 4px;
      `;

      for (let i = 0; i < node.choices.length; i++) {
        const choice = node.choices[i]!;
        const choiceEl = document.createElement('div');
        choiceEl.style.cssText = `
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
        `;

        const dot = document.createElement('span');
        dot.style.cssText = `
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: ${this.getChoiceColor(i)};
        `;
        choiceEl.appendChild(dot);

        const text = document.createElement('span');
        text.textContent = choice.text.length > 25 ? choice.text.slice(0, 25) + '...' : choice.text;
        text.style.color = '#a6adc8';
        choiceEl.appendChild(text);

        const arrow = document.createElement('span');
        arrow.textContent = `→ ${choice.next}`;
        arrow.style.cssText = 'margin-left: auto; color: #6c7086; font-family: monospace;';
        choiceEl.appendChild(arrow);

        choicesDiv.appendChild(choiceEl);
      }

      element.appendChild(choicesDiv);
    } else if (node.next) {
      const nextDiv = document.createElement('div');
      nextDiv.style.cssText = `
        padding: 6px 12px;
        border-top: 1px solid #313244;
        font-size: 11px;
        color: #6c7086;
      `;
      nextDiv.textContent = `→ ${node.next}`;
      element.appendChild(nextDiv);
    } else {
      const endDiv = document.createElement('div');
      endDiv.style.cssText = `
        padding: 6px 12px;
        border-top: 1px solid #313244;
        font-size: 11px;
        color: #f38ba8;
        font-style: italic;
      `;
      endDiv.textContent = '(end of dialogue)';
      element.appendChild(endDiv);
    }
  }

  private selectNode(nodeId: string): void {
    this.currentNodeId = nodeId;

    const dialogue = this.dialogues.get(this.currentDialogueId!);
    if (!dialogue) return;

    const node = dialogue.nodes.find(n => n.id === nodeId);
    if (!node) return;

    this.inspector.setData({
      id: node.id,
      speaker: node.speaker ?? '',
      text: node.text,
      next: node.next ?? '',
      onEnter: node.onEnter ?? '',
    });

    this.nodeCanvas?.setSelectedNode(nodeId);
  }

  private deselectNode(): void {
    this.currentNodeId = null;
    this.inspector.clear();
    this.nodeCanvas?.setSelectedNode(null);
  }

  private onNodeMove(nodeId: string, position: { x: number; y: number }): void {
    if (!this.currentDialogueId) return;

    let positions = this.nodePositions.get(this.currentDialogueId);
    if (!positions) {
      positions = new Map();
      this.nodePositions.set(this.currentDialogueId, positions);
    }

    positions.set(nodeId, position);
    editorStore.setDirty(true);
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
    this.onDialogueSelect(id);
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

    // Position new node to the right of existing nodes
    const positions = this.nodePositions.get(this.currentDialogueId);
    if (positions) {
      let maxX = 0;
      for (const pos of positions.values()) {
        maxX = Math.max(maxX, pos.x);
      }
      positions.set(nodeId, { x: maxX + NODE_SPACING_X, y: 50 });
    }

    editorStore.setDirty(true);
    this.updateEntryList();
    this.updateCanvas(dialogue);
    this.selectNode(nodeId);
  }

  private onDialogueSelect(id: string): void {
    this.currentDialogueId = id;
    this.currentNodeId = null;
    this.isPlaytesting = false;
    this.inspector.clear();

    const dialogue = this.dialogues.get(id);
    if (dialogue) {
      this.renderDialogueCanvas(dialogue);
      this.entryList.setSelected(id);
    } else {
      this.renderCenterPlaceholder();
    }
  }

  private onFieldChange(key: string, value: unknown): void {
    if (!this.currentDialogueId || !this.currentNodeId) return;

    const dialogue = this.dialogues.get(this.currentDialogueId);
    if (!dialogue) return;

    const node = dialogue.nodes.find(n => n.id === this.currentNodeId);
    if (!node) return;

    // Update the node
    (node as unknown as Record<string, unknown>)[key] = value;
    editorStore.setDirty(true);

    // Re-render canvas to reflect changes
    this.updateCanvas(dialogue);
  }

  // === Playtest Mode ===

  private startPlaytest(): void {
    const dialogue = this.dialogues.get(this.currentDialogueId!);
    if (!dialogue) return;

    this.isPlaytesting = true;
    this.playtestNodeId = dialogue.startNode;
    this.renderPlaytestPanel(dialogue);
    this.nodeCanvas?.centerOnNode(dialogue.startNode);
  }

  private stopPlaytest(): void {
    this.isPlaytesting = false;
    this.playtestNodeId = null;
    if (this.playtestPanel) {
      this.playtestPanel.remove();
      this.playtestPanel = null;
    }
    // Re-render to clear playtest highlighting
    const dialogue = this.dialogues.get(this.currentDialogueId!);
    if (dialogue) {
      this.updateCanvas(dialogue);
    }
  }

  private renderPlaytestPanel(dialogue: DialogueTree): void {
    if (this.playtestPanel) {
      this.playtestPanel.remove();
    }

    const node = dialogue.nodes.find(n => n.id === this.playtestNodeId);
    if (!node) {
      this.stopPlaytest();
      return;
    }

    this.playtestPanel = document.createElement('div');
    this.playtestPanel.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      width: 400px;
      max-width: calc(100% - 40px);
      background: #181825;
      border: 2px solid #89b4fa;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      z-index: 100;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px;
      background: #89b4fa22;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;

    const title = document.createElement('span');
    title.textContent = '▶ Playtest Mode';
    title.style.cssText = 'font-weight: 600; color: #89b4fa;';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #a6adc8;
      font-size: 14px;
      cursor: pointer;
    `;
    closeBtn.onclick = () => this.stopPlaytest();
    header.appendChild(closeBtn);

    this.playtestPanel.appendChild(header);

    // Speaker
    if (node.speaker) {
      const speaker = document.createElement('div');
      speaker.textContent = node.speaker;
      speaker.style.cssText = `
        padding: 12px 16px 0;
        font-weight: 600;
        color: #89b4fa;
      `;
      this.playtestPanel.appendChild(speaker);
    }

    // Text
    const text = document.createElement('div');
    text.textContent = node.text;
    text.style.cssText = `
      padding: 12px 16px;
      color: #cdd6f4;
      line-height: 1.5;
    `;
    this.playtestPanel.appendChild(text);

    // Choices or continue
    const actions = document.createElement('div');
    actions.style.cssText = `
      padding: 12px 16px;
      border-top: 1px solid #313244;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    if (node.choices && node.choices.length > 0) {
      for (const choice of node.choices) {
        const btn = document.createElement('button');
        btn.textContent = choice.text;
        btn.style.cssText = `
          padding: 10px 16px;
          border: 1px solid #313244;
          border-radius: 6px;
          background: #313244;
          color: #cdd6f4;
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          transition: background 0.15s;
        `;
        btn.onmouseenter = () => btn.style.background = '#45475a';
        btn.onmouseleave = () => btn.style.background = '#313244';
        btn.onclick = () => this.playtestAdvance(dialogue, choice.next);
        actions.appendChild(btn);
      }
    } else if (node.next) {
      const btn = document.createElement('button');
      btn.textContent = 'Continue →';
      btn.style.cssText = `
        padding: 10px 16px;
        border: 1px solid #89b4fa;
        border-radius: 6px;
        background: #89b4fa22;
        color: #89b4fa;
        font-size: 13px;
        cursor: pointer;
      `;
      btn.onclick = () => this.playtestAdvance(dialogue, node.next!);
      actions.appendChild(btn);
    } else {
      const endMsg = document.createElement('div');
      endMsg.textContent = '(End of dialogue)';
      endMsg.style.cssText = 'color: #6c7086; font-style: italic; text-align: center;';
      actions.appendChild(endMsg);

      const restartBtn = document.createElement('button');
      restartBtn.textContent = 'Restart';
      restartBtn.style.cssText = `
        padding: 8px 16px;
        border: 1px solid #a6e3a1;
        border-radius: 6px;
        background: #a6e3a122;
        color: #a6e3a1;
        font-size: 13px;
        cursor: pointer;
      `;
      restartBtn.onclick = () => this.playtestAdvance(dialogue, dialogue.startNode);
      actions.appendChild(restartBtn);
    }

    this.playtestPanel.appendChild(actions);

    // Add to center panel
    this.centerPanel.style.position = 'relative';
    this.centerPanel.appendChild(this.playtestPanel);

    // Highlight current node
    this.nodeCanvas?.setSelectedNode(this.playtestNodeId);
  }

  private playtestAdvance(dialogue: DialogueTree, nextNodeId: string): void {
    this.playtestNodeId = nextNodeId;
    this.nodeCanvas?.centerOnNode(nextNodeId);
    this.renderPlaytestPanel(dialogue);
  }
}
