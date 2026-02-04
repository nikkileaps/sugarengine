/**
 * Editor - Main React component for the Sugar Engine editor
 *
 * This is the new React/Mantine based editor. Components will be
 * migrated here from the legacy vanilla EditorApp over time.
 */

import { useState, useRef } from 'react';
import { MantineProvider, createTheme, AppShell, Group, Tabs, Text, Stack, Button, Modal, TextInput, ActionIcon, ScrollArea } from '@mantine/core';
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

export function Editor() {
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const projectLoaded = useEditorStore((s) => s.projectLoaded);
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
  const regions = useEditorStore((s) => s.regions);
  const setRegions = useEditorStore((s) => s.setRegions);
  const playerCaster = useEditorStore((s) => s.playerCaster);
  const setPlayerCaster = useEditorStore((s) => s.setPlayerCaster);
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
        gameId: 'editor-preview',
        name: 'Preview',
      },
      seasons,
      episodes,
      dialogues,
      quests,
      npcs,
      items,
      inspections,
      regions,
      playerCaster,
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
        name: 'My Project',
        version: '1.0.0',
        savedAt: new Date().toISOString(),
      },
      seasons,
      episodes,
      npcs,
      dialogues,
      quests,
      items,
      inspections,
      regions,
      playerCaster,
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
          suggestedName: 'project.sgrgame',
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
        a.download = 'project.sgrgame';
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
      defaultEpisode: currentEpisodeId,
      seasons,
      episodes,
      dialogues,
      quests,
      npcs,
      items,
      inspections,
      regions,
      playerCaster,
      spells,
      resonancePoints,
      vfxDefinitions,
    };

    const jsonContent = JSON.stringify(gameData, null, 2);

    try {
      // Use File System Access API to save to public/game.json
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
        alert('Published! Save to the public/ folder, then run:\n\nnpm run publish:local\n\nto preview the build.');
      } else {
        // Fallback to download
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'game.json';
        a.click();
        URL.revokeObjectURL(url);
        alert('Downloaded game.json!\n\nMove it to the public/ folder, then run:\n\nnpm run publish:local');
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
      const projectName = data.meta?.name || fileName.replace('.sgrgame', '').replace('.json', '') || 'Untitled Project';

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

      // Load other data
      setNPCs(data.npcs || []);
      setDialogues(data.dialogues || []);
      setQuests(data.quests || []);
      setItems(data.items || []);
      setInspections(data.inspections || []);
      setRegions(data.regions || []);
      setPlayerCaster(data.playerCaster || null);
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

      setProjectLoaded(true, projectName);
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

  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      {/* All panels are rendered to maintain hook consistency - they use render props */}
      <DialoguePanel
        dialogues={dialogues as any}
        onDialoguesChange={setDialogues as any}
        npcs={npcList}
      >
        {(dialoguePanel) => (
          <QuestPanel
            quests={quests as any}
            onQuestsChange={setQuests as any}
            npcs={npcList}
            items={itemList}
            dialogues={dialogues.map((d) => ({ id: d.id, name: d.displayName || d.id }))}
          >
            {(questPanel) => (
              <NPCPanel
                npcs={npcs as any}
                onNPCsChange={setNPCs as any}
                dialogues={dialogues}
                quests={quests}
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
                            dialogues={dialogues.map((d) => ({ id: d.id, name: d.displayName || d.id }))}
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
                                    main: { background: '#1e1e2e' },
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

                                      {/* Publish button */}
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
                                        🚀 Publish
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
