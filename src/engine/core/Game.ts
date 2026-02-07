import * as THREE from 'three';
import { SugarEngine, EngineConfig } from './Engine';
import { DialogueManager } from '../dialogue/DialogueManager';
import { InspectionManager } from '../inspection/InspectionManager';
import { QuestManager } from '../quests/QuestManager';
import { InventoryManager } from '../inventory/InventoryManager';
import { SaveManager, SaveManagerConfig } from '../save/SaveManager';
import { SceneManager } from '../scenes/SceneManager';
import { EpisodeManager } from '../episodes/EpisodeManager';
import { AudioManager, AudioConfig, AmbientController } from '../audio';
import { CasterManager, SpellLoader, SpellDefinition, SpellResult, SpellEffect, PlayerCasterConfig } from '../caster';
import { CasterSystem } from '../systems/CasterSystem';
import { Caster } from '../components/Caster';
import { ObjectiveType, BeatAction, ConditionExpression } from '../quests/types';
import { PLAYER, NARRATOR } from '../dialogue/types';
import type { ResonancePointConfig } from '../resonance';
import { ResonancePointLoader } from '../resonance';
import { VFXLoader, BUILTIN_PRESETS } from '../vfx';
import { FadeOverlay } from '../ui/FadeOverlay';

export interface TitleScreenConfig {
  /** Camera position for title screen (world coordinates) */
  cameraPosition: { x: number; y: number; z: number };
  /** Point camera looks at (world coordinates) */
  cameraLookAt: { x: number; y: number; z: number };
  /** Hide player during title screen (default true) */
  hidePlayer?: boolean;
  /** Transition duration in ms (default 500) */
  transitionDuration?: number;
}

export interface GameConfig {
  container: HTMLElement;
  engine?: Partial<EngineConfig>;
  save?: Partial<SaveManagerConfig>;
  audio?: Partial<AudioConfig>;
  startRegion?: string;
  startQuest?: string;
  startItems?: { itemId: string; quantity?: number }[];
  /** Development mode - use in-memory project data */
  mode?: 'production' | 'development';
  /** Project data for development mode */
  projectData?: unknown;
  /** Current episode ID for development mode */
  currentEpisode?: string;
  /** Title screen camera configuration */
  titleScreen?: TitleScreenConfig;
}

export interface GameEventHandlers {
  onQuestStart?: (questName: string) => void;
  onQuestComplete?: (questName: string) => void;
  onObjectiveComplete?: (description: string) => void;
  onObjectiveProgress?: () => void;
  onItemAdded?: (itemName: string, quantity: number) => void;
  onDialogueEvent?: (eventName: string) => void;
  onSpellCast?: (spell: SpellDefinition, result: SpellResult) => void;
  onChaosTriggered?: (spell: SpellDefinition, chaosEffect: SpellEffect) => void;
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
  readonly episodes: EpisodeManager;
  readonly audio: AudioManager;
  readonly ambient: AmbientController;
  readonly caster: CasterManager;

  private config: GameConfig;
  private eventHandlers: GameEventHandlers = {};
  private nearbyNpcId: string | null = null;
  private nearbyInteractable: import('../systems').NearbyInteractable | null = null;
  private projectData: unknown = null;
  private onNearbyInteractionChangeHandler: ((interaction: { type: string; id: string; promptText?: string; available: boolean } | null) => void) | null = null;
  private playerCasterConfig: PlayerCasterConfig | null = null;
  private casterSystem: CasterSystem;
  private resonancePointDefinitions: Map<string, ResonancePointConfig> = new Map();
  private fadeOverlay: FadeOverlay;

  // Beat flags (ADR-016) - temporary key-value store until ADR-018 WorldState
  private beatFlags: Map<string, unknown> = new Map();

  // Track active quest dialogue so we can complete objectives when dialogue ends
  private activeQuestDialogue: {
    questId: string;
    objectiveId: string;
    completeOn: 'dialogueEnd' | string;
  } | null = null;

