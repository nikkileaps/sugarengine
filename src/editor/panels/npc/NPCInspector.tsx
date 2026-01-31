/**
 * NPCInspector - Property editor for the selected NPC
 */

import { Stack, TextInput, Textarea, Text, Select } from '@mantine/core';
import { NPCEntry } from './NPCPanel';

interface NPCInspectorProps {
  npc: NPCEntry;
  dialogues: { id: string; displayName?: string }[];
  onChange: (updated: NPCEntry) => void;
}

export function NPCInspector({ npc, dialogues, onChange }: NPCInspectorProps) {
  const dialogueOptions = dialogues.map((d) => ({
    value: d.id,
    label: d.displayName || d.id,
  }));

  const handleChange = (field: keyof NPCEntry, value: string | null) => {
    onChange({ ...npc, [field]: value || undefined });
  };

  return (
    <Stack gap="md" p="sm">
      <Text size="sm" fw={500} c="dimmed">Properties</Text>

      <TextInput
        label="Name"
        value={npc.name}
        onChange={(e) => handleChange('name', e.currentTarget.value)}
        required
      />

      <TextInput
        label="Faction"
        value={npc.faction || ''}
        onChange={(e) => handleChange('faction', e.currentTarget.value)}
        placeholder="e.g., Merchants Guild"
      />

      <TextInput
        label="Portrait"
        value={npc.portrait || ''}
        onChange={(e) => handleChange('portrait', e.currentTarget.value)}
        placeholder="Path to portrait image"
      />

      <Textarea
        label="Description"
        value={npc.description || ''}
        onChange={(e) => handleChange('description', e.currentTarget.value)}
        placeholder="Character background, personality, etc."
        minRows={3}
        autosize
      />

      <Select
        label="Default Dialogue"
        description="The dialogue that plays when the player first interacts with this NPC"
        placeholder="-- No default dialogue --"
        data={dialogueOptions}
        value={npc.defaultDialogue || null}
        onChange={(value) => handleChange('defaultDialogue', value)}
        searchable
        clearable
      />
    </Stack>
  );
}
