import { Screen, COMMON_SCREEN_STYLES } from './Screen';
import { SaveLoadMode, ScreenShowOptions, SaveSlotDisplay } from './types';
import type { SaveSlotMetadata } from '../save';

/**
 * Save/Load slot selection screen
 */
export class SaveLoadScreen extends Screen {
  private mode: SaveLoadMode = 'load';
  private slots: SaveSlotDisplay[] = [];
  private slotContainer: HTMLDivElement | null = null;
  private headerTitle: HTMLHeadingElement | null = null;
  private onSelectHandler: ((slotId: string) => void) | null = null;

  protected getClassName(): string {
    return 'screen save-load-screen';
  }

  protected getStyleId(): string {
    return 'save-load-screen-styles';
  }

  protected getStyles(): string {
    return `
      ${COMMON_SCREEN_STYLES}

      .save-load-screen {
        background: rgba(0, 0, 0, 0.85);
        z-index: 500;
        flex-direction: column;
      }

      .save-load-panel {
        background: linear-gradient(180deg, rgba(40, 35, 50, 0.98) 0%, rgba(30, 27, 40, 0.98) 100%);
        border: 3px solid rgba(180, 160, 140, 0.4);
        border-radius: 16px;
        width: 90%;
        max-width: 500px;
        padding: 24px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
      }

      .save-load-header {
        text-align: center;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 2px solid rgba(180, 160, 140, 0.2);
      }

      .save-load-header h2 {
        margin: 0 0 8px 0;
        font-size: 22px;
        font-weight: 600;
        color: #f0e6d8;
      }

      .save-load-hint {
        font-size: 13px;
        color: rgba(240, 230, 216, 0.5);
      }

      .save-slot-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
      }

      .save-slot {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%);
        border: 1px solid rgba(180, 160, 140, 0.2);
        border-radius: 10px;
        padding: 14px 16px;
        cursor: pointer;
        transition: all 0.15s ease-out;
      }

      .save-slot:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.04) 100%);
        border-color: rgba(180, 160, 140, 0.35);
      }

      .save-slot.selected {
        background: linear-gradient(135deg, rgba(136, 180, 220, 0.2) 0%, rgba(100, 140, 180, 0.1) 100%);
        border-color: rgba(136, 180, 220, 0.4);
      }

      .save-slot.empty {
        opacity: 0.6;
      }

      .save-slot-name {
        font-size: 15px;
        font-weight: 500;
        color: #f0e6d8;
        margin-bottom: 4px;
      }

      .save-slot-meta {
        font-size: 12px;
        color: rgba(240, 230, 216, 0.6);
      }

      .save-slot-empty-text {
        font-size: 13px;
        color: rgba(240, 230, 216, 0.4);
        font-style: italic;
      }

      .save-slot-date {
        font-size: 11px;
        color: rgba(240, 230, 216, 0.4);
        margin-top: 4px;
      }

      .save-load-footer {
        text-align: center;
        padding-top: 16px;
        border-top: 1px solid rgba(180, 160, 140, 0.15);
      }
    `;
  }

  protected buildUI(): void {
    const panel = document.createElement('div');
    panel.className = 'save-load-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'save-load-header';

    this.headerTitle = document.createElement('h2');
    this.headerTitle.textContent = 'Load Game';
    header.appendChild(this.headerTitle);

    const hint = document.createElement('div');
    hint.className = 'save-load-hint';
    hint.textContent = 'Select a save slot';
    header.appendChild(hint);

    panel.appendChild(header);

    // Slot list
    this.slotContainer = document.createElement('div');
    this.slotContainer.className = 'save-slot-list';
    panel.appendChild(this.slotContainer);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'save-load-footer key-hint';
    footer.innerHTML = '<span class="key">Enter</span> Select <span class="key">Esc</span> Back';
    panel.appendChild(footer);

    this.element.appendChild(panel);
  }

  show(options?: ScreenShowOptions): void {
    if (options?.mode) {
      this.mode = options.mode;
    }
    // Update header
    if (this.headerTitle) {
      this.headerTitle.textContent = this.mode === 'save' ? 'Save Game' : 'Load Game';
    }

    this.buildSlotList();
    super.show(options);
  }

