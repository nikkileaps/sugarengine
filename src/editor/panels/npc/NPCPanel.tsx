/**
 * NPCPanel - React/Mantine NPC editor panel
 */

import { useState, ReactNode } from 'react';
import type { BTNode } from '../../../engine/behavior/types';
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
import { NPCDetail } from './NPCDetail';
import { generateUUID, shortId } from '../../utils';

export interface NPCEntry {
  id: string;
  name: string;
  portrait?: string;
  description?: string;
  defaultDialogue?: string;
  faction?: string;
  behaviorTree?: BTNode;
  behaviorMode?: 'onInteraction' | 'continuous';
  interactionMode?: 'scripted' | 'agent' | 'hybrid';
  agentProfile?: {
    persona?: string;
    tone?: string;
    constraints?: string[];
    safetyBounds?: string[]; // Legacy alias, accepted for backward compatibility.
    loreScopes?: string[];
    selfEntityId?: string;
    selfLoreScopes?: string[];
    relatedLoreScopes?: string[];
  };
  model?: string;
  modelHeight?: number;
  animations?: Record<string, string>;
}

export interface NPCPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface NPCPanelProps {
  npcs: NPCEntry[];
  onNPCsChange: (npcs: NPCEntry[]) => void;
  dialogues?: { id: string; name?: string; nodes?: { speaker?: string }[] }[];
  quests?: { id: string; name: string; stages: { id: string; description: string; objectives: { id: string; type: string; target: string; description: string }[] }[] }[];
  items?: { id: string; name: string }[];
  children: (result: NPCPanelResult) => ReactNode;
}

export function NPCPanel({ npcs, onNPCsChange, dialogues = [], quests = [], items = [], children }: NPCPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);

  const selectedNPC = selectedId ? npcs.find((n) => n.id === selectedId) : null;

  const filteredNPCs = npcs.filter((npc) =>
    npc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    npc.faction?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const validateNPC = (npc: NPCEntry): string[] => {
    const warnings: string[] = [];
    if (!npc.defaultDialogue) {
      warnings.push('No default dialogue assigned');
    } else if (dialogues.length > 0 && !dialogues.some((d) => d.id === npc.defaultDialogue)) {
      warnings.push(`Default dialogue "${npc.defaultDialogue}" not found`);
    }

    const usesSugarAgent = npc.interactionMode === 'agent' || npc.interactionMode === 'hybrid';
    const profile = npc.agentProfile;
    const selfEntityId = typeof profile?.selfEntityId === 'string' ? profile.selfEntityId.trim() : '';
    const loreScopesCount = Array.isArray(profile?.loreScopes) ? profile.loreScopes.filter(Boolean).length : 0;
    const selfScopesCount = Array.isArray(profile?.selfLoreScopes) ? profile.selfLoreScopes.filter(Boolean).length : 0;
    const relatedScopesCount = Array.isArray(profile?.relatedLoreScopes) ? profile.relatedLoreScopes.filter(Boolean).length : 0;
    const totalScopeCount = loreScopesCount + selfScopesCount + relatedScopesCount;

    if (usesSugarAgent && !selfEntityId) {
      warnings.push('Agent mode: missing self entity id');
    }
    if (usesSugarAgent && selfEntityId && (selfScopesCount + loreScopesCount) === 0) {
      warnings.push('Agent mode: no self lore scopes configured');
    }
    if (usesSugarAgent && relatedScopesCount > 0 && !selfEntityId) {
      warnings.push('Agent mode: related scopes set without self entity id');
    }
    if ((selfEntityId || selfScopesCount > 0 || relatedScopesCount > 0) && totalScopeCount === 0) {
      warnings.push('Identity fields set but no lore scopes configured');
    }
    return warnings;
  };

  const handleCreate = () => {
    const id = generateUUID();
    const newNPC: NPCEntry = { id, name: 'New NPC' };
    onNPCsChange([...npcs, newNPC]);
    setSelectedId(id);
    setDirty(true);
  };

  const handleUpdate = (updated: NPCEntry) => {
    onNPCsChange(npcs.map((n) => (n.id === updated.id ? updated : n)));
    setDirty(true);
  };

  const handleDelete = (id: string) => {
    onNPCsChange(npcs.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  };

  const result: NPCPanelResult = {
    // Entry list (left panel)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>NPCs ({npcs.length})</Text>
          <Tooltip label="Create NPC">
            <ActionIcon variant="subtle" onClick={handleCreate}>+</ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search NPCs..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredNPCs.map((npc) => {
              const warnings = validateNPC(npc);
              return (
                <Group
                  key={npc.id}
                  p="xs"
                  gap="xs"
                  style={{
                    background: selectedId === npc.id ? 'var(--mantine-color-dark-6)' : undefined,
                    borderRadius: 'var(--mantine-radius-sm)',
                    cursor: 'pointer',
                  }}
                  onClick={() => setSelectedId(npc.id)}
                >
                  <Text size="lg">👤</Text>
                  <Stack gap={0} style={{ flex: 1 }}>
                    <Text size="sm" fw={500}>{npc.name}</Text>
                    <Text size="xs" c="dimmed">
                      {npc.faction ? `${npc.faction} · ` : ''}{shortId(npc.id)}
                    </Text>
                  </Stack>
                  {warnings.length > 0 && (
                    <Badge size="xs" color="red">{warnings.length}</Badge>
                  )}
                </Group>
              );
            })}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Main content (center panel)
    content: selectedNPC ? (
      <NPCDetail
        npc={selectedNPC}
        dialogues={dialogues}
        quests={quests}
        items={items}
        onChange={handleUpdate}
        onDelete={() => handleDelete(selectedNPC.id)}
      />
    ) : (
      <Stack align="center" justify="center" h="100%" gap="md">
        <Text size="xl">👤</Text>
        <Text c="dimmed">Select an NPC to edit</Text>
        <Text size="sm" c="dimmed" ta="center" maw={300}>
          Choose an NPC from the list on the left, or create a new one with the + button.
        </Text>
      </Stack>
    ),

    // Inspector (right panel) - properties now in main content
    inspector: null,
  };

  return <>{children(result)}</>;
}
