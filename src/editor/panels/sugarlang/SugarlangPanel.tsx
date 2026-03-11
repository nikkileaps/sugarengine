/**
 * SugarlangPanel - scenario-first Sugarlang editor surface.
 *
 * Organizes authoring around scenarios, with language packs shown as
 * language-specific realizations of that selected scenario. Bundle-wide
 * controls such as band policies and raw artifact inspection live under
 * plugin settings instead of the scenario tab strip.
 */

import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Code,
  Group,
  Modal,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
  Title,
} from '@mantine/core';
import type { PluginConfigData } from '../../store/useEditorStore';
import {
  deletePluginArtifact,
  listPluginArtifacts,
  loadAllSugarlangArtifacts,
  writePluginArtifact,
  writeAllSugarlangArtifacts,
} from '../../game-root/plugin-artifacts';
import {
  artifactPaths,
  deserializeContentBundle,
  getLexiconPlanningStatus,
  serializeLexiconPack,
  serializeContentBundle,
  validateContentBundle,
} from '../../../plugins/sugarlang/content/artifacts';
import {
  generateDraftScaffold,
  type ScaffoldProjectInput,
} from '../../../plugins/sugarlang/content/draft-scaffold';
import { syncInteractionsFromQuest } from '../../../plugins/sugarlang/content/sync-from-quest';
// generate-banded-turns pure functions are still available for future use;
// runtime now walks dialogue trees per-node (Plan 005).
import { getSharedLexicon, getAvailableSharedLanguages } from '../../../plugins/sugarlang/content/lexicons';
import type {
  ArtifactValidationResult,
} from '../../../plugins/sugarlang/content/artifacts';
import type {
  BandPolicyPack,
  GroundedQuestBinding,
  GroundingMap,
  LexiconPack,
  ScenarioBrief,
  SceneLanguagePack,
  SugarlangContentBundle,
} from '../../../plugins/sugarlang/types';
import { BandMatrixEditor } from './BandMatrixEditor';
import { ScenarioEditor } from './ScenarioEditor';
import { SceneTurnEditor } from './SceneTurnEditor';

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
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSaveHandler?: (handler: (() => Promise<void>) | null) => void;
  onRegisterOpenSettingsHandler?: (handler: (() => void) | null) => void;
  /** Simplified project data for draft scaffolding. */
  projectInput?: ScaffoldProjectInput;
  children: (result: SugarlangPanelResult) => ReactNode;
}

type SubTab = 'overview' | 'scenario' | 'languages';
type PluginSettingsTab = 'languages' | 'band-policies' | 'lexicons' | 'artifacts';

