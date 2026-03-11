/**
 * SceneTurnEditor — read/write editing surface for scene language pack turns.
 *
 * Select scenario + language + band, then edit individual turns:
 * targetText, initialDelivery, supportText, responseMode, responseData,
 * evaluation, focus/reinforcement/ambient vocabulary, repairOptions, emotion, speakerName.
 */

import {
  Stack,
  Text,
  TextInput,
  Textarea,
  Group,
  Badge,
  Paper,
  Title,
  Select,
  ActionIcon,
  ScrollArea,
  Accordion,
  Button,
  Divider,
} from '@mantine/core';
import type {
  SceneLanguagePack,
  SceneTurn,
} from '../../../plugins/sugarlang/types';
import type { ResponseContractMode } from '../../../engine/conversation/types';

const RESPONSE_MODES: { value: ResponseContractMode; label: string }[] = [
  { value: 'chip_composition', label: 'Chip Composition' },
  { value: 'object_selection', label: 'Object Selection' },
  { value: 'yes_no', label: 'Yes / No' },
  { value: 'multiple_choice', label: 'Multiple Choice' },
  { value: 'single_blank', label: 'Single Blank' },
  { value: 'blank_fill', label: 'Blank Fill' },
  { value: 'phrase_assembly', label: 'Phrase Assembly' },
  { value: 'word_bank', label: 'Word Bank' },
  { value: 'short_text', label: 'Short Text' },
  { value: 'open_text', label: 'Open Text' },
  { value: 'free_form', label: 'Free Form' },
];

interface SceneTurnEditorProps {
  sceneLanguagePacks: Map<string, SceneLanguagePack>;
  onUpdateSceneLanguagePack: (key: string, updated: SceneLanguagePack) => void;
  selectedPackKey: string | null;
  onSelectPackKey: (key: string | null) => void;
  selectedBandId: string | null;
  onSelectBandId: (id: string | null) => void;
}

