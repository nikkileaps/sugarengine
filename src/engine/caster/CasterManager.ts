import { World } from '../ecs/World';
import { Caster } from '../components/Caster';
import { PlayerControlled } from '../components/PlayerControlled';
import {
  SpellDefinition,
  SpellEffect,
  SpellResult,
  BatteryTier,
} from './types';

/**
 * Manages spells and spell casting.
 * Battery/resonance state is stored in the Caster ECS component on the player entity.
 */
export class CasterManager {
  private spells: Map<string, SpellDefinition> = new Map();
  private world: World | null = null;

  // Event handlers
  private onSpellCastHandler: ((spell: SpellDefinition, result: SpellResult) => void) | null = null;
  private onChaosTriggeredHandler: ((spell: SpellDefinition, chaosEffect: SpellEffect) => void) | null = null;
  private onSpellAvailabilityChangeHandler: ((available: Set<string>) => void) | null = null;

  // Tracks which spells are currently castable — only fires notification when this set changes
  private availableSpells: Set<string> = new Set();

  setOnSpellAvailabilityChange(handler: (available: Set<string>) => void): void {
    this.onSpellAvailabilityChangeHandler = handler;
  }

  /**
   * Recompute which spells are castable and fire callback if the set changed.
   * Called after any stat mutation (battery/resonance) and from CasterSystem frame recharge.
   */
  checkSpellAvailability(): void {
    const newAvailable = new Set<string>();
    for (const [id] of this.spells) {
      if (this.canCastSpell(id).canCast) {
        newAvailable.add(id);
      }
    }

    // Check if set changed
    if (newAvailable.size !== this.availableSpells.size ||
        [...newAvailable].some(id => !this.availableSpells.has(id))) {
      this.availableSpells = newAvailable;
      this.onSpellAvailabilityChangeHandler?.(newAvailable);
    }
  }

  /**
   * Connect to the ECS world
   */
  setWorld(world: World): void {
    this.world = world;
  }

  // ============================================
  // Spell Registration
  // ============================================

  registerSpell(spell: SpellDefinition): void {
    this.spells.set(spell.id, spell);
  }

  getSpell(spellId: string): SpellDefinition | undefined {
    return this.spells.get(spellId);
  }

  getAllSpells(): SpellDefinition[] {
    return Array.from(this.spells.values());
  }

  clearSpells(): void {
    this.spells.clear();
  }

  // ============================================
  // Caster Component Access
  // ============================================

  private getPlayerCaster(): Caster | null {
    if (!this.world) return null;

    const entities = this.world.query<[Caster, PlayerControlled]>(Caster, PlayerControlled);
    if (entities.length === 0) return null;

    return entities[0]!.components[0] ?? null;
  }

  /**
   * Check if player has a caster equipped (has Caster component)
   */
  hasCaster(): boolean {
    return this.getPlayerCaster() !== null;
  }

  // ============================================
  // Battery Access
  // ============================================

  getBattery(): number {
    return this.getPlayerCaster()?.battery ?? 0;
  }

  getBatteryTier(): BatteryTier {
    const battery = this.getBattery();
    if (battery >= 75) return 'full';
    if (battery >= 25) return 'unstable';
    if (battery > 0) return 'critical';
    return 'empty';
  }

  getMaxBattery(): number {
    return this.getPlayerCaster()?.maxBattery ?? 100;
  }

  consumeBattery(amount: number): boolean {
    const caster = this.getPlayerCaster();
    if (!caster || caster.battery < amount) return false;

    caster.battery = Math.max(0, caster.battery - amount);
    this.checkSpellAvailability();
    return true;
  }

  rechargeBattery(amount: number): void {
    const caster = this.getPlayerCaster();
    if (!caster) return;

    caster.battery = Math.min(caster.maxBattery, caster.battery + amount);
    this.checkSpellAvailability();
  }

  setBattery(value: number): void {
    const caster = this.getPlayerCaster();
    if (!caster) return;

    caster.battery = Math.max(0, Math.min(caster.maxBattery, value));
    this.checkSpellAvailability();
  }

  // ============================================
  // Resonance Access
  // ============================================

  getResonance(): number {
    return this.getPlayerCaster()?.resonance ?? 0;
  }

  addResonance(amount: number): void {
    const caster = this.getPlayerCaster();
    if (!caster) return;

    caster.resonance = Math.min(100, caster.resonance + amount);
    this.checkSpellAvailability();
  }

  consumeResonance(): number {
    const caster = this.getPlayerCaster();
    if (!caster) return 0;

    const consumed = caster.resonance;
    caster.resonance = 0;
    this.checkSpellAvailability();
    return consumed;
  }

  setResonance(value: number): void {
    const caster = this.getPlayerCaster();
    if (!caster) return;

    caster.resonance = Math.max(0, Math.min(100, value));
    this.checkSpellAvailability();
  }

  // ============================================
  // Spell Casting
  // ============================================

  getAvailableSpells(): SpellDefinition[] {
    const caster = this.getPlayerCaster();
    if (!caster) return [];

    return this.getAllSpells().filter(spell => {
      // Check allowed tags
      if (caster.allowedSpellTags.length > 0) {
        const hasAllowedTag = spell.tags.some(tag => caster.allowedSpellTags.includes(tag));
        if (!hasAllowedTag) return false;
      }

      // Check blocked tags
      if (caster.blockedSpellTags.length > 0) {
        const hasBlockedTag = spell.tags.some(tag => caster.blockedSpellTags.includes(tag));
        if (hasBlockedTag) return false;
      }

      return true;
    });
  }

