/**
 * VFXManager - Orchestrates particle emitters
 */

import * as THREE from 'three';
import type { VFXDefinition } from './types';
import { ParticlePool } from './ParticlePool';
import {
  particleVertexShader,
  particleFragmentShader,
  pointsVertexShader,
  pointsFragmentShader,
} from './shaders';

/**
 * Parse hex color to RGB (0-1 range)
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 1, g: 1, b: 1 };
  return {
    r: parseInt(result[1]!, 16) / 255,
    g: parseInt(result[2]!, 16) / 255,
    b: parseInt(result[3]!, 16) / 255,
  };
}

/**
 * Random number in range [min, max]
 */
function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Single particle emitter instance
 */
export class EmitterInstance {
  readonly id: string;
  readonly definition: VFXDefinition;

  private pool: ParticlePool;
  private mesh!: THREE.Points | THREE.Mesh;
  private material!: THREE.ShaderMaterial;

  private position: THREE.Vector3;
  private scale: number;

  private playing: boolean = false;
  private emissionAccumulator: number = 0;
  private burstAccumulator: number = 0;
  private elapsed: number = 0;

  // Cached colors
  private startColor: { r: number; g: number; b: number };
  private endColor: { r: number; g: number; b: number };

  // Attribute arrays
  private positionArray!: Float32Array;
  private colorArray!: Float32Array;
  private dataArray!: Float32Array; // size, life

  constructor(
    id: string,
    definition: VFXDefinition,
    scene: THREE.Scene,
    position: THREE.Vector3 = new THREE.Vector3(),
    scale: number = 1
  ) {
    this.id = id;
    this.definition = definition;
    this.position = position.clone();
    this.scale = scale;

    // Parse colors
    this.startColor = hexToRgb(definition.color);
    this.endColor = definition.colorEnd
      ? hexToRgb(definition.colorEnd)
      : this.startColor;

    // Create particle pool
    this.pool = new ParticlePool(definition.maxParticles);

    // Create geometry and material based on type
    if (definition.geometry === 'point') {
      this.createPointsSystem(scene);
    } else {
      this.createInstancedSystem(scene);
    }
  }

  /**
   * Create a THREE.Points-based system
   */
  private createPointsSystem(scene: THREE.Scene): void {
    const def = this.definition;
    const count = def.maxParticles;

    // Create geometry with position for each particle
    const geometry = new THREE.BufferGeometry();

    // Position attribute (will be updated each frame)
    this.positionArray = new Float32Array(count * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3));

    // Instance attributes
    const sizeArray = new Float32Array(count);
    this.colorArray = new Float32Array(count * 3);
    const lifeArray = new Float32Array(count);

    geometry.setAttribute('instanceSize', new THREE.BufferAttribute(sizeArray, 1));
    geometry.setAttribute('instanceColor', new THREE.BufferAttribute(this.colorArray, 3));
    geometry.setAttribute('instanceLife', new THREE.BufferAttribute(lifeArray, 1));