  constructor(config: GameConfig) {
    this.config = config;
    const { container } = config;

    // Store project data for development mode
    if (config.projectData) {
      this.projectData = config.projectData;
    }

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
    this.audio = new AudioManager(config.audio);
    this.ambient = new AmbientController(this.audio);
    this.caster = new CasterManager();
    this.fadeOverlay = new FadeOverlay(container);

    // Create caster system and add to ECS world
    this.casterSystem = new CasterSystem();
    this.engine.world.addSystem(this.casterSystem);

    // Connect caster manager to the ECS world
    this.caster.setWorld(this.engine.world);

    // Create episode manager
    this.episodes = new EpisodeManager({
      developmentMode: config.mode === 'development',
      projectData: config.projectData,
    });

    // Wire up all cross-system connections
    this.wireUpSystems();
  }

  /**
   * Initialize all systems (call before run)
   */
  async init(): Promise<void> {
    await this.inventory.init();
    await this.saveManager.init();

    // Load audio assets (fail silently if not present)
    await this.loadAudioAssets();

    await this.episodes.initialize();

    // If in development mode, register content from project data
    if (this.config.mode === 'development' && this.projectData) {
      await this.registerProjectContent(this.projectData);
    }

    // Connect save manager to game systems
    this.saveManager.setGameSystems(this.engine, this.quests, this.inventory, this.caster);
    this.sceneManager.setGameSystems(this.engine, this.saveManager);
  }

  /**
   * Register content from project data (development mode)
   */
  private async registerProjectContent(projectData: unknown): Promise<void> {
    const project = projectData as {
      dialogues?: { id: string }[];
      quests?: { id: string }[];
      npcs?: { id: string; name: string; defaultDialogue?: string }[];
      items?: { id: string; name: string }[];
      inspections?: { id: string; title: string; subtitle?: string; headerImage?: string; content?: string; sections?: { heading?: string; text: string }[] }[];
      regions?: { id: string; name: string; geometry: { path: string }; gridPosition?: { x: number; z: number }; playerSpawn?: { x: number; y: number; z: number }; npcs?: { id: string; position: { x: number; y: number; z: number } }[]; pickups?: { id: string; itemId: string; position: { x: number; y: number; z: number }; quantity?: number }[]; inspectables?: { id: string; inspectionId: string; position: { x: number; y: number; z: number }; promptText?: string }[]; triggers?: { id: string; type: 'box'; bounds: { min: [number, number, number]; max: [number, number, number] }; event: { type: string; target?: string } }[]; resonancePoints?: { id: string; resonancePointId: string; position: { x: number; y: number; z: number }; promptText?: string }[]; vfxSpawns?: { id: string; vfxId: string; position: { x: number; y: number; z: number }; scale?: number; autoPlay?: boolean }[]; environmentAnimations?: { meshName: string; animationType: 'lamp_glow' | 'candle_flicker' | 'wind_sway'; intensity?: number; speed?: number }[] }[];
      playerCaster?: unknown;
      spells?: unknown[];
    };

    // Pre-register regions (must happen before loadRegion)
    if (project.regions) {
      for (const region of project.regions) {
        // Convert to minimal RegionData format expected by engine
        this.engine.registerRegion({
          id: region.id,
          name: region.name,
          geometry: { path: region.geometry.path },
          gridPosition: region.gridPosition ?? { x: 0, z: 0 },
          playerSpawn: region.playerSpawn ?? { x: 0, y: 0, z: 0 },
          npcs: region.npcs ?? [],
          pickups: region.pickups ?? [],
          inspectables: region.inspectables ?? [],
          triggers: region.triggers ?? [],
          resonancePoints: region.resonancePoints ?? [],
          vfxSpawns: region.vfxSpawns ?? [],
          environmentAnimations: region.environmentAnimations,
        });
      }
    }

    // Pre-register dialogues
    if (project.dialogues) {
      for (const dialogue of project.dialogues) {
        this.dialogue.registerDialogue(dialogue.id, dialogue);
      }
    }

    // Pre-register quests
    if (project.quests) {
      for (const quest of project.quests) {
        this.quests.registerQuest(quest.id, quest);
      }
    }

    // Register NPCs
    if (project.npcs) {
      for (const npc of project.npcs) {
        this.engine.registerNPC(npc.id, npc.name);
      }
    }

    // Register items
    if (project.items) {
      for (const item of project.items) {
        this.inventory.registerItem(item);
      }
    }

    // Register inspections
    if (project.inspections) {
      for (const insp of project.inspections) {
        this.inspection.registerInspection(insp.id, insp);
      }
    }

    // Parse player caster config
    this.playerCasterConfig = SpellLoader.parsePlayerCaster(projectData);

    // Register spells
    const spells = SpellLoader.parseSpells(projectData);
    for (const spell of spells) {
      this.caster.registerSpell(spell);
    }

    // Register resonance points
    const resonancePoints = ResonancePointLoader.parseResonancePoints(projectData);
    this.resonancePointDefinitions.clear();
    for (const rp of resonancePoints) {
      this.resonancePointDefinitions.set(rp.id, rp);
    }

    // Register VFX definitions
    // First register built-in presets
    for (const preset of BUILTIN_PRESETS) {
      this.engine.registerVFXDefinition(preset);
    }
    // Then register custom definitions from project
    const vfxDefinitions = VFXLoader.parseVFXDefinitions(projectData);
    for (const vfx of vfxDefinitions) {
      this.engine.registerVFXDefinition(vfx);
    }

  }

