/**
 * RegionDetail - Entity spawn editor for a region
 */

import { useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Button,
  Paper,
  Badge,
  ScrollArea,
  Modal,
  TextInput,
  NumberInput,
  Select,
  ActionIcon,
  Box,
  Collapse,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { EnvironmentAnimationsDialog } from '../../components/EnvironmentAnimationsDialog';
import {
  RegionEntry,
  Vec3,
  NPCDefinition,
  PickupDefinition,
  InspectableDefinition,
  TriggerDefinition,
} from './RegionPanel';
import { generateUUID, shortId } from '../../utils';

type SpawnType = 'npc' | 'pickup' | 'inspectable' | 'trigger';

interface SpawnEntry {
  id: string;
  type: SpawnType;
  position: Vec3;
  data: NPCDefinition | PickupDefinition | InspectableDefinition | TriggerDefinition;
}

interface RegionDetailProps {
  region: RegionEntry;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  inspections: { id: string; displayName?: string }[];
  episodes: { id: string; name: string }[];
  selectedSpawnId: string | null;
  onSelectSpawn: (id: string | null) => void;
  onChange: (region: RegionEntry) => void;
  onDelete: () => void;
}

const SPAWN_CONFIG: Record<SpawnType, { icon: string; title: string; color: string }> = {
  npc: { icon: '👤', title: 'NPCs', color: '#89b4fa' },
  pickup: { icon: '📦', title: 'Items', color: '#f9e2af' },
  inspectable: { icon: '🔍', title: 'Inspectables', color: '#cba6f7' },
  trigger: { icon: '⚡', title: 'Triggers', color: '#f38ba8' },
};

export function RegionDetail({
  region,
  npcs,
  items,
  inspections,
  episodes,
  selectedSpawnId,
  onSelectSpawn,
  onChange,
  onDelete,
}: RegionDetailProps) {
  const [addSpawnModalOpen, setAddSpawnModalOpen] = useState(false);
  const [settingsOpen, { toggle: toggleSettings }] = useDisclosure(false);
  const [animationsModalOpen, setAnimationsModalOpen] = useState(false);


  const handleChange = <K extends keyof RegionEntry>(field: K, value: RegionEntry[K]) => {
    onChange({ ...region, [field]: value });
  };

  const episodeOptions = [
    { value: '', label: '(none)' },
    ...episodes.map((e) => ({ value: e.id, label: e.name })),
  ];

  const getSpawns = (): SpawnEntry[] => {
    const spawns: SpawnEntry[] = [];

    for (const npc of region.npcs || []) {
      spawns.push({ id: npc.id, type: 'npc', position: npc.position, data: npc });
    }
    for (const pickup of region.pickups || []) {
      spawns.push({ id: pickup.id, type: 'pickup', position: pickup.position, data: pickup });
    }
    for (const inspectable of region.inspectables || []) {
      spawns.push({ id: inspectable.id, type: 'inspectable', position: inspectable.position, data: inspectable });
    }
    for (const trigger of region.triggers || []) {
      const center: Vec3 = {
        x: (trigger.bounds.min[0] + trigger.bounds.max[0]) / 2,
        y: (trigger.bounds.min[1] + trigger.bounds.max[1]) / 2,
        z: (trigger.bounds.min[2] + trigger.bounds.max[2]) / 2,
      };
      spawns.push({ id: trigger.id, type: 'trigger', position: center, data: trigger });
    }

    return spawns;
  };

  const getSpawnName = (spawn: SpawnEntry): string => {
    switch (spawn.type) {
      case 'npc': {
        const npcData = spawn.data as NPCDefinition;
        const npc = npcs.find((n) => n.id === npcData.id);
        return npc?.name || `NPC ${shortId(npcData.id)}`;
      }
      case 'pickup': {
        const pickupData = spawn.data as PickupDefinition;
        const item = items.find((i) => i.id === pickupData.itemId);
        return item?.name || `Item ${shortId(pickupData.itemId)}`;
      }
      case 'inspectable': {
        const inspData = spawn.data as InspectableDefinition;
        const insp = inspections.find((i) => i.id === inspData.inspectionId);
        return insp?.displayName || `Inspection ${shortId(inspData.inspectionId)}`;
      }
      case 'trigger': {
        const triggerData = spawn.data as TriggerDefinition;
        return `Trigger: ${triggerData.event.type}`;
      }
    }
  };

  const handleAddSpawn = (type: SpawnType) => {
    const id = generateUUID();
    const defaultPos: Vec3 = { x: 0, y: 0, z: 0 };
    let updated = { ...region };

    switch (type) {
      case 'npc':
        updated = { ...region, npcs: [...(region.npcs || []), { id: npcs[0]?.id || id, position: defaultPos }] };
        break;
      case 'pickup':
        updated = { ...region, pickups: [...(region.pickups || []), { id, itemId: items[0]?.id || '', position: defaultPos, quantity: 1 }] };
        break;
      case 'inspectable':
        updated = { ...region, inspectables: [...(region.inspectables || []), { id, inspectionId: inspections[0]?.id || '', position: defaultPos }] };
        break;
      case 'trigger':
        updated = { ...region, triggers: [...(region.triggers || []), { id, type: 'box' as const, bounds: { min: [-1, 0, -1] as [number, number, number], max: [1, 2, 1] as [number, number, number] }, event: { type: 'custom' } }] };
        break;
    }

    onChange(updated);
    setAddSpawnModalOpen(false);
    onSelectSpawn(id);
  };

  const handleDeleteSpawn = (spawn: SpawnEntry) => {
    let updated = { ...region };
    switch (spawn.type) {
      case 'npc': updated = { ...region, npcs: (region.npcs || []).filter((n) => n.id !== spawn.id) }; break;
      case 'pickup': updated = { ...region, pickups: (region.pickups || []).filter((p) => p.id !== spawn.id) }; break;
      case 'inspectable': updated = { ...region, inspectables: (region.inspectables || []).filter((i) => i.id !== spawn.id) }; break;
      case 'trigger': updated = { ...region, triggers: (region.triggers || []).filter((t) => t.id !== spawn.id) }; break;
    }
    onChange(updated);
    if (selectedSpawnId === spawn.id) onSelectSpawn(null);
  };

  const spawns = getSpawns();
  const spawnsByType = new Map<SpawnType, SpawnEntry[]>();
  for (const spawn of spawns) {
    if (!spawnsByType.has(spawn.type)) spawnsByType.set(spawn.type, []);
    spawnsByType.get(spawn.type)!.push(spawn);
  }

  return (
    <Stack gap={0} h="100%">
      {/* Header */}
      <Paper
        p="lg"
        radius={0}
        style={{
          background: 'linear-gradient(135deg, #1e1e2e 0%, #181825 100%)',
          borderBottom: '1px solid #313244',
        }}
      >
        <Group justify="space-between" align="flex-start">
          <Group gap="lg">
            <Box
              style={{
                width: 56,
                height: 56,
                background: '#313244',
                border: '2px solid #a6e3a1',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
              }}
            >
              🗺️
            </Box>
            <Stack gap={4}>
              <TextInput
                value={region.name}
                onChange={(e) => handleChange('name', e.currentTarget.value)}
                variant="unstyled"
                styles={{
                  input: {
                    fontSize: 24,
                    fontWeight: 600,
                    color: '#cdd6f4',
                    padding: 0,
                    height: 'auto',
                    minHeight: 'auto',
                  },
                }}
              />
              <Group gap="xs">
                <Badge size="sm" variant="light" color="green">
                  {spawns.length} spawns
                </Badge>
                {region.geometry?.path && (
                  <Badge size="sm" variant="light" color="gray">
                    {region.geometry.path}
                  </Badge>
                )}
                <Text size="xs" c="dimmed" ff="monospace">
                  {region.id.slice(0, 8)}
                </Text>
              </Group>
            </Stack>
          </Group>

          <Group gap="xs">
            <Button variant="subtle" size="xs" onClick={toggleSettings}>
              {settingsOpen ? 'Hide' : 'Settings'}
            </Button>
            <Button variant="subtle" size="xs" onClick={() => setAddSpawnModalOpen(true)}>
              + Spawn
            </Button>
            <Button color="red" variant="subtle" size="xs" onClick={onDelete}>
              Delete
            </Button>
          </Group>
        </Group>

        {/* Collapsible Settings */}
        <Collapse in={settingsOpen}>
          <Paper p="md" mt="md" radius="md" style={{ background: '#181825', border: '1px solid #313244' }}>
            <Group grow mb="md">
              <TextInput
                label="Geometry Path"
                value={region.geometry?.path || ''}
                onChange={(e) => handleChange('geometry', { ...region.geometry, path: e.currentTarget.value })}
                placeholder="cafe-nollie"
                size="sm"
              />
              <Group grow>
                <NumberInput label="Grid X" value={region.gridPosition?.x ?? 0} onChange={(val) => handleChange('gridPosition', { x: typeof val === 'number' ? val : 0, z: region.gridPosition?.z ?? 0 })} size="sm" />
                <NumberInput label="Grid Z" value={region.gridPosition?.z ?? 0} onChange={(val) => handleChange('gridPosition', { x: region.gridPosition?.x ?? 0, z: typeof val === 'number' ? val : 0 })} size="sm" />
              </Group>
            </Group>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">Player Spawn</Text>
            <Group grow mb="md">
              <NumberInput label="X" value={region.playerSpawn.x} onChange={(val) => handleChange('playerSpawn', { ...region.playerSpawn, x: typeof val === 'number' ? val : 0 })} decimalScale={1} size="sm" />
              <NumberInput label="Y" value={region.playerSpawn.y} onChange={(val) => handleChange('playerSpawn', { ...region.playerSpawn, y: typeof val === 'number' ? val : 0 })} decimalScale={1} size="sm" />
              <NumberInput label="Z" value={region.playerSpawn.z} onChange={(val) => handleChange('playerSpawn', { ...region.playerSpawn, z: typeof val === 'number' ? val : 0 })} decimalScale={1} size="sm" />
            </Group>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">Availability</Text>
            <Group grow>
              <Select label="From Episode" data={episodeOptions} value={region.availability?.fromEpisode || ''} onChange={(val) => handleChange('availability', { ...region.availability, fromEpisode: val || undefined })} clearable size="sm" />
              <Select label="Until Episode" data={episodeOptions} value={region.availability?.untilEpisode || ''} onChange={(val) => handleChange('availability', { ...region.availability, untilEpisode: val || undefined })} clearable size="sm" />
            </Group>

            {/* Environment Animations */}
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="md" mb="xs">
              Environment Animations
            </Text>
            <Group gap="xs">
              <Button
                variant="subtle"
                size="xs"
                onClick={() => setAnimationsModalOpen(true)}
                disabled={!region.geometry?.path}
              >
                Edit Animations
              </Button>
              {(region.environmentAnimations || []).length > 0 && (
                <Badge size="sm" variant="light">
                  {(region.environmentAnimations || []).length} configured
                </Badge>
              )}
            </Group>
            {!region.geometry?.path && (
              <Text size="xs" c="dimmed" mt="xs">Set a geometry path first</Text>
            )}
          </Paper>
        </Collapse>
      </Paper>

      {/* Entity Spawns */}
      <ScrollArea style={{ flex: 1 }} p="lg">
        <Stack gap="lg">
          {Array.from(spawnsByType.entries()).map(([type, entries]) => {
            const config = SPAWN_CONFIG[type];
            return (
              <Paper key={type} p="md" radius="md" style={{ background: '#181825', border: '1px solid #313244' }}>
                <Group gap="xs" mb="md">
                  <Text size="lg">{config.icon}</Text>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">{config.title}</Text>
                  <Badge size="xs" variant="light" style={{ background: `${config.color}22`, color: config.color }}>{entries.length}</Badge>
                </Group>

                <Stack gap="xs">
                  {entries.map((spawn) => (
                    <Paper
                      key={spawn.id}
                      p="sm"
                      radius="sm"
                      style={{
                        background: selectedSpawnId === spawn.id ? '#313244' : '#1e1e2e',
                        border: selectedSpawnId === spawn.id ? `1px solid ${config.color}` : '1px solid transparent',
                        cursor: 'pointer',
                      }}
                      onClick={() => onSelectSpawn(spawn.id)}
                    >
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Text size="sm" fw={500}>{getSpawnName(spawn)}</Text>
                          <Text size="xs" c="dimmed">
                            ({spawn.position.x.toFixed(1)}, {spawn.position.y.toFixed(1)}, {spawn.position.z.toFixed(1)})
                          </Text>
                        </Stack>
                        <ActionIcon size="sm" variant="subtle" color="red" onClick={(e) => { e.stopPropagation(); handleDeleteSpawn(spawn); }}>
                          ✕
                        </ActionIcon>
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </Paper>
            );
          })}

          {spawns.length === 0 && (
            <Paper p="xl" radius="md" style={{ background: '#181825', border: '1px dashed #45475a', textAlign: 'center' }}>
              <Text size="xl" mb="sm">📭</Text>
              <Text c="dimmed" size="sm">No entity spawns</Text>
              <Text c="dimmed" size="xs" mt="xs">Click "+ Spawn" to add NPCs, items, and more</Text>
            </Paper>
          )}
        </Stack>
      </ScrollArea>

      {/* Add Spawn Modal */}
      <Modal opened={addSpawnModalOpen} onClose={() => setAddSpawnModalOpen(false)} title="Add Spawn" centered styles={{ header: { background: '#1e1e2e', borderBottom: '1px solid #313244' }, title: { color: '#cdd6f4', fontWeight: 600 }, body: { background: '#1e1e2e', padding: '20px' }, content: { background: '#1e1e2e' } }}>
        <Stack gap="xs">
          {Object.entries(SPAWN_CONFIG).map(([type, config]) => (
            <Button key={type} variant="subtle" justify="flex-start" leftSection={<Text size="lg">{config.icon}</Text>} onClick={() => handleAddSpawn(type as SpawnType)} fullWidth styles={{ root: { background: '#181825', border: '1px solid #313244', height: 'auto', padding: '12px 16px' } }}>
              {config.title.slice(0, -1)}
            </Button>
          ))}
        </Stack>
      </Modal>

      {/* Environment Animations Dialog */}
      {region.geometry?.path && (
        <EnvironmentAnimationsDialog
          opened={animationsModalOpen}
          onClose={() => setAnimationsModalOpen(false)}
          geometryPath={region.geometry.path}
          animations={region.environmentAnimations || []}
          onAnimationsChange={(animations) => handleChange('environmentAnimations', animations)}
        />
      )}

    </Stack>
  );
}
