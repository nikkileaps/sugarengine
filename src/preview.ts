/**
 * Game Preview Entry Point
 *
 * This runs the actual game - opened from the editor's Preview button.
 * Supports two modes:
 * - Development: receives project data via postMessage from editor
 * - Production: loads from published files
 */

import {
  Game,
  DebugHUD,
  FreeCameraController,
  LoadingScreen,
  SugarlangPreviewControls,
} from './engine';
import { buildTitleScreenConfig } from './engine/core/titleScreenConfig';
import { DEFAULT_GAME_CONFIG, setupGameUI } from './gameUI';
import { buildRuntimePluginsFromProject } from './plugins/runtime';
import { extractSugarlangTargetLanguages } from './plugins/sugarlang/project-languages';

interface ProjectMessage {
  type: 'LOAD_PROJECT' | 'UPDATE_PROJECT';
  project?: unknown;
  episodeId?: string;
}

let gameInstance: Game | null = null;
let slControlsInstance: SugarlangPreviewControls | null = null;

async function runGame(projectData?: unknown, episodeId?: string) {
  const container = document.getElementById('app')!;
  const { plugins: runtimePlugins, conversationMiddleware, conversationProviders } = buildRuntimePluginsFromProject(projectData);
  const projectMeta = (projectData as { meta?: { gameId?: string; contentBasePath?: string } } | undefined)?.meta;
  const projectTitle = (projectData as { meta?: { name?: string } } | undefined)?.meta?.name;
  const gameId = projectMeta?.gameId || 'editor-preview';
  const contentBasePath = projectMeta?.contentBasePath || '';

  const isDevelopmentMode = !!projectData;

  // Determine start region from episode if in development mode
  let startRegionPath: string | null = null;

  if (isDevelopmentMode && projectData) {
    const project = projectData as {
      episodes?: {
        id: string;
        startRegion?: string;
      }[];
      regions?: { id: string; name?: string; geometry?: { path: string } }[];
    };

    // Find the episode (use provided episodeId or first episode)
    const episode = episodeId ? project.episodes?.find(e => e.id === episodeId) : project.episodes?.[0];

    if (episode?.startRegion) {
      // Find the region and use its geometry.path
      const region = project.regions?.find(r => r.id === episode.startRegion);
      if (region?.geometry?.path) {
        startRegionPath = region.geometry.path;
      } else {
        throw new Error(`Region '${episode.startRegion}' has no geometry.path configured`);
      }
    } else if (episode) {
      throw new Error(`Episode '${episode.id}' has no startRegion configured`);
    } else {
      throw new Error('No episode found in project');
    }
  }

  // No fallback - require proper configuration
  if (!startRegionPath) {
    throw new Error('No start region configured. Set startRegion on the episode or ensure the region has a geometry.path.');
  }

  // Read titleScreen override from project data if available
  const projectTitleScreen = (projectData as { titleScreen?: Record<string, unknown> } | undefined)?.titleScreen;
  const sugarlangTargetLanguages = extractSugarlangTargetLanguages(projectData);
  const hasSugarlang = runtimePlugins.some((p) => p.descriptor.id === 'sugarlang');

  // Create game with all systems wired up
  const game = new Game({
    container,
    engine: DEFAULT_GAME_CONFIG.engine,
    save: {
      ...DEFAULT_GAME_CONFIG.save,
      autoSaveEnabled: !isDevelopmentMode, // Disable auto-save in dev mode
      namespace: gameId,
    },
    gameId,
    contentBasePath,
    startRegion: startRegionPath,
    // In dev mode, Game reads main quest from episode's completionCondition
    // In production, fall back to hardcoded quest
    startQuest: isDevelopmentMode ? undefined : 'intro-quest',
    startItems: isDevelopmentMode ? [] : [
      { itemId: 'fresh-bread', quantity: 2 },
      { itemId: 'wildflower-bouquet' }
    ],
    mode: isDevelopmentMode ? 'development' : 'production',
    projectData,
    currentEpisode: episodeId,
    plugins: runtimePlugins,
    conversationMiddleware,
    conversationProviders,
    titleScreen: buildTitleScreenConfig({
      base: DEFAULT_GAME_CONFIG.titleScreen,
      overrides: projectTitleScreen as any,
      gameTitle: projectTitle || 'Rackwick City',
      hasSugarlang,
      sugarlangTargetLanguages,
    }),
  });

  gameInstance = game;

  await game.init();

  setupGameUI(game, container);

  // ========================================
  // Preview-only: Debug Tools
  // ========================================

  const debugHUD = new DebugHUD(container, game.quests);
  debugHUD.setPlayerPositionProvider(() => game.getPlayerPosition());
  debugHUD.setRegionInfoProvider(() => game.getRegionInfo());
  debugHUD.setRenderer(game.engine.renderer);
  debugHUD.setLODStatsProvider(() => game.engine.getLODStats());
  debugHUD.setForcedLODControls(
    (level) => game.engine.setForcedLOD(level),
    () => game.engine.getForcedLOD()
  );
  const updateAgentDebugInfo = () => {
    debugHUD.setCustomInfo(game.getAgentRuntimeDebugInfo());
  };
  updateAgentDebugInfo();
  const debugInfoInterval = window.setInterval(updateAgentDebugInfo, 500);
  window.addEventListener('beforeunload', () => window.clearInterval(debugInfoInterval), { once: true });

  // Sugarlang preview controls — only show when the plugin is active
  if (hasSugarlang) {
    const slControls = new SugarlangPreviewControls(container);
    slControlsInstance = slControls;

    // Extract installed languages from project artifacts (lexicon-XX.json keys)
    if (sugarlangTargetLanguages.length > 0) {
      slControls.setLanguages(sugarlangTargetLanguages);
    }

    const initialSugarlangProfile = game.getPlayerProfile().plugins.sugarlang;
    if (initialSugarlangProfile) {
      slControls.setConfig({
        targetLanguage: initialSugarlangProfile.targetLanguage,
        supportLanguage: initialSugarlangProfile.supportLanguage,
        bandOverride: initialSugarlangProfile.learnerBand,
      });
    }

    slControls.setOnChange((config) => {
      game.setSugarlangPlayerProfile({
        targetLanguage: config.targetLanguage,
        learnerBand: config.bandOverride,
      });
    });
  }

  // Free camera controller for positioning title screen camera (F2 to toggle)
  const freeCam = new FreeCameraController(game.engine.getCamera(), container);
  freeCam.onEnable(() => {
    game.engine.setCameraUpdateEnabled(false);
  });
  freeCam.onDisable(() => {
    game.engine.setCameraUpdateEnabled(true);
  });

  // ========================================
  // Start Game
  // ========================================

  const loadingScreen = new LoadingScreen(container);
  loadingScreen.show();

  await game.loadRegion(startRegionPath);

  // Wait for all NPC/inspectable models to finish loading
  await game.engine.waitForPendingModelLoads((loaded, total) => {
    loadingScreen.setProgress(loaded, total);
  });

  loadingScreen.hide();
  loadingScreen.dispose();

  game.run();
  game.pause();
  await game.showTitle();
}

