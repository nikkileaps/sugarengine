/**
 * EpisodeDialog - Mantine modal for creating new episodes
 */

import { Modal, Stack, TextInput, Button, Group } from '@mantine/core';
import { useState, useEffect } from 'react';

interface EpisodeDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreateEpisode: (name: string) => void;
  defaultName?: string;
}

export function EpisodeDialog({
  opened,
  onClose,
  onCreateEpisode,
  defaultName = 'Episode 1',
}: EpisodeDialogProps) {
  const [episodeName, setEpisodeName] = useState(defaultName);

  // Update name when defaultName changes (e.g., when dialog opens)
  useEffect(() => {
    if (opened) {
      setEpisodeName(defaultName);
    }
  }, [opened, defaultName]);

  const handleCreate = () => {
    if (episodeName.trim()) {
      onCreateEpisode(episodeName.trim());
      onClose();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Episode"
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
          label="Episode Name"
          placeholder="New Beginnings"
          value={episodeName}
          onChange={(e) => setEpisodeName(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          autoFocus
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
          }}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button color="blue" onClick={handleCreate}>
            Create
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
