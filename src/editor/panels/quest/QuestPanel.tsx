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
import { QuestDetail } from './QuestDetail';
import { generateUUID, shortId } from '../../utils';

// Note: Triggering other objectives is done via prerequisites (graph edges), not actions
export type ObjectiveActionType = 'moveNpc';

export interface MoveNpcAction {
  type: 'moveNpc';
  npcId: string;
  position: { x: number; y: number; z: number };
}

export type ObjectiveAction = MoveNpcAction;

export interface QuestObjective {
  id: string;
  type: 'talk' | 'voiceover' | 'location' | 'collect' | 'trigger' | 'custom';
  target: string;
  description: string;
  count?: number;
  optional?: boolean;
  completed?: boolean;
  dialogue?: string;
  completeOn?: 'dialogueEnd' | string;
  // Auto-start: fires automatically when available (at stage load or when prerequisites complete)
  autoStart?: boolean;
  onComplete?: ObjectiveAction[];
  // Graph structure - objective IDs that must complete before this one activates
  prerequisites?: string[];
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
      warnings.push(`Stage "${stage.id}" has no objectives`);
    }
    for (const obj of stage.objectives) {
      // Voiceovers don't need a target
      if (!obj.target && obj.type !== 'voiceover') {
        warnings.push(`Objective in stage "${stage.id}" has no target`);
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
  children: (result: QuestPanelResult) => ReactNode;
}

export function QuestPanel({
  quests,
  onQuestsChange,
  npcs = [],
  items = [],
  dialogues = [],
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
                    <Text size="xs" c="dimmed">
                      {quest.stages.length} stage{quest.stages.length !== 1 ? 's' : ''} ·{' '}
                      {shortId(quest.id)}
                    </Text>
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