// ========================================
// Development Mode: Listen for project data from editor
// ========================================

// Check if we were opened by the editor
const isFromEditor = !!window.opener;

if (isFromEditor) {
  // Notify editor we're ready to receive data
  window.addEventListener('load', () => {
    window.opener?.postMessage({ type: 'PREVIEW_READY' }, '*');
  });

  // Listen for project data from editor
  window.addEventListener('message', async (event: MessageEvent<ProjectMessage>) => {
    if (event.data.type === 'LOAD_PROJECT') {

      const { project, episodeId } = event.data;

      // If game is already running, update it
      if (gameInstance) {
        gameInstance.updateProjectData(project);
        console.log('[Preview] Updated project data');
      } else {
        // Start new game with project data
        await runGame(project, episodeId);
      }
    }

    if (event.data.type === 'UPDATE_PROJECT') {
      console.log('[Preview] Received project update from editor');

      if (gameInstance) {
        gameInstance.updateProjectData(event.data.project);
      }

      // Refresh preview controls with updated languages
      if (slControlsInstance) {
        const langs = extractSugarlangTargetLanguages(event.data.project);
        if (langs.length > 0) {
          slControlsInstance.setLanguages(langs);
        }
      }
    }
  });

  console.log('[Preview] Waiting for project data from editor...');
} else {
  // Production mode: run normally
  runGame();
}
