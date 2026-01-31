/**
 * DialogueNodeCanvas - React wrapper for the vanilla NodeCanvas
 * Renders the dialogue tree visualization with node editing
 */

import { useEffect, useRef, useState } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  Badge,
  Text,
  Textarea,
  Select,
  Paper,
  ScrollArea,
} from '@mantine/core';
import { NodeCanvas, CanvasNode, CanvasConnection } from '../../components';
import { DialogueEntry, DialogueNode, DialogueNext } from './DialoguePanel';

// Auto-layout constants
const NODE_SPACING_X = 280;
const NODE_SPACING_Y = 150;

// Special speaker IDs
const PLAYER_ID = 'e095b3b2-3351-403a-abe1-88861fa489ad';
const NARRATOR_ID = '1a44e7dd-fd2c-4862-a489-59692155e406';

interface DialogueNodeCanvasProps {
  dialogue: DialogueEntry;
  selectedNodeId: string | null;
  npcs: { id: string; name: string }[];
  onNodeSelect: (nodeId: string | null) => void;
  onDialogueChange: (dialogue: DialogueEntry) => void;
  onNodeChange: (node: DialogueNode) => void;
  onAddNode: () => void;
  onDeleteNode: (nodeId: string) => void;
  onDeleteDialogue: () => void;
}

