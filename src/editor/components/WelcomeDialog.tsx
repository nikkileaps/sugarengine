/**
 * WelcomeDialog - Startup dialog shown when app first loads
 */

import { Modal, Stack, Text, Button, Group } from '@mantine/core';

interface WelcomeDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreateGame: () => void;
  onOpenGame: () => void;
}

export function WelcomeDialog({
  opened,
  onClose: _onClose,
  onCreateGame,
  onOpenGame,
}: WelcomeDialogProps) {
  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      title="Game Manager"
      size="md"
      centered
      styles={{
        header: {
          background: '#1e1e2e',
          borderBottom: '1px solid #313244',
        },
        title: {
          color: '#cdd6f4',
          fontWeight: 600,
        },
        body: {
          background: '#1e1e2e',
          padding: '32px',
        },
        content: {
          background: '#1e1e2e',
        },
        close: {
          color: '#6c7086',
          '&:hover': { background: '#313244' },
        },
      }}
    >
      <Stack align="center" gap="lg">
        <Text size="48px">🍬</Text>
        <Stack gap={4} align="center">
          <Text size="xl" fw={500} c="white">
            Welcome to Sugar Engine
          </Text>
          <Text size="sm" c="dimmed">
            Create a new game root or open an existing game to get started.
          </Text>
        </Stack>

        <Group gap="md" mt="md">
          <Button
            variant="light"
            color="green"
            size="lg"
            leftSection={<span>+</span>}
            onClick={onCreateGame}
          >
            New Game
          </Button>
          <Button
            variant="light"
            color="blue"
            size="lg"
            leftSection={<span>📂</span>}
            onClick={onOpenGame}
          >
            Open Game
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
