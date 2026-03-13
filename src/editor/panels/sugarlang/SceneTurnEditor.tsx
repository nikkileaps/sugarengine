/**
 * SceneTurnEditor — read/write editing surface for scene language pack turns.
 *
 * Phase 3 (ADR-015): provenance indicators, auto-manual on edit,
 * Reset to Generated, no Add Turn button.
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
  Tooltip,
} from '@mantine/core';
import type {
  SceneLanguagePack,
  SceneTurn,
  EditStatus,
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

// ---------------------------------------------------------------------------
// Provenance indicator helpers (ADR-015 Phase 3)
// ---------------------------------------------------------------------------

interface ProvenanceInfo {
  color: string;
  label: string;
  tooltip: string;
}

function getProvenanceInfo(turn: SceneTurn): ProvenanceInfo {
  if (turn.orphaned) {
    return { color: '#6c7086', label: 'orphaned', tooltip: 'Source quest node no longer exists' };
  }

  const status: EditStatus = turn.editStatus ?? 'generated';
  const stale = turn.stale === true;

  switch (status) {
    case 'generated':
      return { color: '#a6e3a1', label: 'generated', tooltip: 'Freshly generated from quest source' };
    case 'reviewed':
      return stale
        ? { color: '#f9e2af', label: 'stale', tooltip: 'Reviewed — source changed since review' }
        : { color: '#89b4fa', label: 'reviewed', tooltip: 'Human-approved' };
    case 'manual':
      return stale
        ? { color: '#fab387', label: 'stale', tooltip: 'Manually edited — source changed since edit' }
        : { color: '#cba6f7', label: 'manual', tooltip: 'Hand-edited by author' };
    default:
      return { color: '#a6e3a1', label: 'generated', tooltip: 'Generated' };
  }
}

function ProvenanceDot({ turn }: { turn: SceneTurn }) {
  const info = getProvenanceInfo(turn);
  return (
    <Tooltip label={info.tooltip}>
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: info.color,
          flexShrink: 0,
        }}
      />
    </Tooltip>
  );
}

function countIssues(turns: SceneTurn[]): { stale: number; orphaned: number } {
  let stale = 0;
  let orphaned = 0;
  for (const turn of turns) {
    if (turn.orphaned) orphaned += 1;
    else if (turn.stale) stale += 1;
  }
  return { stale, orphaned };
}

// ---------------------------------------------------------------------------
// Substantive fields — editing these auto-sets editStatus to 'manual'
// ---------------------------------------------------------------------------

const SUBSTANTIVE_KEYS = new Set<keyof SceneTurn>([
  'targetText',
  'initialDelivery',
  'supportText',
  'responseMode',
  'responseData',
  'focusLexicalEntryIds',
  'reinforcementLexicalEntryIds',
  'ambientLexicalEntryIds',
  'evaluation',
]);

function isSubstantiveEdit(patch: Partial<SceneTurn>): boolean {
  return Object.keys(patch).some((key) => SUBSTANTIVE_KEYS.has(key as keyof SceneTurn));
}

// ---------------------------------------------------------------------------
// SceneTurnEditor
// ---------------------------------------------------------------------------

interface SceneTurnEditorProps {
  sceneLanguagePacks: Map<string, SceneLanguagePack>;
  onUpdateSceneLanguagePack: (key: string, updated: SceneLanguagePack) => void;
  selectedPackKey: string | null;
  onSelectPackKey: (key: string | null) => void;
  selectedBandId: string | null;
  onSelectBandId: (id: string | null) => void;
  /** Copy a refinement packet to clipboard for a specific turn. */
  onCopyRefinementPacket?: (turnId: string) => void;
  /** Copy a refinement packet for the entire selected band. */
  onCopyBandRefinementPacket?: () => void;
  /** Call LLM to refine the selected band. */
  onLlmRefineBand?: () => void;
  /** Call LLM to refine all bands in the selected pack. */
  onRefineAll?: () => void;
  /** Whether LLM refinement is in progress. */
  refining?: boolean;
}

