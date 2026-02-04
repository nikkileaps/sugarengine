/**
 * VFXLoader - Load VFX definitions from project data
 */

import type { VFXDefinition } from './types';

/**
 * Built-in flame preset
 */
export const FLAME_PRESET: VFXDefinition = {
  id: 'builtin-flame',
  name: 'Flame',
  emissionRate: 25,
  maxParticles: 80,
  lifetime: [0.4, 1.0],
  size: [0.08, 0.2],
  sizeOverLife: 0.3,
  speed: [0.8, 1.5],
  geometry: 'spark',
  color: '#ff6600',
  colorEnd: '#ffcc00',
  opacity: 0.9,
  blendMode: 'additive',
  direction: { x: 0, y: 1, z: 0 },
  spread: 25,
  gravity: -0.4,
  loop: true,
};

/**
 * Built-in sparkle preset
 */
export const SPARKLE_PRESET: VFXDefinition = {
  id: 'builtin-sparkle',
  name: 'Sparkle',
  emissionRate: 6,
  maxParticles: 30,
  lifetime: [0.8, 1.5],
  size: [0.04, 0.12],
  sizeOverLife: 1.0,            // Don't shrink - twinkling handles visibility
  speed: [0.02, 0.08],          // Almost stationary - just tiny drift
  geometry: 'sparkle',
  color: '#ffffff',
  colorEnd: '#ffffff',          // Stay white - no color fade
  opacity: 1.0,
  blendMode: 'additive',
  direction: { x: 0, y: 1, z: 0 },
  spread: 360,                  // Spread in all directions (sphere)
  gravity: 0,                   // No gravity - sparkles float
  loop: true,
};

/**
 * Built-in magic burst preset (one-shot)
 */
export const MAGIC_BURST_PRESET: VFXDefinition = {
  id: 'builtin-magic-burst',
  name: 'Magic Burst',
  emissionRate: 0,
  maxParticles: 50,
  burst: { count: 30, interval: 0.1 },
  lifetime: [0.3, 0.6],
  size: [0.05, 0.15],
  sizeOverLife: 0.1,
  speed: [2, 4],
  geometry: 'point',
  color: '#aa88ff',
  colorEnd: '#ffffff',
  opacity: 1.0,
  blendMode: 'additive',
  direction: { x: 0, y: 0, z: 0 },
  spread: 360,
  gravity: 0.3,
  loop: false,
  duration: 0.8,
};

/**
 * All built-in presets
 */
export const BUILTIN_PRESETS: VFXDefinition[] = [
  FLAME_PRESET,
  SPARKLE_PRESET,
  MAGIC_BURST_PRESET,
];

/**
 * VFXLoader - Parse VFX definitions from project data
 */
export class VFXLoader {
  /**
   * Parse VFX definitions from project data
   */
  static parseVFXDefinitions(projectData: unknown): VFXDefinition[] {
    if (!projectData || typeof projectData !== 'object') {
      return [];
    }

    const data = projectData as {
      vfxDefinitions?: Array<Partial<VFXDefinition> & { id: string; name: string }>;
    };

    if (!data.vfxDefinitions || !Array.isArray(data.vfxDefinitions)) {
      return [];
    }

    return data.vfxDefinitions
      .filter((def) => def.id && def.name)
      .map((def) => VFXLoader.normalizeDefinition(def));
  }

  /**
   * Normalize a partial definition to a complete VFXDefinition
   */
  static normalizeDefinition(
    partial: Partial<VFXDefinition> & { id: string; name: string }
  ): VFXDefinition {
    return {
      id: partial.id,
      name: partial.name,
      emissionRate: partial.emissionRate ?? 20,
      maxParticles: partial.maxParticles ?? 100,
      burst: partial.burst,
      lifetime: partial.lifetime ?? [0.5, 1.5],
      size: partial.size ?? [0.1, 0.3],
      sizeOverLife: partial.sizeOverLife ?? 1.0,
      speed: partial.speed ?? [1, 2],
      geometry: partial.geometry ?? 'point',
      color: partial.color ?? '#ffffff',
      colorEnd: partial.colorEnd,
      opacity: partial.opacity ?? 1.0,
      blendMode: partial.blendMode ?? 'additive',
      direction: partial.direction ?? { x: 0, y: 1, z: 0 },
      spread: partial.spread ?? 30,
      gravity: partial.gravity ?? 0,
      sprite: partial.sprite,
      loop: partial.loop ?? true,
      duration: partial.duration,
    };
  }

  /**
   * Get all built-in presets
   */
  static getBuiltinPresets(): VFXDefinition[] {
    return [...BUILTIN_PRESETS];
  }
}
