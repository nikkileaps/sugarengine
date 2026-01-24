import { SugarEngine, EngineConfig } from './Engine';
import { DialogueManager } from '../dialogue/DialogueManager';
import { InspectionManager } from '../inspection/InspectionManager';
import { QuestManager } from '../quests/QuestManager';
import { InventoryManager } from '../inventory/InventoryManager';
import { SaveManager, SaveManagerConfig } from '../save/SaveManager';
import { SceneManager } from '../scenes/SceneManager';
import { ObjectiveType } from '../quests/types';

export interface GameConfig {
  container: HTMLElement;
  engine?: Partial<EngineConfig>;
  save?: Partial<SaveManagerConfig>;
  startRegion?: string;
  startQuest?: string;
  startItems?: { itemId: string; quantity?: number }[];
}

export interface GameEventHandlers {
  onQuestStart?: (questName: string) => void;
  onQuestComplete?: (questName: string) => void;
  onObjectiveComplete?: (description: string) => void;
  onObjectiveProgress?: () => void;
  onItemAdded?: (itemName: string, quantity: number) => void;
  onDialogueEvent?: (eventName: string) => void;
}

/**
 * High-level Game class that orchestrates all engine systems.
 * Handles cross-system wiring (dialogue→quests, pickups→inventory, etc.)
 */
export class Game {
  readonly engine: SugarEngine;
  readonly dialogue: DialogueManager;
  readonly inspection: InspectionManager;
  readonly quests: QuestManager;
  readonly inventory: InventoryManager;
  readonly saveManager: SaveManager;
  readonly sceneManager: SceneManager;

  private config: GameConfig;
  private eventHandlers: GameEventHandlers = {};
  private nearbyNpcId: string | null = null;

  // Track active quest dialogue so we can complete objectives when dialogue ends
  private activeQuestDialogue: {
    questId: string;
    objectiveId: string;
    completeOn: 'dialogueEnd' | string;
  } | null = null;

  constructor(config: GameConfig) {
    this.config = config;
    const { container } = config;

    // Create engine
    this.engine = new SugarEngine({
      container,
      camera: config.engine?.camera ?? {
        style: 'isometric',
        zoom: { min: 0.5, max: 2.0, default: 1.0 }
      }
    });

    // Create systems
    this.dialogue = new DialogueManager(container);
    this.inspection = new InspectionManager(container);
    this.quests = new QuestManager();
    this.inventory = new InventoryManager();
    this.saveManager = new SaveManager({
      autoSaveEnabled: config.save?.autoSaveEnabled ?? true,
      autoSaveDebounceMs: config.save?.autoSaveDebounceMs ?? 10000
    });
    this.sceneManager = new SceneManager(container);

    // Wire up all cross-system connections
    this.wireUpSystems();
  }

  /**
   * Initialize all systems (call before run)
   */
  async init(): Promise<void> {
    await this.inventory.init();
    await this.saveManager.init();
    await this.engine.loadNPCDatabase();

    // Connect save manager to game systems
    this.saveManager.setGameSystems(this.engine, this.quests, this.inventory);
    this.sceneManager.setGameSystems(this.engine, this.saveManager);
  }

