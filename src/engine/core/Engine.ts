import * as THREE from 'three';
import { World } from '../ecs';
import { Position, Velocity, Renderable, PlayerControlled, TriggerZone, NPC, ItemPickup, NPCMovement, Waypoint, Inspectable, ResonancePoint, WorldLabel, SurfacePatchLOD } from '../components';
import { MovementSystem, RenderSystem, TriggerSystem, TriggerHandler, InteractionSystem, InteractionHandler, InspectionHandler, ResonanceHandler, NearbyInteractable, NPCMovementSystem, WorldLabelSystem, LODSystem } from '../systems';
import { ModelLoader, RegionLoader, LoadedRegion, RegionData, RegionStreamingConfig, Vec3, SurfacePatchDefinition } from '../loaders';
import { GameCamera, GameCameraConfig } from './GameCamera';
import { InputManager } from './InputManager';
import { PostProcessing } from './PostProcessing';
import { getRegionWorldOffset, gridKey } from '../streaming';
import { EnvironmentAnimation } from '../shaders';
import { VFXManager, VFXDefinition } from '../vfx';
import type { Emitter } from '../vfx';

export interface CameraConfig {
  style: 'isometric' | 'perspective';
  zoom?: {
    min: number;
    max: number;
    default: number;
  };
  perspective?: Partial<GameCameraConfig>;
}

export interface EngineConfig {
  container: HTMLElement;
  camera: CameraConfig;
}

// NPC database entry (matches editor format)
export interface NPCDatabaseEntry {
  id: string;
  name: string;
  portrait?: string;
  dialogue?: string;
}

/**
 * Tracks a loaded region and all entities belonging to it.
 * Used for multi-region streaming support.
 */
export interface LoadedRegionState {
  region: LoadedRegion;
  worldOffset: Vec3;
  triggerEntities: number[];
  npcEntities: number[];
  pickupEntities: number[];
  inspectableEntities: number[];
  resonancePointEntities: number[];
  surfacePatchEntities: number[];
  lights: THREE.Light[];
}

export class SugarEngine {
  readonly renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: GameCamera;
  private input: InputManager;
  private clock: THREE.Clock;
  private postProcessing: PostProcessing;
  private playerEntity: number = -1;

  // Multi-region support
  private loadedRegions: Map<string, LoadedRegionState> = new Map();  // regionId -> state
  private activeRegionId: string | null = null;  // Region player is in (for lighting/fog)
  private streamingConfig: RegionStreamingConfig = { regionSize: 64, streamingDistance: 1 };

  // Legacy single-region support (for backward compatibility)
  private currentRegion: LoadedRegion | null = null;
  private regionLights: THREE.Light[] = [];
  private triggerEntities: number[] = [];
  private npcEntities: number[] = [];
  private pickupEntities: number[] = [];
  private inspectableEntities: number[] = [];
  private resonancePointEntities: number[] = [];
  private vfxEmitterIds: string[] = [];
  private surfacePatchEntities: number[] = [];

  private triggerSystem: TriggerSystem;
  private interactionSystem: InteractionSystem;
  private movementSystem: MovementSystem;
  private lodSystem: LODSystem;
  private raycaster: THREE.Raycaster;
  private onNPCClickHandler: ((npcId: string, dialogueId?: string) => void) | null = null;
  private onItemPickupHandler: ((pickupId: string, itemId: string, quantity: number) => void) | null = null;
  private currentRegionPath: string = '';
  private isPaused: boolean = false;
  private isRunning: boolean = false;
  private npcDatabase: Map<string, NPCDatabaseEntry> = new Map();
  private regionRegistry: Map<string, RegionData> = new Map();  // path -> RegionData
  private regionsByGridKey: Map<string, RegionData> = new Map();  // "x,z" -> RegionData
  private worldLabelSystem: WorldLabelSystem;
  private environmentAnimation: EnvironmentAnimation;
  private vfxManager: VFXManager;

  readonly world: World;
  readonly models: ModelLoader;
  readonly regions: RegionLoader;

  constructor(config: EngineConfig) {
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(config.container.clientWidth, config.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    config.container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a2e); // Default background

    // Camera
    this.camera = new GameCamera(config.camera.perspective ?? {}, config.container);
    this.scene.add(this.camera.getSceneObject());
    this.camera.setScene(this.scene);

    // Post-processing (handles rendering with proper color space)
    this.postProcessing = new PostProcessing(
      this.renderer,
      this.scene,
      this.camera.getThreeCamera()
    );

    // Input
    this.input = new InputManager();

    // Loaders
    this.models = new ModelLoader();
    this.regions = new RegionLoader(this.models);

    // ECS World
    this.world = new World();

    // Register systems
    // NPCMovementSystem must run before MovementSystem to set velocities first
    this.world.addSystem(new NPCMovementSystem());
    this.movementSystem = new MovementSystem(this.input, this.scene);
    this.movementSystem.setCameraYawProvider(() => this.camera.getYaw());
    this.world.addSystem(this.movementSystem);
    this.world.addSystem(new RenderSystem(this.scene));
    this.triggerSystem = new TriggerSystem();
    this.world.addSystem(this.triggerSystem);

    this.interactionSystem = new InteractionSystem(this.input);
    this.world.addSystem(this.interactionSystem);

    // World label system for floating NPC names (pure Three.js)
    this.worldLabelSystem = new WorldLabelSystem(this.scene, this.camera.getThreeCamera());
    this.world.addSystem(this.worldLabelSystem);

    // LOD system for surface patch level-of-detail switching
    this.lodSystem = new LODSystem();
    this.lodSystem.setScene(this.scene);
    this.world.addSystem(this.lodSystem);

    // Default trigger handler - handles built-in event types
    this.triggerSystem.setTriggerEnterHandler((event, triggerId) => {
      console.log(`Trigger entered: ${triggerId}`, event);

      // Handle map transitions
      if (event.type === 'transition' && event.target) {
        const spawnPoint = event.spawnPoint as { x: number; y: number; z: number } | undefined;
        console.log(`Transitioning to: ${event.target}`, spawnPoint ? `at ${spawnPoint.x},${spawnPoint.y},${spawnPoint.z}` : '');
        this.loadRegion(event.target as string, spawnPoint);
      }
    });

    // Clock for delta time
    this.clock = new THREE.Clock();

    // Environment animation (shader-based procedural effects)
    this.environmentAnimation = new EnvironmentAnimation();

    // VFX manager for particle effects
    this.vfxManager = new VFXManager(this.scene);

    // Default lighting (will be replaced by region lighting)
    this.setupDefaultLighting();

    // Handle resize
    window.addEventListener('resize', () => this.onResize(config.container));

    // Raycaster for click detection
    this.raycaster = new THREE.Raycaster();

    // Click handler for NPC interaction
    this.renderer.domElement.addEventListener('click', (event) => this.handleClick(event));
  }

