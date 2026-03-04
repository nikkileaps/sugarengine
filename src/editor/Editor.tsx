/**
 * Editor - Main React component for the Sugar Engine editor
 *
 * This is the new React/Mantine based editor. Components will be
 * migrated here from the legacy vanilla EditorApp over time.
 */

import { useState, useRef } from 'react';
import { MantineProvider, createTheme, AppShell, Group, Tabs, Text, Stack, Button, Modal, TextInput, Textarea, ActionIcon, ScrollArea, Switch } from '@mantine/core';
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
import { WelcomeDialog } from './components/WelcomeDialog';
import { ProjectMenu } from './components/ProjectMenu';
import { ProjectExplorer } from './components/ProjectExplorer';
import { EpisodeDialog } from './components/EpisodeDialog';
import { EpisodeDetailsDialog } from './components/EpisodeDetailsDialog';
import { PreviewManager } from './PreviewManager';
import type { PluginConfigData } from './store/useEditorStore';

const TABS: { value: EditorTab; label: string; icon: string }[] = [
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

const AVAILABLE_PLUGINS = [
  {
    id: 'sugaragent',
    name: 'SugarAgent',
    description: 'Agentic NPC conversation, memory, lore retrieval, and beat contracts.',
  },
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
    normalized.push({
      ...record,
      id: record.id.trim(),
      enabled: record.enabled === false ? false : true,
    } as PluginConfigData);
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

async function syncCliActiveGame(slug: string): Promise<void> {
  const cleanSlug = toGameSlug(slug);
  try {
    const response = await fetch(`/__sugarengine/active-game?slug=${encodeURIComponent(cleanSlug)}`, {
      method: 'POST',
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
  const setProjectLoaded = useEditorStore((s) => s.setProjectLoaded);
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
  const [newProjectDialogOpen, setNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('My Game');
  const [gameId, setGameId] = useState('my-game');
  const [pluginsDialogOpen, setPluginsDialogOpen] = useState(false);
  const [resettingSugarAgentRuntime, setResettingSugarAgentRuntime] = useState(false);
  const [resettingSugarAgentSessions, setResettingSugarAgentSessions] = useState(false);
  const [reingestingSugarAgentLore, setReingestingSugarAgentLore] = useState(false);
  const [sugarAgentRuntimeMessage, setSugarAgentRuntimeMessage] = useState<{
    kind: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Get current episode
  const currentEpisode = episodes.find((e) => e.id === currentEpisodeId);

  const isEditorEnabled = projectLoaded && currentEpisodeId;
  const setDirty = useEditorStore((s) => s.setDirty);

  // Preview manager (singleton)
  const previewManagerRef = useRef<PreviewManager | null>(null);
  if (!previewManagerRef.current) {
    previewManagerRef.current = new PreviewManager();
  }

  // Open preview
  const handlePreview = () => {
    if (!previewManagerRef.current) return;

    const projectData = {
      version: 1,
      meta: {
        gameId,
        name: projectName || 'Preview',
        contentBasePath: `games/${gameId}/assets/`,
      },
      seasons,
      episodes,
      plugins,
      dialogues,
      quests,
      npcs,
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
    };

    console.log('[Editor] handlePreview: playerCaster =', playerCaster);
    previewManagerRef.current.openPreviewWithData(projectData, currentEpisodeId || undefined);
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
    setDirty(true);
  };

  // Get default name for new episode
  const getDefaultEpisodeName = () => {
    const existingCount = episodes.filter((e) => e.seasonId === currentSeasonId).length;
    return `Episode ${existingCount + 1}`;
  };

  // Project handlers
  const handleCreateProject = (name: string) => {
    // Create a default season and episode
    const seasonId = crypto.randomUUID();
    const episodeId = crypto.randomUUID();

    const newSeason = { id: seasonId, name: 'Season 1', order: 1 };
    const newEpisode = { id: episodeId, seasonId, name: 'Episode 1', order: 1 };

    setSeasons([newSeason]);
    setEpisodes([newEpisode]);
    setPlugins([]);
    setNPCs([]);
    setDialogues([]);
    setQuests([]);
    setItems([]);
    setInspections([]);
    setRegions([]);
    setPlayerCaster(null);
    setSpells([]);
    setResonancePoints([]);
    setVFXDefinitions([]);
    setCurrentSeason(seasonId);
    setCurrentEpisode(episodeId);
    setGameId(toGameSlug(name));
    setProjectLoaded(true, name);
    setWelcomeDialogOpen(false);
    setNewProjectDialogOpen(false);
  };

  const handleOpenProjectFromFile = async () => {
    // Same file picker logic as in welcome dialog
    await handleOpenProject();
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
    setDirty(true);
  };

  const handleSaveProject = async () => {
    // Gather all project data
    const projectData = {
      meta: {
        gameId,
        name: projectName || 'My Project',
        contentBasePath: `games/${gameId}/assets/`,
        version: '1.0.0',
        savedAt: new Date().toISOString(),
      },
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
    };

    const jsonContent = JSON.stringify(projectData, null, 2);

    try {
      // Try File System Access API first (Chrome/Edge)
      if ('showSaveFilePicker' in window) {
        const handle = await (window as Window & {
          showSaveFilePicker: (options: {
            suggestedName?: string;
            types: { description: string; accept: Record<string, string[]> }[];
          }) => Promise<FileSystemFileHandle>;
        }).showSaveFilePicker({
          suggestedName: `${gameId}.sgrgame`,
          types: [{
            description: 'Sugar Engine Project',
            accept: { 'application/json': ['.sgrgame'] },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(jsonContent);
        await writable.close();
        setDirty(false);
      } else {
        // Fallback to download
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${gameId}.sgrgame`;
        a.click();
        URL.revokeObjectURL(url);
        setDirty(false);
      }
    } catch (err) {
      // User cancelled or error
      console.error('Save failed:', err);
    }
  };

  const handlePublish = async () => {
    // Build game data for publishing
    const gameData = {
      version: 1,
      meta: {
        gameId,
        name: projectName || 'Untitled Project',
        contentBasePath: `games/${gameId}/assets/`,
      },
      defaultEpisode: currentEpisodeId,
      seasons,
      episodes,
      plugins,
      dialogues,
      quests,
      npcs,
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
    };

    const jsonContent = JSON.stringify(gameData, null, 2);

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
          `Recommended workflow:\n1) Save project as games/${gameId}/project.sgrgame\n2) Run npm run game:build`
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
          `Recommended workflow:\n1) Save project as games/${gameId}/project.sgrgame\n2) Run npm run game:build`
        );
      }
    } catch (err) {
      // User cancelled or error
      console.error('Publish failed:', err);
    }
  };

  const handleOpenProject = async () => {
    try {
      let fileText: string;
      let fileName: string;

      // Try File System Access API first (Chrome/Edge)
      if ('showOpenFilePicker' in window) {
        const handles = await (window as Window & {
          showOpenFilePicker: (options: {
            types: { description: string; accept: Record<string, string[]> }[];
          }) => Promise<FileSystemFileHandle[]>;
        }).showOpenFilePicker({
          types: [{
            description: 'Sugar Engine Project',
            accept: { 'application/json': ['.sgrgame', '.json'] },
          }],
        });
        const handle = handles[0];
        if (!handle) return;
        const file = await handle.getFile();
        fileText = await file.text();
        fileName = file.name;
      } else {
        // Fallback to file input
        const result = await new Promise<{ text: string; name: string } | null>((resolve) => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.sgrgame,.json';
          input.onchange = async () => {
            const file = input.files?.[0];
            if (file) {
              const text = await file.text();
              resolve({ text, name: file.name });
            } else {
              resolve(null);
            }
          };
          input.oncancel = () => resolve(null);
          input.click();
        });
        if (!result) return;
        fileText = result.text;
        fileName = result.name;
      }

      // Parse and load the project data
      const data = JSON.parse(fileText);
      const loadedProjectName = data.meta?.name || fileName.replace('.sgrgame', '').replace('.json', '') || 'Untitled Project';
      const loadedGameId = data.meta?.gameId || toGameSlug(loadedProjectName);

      // Load seasons and episodes
      const loadedSeasons = (data.seasons || []).map((s: { id: string; name: string; order: number }) => ({
        id: s.id,
        name: s.name,
        order: s.order,
      }));
      const loadedEpisodes = (data.episodes || []).map((e: {
        id: string;
        seasonId: string;
        name: string;
        order: number;
        startRegion?: string;
        completionCondition?: { type: 'quest'; questId: string };
      }) => ({
        id: e.id,
        seasonId: e.seasonId,
        name: e.name,
        order: e.order,
        startRegion: e.startRegion,
        completionCondition: e.completionCondition,
      }));

      setSeasons(loadedSeasons);
      setEpisodes(loadedEpisodes);
      setPlugins(normalizePlugins(data.plugins));

      // Load other data
      setNPCs(data.npcs || []);
      setDialogues(data.dialogues || []);
      setQuests(data.quests || []);
      setItems(data.items || []);
      setInspections(data.inspections || []);
      setRegions(data.regions || []);
      setPlayerCaster(data.playerCaster || null);
      setPlayerModel(data.playerModel || null);
      setPlayerAnimations(data.playerAnimations || {});
      setTitleScreen(data.titleScreen || null);
      setSpells(data.spells || []);
      setResonancePoints(data.resonancePoints || []);
      setVFXDefinitions(data.vfxDefinitions || []);

      // Set current season/episode to first available
      const firstSeason = loadedSeasons.sort((a: { order: number }, b: { order: number }) => a.order - b.order)[0];
      if (firstSeason) {
        setCurrentSeason(firstSeason.id);
        const firstEpisode = loadedEpisodes
          .filter((e: { seasonId: string }) => e.seasonId === firstSeason.id)
          .sort((a: { order: number }, b: { order: number }) => a.order - b.order)[0];
        if (firstEpisode) {
          setCurrentEpisode(firstEpisode.id);
        }
      }

      setGameId(loadedGameId);
      await syncCliActiveGame(loadedGameId);
      setProjectLoaded(true, loadedProjectName);
      setWelcomeDialogOpen(false);
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        // User cancelled - ignore
        return;
      }
      console.error('Failed to open project:', e);
      alert('Failed to open project: ' + (e as Error).message);
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
    nextPlugins.push({
      ...(existing ?? {}),
      id: pluginId,
      enabled,
    });
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

  const handleSetSugarAgentGlobalSafetyBounds = (value: string) => {
    const nextBounds = parseStringList(value);
    const existing = sugarAgentPluginConfig;
    const nextPlugins = plugins.filter((entry) => entry.id !== 'sugaragent');
    const nextConfig: PluginConfigData = {
      ...(existing ?? {}),
      id: 'sugaragent',
      enabled: existing?.enabled === false ? false : true,
    };
    if (nextBounds.length > 0) {
      nextConfig.globalSafetyBounds = nextBounds;
    } else {
      delete nextConfig.globalSafetyBounds;
    }
    delete nextConfig.safetyBounds;
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
          gameId,
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
      text: `Clearing all persisted NPC sessions for ${gameId}...`,
    });
    try {
      const response = await fetch('/__sugaragent/runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'clearSessionsForGame',
          gameId,
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
      const detail = payload.detail ?? `Persisted NPC sessions cleared for ${gameId}.`;
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
                                  {(regionPanel) => {
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
                                        onNewProject={() => setNewProjectDialogOpen(true)}
                                        onOpenProject={handleOpenProjectFromFile}
                                        onSaveProject={handleSaveProject}
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
                                            '&[data-active]': {
                                              color: '#cdd6f4',
                                              background: '#1e1e2e',
                                            },
                                            '&:hover': {
                                              background: '#313244',
                                            },
                                          },
                                          list: {
                                            borderBottom: 'none',
                                          },
                                        }}
                                      >
                                        <Tabs.List>
                                          {TABS.map((tab) => (
                                            <Tabs.Tab key={tab.value} value={tab.value}>
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

                                      {/* Export game.json snapshot button */}
                                      <Button
                                        variant="subtle"
                                        disabled={!isEditorEnabled}
                                        onClick={handlePublish}
                                        styles={{
                                          root: {
                                            background: '#cba6f722',
                                            color: '#cba6f7',
                                            '&:hover': { background: '#cba6f744' },
                                            '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
                                          },
                                        }}
                                      >
                                        🚀 Export JSON
                                      </Button>
                                    </Group>
                                  </AppShell.Header>

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
        onCreateProject={handleCreateProject}
        onOpenProject={handleOpenProject}
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

      {/* New Project Dialog (from menu) */}
      <Modal
        opened={newProjectDialogOpen}
        onClose={() => setNewProjectDialogOpen(false)}
        title="Create New Project"
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
            label="Project Name"
            placeholder="My Game"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateProject(newProjectName)}
            autoFocus
            styles={{
              input: { background: '#181825', border: '1px solid #313244', color: '#cdd6f4' },
              label: { color: '#a6adc8' },
            }}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" color="gray" onClick={() => setNewProjectDialogOpen(false)}>
              Cancel
            </Button>
            <Button color="green" onClick={() => handleCreateProject(newProjectName)}>
              Create
            </Button>
          </Group>
        </Stack>
      </Modal>

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
                <Switch
                  checked={isPluginEnabled(plugins, plugin.id)}
                  onChange={(event) => handleSetPluginEnabled(plugin.id, event.currentTarget.checked)}
                  disabled={!projectLoaded}
                />
              </Group>

              {plugin.id === 'sugaragent' && (
                <Stack gap={8}>
                  <Textarea
                    label="Global Safety Bounds"
                    description="Baseline safety policy applied to all SugarAgent NPCs (one per line or comma-separated)."
                    value={sugarAgentGlobalSafetyBounds.join('\n')}
                    onChange={(event) => handleSetSugarAgentGlobalSafetyBounds(event.currentTarget.value)}
                    placeholder={'No profanity\nNo legal advice\nNo medical advice'}
                    minRows={3}
                    autosize
                    disabled={!projectLoaded || !isPluginEnabled(plugins, plugin.id)}
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
                        disabled={!projectLoaded || !isPluginEnabled(plugins, plugin.id)}
                      >
                        Re-ingest Lore + Reset
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={handleResetSugarAgentSessions}
                        loading={resettingSugarAgentSessions}
                        disabled={!projectLoaded || !isPluginEnabled(plugins, plugin.id)}
                      >
                        Reset All NPC Sessions (Game)
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        onClick={handleResetSugarAgentRuntime}
                        loading={resettingSugarAgentRuntime}
                        disabled={!projectLoaded || !isPluginEnabled(plugins, plugin.id)}
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
              )}
            </Group>
          ))}
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
