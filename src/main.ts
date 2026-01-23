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
  QuestTracker,
  QuestJournal,
  ItemNotification,
  InventoryUI,
  GiftUI,
} from './engine';
import { Editor } from './editor';

async function main() {
  const container = document.getElementById('app')!;

  // Initialize editor (dev mode only)
  const editor = new Editor();
  if (import.meta.env.DEV) {
    editor.init(container);
  }

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
  const questTracker = new QuestTracker(container, quests);
  const questJournal = new QuestJournal(container, quests);

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
      // Could trigger dialogue or quest objective here
      quests.triggerObjective('custom', `gift-${npcId}`);
    }
  });

  // Quest event handlers
  quests.setOnQuestStart((event) => {
    questNotification.showQuestStart(event.questName);
    questTracker.update();
  });

  quests.setOnQuestComplete((event) => {
    questNotification.showQuestComplete(event.questName);
    questTracker.update();
    questJournal.refresh();
    saveManager.autoSave('quest-complete');
  });

  quests.setOnObjectiveComplete((event) => {
    if (event.objective) {
      questNotification.showObjectiveComplete(event.objective.description);
    }
    questTracker.update();
    questJournal.refresh();
  });

  quests.setOnObjectiveProgress(() => {
    questTracker.update();
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
    engine.consumeInteract(); // Prevent E press from immediately starting new dialogue
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
    engine.consumeInteract(); // Prevent E press from immediately re-opening
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

  // Show/hide prompt when near interactable (NPC or inspectable)
  // Pickup prompts are handled in the game loop
  engine.onNearbyInteractableChange((nearby) => {
    if (isUIBlocking()) {
      interactionPrompt.hide();
      return;
    }

    if (nearby) {
      interactionPrompt.show(nearby.promptText || 'Interact');
      nearbyPickupId = null; // Clear pickup state when near interactable
    } else if (!nearbyPickupId) {
      // Only hide if not showing a pickup prompt
      interactionPrompt.hide();
    }
  });

  // Handle interaction - start dialogue AND trigger quest objectives
  engine.onInteract((npcId, dialogueId) => {
    if (isUIBlocking()) return;

    interactionPrompt.hide();

    // Trigger quest objective for talking to this NPC
    quests.triggerObjective('talk', npcId);

    if (dialogueId) {
      dialogue.start(dialogueId);
    } else {
      console.log(`NPC ${npcId} has no dialogue`);
    }
  });

  // Handle inspection - examine world objects
  engine.onInspect((_inspectableId, inspectionId, _promptText) => {
    if (isUIBlocking()) return;

    interactionPrompt.hide();
    inspection.start(inspectionId);
  });

  // Track nearby pickup for interaction prompt
  let nearbyPickupId: string | null = null;

  // Handle trigger zones for quest objectives and auto-save on region transitions
  engine.onTriggerEnter((event, triggerId) => {
    if (event.type === 'quest') {
      quests.triggerObjective('trigger', triggerId);
    }
    if (event.type === 'transition') {
      saveManager.autoSave('region-transition');
    }
  });

  // Handle item pickups from the world
  engine.onItemPickup((pickupId, itemId, quantity) => {
    inventory.addItem(itemId, quantity);
    // Track collected pickup so it doesn't respawn on load
    saveManager.markPickupCollected(engine.getCurrentRegion(), pickupId);
  });

  // Get nearby NPC for gift UI
  let nearbyNpcId: string | null = null;
  engine.onNearbyInteractableChange((nearby) => {
    // Only set nearbyNpcId if this is an NPC (not inspectable)
    nearbyNpcId = (nearby?.type === 'npc') ? nearby.id : null;
  });

  // =====================================================
  // Scene Manager Event Handlers
  // =====================================================

  // New Game - start fresh
  sceneManager.onNewGame(async () => {
    // Reset game state
    inventory.clear();
    quests.clearAllQuests();
    saveManager.clearCollectedPickups();

    // Load starting region
    await engine.loadRegion('/regions/test/');

    // Start the intro quest
    await quests.startQuest('intro-quest');

    // Give player some starter items
    inventory.addItem('fresh-bread', 2);
    inventory.addItem('wildflower-bouquet');

    // Switch to gameplay
    sceneManager.showGameplay();
    engine.run();
  });

  // Save game
  sceneManager.onSave(async (slotId) => {
    const result = await saveManager.save(slotId);
    if (result.success) {
      console.log(`Game saved to ${slotId}`);
    } else {
      console.error('Save failed:', result.error);
    }
  });

  // Load game
  sceneManager.onLoad(async (slotId) => {
    const result = await saveManager.load(slotId);
    if (result.success) {
      console.log(`Game loaded from ${slotId}`);
      engine.run();
    } else {
      console.error('Load failed:', result.error);
    }
  });

  // Quit
  sceneManager.onQuit(() => {
    // In browser, just reload the page
    window.location.reload();
  });

  // =====================================================
  // Game Loop Input Handling
  // =====================================================

  // Game loop hook for UI toggles
  const originalRun = engine.run.bind(engine);
  engine.run = () => {
    const checkInputs = () => {
      // Only process gameplay inputs when in gameplay scene
      if (sceneManager.getCurrentScene() !== 'gameplay') {
        requestAnimationFrame(checkInputs);
        return;
      }

      // Escape - toggle pause
      const escapePressed = engine.isEscapePressed();
      if (escapePressed && !escapeWasPressed) {
        if (!isUIBlocking() || sceneManager.getCurrentScene() === 'pause') {
          sceneManager.togglePause();
        }
      }
      escapeWasPressed = escapePressed;

      // Don't process other inputs if UI is blocking
      if (isUIBlocking()) {
        requestAnimationFrame(checkInputs);
        return;
      }

      // Journal toggle (J)
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

      // Inventory toggle (I)
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

      // Gift toggle (G) - only when near NPC
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

      // Pickup collection (E key when no NPC nearby)
      if (!nearbyNpcId) {
        const pickup = engine.getNearbyPickup();
        if (pickup) {
          // Update prompt for pickup
          if (nearbyPickupId !== pickup.id) {
            nearbyPickupId = pickup.id;
            interactionPrompt.show('Pick up item');
          }

          // Collect on E press
          if (engine.isInteractPressed()) {
            engine.collectNearbyPickup();
            nearbyPickupId = null;
            interactionPrompt.hide();
          }
        } else if (nearbyPickupId) {
          // No longer near pickup
          nearbyPickupId = null;
          interactionPrompt.hide();
        }
      }

      requestAnimationFrame(checkInputs);
    };

    checkInputs();
    originalRun();
  };

  // =====================================================
  // Start: Load world, start engine paused, show title
  // =====================================================

  // Load the starting region so it's visible behind the title screen
  await engine.loadRegion('/regions/test/');

  // Start the engine but immediately pause it
  engine.run();
  engine.pause();

  // Show title screen (overlays the frozen game world)
  await sceneManager.showTitle();
}

main();
