/**
 * ObjectiveModal - Modal for editing quest objectives
 */

import {
  Modal,
  Stack,
  Button,
  Group,
  TextInput,
  Select,
  Switch,
  Checkbox,
  Text,
  Paper,
  NumberInput,
  ActionIcon,
} from '@mantine/core';
import {
  QuestStage,
  QuestObjective,
  BeatAction,
  BeatNodeType,
  NarrativeSubtype,
  ConditionOperator,
  ActionType,
} from './QuestPanel';

interface ObjectiveModalProps {
  opened: boolean;
  onClose: () => void;
  stage: QuestStage | null;
  objective: QuestObjective | null;
  npcs: { id: string; name: string }[];
  items: { id: string; name: string }[];
  dialogues: { id: string; name: string }[];
  onUpdate: (objective: QuestObjective) => void;
  onDelete: () => void;
}

const OBJECTIVE_TYPES = [
  { value: 'talk', label: 'Talk to NPC' },
  { value: 'voiceover', label: 'Voice Over / Monologue' },
  { value: 'location', label: 'Go to Location' },
  { value: 'trigger', label: 'Trigger Event' },
  { value: 'custom', label: 'Custom' },
];

const ACTION_TYPES = [
  { value: 'setFlag', label: 'Set Flag' },
  { value: 'giveItem', label: 'Give Item' },
  { value: 'removeItem', label: 'Remove Item' },
  { value: 'playSound', label: 'Play Sound' },
  { value: 'teleportNPC', label: 'Teleport NPC' },
  { value: 'moveNpc', label: 'Move NPC' },
  { value: 'setNPCState', label: 'Set NPC State' },
  { value: 'emitEvent', label: 'Emit Event' },
  { value: 'spawnVFX', label: 'Spawn VFX' },
  { value: 'custom', label: 'Custom' },
];

