/**
 * Production Game Entry Point
 *
 * This is the published game - loads project data from games/<slug>/game.json.
 * For development/editor preview, see preview.ts instead.
 */

import { Game } from './engine';
import { DEFAULT_GAME_CONFIG, setupGameUI } from './gameUI';
import { buildRuntimePluginsFromProject } from './plugins/runtime';

interface GameData {
  meta?: {
    gameId?: string;
    name?: string;
    contentBasePath?: string;
  };
  title?: string;
  defaultEpisode?: string;
  plugins?: unknown[];
  sugaragent?: {
    enabled?: boolean;
  };
  episodes?: {
    id: string;
    startRegion?: string;
  }[];
  regions?: { id: string; name?: string; geometry?: { path: string } }[];
  dialogues?: unknown[];
  quests?: unknown[];
  npcs?: unknown[];
  items?: unknown[];
  inspections?: unknown[];
  titleScreen?: {
    cameraPosition?: { x: number; y: number; z: number };
    cameraLookAt?: { x: number; y: number; z: number };
    hidePlayer?: boolean;
    transitionDuration?: number;
  };
}

function getRequestedGameSlug(): string {
  const search = new URLSearchParams(window.location.search);
  const fromQuery = (search.get('game') ?? '').trim();
  const fromBuild = (import.meta.env.VITE_GAME_SLUG ?? '').trim();
  const selected = fromQuery || fromBuild;
  if (!selected) {
    throw new Error('No game selected. Add ?game=<slug> to the URL or build with VITE_GAME_SLUG.');
  }
  return selected;
}

async function loadGameData(slug: string): Promise<GameData> {
  const scopedPath = `${import.meta.env.BASE_URL}games/${slug}/game.json`;
  const scopedResponse = await fetch(scopedPath);
  if (scopedResponse.ok) {
    return scopedResponse.json();
  }
  throw new Error(`Failed to load ${scopedPath}.`);
}

async function runGame(gameData: GameData, gameSlug: string) {
  const container = document.getElementById('app')!;
  const { plugins: runtimePlugins, conversationMiddleware, conversationProviders } = buildRuntimePluginsFromProject(gameData);
  const gameId = gameData.meta?.gameId || gameSlug;
  const contentBasePath = gameData.meta?.contentBasePath || `games/${gameSlug}/assets/`;

  // Determine start region from default episode
  const episodeId = gameData.defaultEpisode || gameData.episodes?.[0]?.id;
  const episode = gameData.episodes?.find(e => e.id === episodeId);

  if (!episode?.startRegion) {
    throw new Error(`Episode '${episodeId}' has no startRegion configured`);
  }

  const region = gameData.regions?.find(r => r.id === episode.startRegion);
  if (!region?.geometry?.path) {
    throw new Error(`Region '${episode.startRegion}' has no geometry.path configured`);
  }

  const startRegionPath = region.geometry.path;

  // Create game
  const game = new Game({
    container,
    engine: { ...DEFAULT_GAME_CONFIG.engine, draco: true },
    save: {
      ...DEFAULT_GAME_CONFIG.save,
      autoSaveEnabled: true,
      namespace: gameId,
    },
    gameId,
    contentBasePath,
    startRegion: startRegionPath,
    mode: 'development', // Use 'development' to enable projectData loading
    projectData: gameData,
    currentEpisode: episodeId,
    plugins: runtimePlugins,
    conversationMiddleware,
    conversationProviders,
    titleScreen: {
      ...DEFAULT_GAME_CONFIG.titleScreen,
      ...gameData.titleScreen,
    },
  });

  await game.init();

  setupGameUI(game, container);

  // ========================================
  // Start Game
  // ========================================

  await game.loadRegion(startRegionPath);

  // Remove loading indicator
  document.getElementById('loading')?.remove();

  game.run();
  game.pause();
  await game.showTitle();
}

// ========================================
// Load and Run
// ========================================

async function startGame(): Promise<void> {
  try {
    const gameSlug = getRequestedGameSlug();
    const gameData = await loadGameData(gameSlug);
    await runGame(gameData, gameSlug);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Failed to start game:', err);
    document.getElementById('app')!.innerHTML = `
      <div style="color: white; padding: 2rem; font-family: sans-serif;">
        <h1>Failed to load game</h1>
        <p>${message}</p>
      </div>
    `;
  }
}

void startGame();
