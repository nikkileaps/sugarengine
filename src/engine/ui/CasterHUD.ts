import { CasterManager, BatteryTier } from '../caster';

export type BatteryChangedHandler = (battery: number, tier: BatteryTier) => void;
export type ResonanceChangedHandler = (resonance: number) => void;

export interface CasterHUDConfig {
  onRegisterBatteryHandler?: (handler: BatteryChangedHandler) => void;
  onRegisterResonanceHandler?: (handler: ResonanceChangedHandler) => void;
}

/**
 * HUD display for battery and resonance meters
 * Only visible when a caster is equipped
 */
export class CasterHUD {
  private container: HTMLDivElement;
  private batteryBar: HTMLDivElement;
  private batteryFill: HTMLDivElement;
  private batteryValue: HTMLSpanElement;
  private resonanceBar: HTMLDivElement;
  private resonanceFill: HTMLDivElement;
  private resonanceValue: HTMLSpanElement;
  private casterManager: CasterManager;

  constructor(parentContainer: HTMLElement, casterManager: CasterManager, config?: CasterHUDConfig) {
    this.casterManager = casterManager;
    this.injectStyles();

    // Create HUD container
    this.container = document.createElement('div');
    this.container.className = 'caster-hud';

    // Battery meter
    const batteryMeter = document.createElement('div');
    batteryMeter.className = 'caster-hud-meter';

    const batteryIcon = document.createElement('div');
    batteryIcon.className = 'caster-hud-icon';
    batteryIcon.textContent = '⚡';
    batteryMeter.appendChild(batteryIcon);

    this.batteryBar = document.createElement('div');
    this.batteryBar.className = 'caster-hud-bar';
    this.batteryFill = document.createElement('div');
    this.batteryFill.className = 'caster-hud-fill battery';
    this.batteryBar.appendChild(this.batteryFill);
    batteryMeter.appendChild(this.batteryBar);

    this.batteryValue = document.createElement('span');
    this.batteryValue.className = 'caster-hud-value';
    batteryMeter.appendChild(this.batteryValue);

    this.container.appendChild(batteryMeter);

    // Resonance meter
    const resonanceMeter = document.createElement('div');
    resonanceMeter.className = 'caster-hud-meter';

    const resonanceIcon = document.createElement('div');
    resonanceIcon.className = 'caster-hud-icon';
    resonanceIcon.textContent = '✨';
    resonanceMeter.appendChild(resonanceIcon);

    this.resonanceBar = document.createElement('div');
    this.resonanceBar.className = 'caster-hud-bar';
    this.resonanceFill = document.createElement('div');
    this.resonanceFill.className = 'caster-hud-fill resonance';
    this.resonanceBar.appendChild(this.resonanceFill);
    resonanceMeter.appendChild(this.resonanceBar);

    this.resonanceValue = document.createElement('span');
    this.resonanceValue.className = 'caster-hud-value';
    resonanceMeter.appendChild(this.resonanceValue);

    this.container.appendChild(resonanceMeter);

    parentContainer.appendChild(this.container);

    // Register event handlers if provided
    if (config?.onRegisterBatteryHandler) {
      config.onRegisterBatteryHandler((battery, tier) => {
        this.updateBattery(battery, tier);
        // Auto-show when we receive battery updates (means caster exists)
        if (!this.isVisible()) {
          this.show();
        }
      });
    }

    if (config?.onRegisterResonanceHandler) {
      config.onRegisterResonanceHandler((resonance) => {
        this.updateResonance(resonance);
      });
    }

    // Initial state - check if caster exists and show/hide accordingly
    if (this.casterManager.hasCaster()) {
      this.show();
      this.updateBattery(this.casterManager.getBattery(), this.casterManager.getBatteryTier());
      this.updateResonance(this.casterManager.getResonance());
    } else {
      this.hide();
    }
  }

  private injectStyles(): void {
    if (document.getElementById('caster-hud-styles')) return;

    const style = document.createElement('style');
    style.id = 'caster-hud-styles';
    style.textContent = `
      .caster-hud {
        position: absolute;
        bottom: 20px;
        left: 20px;
        display: none;
        flex-direction: column;
        gap: 8px;
        z-index: 100;
        pointer-events: none;
      }

      .caster-hud.visible {
        display: flex;
      }

      .caster-hud-meter {
        display: flex;
        align-items: center;
        gap: 8px;
        background: rgba(0, 0, 0, 0.6);
        border-radius: 8px;
        padding: 6px 10px;
        backdrop-filter: blur(4px);
      }

      .caster-hud-icon {
        font-size: 16px;
        min-width: 20px;
        text-align: center;
      }

      .caster-hud-bar {
        width: 80px;
        height: 10px;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 5px;
        overflow: hidden;
      }

      .caster-hud-fill {
        height: 100%;
        border-radius: 5px;
        transition: width 0.3s ease-out, background 0.3s ease-out;
      }

      .caster-hud-fill.battery {
        background: linear-gradient(90deg, #6bc46b 0%, #8ed88e 100%);
      }

      .caster-hud-fill.battery.unstable {
        background: linear-gradient(90deg, #d4a846 0%, #e8c462 100%);
      }

      .caster-hud-fill.battery.critical {
        background: linear-gradient(90deg, #d45b5b 0%, #e87878 100%);
        animation: pulse-critical 1s ease-in-out infinite;
      }

      @keyframes pulse-critical {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      .caster-hud-fill.resonance {
        background: linear-gradient(90deg, #7b68ee 0%, #9c8eff 100%);
      }

      .caster-hud-value {
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 12px;
        font-weight: 600;
        color: rgba(255, 255, 255, 0.8);
        min-width: 32px;
        text-align: right;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Update battery display
   */
  updateBattery(battery: number, tier: BatteryTier): void {
    this.batteryFill.style.width = `${battery}%`;
    this.batteryFill.classList.remove('unstable', 'critical');

    if (tier === 'unstable') {
      this.batteryFill.classList.add('unstable');
    } else if (tier === 'critical' || tier === 'empty') {
      this.batteryFill.classList.add('critical');
    }

    this.batteryValue.textContent = `${Math.round(battery)}%`;
  }

  /**
   * Update resonance display
   */
  updateResonance(resonance: number): void {
    this.resonanceFill.style.width = `${resonance}%`;
    this.resonanceValue.textContent = `${Math.round(resonance)}%`;
  }

  /**
   * Show the HUD
   */
  show(): void {
    this.container.classList.add('visible');
  }

  /**
   * Hide the HUD
   */
  hide(): void {
    this.container.classList.remove('visible');
  }

  /**
   * Check if HUD is visible
   */
  isVisible(): boolean {
    return this.container.classList.contains('visible');
  }

  dispose(): void {
    this.container.remove();
  }
}
