import { System } from '../ecs/System';
import { World } from '../ecs/World';
import { Caster } from '../components/Caster';
import { PlayerControlled } from '../components/PlayerControlled';

export type BatteryTier = 'full' | 'unstable' | 'critical' | 'empty';

export type BatteryChangedHandler = (battery: number, tier: BatteryTier) => void;
export type ResonanceChangedHandler = (resonance: number) => void;

/**
 * CasterSystem - Updates battery recharge and resonance buildup each frame
 * Only operates on entities with both Caster and PlayerControlled components
 */
export class CasterSystem extends System {
  private onBatteryChangedHandler: BatteryChangedHandler | null = null;
  private onResonanceChangedHandler: ResonanceChangedHandler | null = null;
  private lastBattery: number = -1;
  private lastResonance: number = -1;

  update(world: World, deltaTime: number): void {
    // Find player entity with Caster component
    const entities = world.query<[Caster, PlayerControlled]>(Caster, PlayerControlled);

    for (const { components: [caster] } of entities) {
      if (!caster) continue;

      let batteryChanged = false;
      let resonanceChanged = false;

      // Recharge battery over time (rate is % per minute, convert to per second)
      if (caster.battery < caster.maxBattery) {
        const rechargePerSecond = caster.rechargeRate / 60;
        caster.battery = Math.min(
          caster.maxBattery,
          caster.battery + rechargePerSecond * deltaTime
        );
        batteryChanged = true;
      }

      // Resonance does NOT build automatically - player must visit resonance points
      // and engage with the resonance mechanic to increase it

      // Fire events if values changed significantly (avoid spam)
      if (batteryChanged && Math.abs(caster.battery - this.lastBattery) >= 0.5) {
        this.lastBattery = caster.battery;
        this.onBatteryChangedHandler?.(caster.battery, this.getBatteryTier(caster.battery));
      }

      if (resonanceChanged && Math.abs(caster.resonance - this.lastResonance) >= 0.5) {
        this.lastResonance = caster.resonance;
        this.onResonanceChangedHandler?.(caster.resonance);
      }
    }
  }

  getBatteryTier(battery: number): BatteryTier {
    if (battery >= 75) return 'full';
    if (battery >= 25) return 'unstable';
    if (battery > 0) return 'critical';
    return 'empty';
  }

  setOnBatteryChanged(handler: BatteryChangedHandler): void {
    this.onBatteryChangedHandler = handler;
  }

  setOnResonanceChanged(handler: ResonanceChangedHandler): void {
    this.onResonanceChangedHandler = handler;
  }

  /**
   * Force fire events with current values (for UI sync after load)
   */
  syncUI(world: World): void {
    const entities = world.query<[Caster, PlayerControlled]>(Caster, PlayerControlled);
    for (const { components: [caster] } of entities) {
      if (!caster) continue;

      this.lastBattery = caster.battery;
      this.lastResonance = caster.resonance;
      this.onBatteryChangedHandler?.(caster.battery, this.getBatteryTier(caster.battery));
      this.onResonanceChangedHandler?.(caster.resonance);
      break; // Only one player
    }
  }
}
