/**
 * @file OpenGameDialog.tsx
 * @description Modal for opening an existing game by selecting its project.sgrgame file.
 */

import { Modal, Stack, Text, TextInput, Group, Button } from '@mantine/core';

interface OpenGameDialogProps {
  opened: boolean;
  onClose: () => void;
  path: string;
  error: string | null;
  busy?: boolean;
  browseBusy?: boolean;
  onPathChange: (value: string) => void;
  onBrowsePath: () => void;
  onSubmit: () => void;
}

export function OpenGameDialog({
  opened,
  onClose,
  path,
  error,
  busy = false,
  browseBusy = false,
  onPathChange,
  onBrowsePath,
  onSubmit,
}: OpenGameDialogProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Open Game"
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
        <Group align="flex-end" grow>
          <TextInput
            label="Game File"
            placeholder="Choose project.sgrgame..."
            value={path}
            onChange={(e) => onPathChange(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            autoFocus
            styles={{
              input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
              label: { color: '#a6adc8' },
            }}
          />
          <Button
            variant="light"
            color="blue"
            onClick={onBrowsePath}
            loading={browseBusy}
            disabled={busy}
            styles={{ root: { minWidth: 96 } }}
          >
            Browse...
          </Button>
        </Group>
        {error ? <Text size="sm" c="red.4">{error}</Text> : null}
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button color="blue" onClick={onSubmit} loading={busy}>
            Open Game
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
