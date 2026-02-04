/**
 * FlameEmitter - Fire/smoke particle effect
 *
 * Behavior:
 * - Emits from a point source
 * - Particles have velocity and are affected by gravity
 * - Particles rise, spread, and fade out
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

// Vertex shader for flame particles (billboarded quads)
const flameVertexShader = /* glsl */ `
  attribute vec3 instancePosition;
  attribute vec3 instanceColor;
  attribute vec2 instanceData; // x = size, y = lifeProgress

  uniform float sizeOverLife;
  uniform vec3 colorEnd;
  uniform float opacity;

  varying vec3 vColor;
  varying float vAlpha;
  varying vec2 vUv;

  void main() {
    float size = instanceData.x;
    float life = instanceData.y;

    // Size shrinks over lifetime
    float sizeMultiplier = mix(1.0, sizeOverLife, life);
    float finalSize = size * sizeMultiplier;

    // Color gradient over lifetime
    vColor = mix(instanceColor, colorEnd, life);

    // Alpha fades out over lifetime (quadratic for softer fade)
    vAlpha = opacity * (1.0 - life * life);

    // Billboard: make quad always face camera
    vec3 cameraRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 cameraUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    vec3 vertexOffset = cameraRight * position.x * finalSize + cameraUp * position.y * finalSize;
    vec3 worldPos = instancePosition + vertexOffset;

    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
  }
`;

// Fragment shaders for different particle shapes
const fragmentShaders: Record<string, string> = {
  // Point: basic hard circle
  point: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5, 0.5);
      float dist = length(vUv - center);
      float circle = 1.0 - step(0.5, dist);

      float alpha = vAlpha * circle;
      if (alpha < 0.01) discard;

      gl_FragColor = vec4(vColor, alpha);
    }
  `,

  // Spark: soft circle with gradient (default flame look)
  spark: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5, 0.5);
      float dist = length(vUv - center);
      float circle = 1.0 - smoothstep(0.2, 0.5, dist);

      float alpha = vAlpha * circle;
      if (alpha < 0.01) discard;

      gl_FragColor = vec4(vColor, alpha);
    }
  `,

  // Cube: square shape
  cube: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5, 0.5);
      vec2 d = abs(vUv - center);
      float square = 1.0 - step(0.4, max(d.x, d.y));

      float alpha = vAlpha * square;
      if (alpha < 0.01) discard;

      gl_FragColor = vec4(vColor, alpha);
    }
  `,

  // Shard: diamond shape
  shard: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    varying vec2 vUv;

    void main() {
      vec2 center = vec2(0.5, 0.5);
      vec2 d = abs(vUv - center);
      float diamond = 1.0 - step(0.5, d.x + d.y);

      float alpha = vAlpha * diamond;
      if (alpha < 0.01) discard;

      gl_FragColor = vec4(vColor, alpha);
    }
  `,
};

// Fallback fragment shader
const defaultFragmentShader = fragmentShaders.spark;

export class FlameEmitter {
  readonly id: string;
  readonly definition: VFXDefinition;

  private pool: ParticlePool;
  private mesh!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
  private geometry!: THREE.InstancedBufferGeometry;

  private position: THREE.Vector3;
  private scale: number;

  private playing: boolean = false;
  private emissionAccumulator: number = 0;
  private burstAccumulator: number = 0;
  private elapsed: number = 0;

  private startColor: { r: number; g: number; b: number };
  private endColor: { r: number; g: number; b: number };

  private positionArray!: Float32Array;
  private colorArray!: Float32Array;
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

    this.startColor = hexToRgb(definition.color);
    this.endColor = definition.colorEnd ? hexToRgb(definition.colorEnd) : this.startColor;

