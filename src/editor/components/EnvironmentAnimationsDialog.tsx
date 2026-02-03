/**
 * EnvironmentAnimationsDialog - Dialog for selecting emissive meshes for animations
 */

import { Modal, Stack, Text, Paper, Group, Select, ActionIcon, Button } from '@mantine/core';
import { MeshThumbnailGrid } from './MeshThumbnailGrid';

export type EnvironmentAnimationType = 'lamp_glow' | 'candle_flicker' | 'wind_sway';

export interface EnvironmentAnimationEntry {
  meshName: string;
  animationType: EnvironmentAnimationType;
  intensity?: number;
  speed?: number;
}

interface EnvironmentAnimationsDialogProps {
  opened: boolean;
  onClose: () => void;
  geometryPath: string;
  animations: EnvironmentAnimationEntry[];
  onAnimationsChange: (animations: EnvironmentAnimationEntry[]) => void;
}

export function EnvironmentAnimationsDialog({
  opened,
  onClose,
  geometryPath,
  animations,
  onAnimationsChange,
}: EnvironmentAnimationsDialogProps) {
  const handleSelectMesh = (meshName: string) => {
    if (animations.some((a) => a.meshName === meshName)) {
      return; // Already added
    }
    const newEntry: EnvironmentAnimationEntry = { meshName, animationType: 'lamp_glow' };
    onAnimationsChange([...animations, newEntry]);
  };

  const handleUpdateAnimation = (index: number, animationType: EnvironmentAnimationType) => {
    const updated = [...animations];
    const existing = updated[index];
    if (existing) {
      updated[index] = { ...existing, animationType };
      onAnimationsChange(updated);
    }
  };

  const handleRemoveAnimation = (index: number) => {
    onAnimationsChange(animations.filter((_, i) => i !== index));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Environment Animations"
      size="xl"
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
        {/* Mesh thumbnail grid */}
        <MeshThumbnailGrid
          geometryPath={geometryPath}
          existingMeshes={animations.map((a) => a.meshName)}
          onSelectMesh={handleSelectMesh}
        />

        {/* Added animations list */}
        {animations.length > 0 && (
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Added animations ({animations.length}):
            </Text>
            {animations.map((anim, index) => (
              <Paper
                key={index}
                p="xs"
                radius="sm"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Group gap="xs" wrap="nowrap">
                  <Text size="sm" style={{ flex: 1 }} truncate title={anim.meshName}>
                    {anim.meshName}
                  </Text>
                  <Select
                    data={[
                      { value: 'lamp_glow', label: '💡 Lamp Glow' },
                      { value: 'candle_flicker', label: '🕯️ Candle Flicker' },
                      { value: 'wind_sway', label: '🌿 Wind Sway' },
                    ]}
                    value={anim.animationType}
                    onChange={(val) => {
                      if (val) handleUpdateAnimation(index, val as EnvironmentAnimationType);
                    }}
                    size="xs"
                    w={160}
                  />
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    onClick={() => handleRemoveAnimation(index)}
                  >
                    ✕
                  </ActionIcon>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}

        {/* Close button */}
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Done
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
