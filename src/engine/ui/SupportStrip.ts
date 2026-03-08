/**
 * Support-language strip — displays a support-language gloss under
 * the target-language NPC utterance with highlighted target-language
 * keywords preserved inline.
 *
 * Used by Sugarlang B0/B1 to provide scaffolding for beginner learners.
 */

export class SupportStrip {
  private container: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.injectStyles();
    this.container = document.createElement('div');
    this.container.className = 'sl-support-strip';
    parent.appendChild(this.container);
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

  hide(): void {
    this.container.style.display = 'none';
    this.container.innerHTML = '';
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
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    this.container.remove();
  }
}
