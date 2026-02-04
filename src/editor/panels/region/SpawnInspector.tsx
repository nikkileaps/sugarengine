/**
 * SpawnInspector - Properties panel for selected spawn in region
 */

import {
  Stack,
  Text,
  Group,
  NumberInput,
  Select,
  TextInput,
  Button,
  Paper,
  Box,
} from '@mantine/core';
import { Vec3, NPCDefinition, PickupDefinition, InspectableDefinition, ResonancePointDefinition, VFXSpawnDefinition, TriggerDefinition } from './RegionPanel';

type SpawnType = 'npc' | 'pickup' | 'inspectable' | 'resonancePoint' | 'vfx' | 'trigger';

export interface SpawnData {
  id: string;
  type: SpawnType;
  position: Vec3;
  data: NPCDefinition | PickupDefinition | InspectableDefinition | ResonancePointDefinition | VFXSpawnDefinition | TriggerDefinition;
}

interface SpawnInspectorProps {
  spawn: SpawnData;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  inspections: { id: string; displayName?: string }[];
  resonancePointDefs: { id: string; name: string }[];
  vfxDefinitions: { id: string; name: string }[];
  onChange: (spawn: SpawnData) => void;
  onDelete: () => void;
}

const SPAWN_CONFIG: Record<SpawnType, { icon: string; title: string; color: string }> = {
  npc: { icon: '👤', title: 'NPC', color: '#89b4fa' },
  pickup: { icon: '📦', title: 'Item Pickup', color: '#f9e2af' },
  inspectable: { icon: '🔍', title: 'Inspectable', color: '#cba6f7' },
  resonancePoint: { icon: '🦋', title: 'Resonance Point', color: '#94e2d5' },
  vfx: { icon: '✨', title: 'VFX Effect', color: '#fab387' },
  trigger: { icon: '⚡', title: 'Trigger', color: '#f38ba8' },
};