  /**
   * Register a region from the project. Call this for each region before loading.
   */
  registerRegion(region: RegionData): void {
    this.regionRegistry.set(region.geometry.path, region);
    // Also index by grid position for streaming lookup
    if (region.gridPosition) {
      const key = gridKey(region.gridPosition);
      this.regionsByGridKey.set(key, region);
    }
  }

  /**
   * Set the streaming configuration for multi-region support.
   */
  setStreamingConfig(config: RegionStreamingConfig): void {
    this.streamingConfig = config;
  }

  /**
   * Get the streaming configuration.
   */
  getStreamingConfig(): RegionStreamingConfig {
    return this.streamingConfig;
  }

  /**
   * Get a region by its grid position.
   */
  getRegionAtGrid(x: number, z: number): RegionData | undefined {
    return this.regionsByGridKey.get(gridKey({ x, z }));
  }

  /**
   * Check if a region is currently loaded.
   */
  isRegionLoaded(regionId: string): boolean {
    return this.loadedRegions.has(regionId);
  }

  /**
   * Get all currently loaded regions.
   */
  getLoadedRegions(): LoadedRegionState[] {
    return Array.from(this.loadedRegions.values());
  }

  async loadRegion(regionPath: string, spawnOverride?: { x: number; y: number; z: number }, collectedPickups?: string[]): Promise<void> {
    // Look up RegionData from registry
    const regionData = this.regionRegistry.get(regionPath);
    if (!regionData) {
      throw new Error(`Region not found in registry: ${regionPath}. Call registerRegion() first.`);
    }

    // Track current region path for saving
    this.currentRegionPath = regionPath;

    // Unload current region if any
    if (this.currentRegion) {
      this.scene.remove(this.currentRegion.geometry);
    }

    // Remove old region lights
    for (const light of this.regionLights) {
      this.scene.remove(light);
    }
    this.regionLights = [];

    // Remove old trigger entities
    for (const entityId of this.triggerEntities) {
      this.world.removeEntity(entityId);
    }
    this.triggerEntities = [];

    // Remove old NPC entities (and their meshes and labels)
    for (const entityId of this.npcEntities) {
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);
      if (renderable) {
        this.scene.remove(renderable.mesh);
      }
      // Clean up WorldLabel sprite
      const label = this.world.getComponent<WorldLabel>(entityId, WorldLabel);
      if (label?.sprite) {
        this.scene.remove(label.sprite);
        label.sprite.material.map?.dispose();
        (label.sprite.material as THREE.SpriteMaterial).dispose();
      }
      this.world.removeEntity(entityId);
    }
    this.npcEntities = [];

