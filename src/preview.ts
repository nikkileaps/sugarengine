/**
 * Game Preview Entry Point
 *
 * This runs the actual game - opened from the editor's Preview button.
 */

import {
  SugarEngine,
  DialogueManager,
  InspectionManager,
  QuestManager,
  InventoryManager,
  SaveManager,
  SceneManager,
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

  // Scene manager (controls title, pause, save/load screens)
  const sceneManager = new SceneManager(container);

  const engine = new SugarEngine({
    container,
    camera: {
      style: 'isometric',
      zoom: { min: 0.5, max: 2.0, default: 1.0 }
    }
  });

  // Dialogue system
  const dialogue = new DialogueManager(container);

  // Inspection system
  const inspection = new InspectionManager(container);

  // Quest system
  const quests = new QuestManager();
  const questNotification = new QuestNotification(container);
  const questJournal = new QuestJournal(container, quests);

  // Debug HUD (dev-only, shows quest state, position, FPS)
  const debugHUD = new DebugHUD(container, quests);
  debugHUD.setPlayerPositionProvider(() => engine.getPlayerPosition());

  // Inventory system
  const inventory = new InventoryManager();
  await inventory.init();
  const itemNotification = new ItemNotification(container);
  const inventoryUI = new InventoryUI(container, inventory);
  const giftUI = new GiftUI(container, inventory);

  // Save system
  const saveManager = new SaveManager({
    autoSaveEnabled: true,
    autoSaveDebounceMs: 10000 // 10 seconds between auto-saves
  });
  await saveManager.init();
  saveManager.setGameSystems(engine, quests, inventory);

  // Connect scene manager to game systems
  sceneManager.setGameSystems(engine, saveManager);

  // Inventory event handlers
  inventory.setOnItemAdded((event) => {
    itemNotification.show(event.itemName, event.quantity);
  });

  // Gift handler
  giftUI.setOnGift((npcId, itemId) => {
    const itemDef = inventory.getItemDefinition(itemId);
    if (inventory.removeItem(itemId, 1)) {
      console.log(`Gave ${itemDef?.name ?? itemId} to NPC ${npcId}`);
      quests.triggerObjective('custom', `gift-${npcId}`);
    }
  });

  // Quest event handlers
  quests.setOnQuestStart((event) => {
    questNotification.showQuestStart(event.questName);
  });

  quests.setOnQuestComplete((event) => {
    questNotification.showQuestComplete(event.questName);
    questJournal.refresh();
    saveManager.autoSave('quest-complete');
  });

  quests.setOnObjectiveComplete((event) => {
    if (event.objective) {
      questNotification.showObjectiveComplete(event.objective.description);
    }
    questJournal.refresh();
  });

  quests.setOnObjectiveProgress(() => {
    questJournal.refresh();
  });

  // Track key states for toggles
  let journalWasPressed = false;
  let inventoryWasPressed = false;
  let giftWasPressed = false;
  let escapeWasPressed = false;

  // Disable player movement during dialogue
  dialogue.setOnStart(() => {
    engine.setMovementEnabled(false);
  });

  dialogue.setOnEnd(() => {
    engine.setMovementEnabled(true);
    engine.consumeInteract();
  });

  // Disable movement when journal is open
  questJournal.setOnClose(() => {
    engine.setMovementEnabled(true);
  });

  // Disable movement when inventory is open
  inventoryUI.setOnClose(() => {
    engine.setMovementEnabled(true);
  });

  // Disable movement when gift UI is open
  giftUI.setOnClose(() => {
    engine.setMovementEnabled(true);
  });

  // Disable movement when inspection is open
  inspection.setOnStart(() => {
    engine.setMovementEnabled(false);
  });

  inspection.setOnEnd(() => {
    engine.setMovementEnabled(true);
    engine.consumeInteract();
  });

  // Interaction prompt UI
  const interactionPrompt = new InteractionPrompt(container);

  // Helper to check if any UI is blocking
  const isUIBlocking = () =>
    sceneManager.isBlocking() ||
    dialogue.isDialogueActive() ||
    inspection.isInspectionActive() ||
    questJournal.isVisible() ||
    inventoryUI.isVisible() ||
    giftUI.isVisible();

  // Show/hide prompt when near interactable
  let nearbyPickupId: string | null = null;

  engine.onNearbyInteractableChange((nearby) => {
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

  // Handle interaction
  engine.onInteract((npcId, dialogueId) => {
    if (isUIBlocking()) return;

    interactionPrompt.hide();
    quests.triggerObjective('talk', npcId);

    if (dialogueId) {
      dialogue.start(dialogueId);
    } else {
      console.log(`NPC ${npcId} has no dialogue`);
    }
  });

  // Handle inspection
  engine.onInspect((_inspectableId, inspectionId, _promptText) => {
    if (isUIBlocking()) return;

    interactionPrompt.hide();
    inspection.start(inspectionId);
  });

  // Handle trigger zones
  engine.onTriggerEnter((event, triggerId) => {
    if (event.type === 'quest') {
      quests.triggerObjective('trigger', triggerId);
    }
    if (event.type === 'transition') {
      saveManager.autoSave('region-transition');
    }
  });

  // Handle item pickups
  engine.onItemPickup((pickupId, itemId, quantity) => {
    inventory.addItem(itemId, quantity);
    saveManager.markPickupCollected(engine.getCurrentRegion(), pickupId);
  });

  // Get nearby NPC for gift UI
  let nearbyNpcId: string | null = null;
  engine.onNearbyInteractableChange((nearby) => {
    nearbyNpcId = (nearby?.type === 'npc') ? nearby.id : null;
  });

  // Scene Manager Event Handlers
  sceneManager.onNewGame(async () => {
    inventory.clear();
    quests.clearAllQuests();
    saveManager.clearCollectedPickups();

    await engine.loadRegion('/regions/test/');
    await quests.startQuest('intro-quest');

    inventory.addItem('fresh-bread', 2);
    inventory.addItem('wildflower-bouquet');

    sceneManager.showGameplay();
    engine.run();
  });

  sceneManager.onSave(async (slotId) => {
    const result = await saveManager.save(slotId);
    if (result.success) {
      console.log(`Game saved to ${slotId}`);
    } else {
      console.error('Save failed:', result.error);
    }
  });

  sceneManager.onLoad(async (slotId) => {
    const result = await saveManager.load(slotId);
    if (result.success) {
      console.log(`Game loaded from ${slotId}`);
      engine.run();
    } else {
      console.error('Load failed:', result.error);
    }
  });

  sceneManager.onQuit(() => {
    window.close(); // Close preview window
  });

  // Game loop input handling
  const originalRun = engine.run.bind(engine);
  engine.run = () => {
    const checkInputs = () => {
      if (sceneManager.getCurrentScene() !== 'gameplay') {
        requestAnimationFrame(checkInputs);
        return;
      }

      const escapePressed = engine.isEscapePressed();
      if (escapePressed && !escapeWasPressed) {
        if (!isUIBlocking() || sceneManager.getCurrentScene() === 'pause') {
          sceneManager.togglePause();
        }
      }
      escapeWasPressed = escapePressed;

      if (isUIBlocking()) {
        requestAnimationFrame(checkInputs);
        return;
      }

      const journalPressed = engine.isJournalPressed();
      if (journalPressed && !journalWasPressed) {
        if (questJournal.isVisible()) {
          questJournal.hide();
        } else {
          questJournal.show();
          engine.setMovementEnabled(false);
        }
      }
      journalWasPressed = journalPressed;

      const inventoryPressed = engine.isInventoryPressed();
      if (inventoryPressed && !inventoryWasPressed) {
        if (inventoryUI.isVisible()) {
          inventoryUI.hide();
        } else {
          inventoryUI.show();
          engine.setMovementEnabled(false);
        }
      }
      inventoryWasPressed = inventoryPressed;

      const giftPressed = engine.isGiftPressed();
      if (giftPressed && !giftWasPressed) {
        if (giftUI.isVisible()) {
          giftUI.hide();
        } else if (nearbyNpcId) {
          giftUI.show(nearbyNpcId);
          engine.setMovementEnabled(false);
        }
      }
      giftWasPressed = giftPressed;

      if (!nearbyNpcId) {
        const pickup = engine.getNearbyPickup();
        if (pickup) {
          if (nearbyPickupId !== pickup.id) {
            nearbyPickupId = pickup.id;
            interactionPrompt.show('Pick up item');
          }

          if (engine.isInteractPressed()) {
            engine.collectNearbyPickup();
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

  // Start: Load databases and world, start engine paused, show title
  await engine.loadNPCDatabase();
  await engine.loadRegion('/regions/test/');
  engine.run();
  engine.pause();
  await sceneManager.showTitle();
}

runGame();
