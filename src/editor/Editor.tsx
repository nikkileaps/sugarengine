/**
 * Editor - Main React component for the Sugar Engine editor
 *
 * This is the new React/Mantine based editor. Components will be
 * migrated here from the legacy vanilla EditorApp over time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MantineProvider, createTheme, AppShell, Group, Tabs, Text, Stack, Button, Modal, Textarea, ActionIcon, ScrollArea, Switch, Select, TextInput } from '@mantine/core';
import '@mantine/core/styles.css';
import { useEditorStore } from './store';
import type { EditorTab } from './store/useEditorStore';
import { NPCPanel } from './panels/npc';
import { ItemPanel } from './panels/item';
import { QuestPanel } from './panels/quest';
import { InspectionPanel } from './panels/inspection';
import { RegionPanel } from './panels/region';
import { DialoguePanel } from './panels/dialogue';
import { MagicPanel } from './panels/magic';
import { PlayerPanel } from './panels/player';
import { ResonancePanel } from './panels/resonance';
import { VFXPanel } from './panels/vfx';
import { SugarlangPanel } from './panels/sugarlang';
import { WelcomeDialog } from './components/WelcomeDialog';
import { NewGameDialog } from './components/NewGameDialog';
import { OpenGameDialog } from './components/OpenGameDialog';
import { ProjectMenu } from './components/ProjectMenu';
import { ProjectExplorer } from './components/ProjectExplorer';
import { EpisodeDialog } from './components/EpisodeDialog';
import { EpisodeDetailsDialog } from './components/EpisodeDetailsDialog';
import { PreviewManager } from './PreviewManager';
import type { ProjectData as PreviewProjectData } from './PreviewManager';
import type { PluginConfigData } from './store/useEditorStore';
import { createGame, loadWebPublishProfile, openGame, pickGameProjectFile, pickGameRootDirectory, publishWebTarget, saveGame } from './game-root/service';
import { loadAllSugarlangArtifacts } from './game-root/plugin-artifacts';
import type {
  WebPublishProfile,
  WebPublishCredentials,
  WebPublishEnvironment,
  WebPublishTarget,
} from './game-root/web-publish-profile';
import {
  buildProjectDocumentFromSnapshot,
  type EditorProjectDocument,
} from './game-root/project-document';
import {
  buildRuntimeProjectDocument,
  buildSugarlangRuntimeConfig,
} from './game-root/runtime-document.js';
import type {
  SugarAgentGenerationConfig,
  SugarAgentGenerationProvider,
} from '../../packages/sugaragent-runtime-core/src/runtime/generation-config';
import {
  resolveSugarAgentGenerationConfig,
} from '../../packages/sugaragent-runtime-core/src/runtime/generation-config';

const BASE_TABS: { value: EditorTab; label: string; icon: string }[] = [
  { value: 'dialogues', label: 'Dialogues', icon: '💬' },
  { value: 'quests', label: 'Quests', icon: '📜' },
  { value: 'npcs', label: 'NPCs', icon: '👤' },
  { value: 'items', label: 'Items', icon: '🎒' },
  { value: 'spells', label: 'Spells', icon: '✨' },
  { value: 'resonance', label: 'Resonance', icon: '🦋' },
  { value: 'vfx', label: 'VFX', icon: '🔥' },
  { value: 'player', label: 'Player', icon: '🧙' },
  { value: 'inspections', label: 'Inspections', icon: '🔍' },
  { value: 'regions', label: 'Regions', icon: '🗺️' },
];

const PLUGIN_TABS: { value: EditorTab; label: string; icon: string; pluginId: string }[] = [
  { value: 'sugarlang', label: 'Sugarlang', icon: '🌍', pluginId: 'sugarlang' },
];

const AVAILABLE_PLUGINS = [
  {
    id: 'sugaragent',
    name: 'SugarAgent',
    description: 'Agentic NPC conversation, memory, lore retrieval, and beat contracts.',
  },
  {
    id: 'sugarlang',
    name: 'Sugarlang',
    description: 'Immersive language-learning overlay with learner bands, repair, and grounded vocabulary.',
  },
] as const;

const SUGARAGENT_RUNTIME_MODE_OPTIONS = [
  { value: 'llama', label: 'llama (default)' },
  { value: 'auto', label: 'auto' },
  { value: 'mock', label: 'mock (testing only)' },
] as const;
type SugarAgentRuntimeMode = (typeof SUGARAGENT_RUNTIME_MODE_OPTIONS)[number]['value'];

const SUGARAGENT_GENERATION_PROVIDER_OPTIONS = [
  { value: 'selfHosted', label: 'Self-hosted' },
  { value: 'openai', label: 'OpenAI' },
] as const;

const WEB_PUBLISH_TARGET_OPTIONS = [
  { value: 'web', label: 'web' },
] as const;

const WEB_PUBLISH_ENVIRONMENT_OPTIONS = [
  { value: 'production', label: 'production' },
  { value: 'staging', label: 'staging' },
] as const;

const WEB_PUBLISH_CREDENTIAL_OPTIONS = [
  { value: 'include', label: 'include' },
  { value: 'same-origin', label: 'same-origin' },
  { value: 'omit', label: 'omit' },
] as const;

const theme = createTheme({
  primaryColor: 'blue',
  colors: {
    dark: [
      '#cdd6f4', // 0 - text
      '#bac2de', // 1
      '#a6adc8', // 2
      '#9399b2', // 3
      '#7f849c', // 4
      '#6c7086', // 5
      '#45475a', // 6 - borders/dividers
      '#313244', // 7 - elevated surfaces
      '#1e1e2e', // 8 - main background
      '#181825', // 9 - deepest background
    ],
  },
  defaultRadius: 'md',
  other: {
    appBackground: '#1e1e2e',
  },
});

function normalizePlugins(rawPlugins: unknown): PluginConfigData[] {
  if (!Array.isArray(rawPlugins)) return [];
  const normalized: PluginConfigData[] = [];

  for (const entry of rawPlugins) {
    if (typeof entry === 'string') {
      const id = entry.trim();
      if (id.length > 0) {
        normalized.push({ id, enabled: true });
      }
      continue;
    }
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || record.id.trim().length === 0) continue;
    const pluginId = record.id.trim();
    const normalizedEntry: PluginConfigData = {
      ...record,
      id: pluginId,
      enabled: record.enabled === false ? false : true,
    } as PluginConfigData;
    if (pluginId === 'sugaragent') {
      normalizedEntry.generation = normalizeSugarAgentGenerationConfigValue(
        normalizedEntry.generation,
        normalizedEntry.runtimeMode ?? normalizedEntry.runtime,
      );
      normalizedEntry.runtimeMode = normalizeSugarAgentRuntimeMode(
        normalizedEntry.runtimeMode ?? normalizedEntry.runtime,
      );
      delete normalizedEntry.runtime;
    }
    normalized.push(normalizedEntry);
  }

  return normalized;
}

function isPluginEnabled(plugins: PluginConfigData[], pluginId: string): boolean {
  const id = pluginId.trim();
  return plugins.some((entry) => entry.id === id && entry.enabled !== false);
}

function parseStringList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeSugarAgentRuntimeMode(value: unknown): SugarAgentRuntimeMode {
  if (value === 'auto' || value === 'mock' || value === 'llama') {
    return value;
  }
  return 'llama';
}

function normalizeSugarAgentGenerationProvider(value: unknown): SugarAgentGenerationProvider {
  return value === 'openai' ? value : 'selfHosted';
}

function normalizeSugarAgentGenerationConfigValue(
  generation: unknown,
  legacyRuntimeMode?: unknown,
): SugarAgentGenerationConfig {
  const resolved = resolveSugarAgentGenerationConfig({
    generation: (typeof generation === 'object' && generation !== null)
      ? generation as SugarAgentGenerationConfig
      : undefined,
    legacyRuntimeMode: normalizeSugarAgentRuntimeMode(legacyRuntimeMode),
  });
  return {
    provider: resolved.provider,
    selfHosted: {
      runtimeMode: resolved.selfHosted.runtimeMode,
    },
    openai: {
      model: resolved.openai.model,
      baseUrl: resolved.openai.baseUrl,
    },
  };
}

function normalizeStringArrayValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function toGameSlug(value: string | null | undefined): string {
  const normalized = (value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'untitled-game';
}

async function syncCliActiveGame(slug: string, rootPath: string, projectFilePath: string): Promise<void> {
  const cleanSlug = toGameSlug(slug);
  try {
    const response = await fetch('/__sugarengine/active-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: cleanSlug,
        rootPath,
        projectFilePath,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.warn(
        `[Editor] Could not sync CLI active game to "${cleanSlug}" (${response.status} ${response.statusText})`,
        detail,
      );
    }
  } catch {
    // Endpoint is only available in local dev server context.
  }
}

export function Editor() {
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const projectLoaded = useEditorStore((s) => s.projectLoaded);
  const projectName = useEditorStore((s) => s.projectName);
  const setProjectContext = useEditorStore((s) => s.setProjectContext);
  const gameId = useEditorStore((s) => s.gameId);
  const gameRootPath = useEditorStore((s) => s.gameRootPath);
  const projectFilePath = useEditorStore((s) => s.projectFilePath);
  const projectCreatedAt = useEditorStore((s) => s.projectCreatedAt);
  const projectVersion = useEditorStore((s) => s.projectVersion);
  const defaultEpisodeId = useEditorStore((s) => s.defaultEpisodeId);
  const npcs = useEditorStore((s) => s.npcs);
  const setNPCs = useEditorStore((s) => s.setNPCs);
  const dialogues = useEditorStore((s) => s.dialogues);
  const setDialogues = useEditorStore((s) => s.setDialogues);
  const quests = useEditorStore((s) => s.quests);
  const setQuests = useEditorStore((s) => s.setQuests);
  const items = useEditorStore((s) => s.items);
  const setItems = useEditorStore((s) => s.setItems);
  const inspections = useEditorStore((s) => s.inspections);
  const setInspections = useEditorStore((s) => s.setInspections);
  const seasons = useEditorStore((s) => s.seasons);
  const setSeasons = useEditorStore((s) => s.setSeasons);
  const episodes = useEditorStore((s) => s.episodes);
  const setEpisodes = useEditorStore((s) => s.setEpisodes);
  const plugins = useEditorStore((s) => s.plugins);
  const setPlugins = useEditorStore((s) => s.setPlugins);
  const enabledPluginIds = useMemo(() => new Set(plugins.filter((p) => p.enabled !== false).map((p) => p.id)), [plugins]);
  const tabs = useMemo(() => [
    ...BASE_TABS,
    ...PLUGIN_TABS.filter((t) => enabledPluginIds.has(t.pluginId)),
  ], [enabledPluginIds]);
  const regions = useEditorStore((s) => s.regions);
  const setRegions = useEditorStore((s) => s.setRegions);
  const playerCaster = useEditorStore((s) => s.playerCaster);
  const setPlayerCaster = useEditorStore((s) => s.setPlayerCaster);
  const playerModel = useEditorStore((s) => s.playerModel);
  const setPlayerModel = useEditorStore((s) => s.setPlayerModel);
  const playerAnimations = useEditorStore((s) => s.playerAnimations);
  const setPlayerAnimations = useEditorStore((s) => s.setPlayerAnimations);
  const titleScreen = useEditorStore((s) => s.titleScreen);
  const setTitleScreen = useEditorStore((s) => s.setTitleScreen);
  const spells = useEditorStore((s) => s.spells);
  const setSpells = useEditorStore((s) => s.setSpells);
  const resonancePoints = useEditorStore((s) => s.resonancePoints);
  const setResonancePoints = useEditorStore((s) => s.setResonancePoints);
  const vfxDefinitions = useEditorStore((s) => s.vfxDefinitions);
  const setVFXDefinitions = useEditorStore((s) => s.setVFXDefinitions);
  const currentSeasonId = useEditorStore((s) => s.currentSeasonId);
  const currentEpisodeId = useEditorStore((s) => s.currentEpisodeId);
  const setCurrentSeason = useEditorStore((s) => s.setCurrentSeason);
  const setCurrentEpisode = useEditorStore((s) => s.setCurrentEpisode);

  // Welcome dialog state - open by default if no project loaded
  const [welcomeDialogOpen, setWelcomeDialogOpen] = useState(!projectLoaded);

  // Project explorer dialog state
  const [projectExplorerOpen, setProjectExplorerOpen] = useState(false);

  // New episode dialog state
  const [newEpisodeDialogOpen, setNewEpisodeDialogOpen] = useState(false);

  // Episode details dialog state
  const [episodeDetailsDialogOpen, setEpisodeDetailsDialogOpen] = useState(false);

  // New project dialog state (for creating from menu)
  const [newGameDialogOpen, setNewGameDialogOpen] = useState(false);
  const [newGameName, setNewGameName] = useState('My Game');
  const [newGameSlug, setNewGameSlug] = useState('my-game');
  const [newGameRootPath, setNewGameRootPath] = useState('games/my-game');
  const [newGameSlugDirty, setNewGameSlugDirty] = useState(false);
  const [newGameRootPathDirty, setNewGameRootPathDirty] = useState(false);
  const [pickingNewGameRoot, setPickingNewGameRoot] = useState(false);
  const [openGameDialogOpen, setOpenGameDialogOpen] = useState(false);
  const [openGamePath, setOpenGamePath] = useState('');
  const [pickingOpenGamePath, setPickingOpenGamePath] = useState(false);
  const [gameLifecycleBusy, setGameLifecycleBusy] = useState(false);
  const [gameLifecycleError, setGameLifecycleError] = useState<string | null>(null);
  const [pluginsDialogOpen, setPluginsDialogOpen] = useState(false);
  const [gameSettingsOpen, setGameSettingsOpen] = useState(false);
  const [gameSettingsTitle, setGameSettingsTitle] = useState('');
  const [gameSettingsSubtitle, setGameSettingsSubtitle] = useState('');
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishTarget, setPublishTarget] = useState<WebPublishTarget>('web');
  const [publishEnvironment, setPublishEnvironment] = useState<WebPublishEnvironment>('production');
  const [publishProfilePath, setPublishProfilePath] = useState('');
  const [publishGameApiBaseUrl, setPublishGameApiBaseUrl] = useState('');
  const [publishBackendRequired, setPublishBackendRequired] = useState(true);
  const [publishCredentials, setPublishCredentials] = useState<WebPublishCredentials>('include');
  const [publishSugarAgentGenerationProvider, setPublishSugarAgentGenerationProvider] = useState<SugarAgentGenerationProvider>('selfHosted');
  const [publishSugarAgentRuntimeMode, setPublishSugarAgentRuntimeMode] = useState<SugarAgentRuntimeMode>('llama');
  const [publishSugarAgentOpenAiModel, setPublishSugarAgentOpenAiModel] = useState('gpt-5-mini');
  const [publishSugarAgentOpenAiBaseUrl, setPublishSugarAgentOpenAiBaseUrl] = useState('https://api.openai.com/v1');
  const [publishProfileLoading, setPublishProfileLoading] = useState(false);
  const [sugarAgentSettingsOpen, setSugarAgentSettingsOpen] = useState(false);
  const [resettingSugarAgentRuntime, setResettingSugarAgentRuntime] = useState(false);
  const [resettingSugarAgentSessions, setResettingSugarAgentSessions] = useState(false);
  const [reingestingSugarAgentLore, setReingestingSugarAgentLore] = useState(false);
  const [sugarAgentRuntimeMessage, setSugarAgentRuntimeMessage] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [checkingSugarAgentHealth, setCheckingSugarAgentHealth] = useState(false);
  const [sugarAgentHealthStatus, setSugarAgentHealthStatus] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);

  const [saveFlashVisible, setSaveFlashVisible] = useState(false);
  const [sugarlangDirty, setSugarlangDirty] = useState(false);
  const sugarlangSaveHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const sugarlangOpenSettingsHandlerRef = useRef<(() => void) | null>(null);

  // Auto-hide the save flash after a short delay.
  useEffect(() => {
    if (!saveFlashVisible) return;
    const timer = setTimeout(() => setSaveFlashVisible(false), 1800);
    return () => clearTimeout(timer);
  }, [saveFlashVisible]);

  // Get current episode
  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId);
  const resolvedGameId = gameId ?? toGameSlug(projectName ?? 'untitled-game');

  const isEditorEnabled = Boolean(projectLoaded && currentEpisodeId);
  const setDirty = useEditorStore((s) => s.setDirty);

  // Preview manager (singleton)
  const previewManagerRef = useRef<PreviewManager | null>(null);
  if (!previewManagerRef.current) {
    previewManagerRef.current = new PreviewManager();
  }

  const resetNewGameDraft = () => {
    const nextName = 'My Game';
    const nextSlug = toGameSlug(nextName);
    setNewGameName(nextName);
    setNewGameSlug(nextSlug);
    setNewGameRootPath(`games/${nextSlug}`);
    setNewGameSlugDirty(false);
    setNewGameRootPathDirty(false);
  };

  const closeNewGameDialog = () => {
    setNewGameDialogOpen(false);
    setGameLifecycleError(null);
    if (!projectLoaded) {
      setWelcomeDialogOpen(true);
    }
  };

  const closeOpenGameDialog = () => {
    setOpenGameDialogOpen(false);
    setGameLifecycleError(null);
    if (!projectLoaded) {
      setWelcomeDialogOpen(true);
    }
  };

  const openNewGameDialog = () => {
    setGameLifecycleError(null);
    resetNewGameDraft();
    setWelcomeDialogOpen(false);
    setOpenGameDialogOpen(false);
    setNewGameDialogOpen(true);
  };

  const openOpenGameDialog = () => {
    setGameLifecycleError(null);
    setOpenGamePath('');
    setWelcomeDialogOpen(false);
    setNewGameDialogOpen(false);
    setOpenGameDialogOpen(true);
  };

  const applyProjectToEditor = async (result: {
    rootPath: string;
    projectFilePath: string;
    project: EditorProjectDocument;
  }) => {
    const project = result.project;
    const loadedSeasons = project.seasons;
    const loadedEpisodes = project.episodes;
    const firstSeason = [...loadedSeasons].sort((a, b) => a.order - b.order)[0];
    const preferredEpisodeId = project.defaultEpisode
      ?? loadedEpisodes[0]?.id
      ?? null;
    const preferredEpisode = preferredEpisodeId
      ? loadedEpisodes.find((episode) => episode.id === preferredEpisodeId) ?? null
      : null;
    const resolvedSeasonId = preferredEpisode?.seasonId
      ?? firstSeason?.id
      ?? null;
    const resolvedEpisodeId = preferredEpisode?.id ?? (resolvedSeasonId
      ? [...loadedEpisodes]
        .filter((episode) => episode.seasonId === resolvedSeasonId)
        .sort((a, b) => a.order - b.order)[0]?.id ?? null
      : null);

    setSeasons(loadedSeasons);
    setEpisodes(loadedEpisodes);
    setPlugins(normalizePlugins(project.plugins));
    setNPCs(project.npcs);
    setDialogues(project.dialogues);
    setQuests(project.quests);
    setItems(project.items);
    setInspections(project.inspections);
    setRegions(project.regions);
    setPlayerCaster(project.playerCaster);
    setPlayerModel(project.playerModel);
    setPlayerAnimations(project.playerAnimations);
    setTitleScreen(project.titleScreen);
    setSpells(project.spells);
    setResonancePoints(project.resonancePoints);
    setVFXDefinitions(project.vfxDefinitions);
    setCurrentSeason(resolvedSeasonId);
    setCurrentEpisode(resolvedEpisodeId);
    setProjectContext({
      loaded: true,
      name: project.meta.name,
      gameId: project.meta.gameId,
      gameRootPath: result.rootPath,
      projectFilePath: result.projectFilePath,
      projectCreatedAt: project.meta.createdAt ?? null,
      projectVersion: project.meta.version,
      defaultEpisodeId: project.defaultEpisode ?? resolvedEpisodeId,
    });
    setSugarlangDirty(false);
    setDirty(false);
    setWelcomeDialogOpen(false);
    setNewGameDialogOpen(false);
    setOpenGameDialogOpen(false);
    setGameLifecycleError(null);
    await syncCliActiveGame(project.meta.gameId, result.rootPath, result.projectFilePath);
  };

  const buildCurrentProjectDocument = (): EditorProjectDocument => {
    return buildProjectDocumentFromSnapshot({
      gameId: resolvedGameId,
      name: projectName || 'Untitled Game',
      version: projectVersion,
      createdAt: projectCreatedAt,
      defaultEpisode: defaultEpisodeId ?? currentEpisodeId,
      seasons,
      episodes,
      plugins,
      npcs,
      dialogues,
      quests,
      items,
      inspections,
      regions,
      playerCaster,
      playerModel,
      playerAnimations,
      titleScreen,
      spells,
      resonancePoints,
      vfxDefinitions,
    });
  };

  const handleSugarlangDirtyChange = useCallback((dirty: boolean) => {
    setSugarlangDirty(dirty);
  }, []);

  const handleSugarlangSaveHandlerChange = useCallback((handler: (() => Promise<void>) | null) => {
    sugarlangSaveHandlerRef.current = handler;
  }, []);

  const handleSugarlangOpenSettingsHandlerChange = useCallback((handler: (() => void) | null) => {
    sugarlangOpenSettingsHandlerRef.current = handler;
  }, []);

  const loadPublishProfileSettings = useCallback(async (environment: WebPublishEnvironment) => {
    if (!gameRootPath) {
      throw new Error('Open a game repository before publishing a web target.');
    }

    setPublishProfileLoading(true);
    try {
      const profile = await loadWebPublishProfile({
        rootPath: gameRootPath,
        environment,
      });
      setPublishTarget(profile.target);
      setPublishEnvironment(profile.environment);
      setPublishProfilePath(profile.profilePath);
      setPublishGameApiBaseUrl(profile.frontend.gameApiBaseUrl);
      setPublishBackendRequired(profile.frontend.backendRequired);
      setPublishCredentials(profile.frontend.credentials);
      setPublishSugarAgentGenerationProvider(
        normalizeSugarAgentGenerationProvider(profile.sugaragent.generation.provider),
      );
      setPublishSugarAgentRuntimeMode(
        normalizeSugarAgentRuntimeMode(profile.sugaragent.generation.selfHosted?.runtimeMode),
      );
      setPublishSugarAgentOpenAiModel(profile.sugaragent.generation.openai?.model ?? 'gpt-5-mini');
      setPublishSugarAgentOpenAiBaseUrl(profile.sugaragent.generation.openai?.baseUrl ?? 'https://api.openai.com/v1');
    } finally {
      setPublishProfileLoading(false);
    }
  }, [gameRootPath]);

  const openPublishDialog = useCallback(async () => {
    try {
      setGameLifecycleError(null);
      setPublishDialogOpen(true);
      await loadPublishProfileSettings('production');
    } catch (error) {
      setPublishDialogOpen(false);
      const message = error instanceof Error ? error.message : String(error);
      setGameLifecycleError(message);
      alert(`Could not load publish settings: ${message}`);
    }
  }, [loadPublishProfileSettings]);

  const openGameSettings = useCallback(() => {
    setGameSettingsTitle(titleScreen?.title ?? projectName ?? '');
    setGameSettingsSubtitle(titleScreen?.subtitle ?? '');
    setGameSettingsOpen(true);
  }, [projectName, titleScreen?.subtitle, titleScreen?.title]);

  const handleSaveGameSettings = useCallback(() => {
    const nextTitle = gameSettingsTitle.trim();
    const nextSubtitle = gameSettingsSubtitle.trim();
    const nextTitleScreen = {
      ...(titleScreen ?? {}),
      title: nextTitle || undefined,
      subtitle: nextSubtitle || undefined,
    };
    setTitleScreen(nextTitleScreen);
    setDirty(true);
    setGameSettingsOpen(false);
  }, [gameSettingsSubtitle, gameSettingsTitle, setDirty, setTitleScreen, titleScreen]);

  const handlePublishEnvironmentChange = useCallback(async (value: string | null) => {
    const nextEnvironment: WebPublishEnvironment = value === 'staging' ? 'staging' : 'production';
    try {
      setGameLifecycleError(null);
      setPublishEnvironment(nextEnvironment);
      await loadPublishProfileSettings(nextEnvironment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGameLifecycleError(message);
      alert(`Could not load publish settings: ${message}`);
    }
  }, [loadPublishProfileSettings]);

  // Open preview
  const handlePreview = async () => {
    if (!previewManagerRef.current) return;

    try {
      if (sugarlangDirty && sugarlangSaveHandlerRef.current) {
        await sugarlangSaveHandlerRef.current();
        setSugarlangDirty(false);
      }

      const sugarlangEnabled = enabledPluginIds.has('sugarlang');
      let sugarlangConfig: PreviewProjectData['sugarlang'];

      if (sugarlangEnabled) {
        const artifactFiles = gameRootPath
          ? await loadAllSugarlangArtifacts(gameRootPath, resolvedGameId)
          : new Map<string, string>();

        const slPlugin = plugins.find((p) => p.id === 'sugarlang');
        const slDisabled = Array.isArray(slPlugin?.disabledLanguages) ? slPlugin.disabledLanguages as string[] : [];

        sugarlangConfig = artifactFiles.size > 0
          ? { enabled: true, artifacts: Object.fromEntries(artifactFiles), disabledLanguages: slDisabled }
          : { enabled: true, disabledLanguages: slDisabled };
      }

      const projectData: PreviewProjectData = buildRuntimeProjectDocument({
        project: buildCurrentProjectDocument(),
        contentBasePath: `__sugarengine/game-assets/${resolvedGameId}/`,
        sugarlang: buildSugarlangRuntimeConfig(sugarlangConfig),
      }) as PreviewProjectData;

      console.log('[Editor] handlePreview: playerCaster =', playerCaster);
      previewManagerRef.current.openPreviewWithData(projectData, currentEpisodeId || undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGameLifecycleError(message);
      alert(`Preview failed: ${message}`);
    }
  };

  // Create new episode
  const handleCreateEpisode = (name: string) => {
    if (!currentSeasonId) return;

    const existingInSeason = episodes.filter((e) => e.seasonId === currentSeasonId).length;
    const newEpisode = {
      id: crypto.randomUUID(),
      seasonId: currentSeasonId,
      name,
      order: existingInSeason + 1,
    };

    setEpisodes([...episodes, newEpisode]);
    setCurrentEpisode(newEpisode.id);
    if (!defaultEpisodeId) {
      setProjectContext({
        loaded: projectLoaded,
        name: projectName,
        gameId: resolvedGameId,
        gameRootPath,
        projectFilePath,
        projectCreatedAt,
        projectVersion,
        defaultEpisodeId: newEpisode.id,
      });
    }
    setDirty(true);
  };

  // Get default name for new episode
  const getDefaultEpisodeName = () => {
    const existingCount = episodes.filter((e) => e.seasonId === currentSeasonId).length;
    return `Episode ${existingCount + 1}`;
  };

  const handleNewGameNameChange = (value: string) => {
    const nextSlug = toGameSlug(value);
    const currentSuggestedSlug = toGameSlug(newGameName);
    const currentSuggestedRoot = `games/${currentSuggestedSlug}`;
    setNewGameName(value);
    if (!newGameSlugDirty) {
      setNewGameSlug(nextSlug);
    }
    if (!newGameRootPathDirty || newGameRootPath === currentSuggestedRoot) {
      setNewGameRootPath(`games/${nextSlug}`);
    }
  };

  const handleNewGameSlugChange = (value: string) => {
    const nextSlug = toGameSlug(value);
    const currentSuggestedRoot = `games/${newGameSlug}`;
    setNewGameSlug(nextSlug);
    setNewGameSlugDirty(true);
    if (!newGameRootPathDirty || newGameRootPath === currentSuggestedRoot) {
      setNewGameRootPath(`games/${nextSlug}`);
    }
  };

  const handleNewGameRootPathChange = (value: string) => {
    setNewGameRootPath(value);
    setNewGameRootPathDirty(true);
  };

  const handleBrowseNewGameRootPath = async () => {
    setPickingNewGameRoot(true);
    setGameLifecycleError(null);
    try {
      const selectedPath = await pickGameRootDirectory();
      if (!selectedPath) return;
      setNewGameRootPath(selectedPath);
      setNewGameRootPathDirty(true);
    } catch (error) {
      setGameLifecycleError(error instanceof Error ? error.message : String(error));
    } finally {
      setPickingNewGameRoot(false);
    }
  };

  const handleCreateGame = async () => {
    const name = newGameName.trim();
    const slug = toGameSlug(newGameSlug);
    const rootPath = newGameRootPath.trim();
    if (!name || !rootPath) {
      setGameLifecycleError('Game name and root directory are required.');
      return;
    }

    setGameLifecycleBusy(true);
    setGameLifecycleError(null);
    try {
      const result = await createGame({ name, slug, rootPath });
      await applyProjectToEditor(result);
      resetNewGameDraft();
    } catch (error) {
      setGameLifecycleError(error instanceof Error ? error.message : String(error));
    } finally {
      setGameLifecycleBusy(false);
    }
  };

  const handleOpenGame = async () => {
    const inputPath = openGamePath.trim();
    if (!inputPath) {
      setGameLifecycleError('Select a project.sgrgame file.');
      return;
    }

    setGameLifecycleBusy(true);
    setGameLifecycleError(null);
    try {
      const result = await openGame(inputPath);
      await applyProjectToEditor(result);
      setOpenGamePath('');
    } catch (error) {
      setGameLifecycleError(error instanceof Error ? error.message : String(error));
    } finally {
      setGameLifecycleBusy(false);
    }
  };

  const handleBrowseOpenGamePath = async () => {
    setPickingOpenGamePath(true);
    setGameLifecycleError(null);
    try {
      const selectedPath = await pickGameProjectFile();
      if (!selectedPath) return;
      setOpenGamePath(selectedPath);
    } catch (error) {
      setGameLifecycleError(error instanceof Error ? error.message : String(error));
    } finally {
      setPickingOpenGamePath(false);
    }
  };

  const handleOpenEpisode = (seasonId: string, episodeId: string) => {
    setCurrentSeason(seasonId);
    setCurrentEpisode(episodeId);
  };

  const handleUpdateCurrentEpisode = (field: string, value: unknown) => {
    if (!currentEpisodeId) return;
    setEpisodes(
      episodes.map((e) =>
        e.id === currentEpisodeId ? { ...e, [field]: value } : e
      )
    );
    setDirty(true);
  };

  const handleDeleteCurrentEpisode = () => {
    if (!currentEpisodeId || !currentSeasonId) return;
    const remainingEpisodes = episodes.filter((e) => e.id !== currentEpisodeId);
    setEpisodes(remainingEpisodes);
    // Select another episode in the same season, or clear selection
    const nextEpisode = remainingEpisodes.find((e) => e.seasonId === currentSeasonId);
    setCurrentEpisode(nextEpisode?.id || null);
    if (defaultEpisodeId === currentEpisodeId) {
      setProjectContext({
        loaded: projectLoaded,
        name: projectName,
        gameId: resolvedGameId,
        gameRootPath,
        projectFilePath,
        projectCreatedAt,
        projectVersion,
        defaultEpisodeId: nextEpisode?.id ?? null,
      });
    }
    setDirty(true);
  };

  const handleSaveGame = async () => {
    if (!projectFilePath || !gameRootPath) {
      const message = 'No game root is open. Open or create a game before saving.';
      setGameLifecycleError(message);
      alert(message);
      return;
    }

    setGameLifecycleBusy(true);
    setGameLifecycleError(null);
    try {
      if (sugarlangDirty && sugarlangSaveHandlerRef.current) {
        await sugarlangSaveHandlerRef.current();
      }
      const project = buildCurrentProjectDocument();
      await saveGame({
        rootPath: gameRootPath,
        projectFilePath,
        project,
      });
      setProjectContext({
        loaded: true,
        name: project.meta.name,
        gameId: project.meta.gameId,
        gameRootPath,
        projectFilePath,
        projectCreatedAt: project.meta.createdAt ?? null,
        projectVersion: project.meta.version,
        defaultEpisodeId: project.defaultEpisode ?? currentEpisodeId,
      });
      setSugarlangDirty(false);
      setDirty(false);
      console.log(`[Editor] Project saved to ${projectFilePath}`);
      setSaveFlashVisible(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGameLifecycleError(message);
      alert(`Save failed: ${message}`);
    } finally {
      setGameLifecycleBusy(false);
    }
  };

  const handlePublish = async () => {
    try {
      if (!gameRootPath || !projectFilePath || !resolvedGameId) {
        throw new Error('Open a game repository before publishing a web target.');
      }
      if (!publishGameApiBaseUrl.trim()) {
        throw new Error('Game API base URL is required for the hosted web publish target.');
      }

      setGameLifecycleBusy(true);
      setGameLifecycleError(null);
      if (sugarlangDirty && sugarlangSaveHandlerRef.current) {
        await sugarlangSaveHandlerRef.current();
      }
      const project = buildCurrentProjectDocument();
      await saveGame({
        rootPath: gameRootPath,
        projectFilePath,
        project,
      });
      const publishResult = await publishWebTarget({
        rootPath: gameRootPath,
        projectFilePath,
        gameId: resolvedGameId,
        target: publishTarget,
        environment: publishEnvironment,
        frontend: {
          gameApiBaseUrl: publishGameApiBaseUrl,
          backendRequired: publishBackendRequired,
          credentials: publishCredentials,
        },
        sugaragent: {
          generation: {
            provider: publishSugarAgentGenerationProvider,
            selfHosted: {
              runtimeMode: publishSugarAgentRuntimeMode,
            },
            openai: {
              model: publishSugarAgentOpenAiModel.trim() || 'gpt-5-mini',
              baseUrl: publishSugarAgentOpenAiBaseUrl.trim() || 'https://api.openai.com/v1',
            },
          },
        },
      });
      setSugarlangDirty(false);
      setDirty(false);
      setPublishDialogOpen(false);
      console.log(`[Editor] Published web client to ${publishResult.exportPath}`);
      alert(
        `Published ${publishTarget} client (${publishEnvironment}) into the game repository.\n\n` +
        `Profile:\n${publishProfilePath}\n\n` +
        `Export path:\n${publishResult.exportPath}\n\n` +
        `The game repo workflows can now deploy that artifact.`
      );
    } catch (err) {
      console.error('Publish failed:', err);
      const message = err instanceof Error ? err.message : String(err);
      setGameLifecycleError(message);
      alert(`Publish failed: ${message}`);
    } finally {
      setGameLifecycleBusy(false);
    }
  };

  // Convert store data to panel-compatible types
  const npcList = npcs.map((n) => ({ id: n.id, name: n.name }));
  const itemList = items.map((i) => ({ id: i.id, name: i.name }));
  const inspectionList = inspections.map((i) => ({ id: i.id, displayName: i.title }));
  const episodeList = episodes.map((e) => ({ id: e.id, name: e.name }));
  // Gather all triggers from all regions
  const triggerList = regions.flatMap((r) =>
    (r.triggers ?? []).map((t) => ({ id: t.id, name: t.name || t.id }))
  );

  const handleSetPluginEnabled = (pluginId: string, enabled: boolean) => {
    const existing = plugins.find((entry) => entry.id === pluginId);
    const nextPlugins = plugins.filter((entry) => entry.id !== pluginId);
    if (!enabled && !existing) {
      setPlugins(nextPlugins);
      setDirty(true);
      return;
    }
    const nextConfig: PluginConfigData = {
      ...(existing ?? {}),
      id: pluginId,
      enabled,
    };
    if (pluginId === 'sugaragent' && enabled) {
      const generation = normalizeSugarAgentGenerationConfigValue(
        nextConfig.generation,
        nextConfig.runtimeMode ?? nextConfig.runtime,
      );
      nextConfig.generation = generation;
      nextConfig.runtimeMode = generation.selfHosted?.runtimeMode ?? 'llama';
      delete nextConfig.runtime;
    }
    nextPlugins.push(nextConfig);
    setPlugins(nextPlugins);
    setDirty(true);
  };

  const getPluginConfig = (pluginId: string): PluginConfigData | null => (
    plugins.find((entry) => entry.id === pluginId) ?? null
  );

  const sugarAgentPluginConfig = getPluginConfig('sugaragent');
  const sugarAgentGlobalSafetyBounds = normalizeStringArrayValue(
    sugarAgentPluginConfig?.globalSafetyBounds ?? sugarAgentPluginConfig?.safetyBounds,
  );
  const sugarAgentGeneration = normalizeSugarAgentGenerationConfigValue(
    sugarAgentPluginConfig?.generation,
    sugarAgentPluginConfig?.runtimeMode ?? sugarAgentPluginConfig?.runtime,
  );
  const sugarAgentGenerationProvider = normalizeSugarAgentGenerationProvider(sugarAgentGeneration.provider);
  const sugarAgentRuntimeMode = normalizeSugarAgentRuntimeMode(
    sugarAgentGeneration.selfHosted?.runtimeMode,
  );
  const sugarAgentOpenAiModel = sugarAgentGeneration.openai?.model ?? 'gpt-5-mini';
  const sugarAgentOpenAiBaseUrl = sugarAgentGeneration.openai?.baseUrl ?? 'https://api.openai.com/v1';

  const updateSugarAgentPluginConfig = (
    update: (existing: PluginConfigData | null, baseGeneration: SugarAgentGenerationConfig) => PluginConfigData,
  ) => {
    const existing = sugarAgentPluginConfig;
    const nextPlugins = plugins.filter((entry) => entry.id !== 'sugaragent');
    const baseGeneration = normalizeSugarAgentGenerationConfigValue(
      existing?.generation,
      existing?.runtimeMode ?? existing?.runtime,
    );
    const nextConfig = update(existing, baseGeneration);
    delete nextConfig.runtime;
    nextPlugins.push(nextConfig);
    setPlugins(nextPlugins);
    setDirty(true);
  };

  const handleSetSugarAgentGlobalSafetyBounds = (value: string) => {
    const nextBounds = parseStringList(value);
    updateSugarAgentPluginConfig((existing, baseGeneration) => {
      const nextConfig: PluginConfigData = {
        ...(existing ?? {}),
        id: 'sugaragent',
        enabled: existing?.enabled === false ? false : true,
        generation: baseGeneration,
        runtimeMode: baseGeneration.selfHosted?.runtimeMode ?? 'llama',
      };
      if (nextBounds.length > 0) {
        nextConfig.globalSafetyBounds = nextBounds;
      } else {
        delete nextConfig.globalSafetyBounds;
      }
      delete nextConfig.safetyBounds;
      return nextConfig;
    });
  };

  const handleSetSugarAgentGenerationProvider = (value: string | null) => {
    const provider = normalizeSugarAgentGenerationProvider(value ?? sugarAgentGeneration.provider);
    updateSugarAgentPluginConfig((existing, baseGeneration) => ({
      ...(existing ?? {}),
      id: 'sugaragent',
      enabled: existing?.enabled === false ? false : true,
      generation: {
        ...baseGeneration,
        provider,
      },
      runtimeMode: baseGeneration.selfHosted?.runtimeMode ?? 'llama',
    }));
  };

  const handleSetSugarAgentRuntimeMode = (value: string | null) => {
    const mode = normalizeSugarAgentRuntimeMode(value ?? sugarAgentGeneration.selfHosted?.runtimeMode);
    updateSugarAgentPluginConfig((existing, baseGeneration) => ({
      ...(existing ?? {}),
      id: 'sugaragent',
      enabled: existing?.enabled === false ? false : true,
      generation: {
        ...baseGeneration,
        selfHosted: {
          ...(baseGeneration.selfHosted ?? {}),
          runtimeMode: mode,
        },
      },
      runtimeMode: mode,
    }));
  };

  const handleSetSugarAgentOpenAiModel = (value: string) => {
    updateSugarAgentPluginConfig((existing, baseGeneration) => ({
      ...(existing ?? {}),
      id: 'sugaragent',
      enabled: existing?.enabled === false ? false : true,
      generation: {
        ...baseGeneration,
        provider: 'openai',
        openai: {
          ...(baseGeneration.openai ?? {}),
          model: value.trim() || 'gpt-5-mini',
        },
      },
      runtimeMode: baseGeneration.selfHosted?.runtimeMode ?? 'llama',
    }));
  };

  const handleSetSugarAgentOpenAiBaseUrl = (value: string) => {
    updateSugarAgentPluginConfig((existing, baseGeneration) => ({
      ...(existing ?? {}),
      id: 'sugaragent',
      enabled: existing?.enabled === false ? false : true,
      generation: {
        ...baseGeneration,
        provider: 'openai',
        openai: {
          ...(baseGeneration.openai ?? {}),
          baseUrl: value.trim() || 'https://api.openai.com/v1',
        },
      },
      runtimeMode: baseGeneration.selfHosted?.runtimeMode ?? 'llama',
    }));
  };

  useEffect(() => {
    if (!sugarAgentSettingsOpen || !projectLoaded || !isPluginEnabled(plugins, 'sugaragent')) {
      setSugarAgentHealthStatus(null);
      setCheckingSugarAgentHealth(false);
      return;
    }

    let cancelled = false;
    setCheckingSugarAgentHealth(true);

    fetch('/__sugaragent/runtime', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        op: 'health',
        gameId: resolvedGameId,
        runtimeMode: sugarAgentGeneration.selfHosted?.runtimeMode ?? 'llama',
        generation: sugarAgentGeneration,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({} as { ok?: boolean; detail?: string }));
        if (cancelled) return;
        setSugarAgentHealthStatus({
          ok: payload.ok === true,
          detail: typeof payload.detail === 'string'
            ? payload.detail
            : payload.ok === true
              ? 'SugarAgent runtime ready.'
              : 'SugarAgent runtime unavailable.',
        });
      })
      .catch((error) => {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : String(error);
        setSugarAgentHealthStatus({
          ok: false,
          detail,
        });
      })
      .finally(() => {
        if (!cancelled) {
          setCheckingSugarAgentHealth(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    sugarAgentSettingsOpen,
    projectLoaded,
    plugins,
    resolvedGameId,
    sugarAgentGeneration.provider,
    sugarAgentGeneration.selfHosted?.runtimeMode,
    sugarAgentGeneration.openai?.model,
    sugarAgentGeneration.openai?.baseUrl,
  ]);

  const handleResetSugarAgentRuntime = async () => {
    if (resettingSugarAgentRuntime) return;
    setResettingSugarAgentRuntime(true);
    setSugarAgentRuntimeMessage({
      kind: 'info',
      text: 'Resetting SugarAgent runtime cache...',
    });
    try {
      const response = await fetch('/__sugaragent/runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'unloadModel' }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }
      const payload = await response.json().catch(() => ({} as { detail?: string }));
      setSugarAgentRuntimeMessage({
        kind: 'success',
        text: payload.detail ?? 'SugarAgent runtime cache cleared.',
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setSugarAgentRuntimeMessage({
        kind: 'error',
        text: `Could not reset SugarAgent runtime cache: ${detail}`,
      });
    } finally {
      setResettingSugarAgentRuntime(false);
    }
  };

  const handleReingestSugarAgentLore = async () => {
    if (reingestingSugarAgentLore) return;
    setReingestingSugarAgentLore(true);
    setSugarAgentRuntimeMessage({
      kind: 'info',
      text: 'Re-ingesting lore, clearing runtime cache, and removing persisted NPC sessions...',
    });
    try {
      const response = await fetch('/__sugaragent/runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'reingestLore',
          gameId: resolvedGameId,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }
      const payload = await response.json().catch(() => ({} as {
        detail?: string;
        counts?: { chunks?: number; files?: number };
        removedSessions?: string[];
      }));
      const chunkCount = typeof payload.counts?.chunks === 'number'
        ? payload.counts.chunks
        : null;
      const removedSessionCount = Array.isArray(payload.removedSessions)
        ? payload.removedSessions.length
        : null;
      const detail = payload.detail ?? 'Lore re-ingested, runtime cache cleared, and persisted NPC sessions removed.';
      setSugarAgentRuntimeMessage({
        kind: 'success',
        text: [
          detail,
          chunkCount !== null ? `${chunkCount} chunks` : null,
          removedSessionCount !== null ? `${removedSessionCount} sessions removed` : null,
        ].filter(Boolean).join(' | '),
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setSugarAgentRuntimeMessage({
        kind: 'error',
        text: `Could not re-ingest lore: ${detail}`,
      });
    } finally {
      setReingestingSugarAgentLore(false);
    }
  };

  const handleResetSugarAgentSessions = async () => {
    if (resettingSugarAgentSessions) return;
    setResettingSugarAgentSessions(true);
    setSugarAgentRuntimeMessage({
      kind: 'info',
      text: `Clearing all persisted NPC sessions for ${resolvedGameId}...`,
    });
    try {
      const response = await fetch('/__sugaragent/runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'clearSessionsForGame',
          gameId: resolvedGameId,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }
      const payload = await response.json().catch(() => ({} as {
        detail?: string;
        removedFiles?: string[];
      }));
      const removedCount = Array.isArray(payload.removedFiles) ? payload.removedFiles.length : null;
      const detail = payload.detail ?? `Persisted NPC sessions cleared for ${resolvedGameId}.`;
      setSugarAgentRuntimeMessage({
        kind: 'success',
        text: removedCount !== null ? `${detail} (${removedCount} files removed)` : detail,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setSugarAgentRuntimeMessage({
        kind: 'error',
        text: `Could not clear persisted NPC sessions: ${detail}`,
      });
    } finally {
      setResettingSugarAgentSessions(false);
    }
  };

  const handleOpenPluginSettings = useCallback((pluginId: string) => {
    setPluginsDialogOpen(false);

    if (pluginId === 'sugaragent') {
      setSugarAgentSettingsOpen(true);
      return;
    }

    if (pluginId === 'sugarlang') {
      sugarlangOpenSettingsHandlerRef.current?.();
    }
  }, []);

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      {/* All panels are rendered to maintain hook consistency - they use render props */}
      <DialoguePanel
        dialogues={dialogues as any}
        onDialoguesChange={setDialogues as any}
        npcs={npcList}
        items={itemList}
        quests={quests as any}
      >
        {(dialoguePanel) => (
          <QuestPanel
            quests={quests as any}
            onQuestsChange={setQuests as any}
            npcs={npcList}
            items={itemList}
            dialogues={dialogues.map((d) => ({ id: d.id, name: d.name || d.id }))}
            triggers={triggerList}
            spells={spells.map((s) => ({ id: s.id, name: s.name }))}
          >
            {(questPanel) => (
              <NPCPanel
                npcs={npcs as any}
                onNPCsChange={setNPCs as any}
                dialogues={dialogues}
                quests={quests}
                items={itemList}
                plugins={plugins}
              >
                {(npcPanel) => (
                  <ItemPanel
                    items={items as any}
                    onItemsChange={setItems as any}
                    quests={quests as any}
                  >
                    {(itemPanel) => (
                      <InspectionPanel
                        inspections={inspections as any}
                        onInspectionsChange={setInspections as any}
                      >
                        {(inspectionPanel) => (
                          <MagicPanel
                            spells={spells}
                            onSpellsChange={setSpells}
                            dialogues={dialogues.map((d) => ({ id: d.id, name: d.name || d.id }))}
                          >
                            {(magicPanel) => (
                              <ResonancePanel
                                resonancePoints={resonancePoints}
                                onResonancePointsChange={setResonancePoints}
                              >
                                {(resonancePanel) => (
                                  <VFXPanel
                                    vfxDefinitions={vfxDefinitions}
                                    onVFXDefinitionsChange={setVFXDefinitions}
                                  >
                                    {(vfxPanel) => (
                                      <PlayerPanel
                                        playerCaster={playerCaster}
                                        onPlayerCasterChange={setPlayerCaster}
                                        playerModel={playerModel}
                                        onPlayerModelChange={setPlayerModel}
                                        playerAnimations={playerAnimations}
                                        onPlayerAnimationsChange={setPlayerAnimations}
                                      >
                                        {(playerPanel) => (
                                      <RegionPanel
                                regions={regions as any}
                                onRegionsChange={setRegions as any}
                                npcs={npcList}
                                items={itemList}
                                inspections={inspectionList}
                                resonancePointDefs={resonancePoints.map((r) => ({ id: r.id, name: r.name }))}
                                vfxDefinitions={vfxDefinitions.map((v) => ({ id: v.id, name: v.name }))}
                                episodes={episodeList}
                              >
                                  {(regionPanel) => (
                                    <SugarlangPanel
                                      gameRootPath={gameRootPath}
                                      gameId={resolvedGameId}
                                      plugins={plugins}
                                      onPluginsChange={setPlugins}
                                      onDirtyChange={handleSugarlangDirtyChange}
                                      onRegisterSaveHandler={handleSugarlangSaveHandlerChange}
                                      onRegisterOpenSettingsHandler={handleSugarlangOpenSettingsHandlerChange}
                                      projectInput={{
                                        quests: quests as any,
                                        dialogues: dialogues as any,
                                        npcs: npcs as any,
                                        regions: regions as any,
                                        items: items as any,
                                      }}
                                    >
                                      {(sugarlangPanel) => {
                                        // Select the panel based on active tab
                                        const panelContent =
                                          activeTab === 'dialogues' ? dialoguePanel :
                                          activeTab === 'quests' ? questPanel :
                                          activeTab === 'npcs' ? npcPanel :
                                          activeTab === 'items' ? itemPanel :
                                          activeTab === 'spells' ? magicPanel :
                                          activeTab === 'resonance' ? resonancePanel :
                                          activeTab === 'vfx' ? vfxPanel :
                                          activeTab === 'player' ? playerPanel :
                                          activeTab === 'inspections' ? inspectionPanel :
                                          activeTab === 'regions' ? regionPanel :
                                          activeTab === 'sugarlang' ? sugarlangPanel :
                                          npcPanel;

                              return (
                                <AppShell
                                  header={{ height: 48 }}
                                  navbar={{ width: 260, breakpoint: 'sm' }}
                                  aside={panelContent.inspector ? { width: 300, breakpoint: 'sm' } : undefined}
                                  padding={0}
                                  styles={{
                                    root: { background: '#1e1e2e' },
                                    main: { background: '#1e1e2e', height: '100vh', overflow: 'hidden' },
                                    header: { background: '#181825', borderBottom: '1px solid #313244' },
                                    navbar: { background: '#1e1e2e', borderRight: '1px solid #313244' },
                                    aside: { background: '#1e1e2e', borderLeft: '1px solid #313244' },
                                  }}
                                >
                                  <AppShell.Header>
                                    <Group h="100%" px="md" gap="md">
                                      {/* Logo */}
                                      <Text fw={600} size="sm" style={{ paddingRight: 16, borderRight: '1px solid #313244' }}>
                                        Sugar Engine
                                      </Text>

                                      {/* Project menu */}
                                      <ProjectMenu
                                        onNewGame={openNewGameDialog}
                                        onOpenGame={openOpenGameDialog}
                                        onSaveGame={handleSaveGame}
                                        onExportJson={openPublishDialog}
                                        onOpenSettings={openGameSettings}
                                        onManagePlugins={() => setPluginsDialogOpen(true)}
                                        projectLoaded={projectLoaded}
                                      />

                                      {/* Current season/episode indicator */}
                                      {projectLoaded && currentEpisode && (
                                        <Group gap="xs" style={{ paddingRight: 12, borderRight: '1px solid #313244' }}>
                                          <Button
                                            variant="subtle"
                                            size="xs"
                                            color="gray"
                                            onClick={() => setProjectExplorerOpen(true)}
                                            title="Browse seasons and episodes"
                                            styles={{
                                              root: {
                                                color: '#a6adc8',
                                                '&:hover': { background: '#313244' },
                                              },
                                            }}
                                          >
                                            {seasons.find((s) => s.id === currentSeasonId)?.name || 'Season'}, {currentEpisode.name} ▾
                                          </Button>
                                          <ActionIcon
                                            size="xs"
                                            variant="subtle"
                                            color="gray"
                                            title="Edit episode details"
                                            onClick={() => setEpisodeDetailsDialogOpen(true)}
                                          >
                                            ✏️
                                          </ActionIcon>
                                        </Group>
                                      )}

                                      {/* Tabs */}
                                      <Tabs
                                        value={activeTab}
                                        onChange={(v) => setActiveTab(v as EditorTab)}
                                        styles={{
                                          root: {
                                            opacity: isEditorEnabled ? 1 : 0.5,
                                            pointerEvents: isEditorEnabled ? 'auto' : 'none',
                                          },
                                          tab: {
                                            color: '#6c7086',
                                          },
                                          list: {
                                            borderBottom: 'none',
                                          },
                                        }}
                                      >
                                        <Tabs.List>
                                          {tabs.map((tab) => (
                                            <Tabs.Tab
                                              key={tab.value}
                                              value={tab.value}
                                              c={activeTab === tab.value ? '#cdd6f4' : '#6c7086'}
                                              style={{
                                                background: activeTab === tab.value ? '#1e1e2e' : undefined,
                                                borderRadius: 6,
                                              }}
                                            >
                                              <Group gap={6}>
                                                <span>{tab.icon}</span>
                                                <span>{tab.label}</span>
                                              </Group>
                                            </Tabs.Tab>
                                          ))}
                                        </Tabs.List>
                                      </Tabs>

                                      {/* Spacer */}
                                      <div style={{ flex: 1 }} />

                                      {/* Preview button */}
                                      <Button
                                        variant="subtle"
                                        disabled={!isEditorEnabled}
                                        onClick={handlePreview}
                                        styles={{
                                          root: {
                                            background: '#a6e3a122',
                                            color: '#a6e3a1',
                                            '&:hover': { background: '#a6e3a144' },
                                            '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
                                          },
                                        }}
                                      >
                                        ▶ Preview
                                      </Button>


                                    </Group>
                                  </AppShell.Header>

                                  {/* Save confirmation flash */}
                                  {saveFlashVisible && (
                                    <div style={{
                                      position: 'fixed',
                                      top: 60,
                                      left: '50%',
                                      transform: 'translateX(-50%)',
                                      zIndex: 9999,
                                      background: '#1e1e2e',
                                      border: '1px solid #a6e3a1',
                                      color: '#a6e3a1',
                                      padding: '8px 20px',
                                      borderRadius: 8,
                                      fontSize: 13,
                                      fontWeight: 500,
                                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                                    }}>
                                      Project saved
                                    </div>
                                  )}

                                  <AppShell.Navbar p="md">
                                    {panelContent.list}
                                  </AppShell.Navbar>

                                  <AppShell.Main>
                                    {panelContent.content}
                                  </AppShell.Main>

                                  {panelContent.inspector && (
                                    <AppShell.Aside p="md">
                                      <ScrollArea h="100%" offsetScrollbars>
                                        {panelContent.inspector}
                                      </ScrollArea>
                                    </AppShell.Aside>
                                  )}
                                        </AppShell>
                                      );
                                      }}
                                    </SugarlangPanel>
                                  )}
                                  </RegionPanel>
                                  )}
                                </PlayerPanel>
                              )}
                            </VFXPanel>
                          )}
                        </ResonancePanel>
                        )}
                      </MagicPanel>
                        )}
                      </InspectionPanel>
                    )}
                  </ItemPanel>
                )}
              </NPCPanel>
            )}
          </QuestPanel>
        )}
      </DialoguePanel>

      {/* Welcome Dialog - only on startup */}
      <WelcomeDialog
        opened={welcomeDialogOpen}
        onClose={() => setWelcomeDialogOpen(false)}
        onCreateGame={openNewGameDialog}
        onOpenGame={openOpenGameDialog}
      />

      {/* Project Explorer */}
      <ProjectExplorer
        opened={projectExplorerOpen}
        onClose={() => setProjectExplorerOpen(false)}
        seasons={seasons}
        episodes={episodes}
        onSeasonsChange={(newSeasons) => { setSeasons(newSeasons); setDirty(true); }}
        onEpisodesChange={(newEpisodes) => { setEpisodes(newEpisodes); setDirty(true); }}
        onOpenEpisode={handleOpenEpisode}
      />

      {/* Episode Details Dialog */}
      <EpisodeDetailsDialog
        opened={episodeDetailsDialogOpen}
        onClose={() => setEpisodeDetailsDialogOpen(false)}
        episode={currentEpisode || null}
        regions={regions.map((r) => ({ id: r.id, name: r.name }))}
        quests={quests.map((q) => ({ id: q.id, name: q.name }))}
        onUpdate={handleUpdateCurrentEpisode}
        onDelete={handleDeleteCurrentEpisode}
      />

      <NewGameDialog
        opened={newGameDialogOpen}
        onClose={closeNewGameDialog}
        name={newGameName}
        slug={newGameSlug}
        rootPath={newGameRootPath}
        error={newGameDialogOpen ? gameLifecycleError : null}
        busy={gameLifecycleBusy}
        browseBusy={pickingNewGameRoot}
        onNameChange={handleNewGameNameChange}
        onSlugChange={handleNewGameSlugChange}
        onRootPathChange={handleNewGameRootPathChange}
        onBrowseRootPath={handleBrowseNewGameRootPath}
        onSubmit={handleCreateGame}
      />

      <OpenGameDialog
        opened={openGameDialogOpen}
        onClose={closeOpenGameDialog}
        path={openGamePath}
        error={openGameDialogOpen ? gameLifecycleError : null}
        busy={gameLifecycleBusy}
        browseBusy={pickingOpenGamePath}
        onPathChange={setOpenGamePath}
        onBrowsePath={handleBrowseOpenGamePath}
        onSubmit={handleOpenGame}
      />

      <Modal
        opened={gameSettingsOpen}
        onClose={() => setGameSettingsOpen(false)}
        title="Game Settings"
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
          <TextInput
            label="Title"
            value={gameSettingsTitle}
            onChange={(event) => setGameSettingsTitle(event.currentTarget.value)}
            placeholder={projectName ?? 'My Game'}
          />
          <TextInput
            label="Subtitle"
            value={gameSettingsSubtitle}
            onChange={(event) => setGameSettingsSubtitle(event.currentTarget.value)}
            placeholder="A cozy adventure awaits"
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setGameSettingsOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveGameSettings}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Plugins Dialog */}
      <Modal
        opened={publishDialogOpen}
        onClose={() => setPublishDialogOpen(false)}
        title="Publish"
        centered
        size="lg"
        styles={{
          header: { background: '#1e1e2e', borderBottom: '1px solid #313244' },
          title: { color: '#cdd6f4', fontWeight: 600 },
          body: { background: '#1e1e2e', padding: '20px' },
          content: { background: '#1e1e2e' },
          close: { color: '#6c7086', '&:hover': { background: '#313244' } },
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            SugarEngine will publish the prebuilt frontend artifact into <code>exports/web/client</code> using the
            selected target profile, then the game repo workflows can deploy that exact export.
          </Text>
          <Group grow align="flex-start">
            <Select
              label="Target"
              data={WEB_PUBLISH_TARGET_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
              value={publishTarget}
              onChange={(value) => setPublishTarget((value as WebPublishTarget) ?? 'web')}
              allowDeselect={false}
              disabled
            />
            <Select
              label="Profile"
              description="Load defaults from the game repository profile before publishing."
              data={WEB_PUBLISH_ENVIRONMENT_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
              value={publishEnvironment}
              onChange={(value) => {
                void handlePublishEnvironmentChange(value);
              }}
              allowDeselect={false}
              disabled={publishProfileLoading || gameLifecycleBusy}
            />
          </Group>
          <Text size="xs" c="dimmed">
            Profile path: {publishProfilePath || 'Loading...'}
          </Text>
          <Text size="xs" c="dimmed">
            Hosted SugarAgent settings below are saved into the web publish profile and used by backend deploys.
          </Text>
          <TextInput
            label="VITE_GAME_API_BASE_URL"
            description="Hosted game-api base URL baked into the exported frontend bundle."
            value={publishGameApiBaseUrl}
            onChange={(event) => setPublishGameApiBaseUrl(event.currentTarget.value)}
            placeholder="https://wordlark-api.example.run.app"
            disabled={publishProfileLoading || gameLifecycleBusy}
          />
          <Group grow align="flex-start">
            <Select
              label="VITE_GAME_API_CREDENTIALS"
              data={WEB_PUBLISH_CREDENTIAL_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
              value={publishCredentials}
              onChange={(value) => setPublishCredentials((value as WebPublishCredentials) ?? 'include')}
              allowDeselect={false}
              disabled={publishProfileLoading || gameLifecycleBusy}
            />
            <Stack gap={6} style={{ paddingTop: 24 }}>
              <Switch
                label="VITE_GAME_API_REQUIRED"
                checked={publishBackendRequired}
                onChange={(event) => setPublishBackendRequired(event.currentTarget.checked)}
                disabled={publishProfileLoading || gameLifecycleBusy}
              />
              <Text size="xs" c="dimmed">
                Require the hosted backend bridge instead of falling back to local preview.
              </Text>
            </Stack>
          </Group>
          <Select
            label="Hosted SugarAgent Generation Provider"
            description="Saved to the web publish profile for the hosted game-api and Cloud Run deploy."
            data={SUGARAGENT_GENERATION_PROVIDER_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
            value={publishSugarAgentGenerationProvider}
            onChange={(value) => setPublishSugarAgentGenerationProvider(
              normalizeSugarAgentGenerationProvider(value ?? publishSugarAgentGenerationProvider),
            )}
            allowDeselect={false}
            disabled={publishProfileLoading || gameLifecycleBusy}
          />
          {publishSugarAgentGenerationProvider === 'selfHosted' ? (
            <Select
              label="Hosted Self-Hosted Runtime Mode"
              description="Only used when the hosted generation provider is Self-hosted."
              data={SUGARAGENT_RUNTIME_MODE_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
              value={publishSugarAgentRuntimeMode}
              onChange={(value) => setPublishSugarAgentRuntimeMode(
                normalizeSugarAgentRuntimeMode(value ?? publishSugarAgentRuntimeMode),
              )}
              allowDeselect={false}
              disabled={publishProfileLoading || gameLifecycleBusy}
            />
          ) : null}
          {publishSugarAgentGenerationProvider === 'openai' ? (
            <>
              <TextInput
                label="Hosted OpenAI Model"
                description="Saved to the hosted web publish profile and injected into Cloud Run."
                value={publishSugarAgentOpenAiModel}
                onChange={(event) => setPublishSugarAgentOpenAiModel(event.currentTarget.value)}
                placeholder="gpt-5-mini"
                disabled={publishProfileLoading || gameLifecycleBusy}
              />
              <TextInput
                label="Hosted OpenAI Base URL"
                description="Defaults to the public OpenAI API endpoint."
                value={publishSugarAgentOpenAiBaseUrl}
                onChange={(event) => setPublishSugarAgentOpenAiBaseUrl(event.currentTarget.value)}
                placeholder="https://api.openai.com/v1"
                disabled={publishProfileLoading || gameLifecycleBusy}
              />
            </>
          ) : null}
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={() => setPublishDialogOpen(false)}
              disabled={gameLifecycleBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handlePublish();
              }}
              loading={gameLifecycleBusy}
              disabled={publishProfileLoading}
            >
              Publish
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={pluginsDialogOpen}
        onClose={() => setPluginsDialogOpen(false)}
        title="Plugins"
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
          {AVAILABLE_PLUGINS.map((plugin) => (
            <Group
              key={plugin.id}
              align="stretch"
              style={{
                border: '1px solid #313244',
                background: '#181825',
                borderRadius: 8,
                padding: 12,
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <Group justify="space-between" align="flex-start" gap="md">
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text size="sm" fw={600}>{plugin.name}</Text>
                  <Text size="xs" c="dimmed">{plugin.description}</Text>
                </Stack>
                <Group gap="xs" align="center">
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => handleOpenPluginSettings(plugin.id)}
                    disabled={
                      !projectLoaded
                      || !isPluginEnabled(plugins, plugin.id)
                      || (plugin.id === 'sugarlang' && !sugarlangOpenSettingsHandlerRef.current)
                    }
                  >
                    Settings
                  </Button>
                  <Switch
                    checked={isPluginEnabled(plugins, plugin.id)}
                    onChange={(event) => handleSetPluginEnabled(plugin.id, event.currentTarget.checked)}
                    disabled={!projectLoaded}
                  />
                </Group>
              </Group>
            </Group>
          ))}
        </Stack>
      </Modal>

      <Modal
        opened={sugarAgentSettingsOpen}
        onClose={() => setSugarAgentSettingsOpen(false)}
        title="SugarAgent Settings"
        centered
        size="lg"
        styles={{
          header: { background: '#1e1e2e', borderBottom: '1px solid #313244' },
          title: { color: '#cdd6f4', fontWeight: 600 },
          body: { background: '#1e1e2e', padding: '20px' },
          content: { background: '#1e1e2e' },
          close: { color: '#6c7086', '&:hover': { background: '#313244' } },
        }}
      >
        <Stack gap={8}>
          <Textarea
            label="Global Safety Bounds"
            description="Baseline safety policy applied to all SugarAgent NPCs (one per line or comma-separated)."
            value={sugarAgentGlobalSafetyBounds.join('\n')}
            onChange={(event) => handleSetSugarAgentGlobalSafetyBounds(event.currentTarget.value)}
            placeholder={'No profanity\nNo legal advice\nNo medical advice'}
            minRows={3}
            autosize
            disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
          />
          <Select
            label="Generation Provider"
            description="Choose which backend family SugarAgent preview should target."
            data={SUGARAGENT_GENERATION_PROVIDER_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
            value={sugarAgentGenerationProvider}
            onChange={handleSetSugarAgentGenerationProvider}
            allowDeselect={false}
            disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
          />
          {sugarAgentGenerationProvider === 'selfHosted' ? (
            <Select
              label="Self-Hosted Runtime Mode"
              description="Used when the generation provider is Self-hosted."
              data={SUGARAGENT_RUNTIME_MODE_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
              value={sugarAgentRuntimeMode}
              onChange={handleSetSugarAgentRuntimeMode}
              allowDeselect={false}
              disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
            />
          ) : null}
          {sugarAgentGenerationProvider === 'openai' ? (
            <>
              <TextInput
                label="OpenAI Model"
                description="Used when the generation provider is OpenAI."
                value={sugarAgentOpenAiModel}
                onChange={(event) => handleSetSugarAgentOpenAiModel(event.currentTarget.value)}
                placeholder="gpt-5-mini"
                disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
              />
              <TextInput
                label="OpenAI Base URL"
                description="Defaults to the public OpenAI API endpoint."
                value={sugarAgentOpenAiBaseUrl}
                onChange={(event) => handleSetSugarAgentOpenAiBaseUrl(event.currentTarget.value)}
                placeholder="https://api.openai.com/v1"
                disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
              />
            </>
          ) : null}
          <Text
            size="xs"
            c={
              checkingSugarAgentHealth
                ? 'dimmed'
                : sugarAgentHealthStatus?.ok === true
                  ? 'green'
                  : sugarAgentHealthStatus?.ok === false
                    ? 'red'
                    : 'dimmed'
            }
          >
            {checkingSugarAgentHealth
              ? 'Checking SugarAgent runtime health...'
              : sugarAgentHealthStatus?.detail
                ?? 'Runtime health will appear here.'}
          </Text>
          <Group justify="space-between" align="center">
            <Text size="xs" c="dimmed">
              Clear preview runtime cache after lore updates.
            </Text>
            <Group gap={8}>
              <Button
                size="xs"
                variant="light"
                onClick={handleReingestSugarAgentLore}
                loading={reingestingSugarAgentLore}
                disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
              >
                Re-ingest Lore + Clear Sessions
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={handleResetSugarAgentSessions}
                loading={resettingSugarAgentSessions}
                disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
              >
                Reset All NPC Sessions (Game)
              </Button>
              <Button
                size="xs"
                variant="light"
                onClick={handleResetSugarAgentRuntime}
                loading={resettingSugarAgentRuntime}
                disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
              >
                Reset Runtime (Preview)
              </Button>
            </Group>
          </Group>
          {sugarAgentRuntimeMessage && (
            <Text
              size="xs"
              c={
                sugarAgentRuntimeMessage.kind === 'success'
                  ? 'green'
                  : sugarAgentRuntimeMessage.kind === 'error'
                    ? 'red'
                    : 'dimmed'
              }
            >
              {sugarAgentRuntimeMessage.text}
            </Text>
          )}
        </Stack>
      </Modal>

      {/* New Episode Dialog */}
      <EpisodeDialog
        opened={newEpisodeDialogOpen}
        onClose={() => setNewEpisodeDialogOpen(false)}
        onCreateEpisode={handleCreateEpisode}
        defaultName={getDefaultEpisodeName()}
      />
    </MantineProvider>
  );
}
