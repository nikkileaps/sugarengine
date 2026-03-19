/**
 * ProjectMenu - Dropdown menu for game operations (like a File menu)
 */

import { Menu, Button } from '@mantine/core';

interface ProjectMenuProps {
  onNewGame: () => void;
  onOpenGame: () => void;
  onSaveGame: () => void;
  onExportJson: () => void;
  onManagePlugins: () => void;
  projectLoaded: boolean;
}

export function ProjectMenu({
  onNewGame,
  onOpenGame,
  onSaveGame,
  onExportJson,
  onManagePlugins,
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
          Game
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
          onClick={onNewGame}
        >
          New Game
        </Menu.Item>
        <Menu.Item
          leftSection={<span>📂</span>}
          onClick={onOpenGame}
        >
          Open Game...
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<span>💾</span>}
          onClick={onSaveGame}
          disabled={!projectLoaded}
        >
          Save Game
        </Menu.Item>
        <Menu.Item
          leftSection={<span>🚀</span>}
          onClick={onExportJson}
          disabled={!projectLoaded}
        >
          Publish
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<span>🧩</span>}
          onClick={onManagePlugins}
          disabled={!projectLoaded}
        >
          Plugins
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