export function ObjectiveModal({
  opened,
  onClose,
  stage,
  objective,
  npcs,
  items,
  dialogues,
  onUpdate,
  onDelete,
}: ObjectiveModalProps) {
  if (!objective || !stage) return null;

  const nodeType = objective.nodeType || 'objective';

  const handleChange = <K extends keyof QuestObjective>(field: K, value: QuestObjective[K]) => {
    onUpdate({ ...objective, [field]: value });
  };

  const handleDelete = () => {
    if (confirm('Delete this node?')) {
      onDelete();
    }
  };

  // Get target options based on objective type
  const getTargetOptions = () => {
    switch (objective.type) {
      case 'talk':
        return npcs.map((n) => ({ value: n.id, label: n.name }));
      case 'collect':
        return items.map((i) => ({ value: i.id, label: i.name }));
      default:
        return null;
    }
  };

  const targetOptions = getTargetOptions();
  const dialogueOptions = dialogues.map((d) => ({ value: d.id, label: d.name }));

  const inputStyle = { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' };
  const labelStyle = { color: '#a6adc8' };
  const descStyle = { color: '#6c7086' };

  /** Render action fields inline for the modal */
  const renderActionFields = (action: BeatAction, index: number, field: 'onEnter' | 'onComplete') => {
    const actions = (objective[field] || []) as BeatAction[];
    const updateAction = (updated: BeatAction) => {
      const updatedActions = [...actions];
      updatedActions[index] = updated;
      handleChange(field, updatedActions as QuestObjective[typeof field]);
    };
    const nestedInput = { background: '#11111b', border: '1px solid #313244', color: '#cdd6f4' };

    switch (action.type) {
      case 'setFlag':
        return (
          <>
            <TextInput size="xs" label="Flag" value={action.target || ''}
              onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
              styles={{ input: nestedInput, label: labelStyle }} />
            <TextInput size="xs" label="Value" value={String(action.value ?? 'true')}
              onChange={(e) => updateAction({ ...action, value: e.currentTarget.value })}
              styles={{ input: nestedInput, label: labelStyle }} />
          </>
        );
      case 'giveItem':
      case 'removeItem':
        return (
          <>
            <Select size="xs" label="Item" data={items.map(i => ({ value: i.id, label: i.name }))}
              value={action.target || null}
              onChange={(v) => updateAction({ ...action, target: v || '' })}
              searchable styles={{ input: nestedInput, label: labelStyle }} />
            <NumberInput size="xs" label="Count" value={Number(action.value) || 1}
              onChange={(v) => updateAction({ ...action, value: Number(v) || 1 })}
              styles={{ input: { ...nestedInput, width: 80 }, label: labelStyle }} />
          </>
        );
      case 'playSound':
        return (
          <TextInput size="xs" label="Sound" value={action.target || ''}
            onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
            styles={{ input: nestedInput, label: labelStyle }} />
        );
      case 'moveNpc':
      case 'teleportNPC': {
        const pos = (action.value as { x: number; y: number; z: number }) || action.position || { x: 0, y: 0, z: 0 };
        return (
          <>
            <Select size="xs" label="NPC" data={npcs.map(n => ({ value: n.id, label: n.name }))}
              value={action.target || action.npcId || null}
              onChange={(v) => updateAction({ ...action, target: v || '', npcId: v || '' })}
              searchable styles={{ input: nestedInput, label: labelStyle }} />
            <Group gap="xs">
              <NumberInput size="xs" label="X" value={pos.x}
                onChange={(v) => updateAction({ ...action, value: { ...pos, x: Number(v) || 0 }, position: { ...pos, x: Number(v) || 0 } })}
                styles={{ input: { ...nestedInput, width: 70 }, label: labelStyle }} />
              <NumberInput size="xs" label="Y" value={pos.y}
                onChange={(v) => updateAction({ ...action, value: { ...pos, y: Number(v) || 0 }, position: { ...pos, y: Number(v) || 0 } })}
                styles={{ input: { ...nestedInput, width: 70 }, label: labelStyle }} />
              <NumberInput size="xs" label="Z" value={pos.z}
                onChange={(v) => updateAction({ ...action, value: { ...pos, z: Number(v) || 0 }, position: { ...pos, z: Number(v) || 0 } })}
                styles={{ input: { ...nestedInput, width: 70 }, label: labelStyle }} />
            </Group>
          </>
        );
      }
      case 'setNPCState':
        return (
          <>
            <Select size="xs" label="NPC" data={npcs.map(n => ({ value: n.id, label: n.name }))}
              value={action.target || null}
              onChange={(v) => updateAction({ ...action, target: v || '' })}
              searchable styles={{ input: nestedInput, label: labelStyle }} />
            <TextInput size="xs" label="State" value={String(action.value ?? '')}
              onChange={(e) => updateAction({ ...action, value: e.currentTarget.value })}
              styles={{ input: nestedInput, label: labelStyle }} />
          </>
        );
      case 'emitEvent':
        return (
          <TextInput size="xs" label="Event" value={action.target || ''}
            onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
            styles={{ input: nestedInput, label: labelStyle }} />
        );
      case 'spawnVFX':
        return (
          <TextInput size="xs" label="VFX" value={action.target || ''}
            onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
            styles={{ input: nestedInput, label: labelStyle }} />
        );
      case 'custom':
        return (
          <>
            <TextInput size="xs" label="Target" value={action.target || ''}
              onChange={(e) => updateAction({ ...action, target: e.currentTarget.value })}
              styles={{ input: nestedInput, label: labelStyle }} />
            <TextInput size="xs" label="Value" value={String(action.value ?? '')}
              onChange={(e) => updateAction({ ...action, value: e.currentTarget.value })}
              styles={{ input: nestedInput, label: labelStyle }} />
          </>
        );
      default:
        return null;
    }
  };

  /** Render an action list section */
  const renderActionList = (label: string, field: 'onEnter' | 'onComplete') => {
    const actions = (objective[field] || []) as BeatAction[];
    return (
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm" c="#a6adc8">{label}</Text>
          <Select
            size="xs"
            placeholder="+ Add"
            data={ACTION_TYPES}
            value={null}
            onChange={(value) => {
              if (!value) return;
              const newAction: BeatAction = { type: value as ActionType };
              handleChange(field, [...actions, newAction] as QuestObjective[typeof field]);
            }}
            styles={{
              input: { ...inputStyle, width: 140 },
            }}
          />
        </Group>

        {actions.map((action, index) => (
          <Paper key={index} p="sm" style={{ background: '#181825', border: '1px solid #313244' }}>
            <Stack gap="xs">
              <Group justify="space-between">
                <Select
                  size="xs"
                  data={ACTION_TYPES}
                  value={action.type}
                  onChange={(value) => {
                    if (!value) return;
                    const updated = [...actions];
                    updated[index] = { type: value as ActionType };
                    handleChange(field, updated as QuestObjective[typeof field]);
                  }}
                  styles={{
                    input: { background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', width: 140 },
                  }}
                />
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    const updated = [...actions];
                    updated.splice(index, 1);
                    handleChange(field, (updated.length > 0 ? updated : undefined) as QuestObjective[typeof field]);
                  }}
                >
                  ×
                </ActionIcon>
              </Group>
              {renderActionFields(action, index, field)}
            </Stack>
          </Paper>
        ))}

        {actions.length === 0 && (
          <Text size="xs" c="#6c7086" fs="italic">No actions configured</Text>
        )}
      </Stack>
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Edit ${nodeType === 'narrative' ? 'Narrative' : nodeType === 'condition' ? 'Condition' : 'Objective'}`}
      centered
      styles={{
        header: { background: '#1e1e2e', borderBottom: '1px solid #313244' },
        title: { color: '#cdd6f4', fontWeight: 600 },
        body: { background: '#1e1e2e', padding: '20px' },
        content: { background: '#1e1e2e' },
        close: { color: '#6c7086', '&:hover': { background: '#313244' } },
      }}
    >
      <Stack gap="md">
        {/* Node Type Selector */}
        <Select
          label="Node Type"
          data={[
            { value: 'objective', label: 'Objective - player action' },
            { value: 'narrative', label: 'Narrative - auto-trigger' },
            { value: 'condition', label: 'Condition - gate/check' },
          ]}
          value={nodeType}
          onChange={(value) => value && handleChange('nodeType', value as BeatNodeType)}
          styles={{ input: inputStyle, label: labelStyle }}
        />

        <TextInput
          label="Description"
          value={objective.description}
          onChange={(e) => handleChange('description', e.currentTarget.value)}
          styles={{ input: inputStyle, label: labelStyle }}
        />

        {/* === Objective-specific fields === */}
        {nodeType === 'objective' && (
          <>
            <Select
              label="Type"
              data={OBJECTIVE_TYPES}
              value={objective.type}
              onChange={(value) =>
                handleChange('type', (value as QuestObjective['type']) || 'custom')
              }
              styles={{ input: inputStyle, label: labelStyle }}
            />

            {objective.type !== 'voiceover' && (
              targetOptions ? (
                <Select
                  label={objective.type === 'talk' ? 'NPC' : 'Item'}
                  data={targetOptions}
                  value={objective.target || null}
                  onChange={(value) => handleChange('target', value || '')}
                  searchable
                  placeholder={`Select ${objective.type === 'talk' ? 'NPC' : 'item'}...`}
                  styles={{ input: inputStyle, label: labelStyle }}
                />
              ) : (
                <TextInput
                  label="Target"
                  value={objective.target}
                  onChange={(e) => handleChange('target', e.currentTarget.value)}
                  placeholder={
                    objective.type === 'location' ? 'Location ID'
                      : objective.type === 'trigger' ? 'Event name'
                      : 'Target'
                  }
                  styles={{ input: inputStyle, label: labelStyle }}
                />
              )
            )}

            {(objective.type === 'talk' || objective.type === 'voiceover') && (
              <>
                <Select
                  label="Dialogue"
                  description={objective.type === 'voiceover' ? 'The dialogue to play' : "Override NPC's default dialogue"}
                  data={
                    objective.type === 'voiceover'
                      ? dialogueOptions
                      : [{ value: '', label: "Use NPC's default dialogue" }, ...dialogueOptions]
                  }
                  value={objective.dialogue || ''}
                  onChange={(value) => handleChange('dialogue', value || undefined)}
                  searchable
                  clearable={objective.type === 'talk'}
                  styles={{ input: inputStyle, label: labelStyle, description: descStyle }}
                />

                <Select
                  label="Complete When"
                  data={[{ value: 'dialogueEnd', label: 'Dialogue ends' }]}
                  value={objective.completeOn || 'dialogueEnd'}
                  onChange={(value) => handleChange('completeOn', value || 'dialogueEnd')}
                  styles={{ input: inputStyle, label: labelStyle }}
                />
              </>
            )}
          </>
        )}

        {/* === Narrative-specific fields === */}
        {nodeType === 'narrative' && (
          <>
            <Select
              label="Narrative Type"
              data={[
                { value: 'dialogue', label: '💬 Dialogue' },
                { value: 'cutscene', label: '🎬 Cutscene' },
              ]}
              value={objective.narrativeType || 'dialogue'}
              onChange={(value) => handleChange('narrativeType', (value as NarrativeSubtype) || 'dialogue')}
              styles={{ input: inputStyle, label: labelStyle }}
            />

            {(objective.narrativeType === 'dialogue' || !objective.narrativeType) && (
              <Select
                label="Dialogue"
                data={dialogueOptions}
                value={objective.dialogueId || null}
                onChange={(value) => handleChange('dialogueId', value || undefined)}
                searchable clearable
                styles={{ input: inputStyle, label: labelStyle }}
              />
            )}

          </>
        )}

        {/* === Condition-specific fields === */}
        {nodeType === 'condition' && (
          <Stack gap="xs">
            <Select
              label="Operator"
              data={[
                { value: 'hasItem', label: '📦 Has Item' },
                { value: 'hasFlag', label: '🚩 Has Flag' },
                { value: 'questComplete', label: '✓ Quest Complete' },
                { value: 'stageComplete', label: '✓ Stage Complete' },
                { value: 'custom', label: '⭐ Custom' },
              ]}
              value={objective.condition?.operator || 'hasFlag'}
              onChange={(value) => {
                const cond = objective.condition || { operator: 'hasFlag' as ConditionOperator, operand: '' };
                handleChange('condition', { ...cond, operator: (value as ConditionOperator) || 'hasFlag' });
              }}
              styles={{ input: inputStyle, label: labelStyle }}
            />

            {objective.condition?.operator === 'hasItem' ? (
              <Select
                label="Item"
                data={items.map(i => ({ value: i.id, label: i.name }))}
                value={objective.condition?.operand || null}
                onChange={(value) => {
                  const cond = objective.condition || { operator: 'hasItem' as ConditionOperator, operand: '' };
                  handleChange('condition', { ...cond, operand: value || '' });
                }}
                searchable clearable
                styles={{ input: inputStyle, label: labelStyle }}
              />
            ) : (
              <TextInput
                label="Operand"
                value={objective.condition?.operand || ''}
                onChange={(e) => {
                  const cond = objective.condition || { operator: 'hasFlag' as ConditionOperator, operand: '' };
                  handleChange('condition', { ...cond, operand: e.currentTarget.value });
                }}
                placeholder={
                  objective.condition?.operator === 'hasFlag' ? 'flag-name'
                    : objective.condition?.operator === 'questComplete' ? 'quest-id'
                    : objective.condition?.operator === 'stageComplete' ? 'questId:stageId'
                    : 'expression'
                }
                styles={{ input: inputStyle, label: labelStyle }}
              />
            )}

            <Checkbox
              label="Negate (NOT)"
              checked={objective.condition?.negate ?? false}
              onChange={(e) => {
                const cond = objective.condition || { operator: 'hasFlag' as ConditionOperator, operand: '' };
                handleChange('condition', { ...cond, negate: e.currentTarget.checked || undefined });
              }}
            />
          </Stack>
        )}

        {/* Common fields */}
        <Switch
          label="Optional"
          description="Optional nodes aren't required to complete the stage"
          checked={objective.optional ?? false}
          onChange={(e) => handleChange('optional', e.currentTarget.checked)}
          styles={{ label: { color: '#cdd6f4' }, description: descStyle }}
        />

        <Switch
          label="Auto-start"
          description="Fire automatically when available (at stage load or when prerequisites complete)"
          checked={objective.autoStart ?? false}
          onChange={(e) => handleChange('autoStart', e.currentTarget.checked || undefined)}
          styles={{ label: { color: '#cdd6f4' }, description: descStyle }}
        />

        {/* Action lists */}
        {renderActionList('On Enter Actions', 'onEnter')}
        {renderActionList('On Complete Actions', 'onComplete')}

        <Group justify="space-between" mt="xl">
          <Button variant="subtle" color="red" onClick={handleDelete}>
            Delete
          </Button>
          <Button onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
