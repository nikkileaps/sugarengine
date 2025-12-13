import { SugarEngine } from './core/Engine';
import { InteractionPrompt, QuestNotification, QuestTracker, QuestJournal } from './ui';
import { DialogueManager } from './dialogue';
import { QuestManager } from './quests';

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

  // Journal toggle with J key (check in game loop)
  let journalWasPressed = false;

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

  // Interaction prompt UI
  const interactionPrompt = new InteractionPrompt(container);

  // Show/hide prompt when near NPC (but not during dialogue or journal)
  engine.onNearbyNPCChange((nearby) => {
    if (dialogue.isDialogueActive() || questJournal.isVisible()) {
      interactionPrompt.hide();
      return;
    }

    if (nearby) {
      interactionPrompt.show(nearby.id);
    } else {
      interactionPrompt.hide();
    }
  });

  // Handle interaction - start dialogue AND trigger quest objectives
  engine.onInteract((npcId, dialogueId) => {
    if (dialogue.isDialogueActive() || questJournal.isVisible()) return;

    interactionPrompt.hide();

    // Trigger quest objective for talking to this NPC
    quests.triggerObjective('talk', npcId);

    if (dialogueId) {
      dialogue.start(dialogueId);
    } else {
      console.log(`NPC ${npcId} has no dialogue`);
    }
  });

  // Handle trigger zones for quest objectives
  engine.onTriggerEnter((event, triggerId) => {
    if (event.type === 'quest') {
      quests.triggerObjective('trigger', triggerId);
    }
  });

  // Load region
  await engine.loadRegion('/regions/test/');

  // Start the intro quest for testing
  await quests.startQuest('intro-quest');

  // Game loop hook for journal toggle
  const originalRun = engine.run.bind(engine);
  engine.run = () => {
    // Check for journal toggle
    const checkJournal = () => {
      const journalPressed = engine.isJournalPressed();

      if (journalPressed && !journalWasPressed) {
        if (questJournal.isVisible()) {
          questJournal.hide();
        } else if (!dialogue.isDialogueActive()) {
          questJournal.show();
          engine.setMovementEnabled(false);
        }
      }

      journalWasPressed = journalPressed;
      requestAnimationFrame(checkJournal);
    };

    checkJournal();
    originalRun();
  };

  engine.run();
}

main();