  /**
   * Update project data (for hot reload in development mode)
   */
  updateProjectData(projectData: unknown): void {
    this.projectData = projectData;
    // Re-register content
    this.registerProjectContent(projectData);

    // Re-initialize player caster with updated config
    // This updates the Caster component if it already exists
    this.initializePlayerCaster();
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
   * Get current region info (for debug HUD)
   */
  getRegionInfo(): { path: string; name?: string } | null {
    return this.engine.getCurrentRegionInfo();
  }

  /**
   * Get the nearby NPC ID (for gift UI, etc.)
   */
  getNearbyNpcId(): string | null {
    return this.nearbyNpcId;
  }

  /**
   * Set handler for when nearby interaction changes (for showing/hiding prompts)
   */
  onNearbyInteractionChange(handler: (interaction: { type: string; id: string; promptText?: string; available: boolean } | null) => void): void {
    this.onNearbyInteractionChangeHandler = handler;
  }

  /**
   * Get info about the nearby interactable, including whether interaction is available.
   * For NPCs, checks if there's dialogue (quest or default) before marking as available.
   */
  getNearbyInteraction(): { type: string; id: string; promptText?: string; available: boolean } | null {
    if (!this.nearbyInteractable) return null;

    const { type, id, promptText, dialogueId } = this.nearbyInteractable;

    // For NPCs, only available if there's dialogue to trigger
    if (type === 'npc') {
      const hasQuestDialogue = this.quests.getQuestDialogueForNpc(id) !== null;
      const hasDefaultDialogue = !!dialogueId;
      return {
        type,
        id,
        promptText,
        available: hasQuestDialogue || hasDefaultDialogue,
      };
    }

    // Other types (inspectables, etc.) are always available
    return { type, id, promptText, available: true };
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
      this.engine.addMovementLock('dialogue');
    });

    this.dialogue.setOnEnd(() => {
      this.engine.removeMovementLock('dialogue');
      this.engine.consumeInteract();

      // If this was a quest dialogue that completes on dialogue end, complete the objective
      if (this.activeQuestDialogue?.completeOn === 'dialogueEnd') {
        // Save reference - completing might trigger another dialogue that sets a new activeQuestDialogue
        const completingDialogue = this.activeQuestDialogue;
        this.quests.completeObjective(
          completingDialogue.questId,
          completingDialogue.objectiveId
        );
        // Only clear if it wasn't replaced by a new triggered dialogue
        if (this.activeQuestDialogue === completingDialogue) {
          this.activeQuestDialogue = null;
        }
      } else {
        this.activeQuestDialogue = null;
      }
    });

