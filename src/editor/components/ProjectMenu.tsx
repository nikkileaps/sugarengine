/**
 * ProjectMenu - Dropdown menu for project operations (like a File menu)
 */

import { Menu, Button } from '@mantine/core';

interface ProjectMenuProps {
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  projectLoaded: boolean;
}

export function ProjectMenu({
  onNewProject,
  onOpenProject,
  onSaveProject,
  projectLoaded,
}: ProjectMenuProps) {
  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <Button
          variant="subtle"
          leftSection={<span>📁</span>}
          styles={{
            root: {
              background: '#89b4fa22',
              color: '#89b4fa',
              '&:hover': { background: '#89b4fa44' },
            },
          }}
        >
          Project
        </Button>
      </Menu.Target>

      <Menu.Dropdown
        styles={{
          dropdown: {
            background: '#1e1e2e',
            border: '1px solid #313244',
          },
        }}
      >
        <Menu.Item
          leftSection={<span>+</span>}
          onClick={onNewProject}
        >
          New Project
        </Menu.Item>
        <Menu.Item
          leftSection={<span>📂</span>}
          onClick={onOpenProject}
        >
          Open Project...
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<span>💾</span>}
          onClick={onSaveProject}
          disabled={!projectLoaded}
        >
          Save Project
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
