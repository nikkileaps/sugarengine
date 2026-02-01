/**
 * EnvironmentAnimation - Shader-based procedural animation for environmental effects
 *
 * Provides time-driven animation effects like:
 * - Lamp glow pulsing
 * - Candle flickering
 * - Foliage wind sway
 *
 * Meshes are tagged via region config (environmentAnimations array).
 */

import * as THREE from 'three';

export type EnvironmentAnimationType = 'lamp_glow' | 'candle_flicker' | 'wind_sway';

export interface EnvironmentAnimationEntry {
  meshName: string;
  animationType: EnvironmentAnimationType;
  intensity?: number;  // 0-1, default varies by type
  speed?: number;      // multiplier, default 1
}

export interface EnvironmentAnimationConfig {
  // Lamp glow settings
  lampGlowIntensity?: number;      // Base glow multiplier (0-1), default 0.3
  lampGlowSpeed?: number;          // Pulse speed, default 0.5
  lampGlowVariation?: number;      // How much the glow varies (0-1), default 0.2

  // Candle/fire flicker settings (future)
  candleFlickerSpeed?: number;
  candleFlickerIntensity?: number;

  // Wind settings (future)
  windStrength?: number;
  windDirection?: THREE.Vector3;
}

const DEFAULT_CONFIG: Required<EnvironmentAnimationConfig> = {
  lampGlowIntensity: 0.3,
  lampGlowSpeed: 0.5,
  lampGlowVariation: 0.2,
  candleFlickerSpeed: 3.0,
  candleFlickerIntensity: 0.5,
  windStrength: 0.4,
  windDirection: new THREE.Vector3(1, 0, 0.3).normalize(),
};

interface TrackedLight {
  light: THREE.PointLight;
  baseIntensity: number;
  speed: number;
  phaseOffset: number;
}

/**
 * Manages shader-based environmental animations
 */
export class EnvironmentAnimation {
  private config: Required<EnvironmentAnimationConfig>;
  private clock: THREE.Clock;
  private trackedMaterials: Set<THREE.Material> = new Set();
  private trackedLights: TrackedLight[] = [];

  // Uniform references for updating
  private timeUniforms: { value: number }[] = [];

  constructor(config: EnvironmentAnimationConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.clock = new THREE.Clock();
  }

  /**
   * Update configuration at runtime
   */
  setConfig(config: Partial<EnvironmentAnimationConfig>): void {
    Object.assign(this.config, config);
  }

  /**
   * Process a loaded scene/model and apply animation shaders based on entries
   * @param scene The Three.js scene or group to process
   * @param entries Animation entries from region config (optional - if not provided, no animations applied)
   * @param lights Optional array of lights to also animate (matched by sourceMeshName in userData)
   */
  processScene(scene: THREE.Object3D, entries?: EnvironmentAnimationEntry[], lights?: THREE.Light[]): void {
    console.log(`[EnvironmentAnimation] processScene called with ${entries?.length ?? 0} entries:`, entries);

    if (!entries || entries.length === 0) {
      console.log(`[EnvironmentAnimation] No animation entries for this region`);
      return;
    }

    // Build a map of mesh names to entries for quick lookup
    const entryMap = new Map<string, EnvironmentAnimationEntry>();
    for (const entry of entries) {
      if (entry.meshName) {
        entryMap.set(entry.meshName.toLowerCase(), entry);
        console.log(`[EnvironmentAnimation] Looking for mesh: "${entry.meshName.toLowerCase()}"`);
      }
    }

    let appliedCount = 0;
    const scannedMeshes: string[] = [];

    scene.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        // Check if this mesh or its material matches any entry
        const meshNameLower = (object.name || '').toLowerCase();
        scannedMeshes.push(meshNameLower);
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];

