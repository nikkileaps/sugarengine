/**
 * Caster System Types
 *
 * Defines the data structures for the magic system:
 * - PlayerCaster: Configuration for the player's caster (stored in project data)
 * - Spells: Magic actions with various effects
 * - Resonance: Charge meter that stabilizes spell casting
 */

/**
 * Player caster configuration (stored in project data)
 * The actual runtime state is in the Caster ECS component
 */
export interface PlayerCasterConfig {
  initialBattery: number;        // Starting battery % (0-100) for the episode
  rechargeRate: number;          // Battery % per minute (slow trickle from ambient magic)
  initialResonance?: number;     // Starting resonance % (0-100) for the episode
  allowedSpellTags?: string[];   // Only these spell tags can be cast (if set)
  blockedSpellTags?: string[];   // These spell tags cannot be cast
  // Spawn settings
  initialSpawnPosition?: { x: number; y: number; z: number };  // Override region spawn
  initialFacingAngle?: number;   // Degrees (0 = north, 90 = east, 180 = south, 270 = west)
}

/**
 * Definition of a spell that can be cast
 */
export interface SpellDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;                 // Emoji or icon name
  tags: string[];
  batteryCost: number;           // 0-100
  effects: SpellEffect[];
  chaosEffects?: SpellEffect[];  // What happens when spell misbehaves
}

/**
 * An effect that a spell can produce
 */
export interface SpellEffect {
  type: 'event' | 'unlock' | 'world-flag' | 'dialogue' | 'heal' | 'damage';
  // Effect-specific properties
  eventName?: string;            // For 'event' type
  flagName?: string;             // For 'world-flag' type
  flagValue?: boolean | string | number;  // For 'world-flag' type
  dialogueId?: string;           // For 'dialogue' type
  amount?: number;               // For 'heal' or 'damage' type
}

/**
 * Battery charge level tiers
 * - full: 75-100% - no chaos
 * - unstable: 25-74% - 40% base chaos chance
 * - critical: 1-24% - 80% base chaos chance
 * - empty: 0% - cannot cast
 */
export type BatteryTier = 'full' | 'unstable' | 'critical' | 'empty';

/**
 * Result of casting a spell
 */
export interface SpellResult {
  success: boolean;
  chaos: boolean;
  spell: SpellDefinition;
  effects: SpellEffect[];        // The effects that were applied
  batteryRemaining: number;
  resonanceConsumed: number;
  error?: string;                // If success is false
}

/**
 * Event data for spell cast notifications
 */
export interface SpellCastEvent {
  spell: SpellDefinition;
  result: SpellResult;
}

/**
 * Event data for chaos trigger notifications
 */
export interface ChaosEvent {
  spell: SpellDefinition;
  chaosEffect: SpellEffect;
}
