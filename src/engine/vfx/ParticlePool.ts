/**
 * ParticlePool - Object pooling for particles
 *
 * Avoids allocation/deallocation overhead by reusing particle objects.
 * Uses a free list to track available slots.
 */

import type { ParticleState } from './types';

export class ParticlePool {
  private particles: ParticleState[];
  private freeIndices: number[];
  private activeCount: number = 0;

  constructor(maxParticles: number) {
    // Pre-allocate all particles
    this.particles = new Array(maxParticles);
    this.freeIndices = new Array(maxParticles);

    for (let i = 0; i < maxParticles; i++) {
      this.particles[i] = this.createParticle();
      this.freeIndices[i] = maxParticles - 1 - i; // Stack order (pop from end)
    }
  }

  /**
   * Create a new particle with default values
   */
  private createParticle(): ParticleState {
    return {
      active: false,
      age: 0,
      lifetime: 1,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 1,
      startSize: 1,
      r: 1,
      g: 1,
      b: 1,
    };
  }

  /**
   * Acquire a particle from the pool
   * Returns the index, or -1 if pool is exhausted
   */
  acquire(): number {
    if (this.freeIndices.length === 0) {
      return -1; // Pool exhausted
    }

    const index = this.freeIndices.pop()!;
    const particle = this.particles[index]!;
    particle.active = true;
    this.activeCount++;
    return index;
  }

  /**
   * Release a particle back to the pool
   */
  release(index: number): void {
    const particle = this.particles[index];
    if (!particle || !particle.active) return;

    particle.active = false;
    this.freeIndices.push(index);
    this.activeCount--;
  }

  /**
   * Get particle at index
   */
  get(index: number): ParticleState | undefined {
    return this.particles[index];
  }

  /**
   * Get all particles (for iteration)
   */
  getAll(): ParticleState[] {
    return this.particles;
  }

  /**
   * Get number of active particles
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  /**
   * Get total pool capacity
   */
  getCapacity(): number {
    return this.particles.length;
  }

  /**
   * Reset all particles to inactive
   */
  reset(): void {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i]!.active = false;
      this.freeIndices[i] = this.particles.length - 1 - i;
    }
    this.freeIndices.length = this.particles.length;
    this.activeCount = 0;
  }

  /**
   * Iterate over active particles with callback
   */
  forEachActive(callback: (particle: ParticleState, index: number) => void): void {
    for (let i = 0; i < this.particles.length; i++) {
      const particle = this.particles[i]!;
      if (particle.active) {
        callback(particle, i);
      }
    }
  }
}
