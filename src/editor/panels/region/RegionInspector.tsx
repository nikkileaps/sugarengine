/**
 * RegionInspector - Property editor for the selected region
 */

import { Stack, TextInput, NumberInput, Text, Select } from '@mantine/core';
import { RegionEntry } from './RegionPanel';

interface RegionInspectorProps {
  region: RegionEntry;
  episodes: { id: string; name: string }[];
  onChange: (updated: RegionEntry) => void;
}

export function RegionInspector({ region, episodes, onChange }: RegionInspectorProps) {
  const handleChange = <K extends keyof RegionEntry>(field: K, value: RegionEntry[K]) => {
    onChange({ ...region, [field]: value });
  };

  const episodeOptions = [
    { value: '', label: '(none)' },
    ...episodes.map((e) => ({ value: e.id, label: e.name })),
  ];

  return (
    <Stack gap="md" p="sm">
      <Text size="sm" fw={500} c="dimmed">
        Properties
      </Text>

      <TextInput
        label="ID"
        value={region.id}
        readOnly
        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
      />

      <TextInput
        label="Name"
        value={region.name}
        onChange={(e) => handleChange('name', e.currentTarget.value)}
        required
      />

      <TextInput
        label="Geometry Path"
        value={region.geometry?.path || ''}
        onChange={(e) =>
          handleChange('geometry', { ...region.geometry, path: e.currentTarget.value })
        }
        placeholder="cafe-nollie"
        description="Folder name in public/regions/"
      />

      <Text size="xs" fw={500} c="dimmed" mt="sm">
        Grid Position
      </Text>

      <NumberInput
        label="Grid X"
        value={region.gridPosition?.x ?? 0}
        onChange={(val) =>
          handleChange('gridPosition', {
            x: typeof val === 'number' ? val : 0,
            z: region.gridPosition?.z ?? 0,
          })
        }
      />

      <NumberInput
        label="Grid Z"
        value={region.gridPosition?.z ?? 0}
        onChange={(val) =>
          handleChange('gridPosition', {
            x: region.gridPosition?.x ?? 0,
            z: typeof val === 'number' ? val : 0,
          })
        }
      />

      <Text size="xs" fw={500} c="dimmed" mt="sm">
        Player Spawn
      </Text>

      <NumberInput
        label="X"
        value={region.playerSpawn.x}
        onChange={(val) =>
          handleChange('playerSpawn', {
            ...region.playerSpawn,
            x: typeof val === 'number' ? val : 0,
          })
        }
        decimalScale={1}
      />

      <NumberInput
        label="Y"
        value={region.playerSpawn.y}
        onChange={(val) =>
          handleChange('playerSpawn', {
            ...region.playerSpawn,
            y: typeof val === 'number' ? val : 0,
          })
        }
        decimalScale={1}
      />

      <NumberInput
        label="Z"
        value={region.playerSpawn.z}
        onChange={(val) =>
          handleChange('playerSpawn', {
            ...region.playerSpawn,
            z: typeof val === 'number' ? val : 0,
          })
        }
        decimalScale={1}
      />

      <Text size="xs" fw={500} c="dimmed" mt="sm">
        Availability
      </Text>

      <Select
        label="Available From Episode"
        data={episodeOptions}
        value={region.availability?.fromEpisode || ''}
        onChange={(val) =>
          handleChange('availability', {
            ...region.availability,
            fromEpisode: val || undefined,
          })
        }
        clearable
      />

      <Select
        label="Available Until Episode"
        data={episodeOptions}
        value={region.availability?.untilEpisode || ''}
        onChange={(val) =>
          handleChange('availability', {
            ...region.availability,
            untilEpisode: val || undefined,
          })
        }
        clearable
      />
    </Stack>
  );
}
