/**
 * NPCDetail - Main content view for a selected NPC
 */

import { useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Badge,
  Button,
  Paper,
  TextInput,
  Textarea,
  Select,
  Box,
  ScrollArea,
  Avatar,
} from '@mantine/core';
import { NPCEntry } from './NPCPanel';
import { BehaviorTreeCanvas } from './BehaviorTreeCanvas';

interface NPCDetailProps {
  npc: NPCEntry;
  dialogues: { id: string; name?: string; nodes?: { speaker?: string }[] }[];
  quests: { id: string; name: string; stages: { id: string; description: string; objectives: { id: string; type: string; target: string; description: string }[] }[] }[];
  items?: { id: string; name: string }[];
  onChange: (updated: NPCEntry) => void;
  onDelete: () => void;
}

export function NPCDetail({ npc, dialogues, quests, items = [], onChange, onDelete }: NPCDetailProps) {
  const [showBehaviorTree, setShowBehaviorTree] = useState(false);

  // Find dialogues where this NPC speaks
  const npcDialogues = dialogues.filter((d) =>
    d.nodes?.some((node) => node.speaker === npc.id)
  );

  // Find quests involving this NPC
  const npcQuests = quests.filter((q) =>
    q.stages.some((stage) =>
      stage.objectives.some((obj) => obj.target === npc.id)
    )
  );

  const dialogueOptions = dialogues.map((d) => ({
    value: d.id,
    label: d.name || d.id,
  }));

  const handleChange = (field: keyof NPCEntry, value: string | null) => {
    onChange({ ...npc, [field]: value || undefined });
  };

  // If showing behavior tree editor, render that instead
  if (showBehaviorTree) {
    return (
      <BehaviorTreeCanvas
        tree={npc.behaviorTree}
        onChange={(tree) => onChange({ ...npc, behaviorTree: tree })}
        dialogues={dialogues.map(d => ({ id: d.id, name: d.name || d.id }))}
        items={items}
        quests={quests}
        onClose={() => setShowBehaviorTree(false)}
      />
    );
  }

  // Count nodes in behavior tree
  const countNodes = (tree: typeof npc.behaviorTree): number => {
    if (!tree) return 0;
    let count = 1;
    if (tree.type === 'selector' || tree.type === 'sequence' || tree.type === 'parallel') {
      const controlNode = tree as any;
      for (const child of controlNode.children) {
        count += countNodes(child);
      }
    } else if (tree.type === 'inverter' || tree.type === 'repeater' || tree.type === 'succeeder' || tree.type === 'untilFail') {
      const decoratorNode = tree as any;
      count += countNodes(decoratorNode.child);
    }
    return count;
  };

  const nodeCount = countNodes(npc.behaviorTree);

  return (
    <ScrollArea h="100%" type="auto">
      <Box p="lg" maw={900} mx="auto">
        <Stack gap="lg">
          {/* Header Card */}
          <Paper
            p="lg"
            radius="md"
            style={{
              background: 'linear-gradient(135deg, #1e1e2e 0%, #181825 100%)',
              border: '1px solid #313244',
            }}
          >
            <Group justify="space-between" align="flex-start">
              <Group gap="lg">
                <Avatar
                  size={72}
                  radius="md"
                  src={npc.portrait}
                  style={{
                    background: '#313244',
                    border: '2px solid #45475a',
                  }}
                >
                  {npc.name.charAt(0).toUpperCase()}
                </Avatar>
                <Stack gap={4}>
                  <TextInput
                    value={npc.name}
                    onChange={(e) => handleChange('name', e.currentTarget.value)}
                    variant="unstyled"
                    styles={{
                      input: {
                        fontSize: 24,
                        fontWeight: 600,
                        color: '#cdd6f4',
                        padding: 0,
                        height: 'auto',
                        minHeight: 'auto',
                        '&:focus': {
                          borderBottom: '2px solid #89b4fa',
                        },
                      },
                    }}
                  />
                  <Group gap="xs">
                    {npc.faction && (
                      <Badge variant="light" color="blue" size="sm">
                        {npc.faction}
                      </Badge>
                    )}
                    <Text size="xs" c="dimmed" ff="monospace">
                      {npc.id.slice(0, 8)}
                    </Text>
                  </Group>
                </Stack>
              </Group>
              <Button
                color="red"
                variant="subtle"
                size="xs"
                onClick={onDelete}
              >
                Delete
              </Button>
            </Group>
          </Paper>

          {/* Two column layout for cards */}
          <Group align="flex-start" gap="lg" wrap="nowrap" style={{ alignItems: 'stretch' }}>
            {/* Left Column - Core Details */}
            <Stack gap="lg" style={{ flex: 1, minWidth: 0 }}>
              {/* Identity Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Identity
                </Text>
                <Stack gap="sm">
                  <TextInput
                    label="Faction"
                    value={npc.faction || ''}
                    onChange={(e) => handleChange('faction', e.currentTarget.value)}
                    placeholder="e.g., Merchants Guild"
                    size="sm"
                  />
                  <TextInput
                    label="Portrait"
                    value={npc.portrait || ''}
                    onChange={(e) => handleChange('portrait', e.currentTarget.value)}
                    placeholder="/portraits/npc.png"
                    size="sm"
                  />
                </Stack>
              </Paper>

              {/* Dialogue Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Dialogue
                </Text>
                <Stack gap="sm">
                  <Select
                    label="Default Dialogue"
                    placeholder="Select dialogue..."
                    data={dialogueOptions}
                    value={npc.defaultDialogue || null}
                    onChange={(value) => handleChange('defaultDialogue', value)}
                    searchable
                    clearable
                    size="sm"
                  />
                  <Textarea
                    label="Description"
                    value={npc.description || ''}
                    onChange={(e) => handleChange('description', e.currentTarget.value)}
                    placeholder="Character background, personality, role in the story..."
                    minRows={3}
                    autosize
                    size="sm"
                  />
                </Stack>
              </Paper>

              {/* Behavior Tree Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Behavior Tree
                </Text>
                <Stack gap="sm">
                  <Select
                    label="Behavior Mode"
                    placeholder="Select mode..."
                    data={[
                      { value: 'onInteraction', label: 'On Interaction - runs when player interacts' },
                      { value: 'continuous', label: 'Continuous - runs constantly' },
                    ]}
                    value={npc.behaviorMode || null}
                    onChange={(value) => onChange({ ...npc, behaviorMode: value as 'onInteraction' | 'continuous' | undefined })}
                    size="sm"
                  />

                  {npc.behaviorTree ? (
                    <Stack gap="xs">
                      <Group gap="xs">
                        <Badge size="sm" variant="light" color="green">
                          {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                        </Badge>
                        <Badge size="sm" variant="light" color="blue">
                          {npc.behaviorTree.type}
                        </Badge>
                      </Group>
                      <Group gap="xs">
                        <Button
                          size="sm"
                          variant="light"
                          fullWidth
                          onClick={() => setShowBehaviorTree(true)}
                        >
                          Edit Behavior Tree
                        </Button>
                        <Button
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => onChange({ ...npc, behaviorTree: undefined })}
                        >
                          Remove
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Button
                      size="sm"
                      variant="light"
                      fullWidth
                      onClick={() => setShowBehaviorTree(true)}
                    >
                      Create Behavior Tree
                    </Button>
                  )}
                </Stack>
              </Paper>
            </Stack>

            {/* Right Column - Usage Info */}
            <Stack gap="lg" style={{ width: 280, flexShrink: 0 }}>
              {/* Dialogues Usage */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Group gap="xs" mb="sm">
                  <Text size="sm">💬</Text>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    In Dialogues
                  </Text>
                  <Badge size="xs" variant="light" color="blue">
                    {npcDialogues.length}
                  </Badge>
                </Group>
                {npcDialogues.length > 0 ? (
                  <Stack gap={6}>
                    {npcDialogues.map((d) => (
                      <Paper
                        key={d.id}
                        p="xs"
                        radius="sm"
                        style={{ background: '#1e1e2e' }}
                      >
                        <Text size="sm">{d.name || d.id}</Text>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Text size="xs" c="dimmed" fs="italic">
                    Not referenced in any dialogues
                  </Text>
                )}
              </Paper>

              {/* Quests Usage */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Group gap="xs" mb="sm">
                  <Text size="sm">📜</Text>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    In Quests
                  </Text>
                  <Badge size="xs" variant="light" color="green">
                    {npcQuests.length}
                  </Badge>
                </Group>
                {npcQuests.length > 0 ? (
                  <Stack gap={6}>
                    {npcQuests.map((q) => (
                      <Paper
                        key={q.id}
                        p="xs"
                        radius="sm"
                        style={{ background: '#1e1e2e' }}
                      >
                        <Text size="sm">{q.name}</Text>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Text size="xs" c="dimmed" fs="italic">
                    Not referenced in any quests
                  </Text>
                )}
              </Paper>
            </Stack>
          </Group>
        </Stack>
      </Box>
    </ScrollArea>
  );
}