interface ArtifactState {
  files: string[];
  /** The saved-on-disk bundle (source of truth for dirty comparison). */
  savedBundle: SugarlangContentBundle | null;
  /** The editable in-memory bundle (may differ from saved). */
  editBundle: SugarlangContentBundle | null;
  validation: ArtifactValidationResult | null;
  loadErrors: string[];
  loadWarnings: string[];
  loading: boolean;
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Deep-clone a content bundle (Maps + JSON-safe plain data). */
function cloneBundle(bundle: SugarlangContentBundle): SugarlangContentBundle {
  return {
    scenarios: new Map(Array.from(bundle.scenarios.entries()).map(([k, v]) => [k, clonePlain(v)])),
    groundingMaps: new Map(Array.from(bundle.groundingMaps.entries()).map(([k, v]) => [k, clonePlain(v)])),
    lexicons: new Map(Array.from(bundle.lexicons.entries()).map(([k, v]) => [k, clonePlain(v)])),
    bandPolicies: clonePlain(bundle.bandPolicies),
    sceneLanguagePacks: new Map(
      Array.from(bundle.sceneLanguagePacks.entries()).map(([k, v]) => [k, clonePlain(v)]),
    ),
    questBindings: new Map(Array.from(bundle.questBindings.entries()).map(([k, v]) => [k, clonePlain(v)])),
  };
}

function sortEntries<T>(map: Map<string, T>): Array<[string, T]> {
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function bundleFingerprint(bundle: SugarlangContentBundle): string {
  return JSON.stringify({
    scenarios: sortEntries(bundle.scenarios),
    groundingMaps: sortEntries(bundle.groundingMaps),
    lexicons: sortEntries(bundle.lexicons),
    bandPolicies: [...bundle.bandPolicies.policies].sort((a, b) => a.bandId.localeCompare(b.bandId)),
    sceneLanguagePacks: sortEntries(bundle.sceneLanguagePacks),
    questBindings: sortEntries(bundle.questBindings),
  });
}

function getScenarioPackEntries(
  bundle: SugarlangContentBundle | null,
  scenarioId: string | null,
): Array<[string, SceneLanguagePack]> {
  if (!bundle || !scenarioId) return [];
  return Array.from(bundle.sceneLanguagePacks.entries())
    .filter(([, pack]) => pack.scenarioId === scenarioId)
    .sort(([a], [b]) => a.localeCompare(b));
}

function getScenarioLanguages(packEntries: Array<[string, SceneLanguagePack]>): string[] {
  return Array.from(new Set(packEntries.map(([, pack]) => pack.targetLanguage))).sort();
}

function getBundleLanguagesFromArtifacts(
  files: string[],
  bundle: SugarlangContentBundle,
): string[] {
  return Array.from(new Set([
    ...Array.from(bundle.sceneLanguagePacks.values()).map((pack) => pack.targetLanguage),
    ...Array.from(bundle.lexicons.keys()),
    ...files.flatMap((path) => {
      const match = path.match(/^languages\/([^/]+)\//);
      return match?.[1] ? [match[1]] : [];
    }),
  ])).sort();
}

function ensureBundleLexicons(
  bundle: SugarlangContentBundle,
  languages: string[],
): {
  bundle: SugarlangContentBundle;
  repairedLexicons: Array<{ language: string; lexicon: LexiconPack; reason: string }>;
} {
  const nextBundle = cloneBundle(bundle);
  const repairedLexicons: Array<{ language: string; lexicon: LexiconPack; reason: string }> = [];

  for (const language of languages) {
    const current = nextBundle.lexicons.get(language);
    const shared = getSharedLexicon(language);
    const needsRepair = !current
      || current.entries.length === 0
      || current.targetLanguage !== language
      || (
        current.entries.length < shared.entries.length
        && current.entries.length < 60
      );
    if (!needsRepair) continue;

    nextBundle.lexicons.set(language, shared);
    repairedLexicons.push({
      language,
      lexicon: shared,
      reason: !current
        ? 'missing'
        : current.entries.length === 0
          ? 'empty'
          : current.targetLanguage !== language
            ? 'target mismatch'
            : 'undersized starter',
    });
  }

  return { bundle: nextBundle, repairedLexicons };
}

function getScenarioTurnCount(packEntries: Array<[string, SceneLanguagePack]>): number {
  return packEntries.reduce(
    (count, [, pack]) => count + pack.bands.reduce((bandCount, band) => bandCount + band.turns.length, 0),
    0,
  );
}

function getScenarioArtifactPaths(
  scenarioId: string,
  packEntries: Array<[string, SceneLanguagePack]>,
): string[] {
  const languages = getScenarioLanguages(packEntries);
  return [
    artifactPaths.scenario(scenarioId),
    artifactPaths.groundingMap(scenarioId),
    artifactPaths.questBindings(scenarioId),
    ...packEntries.map(([, pack]) => artifactPaths.sceneLanguagePack(pack.targetLanguage, scenarioId)),
    ...languages.map((lang) => artifactPaths.lexicon(lang)),
    artifactPaths.bandPolicies(),
  ];
}

function summarizeScenarioTask(task: string): string {
  const normalized = task.trim();
  if (normalized.length <= 80) return normalized;
  return `${normalized.slice(0, 77)}...`;
}

function findGeneratedScenarioId(files: Map<string, string>): string | null {
  for (const path of files.keys()) {
    if (
      path.startsWith('scenarios/')
      && path.endsWith('.json')
      && !path.endsWith('.grounding.json')
      && !path.endsWith('.bindings.json')
    ) {
      return path.slice('scenarios/'.length, -'.json'.length);
    }
  }
  return null;
}

function filterQuestDraftFiles(
  generatedFiles: Map<string, string>,
  existingFiles: Set<string>,
  scenarioId: string,
): Map<string, string> {
  const filesToWrite = new Map<string, string>();
  const scenarioFile = artifactPaths.scenario(scenarioId);
  const groundingFile = artifactPaths.groundingMap(scenarioId);
  const bindingsFile = artifactPaths.questBindings(scenarioId);

  for (const [path, content] of generatedFiles) {
    const isScenarioScopedFile = (
      path === scenarioFile
      || path === groundingFile
      || path === bindingsFile
      || path.endsWith(`/scenes/${scenarioId}.json`)
    );

    if (isScenarioScopedFile) {
      filesToWrite.set(path, content);
      continue;
    }

    if (path === artifactPaths.bandPolicies() && !existingFiles.has(path)) {
      filesToWrite.set(path, content);
      continue;
    }

    if (path.match(/^languages\/[^/]+\/lexicon\.json$/) && !existingFiles.has(path)) {
      filesToWrite.set(path, content);
    }
  }

  return filesToWrite;
}

export function SugarlangPanel({
  gameRootPath,
  gameId,
  plugins,
  onPluginsChange: _onPluginsChange,
  onDirtyChange,
  onRegisterSaveHandler,
  onRegisterOpenSettingsHandler,
  projectInput,
  children,
}: SugarlangPanelProps) {
  const [state, setState] = useState<ArtifactState>({
    files: [],
    savedBundle: null,
    editBundle: null,
    validation: null,
    loadErrors: [],
    loadWarnings: [],
    loading: false,
  });
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [selectedTurnPackKey, setSelectedTurnPackKey] = useState<string | null>(null);
  const [selectedTurnBandId, setSelectedTurnBandId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [createScenarioModalOpen, setCreateScenarioModalOpen] = useState(false);
  const [selectedQuestIdForCreation, setSelectedQuestIdForCreation] = useState<string | null>(null);
  const [pluginSettingsOpen, setPluginSettingsOpen] = useState(false);
  const [pluginSettingsTab, setPluginSettingsTab] = useState<PluginSettingsTab>('band-policies');

  const sugarlangPlugin = plugins.find((plugin) => plugin.id === 'sugarlang');
  const isEnabled = sugarlangPlugin?.enabled !== false;
  const disabledLanguages = useMemo(
    () => new Set<string>(
      Array.isArray(sugarlangPlugin?.disabledLanguages)
        ? (sugarlangPlugin.disabledLanguages as string[])
        : [],
    ),
    [sugarlangPlugin?.disabledLanguages],
  );

  const savedFingerprint = useMemo(
    () => (state.savedBundle ? bundleFingerprint(state.savedBundle) : null),
    [state.savedBundle],
  );
  const editFingerprint = useMemo(
    () => (state.editBundle ? bundleFingerprint(state.editBundle) : null),
    [state.editBundle],
  );
  const isDirty = savedFingerprint !== null && editFingerprint !== null && savedFingerprint !== editFingerprint;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const liveValidation = useMemo(() => {
    if (!state.editBundle) return null;
    return validateContentBundle(state.editBundle);
  }, [state.editBundle]);

  const scenarioEntries = useMemo(
    () => (
      state.editBundle
        ? Array.from(state.editBundle.scenarios.values()).sort((a, b) => a.scenarioId.localeCompare(b.scenarioId))
        : []
    ),
    [state.editBundle],
  );

  const filteredScenarios = useMemo(() => {
    if (!searchQuery.trim()) return scenarioEntries;
    const query = searchQuery.trim().toLowerCase();
    return scenarioEntries.filter((scenario) =>
      scenario.scenarioId.toLowerCase().includes(query)
      || scenario.communicativeTask.toLowerCase().includes(query)
      || scenario.npcIds.some((npcId) => npcId.toLowerCase().includes(query))
      || (scenario.npcNames ?? []).some((name) => name.toLowerCase().includes(query)),
    );
  }, [scenarioEntries, searchQuery]);

  const selectedScenario = useMemo(
    () => (
      selectedScenarioId && state.editBundle
        ? state.editBundle.scenarios.get(selectedScenarioId) ?? null
        : null
    ),
    [selectedScenarioId, state.editBundle],
  );

  const selectedScenarioPackEntries = useMemo(
    () => getScenarioPackEntries(state.editBundle, selectedScenarioId),
    [state.editBundle, selectedScenarioId],
  );

  const selectedScenarioGrounding = useMemo<GroundingMap | null>(
    () => (
      selectedScenarioId && state.editBundle
        ? state.editBundle.groundingMaps.get(selectedScenarioId) ?? null
        : null
    ),
    [selectedScenarioId, state.editBundle],
  );

  const selectedScenarioBindings = useMemo<GroundedQuestBinding[]>(
    () => (
      selectedScenarioId && state.editBundle
        ? state.editBundle.questBindings.get(selectedScenarioId) ?? []
        : []
    ),
    [selectedScenarioId, state.editBundle],
  );

  const selectedScenarioLanguages = useMemo(
    () => getScenarioLanguages(selectedScenarioPackEntries),
    [selectedScenarioPackEntries],
  );

  const selectedScenarioTurnCount = useMemo(
    () => getScenarioTurnCount(selectedScenarioPackEntries),
    [selectedScenarioPackEntries],
  );

  const selectedScenarioArtifactPaths = useMemo(
    () => (
      selectedScenarioId
        ? getScenarioArtifactPaths(selectedScenarioId, selectedScenarioPackEntries)
        : []
    ),
    [selectedScenarioId, selectedScenarioPackEntries],
  );

  const availableQuests = useMemo(
    () => projectInput?.quests ?? [],
    [projectInput],
  );
  const canCreateScenario = Boolean(gameRootPath) && availableQuests.length > 0;
  const canSyncScenario = Boolean(
    selectedScenario?.associatedQuestId
    && availableQuests.some((quest) => quest.id === selectedScenario.associatedQuestId),
  );

  const questOptions = useMemo(
    () => availableQuests.map((quest) => ({
      value: quest.id,
      label: quest.name,
    })),
    [availableQuests],
  );

  const editArtifactFiles = useMemo(
    () => (state.editBundle ? serializeContentBundle(state.editBundle) : null),
    [state.editBundle],
  );

  const bundleLanguages = useMemo(
    () => (
      state.editBundle
        ? Array.from(new Set([
          ...Array.from(state.editBundle.sceneLanguagePacks.values()).map((pack) => pack.targetLanguage),
          ...Array.from(state.editBundle.lexicons.keys()),
        ]))
          .sort()
        : []
    ),
    [state.editBundle],
  );

  const toggleLanguage = useCallback((language: string, enabled: boolean) => {
    const current = Array.isArray(sugarlangPlugin?.disabledLanguages)
      ? new Set(sugarlangPlugin.disabledLanguages as string[])
      : new Set<string>();
    if (enabled) {
      current.delete(language);
    } else {
      current.add(language);
    }
    const updatedPlugin = { ...sugarlangPlugin!, disabledLanguages: Array.from(current) };
    const nextPlugins = plugins.map((p) => (p.id === 'sugarlang' ? updatedPlugin : p));
    _onPluginsChange(nextPlugins);
  }, [sugarlangPlugin, plugins, _onPluginsChange]);

  const loadArtifacts = useCallback(async () => {
    if (!gameRootPath || !gameId) return;

    setState((current) => ({ ...current, loading: true }));

    try {
      const files = await listPluginArtifacts(gameRootPath, gameId, 'sugarlang');
      if (files.length === 0) {
        setState({
          files: [],
          savedBundle: null,
          editBundle: null,
          validation: null,
          loadErrors: [],
          loadWarnings: ['No Sugarlang artifacts found. Use the + button to create them.'],
          loading: false,
        });
        return;
      }

      const artifactMap = await loadAllSugarlangArtifacts(gameRootPath, gameId);
      const { bundle, errors, warnings } = deserializeContentBundle(artifactMap);
      const bundleLanguages = getBundleLanguagesFromArtifacts(files, bundle);
      const { bundle: repairedBundle, repairedLexicons } = ensureBundleLexicons(bundle, bundleLanguages);

      if (repairedLexicons.length > 0) {
        for (const repaired of repairedLexicons) {
          await writePluginArtifact(
            gameRootPath,
            gameId,
            'sugarlang',
            artifactPaths.lexicon(repaired.language),
            serializeLexiconPack(repaired.lexicon, 'draft'),
          );
        }
      }

      const nextFiles = Array.from(new Set([
        ...files,
        ...repairedLexicons.map((repaired) => artifactPaths.lexicon(repaired.language)),
      ])).sort();
      const validation = validateContentBundle(repairedBundle);

      console.log(
        `[SL·Editor] loaded ${nextFiles.length} artifact files →`
        + ` ${repairedBundle.scenarios.size} scenarios, ${repairedBundle.sceneLanguagePacks.size} scene packs,`
        + ` ${repairedBundle.bandPolicies.policies.length} band policies`
        + ` | ${errors.length} errors, ${warnings.length} warnings`
        + ` | valid=${validation.valid}`,
      );

      setState({
        files: nextFiles,
        savedBundle: repairedBundle,
        editBundle: cloneBundle(repairedBundle),
        validation,
        loadErrors: errors,
        loadWarnings: repairedLexicons.length > 0
          ? [
            ...warnings,
            `Seeded bundle lexicons for ${repairedLexicons.map((repaired) => repaired.language).join(', ')} from the shared language files.`,
          ]
          : warnings,
        loading: false,
      });
    } catch (error) {
      setState({
        files: [],
        savedBundle: null,
        editBundle: null,
        validation: null,
        loadErrors: [error instanceof Error ? error.message : String(error)],
        loadWarnings: [],
        loading: false,
      });
    }
  }, [gameRootPath, gameId]);

  useEffect(() => {
    if (gameRootPath && gameId) {
      void loadArtifacts();
    }
  }, [gameRootPath, gameId, loadArtifacts]);

  useEffect(() => {
    if (!scenarioEntries.length) {
      if (selectedScenarioId !== null) setSelectedScenarioId(null);
      return;
    }
    if (!selectedScenarioId || !scenarioEntries.some((scenario) => scenario.scenarioId === selectedScenarioId)) {
      setSelectedScenarioId(scenarioEntries[0]?.scenarioId ?? null);
    }
  }, [scenarioEntries, selectedScenarioId]);

  useEffect(() => {
    if (!state.files.length) {
      if (selectedFile !== null) setSelectedFile(null);
      return;
    }
    if (!selectedFile || !state.files.includes(selectedFile)) {
      setSelectedFile(state.files[0] ?? null);
    }
  }, [state.files, selectedFile]);

  useEffect(() => {
    if (!selectedScenarioPackEntries.length) {
      if (selectedTurnPackKey !== null) setSelectedTurnPackKey(null);
      if (selectedTurnBandId !== null) setSelectedTurnBandId(null);
      return;
    }

    const nextPackKey = (
      selectedTurnPackKey && selectedScenarioPackEntries.some(([key]) => key === selectedTurnPackKey)
        ? selectedTurnPackKey
        : selectedScenarioPackEntries[0]?.[0] ?? null
    );

    if (nextPackKey !== selectedTurnPackKey) {
      setSelectedTurnPackKey(nextPackKey);
      return;
    }

    const selectedPack = nextPackKey ? state.editBundle?.sceneLanguagePacks.get(nextPackKey) : null;
    const nextBandId = (
      selectedTurnBandId && selectedPack?.bands.some((band) => band.bandId === selectedTurnBandId)
        ? selectedTurnBandId
        : selectedPack?.bands[0]?.bandId ?? null
    );

    if (nextBandId !== selectedTurnBandId) {
      setSelectedTurnBandId(nextBandId);
    }
  }, [
    selectedScenarioPackEntries,
    selectedTurnPackKey,
    selectedTurnBandId,
    state.editBundle,
  ]);

  const saveArtifacts = useCallback(async () => {
    if (!gameRootPath || !gameId || !state.editBundle || !isDirty) return;
    const files = serializeContentBundle(state.editBundle);
    const nextFileSet = new Set(files.keys());
    const removedFiles = state.files.filter((relativePath) => !nextFileSet.has(relativePath));
    await writeAllSugarlangArtifacts(gameRootPath, gameId, files);
    for (const relativePath of removedFiles) {
      await deletePluginArtifact(gameRootPath, gameId, 'sugarlang', relativePath);
    }
    const validation = validateContentBundle(state.editBundle);
    console.log(`[SL·Editor] saved ${files.size} artifact files → valid=${validation.valid}`);
    setState((current) => ({
      ...current,
      files: Array.from(files.keys()).sort(),
      savedBundle: cloneBundle(state.editBundle!),
      validation,
    }));
  }, [gameRootPath, gameId, isDirty, state.editBundle, state.files]);

  useEffect(() => {
    onRegisterSaveHandler?.(saveArtifacts);
    return () => onRegisterSaveHandler?.(null);
  }, [onRegisterSaveHandler, saveArtifacts]);

  const openPluginSettings = useCallback(() => {
    setPluginSettingsTab('languages');
    setPluginSettingsOpen(true);
  }, []);

  useEffect(() => {
    onRegisterOpenSettingsHandler?.(openPluginSettings);
    return () => onRegisterOpenSettingsHandler?.(null);
  }, [onRegisterOpenSettingsHandler, openPluginSettings]);

  const openCreateScenarioModal = useCallback(() => {
    setSelectedQuestIdForCreation(null);
    setCreateScenarioModalOpen(true);
  }, []);

  const closeCreateScenarioModal = useCallback(() => {
    setCreateScenarioModalOpen(false);
    setSelectedQuestIdForCreation(null);
  }, []);

  const handleCreateScenarioFromQuest = useCallback(async () => {
    if (!gameRootPath || !gameId || !projectInput || !selectedQuestIdForCreation) return;

    const quest = availableQuests.find((entry) => entry.id === selectedQuestIdForCreation);
    if (!quest) {
      setActionFeedback('Select a quest before creating a scenario.');
      return;
    }

    try {
      const generatedFiles = generateDraftScaffold({
        ...projectInput,
        quests: [quest],
      });
      const scenarioId = findGeneratedScenarioId(generatedFiles);

      if (!scenarioId) {
        setActionFeedback(`Quest scaffold for "${quest.name}" did not produce a scenario artifact.`);
        return;
      }

      if (state.editBundle?.scenarios.has(scenarioId)) {
        closeCreateScenarioModal();
        setSelectedScenarioId(scenarioId);
        setSubTab('scenario');
        setSearchQuery('');
        setActionFeedback(`"${quest.name}" already has a scenario. Selected "${scenarioId}".`);
        return;
      }

      const filesToWrite = filterQuestDraftFiles(
        generatedFiles,
        new Set(state.files),
        scenarioId,
      );

      await writeAllSugarlangArtifacts(gameRootPath, gameId, filesToWrite);
      closeCreateScenarioModal();
      setActionFeedback(`Created "${scenarioId}" from quest "${quest.name}".`);
      await loadArtifacts();
      setSelectedScenarioId(scenarioId);
      setSubTab('scenario');
      setSearchQuery('');
    } catch (error) {
      setActionFeedback(`Create from quest failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [
    availableQuests,
    closeCreateScenarioModal,
    gameId,
    gameRootPath,
    loadArtifacts,
    projectInput,
    selectedQuestIdForCreation,
    state.editBundle,
    state.files,
  ]);

  const handleSyncScenarioFromQuest = useCallback(() => {
    if (!projectInput || !selectedScenarioId || !selectedScenario?.associatedQuestId) return;

    const quest = availableQuests.find((entry) => entry.id === selectedScenario.associatedQuestId);
    if (!quest) {
      setActionFeedback(`The associated quest for "${selectedScenarioId}" could not be found. Update the quest link in the Scenario tab first.`);
      return;
    }

    const generatedFiles = generateDraftScaffold({
      ...projectInput,
      quests: [quest],
    });
    const { bundle, errors, warnings } = deserializeContentBundle(generatedFiles);
    const generatedScenarioId = Array.from(bundle.scenarios.keys())[0] ?? null;
    const generatedScenario = generatedScenarioId ? bundle.scenarios.get(generatedScenarioId) ?? null : null;
    const generatedGrounding = generatedScenarioId ? bundle.groundingMaps.get(generatedScenarioId) ?? null : null;
    const generatedBindings = generatedScenarioId ? bundle.questBindings.get(generatedScenarioId) ?? [] : [];

    if (!generatedScenario) {
      setActionFeedback(`Quest sync for "${quest.name}" did not produce scenario data.`);
      return;
    }

    // Derive interactions from quest graph traversal
    const syncResult = syncInteractionsFromQuest({
      quest: quest as any,
      dialogues: (projectInput.dialogues ?? []) as any,
      npcs: (projectInput.npcs ?? []) as any,
      scenarioId: selectedScenarioId,
    });

    setState((current) => {
      if (!current.editBundle) return current;
      const currentScenario = current.editBundle.scenarios.get(selectedScenarioId);
      if (!currentScenario) return current;

      const nextScenarios = new Map(current.editBundle.scenarios);
      nextScenarios.set(selectedScenarioId, {
        ...currentScenario,
        successCriteria: clonePlain(generatedScenario.successCriteria),
        activeReferents: clonePlain(generatedScenario.activeReferents),
        npcIds: clonePlain(generatedScenario.npcIds),
        npcNames: clonePlain(generatedScenario.npcNames ?? []),
        interactions: clonePlain(syncResult.interactions),
      });

      const nextGroundingMaps = new Map(current.editBundle.groundingMaps);
      nextGroundingMaps.set(selectedScenarioId, {
        scenarioId: selectedScenarioId,
        entries: clonePlain(generatedGrounding?.entries ?? []),
      });

      const nextQuestBindings = new Map(current.editBundle.questBindings);
      nextQuestBindings.set(selectedScenarioId, clonePlain(generatedBindings));

      // Refresh lexicons from shared source so saved artifacts have correct glosses
      const nextLexicons = new Map(current.editBundle.lexicons);
      for (const [lang] of current.editBundle.lexicons) {
        const fresh = getSharedLexicon(lang);
        if (fresh.entries.length > 0) {
          nextLexicons.set(lang, fresh);
        }
      }

      return {
        ...current,
        editBundle: {
          ...current.editBundle,
          scenarios: nextScenarios,
          groundingMaps: nextGroundingMaps,
          questBindings: nextQuestBindings,
          lexicons: nextLexicons,
        },
      };
    });

    const allWarnings = [...warnings, ...syncResult.warnings];
    const issueCount = errors.length + allWarnings.length;
    const interactionCount = syncResult.interactions.length;
    setActionFeedback(
      issueCount > 0
        ? `Synced "${selectedScenarioId}" from quest "${quest.name}": ${interactionCount} interaction(s), ${issueCount} issue(s). Save the game to persist.`
        : `Synced "${selectedScenarioId}" from quest "${quest.name}": ${interactionCount} interaction(s). Save the game to persist.`,
    );
  }, [
    availableQuests,
    projectInput,
    selectedScenario,
    selectedScenarioId,
    state.editBundle,
  ]);

  const handleDeleteScenario = useCallback(() => {
    if (!selectedScenarioId || !state.editBundle) return;

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(`Delete Sugarlang scenario "${selectedScenarioId}"? This does not delete the underlying quest.`);

    if (!confirmed) return;

    const remainingScenarioIds = Array.from(state.editBundle.scenarios.keys())
      .filter((scenarioId) => scenarioId !== selectedScenarioId)
      .sort((a, b) => a.localeCompare(b));

    setState((current) => {
      if (!current.editBundle) return current;

      const nextScenarios = new Map(current.editBundle.scenarios);
      nextScenarios.delete(selectedScenarioId);

      const nextGroundingMaps = new Map(current.editBundle.groundingMaps);
      nextGroundingMaps.delete(selectedScenarioId);

      const nextQuestBindings = new Map(current.editBundle.questBindings);
      nextQuestBindings.delete(selectedScenarioId);

      const nextSceneLanguagePacks = new Map(
        Array.from(current.editBundle.sceneLanguagePacks.entries()).filter(([, pack]) => pack.scenarioId !== selectedScenarioId),
      );

      return {
        ...current,
        editBundle: {
          ...current.editBundle,
          scenarios: nextScenarios,
          groundingMaps: nextGroundingMaps,
          sceneLanguagePacks: nextSceneLanguagePacks,
          questBindings: nextQuestBindings,
        },
      };
    });

    setSelectedScenarioId(remainingScenarioIds[0] ?? null);
    setSelectedTurnPackKey(null);
    setSelectedTurnBandId(null);
    setSubTab('overview');
    setActionFeedback(`Deleted "${selectedScenarioId}". Save the game to remove its Sugarlang artifact files.`);
  }, [selectedScenarioId, state.editBundle]);

  const handleClearScenarios = useCallback(() => {
    if (!state.editBundle || state.editBundle.scenarios.size === 0) return;

    const scenarioCount = state.editBundle.scenarios.size;
    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(
        `Clear ${scenarioCount} Sugarlang scenario${scenarioCount === 1 ? '' : 's'} from this project?`
        + ' This removes scenario, grounding, quest-binding, and scene-pack artifacts but keeps lexicons and band policies.',
      );

    if (!confirmed) return;

    setState((current) => {
      if (!current.editBundle) return current;
      return {
        ...current,
        editBundle: {
          ...current.editBundle,
          scenarios: new Map(),
          groundingMaps: new Map(),
          sceneLanguagePacks: new Map(),
          questBindings: new Map(),
        },
      };
    });

    setSelectedScenarioId(null);
    setSelectedTurnPackKey(null);
    setSelectedTurnBandId(null);
    setSubTab('overview');
    setSearchQuery('');
    setActionFeedback(`Cleared ${scenarioCount} Sugarlang scenario${scenarioCount === 1 ? '' : 's'}. Save the game to remove the old artifact files.`);
  }, [state.editBundle]);

  const updateScenario = useCallback((scenarioId: string, updated: ScenarioBrief) => {
    console.log(`[SL·Editor] scenario "${scenarioId}" modified`);
    setState((current) => {
      if (!current.editBundle) return current;
      const nextScenarios = new Map(current.editBundle.scenarios);
      nextScenarios.set(scenarioId, updated);
      return {
        ...current,
        editBundle: { ...current.editBundle, scenarios: nextScenarios },
      };
    });
  }, []);

  const updateBandPolicies = useCallback((updated: BandPolicyPack) => {
    console.log('[SL·Editor] band policies modified');
    setState((current) => {
      if (!current.editBundle) return current;
      return {
        ...current,
        editBundle: { ...current.editBundle, bandPolicies: updated },
      };
    });
  }, []);

  const updateLexicon = useCallback((language: string, updated: LexiconPack) => {
    console.log(`[SL·Editor] lexicon "${language}" modified`);
    setState((current) => {
      if (!current.editBundle) return current;
      const nextLexicons = new Map(current.editBundle.lexicons);
      nextLexicons.set(language, updated);
      return {
        ...current,
        editBundle: { ...current.editBundle, lexicons: nextLexicons },
      };
    });
  }, []);

  const installLanguage = useCallback((language: string) => {
    console.log(`[SL·Editor] installing language "${language}"`);
    const lexicon = getSharedLexicon(language);
    setState((current) => {
      if (!current.editBundle) return current;
      const nextLexicons = new Map(current.editBundle.lexicons);
      nextLexicons.set(language, lexicon);
      return {
        ...current,
        editBundle: { ...current.editBundle, lexicons: nextLexicons },
      };
    });
    setActionFeedback(`Installed language "${language}" with ${lexicon.entries.length} lexicon entries. Save to persist.`);
  }, []);

  const uninstallLanguage = useCallback((language: string) => {
    console.log(`[SL·Editor] uninstalling language "${language}"`);
    setState((current) => {
      if (!current.editBundle) return current;
      const nextLexicons = new Map(current.editBundle.lexicons);
      nextLexicons.delete(language);
      const nextPacks = new Map(current.editBundle.sceneLanguagePacks);
      for (const [key, pack] of nextPacks) {
        if (pack.targetLanguage === language) {
          nextPacks.delete(key);
        }
      }
      return {
        ...current,
        editBundle: { ...current.editBundle, lexicons: nextLexicons, sceneLanguagePacks: nextPacks },
      };
    });
    setActionFeedback(`Removed language "${language}" (lexicon + scene packs). Save to persist.`);
  }, []);

  const updateSceneLanguagePack = useCallback((key: string, updated: SceneLanguagePack) => {
    console.log(`[SL·Editor] scene pack "${key}" modified`);
    setState((current) => {
      if (!current.editBundle) return current;
      const nextPacks = new Map(current.editBundle.sceneLanguagePacks);
      nextPacks.set(key, updated);
      return {
        ...current,
        editBundle: { ...current.editBundle, sceneLanguagePacks: nextPacks },
      };
    });
  }, []);

  const scenarioEditorContent = (
    state.editBundle
      ? ScenarioEditor({
        scenarios: state.editBundle.scenarios,
        selectedScenarioId,
        quests: availableQuests.map((quest) => ({ id: quest.id, name: quest.name })),
        onSelectScenario: setSelectedScenarioId,
        onUpdateScenario: updateScenario,
      }).content
      : null
  );

  const languageEditor = (
    state.editBundle && selectedScenarioId
      ? SceneTurnEditor({
        sceneLanguagePacks: new Map(selectedScenarioPackEntries),
        onUpdateSceneLanguagePack: updateSceneLanguagePack,
        selectedPackKey: selectedTurnPackKey,
        onSelectPackKey: setSelectedTurnPackKey,
        selectedBandId: selectedTurnBandId,
        onSelectBandId: setSelectedTurnBandId,
      })
      : null
  );

  const list = (
    <Stack gap="sm" p="sm" h="100%">
      <Group justify="space-between" gap="xs">
        <Title order={5}>Scenarios ({scenarioEntries.length})</Title>
        <Group gap={4}>
          {isDirty && (
            <Badge color="yellow" size="xs">
              Unsaved
            </Badge>
          )}
          <Tooltip label={canCreateScenario ? 'New scenario from quest' : 'Add a quest before creating a scenario'}>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="blue"
              onClick={openCreateScenarioModal}
              disabled={!canCreateScenario}
              aria-label="Create new scenario from quest"
            >
              +
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <TextInput
        size="xs"
        placeholder="Search scenarios..."
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.currentTarget.value)}
      />

      <ScrollArea h="100%" offsetScrollbars>
        <Stack gap="xs">
          {filteredScenarios.map((scenario) => {
            const packEntries = getScenarioPackEntries(state.editBundle, scenario.scenarioId);
            const languages = getScenarioLanguages(packEntries);
            return (
              <Paper
                key={scenario.scenarioId}
                p="sm"
                withBorder
                style={{
                  cursor: 'pointer',
                  borderColor: selectedScenarioId === scenario.scenarioId ? '#89b4fa' : undefined,
                  background: selectedScenarioId === scenario.scenarioId ? 'rgba(137,180,250,0.08)' : undefined,
                }}
                onClick={() => setSelectedScenarioId(scenario.scenarioId)}
              >
                <Stack gap={6}>
                  <Group justify="space-between" gap="xs" wrap="nowrap">
                    <Text size="sm" fw={600} truncate>
                      {scenario.scenarioId}
                    </Text>
                    <Badge size="xs" color="blue" variant="light">
                      {packEntries.length} pack{packEntries.length === 1 ? '' : 's'}
                    </Badge>
                  </Group>

                  <Text size="xs" c="dimmed">
                    {summarizeScenarioTask(scenario.communicativeTask)}
                  </Text>

                  <Group gap={4}>
                    {scenario.supportedBands.map((bandId) => (
                      <Badge key={bandId} size="xs" variant="light" color="grape">
                        {bandId}
                      </Badge>
                    ))}
                  </Group>

                  <Text size="xs" c="dimmed">
                    {languages.length > 0 ? `Languages: ${languages.join(', ')}` : 'No language packs attached'}
                  </Text>
                </Stack>
              </Paper>
            );
          })}

          {!state.loading && filteredScenarios.length === 0 && scenarioEntries.length > 0 && (
            <Text size="xs" c="dimmed">
              No scenarios match your search.
            </Text>
          )}

          {!state.loading && scenarioEntries.length === 0 && (
            <Text size="xs" c="dimmed">
              No scenarios loaded.
            </Text>
          )}

          {state.loading && (
            <Text size="xs" c="dimmed">
              Loading Sugarlang artifacts...
            </Text>
          )}
        </Stack>
      </ScrollArea>
    </Stack>
  );

  const contentHeader = (
    <Paper
      p="lg"
      radius={0}
      style={{
        background: 'linear-gradient(135deg, #1e1e2e 0%, #181825 100%)',
        borderBottom: '1px solid #313244',
      }}
    >
      <Group justify="space-between" align="flex-start" gap="lg">
        <Stack gap={4}>
          <Title order={3}>
            {selectedScenario?.scenarioId ?? 'Sugarlang'}
          </Title>
          <Group gap="xs">
            {selectedScenario ? (
              <>
                <Badge size="sm" variant="light" color="blue">
                  {selectedScenarioLanguages.length} language{selectedScenarioLanguages.length === 1 ? '' : 's'}
                </Badge>
                <Badge size="sm" variant="light" color="grape">
                  {selectedScenario.supportedBands.length} band{selectedScenario.supportedBands.length === 1 ? '' : 's'}
                </Badge>
                <Badge size="sm" variant="light" color="green">
                  {selectedScenarioTurnCount} turn{selectedScenarioTurnCount === 1 ? '' : 's'}
                </Badge>
              </>
            ) : (
              <Badge size="sm" variant="light" color="gray">
                Scenario-first authoring
              </Badge>
            )}
            {!isEnabled && (
              <Badge size="sm" variant="light" color="yellow">
                Plugin disabled in project settings
              </Badge>
            )}
          </Group>
          {selectedScenario && (
            <Text size="sm" c="dimmed">
              {selectedScenario.communicativeTask}
            </Text>
          )}
        </Stack>

        <Group gap="xs" align="flex-start">
          <Button
            size="xs"
            variant="light"
            onClick={() => void handleSyncScenarioFromQuest()}
            disabled={!canSyncScenario}
            title={
              selectedScenario?.associatedQuestId
                ? 'Refresh the selected scenario\'s scaffold fields from its associated quest'
                : 'Associate a quest in the Scenario tab before syncing'
            }
          >
            Sync From Quest
          </Button>
          <Button
            size="xs"
            variant="light"
            color="gray"
            onClick={() => void loadArtifacts()}
            disabled={state.loading}
            title="Reload Sugarlang artifacts from disk"
          >
            Reload From Disk
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            onClick={handleDeleteScenario}
            disabled={!selectedScenarioId}
            title="Delete the selected Sugarlang scenario without deleting the quest"
          >
            Delete Scenario
          </Button>
          <Button
            size="xs"
            variant="subtle"
            color="red"
            onClick={handleClearScenarios}
            disabled={!scenarioEntries.length}
            title="Remove all Sugarlang scenarios and scene packs from this project but keep shared lexicons and band policies"
          >
            Clear Scenarios
          </Button>
        </Group>
      </Group>
    </Paper>
  );

  const contentBody = (() => {
    switch (subTab) {
      case 'overview':
        return (
          <ScenarioOverviewContent
            isEnabled={isEnabled}
            scenario={selectedScenario}
            packEntries={selectedScenarioPackEntries}
            groundingMap={selectedScenarioGrounding}
            questBindings={selectedScenarioBindings}
            artifactPathsForScenario={selectedScenarioArtifactPaths}
          />
        );
      case 'scenario':
        return scenarioEditorContent ?? (
          <EmptyState message="Select a scenario to edit its core brief." />
        );
      case 'languages':
        if (!selectedScenario) {
          return <EmptyState message="Select a scenario to inspect its language packs." />;
        }
        if (!languageEditor) {
          return <EmptyState message="No language packs are attached to this scenario yet." />;
        }
        return (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '260px minmax(0, 1fr)',
              minHeight: 0,
              flex: 1,
            }}
          >
            <div style={{ borderRight: '1px solid #313244', minWidth: 0 }}>
              {languageEditor.list}
            </div>
            <div style={{ minWidth: 0 }}>
              {languageEditor.content}
            </div>
          </div>
        );
      default:
        return <EmptyState message="Select a tab to begin editing." />;
    }
  })();

  const pluginSettingsModal = (
    <Modal
      opened={pluginSettingsOpen}
      onClose={() => setPluginSettingsOpen(false)}
      title="Sugarlang Settings"
      centered
      size="90vw"
      styles={{
        header: { background: '#1e1e2e', borderBottom: '1px solid #313244' },
        title: { color: '#cdd6f4', fontWeight: 600 },
        body: { background: '#1e1e2e', padding: 0 },
        content: { background: '#1e1e2e' },
        close: { color: '#6c7086', '&:hover': { background: '#313244' } },
      }}
    >
      <Stack gap={0} style={{ height: '78vh' }}>
        <Group p="sm" style={{ borderBottom: '1px solid #313244' }}>
          <SegmentedControl
            size="xs"
            data={[
              { value: 'languages', label: 'Languages' },
              { value: 'band-policies', label: 'Band Policies' },
              { value: 'lexicons', label: 'Lexicons' },
              { value: 'artifacts', label: 'Artifacts & Validation' },
            ]}
            value={pluginSettingsTab}
            onChange={(value) => setPluginSettingsTab(value as PluginSettingsTab)}
          />
        </Group>

        <div style={{ flex: 1, minHeight: 0 }}>
          {pluginSettingsTab === 'languages' ? (
            <LanguageManagementContent
              bundleLanguages={bundleLanguages}
              disabledLanguages={disabledLanguages}
              onInstallLanguage={installLanguage}
              onUninstallLanguage={uninstallLanguage}
              onToggleLanguage={toggleLanguage}
            />
          ) : pluginSettingsTab === 'band-policies' ? (
            state.editBundle ? (
              <BandMatrixEditor
                bandPolicies={state.editBundle.bandPolicies}
                onUpdateBandPolicies={updateBandPolicies}
              />
            ) : (
              <EmptyState message="No Sugarlang content is loaded." />
            )
          ) : pluginSettingsTab === 'lexicons' ? (
            state.editBundle ? (
              <LexiconSettingsContent
                lexicons={state.editBundle.lexicons}
                onUpdateLexicon={updateLexicon}
              />
            ) : (
              <EmptyState message="No Sugarlang content is loaded." />
            )
          ) : (
            <ArtifactsContent
              files={state.files}
              selectedFile={selectedFile}
              onSelectFile={setSelectedFile}
              selectedFileJson={selectedFile && editArtifactFiles ? editArtifactFiles.get(selectedFile) ?? null : null}
              validation={liveValidation ?? state.validation}
              loadErrors={state.loadErrors}
              loadWarnings={state.loadWarnings}
              editBundle={state.editBundle}
            />
          )}
        </div>
      </Stack>
    </Modal>
  );

  const content = (
    <Stack gap={0} h="100%">
      <Modal
        opened={createScenarioModalOpen}
        onClose={closeCreateScenarioModal}
        title="New Scenario"
        centered
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Select the quest this scenario is for. Sugarlang will scaffold the scenario brief, grounding map, quest bindings, and per-language scene-pack shells from that quest.
          </Text>
          <Select
            label="Quest"
            placeholder="Select a quest"
            data={questOptions}
            value={selectedQuestIdForCreation}
            onChange={setSelectedQuestIdForCreation}
            searchable
            nothingFoundMessage="No quests"
          />
          <Group justify="flex-end">
            <Button size="xs" variant="subtle" color="gray" onClick={closeCreateScenarioModal}>
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={() => void handleCreateScenarioFromQuest()}
              disabled={!selectedQuestIdForCreation}
            >
              Create Scenario
            </Button>
          </Group>
        </Stack>
      </Modal>

      {contentHeader}

      <Group
        justify="flex-start"
        gap="sm"
        p="sm"
        pb={0}
        style={{ borderBottom: '1px solid #313244' }}
      >
        <SegmentedControl
          size="xs"
          data={[
            { value: 'overview', label: 'Overview' },
            { value: 'scenario', label: 'Scenario' },
            { value: 'languages', label: 'Languages' },
          ]}
          value={subTab}
          onChange={(value) => setSubTab(value as SubTab)}
        />
      </Group>

      {actionFeedback && (
        <Alert color="blue" withCloseButton onClose={() => setActionFeedback(null)} m="sm">
          {actionFeedback}
        </Alert>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {contentBody}
      </div>
    </Stack>
  );

  const inspector = (
    <Stack gap="xs" p="sm">
      <ValidationInspector validation={liveValidation ?? state.validation} />

      {selectedScenario && (
        <Paper p="xs" withBorder>
          <Title order={6} mb={6}>Selected Scenario</Title>
          <Stack gap={4}>
            <Text size="xs"><b>ID:</b> {selectedScenario.scenarioId}</Text>
            <Text size="xs"><b>NPCs:</b> {(selectedScenario.npcNames ?? selectedScenario.npcIds).join(', ') || 'None'}</Text>
            <Text size="xs"><b>Languages:</b> {selectedScenarioLanguages.join(', ') || 'None'}</Text>
            <Text size="xs"><b>Grounding Entries:</b> {selectedScenarioGrounding?.entries.length ?? 0}</Text>
            <Text size="xs"><b>Quest Bindings:</b> {selectedScenarioBindings.length}</Text>
          </Stack>
        </Paper>
      )}

      <Paper p="xs" withBorder>
        <BundleSummaryContent
          files={state.files}
          editBundle={state.editBundle}
          validation={liveValidation ?? state.validation}
          languages={bundleLanguages}
        />
      </Paper>
    </Stack>
  );

  return (
    <>
      {children({ list, content, inspector })}
      {pluginSettingsModal}
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <Stack align="center" justify="center" h="100%">
      <Text c="dimmed" size="sm">{message}</Text>
    </Stack>
  );
}

function ValidationInspector({
  validation,
}: {
  validation: ArtifactValidationResult | null;
}) {
  if (!validation) return null;

  return (
    <Paper p="xs" withBorder>
      <Title order={6} mb={6}>Validation</Title>
      <Group gap="xs">
        <Badge color={validation.valid ? 'green' : 'red'} size="xs">
          {validation.valid ? 'Valid' : `${validation.errors.length} error(s)`}
        </Badge>
        {validation.warnings.length > 0 && (
          <Badge color="yellow" size="xs">
            {validation.warnings.length} warning(s)
          </Badge>
        )}
      </Group>

      {validation.errors.length > 0 && (
        <Stack gap={2} mt={6}>
          {validation.errors.map((error, index) => (
            <Text key={index} size="xs" c="red">
              {error}
            </Text>
          ))}
        </Stack>
      )}

      {validation.warnings.length > 0 && (
        <Stack gap={2} mt={6}>
          {validation.warnings.map((warning, index) => (
            <Text key={index} size="xs" c="yellow">
              {warning}
            </Text>
          ))}
        </Stack>
      )}
    </Paper>
  );
}

function BundleSummaryContent({
  files,
  editBundle,
  validation,
  languages,
}: {
  files: string[];
  editBundle: SugarlangContentBundle | null;
  validation: ArtifactValidationResult | null;
  languages: string[];
}) {
  return (
    <>
      <Title order={6} mb={6}>Bundle Summary</Title>
      <Stack gap={4}>
        <Text size="xs"><b>Artifact Files:</b> {files.length}</Text>
        <Text size="xs"><b>Scenarios:</b> {editBundle?.scenarios.size ?? 0}</Text>
        <Text size="xs"><b>Grounding Maps:</b> {editBundle?.groundingMaps.size ?? 0}</Text>
        <Text size="xs"><b>Quest Bindings:</b> {editBundle?.questBindings.size ?? 0}</Text>
        <Text size="xs"><b>Scene Packs:</b> {editBundle?.sceneLanguagePacks.size ?? 0}</Text>
        <Text size="xs"><b>Languages:</b> {languages.join(', ') || 'None'}</Text>
        <Text size="xs"><b>Lexicons:</b> {editBundle?.lexicons.size ?? 0}</Text>
        <Text size="xs"><b>Band Policies:</b> {editBundle?.bandPolicies.policies.length ?? 0}</Text>
        <Text size="xs">
          <b>Validation:</b>{' '}
          {validation
            ? `${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`
            : 'Unavailable'}
        </Text>
      </Stack>
    </>
  );
}

function LanguageManagementContent({
  bundleLanguages,
  disabledLanguages,
  onInstallLanguage,
  onUninstallLanguage,
  onToggleLanguage,
}: {
  bundleLanguages: string[];
  disabledLanguages: Set<string>;
  onInstallLanguage: (language: string) => void;
  onUninstallLanguage: (language: string) => void;
  onToggleLanguage: (language: string, enabled: boolean) => void;
}) {
  const availableShared = getAvailableSharedLanguages();
  const installable = availableShared.filter((lang) => !bundleLanguages.includes(lang));

  return (
    <ScrollArea h="100%">
      <Stack gap="md" p="md">
        <Text size="sm" c="dimmed">
          Manage target languages. Toggle languages on/off for the preview, or install new ones from the shared lexicon pool. Save the project to persist changes.
        </Text>

        <Paper p="sm" withBorder>
          <Title order={6} mb="xs">Installed Languages</Title>
          {bundleLanguages.length === 0 ? (
            <Text size="sm" c="dimmed">No languages installed yet.</Text>
          ) : (
            <Stack gap="xs">
              {bundleLanguages.map((lang) => {
                const enabled = !disabledLanguages.has(lang);
                return (
                  <Group key={lang} justify="space-between">
                    <Group gap="xs">
                      <Badge size="sm" color={enabled ? 'grape' : 'gray'} variant={enabled ? 'filled' : 'light'}>
                        {lang}
                      </Badge>
                    </Group>
                    <Group gap="xs">
                      <Switch
                        checked={enabled}
                        onChange={(event) => onToggleLanguage(lang, event.currentTarget.checked)}
                      />
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="red"
                        onClick={() => onUninstallLanguage(lang)}
                      >
                        Uninstall
                      </Button>
                    </Group>
                  </Group>
                );
              })}
            </Stack>
          )}
        </Paper>

        {installable.length > 0 && (
          <Paper p="sm" withBorder>
            <Title order={6} mb="xs">Available Languages</Title>
            <Stack gap="xs">
              {installable.map((lang) => (
                <Group key={lang} justify="space-between">
                  <Group gap="xs">
                    <Badge size="sm" variant="light" color="gray">{lang}</Badge>
                    <Text size="sm">Shared lexicon available</Text>
                  </Group>
                  <Button
                    size="compact-xs"
                    variant="light"
                    onClick={() => onInstallLanguage(lang)}
                  >
                    Install
                  </Button>
                </Group>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </ScrollArea>
  );
}

function ScenarioOverviewContent({
  isEnabled,
  scenario,
  packEntries,
  groundingMap,
  questBindings,
  artifactPathsForScenario,
}: {
  isEnabled: boolean;
  scenario: ScenarioBrief | null;
  packEntries: Array<[string, SceneLanguagePack]>;
  groundingMap: GroundingMap | null;
  questBindings: GroundedQuestBinding[];
  artifactPathsForScenario: string[];
}) {
  if (!scenario) {
    return (
      <ScrollArea h="100%">
        <Stack gap="md" p="md">
          <EmptyState message="Select a scenario from the left to inspect its brief, language packs, and linked artifacts." />
        </Stack>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea h="100%">
      <Stack gap="md" p="md">
        {!isEnabled && (
          <Alert color="yellow" title="Plugin Disabled">
            Sugarlang is disabled in project plugin settings. You can still inspect and edit artifacts here, but enable the plugin from the plugin menu to use them in preview.
          </Alert>
        )}

        <Paper p="sm" withBorder>
          <Title order={6} mb="xs">Scenario Brief</Title>
          <Stack gap={6}>
            <Text size="sm">{scenario.communicativeTask}</Text>
            <Text size="xs"><b>NPCs:</b> {(scenario.npcNames ?? scenario.npcIds).join(', ') || 'None'}</Text>
            <Text size="xs"><b>Supported Bands:</b> {scenario.supportedBands.join(', ')}</Text>
            <Text size="xs"><b>Active Referents:</b> {scenario.activeReferents.join(', ') || 'None'}</Text>
            <Text size="xs"><b>Success Criteria:</b> {scenario.successCriteria.join(' | ') || 'None'}</Text>
          </Stack>
        </Paper>

        <Paper p="sm" withBorder>
          <Title order={6} mb="xs">Language Packs</Title>
          {packEntries.length === 0 ? (
            <Alert color="yellow">No language packs are attached to this scenario.</Alert>
          ) : (
            <Stack gap="sm">
              {packEntries.map(([key, pack]) => (
                <Paper key={key} p="sm" withBorder>
                  <Stack gap={6}>
                    <Group justify="space-between" gap="xs">
                      <Group gap="xs">
                        <Badge size="xs" color="grape">{pack.targetLanguage}</Badge>
                        <Text size="sm" fw={500}>
                          {pack.targetLanguage} target / {pack.supportLanguage} support
                        </Text>
                      </Group>
                      <Badge size="xs" variant="light" color="blue">
                        {pack.bands.length} band{pack.bands.length === 1 ? '' : 's'}
                      </Badge>
                    </Group>

                    <Group gap={6}>
                      {pack.bands.map((band) => (
                        <Badge key={band.bandId} size="xs" variant="light" color="gray">
                          {band.bandId}: {band.turns.length} turn{band.turns.length === 1 ? '' : 's'}
                          {band.providerPolicy ? ` | ${band.providerPolicy}` : ''}
                        </Badge>
                      ))}
                    </Group>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Paper>

        <Group align="stretch" grow>
          <Paper p="sm" withBorder>
            <Title order={6} mb="xs">Grounding Map</Title>
            <Text size="xs" mb={6}>
              {groundingMap ? `${groundingMap.entries.length} grounding entr${groundingMap.entries.length === 1 ? 'y' : 'ies'}` : 'No grounding map attached'}
            </Text>
            {groundingMap && groundingMap.entries.length > 0 && (
              <Stack gap={4}>
                {groundingMap.entries.slice(0, 6).map((entry) => (
                  <Text key={`${entry.lexicalEntryId}:${entry.worldObjectId}`} size="xs">
                    {entry.lexicalEntryId}{' -> '}{entry.worldObjectId}
                  </Text>
                ))}
                {groundingMap.entries.length > 6 && (
                  <Text size="xs" c="dimmed">
                    +{groundingMap.entries.length - 6} more entries
                  </Text>
                )}
              </Stack>
            )}
          </Paper>

          <Paper p="sm" withBorder>
            <Title order={6} mb="xs">Quest Bindings</Title>
            <Text size="xs" mb={6}>
              {questBindings.length} binding{questBindings.length === 1 ? '' : 's'}
            </Text>
            {questBindings.length > 0 && (
              <Stack gap={4}>
                {questBindings.slice(0, 6).map((binding) => (
                  <Text key={binding.scenarioReferentId} size="xs">
                    {binding.scenarioReferentId}
                    {binding.questCompletionStep ? ` -> ${binding.questCompletionStep}` : ''}
                  </Text>
                ))}
                {questBindings.length > 6 && (
                  <Text size="xs" c="dimmed">
                    +{questBindings.length - 6} more bindings
                  </Text>
                )}
              </Stack>
            )}
          </Paper>
        </Group>

        <Paper p="sm" withBorder>
          <Title order={6} mb="xs">Attached Artifacts</Title>
          <Stack gap={4}>
            {artifactPathsForScenario.map((path) => (
              <Code key={path} block style={{ fontSize: 11 }}>
                {path}
              </Code>
            ))}
          </Stack>
        </Paper>
      </Stack>
    </ScrollArea>
  );
}

const LEXICON_CATEGORY_OPTIONS = [
  { value: 'object', label: 'Object' },
  { value: 'color', label: 'Color' },
  { value: 'location', label: 'Location' },
  { value: 'verb', label: 'Verb' },
  { value: 'adjective', label: 'Adjective' },
  { value: 'phrase', label: 'Phrase' },
  { value: 'function', label: 'Function' },
];

const LEXICON_BAND_OPTIONS = [
  { value: 'B0', label: 'B0' },
  { value: 'B1', label: 'B1' },
  { value: 'B2', label: 'B2' },
  { value: 'B3', label: 'B3' },
  { value: 'B4', label: 'B4' },
];

const LEXICON_USAGE_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'passive', label: 'Passive' },
  { value: 'support', label: 'Support' },
];

function LexiconSettingsContent({
  lexicons,
  onUpdateLexicon,
}: {
  lexicons: Map<string, LexiconPack>;
  onUpdateLexicon: (language: string, updated: LexiconPack) => void;
}) {
  const entries = Array.from(lexicons.entries()).sort(([a], [b]) => a.localeCompare(b));

  const addEntry = (language: string, pack: LexiconPack) => {
    const nextIndex = pack.entries.length + 1;
    onUpdateLexicon(language, {
      ...pack,
      entries: [
        ...pack.entries,
        {
          lexicalEntryId: `draft.${language}.${nextIndex}`,
          targetForm: '',
          gloss: '',
          category: 'object',
          introductionBand: 'B0',
          usage: 'active',
          groundable: true,
        },
      ],
    });
  };

  const updateEntry = (
    language: string,
    pack: LexiconPack,
    index: number,
    patch: Partial<LexiconPack['entries'][number]>,
  ) => {
    onUpdateLexicon(language, {
      ...pack,
      entries: pack.entries.map((entry, entryIndex) => (
        entryIndex === index ? { ...entry, ...patch } : entry
      )),
    });
  };

  const removeEntry = (language: string, pack: LexiconPack, index: number) => {
    onUpdateLexicon(language, {
      ...pack,
      entries: pack.entries.filter((_, entryIndex) => entryIndex !== index),
    });
  };

  return (
    <ScrollArea h="100%">
      <Stack gap="md" p="md">
        <Text size="sm" c="dimmed">
          Shared language lexicons live here. These are bundle-level vocabulary entries, not scenario-specific fields.
        </Text>

        {entries.map(([language, pack]) => {
          const planning = getLexiconPlanningStatus(pack);

          return (
            <Paper key={language} p="sm" withBorder>
              <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Group gap="xs">
                  <Badge size="sm" color="grape">{language}</Badge>
                  <Text size="sm" fw={600}>
                    {pack.entries.length} entr{pack.entries.length === 1 ? 'y' : 'ies'}
                  </Text>
                </Group>
                <Button size="xs" variant="light" onClick={() => addEntry(language, pack)}>
                  + Add Entry
                </Button>
              </Group>

              {pack.entries.length > 0 && (
                <Paper p="xs" withBorder bg="dark.6">
                  <Stack gap={4}>
                    <Text size="xs" fw={600}>Planning Coverage</Text>
                    <Text size="xs" c="dimmed">
                      Long-term V1 tracked-pool targets are shown here as planning guidance, not validation failures.
                    </Text>
                    <Group gap="xs">
                      {(['B0', 'B1', 'B2', 'B3', 'B4'] as const).map((band) => {
                        return (
                          <Badge
                            key={`${language}:${band}`}
                            color={planning.deficits[band] === 0 ? 'green' : 'gray'}
                            variant="light"
                            size="sm"
                          >
                            {band} {planning.cumulativeCounts[band]}/{planning.targets[band]}
                          </Badge>
                        );
                      })}
                    </Group>
                  </Stack>
                </Paper>
              )}

              {pack.entries.length === 0 ? (
                <Alert color="yellow" title="Empty Lexicon">
                  Add vocabulary entries for {language} to make this shared lexicon usable.
                </Alert>
              ) : (
                <Stack gap="xs">
                  {pack.entries.map((entry, index) => (
                    <Paper key={`${language}:${entry.lexicalEntryId}:${index}`} p="xs" withBorder>
                      <Stack gap="xs">
                        <Group grow align="flex-end">
                          <TextInput
                            label="Lexical Entry ID"
                            size="xs"
                            value={entry.lexicalEntryId}
                            onChange={(event) => updateEntry(language, pack, index, { lexicalEntryId: event.currentTarget.value })}
                          />
                          <TextInput
                            label="Target Form"
                            size="xs"
                            value={entry.targetForm}
                            onChange={(event) => updateEntry(language, pack, index, { targetForm: event.currentTarget.value })}
                          />
                          <TextInput
                            label="Gloss"
                            size="xs"
                            value={entry.gloss}
                            onChange={(event) => updateEntry(language, pack, index, { gloss: event.currentTarget.value })}
                          />
                        </Group>

                        <Group grow align="flex-end">
                          <Select
                            label="Category"
                            size="xs"
                            data={LEXICON_CATEGORY_OPTIONS}
                            value={entry.category}
                            onChange={(value) => updateEntry(language, pack, index, { category: (value ?? 'object') as LexiconPack['entries'][number]['category'] })}
                          />
                          <Select
                            label="Introduction Band"
                            size="xs"
                            data={LEXICON_BAND_OPTIONS}
                            value={entry.introductionBand}
                            onChange={(value) => updateEntry(language, pack, index, { introductionBand: (value ?? 'B0') as LexiconPack['entries'][number]['introductionBand'] })}
                          />
                          <Select
                            label="Usage"
                            size="xs"
                            data={LEXICON_USAGE_OPTIONS}
                            value={entry.usage}
                            onChange={(value) => updateEntry(language, pack, index, { usage: (value ?? 'active') as LexiconPack['entries'][number]['usage'] })}
                          />
                        </Group>

                        <Group justify="space-between" align="center">
                          <Text size="xs" c="dimmed">
                            Groundable: {entry.groundable ? 'yes' : 'no'}
                          </Text>
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="subtle"
                              color={entry.groundable ? 'blue' : 'gray'}
                              onClick={() => updateEntry(language, pack, index, { groundable: !entry.groundable })}
                            >
                              Toggle Groundable
                            </Button>
                            <ActionIcon
                              size="sm"
                              color="red"
                              variant="subtle"
                              onClick={() => removeEntry(language, pack, index)}
                              aria-label={`Remove lexical entry ${entry.lexicalEntryId}`}
                            >
                              x
                            </ActionIcon>
                          </Group>
                        </Group>
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </ScrollArea>
  );
}

function ArtifactsContent({
  files,
  selectedFile,
  onSelectFile,
  selectedFileJson,
  validation,
  loadErrors,
  loadWarnings,
  editBundle,
}: {
  files: string[];
  selectedFile: string | null;
  onSelectFile: (file: string | null) => void;
  selectedFileJson: string | null;
  validation: ArtifactValidationResult | null;
  loadErrors: string[];
  loadWarnings: string[];
  editBundle: SugarlangContentBundle | null;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '280px minmax(0, 1fr)',
        minHeight: 0,
        height: '100%',
      }}
    >
      <div style={{ borderRight: '1px solid #313244', minWidth: 0 }}>
        <Stack gap="xs" p="sm">
          <Title order={5}>Artifacts</Title>
          <Text size="xs" c="dimmed">
            File-level inspection lives here, but scenario authoring stays scenario-first.
          </Text>
          <ScrollArea h="100%">
            <Stack gap={2}>
              {files.map((file) => (
                <Button
                  key={file}
                  size="xs"
                  variant={selectedFile === file ? 'light' : 'subtle'}
                  onClick={() => onSelectFile(file)}
                  styles={{
                    root: {
                      justifyContent: 'flex-start',
                      fontFamily: 'monospace',
                      fontSize: 11,
                    },
                  }}
                  fullWidth
                >
                  {file}
                </Button>
              ))}
              {files.length === 0 && (
                <Text size="xs" c="dimmed">No artifacts on disk.</Text>
              )}
            </Stack>
          </ScrollArea>
        </Stack>
      </div>

      <ScrollArea h="100%">
        <Stack gap="md" p="md">
          {validation && (
            <ValidationInspector validation={validation} />
          )}

          {loadErrors.length > 0 && (
            <Alert color="red" title="Load Errors">
              {loadErrors.map((error, index) => (
                <Text key={index} size="xs">{error}</Text>
              ))}
            </Alert>
          )}

          {loadWarnings.length > 0 && (
            <Alert color="yellow" title="Warnings">
              {loadWarnings.map((warning, index) => (
                <Text key={index} size="xs">{warning}</Text>
              ))}
            </Alert>
          )}

          {editBundle && (
            <Paper p="sm" withBorder>
              <BundleSummaryContent
                files={files}
                editBundle={editBundle}
                validation={validation}
                languages={
                  Array.from(new Set([
                    ...Array.from(editBundle.sceneLanguagePacks.values()).map((pack) => pack.targetLanguage),
                    ...Array.from(editBundle.lexicons.keys()),
                  ]))
                    .sort()
                }
              />
            </Paper>
          )}

          {selectedFile && (
            <Paper p="sm" withBorder>
              <Title order={6} mb="xs">Artifact Preview</Title>
              <Text size="xs" c="dimmed" mb="xs">{selectedFile}</Text>
              <Code block style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>
                {selectedFileJson ?? 'No preview available.'}
              </Code>
            </Paper>
          )}
        </Stack>
      </ScrollArea>
    </div>
  );
}
