import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export interface BloomConfig {
  enabled: boolean;
  threshold: number;
  strength: number;
  radius: number;
}

export const DEFAULT_BLOOM_CONFIG: BloomConfig = {
  enabled: false,
  threshold: 0.9,
  strength: 0.6,
  radius: 0.4,
};

export class PostProcessing {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private bloomConfig: BloomConfig;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    bloomConfig: Partial<BloomConfig> = {}
  ) {
    this.bloomConfig = { ...DEFAULT_BLOOM_CONFIG, ...bloomConfig };

    // Create composer
    this.composer = new EffectComposer(renderer);

    // Render pass - renders the scene normally (includes background)
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    // Bloom pass
    const size = renderer.getSize(new THREE.Vector2());
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      this.bloomConfig.strength,
      this.bloomConfig.radius,
      this.bloomConfig.threshold
    );
    this.bloomPass.enabled = this.bloomConfig.enabled;
    this.composer.addPass(this.bloomPass);

    // Output pass - handles color space conversion (required for proper rendering)
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
  }

  render(): void {
    this.composer.render();
  }

  setBloomConfig(config: Partial<BloomConfig>): void {
    this.bloomConfig = { ...this.bloomConfig, ...config };

    if (config.enabled !== undefined) {
      this.bloomPass.enabled = config.enabled;
    }
    if (config.threshold !== undefined) {
      this.bloomPass.threshold = config.threshold;
    }
    if (config.strength !== undefined) {
      this.bloomPass.strength = config.strength;
    }
    if (config.radius !== undefined) {
      this.bloomPass.radius = config.radius;
    }
  }

  getBloomConfig(): BloomConfig {
    return { ...this.bloomConfig };
  }

  setBloomEnabled(enabled: boolean): void {
    this.bloomConfig.enabled = enabled;
    this.bloomPass.enabled = enabled;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
  }

  dispose(): void {
    this.composer.dispose();
  }
}
