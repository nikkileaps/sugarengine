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
  SimpleGrid,
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
  serializeBandPolicies,
  serializeLexiconPack,
  serializeContentBundle,
  validateContentBundle,
} from '../../../plugins/sugarlang/content/artifacts';
import {
  DEFAULT_BAND_ORDER,
  resolveBandPolicyDefaults,
} from '../../../plugins/sugarlang/content/band-policy-defaults';
import {
  generateDraftScaffold,
  type ScaffoldProjectInput,
} from '../../../plugins/sugarlang/content/draft-scaffold';
import { syncInteractionsFromQuest } from '../../../plugins/sugarlang/content/sync-from-quest';
import { generateBandedTurns, walkDialogueForTurnDerivation } from '../../../plugins/sugarlang/content/generate-banded-turns';
import { reconcileTurns, type ReconciliationSummary, type StaleTurnPair } from '../../../plugins/sugarlang/content/reconcile-turns';
import { ReconciliationModal, type ResolvedTurn } from './ReconciliationModal';
import {
  assembleRefinementPacket,
  parseRefinementProposal,
  applyRefinementProposal,
} from '../../../plugins/sugarlang/content/refinement-packet';
import { callRefinement } from '../../services/refinement-service';
import type { RefinementProviderName } from '../../services/refinement-service';
import { getSharedLexicon, getAvailableSharedLanguages, mergeExplicitSeedEntries } from '../../../plugins/sugarlang/content/lexicons';
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
  LearnerBandId,
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

