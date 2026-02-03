/**
 * RegionPanel - React/Mantine editor for region entity spawns
 */

import { useState, ReactNode } from 'react';
import {
  Stack,
  TextInput,
  ScrollArea,
  Text,
  Group,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useEditorStore } from '../../store';
import { RegionDetail } from './RegionDetail';
import { SpawnInspector, SpawnData } from './SpawnInspector';
import { generateUUID } from '../../utils';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface NPCDefinition {
  id: string;
  position: Vec3;
}

export interface PickupDefinition {
  id: string;
  itemId: string;
  position: Vec3;
  quantity?: number;
}

export interface InspectableDefinition {
  id: string;
  position: Vec3;
  inspectionId: string;
  promptText?: string;
}

export interface ResonancePointDefinition {
  id: string;
  resonancePointId: string;         // References ResonancePointData.id
  position: Vec3;
  promptText?: string;              // Custom "Press E to..." text
}

export interface TriggerDefinition {
  id: string;
  type: 'box';
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  event: {
    type: string;
    target?: string;
    [key: string]: unknown;
  };
}

export type EnvironmentAnimationType = 'lamp_glow' | 'candle_flicker' | 'wind_sway';

export interface EnvironmentAnimationEntry {
  meshName: string;
  animationType: EnvironmentAnimationType;
  intensity?: number;  // 0-1, default varies by type
  speed?: number;      // multiplier, default 1
}

export interface RegionEntry {
  id: string;
  name: string;
  geometry?: { path: string };
  gridPosition?: { x: number; z: number };
  playerSpawn: Vec3;
  npcs?: NPCDefinition[];
  pickups?: PickupDefinition[];
  inspectables?: InspectableDefinition[];
  resonancePoints?: ResonancePointDefinition[];
  triggers?: TriggerDefinition[];
  environmentAnimations?: EnvironmentAnimationEntry[];
  availability?: { fromEpisode?: string; untilEpisode?: string };
}

export interface RegionPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface RegionPanelProps {
  regions: RegionEntry[];
  onRegionsChange: (regions: RegionEntry[]) => void;
  npcs?: { id: string; name: string }[];
  items?: { id: string; name: string }[];
  inspections?: { id: string; displayName?: string }[];
  resonancePointDefs?: { id: string; name: string }[];
  episodes?: { id: string; name: string }[];
  children: (result: RegionPanelResult) => ReactNode;
}

