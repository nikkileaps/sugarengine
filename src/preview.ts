/**
 * Game Preview Entry Point
 *
 * This runs the actual game - opened from the editor's Preview button.
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

async function runGame() {
  const container = document.getElementById('app')!;

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
      autoSaveEnabled: true,
      autoSaveDebounceMs: 10000
    },
    startRegion: '/regions/test/',
    startQuest: 'intro-quest',
    startItems: [
      { itemId: 'fresh-bread', quantity: 2 },
      { itemId: 'wildflower-bouquet' }
    ]
  });

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

  await game.loadRegion('/regions/test/');
  game.run();
  game.pause();
  await game.showTitle();
}

runGame();
