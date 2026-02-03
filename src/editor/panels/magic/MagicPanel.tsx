/**
 * MagicPanel - Editor panel for spells (renamed from "Magic" to "Spells" in UI)
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
  NumberInput,
  Slider,
  Select,
  Button,
  Paper,
} from '@mantine/core';
import { useEditorStore, SpellData, SpellEffectData } from '../../store';
import { generateUUID, shortId } from '../../utils';

export interface MagicPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface MagicPanelProps {
  spells: SpellData[];
  onSpellsChange: (spells: SpellData[]) => void;
  dialogues?: { id: string; name: string }[];
  children: (result: MagicPanelResult) => ReactNode;
}

const EFFECT_TYPES = [
  { value: 'event', label: 'Event' },
  { value: 'dialogue', label: 'Dialogue' },
  { value: 'world-flag', label: 'World Flag' },
  { value: 'unlock', label: 'Unlock' },
  { value: 'heal', label: 'Heal' },
  { value: 'damage', label: 'Damage' },
];

export function MagicPanel({
  spells,
  onSpellsChange,
  dialogues = [],
  children,
}: MagicPanelProps) {
  const [selectedSpellId, setSelectedSpellId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);

  const selectedSpell = selectedSpellId ? spells.find((s) => s.id === selectedSpellId) : null;

  // Spell handlers
  const handleCreateSpell = () => {
    const id = generateUUID();
    const newSpell: SpellData = {
      id,
      name: 'New Spell',
      description: '',
      icon: '✨',
      tags: [],
      batteryCost: 10,
      effects: [],
    };
    onSpellsChange([...spells, newSpell]);
    setSelectedSpellId(id);
    setDirty(true);
  };

  const handleUpdateSpell = (updated: SpellData) => {
    onSpellsChange(spells.map((s) => (s.id === updated.id ? updated : s)));
    setDirty(true);
  };

  const handleDeleteSpell = (id: string) => {
    onSpellsChange(spells.filter((s) => s.id !== id));
    if (selectedSpellId === id) setSelectedSpellId(null);
    setDirty(true);
  };

  // Filter based on search
  const filteredSpells = spells.filter((s) =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.tags.some((t: string) => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const result: MagicPanelResult = {
    // List panel (left)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Spells ({spells.length})
          </Text>
          <Tooltip label="Create Spell">
            <ActionIcon variant="subtle" onClick={handleCreateSpell}>
              +
            </ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search spells..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredSpells.map((spell) => (
              <Group
                key={spell.id}
                p="xs"
                gap="xs"
                style={{
                  background: selectedSpellId === spell.id ? 'var(--mantine-color-dark-6)' : undefined,
                  borderRadius: 'var(--mantine-radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedSpellId(spell.id)}
              >
                <Text size="lg">{spell.icon || '✨'}</Text>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>{spell.name}</Text>
                  <Text size="xs" c="dimmed">
                    Cost: {spell.batteryCost} · {shortId(spell.id)}
                  </Text>
                </Stack>
                {spell.tags.length > 0 && (
                  <Badge size="xs" variant="light" color="violet">
                    {spell.tags[0]}
                  </Badge>
                )}
              </Group>
            ))}
            {filteredSpells.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No spells yet. Click + to create one.
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Content panel (center)
    content: selectedSpell ? (
      <SpellDetail
        spell={selectedSpell}
        dialogues={dialogues}
        onChange={handleUpdateSpell}
        onDelete={() => handleDeleteSpell(selectedSpell.id)}
      />
    ) : (
      <EmptyState />
    ),

    // Inspector panel (right)
    inspector: selectedSpell ? (
      <SpellInspector spell={selectedSpell} />
    ) : null,
  };

  return <>{children(result)}</>;
}

// ============================================
// Spell Components
// ============================================

function SpellDetail({
  spell,
  dialogues,
  onChange,
  onDelete,
}: {
  spell: SpellData;
  dialogues: { id: string; name: string }[];
  onChange: (s: SpellData) => void;
  onDelete: () => void;
}) {
  const addEffect = (isChaos: boolean) => {
    const newEffect: SpellEffectData = { type: 'event', eventName: '' };
    if (isChaos) {
      onChange({ ...spell, chaosEffects: [...(spell.chaosEffects || []), newEffect] });
    } else {
      onChange({ ...spell, effects: [...spell.effects, newEffect] });
    }
  };

  const updateEffect = (index: number, effect: SpellEffectData, isChaos: boolean) => {
    if (isChaos) {
      const updated = [...(spell.chaosEffects || [])];
      updated[index] = effect;
      onChange({ ...spell, chaosEffects: updated });
    } else {
      const updated = [...spell.effects];
      updated[index] = effect;
      onChange({ ...spell, effects: updated });
    }
  };

  const removeEffect = (index: number, isChaos: boolean) => {
    if (isChaos) {
      onChange({ ...spell, chaosEffects: (spell.chaosEffects || []).filter((_: SpellEffectData, i: number) => i !== index) });
    } else {
      onChange({ ...spell, effects: spell.effects.filter((_: SpellEffectData, i: number) => i !== index) });
    }
  };

  return (
    <Stack p="md" gap="md">
      <Group justify="space-between">
        <Group gap="xs">
          <Text size="xl">{spell.icon || '✨'}</Text>
          <Text size="xl" fw={600}>{spell.name}</Text>
        </Group>
        <Button variant="subtle" color="red" size="xs" onClick={onDelete}>
          Delete
        </Button>
      </Group>

      <Group grow>
        <TextInput
          label="Icon"
          value={spell.icon || ''}
          onChange={(e) => onChange({ ...spell, icon: e.currentTarget.value || undefined })}
          placeholder="✨"
          styles={{ input: { fontSize: 20, textAlign: 'center' } }}
        />
        <TextInput
          label="Name"
          value={spell.name}
          onChange={(e) => onChange({ ...spell, name: e.currentTarget.value })}
        />
      </Group>

      <Textarea
        label="Description"
        value={spell.description}
        onChange={(e) => onChange({ ...spell, description: e.currentTarget.value })}
        minRows={2}
        autosize
      />

      <div>
        <Text size="sm" mb={4}>Battery Cost: {spell.batteryCost}</Text>
        <Slider
          value={spell.batteryCost}
          onChange={(v) => onChange({ ...spell, batteryCost: v })}
          min={0}
          max={100}
          marks={[
            { value: 0, label: '0' },
            { value: 50, label: '50' },
            { value: 100, label: '100' },
          ]}
        />
      </div>

      <TextInput
        label="Tags"
        description="Comma-separated"
        value={spell.tags.join(', ')}
        onChange={(e) => {
          const tags = e.currentTarget.value
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
          onChange({ ...spell, tags });
        }}
        placeholder="e.g. basic, light, healing"
      />

      {/* Normal Effects */}
      <div>
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={500}>Effects</Text>
          <Button size="xs" variant="subtle" onClick={() => addEffect(false)}>
            + Add Effect
          </Button>
        </Group>
        <Stack gap="xs">
          {spell.effects.map((effect: SpellEffectData, index: number) => (
            <SpellEffectEditor
              key={index}
              effect={effect}
              dialogues={dialogues}
              onChange={(e) => updateEffect(index, e, false)}
              onRemove={() => removeEffect(index, false)}
            />
          ))}
          {spell.effects.length === 0 && (
            <Text size="sm" c="dimmed" ta="center">No effects</Text>
          )}
        </Stack>
      </div>

      {/* Chaos Effects */}
      <div>
        <Group justify="space-between" mb="xs">
          <Text size="sm" fw={500} c="orange">Chaos Effects (on misfire)</Text>
          <Button size="xs" variant="subtle" color="orange" onClick={() => addEffect(true)}>
            + Add Chaos Effect
          </Button>
        </Group>
        <Stack gap="xs">
          {(spell.chaosEffects || []).map((effect: SpellEffectData, index: number) => (
            <SpellEffectEditor
              key={index}
              effect={effect}
              dialogues={dialogues}
              onChange={(e) => updateEffect(index, e, true)}
              onRemove={() => removeEffect(index, true)}
              isChaos
            />
          ))}
          {(!spell.chaosEffects || spell.chaosEffects.length === 0) && (
            <Text size="sm" c="dimmed" ta="center">No chaos effects</Text>
          )}
        </Stack>
      </div>
    </Stack>
  );
}

