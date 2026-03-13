/**
 * Editor - Main React component for the Sugar Engine editor
 *
 * This is the new React/Mantine based editor. Components will be
 * migrated here from the legacy vanilla EditorApp over time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MantineProvider, createTheme, AppShell, Group, Tabs, Text, Stack, Button, Modal, Textarea, ActionIcon, ScrollArea, Switch, Select } from '@mantine/core';
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
import { createGame, openGame, pickGameProjectFile, pickGameRootDirectory, saveGame } from './game-root/service';
import { loadAllSugarlangArtifacts } from './game-root/plugin-artifacts';
import {
  buildPreviewProjectDocument,
  buildProjectDocumentFromSnapshot,
  buildRuntimeExportDocument,
  type EditorProjectDocument,
} from './game-root/project-document';

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
  const [sugarAgentSettingsOpen, setSugarAgentSettingsOpen] = useState(false);
  const [resettingSugarAgentRuntime, setResettingSugarAgentRuntime] = useState(false);
  const [resettingSugarAgentSessions, setResettingSugarAgentSessions] = useState(false);
  const [reingestingSugarAgentLore, setReingestingSugarAgentLore] = useState(false);
  const [sugarAgentRuntimeMessage, setSugarAgentRuntimeMessage] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
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

      const projectData: PreviewProjectData = {
        version: 1,
        ...buildPreviewProjectDocument(
          buildCurrentProjectDocument(),
          `__sugarengine/game-assets/${resolvedGameId}/`,
        ),
        sugarlang: sugarlangConfig,
      };

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
    // Build game data for publishing
    const jsonContent = JSON.stringify(buildRuntimeExportDocument(buildCurrentProjectDocument()), null, 2);

    try {
      // Optional export of a runtime game.json snapshot.
      if ('showSaveFilePicker' in window) {
        const handle = await (window as Window & {
          showSaveFilePicker: (options: {
            suggestedName?: string;
            types: { description: string; accept: Record<string, string[]> }[];
          }) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName: 'game.json',
          types: [{
            description: 'Game Data',
            accept: { 'application/json': ['.json'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonContent);
        await writable.close();
        console.log('[Editor] Published game.json');
        alert(
          'Exported game.json snapshot.\n\n' +
          'Use this for runtime inspection or downstream build tooling.'
        );
      } else {
        // Fallback to download
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'game.json';
        a.click();
        URL.revokeObjectURL(url);
        alert(
          'Downloaded game.json snapshot.\n\n' +
          'Use this for runtime inspection or downstream build tooling.'
        );
      }
    } catch (err) {
      // User cancelled or error
      console.error('Publish failed:', err);
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
      nextConfig.runtimeMode = normalizeSugarAgentRuntimeMode(
        nextConfig.runtimeMode ?? nextConfig.runtime,
      );
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
  const sugarAgentRuntimeMode = normalizeSugarAgentRuntimeMode(
    sugarAgentPluginConfig?.runtimeMode ?? sugarAgentPluginConfig?.runtime,
  );

  const handleSetSugarAgentGlobalSafetyBounds = (value: string) => {
    const nextBounds = parseStringList(value);
    const existing = sugarAgentPluginConfig;
    const nextPlugins = plugins.filter((entry) => entry.id !== 'sugaragent');
    const nextConfig: PluginConfigData = {
      ...(existing ?? {}),
      id: 'sugaragent',
      enabled: existing?.enabled === false ? false : true,
      runtimeMode: normalizeSugarAgentRuntimeMode(existing?.runtimeMode ?? existing?.runtime),
    };
    if (nextBounds.length > 0) {
      nextConfig.globalSafetyBounds = nextBounds;
    } else {
      delete nextConfig.globalSafetyBounds;
    }
    delete nextConfig.safetyBounds;
    delete nextConfig.runtime;
    nextPlugins.push(nextConfig);
    setPlugins(nextPlugins);
    setDirty(true);
  };

  const handleSetSugarAgentRuntimeMode = (value: string | null) => {
    const existing = sugarAgentPluginConfig;
    const mode = normalizeSugarAgentRuntimeMode(value ?? existing?.runtimeMode ?? existing?.runtime);
    const nextPlugins = plugins.filter((entry) => entry.id !== 'sugaragent');
    const nextConfig: PluginConfigData = {
      ...(existing ?? {}),
      id: 'sugaragent',
      enabled: existing?.enabled === false ? false : true,
      runtimeMode: mode,
    };
    delete nextConfig.runtime;
    nextPlugins.push(nextConfig);
    setPlugins(nextPlugins);
    setDirty(true);
  };

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
      text: 'Re-ingesting lore and clearing runtime cache...',
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
      }));
      const chunkCount = typeof payload.counts?.chunks === 'number'
        ? payload.counts.chunks
        : null;
      const detail = payload.detail ?? 'Lore re-ingested and runtime cache cleared.';
      setSugarAgentRuntimeMessage({
        kind: 'success',
        text: chunkCount !== null ? `${detail} (${chunkCount} chunks)` : detail,
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
                                        onExportJson={handlePublish}
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

      {/* Plugins Dialog */}
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
            label="Local Runtime Mode"
            description="Default is llama. Use mock only for deterministic testing."
            data={SUGARAGENT_RUNTIME_MODE_OPTIONS.map((entry) => ({ value: entry.value, label: entry.label }))}
            value={sugarAgentRuntimeMode}
            onChange={handleSetSugarAgentRuntimeMode}
            allowDeselect={false}
            disabled={!projectLoaded || !isPluginEnabled(plugins, 'sugaragent')}
          />
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
                Re-ingest Lore + Reset
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
