import * as THREE from 'three';
import { ModelLoader } from './ModelLoader';
import type { EnvironmentAnimationEntry } from '../shaders';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface WaypointDefinition {
  x: number;
  y: number;
  z: number;
  pause?: number; // seconds to pause at this waypoint
}

export interface NPCMovementDefinition {
  waypoints: WaypointDefinition[];
  behavior: 'patrol' | 'ping-pong' | 'one-way';
  speed?: number; // Default: 2
  startPaused?: boolean; // Default: false
}

export interface NPCDefinition {
  id: string;
  position: Vec3;
  movement?: NPCMovementDefinition;
}

export interface TriggerDefinition {
  id: string;
  type: 'box';
  bounds: {
    min: [number, number, number];
    max: [number, number, number];
  };
  event: {
    type: string;
    target?: string;
    [key: string]: unknown;
  };
}

export interface PickupDefinition {
  id: string;
  itemId: string;
  position: Vec3;
  quantity?: number;
}

export interface InspectableDefinition {
  id: string;
  position: Vec3;
  inspectionId: string;
  promptText?: string;
}

export interface ResonancePointDefinition {
  id: string;
  resonancePointId: string;         // References ResonancePointData.id
  position: Vec3;
  promptText?: string;              // Custom "Press E to..." text
}

export interface RegionAvailability {
  fromEpisode?: string;   // First episode this region is accessible
  untilEpisode?: string;  // Last episode (for temporary areas)
}

/**
 * Grid position for region placement in the world.
 * Grid (0,0) is centered at world origin.
 */
export interface GridPosition {
  x: number;  // Grid cell X coordinate
  z: number;  // Grid cell Z coordinate
}

/**
 * Configuration for region streaming (set once per project).
 */
export interface RegionStreamingConfig {
  regionSize: number;       // Width/depth in world units (e.g., 64)
  streamingDistance: number; // In grid cells (e.g., 2 = load current + 2 cells in each direction)
}

/**
 * Reference to geometry exported from Sugarbuilder.
 * Points to public/regions/{path}/ which contains geometry.glb and map.json.
 */
export interface RegionGeometry {
  path: string;      // "cafe-nollie" -> public/regions/cafe-nollie/
  version?: number;  // Export version from Sugarbuilder
}

/**
 * Data loaded from Sugarbuilder's map.json (read-only, visual/rendering only).
 */
export interface SugarbuilderMapData {
  version: number;
  lighting?: LightingDefinition;
  postProcessing?: PostProcessingDefinition;
  surfacePatches?: SurfacePatchDefinition[];
}

export interface LightDefinition {
  type: 'hemisphere' | 'directional' | 'ambient' | 'point';
  color: number;
  intensity: number;
  // Hemisphere specific
  groundColor?: number;
  // Directional/Point specific
  position?: Vec3;
  // Shadow settings (directional)
  castShadow?: boolean;
  shadowMapSize?: number;
  shadowCameraNear?: number;
  shadowCameraFar?: number;
  shadowCameraSize?: number;
}

export interface FogDefinition {
  enabled: boolean;
  color: number;
  density: number;
}

export interface LightingAdjustments {
  ambientIntensity: number;
  keyIntensity: number;
  shadowDarkness: number;
  warmth: number;
}

export interface LightingDefinition {
  preset: string;
  backgroundColor: number;
  lights: LightDefinition[];
  fog: FogDefinition;
  adjustments: LightingAdjustments;
}

export interface BloomDefinition {
  enabled: boolean;
  threshold: number;
  strength: number;
  radius: number;
}

export interface PostProcessingDefinition {
  bloom?: BloomDefinition;
}

/**
 * LOD rules for surface patches (from SugarBuilder ADR-041/042)
 */
export interface SurfacePatchLODRules {
  mode: 'distance_to_player';
  switchDistance: number;  // Distance in meters to switch from LOD0 to LOD1
  hysteresis: number;      // Buffer zone to prevent flip-flopping
}

/**
 * LOD mesh references for a surface patch
 */
export interface SurfacePatchLODs {
  LOD0: { meshNames: string[] };  // High-detail mesh names in GLB
  LOD1: { meshNames: string[] };  // Low-detail mesh names in GLB
}

/**
 * Surface patch definition from SugarBuilder export
 */
export interface SurfacePatchDefinition {
  id: string;
  type: string;  // e.g., 'wall_brick', 'ground_cobblestone'
  center: Vec3;  // World-space center for distance calculations
  lodRules: SurfacePatchLODRules;
  lods: SurfacePatchLODs;
}

/**
 * Region data managed by Sugar Engine (stored in project file).
 * References Sugarbuilder geometry, defines game logic (spawns, player start).
 */
export interface RegionData {
  id: string;                    // UUID for region identification
  name: string;                  // Display name
  geometry: RegionGeometry;      // Reference to Sugarbuilder export
  gridPosition: GridPosition;    // Position in world grid (grid 0,0 centered at origin)
  playerSpawn: Vec3;             // Local coordinates within region (0 to regionSize)
  npcs: NPCDefinition[];
  triggers: TriggerDefinition[];
  pickups?: PickupDefinition[];
  inspectables?: InspectableDefinition[];
  resonancePoints?: ResonancePointDefinition[];
  environmentAnimations?: EnvironmentAnimationEntry[];
  availability?: RegionAvailability;
}

