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
  Text,
  Paper,
  NumberInput,
  ActionIcon,
} from '@mantine/core';
import { QuestStage, QuestObjective, MoveNpcAction, ObjectiveAction } from './QuestPanel';

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
  { value: 'collect', label: 'Collect Item' },
  { value: 'trigger', label: 'Trigger Event' },
  { value: 'custom', label: 'Custom' },
];

// Note: Triggering other objectives is done via prerequisites (graph edges), not actions
const ACTION_TYPES = [
  { value: 'moveNpc', label: 'Move NPC' },
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

  const handleChange = <K extends keyof QuestObjective>(field: K, value: QuestObjective[K]) => {
    onUpdate({ ...objective, [field]: value });
  };

  const handleDelete = () => {
    if (confirm('Delete this objective?')) {
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
        return null; // Use text input for other types
    }
  };

  const targetOptions = getTargetOptions();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Edit Objective"
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
        <Select
          label="Type"
          data={OBJECTIVE_TYPES}
          value={objective.type}
          onChange={(value) =>
            handleChange('type', (value as QuestObjective['type']) || 'custom')
          }
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
          }}
        />

        <TextInput
          label="Description"
          value={objective.description}
          onChange={(e) => handleChange('description', e.currentTarget.value)}
          styles={{
            input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
            label: { color: '#a6adc8' },
          }}
        />

        {/* Target field - not shown for voiceover */}
        {objective.type !== 'voiceover' && (
          targetOptions ? (
            <Select
              label={objective.type === 'talk' ? 'NPC' : 'Item'}
              data={targetOptions}
              value={objective.target || null}
              onChange={(value) => handleChange('target', value || '')}
              searchable
              placeholder={`Select ${objective.type === 'talk' ? 'NPC' : 'item'}...`}
              styles={{
                input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
                label: { color: '#a6adc8' },
              }}
            />
          ) : (
            <TextInput
              label="Target"
              value={objective.target}
              onChange={(e) => handleChange('target', e.currentTarget.value)}
              placeholder={
                objective.type === 'location'
                  ? 'Location ID'
                  : objective.type === 'trigger'
                  ? 'Event name'
                  : 'Target'
              }
              styles={{
                input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
                label: { color: '#a6adc8' },
              }}
            />
          )
        )}

        {/* Dialogue picker for 'talk' and 'voiceover' objectives */}
        {(objective.type === 'talk' || objective.type === 'voiceover') && (
          <>
            <Select
              label="Dialogue"
              description={objective.type === 'voiceover' ? 'The dialogue to play' : "Override NPC's default dialogue"}
              data={
                objective.type === 'voiceover'
                  ? dialogues.map((d) => ({ value: d.id, label: d.name }))
                  : [
                      { value: '', label: "Use NPC's default dialogue" },
                      ...dialogues.map((d) => ({ value: d.id, label: d.name })),
                    ]
              }
              value={objective.dialogue || ''}
              onChange={(value) => handleChange('dialogue', value || undefined)}
              searchable
              clearable={objective.type === 'talk'}
              styles={{
                input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
                label: { color: '#a6adc8' },
                description: { color: '#6c7086' },
              }}
            />

            <Select
              label="Complete When"
              data={[
                { value: 'dialogueEnd', label: 'Dialogue ends' },
                // Could add more options here for specific node completion
              ]}
              value={objective.completeOn || 'dialogueEnd'}
              onChange={(value) => handleChange('completeOn', value || 'dialogueEnd')}
              styles={{
                input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
                label: { color: '#a6adc8' },
              }}
            />
          </>
        )}

        <Switch
          label="Optional"
          description="Optional objectives aren't required to complete the stage"
          checked={objective.optional ?? false}
          onChange={(e) => handleChange('optional', e.currentTarget.checked)}
          styles={{
            label: { color: '#cdd6f4' },
            description: { color: '#6c7086' },
          }}
        />

        <Switch
          label="Auto-start"
          description="Fire automatically when available (at stage load or when prerequisites complete)"
          checked={objective.autoStart ?? false}
          onChange={(e) => handleChange('autoStart', e.currentTarget.checked || undefined)}
          styles={{
            label: { color: '#cdd6f4' },
            description: { color: '#6c7086' },
          }}
        />

        {/* On Complete Actions */}
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="sm" c="#a6adc8">On Complete Actions</Text>
            <Select
              size="xs"
              placeholder="+ Add action"
              data={ACTION_TYPES}
              value={null}
              onChange={(value) => {
                if (!value) return;
                // Currently only moveNpc is supported; other actions may be added later
                const newAction: ObjectiveAction = { type: 'moveNpc', npcId: '', position: { x: 0, y: 0, z: 0 } };
                handleChange('onComplete', [...(objective.onComplete || []), newAction]);
              }}
              styles={{
                input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4', width: 140 },
              }}
            />
          </Group>

          {(objective.onComplete || []).map((action, index) => (
            <Paper key={index} p="sm" style={{ background: '#181825', border: '1px solid #313244' }}>
              <Stack gap="xs">
                <Group justify="space-between">
                  <Select
                    size="xs"
                    data={ACTION_TYPES}
                    value={action.type}
                    onChange={(value) => {
                      if (!value) return;
                      const updated = [...(objective.onComplete || [])];
                      // Currently only moveNpc is supported
                      updated[index] = { type: 'moveNpc', npcId: '', position: { x: 0, y: 0, z: 0 } };
                      handleChange('onComplete', updated);
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
                      const updated = [...(objective.onComplete || [])];
                      updated.splice(index, 1);
                      handleChange('onComplete', updated.length > 0 ? updated : undefined);
                    }}
                  >
                    ×
                  </ActionIcon>
                </Group>

                {action.type === 'moveNpc' && (
                  <>
                    <Select
                      size="xs"
                      placeholder="Select NPC..."
                      data={npcs.map((n) => ({ value: n.id, label: n.name }))}
                      value={(action as MoveNpcAction).npcId || null}
                      onChange={(value) => {
                        const updated = [...(objective.onComplete || [])];
                        updated[index] = { ...action, npcId: value || '' } as MoveNpcAction;
                        handleChange('onComplete', updated);
                      }}
                      searchable
                      styles={{
                        input: { background: '#11111b', border: '1px solid #313244', color: '#cdd6f4' },
                      }}
                    />
                    <Group gap="xs">
                      <NumberInput
                        size="xs"
                        label="X"
                        value={(action as MoveNpcAction).position?.x || 0}
                        onChange={(value) => {
                          const updated = [...(objective.onComplete || [])];
                          const pos = (action as MoveNpcAction).position || { x: 0, y: 0, z: 0 };
                          updated[index] = { ...action, position: { ...pos, x: Number(value) || 0 } } as MoveNpcAction;
                          handleChange('onComplete', updated);
                        }}
                        styles={{
                          input: { background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', width: 70 },
                          label: { color: '#6c7086' },
                        }}
                      />
                      <NumberInput
                        size="xs"
                        label="Y"
                        value={(action as MoveNpcAction).position?.y || 0}
                        onChange={(value) => {
                          const updated = [...(objective.onComplete || [])];
                          const pos = (action as MoveNpcAction).position || { x: 0, y: 0, z: 0 };
                          updated[index] = { ...action, position: { ...pos, y: Number(value) || 0 } } as MoveNpcAction;
                          handleChange('onComplete', updated);
                        }}
                        styles={{
                          input: { background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', width: 70 },
                          label: { color: '#6c7086' },
                        }}
                      />
                      <NumberInput
                        size="xs"
                        label="Z"
                        value={(action as MoveNpcAction).position?.z || 0}
                        onChange={(value) => {
                          const updated = [...(objective.onComplete || [])];
                          const pos = (action as MoveNpcAction).position || { x: 0, y: 0, z: 0 };
                          updated[index] = { ...action, position: { ...pos, z: Number(value) || 0 } } as MoveNpcAction;
                          handleChange('onComplete', updated);
                        }}
                        styles={{
                          input: { background: '#11111b', border: '1px solid #313244', color: '#cdd6f4', width: 70 },
                          label: { color: '#6c7086' },
                        }}
                      />
                    </Group>
                  </>
                )}

              </Stack>
            </Paper>
          ))}

          {(!objective.onComplete || objective.onComplete.length === 0) && (
            <Text size="xs" c="#6c7086" fs="italic">No actions configured</Text>
          )}
        </Stack>

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
