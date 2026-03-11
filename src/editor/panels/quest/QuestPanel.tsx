/**
 * QuestPanel - React/Mantine quest editor panel with stage flow visualization
 */

import { useState, ReactNode } from 'react';
import {
  Stack,
  TextInput,
  ScrollArea,
  Text,
  Group,
  Badge,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useEditorStore } from '../../store';
import { CompactIdDisplay } from '../../components';
import { QuestDetail } from './QuestDetail';
import { generateUUID } from '../../utils';
import type {
  BeatNodeType,
  NarrativeSubtype,
  ConditionOperator,
  ConditionExpression,
  ActionType,
  BeatAction,
} from '../../../engine/quests';

// Re-export engine types for other editor files
export type { BeatNodeType, NarrativeSubtype, ConditionOperator, ConditionExpression, ActionType, BeatAction };

// Legacy types (kept for backward compat)
export type ObjectiveActionType = 'moveNpc';

export interface MoveNpcAction {
  type: 'moveNpc';
  npcId: string;
  position: { x: number; y: number; z: number };
}

export type ObjectiveAction = MoveNpcAction;

export interface QuestObjectiveAgentContract {
  enabled?: boolean;
  deliveryModeId?: string;
  id?: string;
  npcId?: string;
  objective?: string;
  requiredFacts?: string[];
  forbiddenFacts?: string[];
  completionRule?: 'player_ack' | 'player_action' | 'engine_flag';
  completionTarget?: string;
  maxTurns?: number;
  fallbackScriptId?: string;
}

export interface QuestObjective {
  id: string;
  type: 'talk' | 'voiceover' | 'location' | 'collect' | 'trigger' | 'castSpell' | 'custom';
  target: string;
  description: string;
  count?: number;
  optional?: boolean;
  completed?: boolean;
  dialogue?: string;
  completeOn?: 'dialogueEnd' | string;
  autoStart?: boolean;
  onComplete?: BeatAction[];
  prerequisites?: string[];

  // Beat node type (ADR-016) - defaults to 'objective'
  nodeType?: BeatNodeType;

  // Actions fired on node enter (ADR-016)
  onEnter?: BeatAction[];

  // Narrative-specific (ADR-016)
  narrativeType?: NarrativeSubtype;
  voiceoverText?: string;
  dialogueId?: string;
  eventName?: string;

  // Condition/Branch-specific (ADR-016)
  condition?: ConditionExpression;
  failTargets?: string[];           // Node IDs activated on condition failure

  // Display control (ADR-016)
  showInHUD?: boolean;

  // SugarAgent contract authoring metadata (editor surface).
  // Runtime contracts are normalized into quest.agentBeatContracts.
  agentBeatContract?: QuestObjectiveAgentContract;
}

export interface QuestStage {
  id: string;
  description: string;
  objectives: QuestObjective[];
  next?: string;
  onComplete?: string;
  // Graph structure - explicit entry points (if omitted, objectives without prerequisites are entries)
  startObjectives?: string[];
  // Editor-only: node positions for visual graph editor
  objectivePositions?: Record<string, { x: number; y: number }>;
}

export interface QuestReward {
  type: 'item' | 'xp';
  itemId?: string;
  amount?: number;
}

export interface QuestEntry {
  id: string;
  name: string;
  description: string;
  startStage: string;
  stages: QuestStage[];
  rewards?: QuestReward[];
  episodeId?: string;
  agentBeatContracts?: {
    id: string;
    npcId: string;
    objective: string;
    requiredFacts: string[];
    forbiddenFacts?: string[];
    completionRule: 'player_ack' | 'player_action' | 'engine_flag';
    completionTarget?: string;
    maxTurns?: number;
    fallbackScriptId?: string;
    stageId?: string;
    objectiveId?: string;
  }[];
}

export interface QuestPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

/**
 * Validate a quest and return warnings
 */