function SpellInspector({
  spell,
}: {
  spell: SpellData;
}) {
  return (
    <Stack gap="md" p="sm">
      <Text size="sm" fw={500} c="dimmed">Properties</Text>

      <TextInput
        label="ID"
        value={spell.id}
        readOnly
        styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
      />

      <div>
        <Text size="sm" mb={4}>Battery Cost</Text>
        <Group gap="xs">
          <Badge
            size="lg"
            color={spell.batteryCost <= 10 ? 'green' : spell.batteryCost <= 30 ? 'yellow' : 'red'}
          >
            {spell.batteryCost}%
          </Badge>
          <Text size="xs" c="dimmed">
            {spell.batteryCost <= 10 ? 'Low' : spell.batteryCost <= 30 ? 'Medium' : 'High'} cost
          </Text>
        </Group>
      </div>

      {spell.tags.length > 0 && (
        <div>
          <Text size="sm" mb={4}>Tags</Text>
          <Group gap={4}>
            {spell.tags.map((tag: string) => (
              <Badge key={tag} size="sm" variant="light" color="violet">
                {tag}
              </Badge>
            ))}
          </Group>
        </div>
      )}

      <div>
        <Text size="sm" mb={4}>Effects Summary</Text>
        <Text size="xs" c="dimmed">
          {spell.effects.length} normal effect(s)
        </Text>
        <Text size="xs" c="orange">
          {(spell.chaosEffects || []).length} chaos effect(s)
        </Text>
      </div>
    </Stack>
  );
}

