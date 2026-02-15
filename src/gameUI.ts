/**
 * Shared game UI wiring and default config used by both game.ts (production)
 * and preview.ts (editor).
 *
 * DEFAULT_GAME_CONFIG: shared Game constructor defaults (camera, title screen, etc.)
 * setupGameUI(): creates all standard UI components, event handlers, and the input loop.
 */

import type { TitleScreenConfig } from './engine/core/Game';

export const DEFAULT_GAME_CONFIG = {
  engine: {
    camera: {
      style: 'isometric' as const,
      zoom: { min: 0.5, max: 2.0, default: 1.0 },
    },
    draco: false,
  },
  save: {
    autoSaveDebounceMs: 10000,
  },
  titleScreen: {
    cameraPosition: { x: 0.0, y: 0.0, z: 25.0 },
    cameraLookAt: { x: 0.3, y: -40.3, z: 54.6 },
    hidePlayer: true,
    transitionDuration: 600,
  } satisfies TitleScreenConfig,
};

import {
  Game,
  InteractionPrompt,
  QuestJournal,
  ItemNotification,
  InventoryUI,
  GiftUI,
  ItemViewUI,
  SpellMenuUI,
  CasterHUD,
  ResonanceGameUI,
  ControlsHint,
} from './engine';

export function setupGameUI(game: Game, container: HTMLElement) {
  // ========================================
  // UI Components
  // ========================================

  const interactionPrompt = new InteractionPrompt(container);
  const questJournal = new QuestJournal(container, game.quests);
  const itemNotification = new ItemNotification(container);
  const inventoryUI = new InventoryUI(container, game.inventory);
  const giftUI = new GiftUI(container, game.inventory);
  const itemViewUI = new ItemViewUI(container);
  const spellMenuUI = new SpellMenuUI(container, game.caster);
  new CasterHUD(container, game.caster);
  const resonanceGameUI = new ResonanceGameUI(container);
  const controlsHint = new ControlsHint(container);
  controlsHint.hide(); // Hidden until gameplay starts

  // ========================================
  // Game Event Handlers → UI Updates
  // ========================================

  game.setEventHandlers({
    onQuestStart: () => {},
    onQuestComplete: () => {
      questJournal.refresh();
    },
    onObjectiveComplete: () => {
      questJournal.refresh();
    },
    onObjectiveProgress: () => {
      questJournal.refresh();
    },
    onItemAdded: (itemName, quantity) => {
      itemNotification.show(itemName, quantity);
    },
  });

  // Gift handler
  giftUI.setOnGift((npcId, itemId) => {
    game.giveItemToNpc(npcId, itemId);
  });

  // Item view handler (click item in inventory)
  inventoryUI.onItemClick = (itemId) => {
    const itemDef = game.inventory.getItemDefinition(itemId);
    if (!itemDef?.view) return;

    const onUse =
      itemDef.view.type === 'consumable'
        ? () => {
            game.inventory.removeItem(itemId, 1);
            itemNotification.show(itemDef.name, -1);
            itemViewUI.hide();
            inventoryUI.refresh();
          }
        : undefined;

    itemViewUI.show(itemDef, onUse);
  };

  // Resonance game handler
  game.setResonanceGameHandler((config) => {
    resonanceGameUI.start(config);
  });

  resonanceGameUI.setOnComplete((result) => {
    game.handleResonanceGameComplete(result.success, result.resonanceGained);
  });

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
    spellMenuUI.isVisible() ||
    resonanceGameUI.isActive();

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
}
