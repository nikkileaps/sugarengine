import { SugarEngine } from './core/Engine';
import { InteractionPrompt } from './ui';
import { DialogueManager } from './dialogue';

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

  // Disable player movement during dialogue
  dialogue.setOnStart(() => {
    engine.setMovementEnabled(false);
  });

  dialogue.setOnEnd(() => {
    engine.setMovementEnabled(true);
    engine.consumeInteract(); // Prevent E press from immediately starting new dialogue
  });

  // Interaction prompt UI
  const interactionPrompt = new InteractionPrompt(container);

  // Show/hide prompt when near NPC (but not during dialogue)
  engine.onNearbyNPCChange((nearby) => {
    if (dialogue.isDialogueActive()) {
      interactionPrompt.hide();
      return;
    }

    if (nearby) {
      interactionPrompt.show(nearby.id);
    } else {
      interactionPrompt.hide();
    }
  });

  // Handle interaction - start dialogue
  engine.onInteract((npcId, dialogueId) => {
    if (dialogue.isDialogueActive()) return;

    interactionPrompt.hide();

    if (dialogueId) {
      dialogue.start(dialogueId);
    } else {
      console.log(`NPC ${npcId} has no dialogue`);
    }
  });

  // Load region
  await engine.loadRegion('/regions/test/');

  engine.run();
}

main();
