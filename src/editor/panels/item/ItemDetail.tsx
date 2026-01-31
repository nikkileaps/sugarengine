/**
 * ItemDetail - Main content view for a selected item
 */

import {
  Stack,
  Text,
  Group,
  Badge,
  Button,
  Paper,
  Image,
  Box,
  TextInput,
  Textarea,
  Select,
  Switch,
  NumberInput,
  ScrollArea,
} from '@mantine/core';
import { ItemEntry } from './ItemPanel';
import { useEditorStore } from '../../store';

const CATEGORY_OPTIONS = [
  { value: 'quest', label: 'Quest Item' },
  { value: 'gift', label: 'Gift' },
  { value: 'key', label: 'Key Item' },
  { value: 'misc', label: 'Miscellaneous' },
];

interface QuestUsage {
  id: string;
  name: string;
  stageName: string;
  objectiveDesc: string;
  type: 'collect' | 'reward';
}

interface ItemDetailProps {
  item: ItemEntry;
  quests: {
    id: string;
    name: string;
    stages: { id: string; description: string; objectives: { type: string; target: string; description: string }[] }[];
    rewards?: { type: string; itemId?: string }[];
  }[];
  onChange: (updated: ItemEntry) => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  quest: '#f38ba8',
  gift: '#f9e2af',
  key: '#89b4fa',
  misc: '#a6adc8',
};

const CATEGORY_ICONS: Record<string, string> = {
  quest: '📜',
  gift: '🎁',
  key: '🔑',
  misc: '📦',
};