export function SceneTurnEditor({
  sceneLanguagePacks,
  onUpdateSceneLanguagePack,
  selectedPackKey,
  onSelectPackKey,
  selectedBandId,
  onSelectBandId,
}: SceneTurnEditorProps) {
  const packEntries = Array.from(sceneLanguagePacks.entries());
  const selectedPack = selectedPackKey ? sceneLanguagePacks.get(selectedPackKey) : null;
  const selectedBand = selectedPack?.bands.find((b) => b.bandId === selectedBandId);

  const updateTurn = (turnIndex: number, patch: Partial<SceneTurn>) => {
    if (!selectedPackKey || !selectedPack || !selectedBandId) return;

    const updatedPack: SceneLanguagePack = {
      ...selectedPack,
      bands: selectedPack.bands.map((band) => {
        if (band.bandId !== selectedBandId) return band;
        return {
          ...band,
          turns: band.turns.map((turn, i) =>
            i === turnIndex ? { ...turn, ...patch } : turn,
          ),
        };
      }),
    };
    onUpdateSceneLanguagePack(selectedPackKey, updatedPack);
  };

  const addTurn = () => {
    if (!selectedPackKey || !selectedPack || !selectedBandId) return;

    const band = selectedPack.bands.find((b) => b.bandId === selectedBandId);
    const nextIndex = (band?.turns.length ?? 0) + 1;
    const turnId = `${selectedBandId.toLowerCase()}-${selectedPack.targetLanguage}-${String(nextIndex).padStart(2, '0')}`;

    const newTurn: SceneTurn = {
      turnId,
      targetText: '',
      focusLexicalEntryIds: [],
      reinforcementLexicalEntryIds: [],
      ambientLexicalEntryIds: [],
      responseMode: 'short_text',
    };

    const updatedPack: SceneLanguagePack = {
      ...selectedPack,
      bands: selectedPack.bands.map((b) => {
        if (b.bandId !== selectedBandId) return b;
        return { ...b, turns: [...b.turns, newTurn] };
      }),
    };
    onUpdateSceneLanguagePack(selectedPackKey, updatedPack);
  };

  const removeTurn = (turnIndex: number) => {
    if (!selectedPackKey || !selectedPack || !selectedBandId) return;

    const updatedPack: SceneLanguagePack = {
      ...selectedPack,
      bands: selectedPack.bands.map((b) => {
        if (b.bandId !== selectedBandId) return b;
        return { ...b, turns: b.turns.filter((_, i) => i !== turnIndex) };
      }),
    };
    onUpdateSceneLanguagePack(selectedPackKey, updatedPack);
  };

  // Left panel: pack + band selection
  const list = (
    <Stack gap="xs" p="sm">
      <Title order={5}>Scene Turns</Title>

      <Text size="xs" fw={500}>Scene Pack</Text>
      <ScrollArea h={150}>
        <Stack gap={2}>
          {packEntries.map(([key, pack]) => (
            <Group
              key={key}
              gap="xs"
              p={4}
              style={{
                cursor: 'pointer',
                borderRadius: 4,
                background: selectedPackKey === key ? 'rgba(137,180,250,0.15)' : undefined,
              }}
              onClick={() => {
                onSelectPackKey(key);
                onSelectBandId(pack.bands[0]?.bandId ?? null);
              }}
            >
              <Badge size="xs" color="grape">{pack.targetLanguage}</Badge>
              <Text size="xs" truncate style={{ flex: 1 }}>{pack.scenarioId}</Text>
            </Group>
          ))}
          {packEntries.length === 0 && (
            <Text size="xs" c="dimmed">No scene packs loaded</Text>
          )}
        </Stack>
      </ScrollArea>

      {selectedPack && (
        <>
          <Divider />
          <Text size="xs" fw={500}>Band</Text>
          <Group gap={4}>
            {selectedPack.bands.map((band) => (
              <Badge
                key={band.bandId}
                size="sm"
                color={selectedBandId === band.bandId ? 'blue' : 'gray'}
                variant={selectedBandId === band.bandId ? 'filled' : 'light'}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectBandId(band.bandId)}
              >
                {band.bandId} ({band.turns.length})
              </Badge>
            ))}
          </Group>
        </>
      )}

      {selectedBand && (
        <>
          <Divider />
          <Text size="xs" fw={500}>Turns</Text>
          <ScrollArea h={200}>
            <Stack gap={2}>
              {selectedBand.turns.map((turn, i) => (
                <Text
                  key={turn.turnId}
                  size="xs"
                  p={4}
                  style={{
                    borderRadius: 4,
                    background: 'rgba(255,255,255,0.03)',
                  }}
                >
                  {i + 1}. {turn.turnId}
                </Text>
              ))}
            </Stack>
          </ScrollArea>
          <Button size="xs" variant="light" onClick={addTurn}>
            + Add Turn
          </Button>
        </>
      )}
    </Stack>
  );

  // Main content: turn editing
  const content = selectedBand ? (
    <ScrollArea h="100%">
      <Stack gap="md" p="md">
        <Group gap="xs">
          <Title order={5}>
            {selectedPack!.scenarioId} / {selectedPack!.targetLanguage} / {selectedBandId}
          </Title>
          <Badge size="sm">{selectedBand.turns.length} turn(s)</Badge>
        </Group>

        <Accordion variant="separated" multiple>
          {selectedBand.turns.map((turn, i) => (
            <Accordion.Item key={turn.turnId} value={turn.turnId}>
              <Accordion.Control>
                <Group gap="xs">
                  <Text size="sm" fw={500}>{turn.turnId}</Text>
                  <Badge size="xs" color="blue">{turn.responseMode.replace(/_/g, ' ')}</Badge>
                  {turn.speakerName && <Badge size="xs" color="gray">{turn.speakerName}</Badge>}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <TurnEditor
                  turn={turn}
                  onChange={(patch) => updateTurn(i, patch)}
                  onRemove={() => removeTurn(i)}
                />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      </Stack>
    </ScrollArea>
  ) : (
    <Stack align="center" justify="center" h="100%">
      <Text c="dimmed" size="sm">Select a scene pack and band to edit turns</Text>
    </Stack>
  );

  return { list, content };
}

// ---------------------------------------------------------------------------
// TurnEditor
// ---------------------------------------------------------------------------

function TurnEditor({
  turn,
  onChange,
  onRemove,
}: {
  turn: SceneTurn;
  onChange: (patch: Partial<SceneTurn>) => void;
  onRemove: () => void;
}) {
  return (
    <Stack gap="sm">
      <Group gap="md" grow>
        <TextInput
          label="Turn ID"
          size="xs"
          value={turn.turnId}
          onChange={(e) => onChange({ turnId: e.currentTarget.value })}
        />
        <TextInput
          label="Speaker"
          size="xs"
          value={turn.speakerName ?? ''}
          onChange={(e) => onChange({ speakerName: e.currentTarget.value || undefined })}
        />
        <TextInput
          label="Emotion"
          size="xs"
          value={turn.emotion ?? ''}
          onChange={(e) => onChange({ emotion: e.currentTarget.value || undefined })}
        />
      </Group>

      <Textarea
        label="Target Text"
        description="Canonical target-language NPC line"
        size="xs"
        autosize
        minRows={2}
        value={turn.targetText}
        onChange={(e) => onChange({ targetText: e.currentTarget.value })}
      />

      <Textarea
        label="Initial Delivery"
        description="Actual line shown to player (may be mixed-language at low bands)"
        size="xs"
        autosize
        minRows={2}
        value={turn.initialDelivery ?? ''}
        onChange={(e) => onChange({ initialDelivery: e.currentTarget.value || undefined })}
      />

      <Textarea
        label="Support Text"
        description="Support-language paraphrase (repair/fallback)"
        size="xs"
        autosize
        minRows={1}
        value={turn.supportText ?? ''}
        onChange={(e) => onChange({ supportText: e.currentTarget.value || undefined })}
      />

      <Select
        label="Response Mode"
        size="xs"
        data={RESPONSE_MODES}
        value={turn.responseMode}
        onChange={(val) => {
          if (val) onChange({ responseMode: val as ResponseContractMode });
        }}
      />

      {/* Response data */}
      <ResponseDataEditor
        responseMode={turn.responseMode}
        data={turn.responseData}
        onChange={(responseData) => onChange({ responseData })}
      />

      {/* Scene vocabulary roles */}
      <div>
        <Text size="xs" fw={500} mb={4}>Focus Vocabulary</Text>
        <TagList
          values={turn.focusLexicalEntryIds}
          onChange={(focusLexicalEntryIds) => onChange({ focusLexicalEntryIds })}
          placeholder="e.g. object.suitcase"
        />
      </div>

      <div>
        <Text size="xs" fw={500} mb={4}>Reinforcement Vocabulary</Text>
        <TagList
          values={turn.reinforcementLexicalEntryIds ?? []}
          onChange={(reinforcementLexicalEntryIds) => onChange({ reinforcementLexicalEntryIds })}
          placeholder="Previously introduced entries to recycle"
        />
      </div>

      <div>
        <Text size="xs" fw={500} mb={4}>Tracked Ambient Vocabulary</Text>
        <TagList
          values={turn.ambientLexicalEntryIds ?? []}
          onChange={(ambientLexicalEntryIds) => onChange({ ambientLexicalEntryIds })}
          placeholder="Tracked entries visible but not foregrounded"
        />
      </div>

      {/* Evaluation: accepted answers */}
      <EvaluationEditor
        evaluation={turn.evaluation}
        onChange={(evaluation) => onChange({ evaluation })}
      />

      <Group justify="flex-end">
        <Button size="xs" variant="subtle" color="red" onClick={onRemove}>
          Remove Turn
        </Button>
      </Group>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// ResponseDataEditor
// ---------------------------------------------------------------------------

function ResponseDataEditor({
  responseMode,
  data,
  onChange,
}: {
  responseMode: string;
  data: SceneTurn['responseData'];
  onChange: (data: SceneTurn['responseData']) => void;
}) {
  const d = data ?? {};

  const needsChoices = ['multiple_choice', 'yes_no'].includes(responseMode);
  const needsWordBank = ['word_bank', 'phrase_assembly', 'blank_fill', 'single_blank', 'chip_composition'].includes(responseMode);
  const needsChips = responseMode === 'chip_composition';

  if (!needsChoices && !needsWordBank && !needsChips) return null;

  return (
    <Paper p="xs" withBorder>
      <Text size="xs" fw={500} mb={4}>Response Data</Text>
      <Stack gap="xs">
        {needsChoices && (
          <div>
            <Text size="xs" c="dimmed" mb={2}>Choices</Text>
            <TagList
              values={d.choices ?? []}
              onChange={(choices) => onChange({ ...d, choices })}
              placeholder="Add choice..."
            />
          </div>
        )}
        {needsWordBank && (
          <div>
            <Text size="xs" c="dimmed" mb={2}>Word Bank</Text>
            <TagList
              values={d.wordBank ?? []}
              onChange={(wordBank) => onChange({ ...d, wordBank })}
              placeholder="Add word..."
            />
          </div>
        )}
        {needsChips && (
          <div>
            <Text size="xs" c="dimmed" mb={2}>Chips</Text>
            <TagList
              values={d.chips ?? []}
              onChange={(chips) => onChange({ ...d, chips })}
              placeholder="Add chip..."
            />
          </div>
        )}
        <TextInput
          label="Hint Text"
          size="xs"
          value={d.hintText ?? ''}
          onChange={(e) => onChange({ ...d, hintText: e.currentTarget.value || undefined })}
        />
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// EvaluationEditor
// ---------------------------------------------------------------------------

function EvaluationEditor({
  evaluation,
  onChange,
}: {
  evaluation: SceneTurn['evaluation'];
  onChange: (evaluation: SceneTurn['evaluation']) => void;
}) {
  const ev = evaluation ?? {};

  return (
    <Paper p="xs" withBorder>
      <Text size="xs" fw={500} mb={4}>Evaluation</Text>
      <Stack gap="xs">
        <div>
          <Text size="xs" c="dimmed" mb={2}>Accepted Answers</Text>
          <TagList
            values={ev.acceptedAnswers ?? []}
            onChange={(acceptedAnswers) => onChange({ ...ev, acceptedAnswers })}
            placeholder="Add accepted answer..."
          />
        </div>
        <div>
          <Text size="xs" c="dimmed" mb={2}>Accepted Compositions</Text>
          <TagList
            values={ev.acceptedCompositions ?? []}
            onChange={(acceptedCompositions) => onChange({ ...ev, acceptedCompositions })}
            placeholder="Add composition..."
          />
        </div>
        <div>
          <Text size="xs" c="dimmed" mb={2}>Accepted Object IDs</Text>
          <TagList
            values={ev.acceptedObjectIds ?? []}
            onChange={(acceptedObjectIds) => onChange({ ...ev, acceptedObjectIds })}
            placeholder="Add object ID..."
          />
        </div>
      </Stack>
    </Paper>
  );
}

// ---------------------------------------------------------------------------
// TagList (reusable inline)
// ---------------------------------------------------------------------------

function TagList({
  values,
  onChange,
  placeholder,
}: {
  values?: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}) {
  const safeValues = values ?? [];

  return (
    <Stack gap={4}>
      <Group gap={4} style={{ flexWrap: 'wrap' }}>
        {safeValues.map((v, i) => (
          <Badge
            key={i}
            size="sm"
            variant="light"
            rightSection={
              <ActionIcon size={12} variant="transparent" onClick={() => onChange(safeValues.filter((_, j) => j !== i))}>
                <Text size="xs">x</Text>
              </ActionIcon>
            }
          >
            {v}
          </Badge>
        ))}
      </Group>
      <TextInput
        size="xs"
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const val = e.currentTarget.value.trim();
            if (val) {
              onChange([...safeValues, val]);
              e.currentTarget.value = '';
            }
          }
        }}
      />
    </Stack>
  );
}
