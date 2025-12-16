import * as THREE from 'three';
import { ModelLoader } from './ModelLoader';

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
  dialogue?: string;
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

export interface RegionData {
  version: number;
  name: string;
  playerSpawn: Vec3;
  lighting?: LightingDefinition;
  postProcessing?: PostProcessingDefinition;
  npcs: NPCDefinition[];
  triggers: TriggerDefinition[];
  pickups?: PickupDefinition[];
  inspectables?: InspectableDefinition[];
}

export interface LoadedRegion {
  data: RegionData;
  geometry: THREE.Group;
  lights: THREE.Light[];
}

export class RegionLoader {
  constructor(private modelLoader: ModelLoader) {}

  async load(regionPath: string): Promise<LoadedRegion> {
    // Normalize path (ensure trailing slash)
    const basePath = regionPath.endsWith('/') ? regionPath : `${regionPath}/`;

    // Load map.json and geometry.glb in parallel
    const [data, geometry] = await Promise.all([
      this.loadMapData(`${basePath}map.json`),
      this.modelLoader.load(`${basePath}geometry.glb`)
    ]);

    // Set up geometry for receiving shadows, etc.
    geometry.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.receiveShadow = true;
        child.castShadow = true;
      }
    });

    // Create lights from definition
    const lights = data.lighting ? this.createLights(data.lighting) : [];

    return { data, geometry, lights };
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

  private async loadMapData(url: string): Promise<RegionData> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load region data: ${url}`);
    }
    return response.json();
  }
}