export function DialogueNodeCanvas({
  dialogue,
  selectedNodeId,
  npcs,
  onNodeSelect,
  onDialogueChange,
  onNodeChange,
  onAddNode,
  onDeleteNode,
  onDeleteDialogue,
}: DialogueNodeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<NodeCanvas | null>(null);
  const currentDialogueIdRef = useRef<string | null>(null);
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const dialogueRef = useRef<DialogueEntry>(dialogue);
  const selectedNodeIdRef = useRef<string | null>(selectedNodeId);

  const [displayName, setDisplayName] = useState(dialogue.displayName || '');
  const [isPlaytesting, setIsPlaytesting] = useState(false);
  const [playtestNodeId, setPlaytestNodeId] = useState<string | null>(null);
  const playtestNodeIdRef = useRef<string | null>(null);

  // Keep refs current
  dialogueRef.current = dialogue;
  selectedNodeIdRef.current = selectedNodeId;
  playtestNodeIdRef.current = playtestNodeId;

  // Get speaker display name
  const getSpeakerName = (speakerId: string | undefined): string => {
    if (!speakerId) return '';
    if (speakerId === PLAYER_ID) return 'Player';
    if (speakerId === NARRATOR_ID) return 'Narrator';
    const npc = npcs.find((n) => n.id === speakerId);
    return npc?.name || speakerId;
  };

  // Auto-layout nodes
  const autoLayoutNodes = (nodes: DialogueNode[], startNode: string): Map<string, { x: number; y: number }> => {
    const positions = new Map<string, { x: number; y: number }>();
    const nodeMap = new Map<string, DialogueNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [];
    const depthCounts = new Map<number, number>();

    queue.push({ id: startNode, depth: 0 });

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

      if (node.next) {
        for (const nextItem of node.next) {
          if (nextItem.nodeId && !visited.has(nextItem.nodeId)) {
            queue.push({ id: nextItem.nodeId, depth: depth + 1 });
          }
        }
      }
    }

    // Add unvisited nodes
    let extraY = (Math.max(...Array.from(depthCounts.values()), 0) + 1) * NODE_SPACING_Y;
    for (const node of nodes) {
      if (!positions.has(node.id)) {
        positions.set(node.id, { x: 50, y: extraY });
        extraY += NODE_SPACING_Y;
      }
    }

    return positions;
  };

  // Update the canvas with current dialogue data (without recreating)
  const updateCanvas = () => {
    if (!canvasRef.current) return;

    // Use ref to always get current dialogue data
    const currentDialogue = dialogueRef.current;

    // Ensure all nodes have positions
    for (const node of currentDialogue.nodes) {
      if (!nodePositionsRef.current.has(node.id)) {
        // Find max Y of existing nodes
        let maxY = 0;
        for (const pos of nodePositionsRef.current.values()) {
          maxY = Math.max(maxY, pos.y);
        }
        nodePositionsRef.current.set(node.id, { x: 50, y: maxY + NODE_SPACING_Y });
      }
    }

    // Create canvas nodes
    const canvasNodes: CanvasNode[] = currentDialogue.nodes.map((node) => ({
      id: node.id,
      position: nodePositionsRef.current.get(node.id) || { x: 50, y: 50 },
    }));

    // Create connections
    const connections: CanvasConnection[] = [];
    for (const node of currentDialogue.nodes) {
      if (node.next && node.next.length > 0) {
        const isChoice = node.next.length > 1;
        for (let i = 0; i < node.next.length; i++) {
          const nextItem = node.next[i]!;
          if (!nextItem.nodeId) continue;
          connections.push({
            fromId: node.id,
            toId: nextItem.nodeId,
            fromPort: isChoice ? `choice-${i}` : undefined,
            color: isChoice ? getChoiceColor(i) : '#45475a',
          });
        }
      }
    }

    canvasRef.current.setNodes(canvasNodes);
    canvasRef.current.setConnections(connections);
  };

  // Create canvas once on mount or when dialogue changes
  useEffect(() => {
    if (!containerRef.current) return;

    const currentDialogue = dialogueRef.current;

    // Only recreate canvas if dialogue ID changed
    if (canvasRef.current && currentDialogueIdRef.current === currentDialogue.id) {
      // Just update existing canvas
      updateCanvas();
      return;
    }

    // Clear existing canvas
    containerRef.current.innerHTML = '';
    currentDialogueIdRef.current = currentDialogue.id;

    // Initialize positions for this dialogue
    nodePositionsRef.current = autoLayoutNodes(currentDialogue.nodes, currentDialogue.startNode);

    const canvas = new NodeCanvas({
      onNodeSelect: (nodeId) => onNodeSelect(nodeId),
      onNodeMove: (nodeId, pos) => {
        nodePositionsRef.current.set(nodeId, pos);
      },
      onCanvasClick: () => onNodeSelect(null),
      onConnect: (fromId, toId) => {
        const currentDialogue = dialogueRef.current;
        const updatedNodes = currentDialogue.nodes.map((node) => {
          if (node.id === fromId) {
            const next = node.next || [];
            if (!next.some((n) => n.nodeId === toId)) {
              return { ...node, next: [...next, { nodeId: toId }] };
            }
          }
          return node;
        });
        onDialogueChange({ ...currentDialogue, nodes: updatedNodes });
      },
      renderNode: (canvasNode, element) => {
        // Use ref to always get current dialogue data
        const currentDialogue = dialogueRef.current;
        const node = currentDialogue.nodes.find((n) => n.id === canvasNode.id);
        if (!node) {
          element.innerHTML = '<div style="padding: 12px; color: #f38ba8;">Node not found</div>';
          return;
        }

        const isStart = node.id === currentDialogue.startNode;
        const isSelected = node.id === selectedNodeIdRef.current;
        const isPlaytestActive = node.id === playtestNodeIdRef.current;

        // Determine border color based on state
        let borderColor = '#313244';
        if (isPlaytestActive) borderColor = '#f9e2af';
        else if (isSelected) borderColor = '#89b4fa';
        else if (isStart) borderColor = '#a6e3a1';

        // Don't use cssText - it overwrites position/left/top set by NodeCanvas
        element.style.minWidth = '200px';
        element.style.maxWidth = '280px';
        element.style.background = '#181825';
        element.style.border = `2px solid ${borderColor}`;
        element.style.borderRadius = '8px';
        element.style.overflow = 'hidden';
        if (isPlaytestActive) {
          element.style.boxShadow = '0 0 20px #f9e2af44';
        }

        const header = document.createElement('div');
        header.style.cssText = `
          padding: 8px 12px;
          background: ${isPlaytestActive ? '#f9e2af22' : isStart ? '#a6e3a122' : '#313244'};
          border-bottom: 1px solid #313244;
          display: flex;
          align-items: center;
          gap: 8px;
        `;

        if (isStart) {
          const icon = document.createElement('span');
          icon.textContent = '▶';
          icon.style.cssText = 'color: #a6e3a1; font-size: 10px;';
          header.appendChild(icon);
        }

        const name = document.createElement('span');
        name.textContent = node.displayName || node.id;
        name.style.cssText = `font-size: 12px; color: ${isStart ? '#a6e3a1' : '#cdd6f4'}; flex: 1;`;
        header.appendChild(name);

        if (node.speaker) {
          const speaker = document.createElement('span');
          speaker.textContent = getSpeakerName(node.speaker);
          speaker.style.cssText = `
            font-size: 10px;
            padding: 2px 6px;
            background: #89b4fa22;
            color: #89b4fa;
            border-radius: 3px;
          `;
          header.appendChild(speaker);
        }

        element.appendChild(header);

        const content = document.createElement('div');
        content.style.cssText = 'padding: 12px; font-size: 12px; color: #a6adc8; line-height: 1.4;';
        content.textContent = node.text.length > 100 ? node.text.slice(0, 100) + '...' : node.text;
        element.appendChild(content);

        if (node.next && node.next.length > 0) {
          const footer = document.createElement('div');
          footer.style.cssText = 'padding: 8px 12px; border-top: 1px solid #313244; background: #1e1e2e;';

          if (node.next.length > 1) {
            for (let i = 0; i < node.next.length; i++) {
              const choice = document.createElement('div');
              choice.style.cssText = `
                font-size: 11px;
                padding: 4px 8px;
                margin: 2px 0;
                background: ${getChoiceColor(i)}22;
                color: ${getChoiceColor(i)};
                border-radius: 4px;
              `;
              choice.textContent = node.next[i]!.text || `Choice ${i + 1}`;
              footer.appendChild(choice);
            }
          } else {
            const nextNodeId = node.next[0]!.nodeId;
            const nextNode = currentDialogue.nodes.find((n) => n.id === nextNodeId);
            const nextLabel = document.createElement('div');
            nextLabel.style.cssText = 'font-size: 10px; color: #6c7086;';
            nextLabel.textContent = `→ ${nextNode?.displayName || nextNodeId}`;
            footer.appendChild(nextLabel);
          }

          element.appendChild(footer);
        }
      },
    });

    containerRef.current.appendChild(canvas.getElement());
    canvasRef.current = canvas;

    // Set initial nodes
    updateCanvas();

    setTimeout(() => canvas.fitToContent(), 100);
  }, [dialogue.id]); // Only recreate when dialogue ID changes

  // Update canvas when nodes change (without recreating)
  useEffect(() => {
    updateCanvas();
  }, [dialogue.nodes, dialogue.startNode]);

  // Update selection highlighting
  useEffect(() => {
    if (canvasRef.current) {
      canvasRef.current.setSelectedNode(selectedNodeId);
    }
  }, [selectedNodeId]);

  // Update canvas when playtest node changes (to update highlighting)
  useEffect(() => {
    updateCanvas();
  }, [playtestNodeId]);

  // Update display name when dialogue changes
  useEffect(() => {
    setDisplayName(dialogue.displayName || '');
  }, [dialogue.displayName]);

  const handleDisplayNameBlur = () => {
    const currentDialogue = dialogueRef.current;
    if (displayName !== currentDialogue.displayName) {
      onDialogueChange({ ...currentDialogue, displayName: displayName || undefined });
    }
  };

  const selectedNode = selectedNodeId ? dialogue.nodes.find((n) => n.id === selectedNodeId) : null;
  const isStartNode = selectedNode?.id === dialogue.startNode;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>
      {/* Toolbar */}
      <Group
        p="xs"
        style={{ background: '#181825', borderBottom: '1px solid #313244', flexShrink: 0 }}
        justify="space-between"
      >
        <Group gap="sm">
          <TextInput
            value={displayName}
            onChange={(e) => setDisplayName(e.currentTarget.value)}
            onBlur={handleDisplayNameBlur}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder={dialogue.id}
            size="xs"
            styles={{
              input: {
                fontWeight: 600,
                background: 'transparent',
                border: '1px solid transparent',
              },
            }}
          />
          <Badge size="sm" variant="light">
            Start: {dialogue.startNode}
          </Badge>
        </Group>

        <Group gap="xs">
          <Button
            size="xs"
            variant="subtle"
            color="green"
            onClick={() => {
              setIsPlaytesting(true);
              setPlaytestNodeId(dialogue.startNode);
              canvasRef.current?.centerOnNode(dialogue.startNode);
            }}
          >
            ▶ Playtest
          </Button>
          <Button size="xs" variant="subtle" onClick={onAddNode}>
            + Add Node
          </Button>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => canvasRef.current?.fitToContent()}
          >
            Fit View
          </Button>
          <Button size="xs" variant="subtle" color="red" onClick={onDeleteDialogue}>
            Delete
          </Button>
        </Group>
      </Group>

      {/* Canvas and Node Editor */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {/* Canvas - fills the entire area */}
        <div
          ref={containerRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
          }}
        />

        {/* Node Editor Panel - overlaid on right */}
        {selectedNode && !isPlaytesting && (
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 320, zIndex: 10 }}>
            <NodeEditorPanel
              node={selectedNode}
              npcs={npcs}
              dialogueNodes={dialogue.nodes}
              isStartNode={isStartNode}
              onChange={onNodeChange}
              onDelete={() => onDeleteNode(selectedNode.id)}
              onClose={() => onNodeSelect(null)}
            />
          </div>
        )}

        {/* Playtest Panel - overlaid at bottom center */}
        {isPlaytesting && playtestNodeId && (
          <PlaytestPanel
            dialogue={dialogue}
            currentNodeId={playtestNodeId}
            getSpeakerName={getSpeakerName}
            onAdvance={(nextNodeId) => {
              setPlaytestNodeId(nextNodeId);
              canvasRef.current?.centerOnNode(nextNodeId);
              canvasRef.current?.setSelectedNode(nextNodeId);
            }}
            onClose={() => {
              setIsPlaytesting(false);
              setPlaytestNodeId(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface NodeEditorPanelProps {
  node: DialogueNode;
  npcs: { id: string; name: string }[];
  dialogueNodes: DialogueNode[];
  isStartNode: boolean;
  onChange: (node: DialogueNode) => void;
  onDelete: () => void;
  onClose: () => void;
}

function NodeEditorPanel({
  node,
  npcs,
  dialogueNodes,
  isStartNode,
  onChange,
  onDelete,
  onClose,
}: NodeEditorPanelProps) {
  const speakerOptions = [
    { value: PLAYER_ID, label: 'Player' },
    { value: NARRATOR_ID, label: 'Narrator' },
    ...npcs.map((n) => ({ value: n.id, label: n.name })),
  ];

  const nodeOptions = dialogueNodes
    .filter((n) => n.id !== node.id)
    .map((n) => ({ value: n.id, label: n.displayName || n.id }));

  const handleChange = <K extends keyof DialogueNode>(field: K, value: DialogueNode[K]) => {
    onChange({ ...node, [field]: value });
  };

  const handleNextChange = (index: number, updates: Partial<DialogueNext>) => {
    const next = [...(node.next || [])];
    next[index] = { ...next[index]!, ...updates };
    onChange({ ...node, next });
  };

  const handleAddNext = () => {
    const next = [...(node.next || []), { nodeId: '' }];
    onChange({ ...node, next });
  };

  const handleRemoveNext = (index: number) => {
    const next = (node.next || []).filter((_, i) => i !== index);
    onChange({ ...node, next: next.length > 0 ? next : undefined });
  };

  return (
    <Stack
      gap={0}
      style={{
        width: 320,
        minWidth: 280,
        borderLeft: '1px solid #313244',
        background: '#1e1e2e',
      }}
      h="100%"
    >
      <Group
        p="xs"
        justify="space-between"
        style={{ borderBottom: '1px solid #313244', background: '#181825' }}
      >
        <Group gap="xs">
          <Text size="sm" fw={500}>Node Properties</Text>
          {isStartNode && (
            <Badge size="xs" color="green">Start</Badge>
          )}
        </Group>
        <Button size="xs" variant="subtle" onClick={onClose}>
          ✕
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap="md" p="sm">
          <TextInput
            label="Display Name"
            value={node.displayName || ''}
            onChange={(e) => handleChange('displayName', e.currentTarget.value || undefined)}
            placeholder="Human-readable name"
          />

          <Select
            label="Speaker"
            data={speakerOptions}
            value={node.speaker || null}
            onChange={(value) => handleChange('speaker', value || undefined)}
            placeholder="Select speaker"
            searchable
            clearable
          />

          <Textarea
            label="Dialogue Text"
            value={node.text}
            onChange={(e) => handleChange('text', e.currentTarget.value)}
            placeholder="What does the speaker say?"
            minRows={3}
            autosize
            required
          />

          <TextInput
            label="On Enter Event"
            value={node.onEnter || ''}
            onChange={(e) => handleChange('onEnter', e.currentTarget.value || undefined)}
            placeholder="Event to fire when entering"
            description="Optional event triggered when shown"
          />

          {/* Next connections / Choices */}
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={500}>
                Next {(node.next?.length || 0) > 1 ? '(Choices)' : ''}
              </Text>
              <Button size="xs" variant="subtle" onClick={handleAddNext}>
                + Add
              </Button>
            </Group>

            {node.next?.map((nextItem, i) => (
              <Paper key={i} p="xs" withBorder style={{ background: '#181825' }}>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                      {(node.next?.length || 0) > 1 ? `Choice ${i + 1}` : 'Next Node'}
                    </Text>
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      onClick={() => handleRemoveNext(i)}
                      styles={{ root: { padding: '2px 6px' } }}
                    >
                      ✕
                    </Button>
                  </Group>

                  <Select
                    size="xs"
                    placeholder="Select target node"
                    data={nodeOptions}
                    value={nextItem.nodeId || null}
                    onChange={(value) => handleNextChange(i, { nodeId: value || '' })}
                    searchable
                  />

                  {(node.next?.length || 0) > 1 && (
                    <TextInput
                      size="xs"
                      placeholder="Choice text..."
                      value={nextItem.text || ''}
                      onChange={(e) => handleNextChange(i, { text: e.currentTarget.value || undefined })}
                    />
                  )}
                </Stack>
              </Paper>
            ))}

            {(!node.next || node.next.length === 0) && (
              <Text size="xs" c="dimmed" fs="italic">
                No connections - this is an end node
              </Text>
            )}
          </Stack>

          {/* Delete button */}
          {!isStartNode && (
            <Button color="red" variant="subtle" onClick={onDelete} fullWidth mt="md">
              Delete Node
            </Button>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}

interface PlaytestPanelProps {
  dialogue: DialogueEntry;
  currentNodeId: string;
  getSpeakerName: (speakerId: string | undefined) => string;
  onAdvance: (nextNodeId: string) => void;
  onClose: () => void;
}

function PlaytestPanel({
  dialogue,
  currentNodeId,
  getSpeakerName,
  onAdvance,
  onClose,
}: PlaytestPanelProps) {
  const node = dialogue.nodes.find((n) => n.id === currentNodeId);

  if (!node) {
    return null;
  }

  const hasChoices = node.next && node.next.length > 1;
  const hasNext = node.next && node.next.length === 1 && node.next[0]?.nodeId;
  const isEnd = !node.next || node.next.length === 0 || (node.next.length === 1 && !node.next[0]?.nodeId);

  return (
    <Paper
      shadow="xl"
      style={{
        position: 'absolute',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 450,
        maxWidth: 'calc(100% - 40px)',
        border: '2px solid #89b4fa',
        background: '#181825',
        zIndex: 100,
      }}
    >
      {/* Header */}
      <Group
        p="sm"
        justify="space-between"
        style={{ background: '#89b4fa22', borderBottom: '1px solid #313244' }}
      >
        <Text size="sm" fw={600} c="#89b4fa">
          ▶ Playtest Mode
        </Text>
        <Button size="xs" variant="subtle" onClick={onClose}>
          ✕
        </Button>
      </Group>

      {/* Speaker */}
      {node.speaker && (
        <Text size="sm" fw={600} c="#89b4fa" px="md" pt="md">
          {getSpeakerName(node.speaker)}
        </Text>
      )}

      {/* Dialogue text */}
      <Text size="sm" px="md" py="md" style={{ lineHeight: 1.6 }}>
        {node.text}
      </Text>

      {/* Actions */}
      <Stack gap="xs" p="md" style={{ borderTop: '1px solid #313244' }}>
        {hasChoices &&
          node.next!.map((nextItem, i) => (
            <Button
              key={i}
              variant="default"
              fullWidth
              justify="flex-start"
              onClick={() => nextItem.nodeId && onAdvance(nextItem.nodeId)}
              disabled={!nextItem.nodeId}
            >
              {nextItem.text || `Choice ${i + 1}`}
            </Button>
          ))}

        {hasNext && (
          <Button
            variant="light"
            color="blue"
            fullWidth
            onClick={() => onAdvance(node.next![0]!.nodeId)}
          >
            Continue →
          </Button>
        )}

        {isEnd && (
          <>
            <Text size="sm" c="dimmed" fs="italic" ta="center">
              (End of dialogue)
            </Text>
            <Button
              variant="light"
              color="green"
              fullWidth
              onClick={() => onAdvance(dialogue.startNode)}
            >
              Restart
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}

function getChoiceColor(index: number): string {
  const colors = ['#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8', '#cba6f7'];
  return colors[index % colors.length] ?? '#89b4fa';
}