    // Store data array reference
    this.dataArray = lifeArray;

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      vertexShader: pointsVertexShader,
      fragmentShader: pointsFragmentShader,
      uniforms: {
        sizeOverLife: { value: def.sizeOverLife ?? 1.0 },
        colorEnd: { value: new THREE.Color(this.endColor.r, this.endColor.g, this.endColor.b) },
        opacity: { value: def.opacity ?? 1.0 },
        baseSize: { value: 50 * this.scale },
      },
      transparent: true,
      depthWrite: false,
      blending: def.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.mesh = new THREE.Points(geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /**
   * Create an InstancedMesh-based system
   */
  private createInstancedSystem(scene: THREE.Scene): void {
    const def = this.definition;
    const count = def.maxParticles;

    // Create base geometry (quad for billboarding)
    const baseGeometry = new THREE.PlaneGeometry(1, 1);

    // Instance attributes
    this.positionArray = new Float32Array(count * 3);
    this.colorArray = new Float32Array(count * 3);
    this.dataArray = new Float32Array(count * 2); // size, life

    const instancedGeometry = new THREE.InstancedBufferGeometry();
    instancedGeometry.index = baseGeometry.index;
    instancedGeometry.attributes.position = baseGeometry.attributes.position!;
    instancedGeometry.attributes.uv = baseGeometry.attributes.uv!;

    instancedGeometry.setAttribute(
      'instancePosition',
      new THREE.InstancedBufferAttribute(this.positionArray, 3)
    );
    instancedGeometry.setAttribute(
      'instanceColor',
      new THREE.InstancedBufferAttribute(this.colorArray, 3)
    );
    instancedGeometry.setAttribute(
      'instanceData',
      new THREE.InstancedBufferAttribute(this.dataArray, 2)
    );

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      uniforms: {
        sizeOverLife: { value: def.sizeOverLife ?? 1.0 },
        colorEnd: { value: new THREE.Color(this.endColor.r, this.endColor.g, this.endColor.b) },
        opacity: { value: def.opacity ?? 1.0 },
        useCircle: { value: def.geometry === 'spark' },
      },
      transparent: true,
      depthWrite: false,
      blending: def.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(instancedGeometry, this.material) as unknown as THREE.InstancedMesh;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /**
   * Start emitting particles
   */
  play(): void {
    this.playing = true;
    this.elapsed = 0;
    this.emissionAccumulator = 0;
    this.burstAccumulator = 0;
  }

  /**
   * Stop emitting (existing particles continue)
   */
  stop(): void {
    this.playing = false;
  }

  /**
   * Check if playing
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Check if has any active particles
   */
  hasActiveParticles(): boolean {
    return this.pool.getActiveCount() > 0;
  }

  /**
   * Update particles
   */
  update(delta: number): void {
    this.elapsed += delta;

    // Emit new particles if playing
    if (this.playing) {
      this.emit(delta);
    }

    // Update all active particles
    this.updateParticles(delta);

    // Update GPU buffers
    this.updateBuffers();
  }

  /**
   * Emit particles based on emission rate
   */
  private emit(delta: number): void {
    const def = this.definition;

    // Check duration for non-looping effects
    if (!def.loop && def.duration && this.elapsed >= def.duration) {
      this.playing = false;
      return;
    }

    // Continuous emission
    this.emissionAccumulator += def.emissionRate * delta;
    while (this.emissionAccumulator >= 1) {
      this.spawnParticle();
      this.emissionAccumulator -= 1;
    }

    // Burst emission
    if (def.burst) {
      this.burstAccumulator += delta;
      if (this.burstAccumulator >= def.burst.interval) {
        for (let i = 0; i < def.burst.count; i++) {
          this.spawnParticle();
        }
        this.burstAccumulator = 0;
      }
    }
  }

  /**
   * Spawn a single particle
   */
  private spawnParticle(): void {
    const index = this.pool.acquire();
    if (index < 0) return; // Pool exhausted

    const particle = this.pool.get(index)!;
    const def = this.definition;

    // Initialize particle state
    particle.age = 0;
    particle.lifetime = randomRange(def.lifetime[0], def.lifetime[1]);

    // Position at emitter location
    particle.x = this.position.x;
    particle.y = this.position.y;
    particle.z = this.position.z;

    // Calculate velocity based on direction and spread
    const speed = randomRange(def.speed[0], def.speed[1]) * this.scale;
    const dir = new THREE.Vector3(def.direction.x, def.direction.y, def.direction.z).normalize();

    if (def.spread > 0) {
      // Apply random spread within cone
      const spreadRad = (def.spread * Math.PI) / 180;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * spreadRad;

      // Create random direction within cone
      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);

      // Rotate around the main direction
      const perpX = new THREE.Vector3(1, 0, 0);
      const perpY = new THREE.Vector3(0, 1, 0);
      const perp = Math.abs(dir.dot(perpX)) < 0.9 ? perpX : perpY;
      const tangent = new THREE.Vector3().crossVectors(dir, perp).normalize();
      const bitangent = new THREE.Vector3().crossVectors(dir, tangent);

      dir.multiplyScalar(cosPhi);
      dir.addScaledVector(tangent, sinPhi * cosTheta);
      dir.addScaledVector(bitangent, sinPhi * sinTheta);
      dir.normalize();
    }

    particle.vx = dir.x * speed;
    particle.vy = dir.y * speed;
    particle.vz = dir.z * speed;

    // Size
    particle.startSize = randomRange(def.size[0], def.size[1]) * this.scale;
    particle.size = particle.startSize;

    // Color (start color)
    particle.r = this.startColor.r;
    particle.g = this.startColor.g;
    particle.b = this.startColor.b;
  }

  /**
   * Update all active particles
   */
  private updateParticles(delta: number): void {
    const def = this.definition;
    const gravity = def.gravity * 9.8 * this.scale; // Scale gravity

    this.pool.forEachActive((particle, index) => {
      // Age particle
      particle.age += delta;

      // Check if dead
      if (particle.age >= particle.lifetime) {
        this.pool.release(index);
        return;
      }

      // Apply gravity
      particle.vy -= gravity * delta;

      // Update position
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.z += particle.vz * delta;
    });
  }

  /**
   * Update GPU attribute buffers
   */
  private updateBuffers(): void {
    const geometry = this.mesh.geometry as THREE.BufferGeometry;
    const isPoints = this.definition.geometry === 'point';

    let visibleCount = 0;

    this.pool.forEachActive((particle, _index) => {
      const i = visibleCount;

      // Position
      this.positionArray[i * 3] = particle.x;
      this.positionArray[i * 3 + 1] = particle.y;
      this.positionArray[i * 3 + 2] = particle.z;

      // Color
      this.colorArray[i * 3] = particle.r;
      this.colorArray[i * 3 + 1] = particle.g;
      this.colorArray[i * 3 + 2] = particle.b;

      // Life progress (0-1)
      const life = particle.age / particle.lifetime;

      if (isPoints) {
        // Points: separate size and life attributes
        const sizeAttr = geometry.getAttribute('instanceSize') as THREE.BufferAttribute;
        sizeAttr.array[i] = particle.size;

        const lifeAttr = geometry.getAttribute('instanceLife') as THREE.BufferAttribute;
        lifeAttr.array[i] = life;
      } else {
        // Instanced: combined data attribute
        this.dataArray[i * 2] = particle.size;
        this.dataArray[i * 2 + 1] = life;
      }

      visibleCount++;
    });

    // Mark attributes for update
    geometry.getAttribute('position').needsUpdate = true;

    if (isPoints) {
      geometry.getAttribute('instanceSize').needsUpdate = true;
      geometry.getAttribute('instanceColor').needsUpdate = true;
      geometry.getAttribute('instanceLife').needsUpdate = true;
      geometry.setDrawRange(0, visibleCount);
    } else {
      geometry.getAttribute('instancePosition').needsUpdate = true;
      geometry.getAttribute('instanceColor').needsUpdate = true;
      geometry.getAttribute('instanceData').needsUpdate = true;
      (geometry as THREE.InstancedBufferGeometry).instanceCount = visibleCount;
    }
  }

  /**
   * Set emitter position
   */
  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
  }

