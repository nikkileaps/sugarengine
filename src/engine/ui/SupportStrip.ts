/**
 * Support-language strip — displays a support-language gloss under
 * the target-language NPC utterance with highlighted target-language
 * keywords preserved inline.
 *
 * Used by Sugarlang B0/B1 to provide scaffolding for beginner learners.
 */

export interface GlossaryChipData {
  targetWord: string;
  supportWord: string;
  conceptId?: string;
}

type GlossaryChipTapHandler = (chip: GlossaryChipData) => void;

export class SupportStrip {
  private container: HTMLDivElement;
  private glossaryContainer: HTMLDivElement;
  private chipTapHandler: GlossaryChipTapHandler | null = null;

  constructor(parent: HTMLElement) {
    this.injectStyles();
    this.container = document.createElement('div');
    this.container.className = 'sl-support-strip';
    parent.appendChild(this.container);

    this.glossaryContainer = document.createElement('div');
    this.glossaryContainer.className = 'sl-glossary-strip';
    parent.appendChild(this.glossaryContainer);
  }

  setOnChipTap(handler: GlossaryChipTapHandler): void {
    this.chipTapHandler = handler;
  }

  /**
   * Show a support-language line. Keywords in the support text can be wrapped
   * in `<kw>...</kw>` tags to be highlighted as target-language tokens.
   */
  show(supportText: string): void {
    this.container.innerHTML = '';
    // Parse simple <kw>...</kw> tags for keyword highlighting.
    const parts = supportText.split(/(<kw>.*?<\/kw>)/g);
    for (const part of parts) {
      const kwMatch = part.match(/^<kw>(.*?)<\/kw>$/);
      if (kwMatch) {
        const span = document.createElement('span');
        span.className = 'sl-support-keyword';
        span.textContent = kwMatch[1] ?? '';
        this.container.appendChild(span);
      } else if (part) {
        this.container.appendChild(document.createTextNode(part));
      }
    }
    this.container.style.display = 'block';
  }

  /**
   * Show glossary chips (B2: always visible, B3: on-demand).
   */
  showGlossaryChips(chips: GlossaryChipData[], onDemand = false): void {
    this.glossaryContainer.innerHTML = '';

    if (onDemand) {
      // B3: show a "Show help" button that reveals chips
      const revealBtn = document.createElement('button');
      revealBtn.className = 'sl-glossary-reveal-btn';
      revealBtn.textContent = 'Show help';
      const chipRow = document.createElement('div');
      chipRow.className = 'sl-glossary-chip-row';
      chipRow.style.display = 'none';
      this.renderChipRow(chipRow, chips);
      revealBtn.addEventListener('click', () => {
        chipRow.style.display = 'flex';
        revealBtn.style.display = 'none';
      });
      this.glossaryContainer.appendChild(revealBtn);
      this.glossaryContainer.appendChild(chipRow);
    } else {
      // B2: chips always visible
      const chipRow = document.createElement('div');
      chipRow.className = 'sl-glossary-chip-row';
      this.renderChipRow(chipRow, chips);
      this.glossaryContainer.appendChild(chipRow);
    }

    this.glossaryContainer.style.display = 'block';
  }

  hideGlossary(): void {
    this.glossaryContainer.style.display = 'none';
    this.glossaryContainer.innerHTML = '';
  }

  private renderChipRow(row: HTMLDivElement, chips: GlossaryChipData[]): void {
    for (const chip of chips) {
      const el = document.createElement('button');
      el.className = 'sl-glossary-kw-chip';
      el.textContent = `${chip.targetWord} = ${chip.supportWord}`;
      el.addEventListener('click', () => {
        this.chipTapHandler?.(chip);
      });
      row.appendChild(el);
    }
  }

  hide(): void {
    this.container.style.display = 'none';
    this.container.innerHTML = '';
    this.hideGlossary();
  }

  private injectStyles(): void {
    if (document.getElementById('sl-support-strip-styles')) return;
    const style = document.createElement('style');
    style.id = 'sl-support-strip-styles';
    style.textContent = `
      .sl-support-strip {
        font-size: 13px;
        line-height: 1.5;
        color: rgba(220, 210, 200, 0.7);
        padding: 4px 10px;
        margin-top: 2px;
        border-left: 2px solid rgba(136, 180, 220, 0.3);
        font-style: italic;
        display: none;
      }
      .sl-support-keyword {
        color: rgba(180, 220, 255, 0.95);
        font-style: normal;
        font-weight: 600;
        border-bottom: 1px dotted rgba(136, 180, 220, 0.5);
        cursor: pointer;
      }
      .sl-support-keyword:hover {
        color: #dcefff;
        border-bottom-color: rgba(136, 180, 220, 0.8);
      }

      .sl-glossary-strip {
        display: none;
        padding: 4px 10px;
        margin-top: 2px;
      }

      .sl-glossary-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .sl-glossary-kw-chip {
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 500;
        color: rgba(180, 220, 255, 0.9);
        background: rgba(136, 180, 220, 0.1);
        border: 1px solid rgba(136, 180, 220, 0.3);
        border-radius: 12px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .sl-glossary-kw-chip:hover {
        background: rgba(136, 180, 220, 0.25);
        border-color: rgba(136, 180, 220, 0.5);
      }

      .sl-glossary-reveal-btn {
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 600;
        color: rgba(220, 210, 200, 0.7);
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(180, 160, 140, 0.25);
        border-radius: 6px;
        cursor: pointer;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        transition: background 0.15s;
      }
      .sl-glossary-reveal-btn:hover {
        background: rgba(136, 180, 220, 0.1);
        color: #dcefff;
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    this.container.remove();
    this.glossaryContainer.remove();
  }
}
