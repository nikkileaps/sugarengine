import { CasterManager, SpellDefinition } from '../caster';

/**
 * Full-screen spell selection menu
 * Toggle with C key
 */
export class SpellMenuUI {
  private overlay: HTMLDivElement;
  private header: HTMLDivElement;
  private grid: HTMLDivElement;
  private description: HTMLDivElement;
  private casterManager: CasterManager;
  private onCloseHandler: (() => void) | null = null;
  private selectedIndex: number = 0;
  private spells: SpellDefinition[] = [];

  constructor(parentContainer: HTMLElement, casterManager: CasterManager) {
    this.casterManager = casterManager;
    this.injectStyles();

    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'spell-menu-overlay';

    // Panel
    const panel = document.createElement('div');
    panel.className = 'spell-menu-panel';

    // Header with caster info
    this.header = document.createElement('div');
    this.header.className = 'spell-menu-header';
    panel.appendChild(this.header);

    // Spell grid
    this.grid = document.createElement('div');
    this.grid.className = 'spell-menu-grid';
    panel.appendChild(this.grid);

    // Selected spell description
    this.description = document.createElement('div');
    this.description.className = 'spell-menu-description';
    panel.appendChild(this.description);

    // Footer with hints
    const footer = document.createElement('div');
    footer.className = 'spell-menu-footer';
    footer.innerHTML = `
      <div class="spell-menu-hint">
        <span class="key">C</span> or <span class="key">Esc</span> to close
        <span class="separator"></span>
        <span class="key">Arrow keys</span> to navigate
        <span class="separator"></span>
        <span class="key">Enter</span> to cast
      </div>
    `;
    panel.appendChild(footer);

    this.overlay.appendChild(panel);
    parentContainer.appendChild(this.overlay);

    // Keyboard handler
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  private injectStyles(): void {
    if (document.getElementById('spell-menu-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'spell-menu-ui-styles';
    style.textContent = `
      .spell-menu-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.85);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 300;
      }

      .spell-menu-overlay.visible {
        display: flex;
      }

      .spell-menu-panel {
        background: linear-gradient(180deg, rgba(35, 30, 50, 0.98) 0%, rgba(25, 22, 38, 0.98) 100%);
        border: 3px solid rgba(140, 120, 200, 0.4);
        border-radius: 16px;
        padding: 24px 32px;
        min-width: 500px;
        max-width: 600px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #e8e0f0;
      }

      .spell-menu-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 2px solid rgba(140, 120, 200, 0.2);
      }

      .spell-menu-caster-name {
        font-size: 20px;
        font-weight: 600;
        color: #f0e8ff;
      }

      .spell-menu-meters {
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 180px;
      }

      .spell-menu-meter {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .spell-menu-meter-label {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        min-width: 70px;
        text-align: right;
      }

      .spell-menu-meter-bar {
        flex: 1;
        height: 12px;
        background: rgba(0, 0, 0, 0.4);
        border-radius: 6px;
        overflow: hidden;
        position: relative;
      }

      .spell-menu-meter-fill {
        height: 100%;
        border-radius: 6px;
        transition: width 0.3s ease-out;
      }

      .spell-menu-meter-fill.battery {
        background: linear-gradient(90deg, #6bc46b 0%, #8ed88e 100%);
      }

      .spell-menu-meter-fill.battery.unstable {
        background: linear-gradient(90deg, #d4a846 0%, #e8c462 100%);
      }

      .spell-menu-meter-fill.battery.critical {
        background: linear-gradient(90deg, #d45b5b 0%, #e87878 100%);
      }

      .spell-menu-meter-fill.resonance {
        background: linear-gradient(90deg, #7b68ee 0%, #9c8eff 100%);
      }

      .spell-menu-meter-value {
        font-size: 12px;
        font-weight: 600;
        min-width: 35px;
        text-align: right;
        color: rgba(232, 224, 240, 0.7);
      }

      .spell-menu-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 16px;
      }

      .spell-menu-spell {
        background: rgba(0, 0, 0, 0.3);
        border: 2px solid rgba(140, 120, 200, 0.2);
        border-radius: 12px;
        padding: 16px 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
        transition: all 0.15s ease-out;
      }

      .spell-menu-spell:hover {
        border-color: rgba(140, 120, 200, 0.4);
        background: rgba(140, 120, 200, 0.1);
      }

      .spell-menu-spell.selected {
        border-color: rgba(168, 148, 240, 0.6);
        background: rgba(140, 120, 200, 0.15);
        box-shadow: 0 0 20px rgba(140, 120, 200, 0.2);
      }

      .spell-menu-spell.disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .spell-menu-spell.disabled:hover {
        border-color: rgba(140, 120, 200, 0.2);
        background: rgba(0, 0, 0, 0.3);
      }

      .spell-menu-spell-icon {
        font-size: 32px;
        margin-bottom: 8px;
      }

      .spell-menu-spell-name {
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        margin-bottom: 4px;
        color: #e8e0f0;
      }

      .spell-menu-spell-cost {
        font-size: 11px;
        color: rgba(232, 224, 240, 0.5);
      }

      .spell-menu-spell-cost.insufficient {
        color: #e87878;
      }

      .spell-menu-chaos-warning {
        color: #ff6b6b;
        font-size: 14px;
        margin-right: 6px;
      }

      .spell-menu-description {
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        padding: 16px;
        min-height: 60px;
        margin-bottom: 16px;
      }

      .spell-menu-description-text {
        font-size: 14px;
        line-height: 1.5;
        color: rgba(232, 224, 240, 0.8);
      }

      .spell-menu-description-error {
        font-size: 13px;
        color: #e87878;
        margin-top: 8px;
      }

      .spell-menu-footer {
        display: flex;
        justify-content: center;
        padding-top: 12px;
        border-top: 2px solid rgba(140, 120, 200, 0.15);
      }

      .spell-menu-hint {
        font-size: 12px;
        color: rgba(232, 224, 240, 0.4);
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .spell-menu-hint .key {
        display: inline-block;
        background: rgba(140, 120, 200, 0.2);
        border: 1px solid rgba(140, 120, 200, 0.3);
        border-radius: 4px;
        padding: 2px 6px;
        font-weight: 600;
        font-size: 11px;
        color: #b8a8e8;
      }

      .spell-menu-hint .separator {
        width: 1px;
        height: 14px;
        background: rgba(140, 120, 200, 0.2);
        margin: 0 4px;
      }

      .spell-menu-empty {
        text-align: center;
        padding: 40px;
        color: rgba(232, 224, 240, 0.5);
        font-size: 14px;
      }

      .spell-menu-no-caster {
        text-align: center;
        padding: 40px;
        color: rgba(232, 224, 240, 0.5);
        font-size: 14px;
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.code === 'KeyC' || e.code === 'Escape') {
      e.preventDefault();
      this.hide();
      return;
    }

    if (this.spells.length === 0) return;

    const cols = 4;

    if (e.code === 'ArrowRight') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.spells.length - 1);
      this.updateSelection();
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.updateSelection();
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      const newIndex = this.selectedIndex + cols;
      if (newIndex < this.spells.length) {
        this.selectedIndex = newIndex;
        this.updateSelection();
      }
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      const newIndex = this.selectedIndex - cols;
      if (newIndex >= 0) {
        this.selectedIndex = newIndex;
        this.updateSelection();
      }
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      this.castSelectedSpell();
    }
  }

  private updateSelection(): void {
    // Update visual selection
    const spellElements = this.grid.querySelectorAll('.spell-menu-spell');
    spellElements.forEach((el, index) => {
      el.classList.toggle('selected', index === this.selectedIndex);
    });

    // Update description
    const spell = this.spells[this.selectedIndex];
    if (spell) {
      this.updateDescription(spell);
    }
  }

  private updateDescription(spell: SpellDefinition): void {
    const canCast = this.casterManager.canCastSpell(spell.id);

    let html = `<div class="spell-menu-description-text">${spell.description}</div>`;
    if (!canCast.canCast && canCast.reason) {
      html += `<div class="spell-menu-description-error">${canCast.reason}</div>`;
    }

    this.description.innerHTML = html;
  }

  private castSelectedSpell(): void {
    const spell = this.spells[this.selectedIndex];
    if (!spell) return;

    const canCast = this.casterManager.canCastSpell(spell.id);
    if (!canCast.canCast) return;

    this.casterManager.castSpell(spell.id);
    this.hide();
  }

  /**
   * Show the spell menu
   */
  show(): void {
    this.refresh();
    this.overlay.classList.add('visible');
    window.addEventListener('keydown', this.handleKeyDown);
  }

  /**
   * Hide the spell menu
   */
  hide(): void {
    this.overlay.classList.remove('visible');
    window.removeEventListener('keydown', this.handleKeyDown);
    this.onCloseHandler?.();
  }

  /**
   * Check if menu is visible
   */
  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  /**
   * Toggle visibility
   */
  toggle(): void {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Set close callback
   */
  setOnClose(handler: () => void): void {
    this.onCloseHandler = handler;
  }

  /**
   * Refresh the menu display
   */
  refresh(): void {
    // Check if player has a caster component
    if (!this.casterManager.hasCaster()) {
      this.renderNoCaster();
      return;
    }

    this.renderHeader('Caster');
    this.spells = this.casterManager.getAvailableSpells();

    if (this.spells.length === 0) {
      this.renderEmpty();
      return;
    }

    this.renderSpells();
    this.selectedIndex = 0;
    this.updateSelection();
  }

  private renderHeader(casterName: string): void {
    const battery = this.casterManager.getBattery();
    const batteryTier = this.casterManager.getBatteryTier();
    const resonance = this.casterManager.getResonance();
    const chaosChance = this.casterManager.getChaosChance();

    const batteryClass = batteryTier === 'full' ? '' : batteryTier;
    const chaosWarning = chaosChance > 0 ? `<span class="spell-menu-chaos-warning" title="Chaos risk: ${Math.round(chaosChance * 100)}%">⚠️</span>` : '';

    this.header.innerHTML = `
      <div class="spell-menu-caster-name">${casterName}</div>
      <div class="spell-menu-meters">
        <div class="spell-menu-meter">
          <span class="spell-menu-meter-label">Battery</span>
          <div class="spell-menu-meter-bar">
            <div class="spell-menu-meter-fill battery ${batteryClass}" style="width: ${battery}%"></div>
          </div>
          <span class="spell-menu-meter-value">${Math.round(battery)}%</span>
        </div>
        <div class="spell-menu-meter">
          <span class="spell-menu-meter-label">${chaosWarning}Resonance</span>
          <div class="spell-menu-meter-bar">
            <div class="spell-menu-meter-fill resonance" style="width: ${resonance}%"></div>
          </div>
          <span class="spell-menu-meter-value">${Math.round(resonance)}%</span>
        </div>
      </div>
    `;
  }

  private renderSpells(): void {
    this.grid.innerHTML = '';
    const battery = this.casterManager.getBattery();

    for (let i = 0; i < this.spells.length; i++) {
      const spell = this.spells[i]!;
      const canCast = this.casterManager.canCastSpell(spell.id);
      const insufficientBattery = battery < spell.batteryCost;

      const spellEl = document.createElement('div');
      spellEl.className = 'spell-menu-spell';
      if (!canCast.canCast) {
        spellEl.classList.add('disabled');
      }
      if (i === this.selectedIndex) {
        spellEl.classList.add('selected');
      }

      spellEl.innerHTML = `
        <div class="spell-menu-spell-icon">${spell.icon || '?'}</div>
        <div class="spell-menu-spell-name">${spell.name}</div>
        <div class="spell-menu-spell-cost ${insufficientBattery ? 'insufficient' : ''}">Cost: ${spell.batteryCost}</div>
      `;

      spellEl.addEventListener('click', () => {
        this.selectedIndex = i;
        this.updateSelection();
        if (canCast.canCast) {
          this.castSelectedSpell();
        }
      });

      spellEl.addEventListener('mouseenter', () => {
        this.selectedIndex = i;
        this.updateSelection();
      });

      this.grid.appendChild(spellEl);
    }
  }

  private renderEmpty(): void {
    this.grid.innerHTML = '<div class="spell-menu-empty">No spells available</div>';
    this.description.innerHTML = '';
  }

  private renderNoCaster(): void {
    this.header.innerHTML = '<div class="spell-menu-caster-name">No Caster Equipped</div>';
    this.grid.innerHTML = '<div class="spell-menu-no-caster">Equip a caster from your inventory to cast spells</div>';
    this.description.innerHTML = '';
    this.spells = [];
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    this.overlay.remove();
  }
}
