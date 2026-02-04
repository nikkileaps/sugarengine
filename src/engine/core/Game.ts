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
import { ObjectiveType } from '../quests/types';
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

    console.log('[Game] Registered project content:', {
      regions: project.regions?.length || 0,
      dialogues: project.dialogues?.length || 0,
      quests: project.quests?.length || 0,
      npcs: project.npcs?.length || 0,
      inspections: project.inspections?.length || 0,
      items: project.items?.length || 0,
      playerCaster: this.playerCasterConfig,
      spells: spells.length,
      resonancePoints: resonancePoints.length,
      vfxDefinitions: vfxDefinitions.length + BUILTIN_PRESETS.length,
    });
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

    // Handle auto-triggered objectives (e.g., onStageStart)
    this.quests.setOnObjectiveTrigger((_questId, objective) => {
      console.log('[Game] Objective triggered:', objective.id, objective.type);

      // Handle 'talk' or 'voiceover' objectives - start the dialogue
      if ((objective.type === 'talk' || objective.type === 'voiceover') && objective.dialogue) {
        console.log('[Game] Auto-starting dialogue:', objective.dialogue);
        this.dialogue.start(objective.dialogue);
      }
    });

    // ========================================
    // Inventory System
    // ========================================
    this.inventory.setOnItemAdded((event) => {
      this.eventHandlers.onItemAdded?.(event.itemName, event.quantity);
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
        } else {
          console.log(`NPC ${npcId} has no dialogue`);
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
      console.log('[Game] Episode quests to start:', episodeQuestIds);
      for (const questId of episodeQuestIds) {
        const started = await this.quests.startQuest(questId);
        console.log('[Game] Started quest:', questId, 'result:', started);
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
      if (result.success) {
        console.log(`Game saved to ${slotId}`);
      } else {
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
        console.log(`Game loaded from ${slotId}`);

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
    const itemDef = this.inventory.getItemDefinition(itemId);
    if (this.inventory.removeItem(itemId, 1)) {
      console.log(`Gave ${itemDef?.name ?? itemId} to NPC ${npcId}`);
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

    console.log('[Game] Player caster initialized:', casterConfig);
  }

  /**
   * Handle a spell effect
   */
  private handleSpellEffect(effect: SpellEffect): void {
    switch (effect.type) {
      case 'event':
        if (effect.eventName) {
          console.log(`[Spell Effect] Event: ${effect.eventName}`);
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
        if (effect.flagName !== undefined) {
          console.log(`[Spell Effect] World flag: ${effect.flagName} = ${effect.flagValue}`);
          // World flags would be handled by a world state manager (future feature)
        }
        break;

      case 'unlock':
        console.log('[Spell Effect] Unlock:', effect);
        // Unlock effects would be handled by a progression system (future feature)
        break;

      case 'heal':
      case 'damage':
        console.log(`[Spell Effect] ${effect.type}: ${effect.amount}`);
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

    // Disable movement during mini-game
    this.engine.setMovementEnabled(false);

    // Start the resonance game UI
    this.resonanceGameStartHandler(config);
  }

  /**
   * Called by preview.ts when resonance game completes
   */
  handleResonanceGameComplete(success: boolean, resonanceGained: number): void {
    // Re-enable movement
    this.engine.setMovementEnabled(true);
    this.engine.consumeInteract();

    // Add resonance if successful
    if (success && resonanceGained > 0) {
      this.caster.addResonance(resonanceGained);
      console.log(`[Game] Resonance increased by ${resonanceGained}`);
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
      console.log('[Game] Found episode quests from projectData:', episodeQuests);
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