export function SpawnInspector({
  spawn,
  npcs,
  items,
  inspections,
  resonancePointDefs,
  vfxDefinitions,
  onChange,
  onDelete,
}: SpawnInspectorProps) {
  const config = SPAWN_CONFIG[spawn.type];

  const updatePosition = (axis: 'x' | 'y' | 'z', value: number) => {
    onChange({ ...spawn, position: { ...spawn.position, [axis]: value } });
  };

  const updateData = (updates: Partial<typeof spawn.data>) => {
    onChange({ ...spawn, data: { ...spawn.data, ...updates } });
  };

  return (
    <Stack gap="md" p="md">
      {/* Header */}
      <Paper p="md" radius="md" style={{ background: '#181825', border: `1px solid ${config.color}40` }}>
        <Group gap="sm" mb="sm">
          <Box
            style={{
              width: 36,
              height: 36,
              background: `${config.color}22`,
              border: `1px solid ${config.color}`,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
            }}
          >
            {config.icon}
          </Box>
          <Stack gap={0}>
            <Text size="sm" fw={600} style={{ color: config.color }}>
              {config.title}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">
              {spawn.id.slice(0, 8)}
            </Text>
          </Stack>
        </Group>
      </Paper>

      {/* Position */}
      <Paper p="md" radius="md" style={{ background: '#181825', border: '1px solid #313244' }}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="sm">
          Position
        </Text>
        <Stack gap="xs">
          <NumberInput
            label="X"
            value={spawn.position.x}
            onChange={(val) => updatePosition('x', typeof val === 'number' ? val : 0)}
            decimalScale={2}
            step={0.5}
            size="sm"
          />
          <NumberInput
            label="Y"
            value={spawn.position.y}
            onChange={(val) => updatePosition('y', typeof val === 'number' ? val : 0)}
            decimalScale={2}
            step={0.5}
            size="sm"
          />
          <NumberInput
            label="Z"
            value={spawn.position.z}
            onChange={(val) => updatePosition('z', typeof val === 'number' ? val : 0)}
            decimalScale={2}
            step={0.5}
            size="sm"
          />
        </Stack>
      </Paper>

      {/* Type-specific properties */}
      <Paper p="md" radius="md" style={{ background: '#181825', border: '1px solid #313244' }}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="sm">
          Properties
        </Text>

        {spawn.type === 'npc' && (
          <Select
            label="NPC"
            data={npcs.map((n) => ({ value: n.id, label: n.name }))}
            value={(spawn.data as NPCDefinition).id}
            onChange={(val) => updateData({ id: val || '' })}
            searchable
            size="sm"
          />
        )}

        {spawn.type === 'pickup' && (
          <Stack gap="xs">
            <Select
              label="Item"
              data={items.map((i) => ({ value: i.id, label: i.name }))}
              value={(spawn.data as PickupDefinition).itemId}
              onChange={(val) => updateData({ itemId: val || '' })}
              searchable
              size="sm"
            />
            <NumberInput
              label="Quantity"
              value={(spawn.data as PickupDefinition).quantity || 1}
              onChange={(val) => updateData({ quantity: typeof val === 'number' ? val : 1 })}
              min={1}
              size="sm"
            />
          </Stack>
        )}

        {spawn.type === 'inspectable' && (
          <Stack gap="xs">
            <Select
              label="Inspection"
              data={inspections.map((i) => ({ value: i.id, label: i.displayName || i.id }))}
              value={(spawn.data as InspectableDefinition).inspectionId}
              onChange={(val) => updateData({ inspectionId: val || '' })}
              searchable
              size="sm"
            />
            <TextInput
              label="Prompt Text"
              value={(spawn.data as InspectableDefinition).promptText || ''}
              onChange={(e) => updateData({ promptText: e.currentTarget.value || undefined })}
              placeholder="Press E to inspect"
              size="sm"
            />
          </Stack>
        )}

        {spawn.type === 'resonancePoint' && (
          <Stack gap="xs">
            <Select
              label="Resonance Point"
              data={resonancePointDefs.map((r) => ({ value: r.id, label: r.name }))}
              value={(spawn.data as ResonancePointDefinition).resonancePointId}
              onChange={(val) => updateData({ resonancePointId: val || '' })}
              searchable
              size="sm"
            />
            <TextInput
              label="Prompt Text"
              value={(spawn.data as ResonancePointDefinition).promptText || ''}
              onChange={(e) => updateData({ promptText: e.currentTarget.value || undefined })}
              placeholder="Press E to attune"
              size="sm"
            />
          </Stack>
        )}

        {spawn.type === 'vfx' && (
          <Stack gap="xs">
            <Select
              label="VFX Effect"
              data={vfxDefinitions.map((v) => ({ value: v.id, label: v.name }))}
              value={(spawn.data as VFXSpawnDefinition).vfxId}
              onChange={(val) => updateData({ vfxId: val || '' })}
              searchable
              size="sm"
            />
            <NumberInput
              label="Scale"
              description="Size multiplier"
              value={(spawn.data as VFXSpawnDefinition).scale ?? 1}
              onChange={(val) => updateData({ scale: typeof val === 'number' ? val : 1 })}
              min={0.1}
              max={10}
              step={0.1}
              decimalScale={1}
              size="sm"
            />
            <Select
              label="Auto Play"
              description="Start playing on region load"
              data={[
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' },
              ]}
              value={(spawn.data as VFXSpawnDefinition).autoPlay !== false ? 'true' : 'false'}
              onChange={(val) => updateData({ autoPlay: val === 'true' })}
              size="sm"
            />
          </Stack>
        )}

        {spawn.type === 'trigger' && (
          <Stack gap="xs">
            <TextInput
              label="Event Type"
              value={(spawn.data as TriggerDefinition).event.type}
              onChange={(e) => updateData({ event: { ...(spawn.data as TriggerDefinition).event, type: e.currentTarget.value } })}
              size="sm"
            />
            <TextInput
              label="Event Target"
              value={(spawn.data as TriggerDefinition).event.target || ''}
              onChange={(e) => updateData({ event: { ...(spawn.data as TriggerDefinition).event, target: e.currentTarget.value || undefined } })}
              size="sm"
            />
          </Stack>
        )}
      </Paper>

      {/* Delete */}
      <Button
        color="red"
        variant="subtle"
        size="sm"
        onClick={onDelete}
        fullWidth
      >
        Delete Spawn
      </Button>
    </Stack>
  );
}
