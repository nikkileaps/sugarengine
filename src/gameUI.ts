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
  AgentConversationUI,
  SugarlangConversationUI,
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
  const agentConversationUI = new AgentConversationUI(container);
  const sugarlangUI = new SugarlangConversationUI(container);
  new CasterHUD(container, game.caster);
  const resonanceGameUI = new ResonanceGameUI(container);
  const controlsHint = new ControlsHint(container);
  controlsHint.hide(); // Hidden until gameplay starts

  agentConversationUI.setOnSubmit((message) => game.submitAgentConversationTurn(message));
  agentConversationUI.setOnClose(() => game.closeAgentConversation());

  sugarlangUI.setOnSubmit((input) => {
    void game.submitSugarlangTurn(input);
  });
  sugarlangUI.setOnClose(() => game.closeSugarlangConversation());
  sugarlangUI.setOnRepair((repairId, prefillWord) => {
    // Repair responses are submitted as special text input with a repair: prefix
    void game.submitSugarlangTurn({ text: `repair:${repairId}${prefillWord ? `:${prefillWord}` : ''}` });
  });
  const isPreviewRuntime = window.location.pathname.includes('preview.html');
  if (isPreviewRuntime) {
    agentConversationUI.setOnReset(async (session) => {
      const response = await fetch('/__sugaragent/runtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          op: 'clearSession',
          gameId: game.getGameId(),
          npcId: session.npcId,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }

      const payload = await response.json().catch(() => ({} as { detail?: string }));
      return {
        detail: payload.detail ?? `Conversation memory reset for ${session.npcId}.`,
      };
    });
  } else {
    agentConversationUI.setOnReset(null);
  }

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
    onAgentConversationStart: (session) => {
      agentConversationUI.show(session);
    },
    onAgentConversationEnd: () => {
      agentConversationUI.hide();
    },
    onSugarlangSessionStart: () => {
      sugarlangUI.show();
    },
    onSugarlangSessionEnd: () => {
      sugarlangUI.hide();
    },
    onSugarlangTurnProduced: (envelope) => {
      // If utterance is empty, the scene is done (close intent already fired).
      if (!envelope.utterance) return;

      // Extract support text and band policy from middleware annotations.
      const slAnnotations = envelope.middlewareAnnotations['sugarlang'] as
        | {
            supportText?: string;
            resolvedBand?: string;
            showSupportStrip?: boolean;
            showGlosses?: boolean;
            teachingConcepts?: string[];
          }
        | undefined;

      // Extract repair options and tappable words from provider diagnostics.
      const diagnostics = envelope.providerDiagnostics as
        | {
            supportText?: string;
            repairOptions?: Array<{
              repairId: string;
              label: string;
              type: 'fixed' | 'clarification_template';
            }>;
            tappableWords?: string[];
          }
        | undefined;

      // Use supportText from annotations first, then from diagnostics
      const supportText = slAnnotations?.supportText ?? diagnostics?.supportText;

      sugarlangUI.showTurn({
        utterance: envelope.utterance,
        speakerName: envelope.speakerName,
        emotion: envelope.emotion,
        supportText,
        responseContract: envelope.responseContract,
        bandPolicy: slAnnotations?.resolvedBand
          ? {
              showSupportStrip: slAnnotations.showSupportStrip ?? true,
              showGlosses: slAnnotations.showGlosses ?? false,
              bandId: slAnnotations.resolvedBand,
            }
          : undefined,
        // Glossary chips require real lexicon translations — not yet wired.
        glossaryChips: undefined,
        repairOptions: diagnostics?.repairOptions,
        tappableWords: diagnostics?.tappableWords,
      });
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
    agentConversationUI.isVisible() ||
    sugarlangUI.isVisible() ||
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
