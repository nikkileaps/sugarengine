/**
 * InspectionPanel - React/Mantine editor for inspectable content
 */

import { useState, ReactNode } from 'react';
import {
  Stack,
  TextInput,
  ScrollArea,
  Text,
  Group,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { useEditorStore } from '../../store';
import { InspectionDetail } from './InspectionDetail';
import { generateUUID, shortId } from '../../utils';

export interface InspectionSection {
  heading?: string;
  text: string;
}

export interface InspectionEntry {
  id: string;
  title: string;
  subtitle?: string;
  headerImage?: string;
  content?: string;
  sections?: InspectionSection[];
}

export interface InspectionPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface InspectionPanelProps {
  inspections: InspectionEntry[];
  onInspectionsChange: (inspections: InspectionEntry[]) => void;
  children: (result: InspectionPanelResult) => ReactNode;
}

export function InspectionPanel({
  inspections,
  onInspectionsChange,
  children,
}: InspectionPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const setDirty = useEditorStore((s) => s.setDirty);

  const selectedInspection = selectedId
    ? inspections.find((i) => i.id === selectedId)
    : null;

  const filteredInspections = inspections.filter(
    (inspection) =>
      inspection.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inspection.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = () => {
    const id = generateUUID();
    const newInspection: InspectionEntry = {
      id,
      title: 'New Document',
      subtitle: 'Subtitle',
      content: 'Enter your content here...',
    };
    onInspectionsChange([...inspections, newInspection]);
    setSelectedId(id);
    setDirty(true);
  };

  const handleUpdate = (updated: InspectionEntry) => {
    onInspectionsChange(inspections.map((i) => (i.id === updated.id ? updated : i)));
    setDirty(true);
  };

  const handleDelete = (id: string) => {
    onInspectionsChange(inspections.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
    setDirty(true);
  };

  const result: InspectionPanelResult = {
    // Entry list (left panel)
    list: (
      <Stack gap="xs" h="100%">
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            Inspections ({inspections.length})
          </Text>
          <Tooltip label="Create Inspection">
            <ActionIcon variant="subtle" onClick={handleCreate}>
              +
            </ActionIcon>
          </Tooltip>
        </Group>

        <TextInput
          placeholder="Search inspections..."
          size="xs"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.currentTarget.value)}
        />

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap={4}>
            {filteredInspections.map((inspection) => (
              <Group
                key={inspection.id}
                p="xs"
                gap="xs"
                style={{
                  background:
                    selectedId === inspection.id ? 'var(--mantine-color-dark-6)' : undefined,
                  borderRadius: 'var(--mantine-radius-sm)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedId(inspection.id)}
              >
                <Text size="lg">🔍</Text>
                <Stack gap={0} style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    {inspection.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {inspection.subtitle ?? 'Document'} · {shortId(inspection.id)}
                  </Text>
                </Stack>
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Stack>
    ),

    // Main content (center panel)
    content: selectedInspection ? (
      <InspectionDetail
        inspection={selectedInspection}
        onChange={handleUpdate}
        onDelete={() => handleDelete(selectedInspection.id)}
      />
    ) : (
      <Stack align="center" justify="center" h="100%" gap="md">
        <Text size="xl">🔍</Text>
        <Text c="dimmed">Select an inspection to edit</Text>
        <Text size="sm" c="dimmed" ta="center" maw={300}>
          Create inspectable content like signs, newspapers, and documents.
        </Text>
      </Stack>
    ),

    // Inspector (right panel) - properties now in main content
    inspector: null,
  };

  return <>{children(result)}</>;
}
