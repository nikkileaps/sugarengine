/**
 * Shows a "Press E to talk" prompt when near an NPC
 * Styled to match the dialogue box
 */
export class InteractionPrompt {
  private element: HTMLDivElement;
  private keyEl: HTMLSpanElement;
  private textEl: HTMLSpanElement;

  constructor(container: HTMLElement) {
    // Inject styles
    this.injectStyles();

    this.element = document.createElement('div');
    this.element.style.cssText = `
      position: absolute;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(180deg, rgba(35, 30, 45, 0.95) 0%, rgba(25, 22, 35, 0.95) 100%);
      border: 2px solid rgba(180, 160, 140, 0.35);
      border-radius: 12px;
      padding: 12px 20px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 15px;
      color: #f0e6d8;
      pointer-events: none;
      display: none;
      z-index: 100;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
      opacity: 0;
      animation: promptFadeIn 0.2s ease-out forwards;
    `;

    // Key badge
    this.keyEl = document.createElement('span');
    this.keyEl.className = 'interaction-key';
    this.keyEl.textContent = 'E';
    this.element.appendChild(this.keyEl);

    // Text
    this.textEl = document.createElement('span');
    this.textEl.textContent = ' to talk';
    this.element.appendChild(this.textEl);

    container.appendChild(this.element);
  }

  private injectStyles(): void {
    if (document.getElementById('interaction-prompt-styles')) return;

    const style = document.createElement('style');
    style.id = 'interaction-prompt-styles';
    style.textContent = `
      @keyframes promptFadeIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(5px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }

      .interaction-key {
        display: inline-block;
        background: linear-gradient(135deg, rgba(136, 180, 220, 0.3) 0%, rgba(100, 140, 180, 0.2) 100%);
        border: 1px solid rgba(136, 180, 220, 0.4);
        border-radius: 6px;
        padding: 2px 8px;
        margin-right: 6px;
        font-weight: 600;
        font-size: 14px;
        color: #a8d4f0;
        animation: keyPulse 2s ease-in-out infinite;
      }

      @keyframes keyPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(136, 180, 220, 0.3); }
        50% { box-shadow: 0 0 8px 2px rgba(136, 180, 220, 0.2); }
      }
    `;
    document.head.appendChild(style);
  }

  show(npcName?: string): void {
    if (npcName) {
      this.textEl.textContent = ` to talk to ${npcName}`;
    } else {
      this.textEl.textContent = ' to talk';
    }

    // Reset animation
    this.element.style.animation = 'none';
    void this.element.offsetHeight;
    this.element.style.animation = 'promptFadeIn 0.2s ease-out forwards';

    this.element.style.display = 'block';
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  dispose(): void {
    this.element.remove();
  }
}