    // Remove old pickup entities (and their meshes)
    for (const entityId of this.pickupEntities) {
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);
      if (renderable) {
        this.scene.remove(renderable.mesh);
      }
      this.world.removeEntity(entityId);
    }
    this.pickupEntities = [];

    // Remove old inspectable entities (and their meshes)
    for (const entityId of this.inspectableEntities) {
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);
      if (renderable) {
        this.scene.remove(renderable.mesh);
      }
      this.world.removeEntity(entityId);
    }
    this.inspectableEntities = [];

    // Remove old resonance point entities (and their meshes)
    for (const entityId of this.resonancePointEntities) {
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);
      if (renderable) {
        this.scene.remove(renderable.mesh);
      }
      this.world.removeEntity(entityId);
    }
    this.resonancePointEntities = [];

    // Remove old VFX emitters
    for (const emitterId of this.vfxEmitterIds) {
      this.vfxManager.removeEmitter(emitterId);
    }
    this.vfxEmitterIds = [];

    // Remove old surface patch LOD entities
    for (const entityId of this.surfacePatchEntities) {
      this.world.removeEntity(entityId);
    }
    this.surfacePatchEntities = [];

    // Load new region using RegionData
    this.currentRegion = await this.regions.load(regionData);

    // Apply lighting and atmosphere
    this.applyRegionLighting();

    // Create trigger entities from region data
    for (const triggerDef of this.currentRegion.data.triggers) {
      const entity = this.world.createEntity();
      this.world.addComponent(entity, new TriggerZone(
        triggerDef.id,
        triggerDef.bounds.min[0],
        triggerDef.bounds.min[1],
        triggerDef.bounds.min[2],
        triggerDef.bounds.max[0],
        triggerDef.bounds.max[1],
        triggerDef.bounds.max[2],
        triggerDef.event
      ));
      this.triggerEntities.push(entity);
    }
    if (this.currentRegion.data.triggers.length > 0) {
      console.log(`Loaded ${this.currentRegion.data.triggers.length} trigger zones`);
    }

    // Create NPC entities from region data
    for (const npcDef of this.currentRegion.data.npcs) {
      const entity = this.world.createEntity();

      // Position
      this.world.addComponent(entity, new Position(
        npcDef.position.x,
        npcDef.position.y,
        npcDef.position.z
      ));

      // NPC data - look up display name and dialogue from database
      const npcInfo = this.npcDatabase.get(npcDef.id);
      const displayName = npcInfo?.name ?? npcDef.id;
      const dialogueId = npcInfo?.dialogue;

      this.world.addComponent(entity, new NPC(
        npcDef.id,
        displayName,
        dialogueId
      ));

      // Add movement components if movement is defined
      if (npcDef.movement) {
        // Velocity is required for movement
        this.world.addComponent(entity, new Velocity());

        // Convert waypoint definitions to Waypoint objects
        const waypoints: Waypoint[] = npcDef.movement.waypoints.map(wp => ({
          x: wp.x,
          y: wp.y,
          z: wp.z,
          pauseDuration: wp.pause ?? 0.5
        }));

        // Create movement component
        const npcMovement = new NPCMovement(
          waypoints,
          npcDef.movement.behavior,
          npcDef.movement.speed ?? 2
        );
        npcMovement.isMoving = !npcDef.movement.startPaused;

        this.world.addComponent(entity, npcMovement);
      }

      // Placeholder mesh (capsule like player but different color)
      const geometry = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
      const material = new THREE.MeshStandardMaterial({ color: 0x9966ff });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(npcDef.position.x, npcDef.position.y + 0.7, npcDef.position.z);
      mesh.name = `npc-${npcDef.id}`;
      mesh.userData.npcId = npcDef.id;
      mesh.userData.entityId = entity;
      this.scene.add(mesh);

      // Add floating name label component (rendered by WorldLabelSystem)
      this.world.addComponent(entity, new WorldLabel(displayName, 1.8));

      this.world.addComponent(entity, new Renderable(mesh));
      this.npcEntities.push(entity);
    }
    if (this.currentRegion.data.npcs.length > 0) {
      console.log(`Loaded ${this.currentRegion.data.npcs.length} NPCs`);
    }

    // Create pickup entities from region data (skip already collected ones)
    const pickups = this.currentRegion.data.pickups ?? [];
    const collectedSet = new Set(collectedPickups ?? []);
    for (const pickupDef of pickups) {
      // Skip pickups that were already collected
      if (collectedSet.has(pickupDef.id)) {
        continue;
      }

      const entity = this.world.createEntity();

      // Position
      this.world.addComponent(entity, new Position(
        pickupDef.position.x,
        pickupDef.position.y,
        pickupDef.position.z
      ));

      // ItemPickup data
      this.world.addComponent(entity, new ItemPickup(
        pickupDef.id,
        pickupDef.itemId,
        pickupDef.quantity ?? 1
      ));

      // Pickup placeholder (orange glowing sphere)
      const geometry = new THREE.SphereGeometry(0.25, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: 0xff8833,
        emissive: 0xff6600,
        emissiveIntensity: 0.6
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(
        pickupDef.position.x,
        pickupDef.position.y + 0.4, // Hover above ground
        pickupDef.position.z
      );
      mesh.name = `pickup-${pickupDef.id}`;
      mesh.userData.pickupId = pickupDef.id;
      mesh.userData.entityId = entity;
      this.scene.add(mesh);

      this.world.addComponent(entity, new Renderable(mesh));
      this.pickupEntities.push(entity);
    }
    if (pickups.length > 0) {
      console.log(`Loaded ${pickups.length} item pickups`);
    }

    // Create inspectable entities from region data
    const inspectables = this.currentRegion.data.inspectables ?? [];
    for (const inspectableDef of inspectables) {
      const entity = this.world.createEntity();

      // Position
      this.world.addComponent(entity, new Position(
        inspectableDef.position.x,
        inspectableDef.position.y,
        inspectableDef.position.z
      ));

      // Inspectable data
      this.world.addComponent(entity, new Inspectable(
        inspectableDef.id,
        inspectableDef.inspectionId,
        inspectableDef.promptText
      ));

      // Placeholder mesh (small box to indicate inspectable object)
      const geometry = new THREE.BoxGeometry(0.4, 0.3, 0.4);
      const material = new THREE.MeshStandardMaterial({
        color: 0x8888ff,
        emissive: 0x4444aa,
        emissiveIntensity: 0.3
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(
        inspectableDef.position.x,
        inspectableDef.position.y + 0.2,
        inspectableDef.position.z
      );
      mesh.name = `inspectable-${inspectableDef.id}`;
      mesh.userData.inspectableId = inspectableDef.id;
      mesh.userData.entityId = entity;
      this.scene.add(mesh);

      this.world.addComponent(entity, new Renderable(mesh));
      this.inspectableEntities.push(entity);
    }
    if (inspectables.length > 0) {
      console.log(`Loaded ${inspectables.length} inspectable objects`);
    }

    // Create resonance point entities from region data
    const resonancePoints = this.currentRegion.data.resonancePoints ?? [];
    for (const resonancePointDef of resonancePoints) {
      const entity = this.world.createEntity();

      // Position
      this.world.addComponent(entity, new Position(
        resonancePointDef.position.x,
        resonancePointDef.position.y,
        resonancePointDef.position.z
      ));

      // ResonancePoint data
      this.world.addComponent(entity, new ResonancePoint(
        resonancePointDef.id,
        resonancePointDef.resonancePointId,
        resonancePointDef.promptText
      ));

      // Placeholder mesh (glowing crystal-like shape)
      const geometry = new THREE.OctahedronGeometry(0.35, 0);
      const material = new THREE.MeshStandardMaterial({
        color: 0x7b68ee,
        emissive: 0x5548c8,
        emissiveIntensity: 0.5
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(
        resonancePointDef.position.x,
        resonancePointDef.position.y + 0.5,
        resonancePointDef.position.z
      );
      mesh.name = `resonancePoint-${resonancePointDef.id}`;
      mesh.userData.resonancePointId = resonancePointDef.id;
      mesh.userData.entityId = entity;
      this.scene.add(mesh);

      this.world.addComponent(entity, new Renderable(mesh));
      this.resonancePointEntities.push(entity);
    }
    if (resonancePoints.length > 0) {
      console.log(`Loaded ${resonancePoints.length} resonance points`);
    }

    // Create VFX emitters from region data
    const vfxSpawns = this.currentRegion.data.vfxSpawns ?? [];
    console.log(`[Engine] VFX spawns in region:`, vfxSpawns);
    console.log(`[Engine] Registered VFX definitions:`, this.vfxManager.getAllDefinitions().map(d => d.id));
    for (const vfxSpawn of vfxSpawns) {
      const position = new THREE.Vector3(
        vfxSpawn.position.x,
        vfxSpawn.position.y,
        vfxSpawn.position.z
      );
      const scale = vfxSpawn.scale ?? 1;
      const autoPlay = vfxSpawn.autoPlay !== false;

      console.log(`[Engine] Creating VFX emitter: vfxId=${vfxSpawn.vfxId}, pos=(${position.x}, ${position.y}, ${position.z}), scale=${scale}, autoPlay=${autoPlay}`);
      const emitter = this.vfxManager.createEmitter(vfxSpawn.vfxId, position, scale, autoPlay);
      if (emitter) {
        console.log(`[Engine] Created emitter: ${emitter.id}`);
        this.vfxEmitterIds.push(emitter.id);
      } else {
        console.warn(`[Engine] Failed to create emitter for vfxId=${vfxSpawn.vfxId}`);
      }
    }
    if (vfxSpawns.length > 0) {
      console.log(`Loaded ${vfxSpawns.length} VFX emitters`);
    }

    // Add geometry to scene
    this.scene.add(this.currentRegion.geometry);

    // Process scene for environmental animations (lamp glow, etc.)
    this.environmentAnimation.processScene(
      this.currentRegion.geometry,
      regionData.environmentAnimations,
      this.currentRegion.lights
    );

    // Create surface patch LOD entities from map data
    this.surfacePatchEntities = this.createSurfacePatchEntities(
      this.currentRegion.geometry,
      this.currentRegion.mapData.surfacePatches
    );

    // Create/move player to spawn point (use override if provided)
    const spawn = spawnOverride ?? this.currentRegion.data.playerSpawn;
    if (this.playerEntity < 0) {
      this.playerEntity = await this.createPlayer(spawn.x, spawn.y, spawn.z);
    } else {
      // Move existing player to spawn
      const pos = this.world.getComponent<Position>(this.playerEntity, Position);
      if (pos) {
        pos.x = spawn.x;
        pos.y = spawn.y + 0.75; // Offset for player height
        pos.z = spawn.z;
      }
    }

    console.log(`Loaded region: ${this.currentRegion.data.name}`);
  }

  /**
   * Load a region by ID for multi-region streaming.
   * Positions the region at its grid position and tracks all spawned entities.
   */
  async loadRegionById(regionId: string, collectedPickups?: string[]): Promise<void> {
    // Check if already loaded
    if (this.loadedRegions.has(regionId)) {
      return;
    }

    // Find region by ID
    const regionData = Array.from(this.regionRegistry.values()).find(r => r.id === regionId);
    if (!regionData) {
      throw new Error(`Region not found: ${regionId}`);
    }

    // Calculate world offset from grid position
    const worldOffset = getRegionWorldOffset(
      regionData.gridPosition ?? { x: 0, z: 0 },
      this.streamingConfig
    );

    // Load region geometry and data
    const loadedRegion = await this.regions.load(regionData);

    // Position geometry at world offset
    loadedRegion.geometry.position.set(worldOffset.x, worldOffset.y, worldOffset.z);
    this.scene.add(loadedRegion.geometry);

    // Process scene for environmental animations (lamp glow, etc.)
    this.environmentAnimation.processScene(
      loadedRegion.geometry,
      regionData.environmentAnimations,
      loadedRegion.lights
    );

    // Track state for this region
    const state: LoadedRegionState = {
      region: loadedRegion,
      worldOffset,
      triggerEntities: [],
      npcEntities: [],
      pickupEntities: [],
      inspectableEntities: [],
      resonancePointEntities: [],
      surfacePatchEntities: [],
      lights: []
    };

    // Create trigger entities (offset by world position)
    for (const triggerDef of regionData.triggers) {
      const entity = this.world.createEntity();
      this.world.addComponent(entity, new TriggerZone(
        triggerDef.id,
        triggerDef.bounds.min[0] + worldOffset.x,
        triggerDef.bounds.min[1] + worldOffset.y,
        triggerDef.bounds.min[2] + worldOffset.z,
        triggerDef.bounds.max[0] + worldOffset.x,
        triggerDef.bounds.max[1] + worldOffset.y,
        triggerDef.bounds.max[2] + worldOffset.z,
        triggerDef.event
      ));
      state.triggerEntities.push(entity);
    }

    // Create NPC entities (offset by world position)
    for (const npcDef of regionData.npcs) {
      const entity = this.world.createEntity();
      const worldX = npcDef.position.x + worldOffset.x;
      const worldY = npcDef.position.y + worldOffset.y;
      const worldZ = npcDef.position.z + worldOffset.z;

      this.world.addComponent(entity, new Position(worldX, worldY, worldZ));

      const npcInfo = this.npcDatabase.get(npcDef.id);
      const displayName = npcInfo?.name ?? npcDef.id;
      const dialogueId = npcInfo?.dialogue;

      this.world.addComponent(entity, new NPC(npcDef.id, displayName, dialogueId));

      if (npcDef.movement) {
        this.world.addComponent(entity, new Velocity());
        const waypoints: Waypoint[] = npcDef.movement.waypoints.map(wp => ({
          x: wp.x + worldOffset.x,
          y: wp.y + worldOffset.y,
          z: wp.z + worldOffset.z,
          pauseDuration: wp.pause ?? 0.5
        }));
        const npcMovement = new NPCMovement(
          waypoints,
          npcDef.movement.behavior,
          npcDef.movement.speed ?? 2
        );
        npcMovement.isMoving = !npcDef.movement.startPaused;
        this.world.addComponent(entity, npcMovement);
      }

      const geometry = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
      const material = new THREE.MeshStandardMaterial({ color: 0x9966ff });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(worldX, worldY + 0.7, worldZ);
      mesh.name = `npc-${npcDef.id}`;
      mesh.userData.npcId = npcDef.id;
      mesh.userData.entityId = entity;
      mesh.userData.regionId = regionId;
      this.scene.add(mesh);

      this.world.addComponent(entity, new WorldLabel(displayName, 1.8));
      this.world.addComponent(entity, new Renderable(mesh));
      state.npcEntities.push(entity);
    }

    // Create pickup entities (offset by world position)
    const pickups = regionData.pickups ?? [];
    const collectedSet = new Set(collectedPickups ?? []);
    for (const pickupDef of pickups) {
      if (collectedSet.has(pickupDef.id)) continue;

      const entity = this.world.createEntity();
      const worldX = pickupDef.position.x + worldOffset.x;
      const worldY = pickupDef.position.y + worldOffset.y;
      const worldZ = pickupDef.position.z + worldOffset.z;

      this.world.addComponent(entity, new Position(worldX, worldY, worldZ));
      this.world.addComponent(entity, new ItemPickup(
        pickupDef.id,
        pickupDef.itemId,
        pickupDef.quantity ?? 1
      ));

      const geometry = new THREE.SphereGeometry(0.25, 16, 16);
      const material = new THREE.MeshStandardMaterial({
        color: 0xff8833,
        emissive: 0xff6600,
        emissiveIntensity: 0.6
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(worldX, worldY + 0.4, worldZ);
      mesh.name = `pickup-${pickupDef.id}`;
      mesh.userData.pickupId = pickupDef.id;
      mesh.userData.entityId = entity;
      mesh.userData.regionId = regionId;
      this.scene.add(mesh);

      this.world.addComponent(entity, new Renderable(mesh));
      state.pickupEntities.push(entity);
    }

    // Create inspectable entities (offset by world position)
    const inspectables = regionData.inspectables ?? [];
    for (const inspectableDef of inspectables) {
      const entity = this.world.createEntity();
      const worldX = inspectableDef.position.x + worldOffset.x;
      const worldY = inspectableDef.position.y + worldOffset.y;
      const worldZ = inspectableDef.position.z + worldOffset.z;

      this.world.addComponent(entity, new Position(worldX, worldY, worldZ));
      this.world.addComponent(entity, new Inspectable(
        inspectableDef.id,
        inspectableDef.inspectionId,
        inspectableDef.promptText
      ));

      const geometry = new THREE.BoxGeometry(0.4, 0.3, 0.4);
      const material = new THREE.MeshStandardMaterial({
        color: 0x8888ff,
        emissive: 0x4444aa,
        emissiveIntensity: 0.3
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(worldX, worldY + 0.2, worldZ);
      mesh.name = `inspectable-${inspectableDef.id}`;
      mesh.userData.inspectableId = inspectableDef.id;
      mesh.userData.entityId = entity;
      mesh.userData.regionId = regionId;
      this.scene.add(mesh);

      this.world.addComponent(entity, new Renderable(mesh));
      state.inspectableEntities.push(entity);
    }

    // Create resonance point entities (offset by world position)
    const resonancePoints = regionData.resonancePoints ?? [];
    for (const resonancePointDef of resonancePoints) {
      const entity = this.world.createEntity();
      const worldX = resonancePointDef.position.x + worldOffset.x;
      const worldY = resonancePointDef.position.y + worldOffset.y;
      const worldZ = resonancePointDef.position.z + worldOffset.z;

      this.world.addComponent(entity, new Position(worldX, worldY, worldZ));
      this.world.addComponent(entity, new ResonancePoint(
        resonancePointDef.id,
        resonancePointDef.resonancePointId,
        resonancePointDef.promptText
      ));

      const geometry = new THREE.OctahedronGeometry(0.35, 0);
      const material = new THREE.MeshStandardMaterial({
        color: 0x7b68ee,
        emissive: 0x5548c8,
        emissiveIntensity: 0.5
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(worldX, worldY + 0.5, worldZ);
      mesh.name = `resonancePoint-${resonancePointDef.id}`;
      mesh.userData.resonancePointId = resonancePointDef.id;
      mesh.userData.entityId = entity;
      mesh.userData.regionId = regionId;
      this.scene.add(mesh);

      this.world.addComponent(entity, new Renderable(mesh));
      state.resonancePointEntities.push(entity);
    }

    // Add lights from region (offset by world position)
    for (const light of loadedRegion.lights) {
      if (light.position) {
        light.position.x += worldOffset.x;
        light.position.z += worldOffset.z;
      }
      this.scene.add(light);
      state.lights.push(light);
    }

    // Create surface patch LOD entities (offset by world position)
    state.surfacePatchEntities = this.createSurfacePatchEntities(
      loadedRegion.geometry,
      loadedRegion.mapData.surfacePatches,
      worldOffset
    );

    this.loadedRegions.set(regionId, state);
    console.log(`Loaded region: ${regionData.name} at grid (${regionData.gridPosition?.x ?? 0}, ${regionData.gridPosition?.z ?? 0})`);
  }

  /**
   * Unload a region by ID, removing all its entities and geometry.
   */
  unloadRegionById(regionId: string): void {
    const state = this.loadedRegions.get(regionId);
    if (!state) return;

    // Remove geometry
    this.scene.remove(state.region.geometry);

    // Remove lights
    for (const light of state.lights) {
      this.scene.remove(light);
    }

    // Remove trigger entities
    for (const entityId of state.triggerEntities) {
      this.world.removeEntity(entityId);
    }

    // Remove NPC entities and their meshes/labels
    for (const entityId of state.npcEntities) {
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);
      if (renderable) {
        this.scene.remove(renderable.mesh);
      }
      const label = this.world.getComponent<WorldLabel>(entityId, WorldLabel);
      if (label?.sprite) {
        this.scene.remove(label.sprite);
        label.sprite.material.map?.dispose();
        (label.sprite.material as THREE.SpriteMaterial).dispose();
      }
      this.world.removeEntity(entityId);
    }

    // Remove pickup entities and their meshes
    for (const entityId of state.pickupEntities) {
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);
      if (renderable) {
        this.scene.remove(renderable.mesh);
      }
      this.world.removeEntity(entityId);
    }

    // Remove inspectable entities and their meshes
    for (const entityId of state.inspectableEntities) {
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);
      if (renderable) {
        this.scene.remove(renderable.mesh);
      }
      this.world.removeEntity(entityId);
    }

    // Remove resonance point entities and their meshes
    for (const entityId of state.resonancePointEntities) {
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);
      if (renderable) {
        this.scene.remove(renderable.mesh);
      }
      this.world.removeEntity(entityId);
    }

    // Remove surface patch LOD entities
    for (const entityId of state.surfacePatchEntities) {
      this.world.removeEntity(entityId);
    }

    this.loadedRegions.delete(regionId);

    // Clear active region if it was unloaded
    if (this.activeRegionId === regionId) {
      this.activeRegionId = null;
    }

    console.log(`Unloaded region: ${regionId}`);
  }

  /**
   * Set the active region (player's current region) for lighting and fog.
   */
  setActiveRegion(regionId: string): void {
    const state = this.loadedRegions.get(regionId);
    if (!state) return;

    this.activeRegionId = regionId;

    const lighting = state.region.mapData.lighting;
    if (lighting) {
      this.scene.background = new THREE.Color(lighting.backgroundColor);
      if (lighting.fog?.enabled) {
        this.scene.fog = new THREE.FogExp2(lighting.fog.color, lighting.fog.density);
      } else {
        this.scene.fog = null;
      }
    }

    const postProcessingConfig = state.region.mapData.postProcessing;
    if (postProcessingConfig?.bloom) {
      this.postProcessing.setBloomConfig(postProcessingConfig.bloom);
    }
  }

  /**
   * Spawn player at a specific world position.
   */
  async spawnPlayerAt(worldPos: Vec3): Promise<void> {
    if (this.playerEntity < 0) {
      this.playerEntity = await this.createPlayer(worldPos.x, worldPos.y, worldPos.z);
    } else {
      const pos = this.world.getComponent<Position>(this.playerEntity, Position);
      if (pos) {
        pos.x = worldPos.x;
        pos.y = worldPos.y + 0.75;
        pos.z = worldPos.z;
      }
    }
  }

  /**
   * Get the player's current world position.
   */
  getPlayerWorldPosition(): Vec3 | null {
    if (this.playerEntity < 0) return null;
    const pos = this.world.getComponent<Position>(this.playerEntity, Position);
    if (!pos) return null;
    return { x: pos.x, y: pos.y, z: pos.z };
  }

  private applyRegionLighting(): void {
    if (!this.currentRegion?.mapData.lighting) {
      return;
    }

    const lighting = this.currentRegion.mapData.lighting;

    // Apply background color
    this.scene.background = new THREE.Color(lighting.backgroundColor);

    // Apply fog
    if (lighting.fog?.enabled) {
      this.scene.fog = new THREE.FogExp2(lighting.fog.color, lighting.fog.density);
    } else {
      this.scene.fog = null;
    }

    // Add lights from region
    for (const light of this.currentRegion.lights) {
      this.scene.add(light);
      this.regionLights.push(light);
    }

    // Apply bloom settings if available
    const postProcessingConfig = this.currentRegion.mapData.postProcessing;
    if (postProcessingConfig?.bloom) {
      this.postProcessing.setBloomConfig(postProcessingConfig.bloom);
    }
  }

  /**
   * Create surface patch LOD entities from map data.
   * Finds meshes by name in the geometry and sets up LOD components.
   */
  private createSurfacePatchEntities(
    geometry: THREE.Group,
    patches: SurfacePatchDefinition[] | undefined,
    worldOffset: Vec3 = { x: 0, y: 0, z: 0 }
  ): number[] {
    const entities: number[] = [];

    if (!patches || patches.length === 0) {
      return entities;
    }

    console.log(`[LOD] Processing ${patches.length} surface patches`);

    for (const patchDef of patches) {
      // Find all LOD meshes by name in the loaded geometry
      const lod0Names = patchDef.lods.LOD0.meshNames;
      const lod1Names = patchDef.lods.LOD1.meshNames;

      const lod0Meshes: THREE.Object3D[] = [];
      const lod1Meshes: THREE.Object3D[] = [];

      // Find LOD0 meshes
      console.log(`[LOD]   LOD0 names: ${lod0Names.join(', ')}`);
      for (const name of lod0Names) {
        const mesh = geometry.getObjectByName(name);
        if (mesh) {
          lod0Meshes.push(mesh);
        } else {
          console.warn(`LOD0 mesh not found for patch "${patchDef.id}": ${name}`);
        }
      }

      // Find LOD1 meshes
      console.log(`[LOD]   LOD1 names: ${lod1Names.join(', ')}`);
      for (const name of lod1Names) {
        const mesh = geometry.getObjectByName(name);
        if (mesh) {
          lod1Meshes.push(mesh);
        } else {
          console.warn(`LOD1 mesh not found for patch "${patchDef.id}": ${name}`);
        }
      }

      // Log patch info
      console.log(`[LOD] Patch "${patchDef.id}" type="${patchDef.type}": LOD0=${lod0Meshes.length} meshes, LOD1=${lod1Meshes.length} meshes`);

      // Skip patches with no meshes at all
      if (lod0Meshes.length === 0 && lod1Meshes.length === 0) {
        continue;
      }

      // Create entity with LOD component
      const entity = this.world.createEntity();

      this.world.addComponent(entity, new SurfacePatchLOD(
        patchDef.id,
        patchDef.type,
        patchDef.center.x + worldOffset.x,
        patchDef.center.y + worldOffset.y,
        patchDef.center.z + worldOffset.z,
        patchDef.lodRules.switchDistance,
        patchDef.lodRules.hysteresis,
        lod0Meshes,
        lod1Meshes
      ));

      // Set initial visibility (LOD0 visible, LOD1 hidden)
      for (const mesh of lod0Meshes) {
        mesh.visible = true;
      }
      for (const mesh of lod1Meshes) {
        mesh.visible = false;
      }

      entities.push(entity);
    }

    if (entities.length > 0) {
      console.log(`Created ${entities.length} surface patch LOD entities`);
    }

    return entities;
  }

  private async createPlayer(x: number = 0, y: number = 0, z: number = 0): Promise<number> {
    const entity = this.world.createEntity();

    // Position component (slightly above ground)
    this.world.addComponent(entity, new Position(x, y + 0.75, z));

    // Velocity component
    this.world.addComponent(entity, new Velocity());

    // Player controlled component
    this.world.addComponent(entity, new PlayerControlled(5));

    // Try to load a model, fall back to cube
    let mesh: THREE.Object3D;
    try {
      mesh = await this.models.load(import.meta.env.BASE_URL + 'models/player.glb');
      mesh.name = 'player';
      mesh.castShadow = true;
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
          child.name = 'player-mesh';
        }
      });
    } catch {
      // Fallback to cube if no model exists
      const geometry = new THREE.BoxGeometry(1, 1.5, 1);
      const material = new THREE.MeshStandardMaterial({ color: 0xe07a5f });
      mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'player';
      mesh.castShadow = true;
    }

    this.world.addComponent(entity, new Renderable(mesh));

    return entity;
  }

  // Helper to spawn an entity with a loaded model
  async spawnModel(
    url: string,
    x: number = 0,
    y: number = 0,
    z: number = 0
  ): Promise<number> {
    const entity = this.world.createEntity();

    this.world.addComponent(entity, new Position(x, y, z));

    const mesh = await this.models.load(url);
    mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    this.world.addComponent(entity, new Renderable(mesh));

    return entity;
  }

  /**
   * Get NPC info from the database by ID
   */
  getNPCInfo(id: string): NPCDatabaseEntry | undefined {
    return this.npcDatabase.get(id);
  }

  private setupDefaultLighting(): void {
    // Default lighting for when no region is loaded
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);
    this.regionLights.push(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
    this.regionLights.push(directionalLight);
  }

  private onResize(container: HTMLElement): void {
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.postProcessing.setSize(container.clientWidth, container.clientHeight);
    this.camera.updateAspect(container);
  }

  onTriggerEnter(handler: TriggerHandler): void {
    this.triggerSystem.setTriggerEnterHandler(handler);
  }

  onTriggerExit(handler: TriggerHandler): void {
    this.triggerSystem.setTriggerExitHandler(handler);
  }

  onNPCClick(handler: (npcId: string, dialogueId?: string) => void): void {
    this.onNPCClickHandler = handler;
  }

  onFootstep(handler: () => void, stopHandler?: () => void): void {
    this.movementSystem.setOnFootstep(handler, stopHandler);
  }

  private handleClick(event: MouseEvent): void {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    // Cast ray from camera
    this.raycaster.setFromCamera(mouse, this.camera.getThreeCamera());

    // Check for NPC intersections
    const npcMeshes: THREE.Object3D[] = [];
    this.scene.traverse((child) => {
      if (child.name.startsWith('npc-')) {
        npcMeshes.push(child);
      }
    });

    const intersects = this.raycaster.intersectObjects(npcMeshes, true);
    if (intersects.length > 0 && intersects[0]) {
      const hit = intersects[0].object;
      // Walk up to find the mesh with npcId
      let current: THREE.Object3D | null = hit;
      while (current && !current.userData.npcId) {
        current = current.parent;
      }

      if (current && current.userData.npcId) {
        const npcId = current.userData.npcId as string;
        const entityId = current.userData.entityId as number;
        const npcComponent = this.world.getComponent<NPC>(entityId, NPC);

        console.log(`Clicked NPC: ${npcId}`);

        if (this.onNPCClickHandler) {
          this.onNPCClickHandler(npcId, npcComponent?.dialogueId);
        }
      }
    }
  }

  run(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    const animate = () => {
      requestAnimationFrame(animate);

      // Get delta time (always needed for camera smoothing)
      const delta = this.clock.getDelta();

      // Update logic when not paused
      if (!this.isPaused) {
        // Update ECS world
        this.world.update(delta);

        // Update environmental animations (lamp glow, etc.)
        this.environmentAnimation.update();

        // Update VFX particles
        this.vfxManager.update(delta);

        // Update camera target to follow player
        if (this.playerEntity >= 0) {
          const playerPos = this.world.getComponent<Position>(this.playerEntity, Position);
          if (playerPos) {
            this.camera.follow(new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z));
          }
        }
      }

      // Always update camera (for smooth interpolation even when paused)
      this.camera.update(delta);

      // Render with post-processing
      this.postProcessing.render();

      // Clear "just pressed" input state AFTER rendering (at end of frame)
      // This ensures input checks in external loops can read the state first
      this.input.endFrame();
    };

    animate();
  }

  /**
   * Pause the game (stops updates but continues rendering)
   */
  pause(): void {
    this.isPaused = true;
    this.setMovementEnabled(false);
  }

  /**
   * Resume the game
   */
  resume(): void {
    this.isPaused = false;
    this.setMovementEnabled(true);
  }

  /**
   * Check if game is paused
   */
  isPausedState(): boolean {
    return this.isPaused;
  }

  onInteract(handler: InteractionHandler): void {
    this.interactionSystem.setInteractHandler(handler);
  }

  onInspect(handler: InspectionHandler): void {
    this.interactionSystem.setInspectHandler(handler);
  }

  onResonanceInteract(handler: ResonanceHandler): void {
    this.interactionSystem.setResonanceHandler(handler);
  }

  onNearbyNPCChange(handler: (nearby: { id: string; dialogueId?: string } | null) => void): void {
    this.interactionSystem.setNearbyChangeHandler(handler);
  }

  onNearbyInteractableChange(handler: (nearby: NearbyInteractable | null) => void): void {
    this.interactionSystem.setNearbyInteractableChangeHandler(handler);
  }

  getNearbyNPC(): { id: string; dialogueId?: string } | null {
    return this.interactionSystem.getNearestNPC();
  }

  getNearbyInteractable(): NearbyInteractable | null {
    return this.interactionSystem.getNearestInteractable();
  }

  setMovementEnabled(enabled: boolean): void {
    this.input.movementEnabled = enabled;
  }

  /**
   * Consume the interact key press to prevent double-triggers.
   * Call this after dialogue ends to prevent immediately starting a new one.
   */
  consumeInteract(): void {
    this.input.consumeInteract();
  }

  /**
   * Check if journal key was just pressed (J)
   */
  isJournalPressed(): boolean {
    return this.input.isJournalPressed();
  }

  /**
   * Check if escape key was just pressed
   */
  isEscapePressed(): boolean {
    return this.input.isEscapePressed();
  }

  /**
   * Check if inventory key was just pressed (I)
   */
  isInventoryPressed(): boolean {
    return this.input.isInventoryPressed();
  }

  /**
   * Check if interact key was just pressed (E)
   */
  isInteractPressed(): boolean {
    return this.input.isInteractPressed();
  }

  /**
   * Check if gift key was just pressed (G)
   */
  isGiftPressed(): boolean {
    return this.input.isGiftPressed();
  }

  /**
   * Check if spell menu key was just pressed (C)
   */
  isSpellMenuPressed(): boolean {
    return this.input.isSpellMenuPressed();
  }

  /**
   * Set callback for when an item is picked up
   */
  onItemPickup(handler: (pickupId: string, itemId: string, quantity: number) => void): void {
    this.onItemPickupHandler = handler;
  }

  /**
   * Get nearby pickup if player is close enough
   */
  getNearbyPickup(): { id: string; itemId: string; quantity: number } | null {
    if (this.playerEntity < 0) return null;

    const playerPos = this.world.getComponent<Position>(this.playerEntity, Position);
    if (!playerPos) return null;

    const pickupRange = 1.5;

    for (const entityId of this.pickupEntities) {
      const pickup = this.world.getComponent<ItemPickup>(entityId, ItemPickup);
      const pos = this.world.getComponent<Position>(entityId, Position);

      if (!pickup || !pos || pickup.collected) continue;

      const dx = pos.x - playerPos.x;
      const dz = pos.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < pickupRange) {
        return {
          id: pickup.id,
          itemId: pickup.itemId,
          quantity: pickup.quantity
        };
      }
    }

    return null;
  }

  /**
   * Collect the nearest pickup if in range
   */
  collectNearbyPickup(): boolean {
    if (this.playerEntity < 0) return false;

    const playerPos = this.world.getComponent<Position>(this.playerEntity, Position);
    if (!playerPos) return false;

    const pickupRange = 1.5;

    for (const entityId of this.pickupEntities) {
      const pickup = this.world.getComponent<ItemPickup>(entityId, ItemPickup);
      const pos = this.world.getComponent<Position>(entityId, Position);
      const renderable = this.world.getComponent<Renderable>(entityId, Renderable);

      if (!pickup || !pos || pickup.collected) continue;

      const dx = pos.x - playerPos.x;
      const dz = pos.z - playerPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < pickupRange) {
        // Remove entity from world FIRST (prevents RenderSystem from re-adding)
        this.world.removeEntity(entityId);
        const idx = this.pickupEntities.indexOf(entityId);
        if (idx !== -1) {
          this.pickupEntities.splice(idx, 1);
        }

        // Remove and dispose mesh
        if (renderable) {
          const mesh = renderable.mesh;
          mesh.visible = false;
          this.scene.remove(mesh);

          // Dispose geometry and material to free memory
          if (mesh instanceof THREE.Mesh) {
            mesh.geometry?.dispose();
            const material = mesh.material;
            if (Array.isArray(material)) {
              material.forEach(m => m.dispose());
            } else if (material) {
              material.dispose();
            }
          }
        }

        // Fire callback with pickup ID for tracking
        if (this.onItemPickupHandler) {
          this.onItemPickupHandler(pickup.id, pickup.itemId, pickup.quantity);
        }

        return true;
      }
    }

    return false;
  }

  /**
   * Command an NPC to walk to a specific point.
   * Returns a Promise that resolves when the NPC arrives.
   */
  moveNPCTo(npcId: string, target: { x: number; y: number; z: number }): Promise<void> {
    return new Promise((resolve, reject) => {
      const npcEntity = this.findNPCEntity(npcId);
      if (npcEntity === null) {
        reject(new Error(`NPC not found: ${npcId}`));
        return;
      }

      // Get or create movement component
      let movement = this.world.getComponent<NPCMovement>(npcEntity, NPCMovement);
      if (!movement) {
        // Add movement capability to stationary NPC
        this.world.addComponent(npcEntity, new Velocity());
        movement = new NPCMovement([], 'one-way', 2);
        this.world.addComponent(npcEntity, movement);
      }

      // Set scripted target
      movement.scriptedTarget = { x: target.x, y: target.y, z: target.z };
      movement.onScriptedComplete = resolve;
      movement.isMoving = true;
    });
  }

  /**
   * Stop NPC movement (pause patrol).
   */
  stopNPC(npcId: string): void {
    const entity = this.findNPCEntity(npcId);
    if (entity === null) return;

    const movement = this.world.getComponent<NPCMovement>(entity, NPCMovement);
    if (movement) {
      movement.isMoving = false;
    }
  }

  /**
   * Resume NPC movement (resume patrol).
   */
  resumeNPC(npcId: string): void {
    const entity = this.findNPCEntity(npcId);
    if (entity === null) return;

    const movement = this.world.getComponent<NPCMovement>(entity, NPCMovement);
    if (movement) {
      movement.isMoving = true;
    }
  }

  /**
   * Find NPC entity by ID.
   */
  private findNPCEntity(npcId: string): number | null {
    for (const entityId of this.npcEntities) {
      const npc = this.world.getComponent<NPC>(entityId, NPC);
      if (npc && npc.id === npcId) {
        return entityId;
      }
    }
    return null;
  }

  // ============================================
  // LOD System
  // ============================================

  /**
   * Get current LOD system statistics.
   */
  getLODStats(): import('../systems').LODStats {
    return this.lodSystem.getStats();
  }

  /**
   * Enable or disable LOD debug visualization.
   * Shows wireframe spheres at switch distances, colored by current LOD state.
   */
  setLODDebugEnabled(enabled: boolean): void {
    this.lodSystem.setDebugEnabled(enabled);
  }

  /**
   * Check if LOD debug visualization is enabled.
   */
  isLODDebugEnabled(): boolean {
    return this.lodSystem.isDebugEnabled();
  }

  /**
   * Reset LOD statistics counters.
   */
  resetLODStats(): void {
    this.lodSystem.resetStats();
  }

  /**
   * Force all LOD patches to a specific level, or null for automatic distance-based switching.
   * Useful for debugging LOD textures.
   */
  setForcedLOD(level: 0 | 1 | null): void {
    this.lodSystem.setForcedLOD(level);
  }

  /**
   * Get the current forced LOD level (null = automatic).
   */
  getForcedLOD(): 0 | 1 | null {
    return this.lodSystem.getForcedLOD();
  }

  // ============================================
  // Save/Load Support
  // ============================================

  /**
   * Get current player position (for saving)
   */
  getPlayerPosition(): { x: number; y: number; z: number } {
    if (this.playerEntity < 0) {
      return { x: 0, y: 0, z: 0 };
    }

    const pos = this.world.getComponent<Position>(this.playerEntity, Position);
    if (!pos) {
      return { x: 0, y: 0, z: 0 };
    }

    return { x: pos.x, y: pos.y, z: pos.z };
  }

  /**
   * Get current region path (for saving)
   */
  getCurrentRegion(): string {
    return this.currentRegionPath;
  }

  /**
   * Get current region info (for debug display)
   */
  getCurrentRegionInfo(): { path: string; name?: string } | null {
    if (!this.currentRegionPath) {
      return null;
    }
    return {
      path: this.currentRegionPath,
      name: this.currentRegion?.data.name,
    };
  }

  /**
   * Register an NPC directly (for development mode)
   */
  registerNPC(id: string, name: string, dialogue?: string): void {
    this.npcDatabase.set(id, { id, name, dialogue });
  }

  /**
   * Get the player entity ID (for adding components)
   */
  getPlayerEntity(): number {
    return this.playerEntity;
  }

  // ==================== VFX Methods ====================

  /**
   * Register a VFX definition
   */
  registerVFXDefinition(definition: VFXDefinition): void {
    this.vfxManager.registerDefinition(definition);
  }

  /**
   * Get a registered VFX definition
   */
  getVFXDefinition(id: string): VFXDefinition | undefined {
    return this.vfxManager.getDefinition(id);
  }

  /**
   * Create a VFX emitter at a position
   */
  createVFXEmitter(
    vfxId: string,
    position: THREE.Vector3,
    scale?: number,
    autoPlay?: boolean
  ): Emitter | null {
    return this.vfxManager.createEmitter(vfxId, position, scale, autoPlay);
  }

  /**
   * Get a VFX emitter by ID
   */
  getVFXEmitter(id: string): Emitter | undefined {
    return this.vfxManager.getEmitter(id);
  }

  /**
   * Remove a VFX emitter
   */
  removeVFXEmitter(id: string): void {
    this.vfxManager.removeEmitter(id);
  }

  /**
   * Get the VFX manager for advanced usage
   */
  getVFXManager(): VFXManager {
    return this.vfxManager;
  }
}