export function RegionPanel({
  regions,
  onRegionsChange,
  npcs = [],
  items = [],
  inspections = [],
  resonancePointDefs = [],
  episodes = [],
  children,
}: RegionPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedSpawnId, setSelectedSpawnId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);

  const selectedRegion = selectedId ? regions.find((r) => r.id === selectedId) : null;

  const filteredRegions = regions.filter(
    (region) =>
      region.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      region.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSpawnCount = (region: RegionEntry): number => {
    return (
      (region.npcs?.length || 0) +
      (region.pickups?.length || 0) +
      (region.inspectables?.length || 0) +
      (region.resonancePoints?.length || 0) +
      (region.triggers?.length || 0)
    );
  };

  const handleCreate = () => {
    const id = generateUUID();
    const newRegion: RegionEntry = {
      id,
      name: 'New Region',
      geometry: { path: '' },
      gridPosition: { x: 0, z: 0 },
      playerSpawn: { x: 0, y: 0, z: 0 },
      npcs: [],
      pickups: [],
      inspectables: [],
      triggers: [],
    };
    onRegionsChange([...regions, newRegion]);
    setSelectedId(id);
    setDirty(true);
  };

  const handleUpdate = (updated: RegionEntry) => {
    onRegionsChange(regions.map((r) => (r.id === updated.id ? updated : r)));
    setDirty(true);
  };

  const handleDelete = (id: string) => {
    onRegionsChange(regions.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  };

  // Get spawn data from selected region
  const getSelectedSpawn = (): SpawnData | null => {
    if (!selectedRegion || !selectedSpawnId) return null;

    for (const npc of selectedRegion.npcs || []) {
      if (npc.id === selectedSpawnId) {
        return { id: npc.id, type: 'npc', position: npc.position, data: npc };
      }
    }
    for (const pickup of selectedRegion.pickups || []) {
      if (pickup.id === selectedSpawnId) {
        return { id: pickup.id, type: 'pickup', position: pickup.position, data: pickup };
      }
    }
    for (const inspectable of selectedRegion.inspectables || []) {
      if (inspectable.id === selectedSpawnId) {
        return { id: inspectable.id, type: 'inspectable', position: inspectable.position, data: inspectable };
      }
    }
    for (const resonancePoint of selectedRegion.resonancePoints || []) {
      if (resonancePoint.id === selectedSpawnId) {
        return { id: resonancePoint.id, type: 'resonancePoint', position: resonancePoint.position, data: resonancePoint };
      }
    }
    for (const trigger of selectedRegion.triggers || []) {
      if (trigger.id === selectedSpawnId) {
        const center: Vec3 = {
          x: (trigger.bounds.min[0] + trigger.bounds.max[0]) / 2,
          y: (trigger.bounds.min[1] + trigger.bounds.max[1]) / 2,
          z: (trigger.bounds.min[2] + trigger.bounds.max[2]) / 2,
        };
        return { id: trigger.id, type: 'trigger', position: center, data: trigger };
      }
    }
    return null;
  };

  const handleSpawnUpdate = (spawn: SpawnData) => {
    if (!selectedRegion) return;
    let updated = { ...selectedRegion };

    switch (spawn.type) {
      case 'npc':
        updated.npcs = (selectedRegion.npcs || []).map((n) =>
          n.id === spawn.id ? { ...(spawn.data as NPCDefinition), position: spawn.position } : n
        );
        break;
      case 'pickup':
        updated.pickups = (selectedRegion.pickups || []).map((p) =>
          p.id === spawn.id ? { ...(spawn.data as PickupDefinition), position: spawn.position } : p
        );
        break;
      case 'inspectable':
        updated.inspectables = (selectedRegion.inspectables || []).map((i) =>
          i.id === spawn.id ? { ...(spawn.data as InspectableDefinition), position: spawn.position } : i
        );
        break;
      case 'resonancePoint':
        updated.resonancePoints = (selectedRegion.resonancePoints || []).map((r) =>
          r.id === spawn.id ? { ...(spawn.data as ResonancePointDefinition), position: spawn.position } : r
        );
        break;
      case 'trigger': {
        const triggerData = spawn.data as TriggerDefinition;
        const halfSize = {
          x: (triggerData.bounds.max[0] - triggerData.bounds.min[0]) / 2,
          y: (triggerData.bounds.max[1] - triggerData.bounds.min[1]) / 2,
          z: (triggerData.bounds.max[2] - triggerData.bounds.min[2]) / 2,
        };
        const newBounds = {
          min: [spawn.position.x - halfSize.x, spawn.position.y - halfSize.y, spawn.position.z - halfSize.z] as [number, number, number],
          max: [spawn.position.x + halfSize.x, spawn.position.y + halfSize.y, spawn.position.z + halfSize.z] as [number, number, number],
        };
        updated.triggers = (selectedRegion.triggers || []).map((t) =>
          t.id === spawn.id ? { ...triggerData, bounds: newBounds } : t
        );
        break;
      }
    }
    handleUpdate(updated);
  };

  const handleSpawnDelete = () => {
    if (!selectedRegion || !selectedSpawnId) return;
    const spawn = getSelectedSpawn();
    if (!spawn) return;

    let updated = { ...selectedRegion };
    switch (spawn.type) {
      case 'npc': updated.npcs = (selectedRegion.npcs || []).filter((n) => n.id !== selectedSpawnId); break;
      case 'pickup': updated.pickups = (selectedRegion.pickups || []).filter((p) => p.id !== selectedSpawnId); break;
      case 'inspectable': updated.inspectables = (selectedRegion.inspectables || []).filter((i) => i.id !== selectedSpawnId); break;
      case 'resonancePoint': updated.resonancePoints = (selectedRegion.resonancePoints || []).filter((r) => r.id !== selectedSpawnId); break;
      case 'trigger': updated.triggers = (selectedRegion.triggers || []).filter((t) => t.id !== selectedSpawnId); break;
    }
    handleUpdate(updated);
    setSelectedSpawnId(null);
  };

  const selectedSpawn = getSelectedSpawn();

  const result: RegionPanelResult = {
    // Entry list (left panel)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Regions ({regions.length})
          </Text>
          <Tooltip label="Create Region">
            <ActionIcon variant="subtle" onClick={handleCreate}>
              +
            </ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search regions..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredRegions.map((region) => (
              <Group
                key={region.id}
                p="xs"
                gap="xs"
                style={{
                  background:
                    selectedId === region.id ? 'var(--mantine-color-dark-6)' : undefined,
                  borderRadius: 'var(--mantine-radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedId(region.id)}
              >
                <Text size="lg">🗺️</Text>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {region.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {getSpawnCount(region)} spawns · {region.geometry?.path || 'no geometry'}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Main content (center panel)
    content: selectedRegion ? (
      <RegionDetail
        region={selectedRegion}
        npcs={npcs}
        items={items}
        inspections={inspections}
        resonancePointDefs={resonancePointDefs}
        episodes={episodes}
        selectedSpawnId={selectedSpawnId}
        onSelectSpawn={setSelectedSpawnId}
        onChange={handleUpdate}
        onDelete={() => handleDelete(selectedRegion.id)}
      />
    ) : (
      <Stack align="center" justify="center" h="100%" gap="md">
        <Text size="xl">🗺️</Text>
        <Text c="dimmed">Select a region to edit</Text>
        <Text size="sm" c="dimmed" ta="center" maw={300}>
          Regions define where entities spawn when players enter an area.
        </Text>
      </Stack>
    ),

    // Inspector (right panel) - spawn properties
    inspector: selectedSpawn ? (
      <SpawnInspector
        spawn={selectedSpawn}
        npcs={npcs}
        items={items}
        inspections={inspections}
        resonancePointDefs={resonancePointDefs}
        onChange={handleSpawnUpdate}
        onDelete={handleSpawnDelete}
      />
    ) : null,
  };

  return <>{children(result)}</>;
}
