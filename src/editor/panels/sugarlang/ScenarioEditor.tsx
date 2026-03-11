/**
 * ScenarioEditor — editable panel for ScenarioBrief artifacts.
 *
 * Allows editing: communicativeTask, supportedBands, npcIds/npcNames,
 * activeReferents, successCriteria.
 */

import { useCallback } from 'react';
import {
  Stack,
  Text,
  TextInput,
  Group,
  Badge,
  Checkbox,
  Paper,
  Select,
  Title,
  ActionIcon,
  Tooltip,
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
            <TextInput
              label="Communicative Task"
              value={scenario.communicativeTask}
              onChange={(e) => update({ communicativeTask: e.currentTarget.value })}
              size="sm"
            />

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
              <Text size="sm" fw={500} mb={4}>NPC IDs</Text>
              <TagEditor
                values={scenario.npcIds}
                onChange={(npcIds) => update({ npcIds })}
                placeholder="Add NPC ID..."
              />
            </div>

            <div>
              <Text size="sm" fw={500} mb={4}>NPC Names</Text>
              <TagEditor
                values={scenario.npcNames ?? []}
                onChange={(npcNames) => update({ npcNames })}
                placeholder="Add NPC name..."
              />
            </div>

            <div>
              <Text size="sm" fw={500} mb={4}>Active Referents</Text>
              <TagEditor
                values={scenario.activeReferents}
                onChange={(activeReferents) => update({ activeReferents })}
                placeholder="e.g. object.suitcase"
              />
            </div>

            <div>
              <Text size="sm" fw={500} mb={4}>Success Criteria</Text>
              <ListEditor
                values={scenario.successCriteria}
                onChange={(successCriteria) => update({ successCriteria })}
                placeholder="Add criterion..."
              />
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

// ---------------------------------------------------------------------------
// Inline helper components
// ---------------------------------------------------------------------------

function TagEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const handleAdd = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        const val = e.currentTarget.value.trim();
        if (val && !values.includes(val)) {
          onChange([...values, val]);
          e.currentTarget.value = '';
        }
      }
    },
    [values, onChange],
  );

  return (
    <Stack gap={4}>
      <Group gap={4} style={{ flexWrap: 'wrap' }}>
        {values.map((v, i) => (
          <Badge
            key={i}
            size="sm"
            variant="light"
            rightSection={
              <ActionIcon size={12} variant="transparent" onClick={() => onChange(values.filter((_, j) => j !== i))}>
                <Text size="xs">x</Text>
              </ActionIcon>
            }
          >
            {v}
          </Badge>
        ))}
      </Group>
      <TextInput size="xs" placeholder={placeholder} onKeyDown={handleAdd} />
    </Stack>
  );
}

function ListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  return (
    <Stack gap={4}>
      {values.map((v, i) => (
        <Group key={i} gap={4}>
          <TextInput
            size="xs"
            value={v}
            onChange={(e) => {
              const next = [...values];
              next[i] = e.currentTarget.value;
              onChange(next);
            }}
            style={{ flex: 1 }}
          />
          <Tooltip label="Remove">
            <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onChange(values.filter((_, j) => j !== i))}>
              <Text size="xs">x</Text>
            </ActionIcon>
          </Tooltip>
        </Group>
      ))}
      <TextInput
        size="xs"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const val = e.currentTarget.value.trim();
            if (val) {
              onChange([...values, val]);
              e.currentTarget.value = '';
            }
          }
        }}
      />
    </Stack>
  );
}