export interface LoadedRegion {
  data: RegionData;
  mapData: SugarbuilderMapData;  // Loaded from map.json (lighting, etc.)
  geometry: THREE.Group;
  lights: THREE.Light[];
}

export class RegionLoader {
  constructor(private modelLoader: ModelLoader) {}

  /**
   * Load a region using RegionData from Sugar Engine.
   * Loads geometry and map.json from the path specified in RegionData.geometry.
   */
  async load(regionData: RegionData): Promise<LoadedRegion> {
    const basePath = `${import.meta.env.BASE_URL}regions/${regionData.geometry.path}/`;

    // Load map.json and geometry.glb in parallel
    const [mapData, geometry] = await Promise.all([
      this.loadMapData(`${basePath}map.json`),
      this.modelLoader.load(`${basePath}geometry.glb`)
    ]);

    // Set up geometry for shadows
    geometry.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });

    // Create lights from Sugarbuilder's lighting definition
    const lights = mapData.lighting ? this.createLights(mapData.lighting) : [];

    // Auto-create point lights from emissive materials in the geometry
    const emissiveLights = this.createLightsFromEmissiveMaterials(geometry);
    lights.push(...emissiveLights);

    return { data: regionData, mapData, geometry, lights };
  }

  private createLights(lighting: LightingDefinition): THREE.Light[] {
    const lights: THREE.Light[] = [];

    for (const def of lighting.lights) {
      const light = this.createLight(def, lighting.adjustments);
      if (light) {
        lights.push(light);
      }
    }

    return lights;
  }

  private createLight(def: LightDefinition, adjustments: LightingAdjustments): THREE.Light | null {
    switch (def.type) {
      case 'hemisphere': {
        const light = new THREE.HemisphereLight(
          def.color,
          def.groundColor ?? 0x444444,
          def.intensity * adjustments.ambientIntensity
        );
        return light;
      }

      case 'directional': {
        const light = new THREE.DirectionalLight(
          def.color,
          def.intensity * adjustments.keyIntensity
        );

        if (def.position) {
          light.position.set(def.position.x, def.position.y, def.position.z);
        }

        if (def.castShadow) {
          light.castShadow = true;
          light.shadow.mapSize.width = def.shadowMapSize ?? 2048;
          light.shadow.mapSize.height = def.shadowMapSize ?? 2048;
          light.shadow.camera.near = def.shadowCameraNear ?? 0.5;
          light.shadow.camera.far = def.shadowCameraFar ?? 50;

          const size = def.shadowCameraSize ?? 20;
          light.shadow.camera.left = -size;
          light.shadow.camera.right = size;
          light.shadow.camera.top = size;
          light.shadow.camera.bottom = -size;

          // Shadow darkness is handled via shadow.opacity or material adjustments
          light.shadow.bias = -0.0001;
        }

        return light;
      }

      case 'ambient': {
        const light = new THREE.AmbientLight(
          def.color,
          def.intensity * adjustments.ambientIntensity
        );
        return light;
      }

      case 'point': {
        const light = new THREE.PointLight(def.color, def.intensity);
        if (def.position) {
          light.position.set(def.position.x, def.position.y, def.position.z);
        }
        if (def.castShadow) {
          light.castShadow = true;
        }
        return light;
      }

      default:
        console.warn(`Unknown light type: ${def.type}`);
        return null;
    }
  }

  private createLightsFromEmissiveMaterials(geometry: THREE.Group): THREE.Light[] {
    const lights: THREE.Light[] = [];

    geometry.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const materials = Array.isArray(child.material) ? child.material : [child.material];

      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;

        // Check if material has emissive color (non-black)
        const emissive = material.emissive;
        if (!emissive || (emissive.r === 0 && emissive.g === 0 && emissive.b === 0)) continue;

        // Get world position of the mesh
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);

        // Calculate intensity from emissive intensity and color brightness
        const brightness = (emissive.r + emissive.g + emissive.b) / 3;
        const intensity = (material.emissiveIntensity ?? 1) * brightness * 2;

        // Create point light at mesh position
        const light = new THREE.PointLight(emissive.getHex(), intensity, 8, 1);
        light.position.copy(worldPos);

        // Tag light with source mesh name for animation system
        light.userData.sourceMeshName = child.name;
        light.userData.baseIntensity = intensity;

        // TODO: Remove this filter once Sugarbuilder export is fixed to not export
        // stray emissive meshes under the ground
        if (worldPos.y < 0.5) {
          console.log(`Skipping underground emissive light from mesh "${child.name}" at y=${worldPos.y.toFixed(2)}`);
          continue;
        }

        lights.push(light);

        console.log(`Created point light from emissive mesh "${child.name}" at (${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)})`);
      }
    });

    if (lights.length > 0) {
      console.log(`Created ${lights.length} lights from emissive materials`);
    }

    return lights;
  }

  private async loadMapData(url: string): Promise<SugarbuilderMapData> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load region map data: ${url}`);
    }
    return response.json();
  }
}
