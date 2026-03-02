/**
 * Production Game Entry Point
 *
 * This is the published game - loads project data from game.json.
 * For development/editor preview, see preview.ts instead.
 */

import { Game } from './engine';
import { DEFAULT_GAME_CONFIG, setupGameUI } from './gameUI';
import { buildRuntimePluginsFromProject } from './plugins/runtime';

interface GameData {
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

async function loadGameData(): Promise<GameData> {
  const response = await fetch(import.meta.env.BASE_URL + 'game.json');
  if (!response.ok) {
    throw new Error('Failed to load game.json - make sure to run npm run game:export first');
  }
  return response.json();
}

async function runGame(gameData: GameData) {
  const container = document.getElementById('app')!;
  const runtimePlugins = buildRuntimePluginsFromProject(gameData);

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
    },
    startRegion: startRegionPath,
    mode: 'development', // Use 'development' to enable projectData loading
    projectData: gameData,
    currentEpisode: episodeId,
    plugins: runtimePlugins,
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

loadGameData()
  .then(runGame)
  .catch((err) => {
    console.error('Failed to start game:', err);
    document.getElementById('app')!.innerHTML = `
      <div style="color: white; padding: 2rem; font-family: sans-serif;">
        <h1>Failed to load game</h1>
        <p>${err.message}</p>
      </div>
    `;
  });
