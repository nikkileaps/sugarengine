/**
 * QuestInspector - Property editor for the selected quest
 */

import { Stack, TextInput, Textarea, Text } from '@mantine/core';
import { QuestEntry } from './QuestPanel';

interface QuestInspectorProps {
  quest: QuestEntry;
  onChange: (updated: QuestEntry) => void;
}

export function QuestInspector({ quest, onChange }: QuestInspectorProps) {
  const handleChange = <K extends keyof QuestEntry>(field: K, value: QuestEntry[K]) => {
    onChange({ ...quest, [field]: value });
  };

  return (
    <Stack gap="md" p="sm">
      <Text size="sm" fw={500} c="dimmed">
        Properties
      </Text>

      <TextInput
        label="Quest ID"
        value={quest.id}
        readOnly
        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
      />

      <TextInput
        label="Quest Name"
        value={quest.name}
        onChange={(e) => handleChange('name', e.currentTarget.value)}
        required
      />

      <Textarea
        label="Description"
        value={quest.description}
        onChange={(e) => handleChange('description', e.currentTarget.value)}
        placeholder="Quest description..."
        minRows={3}
        autosize
      />

      <TextInput
        label="Start Stage"
        value={quest.startStage}
        onChange={(e) => handleChange('startStage', e.currentTarget.value)}
        description="ID of the first stage"
      />
    </Stack>
  );
}
