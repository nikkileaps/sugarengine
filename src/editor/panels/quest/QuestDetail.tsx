/**
 * QuestDetail - Stage flow visualization and quest details
 */

import { useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Badge,
  Button,
  Paper,
  ScrollArea,
  Box,
  TextInput,
  Textarea,
} from '@mantine/core';
import { QuestEntry, QuestStage, QuestObjective, validateQuest } from './QuestPanel';
import { ObjectiveModal } from './ObjectiveModal';
import { ObjectiveNodeCanvas } from './ObjectiveNodeCanvas';
import { generateUUID } from '../../utils';

interface QuestDetailProps {
  quest: QuestEntry;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  dialogues: { id: string; name: string }[];
  onChange: (quest: QuestEntry) => void;
  onDelete: () => void;
}

const OBJECTIVE_ICONS: Record<string, string> = {
  talk: '💬',
  voiceover: '🎤',
  location: '📍',
  collect: '📦',
  trigger: '⚡',
  custom: '⭐',
};

export function QuestDetail({
  quest,
  npcs,
  items,
  dialogues,
  onChange,
  onDelete,
}: QuestDetailProps) {
  // Store only IDs - derive actual objects from quest data (source of truth)
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<{
    stageId: string;
    objectiveId: string;
  } | null>(null);

  // Track which stage is expanded in graph view
  const [graphStageId, setGraphStageId] = useState<string | null>(null);

  // Derive actual stage and objective from quest data
  const selectedStage = selectedObjectiveId
    ? quest.stages.find((s) => s.id === selectedObjectiveId.stageId) ?? null
    : null;
  const selectedObjective = selectedStage && selectedObjectiveId
    ? selectedStage.objectives.find((o) => o.id === selectedObjectiveId.objectiveId) ?? null
    : null;

  const handleChange = <K extends keyof QuestEntry>(field: K, value: QuestEntry[K]) => {
    onChange({ ...quest, [field]: value });
  };

  // Build stage order starting from startStage
  const getStageOrder = (): QuestStage[] => {
    const stageMap = new Map<string, QuestStage>();
    for (const stage of quest.stages) {
      stageMap.set(stage.id, stage);
    }

    const ordered: QuestStage[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = quest.startStage;

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const stage = stageMap.get(currentId);
      if (stage) {
        ordered.push(stage);
        currentId = stage.next;
      } else {
        break;
      }
    }

    for (const stage of quest.stages) {
      if (!visited.has(stage.id)) {
        ordered.push(stage);
      }
    }

    return ordered;
  };

  const handleAddStage = () => {
    const stageId = generateUUID();
    const newStage: QuestStage = {
      id: stageId,
      description: 'New stage',
      objectives: [],
    };

    const updatedStages = [...quest.stages];
    if (updatedStages.length > 0) {
      const lastStage = updatedStages[updatedStages.length - 1]!;
      if (!lastStage.onComplete) {
        lastStage.next = stageId;
      }
    }

    updatedStages.push(newStage);
    onChange({ ...quest, stages: updatedStages });
  };

  const handleAddObjective = (stageId: string) => {
    const objId = generateUUID();
    const newObj: QuestObjective = {
      id: objId,
      type: 'talk',
      target: '',
      description: 'New objective',
    };

    const updatedStages = quest.stages.map((s) =>
      s.id === stageId ? { ...s, objectives: [...s.objectives, newObj] } : s
    );
    onChange({ ...quest, stages: updatedStages });

    // Just set the IDs - the actual objects will be derived from quest data
    setSelectedObjectiveId({ stageId, objectiveId: objId });
  };

  const handleObjectiveUpdate = (stageId: string, objective: QuestObjective) => {
    const updatedStages = quest.stages.map((s) =>
      s.id === stageId
        ? { ...s, objectives: s.objectives.map((o) => (o.id === objective.id ? objective : o)) }
        : s
    );
    onChange({ ...quest, stages: updatedStages });
    // No need to update local state - selectedObjective is derived from quest data
  };

  const handleObjectiveDelete = (stageId: string, objectiveId: string) => {
    const updatedStages = quest.stages.map((s) =>
      s.id === stageId
        ? { ...s, objectives: s.objectives.filter((o) => o.id !== objectiveId) }
        : s
    );
    onChange({ ...quest, stages: updatedStages });
    setSelectedObjectiveId(null);
  };

  const handleStageChange = (updatedStage: QuestStage) => {
    const updatedStages = quest.stages.map((s) =>
      s.id === updatedStage.id ? updatedStage : s
    );
    onChange({ ...quest, stages: updatedStages });
  };

  const stageOrder = getStageOrder();

  // If a stage is in graph view, show the graph editor
  const graphStage = graphStageId ? quest.stages.find((s) => s.id === graphStageId) : null;
  if (graphStage) {
    return (
      <ObjectiveNodeCanvas
        stage={graphStage}
        npcs={npcs}
        items={items}
        dialogues={dialogues}
        onStageChange={handleStageChange}
        onClose={() => setGraphStageId(null)}
      />
    );
  }
  const warnings = validateQuest(quest);

  return (
    <Stack gap={0} h="100%">
      {/* Header Card */}
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
                border: '2px solid #89b4fa',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
              }}
            >
              📜
            </Box>
            <Stack gap={4}>
              <TextInput
                value={quest.name}
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
                <Badge size="sm" variant="light" color="blue">
                  {quest.stages.length} stages
                </Badge>
                <Text size="xs" c="dimmed" ff="monospace">
                  {quest.id.slice(0, 8)}
                </Text>
              </Group>
            </Stack>
          </Group>

          <Group gap="xs">
            <Button variant="subtle" size="xs" onClick={handleAddStage}>
              + Add Stage
            </Button>
            <Button color="red" variant="subtle" size="xs" onClick={onDelete}>
              Delete
            </Button>
          </Group>
        </Group>

        {/* Description inline */}
        <Textarea
          value={quest.description}
          onChange={(e) => handleChange('description', e.currentTarget.value)}
          placeholder="Quest description..."
          variant="unstyled"
          mt="md"
          minRows={1}
          autosize
          styles={{
            input: {
              color: '#a6adc8',
              fontSize: 14,
              padding: 0,
              '&::placeholder': { color: '#6c7086' },
            },
          }}
        />
      </Paper>

      {/* Stage Flow */}
      <ScrollArea style={{ flex: 1 }} p="lg">
        <Stack gap="md">
          {/* Stage Cards */}
          <Group gap="lg" wrap="nowrap" pb="md">
            {stageOrder.map((stage, i) => {
              const isStart = stage.id === quest.startStage;
              return (
                <Group key={stage.id} gap="lg" wrap="nowrap">
                  <Paper
                    radius="md"
                    style={{
                      minWidth: 280,
                      maxWidth: 320,
                      background: '#181825',
                      border: `2px solid ${isStart ? '#a6e3a1' : '#313244'}`,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header */}
                    <Box
                      p="sm"
                      style={{
                        background: isStart ? '#a6e3a122' : '#313244',
                      }}
                    >
                      <Group gap="xs" justify="space-between">
                        <Group gap="xs">
                          {isStart && (
                            <Text size="xs" c="green">▶</Text>
                          )}
                          <Text size="sm" fw={600} c={isStart ? 'green' : undefined}>
                            Stage {i + 1}: {stage.id}
                          </Text>
                        </Group>
                        <Button
                          size="xs"
                          variant="subtle"
                          color="blue"
                          onClick={() => setGraphStageId(stage.id)}
                          styles={{ root: { padding: '2px 6px' } }}
                        >
                          Graph
                        </Button>
                      </Group>
                    </Box>

                    {/* Description */}
                    <Box p="sm" style={{ borderBottom: '1px solid #313244' }}>
                      <TextInput
                        value={stage.description}
                        onChange={(e) => {
                          const updatedStages = quest.stages.map((s) =>
                            s.id === stage.id ? { ...s, description: e.currentTarget.value } : s
                          );
                          onChange({ ...quest, stages: updatedStages });
                        }}
                        variant="unstyled"
                        placeholder="Stage description..."
                        styles={{
                          input: {
                            color: '#a6adc8',
                            fontSize: 14,
                            padding: 0,
                            minHeight: 'auto',
                          },
                        }}
                      />
                    </Box>

                    {/* Objectives */}
                    <Box p="sm">
                      <Text size="xs" c="dimmed" tt="uppercase" mb="xs">
                        Objectives
                      </Text>
                      <Stack gap="xs">
                        {stage.objectives.map((obj) => (
                          <Paper
                            key={obj.id}
                            p="xs"
                            radius="sm"
                            style={{
                              background: '#1e1e2e',
                              cursor: 'pointer',
                            }}
                            onClick={() => setSelectedObjectiveId({ stageId: stage.id, objectiveId: obj.id })}
                          >
                            <Group gap="xs" wrap="nowrap">
                              <Text size="sm">{OBJECTIVE_ICONS[obj.type] || '⭐'}</Text>
                              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                                <Text size="xs" truncate>{obj.description}</Text>
                                <Text size="xs" c="dimmed">
                                  {obj.type}: {obj.target || '(no target)'}
                                </Text>
                              </Stack>
                              {obj.optional && (
                                <Badge
                                  size="xs"
                                  variant="light"
                                  style={{ background: '#f9e2af22', color: '#f9e2af' }}
                                >
                                  OPT
                                </Badge>
                              )}
                            </Group>
                          </Paper>
                        ))}
                        <Button
                          variant="subtle"
                          size="xs"
                          color="gray"
                          fullWidth
                          style={{ border: '1px dashed #313244' }}
                          onClick={() => handleAddObjective(stage.id)}
                        >
                          + Add Objective
                        </Button>
                      </Stack>
                    </Box>

                    {/* Next stage indicator */}
                    {stage.next && (
                      <Box p="xs" style={{ background: '#313244' }}>
                        <Text size="xs" c="dimmed">Next → {stage.next}</Text>
                      </Box>
                    )}
                    {stage.onComplete && (
                      <Box p="xs" style={{ background: '#a6e3a122' }}>
                        <Text size="xs" c="green">
                          ✓ Completes quest ({stage.onComplete})
                        </Text>
                      </Box>
                    )}
                  </Paper>

                  {/* Arrow between stages */}
                  {i < stageOrder.length - 1 && (
                    <Text size="xl" c="dimmed">→</Text>
                  )}
                </Group>
              );
            })}
          </Group>

          {/* Rewards */}
          {quest.rewards && quest.rewards.length > 0 && (
            <Paper
              p="md"
              radius="md"
              style={{ background: '#181825', border: '1px solid #313244' }}
            >
              <Group gap="xs" mb="sm">
                <Text size="sm">🎁</Text>
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Rewards
                </Text>
              </Group>
              <Stack gap="xs">
                {quest.rewards.map((reward, i) => (
                  <Text key={i} size="sm" c="dimmed">
                    {reward.type === 'xp'
                      ? `+${reward.amount} XP`
                      : `Item: ${reward.itemId} x${reward.amount ?? 1}`}
                  </Text>
                ))}
              </Stack>
            </Paper>
          )}

          {/* Validation warnings */}
          {warnings.length > 0 && (
            <Paper
              p="md"
              radius="md"
              style={{ background: '#f38ba822', border: '1px solid #f38ba8' }}
            >
              <Text size="sm" fw={500} c="red" mb="xs">
                ⚠ Validation Warnings
              </Text>
              <Stack gap="xs">
                {warnings.map((warning, i) => (
                  <Text key={i} size="sm" c="red">• {warning}</Text>
                ))}
              </Stack>
            </Paper>
          )}
        </Stack>
      </ScrollArea>

      {/* Objective Modal */}
      <ObjectiveModal
        opened={selectedObjectiveId !== null && selectedObjective !== null}
        onClose={() => setSelectedObjectiveId(null)}
        stage={selectedStage}
        objective={selectedObjective}
        npcs={npcs}
        items={items}
        dialogues={dialogues}
        onUpdate={(obj) => {
          if (selectedObjectiveId) {
            handleObjectiveUpdate(selectedObjectiveId.stageId, obj);
          }
        }}
        onDelete={() => {
          if (selectedObjectiveId) {
            handleObjectiveDelete(selectedObjectiveId.stageId, selectedObjectiveId.objectiveId);
          }
        }}
      />
    </Stack>
  );
}
