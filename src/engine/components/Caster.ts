import { Component } from '../ecs/Component';

/**
 * Caster component - attached to the player entity
 * Manages battery and resonance state for spell casting
 */
export class Caster implements Component {
  static readonly type = 'Caster';
  readonly type = 'Caster';

  // Battery state
  battery: number;
  maxBattery: number;
  rechargeRate: number;  // % per minute (slow trickle from ambient magic)

  // Resonance state (increased by visiting resonance points, not automatically)
  resonance: number;

  // Spell restrictions
  allowedSpellTags: string[];
  blockedSpellTags: string[];

  constructor(config: {
    initialBattery?: number;
    rechargeRate?: number;
    initialResonance?: number;
    allowedSpellTags?: string[];
    blockedSpellTags?: string[];
  } = {}) {
    this.maxBattery = 100; // Always 100
    this.battery = config.initialBattery ?? 100;
    this.rechargeRate = config.rechargeRate ?? 1;  // 1% per minute default
    this.resonance = config.initialResonance ?? 0;  // Must visit resonance points to increase
    this.allowedSpellTags = config.allowedSpellTags ?? [];
    this.blockedSpellTags = config.blockedSpellTags ?? [];
  }
}