  /**
   * Set slot metadata from SaveManager
   */
  setSlots(metadata: SaveSlotMetadata[]): void {
    // Create display slots for all slots (empty or filled)
    const slotIds = ['autosave', 'slot1', 'slot2', 'slot3'];

    this.slots = slotIds.map(slotId => {
      const meta = metadata.find(m => m.slotId === slotId);
      if (meta) {
        return {
          slotId: meta.slotId,
          isEmpty: false,
          name: this.getSlotDisplayName(meta.slotId),
          playTime: this.formatPlayTime(meta.playTime),
          regionName: meta.playerRegion,
          savedAt: this.formatDate(meta.savedAt)
        };
      } else {
        return {
          slotId,
          isEmpty: true,
          name: this.getSlotDisplayName(slotId)
        };
      }
    });
  }

  private getSlotDisplayName(slotId: string): string {
    if (slotId === 'autosave') return 'Autosave';
    if (slotId === 'slot1') return 'Slot 1';
    if (slotId === 'slot2') return 'Slot 2';
    if (slotId === 'slot3') return 'Slot 3';
    return slotId;
  }

  private formatPlayTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  private formatDate(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private buildSlotList(): void {
    if (!this.slotContainer) return;

    // Filter slots based on mode
    // In load mode, show all slots (can only select non-empty)
    // In save mode, show all slots except autosave
    const displaySlots = this.mode === 'save'
      ? this.slots.filter(s => s.slotId !== 'autosave')
      : this.slots;

    this.menuItems = displaySlots.map(slot => ({
      id: slot.slotId,
      label: slot.name,
      action: () => {
        if (this.onSelectHandler) {
          this.onSelectHandler(slot.slotId);
        }
      },
      // In load mode, empty slots are disabled
      // In save mode, all slots are enabled
      disabled: this.mode === 'load' && slot.isEmpty
    }));

    // Clear and rebuild
    this.slotContainer.innerHTML = '';

    displaySlots.forEach((slot, index) => {
      const slotEl = document.createElement('div');
      slotEl.className = 'save-slot';
      slotEl.dataset.index = String(index);

      if (slot.isEmpty) {
        slotEl.classList.add('empty');
      }
      if (index === this.selectedIndex) {
        slotEl.classList.add('selected');
      }

      // Name
      const nameEl = document.createElement('div');
      nameEl.className = 'save-slot-name';
      nameEl.textContent = slot.name;
      slotEl.appendChild(nameEl);

      if (slot.isEmpty) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'save-slot-empty-text';
        emptyEl.textContent = 'Empty';
        slotEl.appendChild(emptyEl);
      } else {
        // Meta info
        const metaEl = document.createElement('div');
        metaEl.className = 'save-slot-meta';
        metaEl.textContent = `${slot.playTime} - ${slot.regionName}`;
        slotEl.appendChild(metaEl);

        // Date
        const dateEl = document.createElement('div');
        dateEl.className = 'save-slot-date';
        dateEl.textContent = slot.savedAt ?? '';
        slotEl.appendChild(dateEl);
      }

      // Mouse interaction
      slotEl.addEventListener('mouseenter', () => {
        const item = this.menuItems[index];
        if (item && !item.disabled) {
          this.selectedIndex = index;
          this.updateSlotSelection();
        }
      });

      slotEl.addEventListener('click', () => {
        const item = this.menuItems[index];
        if (item && !item.disabled) {
          item.action();
        }
      });

      this.slotContainer?.appendChild(slotEl);
    });
  }

  protected updateSelection(): void {
    this.updateSlotSelection();
  }

  private updateSlotSelection(): void {
    const slots = this.slotContainer?.querySelectorAll('.save-slot');
    slots?.forEach((el, index) => {
      el.classList.toggle('selected', index === this.selectedIndex);
    });
  }

  getMode(): SaveLoadMode {
    return this.mode;
  }

  setOnSelect(handler: (slotId: string) => void): void {
    this.onSelectHandler = handler;
  }

  protected onEscape(): void {
    if (this.onBack) {
      this.onBack();
    }
  }
}
