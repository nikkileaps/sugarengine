/**
 * VFX System Types
 */

/**
 * Geometry type for particles
 */
export type ParticleGeometry = 'point' | 'sparkle' | 'cube' | 'shard' | 'spark';

/**
 * Blend mode for particle rendering
 */
export type BlendMode = 'normal' | 'additive';

/**
 * Definition for a VFX effect (stored in editor, loaded at runtime)
 */
export interface VFXDefinition {
  id: string;
  name: string;

  // Emission settings
  emissionRate: number;           // Particles per second
  maxParticles: number;           // Maximum active particles (pool size)
  burst?: {                       // Optional burst emission
    count: number;
    interval: number;             // Seconds between bursts
  };

  // Particle lifetime
  lifetime: [number, number];     // Random range [min, max] in seconds

  // Size
  size: [number, number];         // Random range [min, max]
  sizeOverLife?: number;          // Multiplier at end of life (0-2, 1 = no change)

  // Speed
  speed: [number, number];        // Random range [min, max]

  // Appearance
  geometry: ParticleGeometry;
  color: string;                  // Start color (hex)
  colorEnd?: string;              // End color for gradient (hex)
  opacity?: number;               // Base opacity (0-1, default 1)
  blendMode: BlendMode;

  // Movement
  direction: { x: number; y: number; z: number };
  spread: number;                 // Cone angle in degrees (0 = straight, 360 = sphere)
  gravity: number;                // Gravity multiplier (-1 = rise, 0 = none, 1 = fall)

  // Optional sprite (for 'point' geometry)
  sprite?: string;                // Path to sprite texture

  // Playback
  loop: boolean;                  // Loop continuously or play once
  duration?: number;              // Total effect duration (for non-looping)
}

/**
 * Runtime state for a single particle
 */
export interface ParticleState {
  active: boolean;
  age: number;                    // Current age in seconds
  lifetime: number;               // Total lifetime in seconds

  // Position
  x: number;
  y: number;
  z: number;

  // Velocity
  vx: number;
  vy: number;
  vz: number;

  // Visual
  size: number;
  startSize: number;

  // Color (0-1 range)
  r: number;
  g: number;
  b: number;
}

/**
 * Placement of a VFX emitter in a region
 */
export interface VFXPlacement {
  id: string;
  vfxId: string;                  // References VFXDefinition.id
  position: { x: number; y: number; z: number };
  scale?: number;                 // Scale multiplier (default 1)
  autoPlay: boolean;              // Start playing when region loads
}

/**
 * Configuration for VFX system
 */
export interface VFXConfig {
  maxTotalParticles?: number;     // Global particle limit (default 10000)
  updateRate?: number;            // Updates per second (default 60)
}
