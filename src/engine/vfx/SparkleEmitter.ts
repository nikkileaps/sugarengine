/**
 * SparkleEmitter - Twinkling sparkle particle effect
 *
 * Behavior:
 * - Spawns at random positions within a volume
 * - Particles stay in place (no velocity)
 * - Visual effect is entirely from shader-based twinkling
 * - Particles pop in/out rather than fading smoothly
 */

import * as THREE from 'three';
import type { VFXDefinition } from './types';
import { ParticlePool } from './ParticlePool';

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 1, g: 1, b: 1 };
  return {
    r: parseInt(result[1]!, 16) / 255,
    g: parseInt(result[2]!, 16) / 255,
    b: parseInt(result[3]!, 16) / 255,
  };
}

// Vertex shader for sparkles - handles twinkling via time-based oscillation
const sparkleVertexShader = /* glsl */ `
  // 'position' is the standard THREE.js attribute for Points geometry
  attribute vec3 instanceData; // x = size, y = seed (for random phase), z = lifeProgress

  uniform float time;
  uniform float baseSize;
  uniform vec3 color;

  varying float vAlpha;
  varying float vTwinkle;

  // Hash function for randomness
  float hash(float n) {
    return fract(sin(n) * 43758.5453123);
  }

  void main() {
    float size = instanceData.x;
    float seed = instanceData.y;
    float life = instanceData.z;

    // Twinkle: multiple sine waves at different frequencies
    float twinkleSpeed1 = 8.0 + hash(seed) * 12.0;
    float twinkleSpeed2 = 15.0 + hash(seed + 1.0) * 10.0;
    float twinkleSpeed3 = 3.0 + hash(seed + 2.0) * 5.0;

    float phase1 = hash(seed + 3.0) * 6.28318;
    float phase2 = hash(seed + 4.0) * 6.28318;
    float phase3 = hash(seed + 5.0) * 6.28318;

    float twinkle1 = sin(time * twinkleSpeed1 + phase1) * 0.5 + 0.5;
    float twinkle2 = sin(time * twinkleSpeed2 + phase2) * 0.3 + 0.7;
    float twinkle3 = sin(time * twinkleSpeed3 + phase3) * 0.2 + 0.8;

    float twinkle = twinkle1 * twinkle2 * twinkle3;

    // Size pulses with twinkle
    float finalSize = size * baseSize * (0.3 + twinkle * 1.0);

    // Alpha: fade in at start, fade out at end, twinkle in between
    float fadeIn = smoothstep(0.0, 0.1, life);
    float fadeOut = 1.0 - smoothstep(0.8, 1.0, life);
    vAlpha = fadeIn * fadeOut * (0.5 + twinkle * 0.5);

    vTwinkle = twinkle;

    // 'position' is the built-in attribute from BufferGeometry
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = finalSize * (200.0 / -mvPosition.z);
  }
`;

