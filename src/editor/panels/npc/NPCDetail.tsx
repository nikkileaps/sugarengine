/**
 * NPCDetail - Main content view for a selected NPC
 */

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

interface NPCDetailProps {
  npc: NPCEntry;
  dialogues: { id: string; name?: string; nodes?: { speaker?: string }[] }[];
  quests: { id: string; name: string; stages: { id: string; description: string; objectives: { type: string; target: string; description: string }[] }[] }[];
  onChange: (updated: NPCEntry) => void;
  onDelete: () => void;
}

export function NPCDetail({ npc, dialogues, quests, onChange, onDelete }: NPCDetailProps) {
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
