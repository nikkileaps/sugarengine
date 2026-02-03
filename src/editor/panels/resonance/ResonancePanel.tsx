/**
 * ResonancePanel - Editor panel for resonance point definitions
 */

import { useState, ReactNode } from 'react';
import {
  Stack,
  TextInput,
  Textarea,
  ScrollArea,
  Text,
  Group,
  Badge,
  ActionIcon,
  Tooltip,
  Slider,
  Select,
  Button,
  Paper,
} from '@mantine/core';
import { useEditorStore, ResonancePointData } from '../../store';
import { generateUUID, shortId } from '../../utils';

export interface ResonancePanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface ResonancePanelProps {
  resonancePoints: ResonancePointData[];
  onResonancePointsChange: (points: ResonancePointData[]) => void;
  children: (result: ResonancePanelResult) => ReactNode;
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: 'green',
  medium: 'yellow',
  hard: 'red',
};

export function ResonancePanel({
  resonancePoints,
  onResonancePointsChange,
  children,
}: ResonancePanelProps) {
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);

  const selectedPoint = selectedPointId
    ? resonancePoints.find((p) => p.id === selectedPointId)
    : null;

  const handleCreatePoint = () => {
    const id = generateUUID();
    const newPoint: ResonancePointData = {
      id,
      name: 'New Resonance Point',
      description: '',
      icon: '✨',
      resonanceReward: 10,
      difficulty: 'easy',
    };
    onResonancePointsChange([...resonancePoints, newPoint]);
    setSelectedPointId(id);
    setDirty(true);
  };

  const handleUpdatePoint = (updated: ResonancePointData) => {
    onResonancePointsChange(
      resonancePoints.map((p) => (p.id === updated.id ? updated : p))
    );
    setDirty(true);
  };

  const handleDeletePoint = (id: string) => {
    onResonancePointsChange(resonancePoints.filter((p) => p.id !== id));
    if (selectedPointId === id) setSelectedPointId(null);
    setDirty(true);
  };

  const filteredPoints = resonancePoints.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.difficulty.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const result: ResonancePanelResult = {
    // List panel (left)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Resonance Points ({resonancePoints.length})
          </Text>
          <Tooltip label="Create Resonance Point">
            <ActionIcon variant="subtle" onClick={handleCreatePoint}>
              +
            </ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredPoints.map((point) => (
              <Group
                key={point.id}
                p="xs"
                gap="xs"
                style={{
                  background:
                    selectedPointId === point.id
                      ? 'var(--mantine-color-dark-6)'
                      : undefined,
                  borderRadius: 'var(--mantine-radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedPointId(point.id)}
              >
                <Text size="lg">{point.icon || '✨'}</Text>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {point.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    +{point.resonanceReward}% · {shortId(point.id)}
                  </Text>
                </Stack>
                <Badge
                  size="xs"
                  variant="light"
                  color={DIFFICULTY_COLORS[point.difficulty] || 'gray'}
                >
                  {point.difficulty}
                </Badge>
              </Group>
            ))}
            {filteredPoints.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No resonance points yet. Click + to create one.
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Content panel (center)
    content: selectedPoint ? (
      <ResonancePointDetail
        point={selectedPoint}
        onChange={handleUpdatePoint}
        onDelete={() => handleDeletePoint(selectedPoint.id)}
      />
    ) : (
      <EmptyState />
    ),

    // Inspector panel (right)
    inspector: selectedPoint ? (
      <ResonancePointInspector point={selectedPoint} />
    ) : null,
  };

  return <>{children(result)}</>;
}

// ============================================
// Detail Editor
// ============================================

function ResonancePointDetail({
  point,
  onChange,
  onDelete,
}: {
  point: ResonancePointData;
  onChange: (p: ResonancePointData) => void;
  onDelete: () => void;
}) {
  return (
    <Stack p="md" gap="md">
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="xl">{point.icon || '✨'}</Text>
          <Text size="xl" fw={600}>
            {point.name}
          </Text>
        </Group>
        <Button variant="subtle" color="red" size="xs" onClick={onDelete}>
          Delete
        </Button>
      </Group>

      <Group grow>
        <TextInput
          label="Icon"
          value={point.icon || ''}
          onChange={(e) =>
            onChange({ ...point, icon: e.currentTarget.value || undefined })
          }
          placeholder="✨"
          styles={{ input: { fontSize: 20, textAlign: 'center' } }}
        />
        <TextInput
          label="Name"
          value={point.name}
          onChange={(e) => onChange({ ...point, name: e.currentTarget.value })}
        />
      </Group>

      <Textarea
        label="Description"
        description="Optional flavor text shown in the mini-game"
        value={point.description || ''}
        onChange={(e) =>
          onChange({ ...point, description: e.currentTarget.value || undefined })
        }
        minRows={2}
        autosize
        placeholder="A glowing crystal that pulses with ancient magic..."
      />

      <Paper p="md" withBorder>
        <Stack gap="md">
          <Group gap="xs">
            <Text size="lg">🎯</Text>
            <Text fw={500}>Game Settings</Text>
          </Group>

          <Select
            label="Difficulty"
            description="Affects firefly pattern complexity and speed"
            value={point.difficulty}
            onChange={(v) =>
              onChange({
                ...point,
                difficulty: (v as 'easy' | 'medium' | 'hard') || 'easy',
              })
            }
            data={DIFFICULTY_OPTIONS}
          />

          <div>
            <Text size="sm" mb={4}>
              Resonance Reward: +{point.resonanceReward}%
            </Text>
            <Text size="xs" c="dimmed" mb={8}>
              How much resonance the player gains on success
            </Text>
            <Slider
              value={point.resonanceReward}
              onChange={(v) => onChange({ ...point, resonanceReward: v })}
              min={1}
              max={50}
              marks={[
                { value: 5, label: '5' },
                { value: 15, label: '15' },
                { value: 25, label: '25' },
                { value: 50, label: '50' },
              ]}
              color="violet"
            />
          </div>

          <div>
            <Text size="sm" mb={4}>
              Cooldown: {point.cooldownMinutes ?? 0} minutes
            </Text>
            <Text size="xs" c="dimmed" mb={8}>
              Optional: how long before player can use again (0 = no cooldown)
            </Text>
            <Slider
              value={point.cooldownMinutes ?? 0}
              onChange={(v) =>
                onChange({ ...point, cooldownMinutes: v > 0 ? v : undefined })
              }
              min={0}
              max={60}
              marks={[
                { value: 0, label: 'None' },
                { value: 15, label: '15m' },
                { value: 30, label: '30m' },
                { value: 60, label: '1h' },
              ]}
            />
          </div>
        </Stack>
      </Paper>

      <Paper p="md" withBorder>
        <Stack gap="sm">
          <Group gap="xs">
            <Text size="lg">🦋</Text>
            <Text fw={500}>Mini-Game Preview</Text>
          </Group>
          <Text size="sm" c="dimmed">
            The Firefly Dance mini-game will show 5 fireflies following a
            trajectory. The player must identify which of 4 pattern options
            matches the dance.
          </Text>
          <Group gap="xs">
            <Badge color={DIFFICULTY_COLORS[point.difficulty]}>
              {point.difficulty}
            </Badge>
            <Text size="xs" c="dimmed">
              {point.difficulty === 'easy' &&
                'Simple paths, slow movement, 3 attempts'}
              {point.difficulty === 'medium' &&
                'Complex paths, moderate speed, 3 attempts'}
              {point.difficulty === 'hard' &&
                'Intricate paths, fast movement, 3 attempts'}
            </Text>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

// ============================================
// Inspector
// ============================================

function ResonancePointInspector({ point }: { point: ResonancePointData }) {
  return (
    <Stack gap="md" p="sm">
      <Text size="sm" fw={500} c="dimmed">
        Properties
      </Text>

      <TextInput
        label="ID"
        value={point.id}
        readOnly
        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
      />

      <div>
        <Text size="sm" mb={4}>
          Resonance Reward
        </Text>
        <Group gap="xs">
          <Badge
            size="lg"
            color="violet"
            style={{
              background:
                'linear-gradient(90deg, #7b68ee 0%, #9c8eff 100%)',
            }}
          >
            +{point.resonanceReward}%
          </Badge>
        </Group>
      </div>

      <div>
        <Text size="sm" mb={4}>
          Difficulty
        </Text>
        <Badge size="lg" color={DIFFICULTY_COLORS[point.difficulty]}>
          {point.difficulty.charAt(0).toUpperCase() + point.difficulty.slice(1)}
        </Badge>
      </div>

      {point.cooldownMinutes && point.cooldownMinutes > 0 && (
        <div>
          <Text size="sm" mb={4}>
            Cooldown
          </Text>
          <Text size="xs" c="dimmed">
            {point.cooldownMinutes} minute{point.cooldownMinutes !== 1 ? 's' : ''}
          </Text>
        </div>
      )}

      <Paper p="sm" withBorder mt="md">
        <Text size="xs" fw={500} c="dimmed" mb="xs">
          Usage in Regions
        </Text>
        <Text size="xs" c="dimmed">
          Place this resonance point in regions via the Regions tab. Use the +
          Spawn menu to add resonance points to the world.
        </Text>
      </Paper>
    </Stack>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <Stack align="center" justify="center" h="100%" gap="md">
      <Text size="xl">✨</Text>
      <Text c="dimmed">Select a resonance point to edit</Text>
      <Text size="sm" c="dimmed" ta="center" maw={300}>
        Resonance points are interactive objects that players can attune to,
        playing a mini-game to increase their resonance stat.
      </Text>
    </Stack>
  );
}
