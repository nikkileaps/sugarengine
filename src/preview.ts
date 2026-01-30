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
  InteractionPrompt,
  QuestNotification,
  QuestJournal,
  ItemNotification,
  InventoryUI,
  GiftUI,
  DebugHUD,
} from './engine';

interface ProjectMessage {
  type: 'LOAD_PROJECT' | 'UPDATE_PROJECT';
  project?: unknown;
  episodeId?: string;
}

let gameInstance: Game | null = null;

async function runGame(projectData?: unknown, episodeId?: string) {
  const container = document.getElementById('app')!;

  const isDevelopmentMode = !!projectData;

  // Determine start region from episode if in development mode
  let startRegionPath: string | null = null;

  if (isDevelopmentMode && projectData) {
    const project = projectData as {
      episodes?: { id: string; startRegion?: string }[];
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

  // Create game with all systems wired up
  const game = new Game({
    container,
    engine: {
      camera: {
        style: 'isometric',
        zoom: { min: 0.5, max: 2.0, default: 1.0 }
      }
    },
    save: {
      autoSaveEnabled: !isDevelopmentMode, // Disable auto-save in dev mode
      autoSaveDebounceMs: 10000
    },
    startRegion: startRegionPath,
    startQuest: isDevelopmentMode ? undefined : 'intro-quest',
    startItems: isDevelopmentMode ? [] : [
      { itemId: 'fresh-bread', quantity: 2 },
      { itemId: 'wildflower-bouquet' }
    ],
    mode: isDevelopmentMode ? 'development' : 'production',
    projectData,
    currentEpisode: episodeId,
  });

  gameInstance = game;

  await game.init();

  // ========================================
  // UI Components (preview-specific)
  // ========================================

  const interactionPrompt = new InteractionPrompt(container);
  const questNotification = new QuestNotification(container);
  const questJournal = new QuestJournal(container, game.quests);
  const itemNotification = new ItemNotification(container);
  const inventoryUI = new InventoryUI(container, game.inventory);
  const giftUI = new GiftUI(container, game.inventory);
  const debugHUD = new DebugHUD(container, game.quests);

  debugHUD.setPlayerPositionProvider(() => game.getPlayerPosition());
  debugHUD.setRegionInfoProvider(() => game.getRegionInfo());
  debugHUD.setRenderer(game.engine.renderer);
  debugHUD.setLODStatsProvider(() => game.engine.getLODStats());
  debugHUD.setForcedLODControls(
    (level) => game.engine.setForcedLOD(level),
    () => game.engine.getForcedLOD()
  );

  // ========================================
  // Game Event Handlers → UI Updates
  // ========================================

  game.setEventHandlers({
    onQuestStart: (questName) => {
      questNotification.showQuestStart(questName);
    },
    onQuestComplete: (questName) => {
      questNotification.showQuestComplete(questName);
      questJournal.refresh();
    },
    onObjectiveComplete: (description) => {
      questNotification.showObjectiveComplete(description);
      questJournal.refresh();
    },
    onObjectiveProgress: () => {
      questJournal.refresh();
    },
    onItemAdded: (itemName, quantity) => {
      itemNotification.show(itemName, quantity);
    }
  });

  // Gift handler
  giftUI.setOnGift((npcId, itemId) => {
    game.giveItemToNpc(npcId, itemId);
  });

  // ========================================
  // UI State Management
  // ========================================

  // Track key states for toggles
  let journalWasPressed = false;
  let inventoryWasPressed = false;
  let giftWasPressed = false;
  let escapeWasPressed = false;

  // Disable movement when UIs are open
  questJournal.setOnClose(() => game.engine.setMovementEnabled(true));
  inventoryUI.setOnClose(() => game.engine.setMovementEnabled(true));
  giftUI.setOnClose(() => game.engine.setMovementEnabled(true));

  // Helper to check if any UI is blocking
  const isUIBlocking = () =>
    game.isUIBlocking() ||
    questJournal.isVisible() ||
    inventoryUI.isVisible() ||
    giftUI.isVisible();

  // Show/hide interaction prompt
  let nearbyPickupId: string | null = null;

  game.engine.onNearbyInteractableChange((nearby) => {
    if (isUIBlocking()) {
      interactionPrompt.hide();
      return;
    }

    if (nearby) {
      interactionPrompt.show(nearby.promptText || 'Interact');
      nearbyPickupId = null;
    } else if (!nearbyPickupId) {
      interactionPrompt.hide();
    }
  });

  // ========================================
  // Input Loop (preview-specific UI toggling)
  // ========================================

  const originalRun = game.engine.run.bind(game.engine);
  game.engine.run = () => {
    const checkInputs = () => {
      if (game.sceneManager.getCurrentScene() !== 'gameplay') {
        requestAnimationFrame(checkInputs);
        return;
      }

      // Escape for pause menu
      const escapePressed = game.engine.isEscapePressed();
      if (escapePressed && !escapeWasPressed) {
        if (!isUIBlocking() || game.sceneManager.getCurrentScene() === 'pause') {
          game.sceneManager.togglePause();
        }
      }
      escapeWasPressed = escapePressed;

      if (isUIBlocking()) {
        requestAnimationFrame(checkInputs);
        return;
      }

      // Journal toggle (J)
      const journalPressed = game.engine.isJournalPressed();
      if (journalPressed && !journalWasPressed) {
        if (questJournal.isVisible()) {
          questJournal.hide();
        } else {
          questJournal.show();
          game.engine.setMovementEnabled(false);
        }
      }
      journalWasPressed = journalPressed;

      // Inventory toggle (I)
      const inventoryPressed = game.engine.isInventoryPressed();
      if (inventoryPressed && !inventoryWasPressed) {
        if (inventoryUI.isVisible()) {
          inventoryUI.hide();
        } else {
          inventoryUI.show();
          game.engine.setMovementEnabled(false);
        }
      }
      inventoryWasPressed = inventoryPressed;

      // Gift toggle (G)
      const giftPressed = game.engine.isGiftPressed();
      if (giftPressed && !giftWasPressed) {
        if (giftUI.isVisible()) {
          giftUI.hide();
        } else if (game.getNearbyNpcId()) {
          giftUI.show(game.getNearbyNpcId()!);
          game.engine.setMovementEnabled(false);
        }
      }
      giftWasPressed = giftPressed;

      // Item pickup handling
      if (!game.getNearbyNpcId()) {
        const pickup = game.engine.getNearbyPickup();
        if (pickup) {
          if (nearbyPickupId !== pickup.id) {
            nearbyPickupId = pickup.id;
            interactionPrompt.show('Pick up item');
          }

          if (game.engine.isInteractPressed()) {
            game.engine.collectNearbyPickup();
            nearbyPickupId = null;
            interactionPrompt.hide();
          }
        } else if (nearbyPickupId) {
          nearbyPickupId = null;
          interactionPrompt.hide();
        }
      }

      requestAnimationFrame(checkInputs);
    };

    checkInputs();
    originalRun();
  };

  // ========================================
  // Start Game
  // ========================================

  await game.loadRegion(startRegionPath);
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
    }
  });

  console.log('[Preview] Waiting for project data from editor...');
} else {
  // Production mode: run normally
  runGame();
}
