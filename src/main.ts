import { SugarEngine } from './core/Engine';
import {
  InteractionPrompt,
  QuestNotification,
  QuestTracker,
  QuestJournal,
  ItemNotification,
  InventoryUI,
  GiftUI
} from './ui';
import { DialogueManager } from './dialogue';
import { QuestManager } from './quests';
import { InventoryManager } from './inventory';

async function main() {
  const container = document.getElementById('app')!;

  const engine = new SugarEngine({
    container,
    camera: {
      style: 'isometric',
      zoom: { min: 0.5, max: 2.0, default: 1.0 }
    }
  });

  // Dialogue system
  const dialogue = new DialogueManager(container);

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

  // Interaction prompt UI
  const interactionPrompt = new InteractionPrompt(container);

  // Helper to check if any UI is blocking
  const isUIBlocking = () =>
    dialogue.isDialogueActive() ||
    questJournal.isVisible() ||
    inventoryUI.isVisible() ||
    giftUI.isVisible();

  // Show/hide prompt when near NPC (but not during dialogue or other UI)
  // Pickup prompts are handled in the game loop
  engine.onNearbyNPCChange((nearby) => {
    if (isUIBlocking()) {
      interactionPrompt.hide();
      return;
    }

    if (nearby) {
      interactionPrompt.show(nearby.id);
      nearbyPickupId = null; // Clear pickup state when near NPC
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

  // Track nearby pickup for interaction prompt
  let nearbyPickupId: string | null = null;

  // Handle trigger zones for quest objectives
  engine.onTriggerEnter((event, triggerId) => {
    if (event.type === 'quest') {
      quests.triggerObjective('trigger', triggerId);
    }
  });

  // Handle item pickups from the world
  engine.onItemPickup((itemId, quantity) => {
    inventory.addItem(itemId, quantity);
  });

  // Load region
  await engine.loadRegion('/regions/test/');

  // Start the intro quest for testing
  await quests.startQuest('intro-quest');

  // Give player some test items
  inventory.addItem('fresh-bread', 2);
  inventory.addItem('wildflower-bouquet');
  inventory.addItem('ancient-coin', 5);

  // Get nearby NPC for gift UI
  let nearbyNpcId: string | null = null;
  engine.onNearbyNPCChange((nearby) => {
    nearbyNpcId = nearby?.id ?? null;
  });

  // Game loop hook for UI toggles
  const originalRun = engine.run.bind(engine);
  engine.run = () => {
    const checkInputs = () => {
      // Journal toggle (J)
      const journalPressed = engine.isJournalPressed();
      if (journalPressed && !journalWasPressed) {
        if (questJournal.isVisible()) {
          questJournal.hide();
        } else if (!isUIBlocking()) {
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
        } else if (!isUIBlocking()) {
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
        } else if (!isUIBlocking() && nearbyNpcId) {
          giftUI.show(nearbyNpcId);
          engine.setMovementEnabled(false);
        }
      }
      giftWasPressed = giftPressed;

      // Pickup collection (E key when no NPC nearby)
      if (!isUIBlocking() && !nearbyNpcId) {
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

  engine.run();
}

main();
