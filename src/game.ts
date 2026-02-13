/**
 * Production Game Entry Point
 *
 * This is the published game - loads project data from game.json.
 * For development/editor preview, see preview.ts instead.
 */

import {
  Game,
  InteractionPrompt,
  QuestNotification,
  QuestJournal,
  ItemNotification,
  InventoryUI,
  GiftUI,
  ItemViewUI,
  SpellMenuUI,
  CasterHUD,
  ControlsHint,
} from './engine';

interface GameData {
  title?: string;
  defaultEpisode?: string;
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
    engine: {
      camera: {
        style: 'isometric',
        zoom: { min: 0.5, max: 2.0, default: 1.0 }
      }
    },
    save: {
      autoSaveEnabled: true,
      autoSaveDebounceMs: 10000
    },
    startRegion: startRegionPath,
    mode: 'development', // Use 'development' to enable projectData loading
    projectData: gameData,
    currentEpisode: episodeId,
  });

  await game.init();

  // ========================================
  // UI Components
  // ========================================

  const interactionPrompt = new InteractionPrompt(container);
  const questNotification = new QuestNotification(container);
  const questJournal = new QuestJournal(container, game.quests);
  const itemNotification = new ItemNotification(container);
  const inventoryUI = new InventoryUI(container, game.inventory);
  const giftUI = new GiftUI(container, game.inventory);
  const itemViewUI = new ItemViewUI(container);
  const spellMenuUI = new SpellMenuUI(container, game.caster);
  // CasterHUD auto-registers event handlers and manages its own visibility
  new CasterHUD(container, game.caster);
  const controlsHint = new ControlsHint(container);
  controlsHint.hide(); // Hidden until gameplay starts

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

  // Item view handler (click item in inventory)
  inventoryUI.onItemClick = (itemId) => {
    const itemDef = game.inventory.getItemDefinition(itemId);
    if (!itemDef?.view) return;

    const onUse = itemDef.view.type === 'consumable' ? () => {
      game.inventory.removeItem(itemId, 1);
      itemNotification.show(itemDef.name, -1);
      itemViewUI.hide();
      inventoryUI.refresh();
    } : undefined;

    itemViewUI.show(itemDef, onUse);
  };

  // ========================================
  // UI State Management
  // ========================================

  let journalWasPressed = false;
  let inventoryWasPressed = false;
  let giftWasPressed = false;
  let spellMenuWasPressed = false;
  let menuWasPressed = false;

  questJournal.setOnClose(() => game.engine.removeMovementLock('journal'));
  inventoryUI.setOnClose(() => {
    itemViewUI.hide();
    game.engine.removeMovementLock('inventory');
  });
  giftUI.setOnClose(() => game.engine.removeMovementLock('gift'));
  spellMenuUI.setOnClose(() => game.engine.removeMovementLock('spellMenu'));

  const isUIBlocking = () =>
    game.isUIBlocking() ||
    questJournal.isVisible() ||
    inventoryUI.isVisible() ||
    itemViewUI.isVisible() ||
    giftUI.isVisible() ||
    spellMenuUI.isVisible();

  let nearbyPickupId: string | null = null;

  game.onNearbyInteractionChange((interaction) => {
    if (isUIBlocking()) {
      interactionPrompt.hide();
      return;
    }

    if (interaction?.available) {
      interactionPrompt.show(interaction.promptText || 'Interact');
      nearbyPickupId = null;
    } else if (!nearbyPickupId) {
      interactionPrompt.hide();
    }
  });

  // ========================================
  // Input Loop
  // ========================================

  const originalRun = game.engine.run.bind(game.engine);
  game.engine.run = () => {
    let prevScene = game.sceneManager.getCurrentScene();
    const checkInputs = () => {
      const scene = game.sceneManager.getCurrentScene();
      if (scene !== prevScene) {
        if (scene === 'gameplay') controlsHint.show();
        else controlsHint.hide();
        prevScene = scene;
      }

      if (scene !== 'gameplay') {
        requestAnimationFrame(checkInputs);
        return;
      }

      // Q for pause/main menu
      const menuPressed = game.engine.isMenuPressed();
      if (menuPressed && !menuWasPressed) {
        if (!isUIBlocking() || game.sceneManager.getCurrentScene() === 'pause') {
          game.sceneManager.togglePause();
        }
      }
      menuWasPressed = menuPressed;

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
          game.engine.addMovementLock('journal');
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
          game.engine.addMovementLock('inventory');
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
          game.engine.addMovementLock('gift');
        }
      }
      giftWasPressed = giftPressed;

      // Spell menu toggle (C)
      const spellMenuPressed = game.engine.isSpellMenuPressed();
      if (spellMenuPressed && !spellMenuWasPressed) {
        if (spellMenuUI.isVisible()) {
          spellMenuUI.hide();
        } else {
          spellMenuUI.show();
          game.engine.addMovementLock('spellMenu');
        }
      }
      spellMenuWasPressed = spellMenuPressed;

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
