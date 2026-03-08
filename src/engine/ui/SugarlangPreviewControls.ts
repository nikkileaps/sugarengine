/**
 * SugarlangPreviewControls — floating control panel for previewing
 * Sugarlang scenes in different language/band configurations.
 *
 * Provides:
 *   - Language direction toggle (en→es / es→en)
 *   - Band selector (B0, B1, B2, B3, B4)
 */

export interface SugarlangPreviewConfig {
  targetLanguage: string;
  supportLanguage: string;
  bandOverride: string;
}

type ConfigChangeHandler = (config: SugarlangPreviewConfig) => void;

export class SugarlangPreviewControls {
  private container: HTMLDivElement;
  private changeHandler: ConfigChangeHandler | null = null;
  private config: SugarlangPreviewConfig = {
    targetLanguage: 'es',
    supportLanguage: 'en',
    bandOverride: 'B0',
  };

  constructor(parent: HTMLElement) {
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'sl-preview-controls';

    // Title
    const title = document.createElement('div');
    title.className = 'sl-preview-title';
    title.textContent = 'Sugarlang';
    this.container.appendChild(title);

    // Language direction
    const langGroup = this.createGroup('Language');
    const langBtns = document.createElement('div');
    langBtns.className = 'sl-preview-btn-row';

    const esBtn = this.createToggleBtn('en → es', () => this.setLanguage('es', 'en'));
    const enBtn = this.createToggleBtn('es → en', () => this.setLanguage('en', 'es'));
    esBtn.classList.add('sl-active');

    this.container.addEventListener('click', () => {
      // Re-highlight active buttons after any click
      esBtn.classList.toggle('sl-active', this.config.targetLanguage === 'es');
      enBtn.classList.toggle('sl-active', this.config.targetLanguage === 'en');
    });

    langBtns.appendChild(esBtn);
    langBtns.appendChild(enBtn);
    langGroup.appendChild(langBtns);
    this.container.appendChild(langGroup);

    // Band selector
    const bandGroup = this.createGroup('Band');
    const bandBtns = document.createElement('div');
    bandBtns.className = 'sl-preview-btn-row';

    const bands = ['B0', 'B1', 'B2', 'B3', 'B4'];
    const bandBtnEls: HTMLButtonElement[] = [];
    for (const band of bands) {
      const btn = this.createToggleBtn(band, () => {
        this.config.bandOverride = band;
        bandBtnEls.forEach((b) => b.classList.toggle('sl-active', b.textContent === band));
        this.emitChange();
      });
      if (band === 'B0') btn.classList.add('sl-active');
      bandBtnEls.push(btn);
      bandBtns.appendChild(btn);
    }
    bandGroup.appendChild(bandBtns);
    this.container.appendChild(bandGroup);

    parent.appendChild(this.container);
  }

  setOnChange(handler: ConfigChangeHandler): void {
    this.changeHandler = handler;
  }

  getConfig(): Readonly<SugarlangPreviewConfig> {
    return { ...this.config };
  }

  show(): void {
    this.container.style.display = '';
  }

  hide(): void {
    this.container.style.display = 'none';
  }

  private setLanguage(target: string, support: string): void {
    this.config.targetLanguage = target;
    this.config.supportLanguage = support;
    this.emitChange();
  }

  private emitChange(): void {
    this.changeHandler?.({ ...this.config });
  }

  private createGroup(label: string): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'sl-preview-group';
    const lbl = document.createElement('div');
    lbl.className = 'sl-preview-label';
    lbl.textContent = label;
    group.appendChild(lbl);
    return group;
  }

  private createToggleBtn(text: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'sl-preview-btn';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private injectStyles(): void {
    if (document.getElementById('sl-preview-controls-styles')) return;
    const style = document.createElement('style');
    style.id = 'sl-preview-controls-styles';
    style.textContent = `
      .sl-preview-controls {
        position: absolute;
        top: 230px;
        left: 12px;
        z-index: 300;
        background: rgba(20, 18, 28, 0.92);
        border: 1px solid rgba(180, 160, 140, 0.3);
        border-radius: 10px;
        padding: 10px 12px;
        font-family: 'Segoe UI', system-ui, sans-serif;
        pointer-events: auto;
        min-width: 140px;
      }

      .sl-preview-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: rgba(136, 180, 220, 0.8);
        margin-bottom: 8px;
      }

      .sl-preview-group {
        margin-bottom: 6px;
      }

      .sl-preview-label {
        font-size: 10px;
        color: rgba(220, 210, 200, 0.6);
        text-transform: uppercase;
        letter-spacing: 0.6px;
        margin-bottom: 4px;
      }

      .sl-preview-btn-row {
        display: flex;
        gap: 4px;
      }

      .sl-preview-btn {
        flex: 1;
        padding: 5px 8px;
        font-size: 11px;
        font-weight: 500;
        border: 1px solid rgba(180, 160, 140, 0.25);
        background: rgba(255, 255, 255, 0.04);
        color: rgba(220, 210, 200, 0.7);
        border-radius: 6px;
        cursor: pointer;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }

      .sl-preview-btn:hover {
        background: rgba(136, 180, 220, 0.1);
        color: #dcefff;
      }

      .sl-preview-btn.sl-active {
        background: rgba(136, 180, 220, 0.2);
        border-color: rgba(136, 180, 220, 0.5);
        color: #dcefff;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    this.container.remove();
  }
}
