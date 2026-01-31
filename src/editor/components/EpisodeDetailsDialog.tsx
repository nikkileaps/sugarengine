/**
 * EpisodeDetailsDialog - Dialog for editing current episode details
 */

import { Modal, Stack, Button, Group, TextInput, Select } from '@mantine/core';

interface Region {
  id: string;
  name: string;
}

interface Quest {
  id: string;
  name: string;
}

interface Episode {
  id: string;
  seasonId: string;
  name: string;
  order: number;
  startRegion?: string;
  completionCondition?: {
    type: 'quest';
    questId: string;
  };
}

interface EpisodeDetailsDialogProps {
  opened: boolean;
  onClose: () => void;
  episode: Episode | null;
  regions: Region[];
  quests: Quest[];
  onUpdate: (field: string, value: unknown) => void;
  onDelete: () => void;
}

export function EpisodeDetailsDialog({
  opened,
  onClose,
  episode,
  regions,
  quests,
  onUpdate,
  onDelete,
}: EpisodeDetailsDialogProps) {
  if (!episode) return null;

  const handleDelete = () => {
    if (confirm('Delete this episode?')) {
      onDelete();
      onClose();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Episode Details"
      centered
      styles={{
        header: { background: '#1e1e2e', borderBottom: '1px solid #313244' },
        title: { color: '#cdd6f4', fontWeight: 600 },
        body: { background: '#1e1e2e', padding: '20px' },
        content: { background: '#1e1e2e' },
        close: { color: '#6c7086', '&:hover': { background: '#313244' } },
      }}
    >
      <Stack gap="md">
        <TextInput
          label="Name"
          value={episode.name}
          onChange={(e) => onUpdate('name', e.currentTarget.value)}
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
          }}
        />

        <TextInput
          label="Order"
          type="number"
          value={episode.order}
          onChange={(e) => onUpdate('order', parseInt(e.currentTarget.value) || 1)}
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
          }}
        />

        <Select
          label="Start Region"
          placeholder="(none)"
          data={[
            { value: '', label: '(none)' },
            ...regions.map((r) => ({ value: r.id, label: r.name })),
          ]}
          value={episode.startRegion || ''}
          onChange={(value) => onUpdate('startRegion', value || '')}
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
          }}
        />

        <Select
          label="Main Quest"
          description="Auto-starts when episode begins. Completing this quest completes the episode."
          placeholder="(none)"
          data={[
            { value: '', label: '(none)' },
            ...quests.map((q) => ({ value: q.id, label: q.name })),
          ]}
          value={episode.completionCondition?.questId || ''}
          onChange={(value) => {
            if (value) {
              onUpdate('completionCondition', { type: 'quest', questId: value });
            } else {
              onUpdate('completionCondition', undefined);
            }
          }}
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
            description: { color: '#6c7086' },
          }}
        />

        <Group justify="space-between" mt="xl">
          <Button
            variant="subtle"
            color="red"
            onClick={handleDelete}
          >
            Delete Episode
          </Button>
          <Button onClick={onClose}>
            Done
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