    this.pool = new ParticlePool(definition.maxParticles);
    this.createMesh(scene);
  }

  private createMesh(scene: THREE.Scene): void {
    const def = this.definition;
    const count = def.maxParticles;

    // Base quad geometry
    const baseGeometry = new THREE.PlaneGeometry(1, 1);

    // Instance attributes
    this.positionArray = new Float32Array(count * 3);
    this.colorArray = new Float32Array(count * 3);
    this.dataArray = new Float32Array(count * 2);

    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = baseGeometry.index;
    this.geometry.attributes.position = baseGeometry.attributes.position!;
    this.geometry.attributes.uv = baseGeometry.attributes.uv!;

    this.geometry.setAttribute('instancePosition', new THREE.InstancedBufferAttribute(this.positionArray, 3));
    this.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(this.colorArray, 3));
    this.geometry.setAttribute('instanceData', new THREE.InstancedBufferAttribute(this.dataArray, 2));

    // Select fragment shader based on geometry type
    const fragmentShader = fragmentShaders[def.geometry] || defaultFragmentShader;

    this.material = new THREE.ShaderMaterial({
      vertexShader: flameVertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        sizeOverLife: { value: def.sizeOverLife ?? 0.3 },
        colorEnd: { value: new THREE.Color(this.endColor.r, this.endColor.g, this.endColor.b) },
        opacity: { value: def.opacity ?? 1.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: def.blendMode === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  play(): void {
    this.playing = true;
    this.elapsed = 0;
    this.emissionAccumulator = 0;
    this.burstAccumulator = 0;
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

  private spawnParticle(): void {
    const index = this.pool.acquire();
    if (index < 0) return;

    const particle = this.pool.get(index)!;
    const def = this.definition;

    particle.age = 0;
    particle.lifetime = randomRange(def.lifetime[0], def.lifetime[1]);

    // Spawn at emitter position
    particle.x = this.position.x;
    particle.y = this.position.y;
    particle.z = this.position.z;

    // Calculate velocity with spread
    const speed = randomRange(def.speed[0], def.speed[1]) * this.scale;
    const dir = new THREE.Vector3(def.direction.x, def.direction.y, def.direction.z).normalize();

    if (def.spread > 0) {
      const spreadRad = (def.spread * Math.PI) / 180;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * spreadRad;

      const sinPhi = Math.sin(phi);
      const cosPhi = Math.cos(phi);

      const perpX = new THREE.Vector3(1, 0, 0);
      const perpY = new THREE.Vector3(0, 1, 0);
      const perp = Math.abs(dir.dot(perpX)) < 0.9 ? perpX : perpY;
      const tangent = new THREE.Vector3().crossVectors(dir, perp).normalize();
      const bitangent = new THREE.Vector3().crossVectors(dir, tangent);

      dir.multiplyScalar(cosPhi);
      dir.addScaledVector(tangent, sinPhi * Math.cos(theta));
      dir.addScaledVector(bitangent, sinPhi * Math.sin(theta));
      dir.normalize();
    }

    particle.vx = dir.x * speed;
    particle.vy = dir.y * speed;
    particle.vz = dir.z * speed;

    particle.startSize = randomRange(def.size[0], def.size[1]) * this.scale;
    particle.size = particle.startSize;

    particle.r = this.startColor.r;
    particle.g = this.startColor.g;
    particle.b = this.startColor.b;
  }

  private updateParticles(delta: number): void {
    const def = this.definition;
    const gravity = def.gravity * 9.8 * this.scale;

    this.pool.forEachActive((particle, index) => {
      particle.age += delta;

      if (particle.age >= particle.lifetime) {
        this.pool.release(index);
        return;
      }

      // Apply gravity (negative = rise, positive = fall)
      particle.vy -= gravity * delta;

      // Update position
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.z += particle.vz * delta;
    });
  }

  private updateBuffers(): void {
    let visibleCount = 0;

    this.pool.forEachActive((particle) => {
      const i = visibleCount;

      this.positionArray[i * 3] = particle.x;
      this.positionArray[i * 3 + 1] = particle.y;
      this.positionArray[i * 3 + 2] = particle.z;

      this.colorArray[i * 3] = particle.r;
      this.colorArray[i * 3 + 1] = particle.g;
      this.colorArray[i * 3 + 2] = particle.b;

      const life = particle.age / particle.lifetime;
      this.dataArray[i * 2] = particle.size;
      this.dataArray[i * 2 + 1] = life;

      visibleCount++;
    });

    this.geometry.getAttribute('instancePosition').needsUpdate = true;
    this.geometry.getAttribute('instanceColor').needsUpdate = true;
    this.geometry.getAttribute('instanceData').needsUpdate = true;
    this.geometry.instanceCount = visibleCount;
  }

  setPosition(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
  }

  getPosition(): THREE.Vector3 {
    return this.position.clone();
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
