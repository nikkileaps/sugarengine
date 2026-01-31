/**
 * DialoguePanel - React/Mantine dialogue tree editor with node canvas
 *
 * Note: The node canvas uses the existing vanilla NodeCanvas component
 * for pragmatism - it's complex and works well already.
 */

import { useState, ReactNode } from 'react';
import {
  Stack,
  TextInput,
  ScrollArea,
  Text,
  Group,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useEditorStore } from '../../store';
import { DialogueNodeCanvas } from './DialogueNodeCanvas';
import { generateUUID, shortId } from '../../utils';

export interface DialogueNext {
  nodeId: string;
  text?: string;
  condition?: string;
}

export interface DialogueNode {
  id: string;
  displayName?: string;
  speaker?: string;
  text: string;
  next?: DialogueNext[];
  onEnter?: string;
}

export interface DialogueEntry {
  id: string;
  displayName?: string;
  startNode: string;
  nodes: DialogueNode[];
}

export interface DialoguePanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface DialoguePanelProps {
  dialogues: DialogueEntry[];
  onDialoguesChange: (dialogues: DialogueEntry[]) => void;
  npcs?: { id: string; name: string }[];
  children: (result: DialoguePanelResult) => ReactNode;
}

export function DialoguePanel({
  dialogues,
  onDialoguesChange,
  npcs = [],
  children,
}: DialoguePanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);

  const selectedDialogue = selectedId ? dialogues.find((d) => d.id === selectedId) : null;

  const filteredDialogues = dialogues.filter(
    (dialogue) =>
      (dialogue.displayName || dialogue.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
      dialogue.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    const id = generateUUID();
    const startNodeId = generateUUID();
    const newDialogue: DialogueEntry = {
      id,
      displayName: 'New Dialogue',
      startNode: startNodeId,
      nodes: [
        {
          id: startNodeId,
          displayName: 'Start',
          text: 'Hello!',
          speaker: npcs[0]?.id,
        },
      ],
    };
    onDialoguesChange([...dialogues, newDialogue]);
    setSelectedId(id);
    setSelectedNodeId(startNodeId);
    setDirty(true);
  };

  // Use a stable update function that always reads fresh data
  const handleUpdate = (updated: DialogueEntry) => {
    onDialoguesChange(dialogues.map((d) => (d.id === updated.id ? updated : d)));
    setDirty(true);
  };

  const handleDelete = (id: string) => {
    onDialoguesChange(dialogues.filter((d) => d.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedNodeId(null);
    }
    setDirty(true);
  };

  const handleNodeSelect = (nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  };

  const handleNodeChange = (node: DialogueNode) => {
    const dialogue = dialogues.find((d) => d.id === selectedId);
    if (!dialogue) return;
    const updatedNodes = dialogue.nodes.map((n) =>
      n.id === node.id ? node : n
    );
    handleUpdate({ ...dialogue, nodes: updatedNodes });
  };

  const handleAddNode = () => {
    const dialogue = dialogues.find((d) => d.id === selectedId);
    if (!dialogue) return;
    const newId = generateUUID();
    const newNode: DialogueNode = {
      id: newId,
      displayName: `Node ${dialogue.nodes.length + 1}`,
      text: 'New dialogue...',
    };
    const updatedDialogue = {
      ...dialogue,
      nodes: [...dialogue.nodes, newNode],
    };
    onDialoguesChange(dialogues.map((d) => (d.id === dialogue.id ? updatedDialogue : d)));
    setSelectedNodeId(newId);
    setDirty(true);
  };

  const handleDeleteNode = (nodeId: string) => {
    const dialogue = dialogues.find((d) => d.id === selectedId);
    if (!dialogue) return;
    if (dialogue.nodes.length <= 1) {
      alert('Cannot delete the last node');
      return;
    }
    if (nodeId === dialogue.startNode) {
      alert('Cannot delete the start node');
      return;
    }

    const updatedNodes = dialogue.nodes.filter((n) => n.id !== nodeId);
    // Remove references to the deleted node
    for (const node of updatedNodes) {
      if (node.next) {
        node.next = node.next.filter((n) => n.nodeId !== nodeId);
      }
    }
    handleUpdate({ ...dialogue, nodes: updatedNodes });
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
  };

  const result: DialoguePanelResult = {
    // Entry list (left panel)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Dialogues ({dialogues.length})
          </Text>
          <Tooltip label="Create Dialogue">
            <ActionIcon variant="subtle" onClick={handleCreate}>
              +
            </ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search dialogues..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredDialogues.map((dialogue) => (
              <Group
                key={dialogue.id}
                p="xs"
                gap="xs"
                style={{
                  background:
                    selectedId === dialogue.id ? 'var(--mantine-color-dark-6)' : undefined,
                  borderRadius: 'var(--mantine-radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setSelectedId(dialogue.id);
                  setSelectedNodeId(null);
                }}
              >
                <Text size="lg">💬</Text>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {dialogue.displayName || dialogue.id}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {dialogue.nodes.length} nodes · {shortId(dialogue.id)}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Main content (center panel)
    content: selectedDialogue ? (
      <DialogueNodeCanvas
        dialogue={selectedDialogue}
        selectedNodeId={selectedNodeId}
        npcs={npcs}
        onNodeSelect={handleNodeSelect}
        onDialogueChange={handleUpdate}
        onNodeChange={handleNodeChange}
        onAddNode={handleAddNode}
        onDeleteNode={handleDeleteNode}
        onDeleteDialogue={() => handleDelete(selectedDialogue.id)}
      />
    ) : (
      <Stack align="center" justify="center" h="100%" gap="md">
        <Text size="xl">💬</Text>
        <Text c="dimmed">Select a dialogue to edit</Text>
        <Text size="sm" c="dimmed" ta="center" maw={300}>
          Choose a dialogue from the list on the left, or create a new one with the + button.
        </Text>
      </Stack>
    ),

    // Inspector (right panel) - properties now in main content
    inspector: null,
  };

  return <>{children(result)}</>;
}
