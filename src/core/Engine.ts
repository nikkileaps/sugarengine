import * as THREE from 'three';
import { World } from '../ecs';
import { Position, Velocity, Renderable, PlayerControlled, TriggerZone, NPC } from '../components';
import { MovementSystem, RenderSystem, TriggerSystem, TriggerHandler } from '../systems';
import { ModelLoader, RegionLoader, LoadedRegion } from '../loaders';
import { IsometricCamera } from './IsometricCamera';
import { InputManager } from './InputManager';
import { PostProcessing } from './PostProcessing';

export interface CameraConfig {
  style: 'isometric';
  zoom: {
    min: number;
    max: number;
    default: number;
  };
}

export interface EngineConfig {
  container: HTMLElement;
  camera: CameraConfig;
}

export class SugarEngine {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: IsometricCamera;
  private input: InputManager;
  private clock: THREE.Clock;
  private postProcessing: PostProcessing;
  private playerEntity: number = -1;
  private currentRegion: LoadedRegion | null = null;
  private regionLights: THREE.Light[] = [];
  private triggerEntities: number[] = [];
  private npcEntities: number[] = [];
  private triggerSystem: TriggerSystem;
  private raycaster: THREE.Raycaster;
  private onNPCClickHandler: ((npcId: string, dialogueId?: string) => void) | null = null;

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
    this.camera = new IsometricCamera(config.camera.zoom, config.container);

    // Post-processing (handles rendering with proper color space)
    this.postProcessing = new PostProcessing(
      this.renderer,
      this.scene,
      this.camera.camera
    );

    // Input
    this.input = new InputManager();

    // Loaders
    this.models = new ModelLoader();
    this.regions = new RegionLoader(this.models);

    // ECS World
    this.world = new World();

    // Register systems
    this.world.addSystem(new MovementSystem(this.input));
    this.world.addSystem(new RenderSystem(this.scene));
    this.triggerSystem = new TriggerSystem();
    this.world.addSystem(this.triggerSystem);

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

    // Default lighting (will be replaced by region lighting)
    this.setupDefaultLighting();

    // Handle resize
    window.addEventListener('resize', () => this.onResize(config.container));

    // Raycaster for click detection
    this.raycaster = new THREE.Raycaster();

    // Click handler for NPC interaction
    this.renderer.domElement.addEventListener('click', (event) => this.handleClick(event));
  }

  async loadRegion(regionPath: string, spawnOverride?: { x: number; y: number; z: number }): Promise<void> {
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

    // Remove old NPC entities
    for (const entityId of this.npcEntities) {
      this.world.removeEntity(entityId);
    }
    this.npcEntities = [];

    // Load new region
    this.currentRegion = await this.regions.load(regionPath);

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

      // NPC data
      this.world.addComponent(entity, new NPC(
        npcDef.id,
        npcDef.id, // Use ID as name for now
        npcDef.dialogue
      ));

      // Placeholder mesh (capsule like player but different color)
      const geometry = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
      const material = new THREE.MeshStandardMaterial({ color: 0x88ff88 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.position.set(npcDef.position.x, npcDef.position.y + 0.7, npcDef.position.z);
      mesh.name = `npc-${npcDef.id}`;
      mesh.userData.npcId = npcDef.id;
      mesh.userData.entityId = entity;
      this.scene.add(mesh);

      this.world.addComponent(entity, new Renderable(mesh));
      this.npcEntities.push(entity);
    }
    if (this.currentRegion.data.npcs.length > 0) {
      console.log(`Loaded ${this.currentRegion.data.npcs.length} NPCs`);
    }

    // Add geometry to scene
    this.scene.add(this.currentRegion.geometry);

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

  private applyRegionLighting(): void {
    if (!this.currentRegion?.data.lighting) {
      return;
    }

    const lighting = this.currentRegion.data.lighting;

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
    const postProcessingConfig = this.currentRegion.data.postProcessing;
    if (postProcessingConfig?.bloom) {
      this.postProcessing.setBloomConfig(postProcessingConfig.bloom);
    }
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
      mesh = await this.models.load('/models/player.glb');
      mesh.castShadow = true;
      mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.castShadow = true;
        }
      });
    } catch {
      // Fallback to cube if no model exists
      const geometry = new THREE.BoxGeometry(1, 1.5, 1);
      const material = new THREE.MeshStandardMaterial({ color: 0xe07a5f });
      mesh = new THREE.Mesh(geometry, material);
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

  private handleClick(event: MouseEvent): void {
    // Convert mouse position to normalized device coordinates (-1 to +1)
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    // Cast ray from camera
    this.raycaster.setFromCamera(mouse, this.camera.camera);

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
    const animate = () => {
      requestAnimationFrame(animate);

      const delta = this.clock.getDelta();

      // Update ECS world
      this.world.update(delta);

      // Update camera to follow player
      if (this.playerEntity >= 0) {
        const playerPos = this.world.getComponent<Position>(this.playerEntity, Position);
        if (playerPos) {
          this.camera.follow(new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z));
        }
      }

      // Render with post-processing
      this.postProcessing.render();
    };

    animate();
  }
}