export function validateQuest(quest: QuestEntry): string[] {
  const warnings: string[] = [];

  if (!quest.stages.find((s) => s.id === quest.startStage)) {
    warnings.push(`Start stage "${quest.startStage}" not found`);
  }

  for (const stage of quest.stages) {
    if (stage.next && !quest.stages.find((s) => s.id === stage.next)) {
      warnings.push(`Stage "${stage.id}" references non-existent stage "${stage.next}"`);
    }
    if (stage.objectives.length === 0) {
      warnings.push(`Stage "${stage.id}" has no nodes`);
    }

    const stageObjIds = new Set(stage.objectives.map((o) => o.id));

    for (const obj of stage.objectives) {
      const nodeType = obj.nodeType || 'objective';
      const label = `"${obj.description}" in stage "${stage.id}"`;

      // Objective validation
      if (nodeType === 'objective') {
        if (!obj.target && obj.type !== 'voiceover') {
          warnings.push(`Objective ${label} has no target`);
        }
        if (obj.agentBeatContract?.enabled === true && obj.type !== 'talk') {
          warnings.push(`Objective ${label} enables SugarAgent contract but is not Talk type`);
        }
        if (obj.agentBeatContract?.enabled === true && obj.type === 'talk' && obj.dialogue) {
          warnings.push(`Objective ${label} has both Talk Dialogue and Agent Contract enabled; choose one`);
        }
      }

      // Narrative validation
      if (nodeType === 'narrative') {
        const nt = obj.narrativeType || 'dialogue';
        if (nt === 'dialogue' && !obj.dialogueId) {
          warnings.push(`Narrative node ${label} has no dialogue selected`);
        }
      }

      // Condition validation
      if (nodeType === 'condition') {
        if (!obj.condition || !obj.condition.operand) {
          warnings.push(`Condition node ${label} has no operand`);
        }
      }

      // Prerequisite references
      if (obj.prerequisites) {
        for (const prereqId of obj.prerequisites) {
          if (!stageObjIds.has(prereqId)) {
            warnings.push(`Node ${label} references non-existent prerequisite "${prereqId}"`);
          }
        }
      }

      // Action validation (onEnter + onComplete)
      const allActions = [...(obj.onEnter || []), ...(obj.onComplete || [])];
      for (const action of allActions) {
        if (['setFlag', 'playSound', 'emitEvent', 'spawnVFX'].includes(action.type) && !action.target) {
          warnings.push(`${action.type} action on ${label} has no target`);
        }
        if (['giveItem', 'removeItem'].includes(action.type) && !action.target) {
          warnings.push(`${action.type} action on ${label} has no item selected`);
        }
        if (['moveNpc', 'teleportNPC', 'setNPCState'].includes(action.type) && !action.target && !action.npcId) {
          warnings.push(`${action.type} action on ${label} has no NPC selected`);
        }
      }
    }

    // Check for orphan nodes (not reachable from any entry point)
    if (stage.objectives.length > 1) {
      const entries = stage.objectives.filter(
        (o) => !o.prerequisites || o.prerequisites.length === 0
      );
      if (entries.length === 0) {
        warnings.push(`Stage "${stage.id}" has no entry nodes (all nodes have prerequisites)`);
      }

    }
  }

  if (Array.isArray(quest.agentBeatContracts) && quest.agentBeatContracts.length > 0) {
    const seenIds = new Set<string>();
    for (const contract of quest.agentBeatContracts) {
      if (!contract.id || contract.id.trim().length === 0) {
        warnings.push('A SugarAgent beat contract is missing an id');
        continue;
      }
      if (seenIds.has(contract.id)) {
        warnings.push(`Duplicate SugarAgent beat contract id "${contract.id}"`);
      }
      seenIds.add(contract.id);
      if (!contract.npcId || contract.npcId.trim().length === 0) {
        warnings.push(`Beat contract "${contract.id}" is missing npcId`);
      }
      if (!contract.objective || contract.objective.trim().length === 0) {
        warnings.push(`Beat contract "${contract.id}" is missing objective text`);
      }
      if (!Array.isArray(contract.requiredFacts) || contract.requiredFacts.length === 0) {
        warnings.push(`Beat contract "${contract.id}" must include at least one required fact`);
      }
    }
  }

  return warnings;
}