// Fragment shader for sparkles - draws starburst shape
const sparkleFragmentShader = /* glsl */ `
  uniform vec3 color;

  varying float vAlpha;
  varying float vTwinkle;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float dist = length(uv);

    // Bright center
    float center = exp(-dist * dist * 50.0);

    // Cross rays (+ shape)
    float rayX = exp(-abs(uv.y) * 15.0) * exp(-abs(uv.x) * 4.0);
    float rayY = exp(-abs(uv.x) * 15.0) * exp(-abs(uv.y) * 4.0);

    // Diagonal rays (x shape) - intensity varies with twinkle
    vec2 uvRot = vec2(uv.x + uv.y, uv.x - uv.y) * 0.707;
    float rayD1 = exp(-abs(uvRot.y) * 20.0) * exp(-abs(uvRot.x) * 6.0) * vTwinkle;
    float rayD2 = exp(-abs(uvRot.x) * 20.0) * exp(-abs(uvRot.y) * 6.0) * vTwinkle;

    float shape = center + (rayX + rayY) * 0.8 + (rayD1 + rayD2) * 0.4;
    shape = clamp(shape, 0.0, 1.0);

    float alpha = vAlpha * shape;
    if (alpha < 0.01) discard;

    // Sparkles are bright white/color
    vec3 finalColor = mix(color, vec3(1.0), 0.5 + vTwinkle * 0.5);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export class SparkleEmitter {
  readonly id: string;
  readonly definition: VFXDefinition;

  private pool: ParticlePool;
  private points!: THREE.Points;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.BufferGeometry;

  private position: THREE.Vector3;
  private scale: number;
  private spawnRadius: number;

  private playing: boolean = false;
  private emissionAccumulator: number = 0;
  private elapsed: number = 0;

  private color: { r: number; g: number; b: number };

  private positionArray!: Float32Array;
  private dataArray!: Float32Array;

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
    this.spawnRadius = 0.5 * scale; // Sparkles spawn in a sphere

    this.color = hexToRgb(definition.color);

    this.pool = new ParticlePool(definition.maxParticles);
    this.createMesh(scene);
  }

  private createMesh(scene: THREE.Scene): void {
    const def = this.definition;
    const count = def.maxParticles;

    this.geometry = new THREE.BufferGeometry();

    // Position attribute (world positions)
    this.positionArray = new Float32Array(count * 3);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positionArray, 3));

    // Data attribute: size, random seed, life progress
    this.dataArray = new Float32Array(count * 3);
    this.geometry.setAttribute('instanceData', new THREE.BufferAttribute(this.dataArray, 3));

    this.material = new THREE.ShaderMaterial({
      vertexShader: sparkleVertexShader,
      fragmentShader: sparkleFragmentShader,
      uniforms: {
        time: { value: 0.0 },
        baseSize: { value: 15 * this.scale },
        color: { value: new THREE.Color(this.color.r, this.color.g, this.color.b) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  play(): void {
    this.playing = true;
    this.elapsed = 0;
    this.emissionAccumulator = 0;
  }

  stop(): void {
    this.playing = false;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  hasActiveParticles(): boolean {
    return this.pool.getActiveCount() > 0;
  }

  update(delta: number): void {
    this.elapsed += delta;

    // Update time uniform for twinkling
    if (this.material.uniforms.time) {
      this.material.uniforms.time.value = this.elapsed;
    }

    if (this.playing) {
      this.emit(delta);
    }

    this.updateParticles(delta);
    this.updateBuffers();
  }

  private emit(delta: number): void {
    const def = this.definition;

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
  }

  private spawnParticle(): void {
    const index = this.pool.acquire();
    if (index < 0) return;

    const particle = this.pool.get(index)!;
    const def = this.definition;

    particle.age = 0;
    particle.lifetime = randomRange(def.lifetime[0], def.lifetime[1]);

    // Spawn at random position within sphere
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.cbrt(Math.random()) * this.spawnRadius;

    particle.x = this.position.x + r * Math.sin(phi) * Math.cos(theta);
    particle.y = this.position.y + r * Math.sin(phi) * Math.sin(theta);
    particle.z = this.position.z + r * Math.cos(phi);

    // No velocity - sparkles stay in place
    particle.vx = 0;
    particle.vy = 0;
    particle.vz = 0;

    particle.startSize = randomRange(def.size[0], def.size[1]) * this.scale;
    particle.size = particle.startSize;

    // Random seed for twinkle phase (stored in color.r for now, repurposed)
    particle.r = Math.random() * 1000;
    particle.g = 0;
    particle.b = 0;
  }

  private updateParticles(delta: number): void {
    // Sparkles don't move - just age them
    this.pool.forEachActive((particle, index) => {
      particle.age += delta;

      if (particle.age >= particle.lifetime) {
        this.pool.release(index);
      }
    });
  }

  private updateBuffers(): void {
    let visibleCount = 0;

    this.pool.forEachActive((particle) => {
      const i = visibleCount;

      // Position (static - where particle spawned)
      this.positionArray[i * 3] = particle.x;
      this.positionArray[i * 3 + 1] = particle.y;
      this.positionArray[i * 3 + 2] = particle.z;

      // Data: size, seed, life
      const life = particle.age / particle.lifetime;
      this.dataArray[i * 3] = particle.size;
      this.dataArray[i * 3 + 1] = particle.r; // Random seed
      this.dataArray[i * 3 + 2] = life;

      visibleCount++;
    });

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('instanceData').needsUpdate = true;
    this.geometry.setDrawRange(0, visibleCount);
  }

  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
