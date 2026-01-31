/**
 * ItemInspector - Property editor for the selected item
 */

import { Stack, TextInput, Textarea, Text, Select, Switch, NumberInput } from '@mantine/core';
import { ItemEntry } from './ItemPanel';

interface ItemInspectorProps {
  item: ItemEntry;
  onChange: (updated: ItemEntry) => void;
}

const CATEGORY_OPTIONS = [
  { value: 'quest', label: 'Quest Item' },
  { value: 'gift', label: 'Gift' },
  { value: 'key', label: 'Key Item' },
  { value: 'misc', label: 'Miscellaneous' },
];

export function ItemInspector({ item, onChange }: ItemInspectorProps) {
  const handleChange = <K extends keyof ItemEntry>(field: K, value: ItemEntry[K]) => {
    onChange({ ...item, [field]: value });
  };

  return (
    <Stack gap="md" p="sm">
      <Text size="sm" fw={500} c="dimmed">Properties</Text>

      <TextInput
        label="ID"
        value={item.id}
        readOnly
        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
      />

      <TextInput
        label="Name"
        value={item.name}
        onChange={(e) => handleChange('name', e.currentTarget.value)}
        required
      />

      <Textarea
        label="Description"
        value={item.description}
        onChange={(e) => handleChange('description', e.currentTarget.value)}
        placeholder="Item description..."
        minRows={3}
        autosize
      />

      <TextInput
        label="Icon Path"
        value={item.icon || ''}
        onChange={(e) => handleChange('icon', e.currentTarget.value || undefined)}
        placeholder="/icons/item.png"
      />

      <Select
        label="Category"
        data={CATEGORY_OPTIONS}
        value={item.category}
        onChange={(value) => handleChange('category', (value as ItemEntry['category']) || 'misc')}
        required
      />

      <Switch
        label="Stackable"
        checked={item.stackable}
        onChange={(e) => handleChange('stackable', e.currentTarget.checked)}
      />

      {item.stackable && (
        <NumberInput
          label="Max Stack"
          value={item.maxStack ?? 99}
          onChange={(value) => handleChange('maxStack', typeof value === 'number' ? value : 99)}
          min={1}
          max={9999}
        />
      )}

      <Switch
        label="Giftable"
        checked={item.giftable}
        onChange={(e) => handleChange('giftable', e.currentTarget.checked)}
        description="Can this item be given as a gift to NPCs?"
      />
    </Stack>
  );
}