    // Dialogue events can trigger quest objectives
    // Format: "quest:<type>:<target>" e.g., "quest:custom:finished-greeting"
    this.dialogue.setOnEvent((eventName) => {
      if (eventName.startsWith('quest:')) {
        const [, type, target] = eventName.split(':');
        if (type && target) {
          this.quests.triggerObjective(type as ObjectiveType, target);
        }
      }

      this.eventHandlers.onDialogueEvent?.(eventName);
    });

    // Resolve speaker IDs to display names
    this.dialogue.setSpeakerNameResolver((speakerId) => {
      // Check for built-in speaker types
      if (speakerId === PLAYER.id) {
        return PLAYER.displayName;
      }
      if (speakerId === NARRATOR.id) {
        return NARRATOR.displayName;
      }
      // Check if it's an NPC
      const npcInfo = this.engine.getNPCInfo(speakerId);
      return npcInfo?.name;
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
      this.engine.addMovementLock('inspection');
    });

    this.inspection.setOnEnd(() => {
      this.engine.removeMovementLock('inspection');
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

    // Handle auto-start objectives (legacy: autoStart on objective nodes)
    this.quests.setOnObjectiveTrigger((questId, objective) => {
      // Handle 'talk' or 'voiceover' objectives - start the dialogue
      if ((objective.type === 'talk' || objective.type === 'voiceover') && objective.dialogue) {
        // Track this so we can complete the objective when dialogue ends
        this.activeQuestDialogue = {
          questId,
          objectiveId: objective.id,
          completeOn: objective.completeOn ?? 'dialogueEnd',
        };

        this.dialogue.start(objective.dialogue);
      }
    });

    // Handle beat actions (ADR-016) - instant side effects on node enter/complete
    this.quests.setOnBeatAction((action: BeatAction) => {
      this.executeBeatAction(action);
    });

    // Handle narrative node triggers (ADR-016)
    // Narrative nodes auto-fire and complete when content finishes
    this.quests.setOnNarrativeTrigger((questId, objective) => {
      const narrativeType = objective.narrativeType ?? 'event';

      switch (narrativeType) {
        case 'voiceover':
          // Use dialogue system for voiceover (monologue)
          if (objective.dialogueId || objective.dialogue) {
            this.activeQuestDialogue = {
              questId,
              objectiveId: objective.id,
              completeOn: objective.completeOn ?? 'dialogueEnd',
            };
            this.dialogue.start(objective.dialogueId || objective.dialogue!);
          } else {
            // No dialogue ID - auto-complete
            this.quests.completeObjective(questId, objective.id);
          }
          break;

        case 'dialogue':
          // Auto-trigger a dialogue
          if (objective.dialogueId || objective.dialogue) {
            this.activeQuestDialogue = {
              questId,
              objectiveId: objective.id,
              completeOn: objective.completeOn ?? 'dialogueEnd',
            };
            this.dialogue.start(objective.dialogueId || objective.dialogue!);
          } else {
            this.quests.completeObjective(questId, objective.id);
          }
          break;

        case 'event':
          // Fire event and complete immediately
          if (objective.eventName) {
            this.eventHandlers.onDialogueEvent?.(objective.eventName);
          }
          this.quests.completeObjective(questId, objective.id);
          break;

        case 'cutscene':
          // Cutscenes not yet implemented - auto-complete for now
          console.warn(`[Game] Cutscene narrative type not yet implemented, auto-completing node ${objective.id}`);
          this.quests.completeObjective(questId, objective.id);
          break;
      }
    });

    // Condition checker (ADR-016) - evaluate conditions against game state
    this.quests.setConditionChecker((condition: ConditionExpression) => {
      return this.evaluateCondition(condition);
    });

    // ========================================
    // Inventory System
    // ========================================
    this.inventory.setOnItemAdded((event) => {
      this.eventHandlers.onItemAdded?.(event.itemName, event.quantity);

      // Trigger collect objectives for this item
      this.quests.triggerObjective('collect', event.itemId);

      // Re-evaluate condition nodes (ADR-016) - inventory state changed
      this.quests.evaluateConditions();
    });

    this.inventory.setOnItemRemoved(() => {
      // Re-evaluate condition nodes (ADR-016) - inventory state changed
      this.quests.evaluateConditions();
    });

    // ========================================
    // Caster System
    // ========================================
    this.caster.setOnSpellCast((spell, result) => {
      this.eventHandlers.onSpellCast?.(spell, result);

      // Handle spell effects
      for (const effect of result.effects) {
        this.handleSpellEffect(effect);
      }
    });

    this.caster.setOnChaosTriggered((spell, chaosEffect) => {
      this.eventHandlers.onChaosTriggered?.(spell, chaosEffect);
    });

    // ========================================
    // Engine Events → System Triggers
    // ========================================

    // Track nearby NPC for gift UI and dialogue availability
    this.engine.onNearbyInteractableChange((nearby) => {
      this.nearbyNpcId = (nearby?.type === 'npc') ? nearby.id : null;
      this.nearbyInteractable = nearby;

      // Fire the interaction change event
      if (this.onNearbyInteractionChangeHandler) {
        this.onNearbyInteractionChangeHandler(this.getNearbyInteraction());
      }
    });

    // NPC interaction → dialogue + quest trigger
    this.engine.onInteract((npcId, npcDefaultDialogue) => {
      if (this.isUIBlocking()) return;
      this.audio.play('interact');

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
        }
      }
    });

