/**
 * InspectionInspector - Property editor for the selected inspection
 */

import { Stack, TextInput, Text } from '@mantine/core';
import { InspectionEntry } from './InspectionPanel';

interface InspectionInspectorProps {
  inspection: InspectionEntry;
  onChange: (updated: InspectionEntry) => void;
}

export function InspectionInspector({ inspection, onChange }: InspectionInspectorProps) {
  const handleChange = <K extends keyof InspectionEntry>(field: K, value: InspectionEntry[K]) => {
    onChange({ ...inspection, [field]: value });
  };

  return (
    <Stack gap="md" p="sm">
      <Text size="sm" fw={500} c="dimmed">
        Properties
      </Text>

      <TextInput
        label="ID"
        value={inspection.id}
        readOnly
        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
      />

      <TextInput
        label="Title"
        value={inspection.title}
        onChange={(e) => handleChange('title', e.currentTarget.value)}
        required
      />

      <TextInput
        label="Subtitle"
        value={inspection.subtitle || ''}
        onChange={(e) => handleChange('subtitle', e.currentTarget.value || undefined)}
        placeholder="Document type or description"
      />

      <TextInput
        label="Header Image"
        value={inspection.headerImage || ''}
        onChange={(e) => handleChange('headerImage', e.currentTarget.value || undefined)}
        placeholder="/images/header.png"
      />
    </Stack>
  );
}
