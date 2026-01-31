/**
 * WelcomeDialog - Startup dialog shown when app first loads
 */

import { Modal, Stack, Text, Button, Group, TextInput } from '@mantine/core';
import { useState } from 'react';

interface WelcomeDialogProps {
  opened: boolean;
  onClose: () => void;
  onCreateProject: (name: string) => void;
  onOpenProject: () => void;
}

export function WelcomeDialog({
  opened,
  onClose,
  onCreateProject,
  onOpenProject,
}: WelcomeDialogProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [projectName, setProjectName] = useState('My Game');

  const handleCreate = () => {
    if (projectName.trim()) {
      onCreateProject(projectName.trim());
      setShowCreate(false);
      setProjectName('My Game');
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => {}}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      title="Project Manager"
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
      {!showCreate ? (
        <Stack align="center" gap="lg">
          <Text size="48px">🍬</Text>
          <Stack gap={4} align="center">
            <Text size="xl" fw={500} c="white">
              Welcome to Sugar Engine
            </Text>
            <Text size="sm" c="dimmed">
              Create a new project or open an existing one to get started.
            </Text>
          </Stack>

          <Group gap="md" mt="md">
            <Button
              variant="light"
              color="green"
              size="lg"
              leftSection={<span>+</span>}
              onClick={() => setShowCreate(true)}
            >
              New Project
            </Button>
            <Button
              variant="light"
              color="blue"
              size="lg"
              leftSection={<span>📂</span>}
              onClick={onOpenProject}
            >
              Open Project
            </Button>
          </Group>
        </Stack>
      ) : (
        <Stack gap="md">
          <Text size="lg" fw={500} c="white">
            Create New Project
          </Text>

          <TextInput
            label="Project Name"
            placeholder="My Game"
            value={projectName}
            onChange={(e) => setProjectName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
            styles={{
              input: {
                background: '#181825',
                border: '1px solid #313244',
                color: '#cdd6f4',
              },
              label: { color: '#a6adc8' },
            }}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="subtle" color="gray" onClick={() => setShowCreate(false)}>
              Back
            </Button>
            <Button color="green" onClick={handleCreate}>
              Create Project
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