  /**
   * Set event handlers for game events (for UI updates, notifications, etc.)
   */
  setEventHandlers(handlers: GameEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Get player position (for debug HUD, minimap, etc.)
   */
  getPlayerPosition(): { x: number; y: number; z: number } | null {
    return this.engine.getPlayerPosition();
  }

  /**
   * Get the nearby NPC ID (for gift UI, etc.)
   */
  getNearbyNpcId(): string | null {
    return this.nearbyNpcId;
  }

  /**
   * Check if any UI is blocking gameplay input
   */
  isUIBlocking(): boolean {
    return (
      this.sceneManager.isBlocking() ||
      this.dialogue.isDialogueActive() ||
      this.inspection.isInspectionActive()
    );
  }

  /**
   * Wire up all cross-system event handlers
   */
  private wireUpSystems(): void {
    // ========================================
    // Dialogue System
    // ========================================
    this.dialogue.setOnStart(() => {
      this.engine.setMovementEnabled(false);
    });

    this.dialogue.setOnEnd(() => {
      this.engine.setMovementEnabled(true);
      this.engine.consumeInteract();

      // If this was a quest dialogue that completes on dialogue end, complete the objective
      if (this.activeQuestDialogue?.completeOn === 'dialogueEnd') {
        this.quests.completeObjective(
          this.activeQuestDialogue.questId,
          this.activeQuestDialogue.objectiveId
        );
      }
      this.activeQuestDialogue = null;
    });

    // Dialogue events can trigger quest objectives
    // Format: "quest:<type>:<target>" e.g., "quest:custom:finished-greeting"
    this.dialogue.setOnEvent((eventName) => {
      console.log(`[Dialogue Event] ${eventName}`);

      if (eventName.startsWith('quest:')) {
        const [, type, target] = eventName.split(':');
        if (type && target) {
          this.quests.triggerObjective(type as ObjectiveType, target);
        }
      }

      this.eventHandlers.onDialogueEvent?.(eventName);
    });

    // Track when specific dialogue nodes are visited (for completeOn: nodeId)
    this.dialogue.setOnNodeEnter((nodeId) => {
      if (this.activeQuestDialogue && this.activeQuestDialogue.completeOn === nodeId) {
        this.quests.completeObjective(
          this.activeQuestDialogue.questId,
          this.activeQuestDialogue.objectiveId
        );
        this.activeQuestDialogue = null; // Clear so dialogueEnd doesn't double-complete
      }
    });

    // ========================================
    // Inspection System
    // ========================================
    this.inspection.setOnStart(() => {
      this.engine.setMovementEnabled(false);
    });

    this.inspection.setOnEnd(() => {
      this.engine.setMovementEnabled(true);
      this.engine.consumeInteract();
    });

    // ========================================
    // Quest System
    // ========================================
    this.quests.setOnQuestStart((event) => {
      this.eventHandlers.onQuestStart?.(event.questName);
    });

    this.quests.setOnQuestComplete((event) => {
      this.eventHandlers.onQuestComplete?.(event.questName);
      this.saveManager.autoSave('quest-complete');
    });

    this.quests.setOnObjectiveComplete((event) => {
      if (event.objective) {
        this.eventHandlers.onObjectiveComplete?.(event.objective.description);
      }
    });

    this.quests.setOnObjectiveProgress(() => {
      this.eventHandlers.onObjectiveProgress?.();
    });

    // ========================================
    // Inventory System
    // ========================================
    this.inventory.setOnItemAdded((event) => {
      this.eventHandlers.onItemAdded?.(event.itemName, event.quantity);
    });

    // ========================================
    // Engine Events → System Triggers
    // ========================================

    // Track nearby NPC for gift UI
    this.engine.onNearbyInteractableChange((nearby) => {
      this.nearbyNpcId = (nearby?.type === 'npc') ? nearby.id : null;
    });

    // NPC interaction → dialogue + quest trigger
    this.engine.onInteract((npcId, npcDefaultDialogue) => {
      if (this.isUIBlocking()) return;

      // Check if any active quest has a specific dialogue for this NPC
      const questDialogue = this.quests.getQuestDialogueForNpc(npcId);

      if (questDialogue) {
        // Use quest-specific dialogue
        this.activeQuestDialogue = {
          questId: questDialogue.questId,
          objectiveId: questDialogue.objectiveId,
          completeOn: questDialogue.completeOn
        };
        this.dialogue.start(questDialogue.dialogue);
      } else {
        // No quest dialogue - use NPC's default (if any)
        // Also trigger generic "talk" objectives that don't specify a dialogue
        this.quests.triggerObjective('talk', npcId);

        if (npcDefaultDialogue) {
          this.dialogue.start(npcDefaultDialogue);
        } else {
          console.log(`NPC ${npcId} has no dialogue`);
        }
      }
    });

    // Inspectable interaction → inspection system
    this.engine.onInspect((_inspectableId, inspectionId) => {
      if (this.isUIBlocking()) return;
      this.inspection.start(inspectionId);
    });

    // Trigger zones → quest triggers + auto-save on transitions
    this.engine.onTriggerEnter((event, triggerId) => {
      if (event.type === 'quest') {
        this.quests.triggerObjective('trigger', triggerId);
      }
      if (event.type === 'transition') {
        this.saveManager.autoSave('region-transition');
      }
    });

    // Item pickups → inventory
    this.engine.onItemPickup((pickupId, itemId, quantity) => {
      this.inventory.addItem(itemId, quantity);
      this.saveManager.markPickupCollected(this.engine.getCurrentRegion(), pickupId);
    });

    // ========================================
    // Scene Manager Events
    // ========================================
    this.sceneManager.onNewGame(async () => {
      // Reset all state
      this.inventory.clear();
      this.quests.clearAllQuests();
      this.saveManager.clearCollectedPickups();

      // Load starting region
      const startRegion = this.config.startRegion ?? '/regions/test/';
      await this.engine.loadRegion(startRegion);

      // Start initial quest if configured
      if (this.config.startQuest) {
        await this.quests.startQuest(this.config.startQuest);
      }

      // Add starting items if configured
      if (this.config.startItems) {
        for (const item of this.config.startItems) {
          this.inventory.addItem(item.itemId, item.quantity ?? 1);
        }
      }

      this.sceneManager.showGameplay();
      this.engine.run();
    });

    this.sceneManager.onSave(async (slotId) => {
      const result = await this.saveManager.save(slotId);
      if (result.success) {
        console.log(`Game saved to ${slotId}`);
      } else {
        console.error('Save failed:', result.error);
      }
    });

    this.sceneManager.onLoad(async (slotId) => {
      const result = await this.saveManager.load(slotId);
      if (result.success) {
        console.log(`Game loaded from ${slotId}`);
        this.engine.run();
      } else {
        console.error('Load failed:', result.error);
      }
    });

    this.sceneManager.onQuit(() => {
      window.close();
    });
  }

  /**
   * Give an item to an NPC (for gift UI)
   */
  giveItemToNpc(npcId: string, itemId: string): boolean {
    const itemDef = this.inventory.getItemDefinition(itemId);
    if (this.inventory.removeItem(itemId, 1)) {
      console.log(`Gave ${itemDef?.name ?? itemId} to NPC ${npcId}`);
      this.quests.triggerObjective('custom', `gift-${npcId}`);
      return true;
    }
    return false;
  }

  /**
   * Load a region
   */
  async loadRegion(regionPath: string): Promise<void> {
    await this.engine.loadRegion(regionPath);
  }

  /**
   * Start a quest
   */
  async startQuest(questId: string): Promise<boolean> {
    return this.quests.startQuest(questId);
  }

  /**
   * Run the game (starts the render loop)
   */
  run(): void {
    this.engine.run();
  }

  /**
   * Pause the game
   */
  pause(): void {
    this.engine.pause();
  }

  /**
   * Show title screen
   */
  async showTitle(): Promise<void> {
    await this.sceneManager.showTitle();
  }

  /**
   * Dispose all systems
   */
  dispose(): void {
    this.dialogue.dispose();
    this.inspection.dispose();
  }
}
