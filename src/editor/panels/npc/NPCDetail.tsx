/**
 * NPCDetail - Main content view for a selected NPC
 */

import { useEffect, useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Badge,
  Button,
  Paper,
  TextInput,
  NumberInput,
  Textarea,
  Select,
  Box,
  ScrollArea,
  Avatar,
} from '@mantine/core';
import { useEditorStore } from '../../store/useEditorStore';
import { NPCEntry } from './NPCPanel';
import { BehaviorTreeCanvas } from './BehaviorTreeCanvas';

const ANIM_SLOTS = ['idle', 'walk', 'run', 'jump'] as const;

interface NPCDetailProps {
  npc: NPCEntry;
  dialogues: { id: string; name?: string; nodes?: { speaker?: string }[] }[];
  quests: { id: string; name: string; stages: { id: string; description: string; objectives: { id: string; type: string; target: string; description: string }[] }[] }[];
  items?: { id: string; name: string }[];
  onChange: (updated: NPCEntry) => void;
  onDelete: () => void;
}

export function NPCDetail({ npc, dialogues, quests, items = [], onChange, onDelete }: NPCDetailProps) {
  const setDirty = useEditorStore((s) => s.setDirty);
  const [showBehaviorTree, setShowBehaviorTree] = useState(false);
  const [agentConstraintsDraft, setAgentConstraintsDraft] = useState('');
  const [agentLoreScopesDraft, setAgentLoreScopesDraft] = useState('');
  const [agentSelfLoreScopesDraft, setAgentSelfLoreScopesDraft] = useState('');
  const [agentRelatedLoreScopesDraft, setAgentRelatedLoreScopesDraft] = useState('');
  const [availableLoreScopes, setAvailableLoreScopes] = useState<Set<string> | null>(null);

  // Fetch available lore scopes for validation
  useEffect(() => {
    let cancelled = false;
    fetch('/__sugaragent/runtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op: 'listLoreScopes' }),
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data?.scopes) {
          setAvailableLoreScopes(new Set(data.scopes));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const validateScope = (scope: string): boolean => {
    if (!availableLoreScopes) return true; // Not loaded yet, don't warn
    const normalized = scope.trim().toLowerCase();
    if (!normalized) return true;
    const withoutPrefix = normalized.startsWith('lore.') ? normalized.slice(5) : normalized;
    // Check direct match or prefix match
    if (availableLoreScopes.has(normalized) || availableLoreScopes.has(withoutPrefix)) return true;
    for (const available of availableLoreScopes) {
      if (available.startsWith(`${withoutPrefix}.`) || available.endsWith(`.${withoutPrefix}`)) return true;
    }
    return false;
  };

  const getUnmatchedScopes = (draft: string): string[] => {
    if (!availableLoreScopes) return [];
    return draft
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !validateScope(s));
  };

  // Find dialogues where this NPC speaks
  const npcDialogues = dialogues.filter((d) =>
    d.nodes?.some((node) => node.speaker === npc.id)
  );

  // Find quests involving this NPC
  const npcQuests = quests.filter((q) =>
    q.stages.some((stage) =>
      stage.objectives.some((obj) => obj.target === npc.id)
    )
  );

  const dialogueOptions = dialogues.map((d) => ({
    value: d.id,
    label: d.name || d.id,
  }));

  useEffect(() => {
    const initialConstraints = (
      npc.agentProfile?.constraints
      || npc.agentProfile?.safetyBounds
      || []
    ).join('\n');
    const initialLoreScopes = (npc.agentProfile?.loreScopes || []).join('\n');
    const initialSelfLoreScopes = (npc.agentProfile?.selfLoreScopes || []).join('\n');
    const initialRelatedLoreScopes = (npc.agentProfile?.relatedLoreScopes || []).join('\n');
    setAgentConstraintsDraft(initialConstraints);
    setAgentLoreScopesDraft(initialLoreScopes);
    setAgentSelfLoreScopesDraft(initialSelfLoreScopes);
    setAgentRelatedLoreScopesDraft(initialRelatedLoreScopes);
  }, [npc.id]);

  const handleChange = (field: keyof NPCEntry, value: string | null) => {
    onChange({ ...npc, [field]: value || undefined });
  };

  const parseList = (value: string): string[] => (
    value
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
  );

  const normalizeOptionalText = (value: string | undefined): string | undefined => {
    if (typeof value !== 'string') return undefined;
    return value.trim().length === 0 ? undefined : value;
  };

  const updateAgentProfile = (updates: Partial<NonNullable<NPCEntry['agentProfile']>>) => {
    const current = npc.agentProfile ?? {};
    const currentConstraints = Array.isArray(current.constraints)
      ? current.constraints
      : Array.isArray(current.safetyBounds)
        ? current.safetyBounds
        : undefined;
    const next = {
      persona: updates.persona ?? current.persona,
      tone: updates.tone ?? current.tone,
      selfEntityId: updates.selfEntityId ?? current.selfEntityId,
      constraints: updates.constraints ?? currentConstraints,
      loreScopes: updates.loreScopes ?? current.loreScopes,
      selfLoreScopes: updates.selfLoreScopes ?? current.selfLoreScopes,
      relatedLoreScopes: updates.relatedLoreScopes ?? current.relatedLoreScopes,
    };

    const normalized = {
      persona: normalizeOptionalText(next.persona),
      tone: normalizeOptionalText(next.tone),
      selfEntityId: normalizeOptionalText(next.selfEntityId),
      constraints: Array.isArray(next.constraints) && next.constraints.length > 0
        ? next.constraints
        : undefined,
      loreScopes: Array.isArray(next.loreScopes) && next.loreScopes.length > 0
        ? next.loreScopes
        : undefined,
      selfLoreScopes: Array.isArray(next.selfLoreScopes) && next.selfLoreScopes.length > 0
        ? next.selfLoreScopes
        : undefined,
      relatedLoreScopes: Array.isArray(next.relatedLoreScopes) && next.relatedLoreScopes.length > 0
        ? next.relatedLoreScopes
        : undefined,
    };

    const hasData = !!(
      normalized.persona
      || normalized.tone
      || normalized.selfEntityId
      || normalized.constraints
      || normalized.loreScopes
      || normalized.selfLoreScopes
      || normalized.relatedLoreScopes
    );

    onChange({
      ...npc,
      agentProfile: hasData ? normalized : undefined,
    });
    setDirty(true);
  };

  // If showing behavior tree editor, render that instead
  if (showBehaviorTree) {
    return (
      <BehaviorTreeCanvas
        tree={npc.behaviorTree}
        onChange={(tree) => onChange({ ...npc, behaviorTree: tree })}
        dialogues={dialogues.map(d => ({ id: d.id, name: d.name || d.id }))}
        items={items}
        quests={quests}
        onClose={() => setShowBehaviorTree(false)}
      />
    );
  }

  // Count nodes in behavior tree
  const countNodes = (tree: typeof npc.behaviorTree): number => {
    if (!tree) return 0;
    let count = 1;
    if (tree.type === 'selector' || tree.type === 'sequence' || tree.type === 'parallel') {
      const controlNode = tree as any;
      for (const child of controlNode.children) {
        count += countNodes(child);
      }
    } else if (tree.type === 'inverter' || tree.type === 'repeater' || tree.type === 'succeeder' || tree.type === 'untilFail') {
      const decoratorNode = tree as any;
      count += countNodes(decoratorNode.child);
    }
    return count;
  };

  const nodeCount = countNodes(npc.behaviorTree);

  return (
    <ScrollArea h="100%" type="auto">
      <Box p="lg" maw={900} mx="auto">
        <Stack gap="lg">
          {/* Header Card */}
          <Paper
            p="lg"
            radius="md"
            style={{
              background: 'linear-gradient(135deg, #1e1e2e 0%, #181825 100%)',
              border: '1px solid #313244',
            }}
          >
            <Group justify="space-between" align="flex-start">
              <Group gap="lg">
                <Avatar
                  size={72}
                  radius="md"
                  src={npc.portrait}
                  style={{
                    background: '#313244',
                    border: '2px solid #45475a',
                  }}
                >
                  {npc.name.charAt(0).toUpperCase()}
                </Avatar>
                <Stack gap={4}>
                  <TextInput
                    value={npc.name}
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
                        '&:focus': {
                          borderBottom: '2px solid #89b4fa',
                        },
                      },
                    }}
                  />
                  <Group gap="xs">
                    {npc.faction && (
                      <Badge variant="light" color="blue" size="sm">
                        {npc.faction}
                      </Badge>
                    )}
                    <Text size="xs" c="dimmed" ff="monospace">
                      {npc.id.slice(0, 8)}
                    </Text>
                  </Group>
                </Stack>
              </Group>
              <Button
                color="red"
                variant="subtle"
                size="xs"
                onClick={onDelete}
              >
                Delete
              </Button>
            </Group>
          </Paper>

          {/* Two column layout for cards */}
          <Group align="flex-start" gap="lg" wrap="nowrap" style={{ alignItems: 'stretch' }}>
            {/* Left Column - Core Details */}
            <Stack gap="lg" style={{ flex: 1, minWidth: 0 }}>
              {/* Identity Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Identity
                </Text>
                <Stack gap="sm">
                  <TextInput
                    label="Faction"
                    value={npc.faction || ''}
                    onChange={(e) => handleChange('faction', e.currentTarget.value)}
                    placeholder="e.g., Merchants Guild"
                    size="sm"
                  />
                  <TextInput
                    label="Portrait"
                    value={npc.portrait || ''}
                    onChange={(e) => handleChange('portrait', e.currentTarget.value)}
                    placeholder="/portraits/npc.png"
                    size="sm"
                  />
                </Stack>
              </Paper>

              {/* Model & Animations Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Model &amp; Animations
                </Text>
                <Stack gap="sm">
                  <TextInput
                    label="Model Path"
                    value={npc.model || ''}
                    onChange={(e) => {
                      const val = e.currentTarget.value.trim();
                      onChange({ ...npc, model: val.length > 0 ? val : undefined });
                      setDirty(true);
                    }}
                    placeholder="models/npc-name.fbx"
                    size="sm"
                  />
                  <NumberInput
                    label="Height (meters)"
                    value={npc.modelHeight ?? 1.5}
                    onChange={(val) => {
                      const num = typeof val === 'number' ? val : undefined;
                      onChange({ ...npc, modelHeight: num && num !== 1.5 ? num : undefined });
                      setDirty(true);
                    }}
                    min={0.1}
                    max={10}
                    step={0.1}
                    decimalScale={2}
                    size="sm"
                  />
                  <Text size="xs" c="dimmed">
                    Separate FBX/GLB files for each animation clip.
                  </Text>
                  {ANIM_SLOTS.map((slot) => (
                    <TextInput
                      key={slot}
                      label={slot.charAt(0).toUpperCase() + slot.slice(1)}
                      value={npc.animations?.[slot] || ''}
                      onChange={(e) => {
                        const val = e.currentTarget.value.trim();
                        const next = { ...(npc.animations || {}) };
                        if (val.length > 0) {
                          next[slot] = val;
                        } else {
                          delete next[slot];
                        }
                        onChange({ ...npc, animations: Object.keys(next).length > 0 ? next : undefined });
                        setDirty(true);
                      }}
                      placeholder={`models/npc-${slot}.fbx`}
                      size="sm"
                    />
                  ))}
                </Stack>
              </Paper>

              {/* Dialogue Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Dialogue
                </Text>
                <Stack gap="sm">
                  <Select
                    label="Default Dialogue"
                    placeholder="Select dialogue..."
                    data={dialogueOptions}
                    value={npc.defaultDialogue || null}
                    onChange={(value) => handleChange('defaultDialogue', value)}
                    searchable
                    clearable
                    size="sm"
                  />
                  <Textarea
                    label="Description"
                    value={npc.description || ''}
                    onChange={(e) => handleChange('description', e.currentTarget.value)}
                    placeholder="Character background, personality, role in the story..."
                    minRows={3}
                    autosize
                    size="sm"
                  />
                </Stack>
              </Paper>

              {/* Behavior Tree Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Behavior Tree
                </Text>
                <Stack gap="sm">
                  <Select
                    label="Behavior Mode"
                    placeholder="Select mode..."
                    data={[
                      { value: 'onInteraction', label: 'On Interaction - runs when player interacts' },
                      { value: 'continuous', label: 'Continuous - runs constantly' },
                    ]}
                    value={npc.behaviorMode || null}
                    onChange={(value) => onChange({ ...npc, behaviorMode: value as 'onInteraction' | 'continuous' | undefined })}
                    size="sm"
                  />

                  {npc.behaviorTree ? (
                    <Stack gap="xs">
                      <Group gap="xs">
                        <Badge size="sm" variant="light" color="green">
                          {nodeCount} node{nodeCount !== 1 ? 's' : ''}
                        </Badge>
                        <Badge size="sm" variant="light" color="blue">
                          {npc.behaviorTree.type}
                        </Badge>
                      </Group>
                      <Group gap="xs">
                        <Button
                          size="sm"
                          variant="light"
                          fullWidth
                          onClick={() => setShowBehaviorTree(true)}
                        >
                          Edit Behavior Tree
                        </Button>
                        <Button
                          size="sm"
                          variant="subtle"
                          color="red"
                          onClick={() => onChange({ ...npc, behaviorTree: undefined })}
                        >
                          Remove
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Button
                      size="sm"
                      variant="light"
                      fullWidth
                      onClick={() => setShowBehaviorTree(true)}
                    >
                      Create Behavior Tree
                    </Button>
                  )}
                </Stack>
              </Paper>

              {/* SugarAgent Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  SugarAgent
                </Text>
                <Stack gap="sm">
                  <Select
                    label="Interaction Mode"
                    description="Scripted keeps current behavior. Agent/Hybrid enables SugarAgent routing."
                    data={[
                      { value: 'scripted', label: 'Scripted' },
                      { value: 'hybrid', label: 'Hybrid (Scripted then Agent)' },
                      { value: 'agent', label: 'Agent (Plugin-first)' },
                    ]}
                    value={npc.interactionMode || 'scripted'}
                    onChange={(value) => {
                      onChange({
                        ...npc,
                        interactionMode: (value as NPCEntry['interactionMode']) || 'scripted',
                      });
                      setDirty(true);
                    }}
                    size="sm"
                  />

                  <Textarea
                    label="Agent Persona"
                    description="Optional style/persona guidance for this NPC."
                    value={npc.agentProfile?.persona || ''}
                    onChange={(e) => updateAgentProfile({ persona: e.currentTarget.value })}
                    placeholder="Warm neighborhood baker who notices small details..."
                    minRows={2}
                    autosize
                    size="sm"
                  />

                  <TextInput
                    label="Agent Tone"
                    value={npc.agentProfile?.tone || ''}
                    onChange={(e) => updateAgentProfile({ tone: e.currentTarget.value })}
                    placeholder="friendly, grounded, concise"
                    size="sm"
                  />

                  <TextInput
                    label="Self Entity ID"
                    description="Canonical lore entity for this NPC (for identity-aware retrieval)."
                    value={npc.agentProfile?.selfEntityId || ''}
                    onChange={(e) => updateAgentProfile({ selfEntityId: e.currentTarget.value })}
                    placeholder="npc.baker"
                    size="sm"
                  />

                  <Textarea
                    label="Constraints"
                    description="NPC-specific constraints (one per line or comma-separated)."
                    value={agentConstraintsDraft}
                    onChange={(e) => {
                      const nextText = e.currentTarget.value;
                      setAgentConstraintsDraft(nextText);
                      updateAgentProfile({ constraints: parseList(nextText) });
                    }}
                    placeholder={'Do not reveal Captain Rowan\'s hidden identity before beat.gate_reveal'}
                    minRows={2}
                    autosize
                    size="sm"
                  />

                  <Textarea
                    label="Lore Scopes"
                    description="One per line (or comma-separated)."
                    value={agentLoreScopesDraft}
                    onChange={(e) => {
                      const nextText = e.currentTarget.value;
                      setAgentLoreScopesDraft(nextText);
                      updateAgentProfile({ loreScopes: parseList(nextText) });
                    }}
                    placeholder={'town.history\nnpc.baker'}
                    minRows={2}
                    autosize
                    size="sm"
                  />
                  {getUnmatchedScopes(agentLoreScopesDraft).map((scope) => (
                    <Text key={scope} size="xs" c="red" mt={-8}>
                      No lore chunks match scope "{scope}"
                    </Text>
                  ))}

                  <Textarea
                    label="Self Lore Scopes"
                    description="Lore scopes for facts specifically about this NPC."
                    value={agentSelfLoreScopesDraft}
                    onChange={(e) => {
                      const nextText = e.currentTarget.value;
                      setAgentSelfLoreScopesDraft(nextText);
                      updateAgentProfile({ selfLoreScopes: parseList(nextText) });
                    }}
                    placeholder={'npc.baker\npeople.bakers.bub'}
                    minRows={2}
                    autosize
                    size="sm"
                  />
                  {getUnmatchedScopes(agentSelfLoreScopesDraft).map((scope) => (
                    <Text key={scope} size="xs" c="red" mt={-8}>
                      No lore chunks match scope "{scope}"
                    </Text>
                  ))}

                  <Textarea
                    label="Related Lore Scopes"
                    description="Lore scopes for friends/family/acquaintances of this NPC."
                    value={agentRelatedLoreScopesDraft}
                    onChange={(e) => {
                      const nextText = e.currentTarget.value;
                      setAgentRelatedLoreScopesDraft(nextText);
                      updateAgentProfile({ relatedLoreScopes: parseList(nextText) });
                    }}
                    placeholder={'npc.baker.family\nnpc.baker.friends'}
                    minRows={2}
                    autosize
                    size="sm"
                  />
                  {getUnmatchedScopes(agentRelatedLoreScopesDraft).map((scope) => (
                    <Text key={scope} size="xs" c="red" mt={-8}>
                      No lore chunks match scope "{scope}"
                    </Text>
                  ))}
                </Stack>
              </Paper>
            </Stack>

            {/* Right Column - Usage Info */}
            <Stack gap="lg" style={{ width: 280, flexShrink: 0 }}>
              {/* Dialogues Usage */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Group gap="xs" mb="sm">
                  <Text size="sm">💬</Text>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    In Dialogues
                  </Text>
                  <Badge size="xs" variant="light" color="blue">
                    {npcDialogues.length}
                  </Badge>
                </Group>
                {npcDialogues.length > 0 ? (
                  <Stack gap={6}>
                    {npcDialogues.map((d) => (
                      <Paper
                        key={d.id}
                        p="xs"
                        radius="sm"
                        style={{ background: '#1e1e2e' }}
                      >
                        <Text size="sm">{d.name || d.id}</Text>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Text size="xs" c="dimmed" fs="italic">
                    Not referenced in any dialogues
                  </Text>
                )}
              </Paper>

              {/* Quests Usage */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Group gap="xs" mb="sm">
                  <Text size="sm">📜</Text>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    In Quests
                  </Text>
                  <Badge size="xs" variant="light" color="green">
                    {npcQuests.length}
                  </Badge>
                </Group>
                {npcQuests.length > 0 ? (
                  <Stack gap={6}>
                    {npcQuests.map((q) => (
                      <Paper
                        key={q.id}
                        p="xs"
                        radius="sm"
                        style={{ background: '#1e1e2e' }}
                      >
                        <Text size="sm">{q.name}</Text>
                      </Paper>
                    ))}
                  </Stack>
                ) : (
                  <Text size="xs" c="dimmed" fs="italic">
                    Not referenced in any quests
                  </Text>
                )}
              </Paper>
            </Stack>
          </Group>
        </Stack>
      </Box>
    </ScrollArea>
  );
}
