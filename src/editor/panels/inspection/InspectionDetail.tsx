/**
 * InspectionDetail - Content editor with live preview
 */

import {
  Stack,
  Text,
  Group,
  Button,
  Paper,
  Box,
  Textarea,
  TextInput,
  ActionIcon,
  Image,
  ScrollArea,
  Badge,
} from '@mantine/core';
import { InspectionEntry, InspectionSection } from './InspectionPanel';

interface InspectionDetailProps {
  inspection: InspectionEntry;
  onChange: (inspection: InspectionEntry) => void;
  onDelete: () => void;
}

export function InspectionDetail({ inspection, onChange, onDelete }: InspectionDetailProps) {
  const handleChange = <K extends keyof InspectionEntry>(field: K, value: InspectionEntry[K]) => {
    onChange({ ...inspection, [field]: value });
  };

  const handleContentChange = (content: string) => {
    onChange({ ...inspection, content: content || undefined });
  };

  const handleHeaderImageChange = (headerImage: string) => {
    onChange({ ...inspection, headerImage: headerImage || undefined });
  };

  const handleAddSection = () => {
    const sections = [...(inspection.sections || []), { heading: '', text: '' }];
    onChange({ ...inspection, sections });
  };

  const handleSectionChange = (index: number, field: 'heading' | 'text', value: string) => {
    const sections = [...(inspection.sections || [])];
    sections[index] = { ...sections[index]!, [field]: field === 'heading' && !value ? undefined : value };
    onChange({ ...inspection, sections });
  };

  const handleMoveSection = (index: number, direction: 'up' | 'down') => {
    const sections = [...(inspection.sections || [])];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;

    const temp = sections[newIndex]!;
    sections[newIndex] = sections[index]!;
    sections[index] = temp;
    onChange({ ...inspection, sections });
  };

  const handleDeleteSection = (index: number) => {
    if (!confirm('Delete this section?')) return;
    const sections = (inspection.sections || []).filter((_, i) => i !== index);
    onChange({ ...inspection, sections: sections.length > 0 ? sections : undefined });
  };

  return (
    <Group gap={0} h="100%" wrap="nowrap">
      {/* Editor Side */}
      <Stack gap={0} style={{ flex: 1, borderRight: '1px solid #313244' }} h="100%">
        {/* Header */}
        <Paper
          p="md"
          radius={0}
          style={{
            background: 'linear-gradient(135deg, #1e1e2e 0%, #181825 100%)',
            borderBottom: '1px solid #313244',
          }}
        >
          <Group justify="space-between" align="flex-start">
            <Group gap="md">
              <Box
                style={{
                  width: 48,
                  height: 48,
                  background: '#313244',
                  border: '2px solid #cba6f7',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                }}
              >
                🔍
              </Box>
              <Stack gap={2}>
                <TextInput
                  value={inspection.title}
                  onChange={(e) => handleChange('title', e.currentTarget.value)}
                  variant="unstyled"
                  styles={{
                    input: {
                      fontSize: 20,
                      fontWeight: 600,
                      color: '#cdd6f4',
                      padding: 0,
                      height: 'auto',
                      minHeight: 'auto',
                    },
                  }}
                />
                <Group gap="xs">
                  <TextInput
                    value={inspection.subtitle || ''}
                    onChange={(e) => handleChange('subtitle', e.currentTarget.value || undefined)}
                    variant="unstyled"
                    placeholder="Add subtitle..."
                    styles={{
                      input: {
                        fontSize: 12,
                        color: '#a6adc8',
                        padding: 0,
                        height: 'auto',
                        minHeight: 'auto',
                        '&::placeholder': { color: '#6c7086' },
                      },
                    }}
                  />
                  <Text size="xs" c="dimmed" ff="monospace">
                    {inspection.id.slice(0, 8)}
                  </Text>
                </Group>
              </Stack>
            </Group>
            <Group gap="xs">
              <Button variant="subtle" size="xs" onClick={handleAddSection}>
                + Section
              </Button>
              <Button variant="subtle" color="red" size="xs" onClick={onDelete}>
                Delete
              </Button>
            </Group>
          </Group>
        </Paper>

        {/* Editor Content */}
        <ScrollArea style={{ flex: 1 }}>
          <Stack p="lg" gap="lg">
            {/* Header Image Card */}
            <Paper
              p="md"
              radius="md"
              style={{ background: '#181825', border: '1px solid #313244' }}
            >
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="sm">
                Header Image
              </Text>
              <Box
                style={{
                  height: 100,
                  background: '#1e1e2e',
                  border: '1px dashed #45475a',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                {inspection.headerImage ? (
                  <Image
                    src={inspection.headerImage}
                    h={100}
                    fit="contain"
                    fallbackSrc=""
                    onError={() => {}}
                  />
                ) : (
                  <Text size="xs" c="dimmed">No image</Text>
                )}
              </Box>
              <TextInput
                placeholder="/images/header.png"
                size="xs"
                value={inspection.headerImage || ''}
                onChange={(e) => handleHeaderImageChange(e.currentTarget.value)}
              />
            </Paper>

            {/* Main Content Card */}
            <Paper
              p="md"
              radius="md"
              style={{ background: '#181825', border: '1px solid #313244' }}
            >
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="sm">
                Main Content
              </Text>
              <Textarea
                value={inspection.content || ''}
                onChange={(e) => handleContentChange(e.currentTarget.value)}
                placeholder="Enter the main content here..."
                minRows={4}
                autosize
                size="sm"
              />
            </Paper>

            {/* Sections */}
            {inspection.sections && inspection.sections.length > 0 && (
              <Stack gap="md">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Sections ({inspection.sections.length})
                </Text>
                {inspection.sections.map((section, i) => (
                  <SectionEditor
                    key={i}
                    section={section}
                    index={i}
                    total={inspection.sections!.length}
                    onChange={(field, value) => handleSectionChange(i, field, value)}
                    onMove={(direction) => handleMoveSection(i, direction)}
                    onDelete={() => handleDeleteSection(i)}
                  />
                ))}
              </Stack>
            )}
          </Stack>
        </ScrollArea>
      </Stack>

      {/* Preview Side */}
      <Stack gap={0} style={{ width: 380, minWidth: 320 }} h="100%">
        <Box
          p="md"
          style={{ background: '#181825', borderBottom: '1px solid #313244' }}
        >
          <Group gap="xs">
            <Text size="sm" fw={600}>Preview</Text>
            <Badge size="xs" variant="light" color="violet">Live</Badge>
          </Group>
        </Box>
        <ScrollArea style={{ flex: 1 }} p="lg">
          <InspectionPreview inspection={inspection} />
        </ScrollArea>
      </Stack>
    </Group>
  );
}

interface SectionEditorProps {
  section: InspectionSection;
  index: number;
  total: number;
  onChange: (field: 'heading' | 'text', value: string) => void;
  onMove: (direction: 'up' | 'down') => void;
  onDelete: () => void;
}

function SectionEditor({ section, index, total, onChange, onMove, onDelete }: SectionEditorProps) {
  return (
    <Paper
      radius="md"
      style={{ background: '#181825', border: '1px solid #313244', overflow: 'hidden' }}
    >
      <Group p="xs" style={{ background: '#1e1e2e' }} justify="space-between">
        <Group gap="xs">
          <Text size="xs" c="dimmed">⋮⋮</Text>
          <Text size="xs" c="dimmed">Section {index + 1}</Text>
        </Group>
        <Group gap={4}>
          {index > 0 && (
            <ActionIcon size="xs" variant="subtle" onClick={() => onMove('up')}>↑</ActionIcon>
          )}
          {index < total - 1 && (
            <ActionIcon size="xs" variant="subtle" onClick={() => onMove('down')}>↓</ActionIcon>
          )}
          <ActionIcon size="xs" variant="subtle" color="red" onClick={onDelete}>✕</ActionIcon>
        </Group>
      </Group>
      <Stack p="sm" gap="sm">
        <TextInput
          label="Heading"
          size="xs"
          value={section.heading || ''}
          onChange={(e) => onChange('heading', e.currentTarget.value)}
          placeholder="Optional heading..."
        />
        <Textarea
          label="Content"
          size="xs"
          value={section.text}
          onChange={(e) => onChange('text', e.currentTarget.value)}
          placeholder="Section content..."
          minRows={2}
          autosize
        />
      </Stack>
    </Paper>
  );
}

interface InspectionPreviewProps {
  inspection: InspectionEntry;
}

function InspectionPreview({ inspection }: InspectionPreviewProps) {
  return (
    <Paper
      radius="md"
      style={{
        maxWidth: 320,
        background: '#181825',
        border: '1px solid #313244',
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }}
    >
      {inspection.headerImage && (
        <Box style={{ height: 100, background: '#313244', overflow: 'hidden' }}>
          <Image
            src={inspection.headerImage}
            h={100}
            fit="cover"
            fallbackSrc=""
            onError={() => {}}
          />
        </Box>
      )}

      <Stack p="md" gap="md">
        <Stack gap={4}>
          <Text size="md" fw={600}>{inspection.title}</Text>
          {inspection.subtitle && (
            <Text size="xs" c="dimmed">{inspection.subtitle}</Text>
          )}
        </Stack>

        {inspection.content && (
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {inspection.content}
          </Text>
        )}

        {inspection.sections?.map((section, i) => (
          <Stack key={i} gap={4} pt="sm" style={{ borderTop: '1px solid #313244' }}>
            {section.heading && (
              <Text size="sm" fw={600}>{section.heading}</Text>
            )}
            <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {section.text}
            </Text>
          </Stack>
        ))}

        <Box pt="sm" style={{ borderTop: '1px solid #313244' }}>
          <Text size="xs" c="dimmed" ta="center">Press ESC to close</Text>
        </Box>
      </Stack>
    </Paper>
  );
}
