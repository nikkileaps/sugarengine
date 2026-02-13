/**
 * Persistent bottom-left HUD showing basic control hints during gameplay.
 */
export class ControlsHint {
  private element: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.injectStyles();

    this.element = document.createElement('div');
    this.element.className = 'controls-hint';
    this.element.innerHTML = [
      '<span class="key">W</span><span class="key">A</span><span class="key">S</span><span class="key">D</span> Move',
      '<span class="key">I</span> Inventory',
      '<span class="key">Q</span> Main Menu',
    ].join('<span class="controls-hint-sep">\u00b7</span>');

    container.appendChild(this.element);
  }

  private injectStyles(): void {
    if (document.getElementById('controls-hint-styles')) return;

    const style = document.createElement('style');
    style.id = 'controls-hint-styles';
    style.textContent = `
      .controls-hint {
        position: absolute;
        bottom: 28px;
        left: 30px;
        font-family: 'Segoe UI', system-ui, sans-serif;
        font-size: 13px;
        color: rgba(240, 230, 216, 0.35);
        pointer-events: none;
        z-index: 50;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .controls-hint .key {
        display: inline-block;
        background: rgba(136, 180, 220, 0.15);
        border: 1px solid rgba(136, 180, 220, 0.2);
        border-radius: 4px;
        padding: 1px 5px;
        font-weight: 600;
        font-size: 11px;
        color: rgba(168, 212, 240, 0.5);
        margin: 0 1px;
      }

      .controls-hint-sep {
        margin: 0 6px;
        color: rgba(240, 230, 216, 0.2);
      }
    `;
    document.head.appendChild(style);
  }

  show(): void {
    this.element.style.display = 'flex';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  dispose(): void {
    this.element.remove();
  }
}