        for (let i = 0; i < materials.length; i++) {
          const material = materials[i];
          const materialNameLower = (material.name || '').toLowerCase();

          // Check mesh name first, then material name
          const entry = entryMap.get(meshNameLower) || entryMap.get(materialNameLower);

          if (entry && !this.trackedMaterials.has(material)) {
            // Clone material to ensure fresh shader compilation
            const clonedMaterial = (material as THREE.MeshStandardMaterial).clone();
            this.applyAnimation(clonedMaterial, entry);

            // Replace material on mesh
            if (Array.isArray(object.material)) {
              object.material[i] = clonedMaterial;
            } else {
              object.material = clonedMaterial;
            }
            appliedCount++;
          }
        }
      }
    });

    // Animate ALL point lights that aren't underground
    if (lights) {
      let lightCount = 0;
      for (const light of lights) {
        if (!(light instanceof THREE.PointLight)) continue;
        if (light.position.y < 0.5) continue; // Skip underground lights

        const baseIntensity = light.intensity;
        const speed = this.config.lampGlowSpeed;
        const phaseOffset = Math.random() * Math.PI * 2;

        this.trackedLights.push({ light, baseIntensity, speed, phaseOffset });
        lightCount++;
        console.log(`[EnvironmentAnimation] Tracking light at y=${light.position.y.toFixed(1)} baseIntensity=${baseIntensity}`);
      }
      if (lightCount > 0) {
        console.log(`[EnvironmentAnimation] Tracking ${lightCount} lights for animation`);
      }
    }

    console.log(`[EnvironmentAnimation] Applied ${appliedCount} material animations from ${entries.length} entries`);
    if (appliedCount === 0 && entries.length > 0) {
      console.log(`[EnvironmentAnimation] No matches found! Scene meshes:`, scannedMeshes.slice(0, 20));
    }
  }

  /**
   * Apply the appropriate animation based on entry type
   */
  private applyAnimation(material: THREE.MeshStandardMaterial, entry: EnvironmentAnimationEntry): void {
    switch (entry.animationType) {
      case 'lamp_glow':
        console.log(`[EnvironmentAnimation] Applying lamp glow to: ${material.name}`);
        this.applyLampGlow(material, entry.intensity, entry.speed);
        break;
      case 'candle_flicker':
        console.log(`[EnvironmentAnimation] Candle flicker not yet implemented: ${material.name}`);
        // TODO: Implement candle flicker
        break;
      case 'wind_sway':
        console.log(`[EnvironmentAnimation] Wind sway not yet implemented: ${material.name}`);
        // TODO: Implement wind sway
        break;
    }
  }

  /**
   * Apply soft pulsing glow effect to lamp materials
   * @param material The material to apply the effect to
   * @param intensityOverride Optional intensity override (0-1)
   * @param speedOverride Optional speed multiplier
   */
  private applyLampGlow(
    material: THREE.MeshStandardMaterial,
    intensityOverride?: number,
    speedOverride?: number
  ): void {
    if (!material.isMeshStandardMaterial) return;

    // Use overrides or defaults
    const intensity = intensityOverride ?? this.config.lampGlowIntensity;
    const speed = (speedOverride ?? 1) * this.config.lampGlowSpeed;

    // Store original emissive intensity for shader uniform
    const originalEmissiveIntensity = material.emissiveIntensity;

    // Random phase offset so lamps don't pulse in sync
    const phaseOffset = Math.random() * Math.PI * 2;

    // Create time uniform for this material
    const timeUniform = { value: 0 };
    this.timeUniforms.push(timeUniform);

    // Generate unique cache key to force shader recompilation
    const cacheKey = `lamp_glow_${this.trackedMaterials.size}_${intensity}_${speed}_${phaseOffset}`;
    material.customProgramCacheKey = () => cacheKey;

    // Inject custom shader code
    material.onBeforeCompile = (shader) => {
      console.log(`[EnvironmentAnimation] Shader compiling for lamp glow, emissiveIntensity=${originalEmissiveIntensity}`);

      // Add uniforms
      shader.uniforms.uTime = timeUniform;
      shader.uniforms.uGlowIntensity = { value: intensity };
      shader.uniforms.uGlowSpeed = { value: speed };
      shader.uniforms.uGlowVariation = { value: this.config.lampGlowVariation };
      shader.uniforms.uBaseEmissiveIntensity = { value: originalEmissiveIntensity };
      shader.uniforms.uPhaseOffset = { value: phaseOffset };

      // Inject uniform declarations into fragment shader
      shader.fragmentShader = `
        uniform float uTime;
        uniform float uGlowIntensity;
        uniform float uGlowSpeed;
        uniform float uGlowVariation;
        uniform float uBaseEmissiveIntensity;
        uniform float uPhaseOffset;
      ` + shader.fragmentShader;

      // Replace emissive calculation in fragment shader
      // The standard material has: totalEmissiveRadiance = emissive;
      // We want to modulate this with a time-based pulse
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `
        #include <emissivemap_fragment>

        // Pulsing glow effect with phase offset
        float glowPulse = sin(uTime * uGlowSpeed * 3.0 + uPhaseOffset) * 0.5 + 0.5;
        // Pulse between 1x and 3x brightness
        float glowMultiplier = 1.0 + glowPulse * 2.0;
        totalEmissiveRadiance *= glowMultiplier;
        `
      );
    };

    // Mark material as needing recompilation
    material.needsUpdate = true;
    this.trackedMaterials.add(material);
  }

  /**
   * Update all animated materials and lights - call this each frame
   */
  update(): void {
    const elapsed = this.clock.getElapsedTime();

    // Update all time uniforms for shader animations
    for (const uniform of this.timeUniforms) {
      uniform.value = elapsed;
    }

    // Update light intensities
    for (const tracked of this.trackedLights) {
      // Base pulse
      const pulse = Math.sin(elapsed * tracked.speed * 3.0 + tracked.phaseOffset) * 0.5 + 0.5;
      // Subtle variation to break up the pulsing
      const flicker = (Math.random() - 0.5) * 0.1;
      // Combine: base brightness + gentle pulse + subtle flicker
      const multiplier = 1.0 + pulse * 0.5 + flicker;
      tracked.light.intensity = tracked.baseIntensity * multiplier;
    }
  }

  /**
   * Clean up tracked materials and lights
   */
  dispose(): void {
    this.trackedMaterials.clear();
    this.timeUniforms.length = 0;
    this.trackedLights.length = 0;
  }
}
