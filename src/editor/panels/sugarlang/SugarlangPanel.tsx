/**
 * SugarlangPanel - Minimal editor panel for inspecting Sugarlang artifacts.
 *
 * Phase 4 scope: read-only inspection of loaded artifacts, validation status,
 * artifact export (migration), and draft scaffold generation.
 *
 * Full authoring surfaces are deferred to Phase 6.
 */

import { ReactNode, useCallback, useEffect, useState } from 'react';
import {
  Stack,
  Text,
  Group,
  Badge,
  Paper,
  Title,
  Button,
  ScrollArea,
  Accordion,
  Code,
  Alert,
} from '@mantine/core';
import type { PluginConfigData } from '../../store/useEditorStore';
import {
  listPluginArtifacts,
  loadAllSugarlangArtifacts,
  writeAllSugarlangArtifacts,
} from '../../game-root/plugin-artifacts';
import { deserializeContentBundle, validateContentBundle } from '../../../plugins/sugarlang/content/artifacts';
import { generateFindTheLuggageArtifacts } from '../../../plugins/sugarlang/content/migrate-to-artifacts';
import { generateDraftScaffold, type ScaffoldProjectInput } from '../../../plugins/sugarlang/content/draft-scaffold';
import type { SugarlangContentBundle } from '../../../plugins/sugarlang/types';
import type { ArtifactValidationResult } from '../../../plugins/sugarlang/content/artifacts';

export interface SugarlangPanelResult {
  list: ReactNode;
  content: ReactNode;
  inspector: ReactNode;
}

interface SugarlangPanelProps {
  gameRootPath: string | null;
  gameId: string;
  plugins: PluginConfigData[];
  onPluginsChange: (plugins: PluginConfigData[]) => void;
  /** Simplified project data for draft scaffolding. */
  projectInput?: ScaffoldProjectInput;
  children: (result: SugarlangPanelResult) => ReactNode;
}

interface ArtifactState {
  files: string[];
  bundle: SugarlangContentBundle | null;
  validation: ArtifactValidationResult | null;
  loadErrors: string[];
  loadWarnings: string[];
  loading: boolean;
}