  canCastSpell(spellId: string): { canCast: boolean; reason?: string } {
    const caster = this.getPlayerCaster();
    if (!caster) {
      return { canCast: false, reason: 'No caster available' };
    }

    const spell = this.spells.get(spellId);
    if (!spell) {
      return { canCast: false, reason: 'Spell not found' };
    }

    // Check allowed tags
    if (caster.allowedSpellTags.length > 0) {
      const hasAllowedTag = spell.tags.some(tag => caster.allowedSpellTags.includes(tag));
      if (!hasAllowedTag) {
        return { canCast: false, reason: 'Spell not allowed' };
      }
    }

    // Check blocked tags
    if (caster.blockedSpellTags.length > 0) {
      const hasBlockedTag = spell.tags.some(tag => caster.blockedSpellTags.includes(tag));
      if (hasBlockedTag) {
        return { canCast: false, reason: 'Spell blocked' };
      }
    }

    // Check battery
    if (caster.battery < spell.batteryCost) {
      return { canCast: false, reason: `Not enough battery, recharge rate ${caster.rechargeRate}%/min` };
    }

    if (caster.battery === 0) {
      return { canCast: false, reason: 'Battery empty' };
    }

    return { canCast: true };
  }

  castSpell(spellId: string): SpellResult {
    const canCast = this.canCastSpell(spellId);
    const spell = this.spells.get(spellId);

    if (!canCast.canCast || !spell) {
      return {
        success: false,
        chaos: false,
        spell: spell ?? { id: spellId, name: 'Unknown', description: '', tags: [], batteryCost: 0, effects: [] },
        effects: [],
        batteryRemaining: this.getBattery(),
        resonanceConsumed: 0,
        error: canCast.reason,
      };
    }

    // Get battery before consumption for chaos calculation
    const batteryBefore = this.getBattery();

    // Consume battery
    this.consumeBattery(spell.batteryCost);

    // Determine if chaos occurs
    const chaosTriggered = this.resolveChaos(batteryBefore);
    const resonanceConsumed = this.consumeResonance();

    // Determine which effects to apply
    const effects = chaosTriggered && spell.chaosEffects && spell.chaosEffects.length > 0
      ? spell.chaosEffects
      : spell.effects;

    const result: SpellResult = {
      success: true,
      chaos: chaosTriggered,
      spell,
      effects,
      batteryRemaining: this.getBattery(),
      resonanceConsumed,
    };

    // Fire events
    this.onSpellCastHandler?.(spell, result);

    if (chaosTriggered && spell.chaosEffects && spell.chaosEffects.length > 0) {
      for (const chaosEffect of spell.chaosEffects) {
        this.onChaosTriggeredHandler?.(spell, chaosEffect);
      }
    }

    return result;
  }

  /**
   * Get the current chaos chance (0-1) based on battery and resonance
   */
  getChaosChance(): number {
    const battery = this.getBattery();
    const resonance = this.getResonance();

    // Base chaos chance from battery level
    let chaosChance = 0;
    if (battery >= 75) {
      chaosChance = 0;
    } else if (battery >= 25) {
      chaosChance = 0.4;
    } else if (battery > 0) {
      chaosChance = 0.8;
    } else {
      return 1; // 100% chaos at 0 battery
    }

    // Resonance stabilizes - reduces chaos chance by up to 80%
    const stabilization = (resonance / 100) * 0.8;
    chaosChance *= (1 - stabilization);

    return chaosChance;
  }

  private resolveChaos(batteryBefore: number): boolean {
    const resonance = this.getResonance();

    // Base chaos chance from battery level
    let chaosChance = 0;
    if (batteryBefore >= 75) {
      chaosChance = 0;
    } else if (batteryBefore >= 25) {
      chaosChance = 0.4;
    } else if (batteryBefore > 0) {
      chaosChance = 0.8;
    } else {
      return true;
    }

    // Resonance stabilizes - reduces chaos chance by up to 80%
    const stabilization = (resonance / 100) * 0.8;
    chaosChance *= (1 - stabilization);

    return Math.random() < chaosChance;
  }

  // ============================================
  // Event Handlers
  // ============================================

  setOnSpellCast(handler: (spell: SpellDefinition, result: SpellResult) => void): void {
    this.onSpellCastHandler = handler;
  }

  setOnChaosTriggered(handler: (spell: SpellDefinition, chaosEffect: SpellEffect) => void): void {
    this.onChaosTriggeredHandler = handler;
  }

  // ============================================
  // Save/Load (for spell state, not battery - that's in component)
  // ============================================

  /**
   * Get caster state for saving
   */
  getCasterState(): { battery: number; resonance: number } | null {
    const caster = this.getPlayerCaster();
    if (!caster) return null;

    return {
      battery: caster.battery,
      resonance: caster.resonance,
    };
  }

  /**
   * Restore caster state from save
   */
  loadCasterState(state: { battery: number; resonance: number }): void {
    const caster = this.getPlayerCaster();
    if (!caster) return;

    caster.battery = state.battery;
    caster.resonance = state.resonance;
  }
}
