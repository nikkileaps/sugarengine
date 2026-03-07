/**
 * @file NewGameDialog.tsx
 * @description Modal for scaffolding a new game root on disk.
 */

import { Modal, Stack, Text, TextInput, Group, Button } from '@mantine/core';

interface NewGameDialogProps {
  opened: boolean;
  onClose: () => void;
  name: string;
  slug: string;
  rootPath: string;
  error: string | null;
  busy?: boolean;
  browseBusy?: boolean;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onRootPathChange: (value: string) => void;
  onBrowseRootPath: () => void;
  onSubmit: () => void;
}

export function NewGameDialog({
  opened,
  onClose,
  name,
  slug,
  rootPath,
  error,
  busy = false,
  browseBusy = false,
  onNameChange,
  onSlugChange,
  onRootPathChange,
  onBrowseRootPath,
  onSubmit,
}: NewGameDialogProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="New Game"
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
          label="Game Name"
          placeholder="My Game"
          value={name}
          onChange={(e) => onNameChange(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          autoFocus
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
          }}
        />
        <TextInput
          label="Slug"
          placeholder="my-game"
          value={slug}
          onChange={(e) => onSlugChange(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
          }}
        />
        <Group align="flex-end" grow>
          <TextInput
            label="Game Root Directory"
            placeholder="Choose a directory..."
            value={rootPath}
            onChange={(e) => onRootPathChange(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
            styles={{
              input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
              label: { color: '#a6adc8' },
            }}
          />
          <Button
            variant="light"
            color="blue"
            onClick={onBrowseRootPath}
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
          <Button color="green" onClick={onSubmit} loading={busy}>
            Create Game
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
