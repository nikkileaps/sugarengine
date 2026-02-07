/**
 * QuestDetail - Stage flow visualization and quest details
 */

import { useState, useMemo } from 'react';
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
  Tooltip,
  Modal,
  Select,
  Switch,
} from '@mantine/core';
import { QuestEntry, QuestStage, QuestObjective, validateQuest } from './QuestPanel';
import { ObjectiveNodeCanvas } from './ObjectiveNodeCanvas';
import { ObjectiveGraph } from '../../../engine/quests';
import { generateUUID } from '../../utils';

interface QuestDetailProps {
  quest: QuestEntry;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  dialogues: { id: string; name: string }[];
  triggers: { id: string; name: string }[];
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

const OBJECTIVE_COLORS: Record<string, string> = {
  talk: '#89b4fa',
  voiceover: '#cba6f7',
  location: '#a6e3a1',
  collect: '#f9e2af',
  trigger: '#fab387',
  custom: '#f5c2e7',
};

/**
 * Mini graph visualization of objectives within a stage
 */
function MiniObjectiveGraph({
  stage,
  onClick,
}: {
  stage: QuestStage;
  onClick: () => void;
}) {
  const layout = useMemo(() => {
    if (stage.objectives.length === 0) {
      return { nodes: [], edges: [], width: 0, height: 0 };
    }

    const graph = ObjectiveGraph.fromObjectives(stage.objectives);
    const depths = graph.computeDepths();

    // Group objectives by depth
    const depthGroups = new Map<number, QuestObjective[]>();
    let maxDepth = 0;
    for (const obj of stage.objectives) {
      const depth = depths.get(obj.id) ?? 0;
      maxDepth = Math.max(maxDepth, depth);
      const group = depthGroups.get(depth) ?? [];
      group.push(obj);
      depthGroups.set(depth, group);
    }

    // Layout constants for mini view
    const nodeSize = 24;
    const spacingX = 40;
    const spacingY = 32;
    const paddingX = 16;
    const paddingY = 12;

    // Calculate positions
    const nodePositions = new Map<string, { x: number; y: number; obj: QuestObjective }>();
    let maxLanes = 0;

    for (let depth = 0; depth <= maxDepth; depth++) {
      const group = depthGroups.get(depth) ?? [];
      maxLanes = Math.max(maxLanes, group.length);
      group.forEach((obj, lane) => {
        nodePositions.set(obj.id, {
          x: paddingX + depth * spacingX + nodeSize / 2,
          y: paddingY + lane * spacingY + nodeSize / 2,
          obj,
        });
      });
    }

    // Build edges
    const edges: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    for (const obj of stage.objectives) {
      if (obj.prerequisites) {
        const toPos = nodePositions.get(obj.id);
        for (const prereqId of obj.prerequisites) {
          const fromPos = nodePositions.get(prereqId);
          if (fromPos && toPos) {
            edges.push({
              from: { x: fromPos.x, y: fromPos.y },
              to: { x: toPos.x, y: toPos.y },
            });
          }
        }
      }
    }

    const width = paddingX * 2 + maxDepth * spacingX + nodeSize;
    const height = paddingY * 2 + (maxLanes - 1) * spacingY + nodeSize;

    return {
      nodes: Array.from(nodePositions.values()),
      edges,
      width: Math.max(width, 80),
      height: Math.max(height, 48),
      nodeSize,
    };
  }, [stage.objectives]);

  if (stage.objectives.length === 0) {
    return (
      <Box
        onClick={onClick}
        style={{
          padding: '16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: '#1e1e2e',
          borderRadius: 6,
          border: '1px dashed #313244',
        }}
      >
        <Text size="xs" c="dimmed">No objectives</Text>
        <Text size="xs" c="blue" mt={4}>Click to add →</Text>
      </Box>
    );
  }

  return (
    <Box
      onClick={onClick}
      style={{
        cursor: 'pointer',
        background: '#1e1e2e',
        borderRadius: 6,
        padding: 4,
        transition: 'background 0.15s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = '#252536')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#1e1e2e')}
    >
      <svg
        width={layout.width}
        height={layout.height}
        style={{ display: 'block' }}
      >
        {/* Edges */}
        {layout.edges.map((edge, i) => (
          <line
            key={i}
            x1={edge.from.x}
            y1={edge.from.y}
            x2={edge.to.x}
            y2={edge.to.y}
            stroke="#89b4fa"
            strokeWidth={2}
            strokeOpacity={0.5}
          />
        ))}
        {/* Nodes */}
        {layout.nodes.map(({ x, y, obj }) => {
          const nt = obj.nodeType || 'objective';
          const fillColor = nt === 'narrative' ? '#cba6f7'
            : nt === 'condition' ? '#f9e2af'
            : (OBJECTIVE_COLORS[obj.type] || '#89b4fa');
          const icon = nt === 'narrative' ? 'N'
            : nt === 'condition' ? '?'
            : (OBJECTIVE_ICONS[obj.type] || '⭐');
          const strokeColor = obj.autoStart ? '#a6e3a1' : 'none';
          const r = layout.nodeSize! / 2;

          return (
            <Tooltip
              key={obj.id}
              label={`${icon} ${obj.description}`}
              position="top"
              withArrow
            >
              <g>
                {nt === 'condition' ? (
                  <rect
                    x={x - r * 0.7}
                    y={y - r * 0.7}
                    width={r * 1.4}
                    height={r * 1.4}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2}
                    transform={`rotate(45 ${x} ${y})`}
                    rx={2}
                  />
                ) : (
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={2}
                  />
                )}
                {obj.optional && (
                  <circle
                    cx={x}
                    cy={y}
                    r={r - 3}
                    fill="none"
                    stroke="#f9e2af"
                    strokeWidth={1}
                    strokeDasharray="2,2"
                  />
                )}
              </g>
            </Tooltip>
          );
        })}
      </svg>
      <Text size="xs" c="dimmed" ta="center" mt={4}>
        {stage.objectives.length} node{stage.objectives.length !== 1 ? 's' : ''} • Click to edit
      </Text>
    </Box>
  );
}

export function QuestDetail({
  quest,
  npcs,
  items,
  dialogues,
  triggers,
  onChange,
  onDelete,
}: QuestDetailProps) {
  // Track which stage is expanded in graph view
  const [graphStageId, setGraphStageId] = useState<string | null>(null);
  // Track which stage is being edited in the modal
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const editingStage = editingStageId ? quest.stages.find(s => s.id === editingStageId) : null;

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

  const handleStageChange = (updatedStage: QuestStage) => {
    const updatedStages = quest.stages.map((s) =>
      s.id === updatedStage.id ? updatedStage : s
    );
    onChange({ ...quest, stages: updatedStages });
  };

  const handleDeleteStage = (stageId: string) => {
    // Remove the stage
    const updatedStages = quest.stages.filter(s => s.id !== stageId);

    // Update any stages that pointed to this one
    for (const stage of updatedStages) {
      if (stage.next === stageId) {
        stage.next = undefined;
      }
    }

    // Update startStage if needed
    let newStartStage = quest.startStage;
    if (quest.startStage === stageId) {
      newStartStage = updatedStages[0]?.id ?? '';
    }

    onChange({ ...quest, stages: updatedStages, startStage: newStartStage });
    setEditingStageId(null);
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
        triggers={triggers}
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
                    {/* Header - clickable to edit stage */}
                    <Box
                      p="sm"
                      style={{
                        background: isStart ? '#a6e3a122' : '#313244',
                        cursor: 'pointer',
                        transition: 'filter 0.15s',
                      }}
                      onClick={() => setEditingStageId(stage.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.1)')}
                      onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
                    >
                      <Group gap="xs">
                        {isStart && (
                          <Text size="xs" c="green">▶</Text>
                        )}
                        <Text size="sm" fw={600} c={isStart ? 'green' : undefined}>
                          Stage {i + 1}
                        </Text>
                      </Group>
                      {stage.description && (
                        <Text size="xs" c="dimmed" mt={4} lineClamp={1}>
                          {stage.description}
                        </Text>
                      )}
                    </Box>

                    {/* Mini Objective Graph */}
                    <Box p="sm">
                      <MiniObjectiveGraph
                        stage={stage}
                        onClick={() => setGraphStageId(stage.id)}
                      />
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

      {/* Stage Edit Modal */}
      <Modal
        opened={editingStageId !== null && editingStage !== null}
        onClose={() => setEditingStageId(null)}
        title="Edit Stage"
        centered
        styles={{
          header: { background: '#1e1e2e', borderBottom: '1px solid #313244' },
          title: { color: '#cdd6f4', fontWeight: 600 },
          body: { background: '#1e1e2e', padding: '20px' },
          content: { background: '#1e1e2e' },
          close: { color: '#6c7086', '&:hover': { background: '#313244' } },
        }}
      >
        {editingStage && (
          <Stack gap="md">
            <TextInput
              label="Description"
              value={editingStage.description}
              onChange={(e) => handleStageChange({ ...editingStage, description: e.currentTarget.value })}
              placeholder="What happens in this stage?"
              styles={{
                input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
                label: { color: '#a6adc8' },
              }}
            />

            <Switch
              label="Start Stage"
              description="This is the first stage of the quest"
              checked={quest.startStage === editingStage.id}
              onChange={(e) => {
                if (e.currentTarget.checked) {
                  onChange({ ...quest, startStage: editingStage.id });
                }
              }}
              styles={{
                label: { color: '#cdd6f4' },
                description: { color: '#6c7086' },
              }}
            />

            <Select
              label="Next Stage"
              description="Stage to advance to when this one completes"
              data={[
                { value: '', label: '(None - quest ends or branches)' },
                ...quest.stages
                  .filter(s => s.id !== editingStage.id)
                  .map(s => ({ value: s.id, label: s.description || s.id })),
              ]}
              value={editingStage.next || ''}
              onChange={(value) => handleStageChange({ ...editingStage, next: value || undefined })}
              clearable
              styles={{
                input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
                label: { color: '#a6adc8' },
                description: { color: '#6c7086' },
              }}
            />

            <Select
              label="On Complete"
              description="Action when all objectives are completed"
              data={[
                { value: '', label: '(Advance to next stage)' },
                { value: 'completeQuest', label: 'Complete Quest' },
              ]}
              value={editingStage.onComplete || ''}
              onChange={(value) => handleStageChange({ ...editingStage, onComplete: value || undefined })}
              clearable
              styles={{
                input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
                label: { color: '#a6adc8' },
                description: { color: '#6c7086' },
              }}
            />

            <Group justify="space-between" mt="xl">
              <Button
                variant="subtle"
                color="red"
                onClick={() => {
                  if (confirm('Delete this stage? This cannot be undone.')) {
                    handleDeleteStage(editingStage.id);
                  }
                }}
              >
                Delete Stage
              </Button>
              <Button onClick={() => setEditingStageId(null)}>Done</Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