export function SugarlangPanel({
  gameRootPath,
  gameId,
  plugins,
  onPluginsChange,
  projectInput,
  children,
}: SugarlangPanelProps) {
  const [state, setState] = useState<ArtifactState>({
    files: [],
    bundle: null,
    validation: null,
    loadErrors: [],
    loadWarnings: [],
    loading: false,
  });
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const sugarlangPlugin = plugins.find((p) => p.id === 'sugarlang');
  const isEnabled = sugarlangPlugin?.enabled !== false;

  // Toggle sugarlang plugin enabled/disabled
  const toggleEnabled = useCallback(() => {
    const existing = plugins.find((p) => p.id === 'sugarlang');
    if (existing) {
      onPluginsChange(
        plugins.map((p) => p.id === 'sugarlang' ? { ...p, enabled: !isEnabled } : p),
      );
    } else {
      onPluginsChange([...plugins, { id: 'sugarlang', enabled: true }]);
    }
  }, [plugins, onPluginsChange, isEnabled]);

  // Load artifacts from disk
  const loadArtifacts = useCallback(async () => {
    if (!gameRootPath || !gameId) return;

    setState((s) => ({ ...s, loading: true }));

    try {
      const files = await listPluginArtifacts(gameRootPath, gameId, 'sugarlang');
      if (files.length === 0) {
        setState({
          files: [],
          bundle: null,
          validation: null,
          loadErrors: [],
          loadWarnings: ['No Sugarlang artifacts found. Use "Export Demo Content" or "Generate Draft" to create them.'],
          loading: false,
        });
        return;
      }

      const artifactMap = await loadAllSugarlangArtifacts(gameRootPath, gameId);
      const { bundle, errors, warnings } = deserializeContentBundle(artifactMap);
      const validation = validateContentBundle(bundle);

      setState({
        files,
        bundle,
        validation,
        loadErrors: errors,
        loadWarnings: warnings,
        loading: false,
      });
    } catch (e) {
      setState({
        files: [],
        bundle: null,
        validation: null,
        loadErrors: [e instanceof Error ? e.message : String(e)],
        loadWarnings: [],
        loading: false,
      });
    }
  }, [gameRootPath, gameId]);

  useEffect(() => {
    if (gameRootPath && gameId) {
      loadArtifacts();
    }
  }, [gameRootPath, gameId, loadArtifacts]);

  // Export Find the Luggage demo content as artifacts
  const handleExportDemo = useCallback(async () => {
    if (!gameRootPath || !gameId) return;
    try {
      const files = generateFindTheLuggageArtifacts('approved');
      await writeAllSugarlangArtifacts(gameRootPath, gameId, files);
      setActionFeedback(`Exported ${files.size} artifact files.`);
      await loadArtifacts();
    } catch (e) {
      setActionFeedback(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [gameRootPath, gameId, loadArtifacts]);

  // Generate draft scaffolding from project content
  const handleGenerateDraft = useCallback(async () => {
    if (!gameRootPath || !gameId || !projectInput) return;
    try {
      const files = generateDraftScaffold(projectInput);
      await writeAllSugarlangArtifacts(gameRootPath, gameId, files);
      setActionFeedback(`Generated ${files.size} draft artifact files.`);
      await loadArtifacts();
    } catch (e) {
      setActionFeedback(`Draft generation failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [gameRootPath, gameId, projectInput, loadArtifacts]);

  // Build the panel sections
  const list = (
    <Stack gap="xs" p="sm">
      <Title order={5}>Sugarlang</Title>

      <Group gap="xs">
        <Badge color={isEnabled ? 'green' : 'gray'} size="sm">
          {isEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
        <Button size="xs" variant="subtle" onClick={toggleEnabled}>
          {isEnabled ? 'Disable' : 'Enable'}
        </Button>
      </Group>

      <Text size="xs" c="dimmed">Artifact files</Text>

      {state.loading && <Text size="xs" c="dimmed">Loading...</Text>}

      {state.files.length === 0 && !state.loading && (
        <Text size="xs" c="dimmed">No artifacts on disk</Text>
      )}

      <ScrollArea h={300}>
        <Stack gap={2}>
          {state.files.map((file) => (
            <Button
              key={file}
              size="xs"
              variant={selectedFile === file ? 'light' : 'subtle'}
              onClick={() => setSelectedFile(file)}
              styles={{ root: { justifyContent: 'flex-start', fontFamily: 'monospace', fontSize: 11 } }}
              fullWidth
            >
              {file}
            </Button>
          ))}
        </Stack>
      </ScrollArea>

      <Group gap="xs" mt="sm">
        <Button size="xs" variant="light" onClick={handleExportDemo} disabled={!gameRootPath}>
          Export Demo
        </Button>
        <Button size="xs" variant="light" onClick={handleGenerateDraft} disabled={!gameRootPath || !projectInput}>
          Generate Draft
        </Button>
        <Button size="xs" variant="subtle" onClick={loadArtifacts} disabled={state.loading}>
          Reload
        </Button>
      </Group>
    </Stack>
  );

  const content = (
    <ScrollArea h="100%">
      <Stack gap="md" p="md">
        {actionFeedback && (
          <Alert color="blue" withCloseButton onClose={() => setActionFeedback(null)}>
            {actionFeedback}
          </Alert>
        )}

        {/* Validation summary */}
        {state.validation && (
          <Paper p="sm" withBorder>
            <Title order={6} mb="xs">Validation</Title>
            <Group gap="xs">
              <Badge color={state.validation.valid ? 'green' : 'red'} size="sm">
                {state.validation.valid ? 'Valid' : `${state.validation.errors.length} error(s)`}
              </Badge>
              {state.validation.warnings.length > 0 && (
                <Badge color="yellow" size="sm">{state.validation.warnings.length} warning(s)</Badge>
              )}
            </Group>
            {state.validation.errors.length > 0 && (
              <Stack gap={2} mt="xs">
                {state.validation.errors.map((e, i) => (
                  <Text key={i} size="xs" c="red">{e}</Text>
                ))}
              </Stack>
            )}
            {state.validation.warnings.length > 0 && (
              <Stack gap={2} mt="xs">
                {state.validation.warnings.map((w, i) => (
                  <Text key={i} size="xs" c="yellow">{w}</Text>
                ))}
              </Stack>
            )}
          </Paper>
        )}

        {state.loadErrors.length > 0 && (
          <Alert color="red" title="Load Errors">
            {state.loadErrors.map((e, i) => <Text key={i} size="xs">{e}</Text>)}
          </Alert>
        )}

        {state.loadWarnings.length > 0 && state.loadErrors.length === 0 && !state.validation && (
          <Alert color="yellow" title="Warnings">
            {state.loadWarnings.map((w, i) => <Text key={i} size="xs">{w}</Text>)}
          </Alert>
        )}

        {/* Bundle summary */}
        {state.bundle && (
          <Accordion variant="separated" defaultValue="summary">
            <Accordion.Item value="summary">
              <Accordion.Control>
                <Text size="sm" fw={500}>Content Summary</Text>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap={4}>
                  <Group gap="xs">
                    <Text size="xs" w={140}>Scenarios:</Text>
                    <Badge size="sm">{state.bundle.scenarios.size}</Badge>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" w={140}>Scene Language Packs:</Text>
                    <Badge size="sm">{state.bundle.sceneLanguagePacks.size}</Badge>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" w={140}>Grounding Maps:</Text>
                    <Badge size="sm">{state.bundle.groundingMaps.size}</Badge>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" w={140}>Quest Bindings:</Text>
                    <Badge size="sm">{state.bundle.questBindings.size}</Badge>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" w={140}>Lexicons:</Text>
                    <Badge size="sm">{state.bundle.lexicons.size}</Badge>
                  </Group>
                  <Group gap="xs">
                    <Text size="xs" w={140}>Band Policies:</Text>
                    <Badge size="sm">{state.bundle.bandPolicies.policies.length}</Badge>
                  </Group>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* Scenarios detail */}
            {Array.from(state.bundle.scenarios.values()).map((scenario) => (
              <Accordion.Item key={scenario.scenarioId} value={`scenario-${scenario.scenarioId}`}>
                <Accordion.Control>
                  <Group gap="xs">
                    <Badge size="xs" color="blue">Scenario</Badge>
                    <Text size="sm">{scenario.scenarioId}</Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={4}>
                    <Text size="xs"><b>Task:</b> {scenario.communicativeTask}</Text>
                    <Text size="xs"><b>Bands:</b> {scenario.supportedBands.join(', ')}</Text>
                    <Text size="xs"><b>NPCs:</b> {(scenario.npcNames ?? scenario.npcIds).join(', ')}</Text>
                    <Text size="xs"><b>Referents:</b> {scenario.activeReferents.length}</Text>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}

            {/* Scene packs detail */}
            {Array.from(state.bundle.sceneLanguagePacks.values()).map((pack) => (
              <Accordion.Item key={`${pack.scenarioId}:${pack.targetLanguage}`} value={`pack-${pack.scenarioId}-${pack.targetLanguage}`}>
                <Accordion.Control>
                  <Group gap="xs">
                    <Badge size="xs" color="grape">Scene Pack</Badge>
                    <Text size="sm">{pack.scenarioId} ({pack.targetLanguage})</Text>
                  </Group>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap={4}>
                    <Text size="xs"><b>Target:</b> {pack.targetLanguage} / <b>Support:</b> {pack.supportLanguage}</Text>
                    {pack.bands.map((band) => (
                      <Group key={band.bandId} gap="xs">
                        <Badge size="xs">{band.bandId}</Badge>
                        <Text size="xs">{band.turns.length} turn(s)</Text>
                      </Group>
                    ))}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        )}
      </Stack>
    </ScrollArea>
  );

  const inspector = selectedFile ? (
    <Stack gap="xs" p="sm">
      <Title order={6}>Selected Artifact</Title>
      <Code block style={{ fontSize: 11 }}>{selectedFile}</Code>
    </Stack>
  ) : null;

  return <>{children({ list, content, inspector })}</>;
}
