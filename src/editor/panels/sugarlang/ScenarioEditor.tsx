/**
 * ScenarioEditor — editable panel for ScenarioBrief artifacts.
 *
 * Allows editing: supportedBands, npcIds/npcNames,
 * activeReferents, successCriteria.
 */

import {
  Stack,
  Text,
  Group,
  Badge,
  Checkbox,
  Paper,
  Select,
  Title,
  ScrollArea,
} from '@mantine/core';
import { CompactIdDisplay } from '../../components';
import type { ScenarioBrief, LearnerBandId } from '../../../plugins/sugarlang/types';

const ALL_BANDS: LearnerBandId[] = ['B0', 'B1', 'B2', 'B3', 'B4'];

interface ScenarioEditorProps {
  scenarios: Map<string, ScenarioBrief>;
  selectedScenarioId: string | null;
  quests: Array<{ id: string; name: string }>;
  onSelectScenario: (id: string) => void;
  onUpdateScenario: (scenarioId: string, updated: ScenarioBrief) => void;
}

export function ScenarioEditor({
  scenarios,
  selectedScenarioId,
  quests,
  onSelectScenario,
  onUpdateScenario,
}: ScenarioEditorProps) {
  const scenario = selectedScenarioId ? scenarios.get(selectedScenarioId) : null;

  const update = (patch: Partial<ScenarioBrief>) => {
    if (!scenario || !selectedScenarioId) return;
    onUpdateScenario(selectedScenarioId, { ...scenario, ...patch });
  };

  const list = (
    <Stack gap="xs" p="sm">
      <Title order={5}>Scenarios</Title>
      <ScrollArea h={400}>
        <Stack gap={2}>
          {Array.from(scenarios.values()).map((s) => (
            <Group
              key={s.scenarioId}
              gap="xs"
              p={4}
              style={{
                cursor: 'pointer',
                borderRadius: 4,
                background: selectedScenarioId === s.scenarioId ? 'rgba(137,180,250,0.15)' : undefined,
              }}
              onClick={() => onSelectScenario(s.scenarioId)}
            >
              <Badge size="xs" color="blue">Scenario</Badge>
              <Text size="xs" truncate style={{ flex: 1 }}>{s.scenarioId}</Text>
            </Group>
          ))}
          {scenarios.size === 0 && (
            <Text size="xs" c="dimmed">No scenarios loaded</Text>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );

  const content = scenario ? (
    <ScrollArea h="100%">
      <Stack gap="md" p="md">
        <Paper p="sm" withBorder>
          <Title order={6} mb="xs">Scenario: {scenario.scenarioId}</Title>

          <Stack gap="sm">
            <Select
              label="Associated Quest"
              placeholder="Select a quest"
              data={quests.map((quest) => ({
                value: quest.id,
                label: quest.name,
              }))}
              value={scenario.associatedQuestId ?? null}
              onChange={(value) => update({ associatedQuestId: value ?? undefined })}
              searchable
              nothingFoundMessage="No quests"
              clearable
              size="sm"
            />

            {scenario.associatedQuestId && (
              <div>
                <Text size="sm" fw={500} mb={4}>Stored Quest ID</Text>
                <CompactIdDisplay value={scenario.associatedQuestId} size="sm" />
              </div>
            )}

            <div>
              <Text size="sm" fw={500} mb={4}>Supported Bands</Text>
              <Group gap="xs">
                {ALL_BANDS.map((band) => (
                  <Checkbox
                    key={band}
                    label={band}
                    size="xs"
                    checked={scenario.supportedBands.includes(band)}
                    onChange={(e) => {
                      const bands = e.currentTarget.checked
                        ? [...scenario.supportedBands, band].sort()
                        : scenario.supportedBands.filter((b) => b !== band);
                      update({ supportedBands: bands as LearnerBandId[] });
                    }}
                  />
                ))}
              </Group>
            </div>

            <div>
              <Text size="sm" fw={500} mb={4}>NPCs</Text>
              <Group gap={6}>
                {(scenario.npcNames ?? scenario.npcIds).map((name) => (
                  <Badge key={name} size="sm" variant="light">{name}</Badge>
                ))}
                {(scenario.npcNames ?? scenario.npcIds).length === 0 && (
                  <Text size="xs" c="dimmed">None (derived from quest)</Text>
                )}
              </Group>
            </div>

            <div>
              <Text size="sm" fw={500} mb={4}>Active Referents</Text>
              <Group gap={6}>
                {scenario.activeReferents.map((ref) => (
                  <Badge key={ref} size="sm" variant="light">{ref}</Badge>
                ))}
                {scenario.activeReferents.length === 0 && (
                  <Text size="xs" c="dimmed">None (derived from quest)</Text>
                )}
              </Group>
            </div>

            <div>
              <Text size="sm" fw={500} mb={4}>Success Criteria</Text>
              <Group gap={6}>
                {scenario.successCriteria.map((c) => (
                  <Badge key={c} size="sm" variant="light">{c}</Badge>
                ))}
                {scenario.successCriteria.length === 0 && (
                  <Text size="xs" c="dimmed">None (derived from quest)</Text>
                )}
              </Group>
            </div>
          </Stack>
        </Paper>
      </Stack>
    </ScrollArea>
  ) : (
    <Stack align="center" justify="center" h="100%">
      <Text c="dimmed" size="sm">Select a scenario to edit</Text>
    </Stack>
  );

  return { list, content };
}