    // Inspectable interaction → inspection system
    this.engine.onInspect((_inspectableId, inspectionId) => {
      if (this.isUIBlocking()) return;
      this.audio.play('interact');
      this.inspection.start(inspectionId);
    });

    // Trigger zones → quest triggers + auto-save on transitions
    this.engine.onTriggerEnter((event, triggerId) => {
      // Location objectives complete when player reaches a trigger zone
      // The objective's target should match the trigger ID
      this.quests.triggerObjective('location', triggerId);

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
      this.audio.play('pickup');
    });

    // Resonance points → resonance game
    this.engine.onResonanceInteract((_resonancePointId, resonanceDefId) => {
      if (this.isUIBlocking()) return;

      // Get resonance point definition
      const config = this.resonancePointDefinitions.get(resonanceDefId);
      if (!config) {
        console.warn(`[Game] Unknown resonance point definition: ${resonanceDefId}`);
        return;
      }

      this.handleResonanceInteraction(config);
    });

    // ========================================
    // Scene Manager Events
    // ========================================
    this.sceneManager.onNewGame(async () => {
      const transitionDuration = this.config.titleScreen?.transitionDuration ?? 500;

      // Fade to black if title screen is configured
      if (this.config.titleScreen) {
        await this.fadeOverlay.fadeToBlack(transitionDuration);
      }

      // Fade out menu music, start ambient sounds
      this.audio.transitionToGame();
      this.ambient.start();

      // Reset all state
      this.inventory.clear();
      this.quests.clearAllQuests();
      this.beatFlags.clear();
      this.saveManager.clearCollectedPickups();

      // Load starting region (geometry.path format, e.g., 'cafe-nollie')
      if (!this.config.startRegion) {
        throw new Error('No startRegion configured. Set startRegion in GameConfig.');
      }

      // Use player spawn position override if configured
      const spawnOverride = this.playerCasterConfig?.initialSpawnPosition;
      await this.engine.loadRegion(this.config.startRegion, spawnOverride);

      // Set player facing direction if configured
      if (this.playerCasterConfig?.initialFacingAngle !== undefined) {
        this.engine.setPlayerFacingAngle(this.playerCasterConfig.initialFacingAngle);
      }

      // Show player and resume camera following (if title screen was configured)
      if (this.config.titleScreen) {
        this.engine.setPlayerVisible(true);
        this.engine.resumePlayerCamera();
      }

      // Add Caster component to player entity
      this.initializePlayerCaster();

      // Start all quests for this episode
      const episodeQuestIds = this.getEpisodeQuests();
      for (const questId of episodeQuestIds) {
        await this.quests.startQuest(questId);
      }

      // Fallback to config.startQuest if no episode quests (production mode)
      if (episodeQuestIds.length === 0 && this.config.startQuest) {
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

      // Fade from black if title screen is configured
      if (this.config.titleScreen) {
        await this.fadeOverlay.fadeFromBlack(transitionDuration);
      }
    });

    this.sceneManager.onSave(async (slotId) => {
      const result = await this.saveManager.save(slotId);
      if (!result.success) {
        console.error('Save failed:', result.error);
      }
    });

    this.sceneManager.onLoad(async (slotId) => {
      const transitionDuration = this.config.titleScreen?.transitionDuration ?? 500;

      // Fade to black if title screen is configured
      if (this.config.titleScreen) {
        await this.fadeOverlay.fadeToBlack(transitionDuration);
      }

      // Fade out menu music, start ambient sounds
      this.audio.transitionToGame();
      this.ambient.start();

      const result = await this.saveManager.load(slotId);
      if (result.success) {
        // Show player and resume camera following (if title screen was configured)
        if (this.config.titleScreen) {
          this.engine.setPlayerVisible(true);
          this.engine.resumePlayerCamera();
        }

        // Ensure player has Caster component (save manager will restore state)
        this.initializePlayerCaster();

        this.engine.run();

        // Fade from black if title screen is configured
        if (this.config.titleScreen) {
          await this.fadeOverlay.fadeFromBlack(transitionDuration);
        }
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
    if (this.inventory.removeItem(itemId, 1)) {
      this.quests.triggerObjective('custom', `gift-${npcId}`);
      return true;
    }
    return false;
  }

  /**
   * Initialize the Caster component on the player entity
   */
  private initializePlayerCaster(): void {
    const playerEntity = this.engine.getPlayerEntity();
    if (playerEntity < 0) {
      console.warn('[Game] No player entity to attach Caster component');
      return;
    }

    // Remove existing Caster component if any
    const existingCaster = this.engine.world.getComponent<Caster>(playerEntity, Caster);
    if (existingCaster) {
      this.engine.world.removeComponent(playerEntity, Caster);
    }

    // Create Caster component with config or defaults
    const casterConfig = this.playerCasterConfig ?? {
      initialBattery: 100,
      rechargeRate: 1,  // 1% per minute (slow trickle from ambient magic)
    };

    this.engine.world.addComponent(playerEntity, new Caster({
      initialBattery: casterConfig.initialBattery,
      rechargeRate: casterConfig.rechargeRate,
      initialResonance: casterConfig.initialResonance,
      allowedSpellTags: casterConfig.allowedSpellTags,
      blockedSpellTags: casterConfig.blockedSpellTags,
    }));

    // Sync UI with initial values
    this.casterSystem.syncUI(this.engine.world);
  }

  /**
   * Handle a spell effect
   */
  private handleSpellEffect(effect: SpellEffect): void {
    switch (effect.type) {
      case 'event':
        if (effect.eventName) {
          // Trigger the event via dialogue system (which handles quest triggers)
          this.eventHandlers.onDialogueEvent?.(effect.eventName);
        }
        break;

      case 'dialogue':
        if (effect.dialogueId) {
          this.dialogue.start(effect.dialogueId);
        }
        break;

      case 'world-flag':
        // World flags would be handled by a world state manager (future feature)
        break;

      case 'unlock':
        // Unlock effects would be handled by a progression system (future feature)
        break;

      case 'heal':
      case 'damage':
        // Health effects would be handled by a health system (future feature)
        break;
    }
  }

  /**
   * Handle resonance point interaction - starts mini-game
   * Note: The actual UI is created and managed externally (in preview.ts)
   */
  private resonanceGameStartHandler: ((config: ResonancePointConfig) => void) | null = null;

  /**
   * Set the resonance game start handler (called by preview.ts to wire up UI)
   */
  setResonanceGameHandler(handler: (config: ResonancePointConfig) => void): void {
    this.resonanceGameStartHandler = handler;
  }

  /**
   * Handle resonance interaction - called when player presses E on a resonance point
   */
  private handleResonanceInteraction(config: ResonancePointConfig): void {
    if (!this.resonanceGameStartHandler) {
      console.warn('[Game] No resonance game handler set');
      return;
    }

    this.engine.addMovementLock('resonance');

    // Start the resonance game UI
    this.resonanceGameStartHandler(config);
  }

  /**
   * Called by preview.ts when resonance game completes
   */
  handleResonanceGameComplete(success: boolean, resonanceGained: number): void {
    this.engine.removeMovementLock('resonance');
    this.engine.consumeInteract();

    // Add resonance if successful
    if (success && resonanceGained > 0) {
      this.caster.addResonance(resonanceGained);
    }
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
    // Stop ambient sounds
    this.ambient.stop();

    // Start menu music if loaded
    if (!this.audio.isPlaying('menu-music')) {
      this.audio.play('menu-music');
    }

    // Set up title screen camera if configured
    if (this.config.titleScreen) {
      const { cameraPosition, cameraLookAt, hidePlayer } = this.config.titleScreen;
      this.engine.setCameraPositionImmediate(cameraPosition, cameraLookAt);
      if (hidePlayer !== false) {
        this.engine.setPlayerVisible(false);
      }
    }

    await this.sceneManager.showTitle();
  }

  /**
   * Load audio assets and wire up sound handlers
   */
  private async loadAudioAssets(): Promise<void> {
    // Load menu music
    try {
      await this.audio.load('menu-music', import.meta.env.BASE_URL + 'audio/music/menu.mp3', 'music', { loop: true });
    } catch {
      console.warn('[Game] Menu music not found');
    }

    // Load SFX
    try {
      await this.audio.load('footstep', import.meta.env.BASE_URL + 'audio/sfx/footstep.mp3', 'sfx', { loop: true });
      // Wire up footstep handler - loops while walking, stops when stopped
      this.engine.onFootstep(
        () => this.audio.play('footstep'),
        () => this.audio.stop('footstep')
      );
    } catch {
      console.warn('[Game] Footstep sound not found');
    }

    try {
      await this.audio.load('interact', import.meta.env.BASE_URL + 'audio/sfx/interact.mp3', 'sfx');
    } catch {
      console.warn('[Game] Interact sound not found');
    }

    try {
      await this.audio.load('pickup', import.meta.env.BASE_URL + 'audio/sfx/pickup.mp3', 'sfx');
    } catch {
      console.warn('[Game] Pickup sound not found');
    }

    // Load ambient sounds
    try {
      await this.audio.load('wind', import.meta.env.BASE_URL + 'audio/ambient/wind.mp3', 'ambient', { loop: true });
      this.ambient.add({
        id: 'wind',
        minInterval: 20,
        maxInterval: 60,
        minDuration: 5,
        maxDuration: 15,
      });
    } catch {
      console.warn('[Game] Wind sound not found');
    }

    try {
      await this.audio.load('owl', import.meta.env.BASE_URL + 'audio/ambient/owl.mp3', 'ambient');
      this.ambient.add({ id: 'owl', minInterval: 30, maxInterval: 90 });
    } catch {
      console.warn('[Game] Owl sound not found');
    }
  }

  /**
   * Get all quest IDs for the current episode
   */
  private getEpisodeQuests(): string[] {
    if (!this.config.currentEpisode) return [];

    // In development mode, quests are in projectData
    if (this.config.mode === 'development' && this.projectData) {
      const project = this.projectData as {
        quests?: { id: string; episodeId?: string }[];
      };
      const episodeQuests = (project.quests || [])
        .filter(q => q.episodeId === this.config.currentEpisode)
        .map(q => q.id);
      return episodeQuests;
    }

    // In production mode, get from episode content
    // TODO: implement production mode quest loading
    return [];
  }

  // TODO: Implement episode main quest auto-start
  // See docs/dev/quest-episode-integration.md for planned usage
  // private getEpisodeMainQuest(): string | null {
  //   if (!this.config.currentEpisode) return null;
  //   const episode = this.episodes.getEpisode(this.config.currentEpisode);
  //   if (!episode) return null;
  //   if (episode.completionCondition?.type === 'quest') {
  //     return episode.completionCondition.questId;
  //   }
  //   return null;
  // }

  // ============================================
  // Beat Action Execution (ADR-016)
  // ============================================

  /**
   * Execute a beat action (instant side effect)
   */
  private executeBeatAction(action: BeatAction): void {
    switch (action.type) {
      case 'setFlag':
        // Flags system not yet implemented (ADR-018) - store in a simple map for now
        // TODO: Replace with WorldState flags namespace when ADR-018 is implemented
        if (action.target) {
          this.beatFlags.set(action.target, action.value ?? true);
          // Re-evaluate conditions since flags changed
          this.quests.evaluateConditions();
        }
        break;

      case 'giveItem':
        if (action.target) {
          this.inventory.addItem(action.target, (action.value as number) ?? 1);
        }
        break;

      case 'removeItem':
        if (action.target) {
          this.inventory.removeItem(action.target, (action.value as number) ?? 1);
        }
        break;

      case 'playSound':
        if (action.target) {
          this.audio.play(action.target);
        }
        break;

      case 'teleportNPC':
        // Instant position change - use moveNPCTo with instant flag
        // TODO: Add true instant teleport to Engine if needed
        if (action.target && action.value) {
          const pos = action.value as { x: number; y: number; z: number };
          this.engine.moveNPCTo(action.target, pos)
            .catch((err: unknown) => console.error(`[Game] Failed to teleport NPC:`, err));
        }
        break;

      case 'moveNpc':
        // Legacy animated movement (backward compat from ADR-015)
        if (action.npcId && action.position) {
          this.engine.moveNPCTo(action.npcId, action.position)
            .catch((err: unknown) => console.error(`[Game] Failed to move NPC:`, err));
        } else if (action.target && action.value) {
          // Also support new format: target=npcId, value=position
          const pos = action.value as { x: number; y: number; z: number };
          this.engine.moveNPCTo(action.target, pos)
            .catch((err: unknown) => console.error(`[Game] Failed to move NPC:`, err));
        }
        break;

      case 'setNPCState':
        // NPC state changes - will be more useful with ADR-017 behavior trees
        if (action.target) {
          console.warn(`[Game] setNPCState not yet fully implemented for NPC ${action.target}`);
        }
        break;

      case 'emitEvent':
        if (action.target) {
          this.eventHandlers.onDialogueEvent?.(action.target);
        }
        break;

      case 'spawnVFX':
        // VFX spawning via engine
        if (action.target && action.value) {
          const pos = action.value as { x: number; y: number; z: number };
          const vec = new THREE.Vector3(pos.x, pos.y, pos.z);
          this.engine.createVFXEmitter(action.target, vec);
        }
        break;

      case 'custom':
        console.warn(`[Game] Custom beat action: ${action.target}`, action.value);
        break;
    }
  }

  /**
   * Evaluate a condition expression against current game state (ADR-016)
   */
  private evaluateCondition(condition: ConditionExpression): boolean {
    switch (condition.operator) {
      case 'hasItem':
        return this.inventory.hasItem(condition.operand);

      case 'hasFlag':
        // Check beat flags (simple map until ADR-018 WorldState)
        const flagValue = this.beatFlags.get(condition.operand);
        if (condition.value !== undefined) {
          return flagValue === condition.value;
        }
        return flagValue !== undefined && flagValue !== false && flagValue !== null;

      case 'questComplete':
        return this.quests.isQuestCompleted(condition.operand);

      case 'stageComplete':
        // Handled by QuestManager's built-in check
        return false;

      case 'custom':
        console.warn(`[Game] Custom condition not yet implemented: ${condition.operand}`);
        return false;

      default:
        return false;
    }
  }

  /**
   * Get a beat flag value (ADR-016)
   * Temporary until ADR-018 WorldState is implemented
   */
  getBeatFlag(key: string): unknown {
    return this.beatFlags.get(key);
  }

  /**
   * Set a beat flag value (ADR-016)
   * Temporary until ADR-018 WorldState is implemented
   */
  setBeatFlag(key: string, value: unknown): void {
    this.beatFlags.set(key, value);
    this.quests.evaluateConditions();
  }

  /**
   * Dispose all systems
   */
  dispose(): void {
    this.ambient.dispose();
    this.audio.dispose();
    this.dialogue.dispose();
    this.inspection.dispose();
  }
}