function ensureBundleBandPolicies(
  bundle: SugarlangContentBundle,
): {
  bundle: SugarlangContentBundle;
  repairedBands: LearnerBandId[];
  createdBandPolicies: boolean;
} {
  const nextBundle = cloneBundle(bundle);
  const currentPolicies = new Map(
    nextBundle.bandPolicies.policies.map((policy) => [policy.bandId, policy] as const),
  );
  const repairedBands: LearnerBandId[] = [];
  const createdBandPolicies = nextBundle.bandPolicies.policies.length === 0;

  nextBundle.bandPolicies = {
    policies: DEFAULT_BAND_ORDER.map((bandId) => {
      const resolved = resolveBandPolicyDefaults(currentPolicies.get(bandId), bandId);
      if (resolved.usedDefaultPolicy || resolved.filledDeliveryContract) {
        repairedBands.push(bandId);
      }
      return resolved.policy;
    }),
  };

  return { bundle: nextBundle, repairedBands, createdBandPolicies };
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
  const [refining, setRefining] = useState(false);
  const [refinementProvider, _setRefinementProvider] = useState<RefinementProviderName>('openai');
  const [reconciliationPairs, setReconciliationPairs] = useState<StaleTurnPair[]>([]);
  const [reconciliationPackKey, setReconciliationPackKey] = useState<string | null>(null);

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
      || (scenario.associatedQuestId ?? '').toLowerCase().includes(query)
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
    () => getScenarioPackEntries(state.editBundle, selectedScenarioId)
      .filter(([, pack]) => !disabledLanguages.has(pack.targetLanguage)),
    [state.editBundle, selectedScenarioId, disabledLanguages],
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
      const { bundle: lexiconRepairedBundle, repairedLexicons } = ensureBundleLexicons(bundle, bundleLanguages);
      const {
        bundle: repairedBundle,
        repairedBands,
        createdBandPolicies,
      } = ensureBundleBandPolicies(lexiconRepairedBundle);

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

      if (createdBandPolicies || repairedBands.length > 0) {
        await writePluginArtifact(
          gameRootPath,
          gameId,
          'sugarlang',
          artifactPaths.bandPolicies(),
          serializeBandPolicies(repairedBundle.bandPolicies, 'draft'),
        );
      }

      // Merge any new explicit entries from the code seed into persisted lexicons.
      // This ensures hand-authored entries added to es.ts/it.ts/en.ts are picked up
      // without wiping manual edits or regenerating the whole lexicon.
      const mergedLanguages: string[] = [];
      for (const language of bundleLanguages) {
        const current = repairedBundle.lexicons.get(language);
        if (!current) continue;
        const { pack, added } = mergeExplicitSeedEntries(current, language);
        if (added > 0) {
          repairedBundle.lexicons.set(language, pack);
          mergedLanguages.push(language);
          await writePluginArtifact(
            gameRootPath,
            gameId,
            'sugarlang',
            artifactPaths.lexicon(language),
            serializeLexiconPack(pack, 'draft'),
          );
          console.log(`[SL·Editor] merged ${added} new explicit lexicon entries for "${language}"`);
        }
      }

      const nextFiles = Array.from(new Set([
        ...files,
        ...repairedLexicons.map((repaired) => artifactPaths.lexicon(repaired.language)),
        ...mergedLanguages.map((lang) => artifactPaths.lexicon(lang)),
        ...(createdBandPolicies || repairedBands.length > 0 ? [artifactPaths.bandPolicies()] : []),
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
        loadWarnings: [
          ...warnings,
          ...(repairedLexicons.length > 0
            ? [`Seeded bundle lexicons for ${repairedLexicons.map((repaired) => repaired.language).join(', ')} from the shared language files.`]
            : []),
          ...(mergedLanguages.length > 0
            ? [`Merged new explicit lexicon entries for ${mergedLanguages.join(', ')} from code.`]
            : []),
          ...(createdBandPolicies
            ? ['Created missing band policies artifact from Sugarlang defaults.']
            : []),
          ...(repairedBands.length > 0
            ? [`Filled missing delivery contracts for band policies: ${Array.from(new Set(repairedBands)).join(', ')}.`]
            : []),
        ],
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

    // Build dialogue lookup for turn generation
    const dialogueMap = new Map(
      (projectInput.dialogues ?? []).map((d: any) => [d.id, d]),
    );
    const npcMap = new Map(
      (projectInput.npcs ?? []).map((n: any) => [n.id, n.name as string]),
    );
    const currentInteractionIds = new Set(
      syncResult.interactions.map((ix) => ix.interactionId),
    );

    const stalePairsByPack = new Map<string, StaleTurnPair[]>();

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

      // Use the persisted lexicons as-is — sync reads from them, never regenerates them.
      // Lexicon changes happen through the lexicon editor, not through quest sync.
      const nextLexicons = new Map(current.editBundle.lexicons);

      // Generate fresh banded turns and reconcile with existing packs (ADR-015 Phase 2)
      const nextScenePacks = new Map(current.editBundle.sceneLanguagePacks);
      const totalSummary: ReconciliationSummary = {
        regenerated: 0,
        flaggedStale: 0,
        flaggedOrphaned: 0,
        skipped: 0,
        added: 0,
      };

      for (const [packKey, existingPack] of current.editBundle.sceneLanguagePacks) {
        if (existingPack.scenarioId !== selectedScenarioId) continue;
        if (disabledLanguages.has(existingPack.targetLanguage)) continue;

        const lang = existingPack.targetLanguage;
        const lexicon = nextLexicons.get(lang);
        if (!lexicon) continue;

        // Generate fresh turns for all interactions in this language
        const allFreshBands: import('../../../plugins/sugarlang/types').SceneBandRealization[] = [];
        for (const interaction of syncResult.interactions) {
          const dlgTree = interaction.sourceDialogueId
            ? dialogueMap.get(interaction.sourceDialogueId)
            : null;

          const dialogueLines = dlgTree
            ? walkDialogueForTurnDerivation(dlgTree as any)
            : [];

          if (dialogueLines.length === 0) continue;

          const npcName = interaction.npcId
            ? npcMap.get(interaction.npcId) ?? interaction.npcName
            : interaction.npcName;

          const generated = generateBandedTurns({
            interaction,
            dialogueLines,
            lexicon,
            targetLanguage: lang,
            supportLanguage: existingPack.supportLanguage,
            bands: (generatedScenario.supportedBands ?? currentScenario.supportedBands),
            npcName,
          });

          allFreshBands.push(...generated.bands);
        }

        // Merge fresh bands by bandId (multiple interactions → single band)
        const mergedFreshByBand = new Map<string, import('../../../plugins/sugarlang/types').SceneBandRealization>();
        for (const fb of allFreshBands) {
          const existing = mergedFreshByBand.get(fb.bandId);
          if (existing) {
            existing.turns.push(...fb.turns);
          } else {
            mergedFreshByBand.set(fb.bandId, { ...fb, turns: [...fb.turns] });
          }
        }
        const mergedFreshBands = Array.from(mergedFreshByBand.values());

        // Reconcile existing turns with fresh turns
        const { bands: reconciledBands, summary, stalePairs } = reconcileTurns(
          existingPack.bands,
          mergedFreshBands,
          currentInteractionIds,
        );

        totalSummary.regenerated += summary.regenerated;
        totalSummary.flaggedStale += summary.flaggedStale;
        totalSummary.flaggedOrphaned += summary.flaggedOrphaned;
        totalSummary.skipped += summary.skipped;
        totalSummary.added += summary.added;

        if (stalePairs.length > 0) {
          stalePairsByPack.set(packKey, stalePairs);
        }

        nextScenePacks.set(packKey, {
          ...existingPack,
          bands: reconciledBands,
        });
      }

      // Create new packs for enabled languages that don't have one yet
      const existingPackLangs = new Set(
        Array.from(nextScenePacks.values())
          .filter((p) => p.scenarioId === selectedScenarioId)
          .map((p) => p.targetLanguage),
      );
      for (const [lang, lexicon] of nextLexicons) {
        if (existingPackLangs.has(lang)) continue;
        if (disabledLanguages.has(lang)) continue;

        // Generate fresh turns for this new language
        const newBands: import('../../../plugins/sugarlang/types').SceneBandRealization[] = [];
        for (const interaction of syncResult.interactions) {
          const dlgTree = interaction.sourceDialogueId
            ? dialogueMap.get(interaction.sourceDialogueId)
            : null;
          const dialogueLines = dlgTree
            ? walkDialogueForTurnDerivation(dlgTree as any)
            : [];
          if (dialogueLines.length === 0) continue;

          const npcName = interaction.npcId
            ? npcMap.get(interaction.npcId) ?? interaction.npcName
            : interaction.npcName;

          const generated = generateBandedTurns({
            interaction,
            dialogueLines,
            lexicon,
            targetLanguage: lang,
            supportLanguage: lang === 'en' ? 'es' : 'en',
            bands: (generatedScenario.supportedBands ?? currentScenario.supportedBands),
            npcName,
          });
          newBands.push(...generated.bands);
        }

        // Merge bands by bandId
        const mergedByBand = new Map<string, import('../../../plugins/sugarlang/types').SceneBandRealization>();
        for (const fb of newBands) {
          const existing = mergedByBand.get(fb.bandId);
          if (existing) {
            existing.turns.push(...fb.turns);
          } else {
            mergedByBand.set(fb.bandId, { ...fb, turns: [...fb.turns] });
          }
        }

        const packKey = `languages/${lang}/scenes/${selectedScenarioId}.json`;
        nextScenePacks.set(packKey, {
          scenarioId: selectedScenarioId,
          targetLanguage: lang,
          supportLanguage: lang === 'en' ? 'es' : 'en',
          bands: Array.from(mergedByBand.values()),
        });
        totalSummary.added += newBands.reduce((sum, b) => sum + b.turns.length, 0);
      }

      return {
        ...current,
        editBundle: {
          ...current.editBundle,
          scenarios: nextScenarios,
          groundingMaps: nextGroundingMaps,
          questBindings: nextQuestBindings,
          lexicons: nextLexicons,
          sceneLanguagePacks: nextScenePacks,
        },
      };
    });

    // Open reconciliation modal if stale turns were detected (pick first pack with stale pairs)
    const firstStalePack = stalePairsByPack.entries().next();
    if (!firstStalePack.done) {
      const [packKey, pairs] = firstStalePack.value;
      setReconciliationPairs(pairs);
      setReconciliationPackKey(packKey);
    }

    const totalStalePairCount = Array.from(stalePairsByPack.values()).reduce((sum, p) => sum + p.length, 0);
    const allWarnings = [...warnings, ...syncResult.warnings];
    const issueCount = errors.length + allWarnings.length;
    const interactionCount = syncResult.interactions.length;
    const staleNote = totalStalePairCount > 0
      ? ` ${totalStalePairCount} stale turn(s) need review.`
      : '';
    setActionFeedback(
      `Synced "${selectedScenarioId}" from quest "${quest.name}": ${interactionCount} interaction(s)`
      + (issueCount > 0 ? `, ${issueCount} issue(s)` : '')
      + staleNote
      + '. Save the game to persist.',
    );
  }, [
    availableQuests,
    disabledLanguages,
    projectInput,
    selectedScenario,
    selectedScenarioId,
    state.editBundle,
  ]);

  // ---------------------------------------------------------------------------
  // LLM Refinement handlers (ADR-015 Phase 4)
  // ---------------------------------------------------------------------------

  const handleCopyRefinementPacket = useCallback((turnId: string) => {
    if (!state.editBundle || !selectedScenarioId || !selectedTurnPackKey || !selectedTurnBandId) return;

    const scenario = state.editBundle.scenarios.get(selectedScenarioId);
    const pack = state.editBundle.sceneLanguagePacks.get(selectedTurnPackKey);
    if (!scenario || !pack) return;

    const lexicon = state.editBundle.lexicons.get(pack.targetLanguage);
    const packet = assembleRefinementPacket({
      scenario,
      pack,
      bandId: selectedTurnBandId as LearnerBandId,
      bandPolicies: state.editBundle.bandPolicies,
      lexicon,
      targetTurnId: turnId,
    });

    navigator.clipboard.writeText(JSON.stringify(packet, null, 2)).then(
      () => setActionFeedback(`Refinement packet for "${turnId}" copied to clipboard.`),
      () => setActionFeedback('Failed to copy to clipboard.'),
    );
  }, [state.editBundle, selectedScenarioId, selectedTurnPackKey, selectedTurnBandId]);

  const handleCopyBandRefinementPacket = useCallback(() => {
    if (!state.editBundle || !selectedScenarioId || !selectedTurnPackKey || !selectedTurnBandId) return;

    const scenario = state.editBundle.scenarios.get(selectedScenarioId);
    const pack = state.editBundle.sceneLanguagePacks.get(selectedTurnPackKey);
    if (!scenario || !pack) return;

    const lexicon = state.editBundle.lexicons.get(pack.targetLanguage);
    const packet = assembleRefinementPacket({
      scenario,
      pack,
      bandId: selectedTurnBandId as LearnerBandId,
      bandPolicies: state.editBundle.bandPolicies,
      lexicon,
    });

    navigator.clipboard.writeText(JSON.stringify(packet, null, 2)).then(
      () => setActionFeedback(`Band ${selectedTurnBandId} refinement packet copied (${packet.targetTurnIds.length} turn(s)).`),
      () => setActionFeedback('Failed to copy to clipboard.'),
    );
  }, [state.editBundle, selectedScenarioId, selectedTurnPackKey, selectedTurnBandId]);

  const handleLlmRefineBand = useCallback(async () => {
    if (!state.editBundle || !selectedScenarioId || !selectedTurnPackKey || !selectedTurnBandId) return;

    const scenario = state.editBundle.scenarios.get(selectedScenarioId);
    const pack = state.editBundle.sceneLanguagePacks.get(selectedTurnPackKey);
    if (!scenario || !pack) return;

    const lexicon = state.editBundle.lexicons.get(pack.targetLanguage);
    const packet = assembleRefinementPacket({
      scenario,
      pack,
      bandId: selectedTurnBandId as LearnerBandId,
      bandPolicies: state.editBundle.bandPolicies,
      lexicon,
    });

    setRefining(true);
    setActionFeedback(`Refining ${packet.targetTurnIds.length} turn(s) via ${refinementProvider}...`);

    try {
      const result = await callRefinement(packet, refinementProvider);

      if (!result.ok || !result.proposal) {
        setActionFeedback(`Refinement failed: ${result.error ?? 'Unknown error'}`);
        setRefining(false);
        return;
      }

      const { proposal, error } = parseRefinementProposal(JSON.stringify(result.proposal));
      if (error || !proposal) {
        setActionFeedback(`Proposal parse error: ${error}`);
        setRefining(false);
        return;
      }

      const band = pack.bands.find((b) => b.bandId === selectedTurnBandId);
      if (!band) { setRefining(false); return; }

      const { band: updatedBand, appliedTurnIds } = applyRefinementProposal(band, proposal);

      if (appliedTurnIds.length === 0) {
        setActionFeedback('LLM returned proposals but no turn IDs matched.');
        setRefining(false);
        return;
      }

      const updatedPack = {
        ...pack,
        bands: pack.bands.map((b) => (b.bandId === selectedTurnBandId ? updatedBand : b)),
      };

      setState((current) => {
        if (!current.editBundle) return current;
        const nextPacks = new Map(current.editBundle.sceneLanguagePacks);
        nextPacks.set(selectedTurnPackKey, updatedPack);
        return {
          ...current,
          editBundle: { ...current.editBundle, sceneLanguagePacks: nextPacks },
        };
      });

      setActionFeedback(
        `Refined ${appliedTurnIds.length} turn(s) via ${result.provider}/${result.model}. Review and save.`,
      );
    } catch (err) {
      setActionFeedback(`Refinement error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefining(false);
    }
  }, [state.editBundle, selectedScenarioId, selectedTurnPackKey, selectedTurnBandId, refinementProvider]);

  const handleRefineAll = useCallback(async () => {
    if (!state.editBundle || !selectedScenarioId || !selectedTurnPackKey) return;

    const scenario = state.editBundle.scenarios.get(selectedScenarioId);
    let pack = state.editBundle.sceneLanguagePacks.get(selectedTurnPackKey);
    if (!scenario || !pack) return;

    const lexicon = state.editBundle.lexicons.get(pack.targetLanguage);
    const bandIds = pack.bands.map((b) => b.bandId);

    setRefining(true);
    let totalApplied = 0;

    for (const bandId of bandIds) {
      setActionFeedback(`Refining band ${bandId} (${bandIds.indexOf(bandId) + 1}/${bandIds.length})...`);

      const packet = assembleRefinementPacket({
        scenario,
        pack,
        bandId: bandId as LearnerBandId,
        bandPolicies: state.editBundle.bandPolicies,
        lexicon,
      });

      if (packet.targetTurnIds.length === 0) continue;

      try {
        const result = await callRefinement(packet, refinementProvider);
        if (!result.ok || !result.proposal) continue;

        const { proposal, error } = parseRefinementProposal(JSON.stringify(result.proposal));
        if (error || !proposal) continue;

        const band = pack.bands.find((b) => b.bandId === bandId);
        if (!band) continue;

        const { band: updatedBand, appliedTurnIds } = applyRefinementProposal(band, proposal);
        totalApplied += appliedTurnIds.length;

        pack = {
          ...pack,
          bands: pack.bands.map((b) => (b.bandId === bandId ? updatedBand : b)),
        };
      } catch {
        // Continue with next band on error
      }
    }

    setState((current) => {
      if (!current.editBundle) return current;
      const nextPacks = new Map(current.editBundle.sceneLanguagePacks);
      nextPacks.set(selectedTurnPackKey, pack!);
      return {
        ...current,
        editBundle: { ...current.editBundle, sceneLanguagePacks: nextPacks },
      };
    });

    setActionFeedback(`Refined ${totalApplied} turn(s) across ${bandIds.length} bands. Review and save.`);
    setRefining(false);
  }, [state.editBundle, selectedScenarioId, selectedTurnPackKey, refinementProvider]);

  const handleReconciliationResolve = useCallback((resolved: ResolvedTurn[]) => {
    if (!reconciliationPackKey) return;

    setState((current) => {
      if (!current.editBundle) return current;

      const pack = current.editBundle.sceneLanguagePacks.get(reconciliationPackKey);
      if (!pack) return current;

      // Build a lookup: turnId → resolved turn
      const resolvedMap = new Map(resolved.map((r) => [r.turnId, r]));

      const updatedBands = pack.bands.map((band) => ({
        ...band,
        turns: band.turns.map((turn) => {
          const resolution = resolvedMap.get(turn.turnId);
          return resolution ? resolution.turn : turn;
        }),
      }));

      const nextPacks = new Map(current.editBundle.sceneLanguagePacks);
      nextPacks.set(reconciliationPackKey, { ...pack, bands: updatedBands });

      return {
        ...current,
        editBundle: { ...current.editBundle, sceneLanguagePacks: nextPacks },
      };
    });

    const kept = resolved.filter((r) => r.decision === 'keep').length;
    const accepted = resolved.filter((r) => r.decision === 'accept').length;
    const edited = resolved.filter((r) => r.decision === 'edit').length;
    setActionFeedback(
      `Reconciled ${resolved.length} stale turn(s): ${kept} kept, ${accepted} accepted, ${edited} edited.`,
    );
    setReconciliationPairs([]);
    setReconciliationPackKey(null);
  }, [reconciliationPackKey]);

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
        onCopyRefinementPacket: handleCopyRefinementPacket,
        onCopyBandRefinementPacket: handleCopyBandRefinementPacket,
        onLlmRefineBand: handleLlmRefineBand,
        onRefineAll: handleRefineAll,
        refining,
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
            const packEntries = getScenarioPackEntries(state.editBundle, scenario.scenarioId)
              .filter(([, pack]) => !disabledLanguages.has(pack.targetLanguage));
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
                  <Text size="sm" fw={600} truncate>
                    {scenario.scenarioId}
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
          {selectedScenario?.associatedQuestId && (
            <Text size="xs" c="dimmed">
              Quest: {selectedScenario.associatedQuestId}
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
              height: '100%',
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <div style={{ borderRight: '1px solid #313244', minWidth: 0, overflow: 'auto', height: '100%' }}>
              {languageEditor.list}
            </div>
            <div style={{ minWidth: 0, height: '100%', overflow: 'hidden' }}>
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


      <ReconciliationModal
        opened={reconciliationPairs.length > 0}
        stalePairs={reconciliationPairs}
        onResolve={handleReconciliationResolve}
        onClose={() => { setReconciliationPairs([]); setReconciliationPackKey(null); }}
      />

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
            { value: 'languages', label: 'Turns' },
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

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
            <>
            <SimpleGrid cols={2} spacing="sm">
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

                    <Stack gap={4}>
                      {pack.bands.map((band) => {
                        const counts = { generated: 0, reviewed: 0, manual: 0, stale: 0, orphaned: 0 };
                        for (const t of band.turns) {
                          if (t.stale) counts.stale++;
                          else if (t.orphaned) counts.orphaned++;
                          else {
                            const s = t.editStatus ?? 'generated';
                            if (s in counts) counts[s as keyof typeof counts]++;
                            else counts.generated++;
                          }
                        }
                        const total = band.turns.length;
                        return (
                          <Group key={band.bandId} gap={8} wrap="nowrap">
                            <Text size="xs" fw={600} w={24} ta="center" style={{ flexShrink: 0 }}>{band.bandId}</Text>
                            {total > 0 ? (
                              <Tooltip
                                label={`${counts.generated} generated, ${counts.reviewed} reviewed, ${counts.manual} manual${counts.stale ? `, ${counts.stale} stale` : ''}${counts.orphaned ? `, ${counts.orphaned} orphaned` : ''}`}
                                withArrow
                              >
                                <div style={{ flex: 1, display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', border: '1px solid #313244' }}>
                                  {counts.generated > 0 && <div style={{ width: `${(counts.generated / total) * 100}%`, background: '#585b70' }} />}
                                  {counts.reviewed > 0 && <div style={{ width: `${(counts.reviewed / total) * 100}%`, background: '#89b4fa' }} />}
                                  {counts.manual > 0 && <div style={{ width: `${(counts.manual / total) * 100}%`, background: '#cba6f7' }} />}
                                  {counts.stale > 0 && <div style={{ width: `${(counts.stale / total) * 100}%`, background: '#f9e2af' }} />}
                                  {counts.orphaned > 0 && <div style={{ width: `${(counts.orphaned / total) * 100}%`, background: '#f38ba8' }} />}
                                </div>
                              </Tooltip>
                            ) : (
                              <Text size="xs" c="dimmed">no turns</Text>
                            )}
                            <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{total}</Text>
                          </Group>
                        );
                      })}
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
            <Group gap="md" mt={4}>
              {[
                { color: '#585b70', label: 'Generated' },
                { color: '#89b4fa', label: 'Reviewed' },
                { color: '#cba6f7', label: 'Manual' },
                { color: '#f9e2af', label: 'Stale' },
                { color: '#f38ba8', label: 'Orphaned' },
              ].map((item) => (
                <Group key={item.label} gap={4}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: item.color }} />
                  <Text size="xs" c="dimmed">{item.label}</Text>
                </Group>
              ))}
            </Group>
            </>
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