interface QuestPanelProps {
  quests: QuestEntry[];
  onQuestsChange: (quests: QuestEntry[]) => void;
  npcs?: { id: string; name: string }[];
  items?: { id: string; name: string }[];
  dialogues?: { id: string; name: string }[];
  triggers?: { id: string; name: string }[];
  spells?: { id: string; name: string }[];
  children: (result: QuestPanelResult) => ReactNode;
}

export function QuestPanel({
  quests,
  onQuestsChange,
  npcs = [],
  items = [],
  dialogues = [],
  triggers = [],
  spells = [],
  children,
}: QuestPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);
  const currentEpisodeId = useEditorStore((s) => s.currentEpisodeId);

  const selectedQuest = selectedId ? quests.find((q) => q.id === selectedId) : null;

  const filteredQuests = quests.filter(
    (quest) =>
      quest.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quest.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    const id = generateUUID();
    const newQuest: QuestEntry = {
      id,
      name: 'New Quest',
      description: 'Quest description...',
      startStage: 'start',
      stages: [
        {
          id: 'start',
          description: 'First stage',
          objectives: [
            {
              id: 'obj-1',
              type: 'talk',
              target: '',
              description: 'Talk to someone',
            },
          ],
        },
      ],
      episodeId: currentEpisodeId || undefined,
    };
    onQuestsChange([...quests, newQuest]);
    setSelectedId(id);
    setDirty(true);
  };

  const handleUpdate = (updated: QuestEntry) => {
    onQuestsChange(quests.map((q) => (q.id === updated.id ? updated : q)));
    setDirty(true);
  };

  const handleDelete = (id: string) => {
    onQuestsChange(quests.filter((q) => q.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  };

  const result: QuestPanelResult = {
    // Entry list (left panel)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Quests ({quests.length})
          </Text>
          <Tooltip label="Create Quest">
            <ActionIcon variant="subtle" onClick={handleCreate}>
              +
            </ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search quests..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredQuests.map((quest) => {
              const warnings = validateQuest(quest);
              return (
                <Group
                  key={quest.id}
                  p="xs"
                  gap="xs"
                  style={{
                    background: selectedId === quest.id ? 'var(--mantine-color-dark-6)' : undefined,
                    borderRadius: 'var(--mantine-radius-sm)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedId(quest.id)}
                >
                  <Text size="lg">📜</Text>
                  <Stack gap={0} style={{ flex: 1 }}>
                    <Text size="sm" fw={500}>
                      {quest.name}
                    </Text>
                    <Group gap={6} wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        {quest.stages.length} stage{quest.stages.length !== 1 ? 's' : ''}
                      </Text>
                      <Text size="xs" c="dimmed">·</Text>
                      <CompactIdDisplay value={quest.id} />
                    </Group>
                  </Stack>
                  {warnings.length > 0 && (
                    <Badge size="xs" color="red">
                      {warnings.length}
                    </Badge>
                  )}
                </Group>
              );
            })}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Main content (center panel)
    content: selectedQuest ? (
      <QuestDetail
        quest={selectedQuest}
        npcs={npcs}
        items={items}
        dialogues={dialogues}
        triggers={triggers}
        spells={spells}
        onChange={handleUpdate}
        onDelete={() => handleDelete(selectedQuest.id)}
      />
    ) : (
      <Stack align="center" justify="center" h="100%" gap="md">
        <Text size="xl">📜</Text>
        <Text c="dimmed">Select a quest to edit</Text>
        <Text size="sm" c="dimmed" ta="center" maw={300}>
          Choose a quest from the list on the left, or create a new one with the + button.
        </Text>
      </Stack>
    ),

    // Inspector (right panel) - properties now in main content
    inspector: null,
  };

  return <>{children(result)}</>;
}