export function SceneTurnEditor({
  sceneLanguagePacks,
  onUpdateSceneLanguagePack,
  selectedPackKey,
  onSelectPackKey,
  selectedBandId,
  onSelectBandId,
  onCopyRefinementPacket,
  onLlmRefineBand,
  onRefineAll,
  refining,
}: SceneTurnEditorProps) {
  const packEntries = Array.from(sceneLanguagePacks.entries());
  const selectedPack = selectedPackKey ? sceneLanguagePacks.get(selectedPackKey) : null;
  const selectedBand = selectedPack?.bands.find((b) => b.bandId === selectedBandId);

  const updateTurn = (turnIndex: number, patch: Partial<SceneTurn>) => {
    if (!selectedPackKey || !selectedPack || !selectedBandId) return;

    // Auto-set editStatus to 'manual' when substantive fields change (ADR-015)
    const autoManual = isSubstantiveEdit(patch);

    const updatedPack: SceneLanguagePack = {
      ...selectedPack,
      bands: selectedPack.bands.map((band) => {
        if (band.bandId !== selectedBandId) return band;
        return {
          ...band,
          turns: band.turns.map((turn, i) => {
            if (i !== turnIndex) return turn;
            const merged = { ...turn, ...patch };
            if (autoManual && merged.editStatus !== 'manual') {
              merged.editStatus = 'manual';
            }
            return merged;
          }),
        };
      }),
    };
    onUpdateSceneLanguagePack(selectedPackKey, updatedPack);
  };

  const resetTurnToGenerated = (turnIndex: number) => {
    if (!selectedPackKey || !selectedPack || !selectedBandId) return;

    const updatedPack: SceneLanguagePack = {
      ...selectedPack,
      bands: selectedPack.bands.map((band) => {
        if (band.bandId !== selectedBandId) return band;
        return {
          ...band,
          turns: band.turns.map((turn, i) => {
            if (i !== turnIndex) return turn;
            return {
              ...turn,
              editStatus: 'generated' as EditStatus,
              stale: false,
              orphaned: false,
              generationNote: undefined,
            };
          }),
        };
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
          <Group justify="space-between" gap="xs">
            <Text size="xs" fw={500}>Band</Text>
            {onRefineAll && (
              <Button size="compact-xs" variant="light" color="violet" onClick={onRefineAll} loading={refining}>
                Refine All
              </Button>
            )}
          </Group>
          <Stack gap={2}>
            {selectedPack.bands.map((band) => {
              const issues = countIssues(band.turns);
              const isSelected = selectedBandId === band.bandId;
              return (
                <Group
                  key={band.bandId}
                  gap={6}
                  p={4}
                  style={{
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: isSelected ? 'rgba(137,180,250,0.15)' : 'rgba(255,255,255,0.03)',
                  }}
                  onClick={() => onSelectBandId(band.bandId)}
                >
                  <Badge size="xs" color={isSelected ? 'blue' : 'gray'} variant={isSelected ? 'filled' : 'light'}>
                    {band.bandId}
                  </Badge>
                  <Text size="xs" style={{ flex: 1 }}>
                    {band.turns.length} turn{band.turns.length === 1 ? '' : 's'}
                  </Text>
                  {(issues.stale > 0 || issues.orphaned > 0) && (
                    <Badge size="xs" color={issues.stale > 0 ? 'yellow' : 'red'} variant="filled" circle>
                      {issues.stale + issues.orphaned}
                    </Badge>
                  )}
                </Group>
              );
            })}
          </Stack>
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
          {(() => {
            const issues = countIssues(selectedBand.turns);
            return (
              <>
                {issues.stale > 0 && (
                  <Badge size="sm" color="yellow" variant="light">
                    {issues.stale} stale
                  </Badge>
                )}
                {issues.orphaned > 0 && (
                  <Badge size="sm" color="gray" variant="light">
                    {issues.orphaned} orphaned
                  </Badge>
                )}
              </>
            );
          })()}
          <div style={{ flex: 1 }} />
          {onLlmRefineBand && (
            <Tooltip label="Refine all generated turns in this band using an LLM">
              <Button size="xs" variant="light" color="violet" onClick={onLlmRefineBand} loading={refining}>
                Refine Band
              </Button>
            </Tooltip>
          )}
        </Group>

        <Accordion variant="separated" multiple>
          {selectedBand.turns.map((turn, i) => {
            const prov = getProvenanceInfo(turn);
            return (
              <Accordion.Item key={turn.turnId} value={turn.turnId}>
                <Accordion.Control>
                  <Group gap="xs">
                    <ProvenanceDot turn={turn} />
                    <Text size="sm" fw={500} truncate style={{ maxWidth: 360 }}>
                      {turn.sourceEnglishText
                        ? `${i + 1}. ${turn.sourceEnglishText}`
                        : turn.turnId}
                    </Text>
                    <Badge size="xs" color="blue">{turn.responseMode.replace(/_/g, ' ')}</Badge>
                    {turn.speakerName && <Badge size="xs" color="gray">{turn.speakerName}</Badge>}
                    <Badge size="xs" variant="light" style={{ color: prov.color, borderColor: prov.color }}>
                      {prov.label}
                    </Badge>
                    {turn.turnRole && (
                      <Badge size="xs" variant="light" color="grape">{turn.turnRole.replace(/_/g, ' ')}</Badge>
                    )}
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <TurnEditor
                    turn={turn}
                    onChange={(patch) => updateTurn(i, patch)}
                    onResetToGenerated={() => resetTurnToGenerated(i)}
                    onCopyRefinementPacket={onCopyRefinementPacket ? () => onCopyRefinementPacket(turn.turnId) : undefined}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
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
  onResetToGenerated,
  onCopyRefinementPacket,
}: {
  turn: SceneTurn;
  onChange: (patch: Partial<SceneTurn>) => void;
  onResetToGenerated: () => void;
  onCopyRefinementPacket?: () => void;
}) {
  const canReset = turn.editStatus === 'manual' || turn.editStatus === 'reviewed';

  return (
    <Stack gap="sm">
      {/* Provenance info bar */}
      {(turn.stale || turn.orphaned) && (
        <Paper p="xs" withBorder style={{ borderColor: turn.stale ? '#f9e2af' : '#6c7086' }}>
          <Text size="xs" c={turn.stale ? 'yellow' : 'dimmed'}>
            {turn.stale
              ? 'Source content has changed since this turn was last edited. Re-sync or use "Reset to Generated" to update.'
              : 'This turn\'s source quest node no longer exists. It may be safe to remove.'}
          </Text>
        </Paper>
      )}

      <Group gap="md" grow>
        <TextInput
          label="Turn ID"
          size="xs"
          value={turn.turnId}
          readOnly
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

      {/* Provenance metadata (read-only) */}
      <Paper p="xs" withBorder bg="dark.7">
        <Group gap="xs">
          <Text size="xs" c="dimmed">Status: {turn.editStatus ?? 'generated'}</Text>
          {turn.sourceHash && <Text size="xs" c="dimmed">Hash: {turn.sourceHash}</Text>}
          {turn.generationNote && <Text size="xs" c="dimmed">Note: {turn.generationNote}</Text>}
        </Group>
      </Paper>

      <Group justify="flex-end">
        {onCopyRefinementPacket && (
          <Tooltip label="Copy a refinement packet for this turn to clipboard. Paste into an external AI assistant.">
            <Button size="xs" variant="subtle" color="violet" onClick={onCopyRefinementPacket}>
              Refine with AI
            </Button>
          </Tooltip>
        )}
        {canReset && (
          <Tooltip label="Re-derive this turn from the current quest source. Discards manual edits.">
            <Button size="xs" variant="subtle" color="yellow" onClick={onResetToGenerated}>
              Reset to Generated
            </Button>
          </Tooltip>
        )}
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
