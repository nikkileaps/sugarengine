/**
 * PlayerPanel - Editor panel for player settings including caster configuration
 */

import { ReactNode, useState } from 'react';
import {
  Stack,
  TextInput,
  NumberInput,
  Text,
  Group,
  Badge,
  Slider,
  Paper,
  Title,
  SegmentedControl,
} from '@mantine/core';
import { useEditorStore, PlayerCasterData } from '../../store';

type PlayerSection = 'caster' | 'spawn';

export interface PlayerPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface PlayerPanelProps {
  playerCaster: PlayerCasterData | null;
  onPlayerCasterChange: (playerCaster: PlayerCasterData | null) => void;
  children: (result: PlayerPanelResult) => ReactNode;
}

const DEFAULT_CASTER: PlayerCasterData = {
  initialBattery: 100,
  rechargeRate: 1,        // % per minute (slow trickle from ambient magic)
  initialResonance: 0,    // Start with no resonance, must visit resonance points
};

export function PlayerPanel({
  playerCaster,
  onPlayerCasterChange,
  children,
}: PlayerPanelProps) {
  const setDirty = useEditorStore((s) => s.setDirty);
  const [selectedSection, setSelectedSection] = useState<PlayerSection>('caster');

  // Ensure we have a caster config (use defaults if null)
  const caster = playerCaster ?? DEFAULT_CASTER;

  const handleUpdate = (updates: Partial<PlayerCasterData>) => {
    const newCaster = { ...caster, ...updates };
    console.log('[PlayerPanel] handleUpdate:', { updates, newCaster });
    onPlayerCasterChange(newCaster);
    setDirty(true);
  };

  const result: PlayerPanelResult = {
    // List panel (left) - simple navigation for player settings
    list: (
      <Stack gap="xs" h="100%">
        <Text size="sm" fw={500}>Player Settings</Text>

        <Stack gap={4}>
          <Group
            p="xs"
            gap="xs"
            onClick={() => setSelectedSection('caster')}
            style={{
              background: selectedSection === 'caster'
                ? 'var(--mantine-color-blue-9)'
                : 'var(--mantine-color-dark-6)',
              borderRadius: 'var(--mantine-radius-sm)',
              cursor: 'pointer',
            }}
          >
            <Text size="lg">🔮</Text>
            <Stack gap={0} style={{ flex: 1 }}>
              <Text size="sm" fw={500}>Caster</Text>
              <Text size="xs" c="dimmed">
                Battery & resonance settings
              </Text>
            </Stack>
          </Group>

          <Group
            p="xs"
            gap="xs"
            onClick={() => setSelectedSection('spawn')}
            style={{
              background: selectedSection === 'spawn'
                ? 'var(--mantine-color-blue-9)'
                : 'var(--mantine-color-dark-6)',
              borderRadius: 'var(--mantine-radius-sm)',
              cursor: 'pointer',
            }}
          >
            <Text size="lg">📍</Text>
            <Stack gap={0} style={{ flex: 1 }}>
              <Text size="sm" fw={500}>Spawn</Text>
              <Text size="xs" c="dimmed">
                Position & facing direction
              </Text>
            </Stack>
          </Group>
        </Stack>
      </Stack>
    ),

    // Content panel (center) - shows selected section only
    content: (
      <Stack p="md" gap="lg">
        {selectedSection === 'caster' && (
          <>
            <Title order={3}>Caster Settings</Title>

            <Text size="sm" c="dimmed">
              Configure the player's magic casting device. These settings determine battery capacity,
              recharge speed, and resonance buildup rate.
            </Text>

            {/* Battery Settings */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Group gap="xs">
                  <Text size="lg">⚡</Text>
                  <Text fw={500}>Battery</Text>
                </Group>

                <div>
                  <Text size="sm" mb={4}>Initial Battery: {caster.initialBattery}%</Text>
                  <Text size="xs" c="dimmed" mb={8}>
                    The battery level the player starts with when this episode begins.
                  </Text>
                  <Slider
                    value={caster.initialBattery}
                    onChange={(v) => handleUpdate({ initialBattery: v })}
                    min={0}
                    max={100}
                    marks={[
                      { value: 0, label: '0%' },
                      { value: 25, label: '25%' },
                      { value: 50, label: '50%' },
                      { value: 75, label: '75%' },
                      { value: 100, label: '100%' },
                    ]}
                    color={caster.initialBattery >= 75 ? 'green' : caster.initialBattery >= 25 ? 'yellow' : 'red'}
                  />
                </div>

                <div>
                  <Text size="sm" mb={4}>Recharge Rate: {caster.rechargeRate}% per minute</Text>
                  <Text size="xs" c="dimmed" mb={8}>
                    Trickle charge from ambient magic. Higher = faster recharge.
                  </Text>
                  <Slider
                    value={caster.rechargeRate}
                    onChange={(v) => handleUpdate({ rechargeRate: v })}
                    min={0}
                    max={10}
                    step={0.5}
                    marks={[
                      { value: 0, label: '0' },
                      { value: 1, label: '1' },
                      { value: 5, label: '5' },
                      { value: 10, label: '10' },
                    ]}
                  />
                </div>
              </Stack>
            </Paper>

            {/* Resonance Settings */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Group gap="xs">
                  <Text size="lg">✨</Text>
                  <Text fw={500}>Resonance</Text>
                </Group>

                <Text size="xs" c="dimmed">
                  Resonance stabilizes spell casting by reducing chaos chance.
                  Players increase resonance by visiting resonance points in the world.
                  Higher resonance = more reliable spells at low battery.
                </Text>

                <div>
                  <Text size="sm" mb={4}>Initial Resonance: {caster.initialResonance ?? 0}%</Text>
                  <Text size="xs" c="dimmed" mb={8}>
                    The resonance level the player starts with when this episode begins.
                  </Text>
                  <Slider
                    value={caster.initialResonance ?? 0}
                    onChange={(v) => handleUpdate({ initialResonance: v })}
                    min={0}
                    max={100}
                    marks={[
                      { value: 0, label: '0%' },
                      { value: 25, label: '25%' },
                      { value: 50, label: '50%' },
                      { value: 75, label: '75%' },
                      { value: 100, label: '100%' },
                    ]}
                    color="violet"
                  />
                </div>
              </Stack>
            </Paper>

            {/* Spell Restrictions */}
            <Paper p="md" withBorder>
              <Stack gap="md">
                <Group gap="xs">
                  <Text size="lg">🏷️</Text>
                  <Text fw={500}>Spell Restrictions</Text>
                </Group>

                <TextInput
                  label="Allowed Spell Tags"
                  description="Only spells with these tags can be cast. Leave empty to allow all."
                  value={caster.allowedSpellTags?.join(', ') || ''}
                  onChange={(e) => {
                    const tags = e.currentTarget.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter((t) => t.length > 0);
                    handleUpdate({ allowedSpellTags: tags.length > 0 ? tags : undefined });
                  }}
                  placeholder="e.g. basic, fire, healing"
                />

                <TextInput
                  label="Blocked Spell Tags"
                  description="Spells with these tags cannot be cast."
                  value={caster.blockedSpellTags?.join(', ') || ''}
                  onChange={(e) => {
                    const tags = e.currentTarget.value
                      .split(',')
                      .map((t) => t.trim())
                      .filter((t) => t.length > 0);
                    handleUpdate({ blockedSpellTags: tags.length > 0 ? tags : undefined });
                  }}
                  placeholder="e.g. dark, forbidden"
                />
              </Stack>
            </Paper>
          </>
        )}

        {selectedSection === 'spawn' && (
          <>
            <Title order={3}>Spawn Settings</Title>

            <Text size="sm" c="dimmed">
              Set the player's starting position and facing direction when the episode loads.
            </Text>

            <Paper p="md" withBorder>
              <Stack gap="md">
                <Group gap="xs">
                  <Text size="lg">📍</Text>
                  <Text fw={500}>Position</Text>
                </Group>

                <Text size="xs" c="dimmed">
                  Leave empty to use the region's default spawn point.
                </Text>

                <Group grow>
                  <NumberInput
                    label="X Position"
                    value={caster.initialSpawnPosition?.x ?? ''}
                    onChange={(v) => {
                      if (v === '' || v === undefined) {
                        handleUpdate({ initialSpawnPosition: undefined });
                      } else {
                        handleUpdate({
                          initialSpawnPosition: {
                            x: typeof v === 'number' ? v : 0,
                            y: caster.initialSpawnPosition?.y ?? 0,
                            z: caster.initialSpawnPosition?.z ?? 0,
                          },
                        });
                      }
                    }}
                    placeholder="auto"
                    step={0.5}
                    decimalScale={2}
                  />
                  <NumberInput
                    label="Y Position"
                    value={caster.initialSpawnPosition?.y ?? ''}
                    onChange={(v) => {
                      if (v === '' || v === undefined) {
                        handleUpdate({ initialSpawnPosition: undefined });
                      } else {
                        handleUpdate({
                          initialSpawnPosition: {
                            x: caster.initialSpawnPosition?.x ?? 0,
                            y: typeof v === 'number' ? v : 0,
                            z: caster.initialSpawnPosition?.z ?? 0,
                          },
                        });
                      }
                    }}
                    placeholder="auto"
                    step={0.5}
                    decimalScale={2}
                  />
                  <NumberInput
                    label="Z Position"
                    value={caster.initialSpawnPosition?.z ?? ''}
                    onChange={(v) => {
                      if (v === '' || v === undefined) {
                        handleUpdate({ initialSpawnPosition: undefined });
                      } else {
                        handleUpdate({
                          initialSpawnPosition: {
                            x: caster.initialSpawnPosition?.x ?? 0,
                            y: caster.initialSpawnPosition?.y ?? 0,
                            z: typeof v === 'number' ? v : 0,
                          },
                        });
                      }
                    }}
                    placeholder="auto"
                    step={0.5}
                    decimalScale={2}
                  />
                </Group>
              </Stack>
            </Paper>

            <Paper p="md" withBorder>
              <Stack gap="md">
                <Group gap="xs">
                  <Text size="lg">🧭</Text>
                  <Text fw={500}>Facing Direction</Text>
                </Group>

                <Text size="xs" c="dimmed">
                  The direction the player faces when the episode starts.
                </Text>

                <SegmentedControl
                  value={String(caster.initialFacingAngle ?? 0)}
                  onChange={(v) => handleUpdate({ initialFacingAngle: parseInt(v) })}
                  data={[
                    { label: '↑ North', value: '0' },
                    { label: '→ East', value: '90' },
                    { label: '↓ South', value: '180' },
                    { label: '← West', value: '270' },
                  ]}
                  fullWidth
                />
              </Stack>
            </Paper>
          </>
        )}
      </Stack>
    ),

    // Inspector panel (right) - summary view
    inspector: (
      <Stack gap="md" p="sm">
        <Text size="sm" fw={500} c="dimmed">Caster Summary</Text>

        <div>
          <Text size="sm" mb={4}>Starting Battery: {caster.initialBattery}%</Text>
          <Slider
            value={caster.initialBattery}
            min={0}
            max={100}
            disabled
            marks={[
              { value: 25, label: 'Critical' },
              { value: 75, label: 'Full' },
            ]}
            color={caster.initialBattery >= 75 ? 'green' : caster.initialBattery >= 25 ? 'yellow' : 'red'}
          />
        </div>

        <div>
          <Text size="sm" mb={4}>Chaos Chance by Battery</Text>
          <Stack gap={4}>
            <Group justify="space-between">
              <Badge color="green" size="sm">75-100%</Badge>
              <Text size="xs">0% chaos</Text>
            </Group>
            <Group justify="space-between">
              <Badge color="yellow" size="sm">25-74%</Badge>
              <Text size="xs">40% base chaos</Text>
            </Group>
            <Group justify="space-between">
              <Badge color="red" size="sm">1-24%</Badge>
              <Text size="xs">80% base chaos</Text>
            </Group>
            <Group justify="space-between">
              <Badge color="gray" size="sm">0%</Badge>
              <Text size="xs">Cannot cast</Text>
            </Group>
          </Stack>
        </div>

        <Text size="xs" c="dimmed" mt="md">
          Resonance reduces chaos chance by up to 80%. At 100% resonance, a 40% chaos chance becomes 8%.
        </Text>

        {caster.allowedSpellTags && caster.allowedSpellTags.length > 0 && (
          <div>
            <Text size="sm" mb={4}>Allowed Tags</Text>
            <Group gap={4}>
              {caster.allowedSpellTags.map((tag: string) => (
                <Badge key={tag} size="sm" variant="light" color="green">
                  {tag}
                </Badge>
              ))}
            </Group>
          </div>
        )}

        {caster.blockedSpellTags && caster.blockedSpellTags.length > 0 && (
          <div>
            <Text size="sm" mb={4}>Blocked Tags</Text>
            <Group gap={4}>
              {caster.blockedSpellTags.map((tag: string) => (
                <Badge key={tag} size="sm" variant="light" color="red">
                  {tag}
                </Badge>
              ))}
            </Group>
          </div>
        )}

        <Text size="sm" fw={500} c="dimmed" mt="md">Spawn Settings</Text>

        <div>
          <Text size="sm" mb={4}>Position</Text>
          {caster.initialSpawnPosition ? (
            <Text size="xs" c="dimmed">
              ({caster.initialSpawnPosition.x}, {caster.initialSpawnPosition.y}, {caster.initialSpawnPosition.z})
            </Text>
          ) : (
            <Text size="xs" c="dimmed">Using region default</Text>
          )}
        </div>

        <div>
          <Text size="sm" mb={4}>Facing</Text>
          <Badge size="sm" variant="light">
            {caster.initialFacingAngle === 0 || caster.initialFacingAngle === undefined
              ? '↑ North'
              : caster.initialFacingAngle === 90
              ? '→ East'
              : caster.initialFacingAngle === 180
              ? '↓ South'
              : '← West'}
          </Badge>
        </div>
      </Stack>
    ),
  };

  return <>{children(result)}</>;
}
