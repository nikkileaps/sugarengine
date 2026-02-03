/**
 * Caster System
 *
 * Magic system with spells, battery, and resonance mechanics.
 * Uses ECS for runtime state (Caster component on player entity).
 */

export { CasterManager } from './CasterManager';
export { SpellLoader } from './SpellLoader';
export type {
  PlayerCasterConfig,
  SpellDefinition,
  SpellEffect,
  BatteryTier,
  SpellResult,
  SpellCastEvent,
  ChaosEvent,
} from './types';
