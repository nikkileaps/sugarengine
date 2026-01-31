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
} from '@mantine/core';
import { QuestStage, QuestObjective } from './QuestPanel';

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
  { value: 'location', label: 'Go to Location' },
  { value: 'collect', label: 'Collect Item' },
  { value: 'trigger', label: 'Trigger Event' },
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

        {targetOptions ? (
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
        )}

        {/* Dialogue picker for 'talk' objectives */}
        {objective.type === 'talk' && (
          <>
            <Select
              label="Dialogue"
              description="Override NPC's default dialogue"
              data={[
                { value: '', label: "Use NPC's default dialogue" },
                ...dialogues.map((d) => ({ value: d.id, label: d.name })),
              ]}
              value={objective.dialogue || ''}
              onChange={(value) => handleChange('dialogue', value || undefined)}
              searchable
              clearable
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
