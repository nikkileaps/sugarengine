/**
 * ItemPanel - React/Mantine item database editor panel
 */

import { useState, ReactNode } from 'react';
import {
  Stack,
  TextInput,
  ScrollArea,
  Text,
  Group,
  Badge,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useEditorStore } from '../../store';
import { ItemDetail } from './ItemDetail';
import { ItemInspector } from './ItemInspector';
import { generateUUID, shortId } from '../../utils';

export interface ItemEntry {
  id: string;
  name: string;
  description: string;
  icon?: string;
  category: 'quest' | 'gift' | 'key' | 'misc';
  stackable: boolean;
  maxStack?: number;
  giftable: boolean;
}

export interface ItemPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface ItemPanelProps {
  items: ItemEntry[];
  onItemsChange: (items: ItemEntry[]) => void;
  quests?: {
    id: string;
    name: string;
    stages: { id: string; description: string; objectives: { type: string; target: string; description: string }[] }[];
    rewards?: { type: string; itemId?: string }[];
  }[];
  children: (result: ItemPanelResult) => ReactNode;
}

const CATEGORY_COLORS: Record<string, string> = {
  quest: '#f38ba8',
  gift: '#f9e2af',
  key: '#89b4fa',
  misc: '#a6adc8',
};

const CATEGORY_ICONS: Record<string, string> = {
  quest: '📜',
  gift: '🎁',
  key: '🔑',
  misc: '📦',
};

export function ItemPanel({ items, onItemsChange, quests = [], children }: ItemPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);

  const selectedItem = selectedId ? items.find((i) => i.id === selectedId) : null;

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    const id = generateUUID();
    const newItem: ItemEntry = {
      id,
      name: 'New Item',
      description: '',
      category: 'misc',
      stackable: true,
      maxStack: 99,
      giftable: false,
    };
    onItemsChange([...items, newItem]);
    setSelectedId(id);
    setDirty(true);
  };

  const handleUpdate = (updated: ItemEntry) => {
    onItemsChange(items.map((i) => (i.id === updated.id ? updated : i)));
    setDirty(true);
  };

  const handleDelete = (id: string) => {
    onItemsChange(items.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  };

  const handleDuplicate = (item: ItemEntry) => {
    const id = generateUUID();
    const newItem: ItemEntry = {
      ...item,
      id,
      name: `${item.name} (Copy)`,
    };
    onItemsChange([...items, newItem]);
    setSelectedId(id);
    setDirty(true);
  };

  const result: ItemPanelResult = {
    // Entry list (left panel)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>Items ({items.length})</Text>
          <Tooltip label="Create Item">
            <ActionIcon variant="subtle" onClick={handleCreate}>+</ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search items..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredItems.map((item) => (
              <Group
                key={item.id}
                p="xs"
                gap="xs"
                style={{
                  background: selectedId === item.id ? 'var(--mantine-color-dark-6)' : undefined,
                  borderRadius: 'var(--mantine-radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedId(item.id)}
              >
                <Text size="lg">{CATEGORY_ICONS[item.category] || '📦'}</Text>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>{item.name}</Text>
                  <Text size="xs" c="dimmed">
                    {item.category} · {shortId(item.id)}
                  </Text>
                </Stack>
                <Badge
                  size="xs"
                  variant="light"
                  style={{
                    background: `${CATEGORY_COLORS[item.category]}22`,
                    color: CATEGORY_COLORS[item.category],
                  }}
                >
                  {item.category}
                </Badge>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Main content (center panel)
    content: selectedItem ? (
      <ItemDetail
        item={selectedItem}
        quests={quests}
        onChange={handleUpdate}
        onDelete={() => handleDelete(selectedItem.id)}
        onDuplicate={() => handleDuplicate(selectedItem)}
      />
    ) : (
      <Stack align="center" justify="center" h="100%" gap="md">
        <Text size="xl">🎒</Text>
        <Text c="dimmed">Select an item to edit</Text>
        <Text size="sm" c="dimmed" ta="center" maw={300}>
          Choose an item from the list on the left, or create a new one with the + button.
        </Text>
      </Stack>
    ),

    // Inspector (right panel)
    inspector: selectedItem ? (
      <ItemInspector item={selectedItem} onChange={handleUpdate} />
    ) : null,
  };

  return <>{children(result)}</>;
}