// ============================================
// Effect Editor
// ============================================

function SpellEffectEditor({
  effect,
  dialogues,
  onChange,
  onRemove,
  isChaos = false,
}: {
  effect: SpellEffectData;
  dialogues: { id: string; name: string }[];
  onChange: (e: SpellEffectData) => void;
  onRemove: () => void;
  isChaos?: boolean;
}) {
  return (
    <Paper
      p="xs"
      style={{
        background: isChaos ? 'rgba(255, 150, 50, 0.1)' : 'rgba(0, 0, 0, 0.2)',
        border: `1px solid ${isChaos ? 'rgba(255, 150, 50, 0.3)' : 'var(--mantine-color-dark-4)'}`,
      }}
    >
      <Group gap="xs" align="flex-end">
        <Select
          label="Type"
          size="xs"
          value={effect.type}
          onChange={(v) => onChange({ ...effect, type: v as SpellEffectData['type'] })}
          data={EFFECT_TYPES}
          style={{ width: 120 }}
        />

        {effect.type === 'event' && (
          <TextInput
            label="Event Name"
            size="xs"
            value={effect.eventName || ''}
            onChange={(e) => onChange({ ...effect, eventName: e.currentTarget.value })}
            placeholder="spell:light:cast"
            style={{ flex: 1 }}
          />
        )}

        {effect.type === 'dialogue' && (
          <Select
            label="Dialogue"
            size="xs"
            value={effect.dialogueId || ''}
            onChange={(v) => onChange({ ...effect, dialogueId: v || undefined })}
            data={dialogues.map((d) => ({ value: d.id, label: d.name }))}
            placeholder="Select dialogue"
            style={{ flex: 1 }}
            searchable
            clearable
          />
        )}

        {effect.type === 'world-flag' && (
          <>
            <TextInput
              label="Flag Name"
              size="xs"
              value={effect.flagName || ''}
              onChange={(e) => onChange({ ...effect, flagName: e.currentTarget.value })}
              placeholder="spell_cast_light"
              style={{ flex: 1 }}
            />
            <TextInput
              label="Value"
              size="xs"
              value={String(effect.flagValue ?? 'true')}
              onChange={(e) => onChange({ ...effect, flagValue: e.currentTarget.value })}
              placeholder="true"
              style={{ width: 80 }}
            />
          </>
        )}

        {(effect.type === 'heal' || effect.type === 'damage') && (
          <NumberInput
            label="Amount"
            size="xs"
            value={effect.amount || 0}
            onChange={(v) => onChange({ ...effect, amount: typeof v === 'number' ? v : 0 })}
            min={0}
            style={{ width: 100 }}
          />
        )}

        {effect.type === 'unlock' && (
          <TextInput
            label="Target"
            size="xs"
            value={effect.eventName || ''}
            onChange={(e) => onChange({ ...effect, eventName: e.currentTarget.value })}
            placeholder="door_id"
            style={{ flex: 1 }}
          />
        )}

        <ActionIcon variant="subtle" color="red" onClick={onRemove} mb={2}>
          X
        </ActionIcon>
      </Group>
    </Paper>
  );
}

// ============================================
// Empty State
// ============================================

function EmptyState() {
  return (
    <Stack align="center" justify="center" h="100%" gap="md">
      <Text size="xl">✨</Text>
      <Text c="dimmed">Select a spell to edit</Text>
      <Text size="sm" c="dimmed" ta="center" maw={300}>
        Choose a spell from the list on the left, or create a new one with the + button.
      </Text>
    </Stack>
  );
}
