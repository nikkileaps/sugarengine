/**
 * DialogueInspector - Property editor for dialogue nodes
 */

import { Stack, TextInput, Textarea, Text, Select, Button, Group, Badge, Paper } from '@mantine/core';
import { DialogueNode, DialogueNext } from './DialoguePanel';

// Special speaker IDs
const PLAYER_ID = 'e095b3b2-3351-403a-abe1-88861fa489ad';
const PLAYER_VO_ID = 'b4e9d2a1-6f3c-4b8e-a7d1-5c9e2f3a4b5c';
const NARRATOR_ID = '1a44e7dd-fd2c-4862-a489-59692155e406';
const EXCERPT_ID = 'a3f8c1d2-7e4b-4a9f-b6d5-1c2e3f4a5b6d';

interface DialogueInspectorProps {
  node: DialogueNode;
  npcs: { id: string; name: string }[];
  dialogueNodes: DialogueNode[];
  isStartNode: boolean;
  onChange: (node: DialogueNode) => void;
  onDelete: () => void;
}

export function DialogueInspector({
  node,
  npcs,
  dialogueNodes,
  isStartNode,
  onChange,
  onDelete,
}: DialogueInspectorProps) {
  const speakerOptions = [
    { value: PLAYER_ID, label: 'Player' },
    { value: PLAYER_VO_ID, label: 'Player (VO)' },
    { value: NARRATOR_ID, label: 'Narrator' },
    { value: EXCERPT_ID, label: 'Excerpt' },
    ...npcs.map((n) => ({ value: n.id, label: n.name })),
  ];

  const nodeOptions = dialogueNodes
    .filter((n) => n.id !== node.id)
    .map((n) => ({ value: n.id, label: n.name || n.id }));

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
    <Stack gap="md" p="sm">
      <Group justify="space-between">
        <Text size="sm" fw={500} c="dimmed">
          Node Properties
        </Text>
        {isStartNode && (
          <Badge size="xs" color="green">
            Start Node
          </Badge>
        )}
      </Group>

      <TextInput
        label="Node ID"
        value={node.id}
        readOnly
        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
      />

      <TextInput
        label="Name"
        value={node.name || ''}
        onChange={(e) => handleChange('name', e.currentTarget.value || undefined)}
        placeholder="Human-readable name"
      />

      <Select
        label="Speaker"
        data={speakerOptions}
        value={node.speaker || null}
        onChange={(value) => {
          handleChange('speaker', value || undefined);
          // Clear speakerLabel when switching away from Excerpt
          if (value !== EXCERPT_ID && node.speakerLabel) {
            handleChange('speakerLabel', undefined);
          }
        }}
        placeholder="Select speaker"
        searchable
        clearable
      />

      {node.speaker === EXCERPT_ID && (
        <TextInput
          label="Source Title"
          value={node.speakerLabel || ''}
          onChange={(e) => handleChange('speakerLabel', e.currentTarget.value || undefined)}
          placeholder="e.g., Handbook for the Recently Transported"
          description="Displayed as the speaker name for this excerpt"
        />
      )}

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
        description="Optional event triggered when this node is shown"
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
  );
}