export function ItemDetail({ item, quests, onChange, onDelete, onDuplicate }: ItemDetailProps) {
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const handleChange = <K extends keyof ItemEntry>(field: K, value: ItemEntry[K]) => {
    onChange({ ...item, [field]: value });
  };

  // Find quest usages
  const findQuestUsages = (): QuestUsage[] => {
    const usages: QuestUsage[] = [];

    for (const quest of quests) {
      for (const stage of quest.stages) {
        for (const obj of stage.objectives) {
          if (obj.type === 'collect' && obj.target === item.id) {
            usages.push({
              id: quest.id,
              name: quest.name,
              stageName: stage.id,
              objectiveDesc: obj.description,
              type: 'collect',
            });
          }
        }
      }

      if (quest.rewards) {
        for (const reward of quest.rewards) {
          if (reward.type === 'item' && reward.itemId === item.id) {
            usages.push({
              id: quest.id,
              name: quest.name,
              stageName: 'Rewards',
              objectiveDesc: 'Quest reward',
              type: 'reward',
            });
          }
        }
      }
    }

    return usages;
  };

  const usages = findQuestUsages();

  const handleQuestClick = () => {
    setActiveTab('quests');
  };

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
              border: `1px solid ${CATEGORY_COLORS[item.category]}44`,
            }}
          >
            <Group justify="space-between" align="flex-start">
              <Group gap="lg">
                {/* Icon Preview */}
                <Box
                  style={{
                    width: 72,
                    height: 72,
                    background: '#313244',
                    border: `2px solid ${CATEGORY_COLORS[item.category]}`,
                    borderRadius: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 32,
                    overflow: 'hidden',
                  }}
                >
                  {item.icon ? (
                    <Image
                      src={item.icon}
                      alt={item.name}
                      w={72}
                      h={72}
                      fit="contain"
                      fallbackSrc=""
                      onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement;
                        target.style.display = 'none';
                        target.parentElement!.textContent = CATEGORY_ICONS[item.category] || '📦';
                      }}
                    />
                  ) : (
                    CATEGORY_ICONS[item.category] || '📦'
                  )}
                </Box>

                <Stack gap={4}>
                  <TextInput
                    value={item.name}
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
                    <Badge
                      variant="light"
                      size="sm"
                      style={{
                        background: `${CATEGORY_COLORS[item.category]}22`,
                        color: CATEGORY_COLORS[item.category],
                      }}
                    >
                      {item.category}
                    </Badge>
                    <Text size="xs" c="dimmed" ff="monospace">
                      {item.id.slice(0, 8)}
                    </Text>
                  </Group>
                </Stack>
              </Group>

              <Group gap="xs">
                <Button variant="subtle" size="xs" onClick={onDuplicate}>
                  Duplicate
                </Button>
                <Button color="red" variant="subtle" size="xs" onClick={onDelete}>
                  Delete
                </Button>
              </Group>
            </Group>
          </Paper>

          {/* Two column layout */}
          <Group align="flex-start" gap="lg" wrap="nowrap">
            {/* Left Column - Details */}
            <Stack gap="lg" style={{ flex: 1, minWidth: 0 }}>
              {/* Basic Info Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Details
                </Text>
                <Stack gap="sm">
                  <Group grow>
                    <Select
                      label="Category"
                      data={CATEGORY_OPTIONS}
                      value={item.category}
                      onChange={(value) => handleChange('category', (value as ItemEntry['category']) || 'misc')}
                      size="sm"
                    />
                    <TextInput
                      label="Icon Path"
                      value={item.icon || ''}
                      onChange={(e) => handleChange('icon', e.currentTarget.value || undefined)}
                      placeholder="/icons/item.png"
                      size="sm"
                    />
                  </Group>
                  <Textarea
                    label="Description"
                    value={item.description}
                    onChange={(e) => handleChange('description', e.currentTarget.value)}
                    placeholder="What is this item? What's it used for?"
                    minRows={2}
                    autosize
                    size="sm"
                  />
                </Stack>
              </Paper>

              {/* Behavior Card */}
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="md">
                  Behavior
                </Text>
                <Stack gap="md">
                  <Group>
                    <Switch
                      label="Stackable"
                      description="Can multiple be held in one slot"
                      checked={item.stackable}
                      onChange={(e) => handleChange('stackable', e.currentTarget.checked)}
                    />
                    {item.stackable && (
                      <NumberInput
                        label="Max Stack"
                        value={item.maxStack ?? 99}
                        onChange={(value) => handleChange('maxStack', typeof value === 'number' ? value : 99)}
                        min={1}
                        max={9999}
                        size="sm"
                        w={100}
                      />
                    )}
                  </Group>
                  <Switch
                    label="Giftable"
                    description="Can be given to NPCs as a gift"
                    checked={item.giftable}
                    onChange={(e) => handleChange('giftable', e.currentTarget.checked)}
                  />
                </Stack>
              </Paper>
            </Stack>

            {/* Right Column - Usage */}
            <Stack gap="lg" style={{ width: 280, flexShrink: 0 }}>
              <Paper
                p="md"
                radius="md"
                style={{ background: '#181825', border: '1px solid #313244' }}
              >
                <Group gap="xs" mb="sm">
                  <Text size="sm">📜</Text>
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    Quest Usage
                  </Text>
                  <Badge size="xs" variant="light" color={usages.length > 0 ? 'green' : 'gray'}>
                    {usages.length}
                  </Badge>
                </Group>

                {usages.length === 0 ? (
                  <Text size="xs" c="dimmed" fs="italic">
                    Not used in any quests
                  </Text>
                ) : (
                  <Stack gap={6}>
                    {usages.map((usage, i) => (
                      <Paper
                        key={`${usage.id}-${i}`}
                        p="xs"
                        radius="sm"
                        style={{ background: '#1e1e2e', cursor: 'pointer' }}
                        onClick={handleQuestClick}
                      >
                        <Group justify="space-between" mb={2}>
                          <Text size="sm">{usage.name}</Text>
                          <Badge
                            size="xs"
                            variant="light"
                            color={usage.type === 'collect' ? 'yellow' : 'green'}
                          >
                            {usage.type}
                          </Badge>
                        </Group>
                        <Text size="xs" c="dimmed">
                          {usage.objectiveDesc}
                        </Text>
                      </Paper>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Stack>
          </Group>
        </Stack>
      </Box>
    </ScrollArea>
  );
}