  /**
   * Get emitter position
   */
  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  /**
   * Dispose of resources
   */
  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * VFXManager - Central manager for all particle effects
 */
export class VFXManager {
  private scene: THREE.Scene;
  private definitions: Map<string, VFXDefinition> = new Map();
  private emitters: Map<string, EmitterInstance> = new Map();
  private emitterIdCounter: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /**
   * Register a VFX definition
   */
  registerDefinition(definition: VFXDefinition): void {
    this.definitions.set(definition.id, definition);
  }

  /**
   * Get a registered definition
   */
  getDefinition(id: string): VFXDefinition | undefined {
    return this.definitions.get(id);
  }

  /**
   * Get all registered definitions
   */
  getAllDefinitions(): VFXDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Clear all definitions
   */
  clearDefinitions(): void {
    this.definitions.clear();
  }

  /**
   * Create an emitter instance
   */
  createEmitter(
    vfxId: string,
    position: THREE.Vector3 = new THREE.Vector3(),
    scale: number = 1,
    autoPlay: boolean = true
  ): EmitterInstance | null {
    const definition = this.definitions.get(vfxId);
    if (!definition) {
      console.warn(`[VFXManager] Unknown VFX definition: ${vfxId}`);
      return null;
    }

    const id = `emitter-${this.emitterIdCounter++}`;
    const emitter = new EmitterInstance(id, definition, this.scene, position, scale);

    this.emitters.set(id, emitter);

    if (autoPlay) {
      emitter.play();
    }

    return emitter;
  }

  /**
   * Get an emitter by ID
   */
  getEmitter(id: string): EmitterInstance | undefined {
    return this.emitters.get(id);
  }

  /**
   * Remove an emitter
   */
  removeEmitter(id: string): void {
    const emitter = this.emitters.get(id);
    if (emitter) {
      emitter.dispose(this.scene);
      this.emitters.delete(id);
    }
  }

  /**
   * Update all emitters
   */
  update(delta: number): void {
    // Update all emitters
    for (const emitter of this.emitters.values()) {
      emitter.update(delta);
    }

    // Clean up finished non-looping emitters
    for (const [id, emitter] of this.emitters) {
      if (!emitter.isPlaying() && !emitter.hasActiveParticles()) {
        if (!emitter.definition.loop) {
          this.removeEmitter(id);
        }
      }
    }
  }

  /**
   * Dispose all emitters
   */
  dispose(): void {
    for (const [id] of this.emitters) {
      this.removeEmitter(id);
    }
  }
}
