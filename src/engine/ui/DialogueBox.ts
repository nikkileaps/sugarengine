import { DialogueNode, DialogueNext } from '../dialogue';

export type DialogueBoxCallback = (selected?: DialogueNext) => void;
export type DialogueCancelCallback = () => void;

/**
 * Dialogue UI with speaker name, text, and choices
 * Cozy styling with animations and typewriter effect
 */
export class DialogueBox {
  private container: HTMLDivElement;
  private innerBox: HTMLDivElement;
  private closeBtn: HTMLButtonElement;
  private speakerEl: HTMLDivElement;
  private textEl: HTMLSpanElement;
  private cursorEl: HTMLSpanElement;
  private choicesEl: HTMLDivElement;
  private continueHint: HTMLDivElement;

  private typewriterInterval: number | null = null;
  private fullText = '';
  private displayedText = '';
  private isTyping = false;
  private typewriterSpeed = 30; // ms per character

  private currentNext: DialogueNext[] = [];
  private onComplete: DialogueBoxCallback | null = null;
  private onCancel: DialogueCancelCallback | null = null;

  constructor(parentContainer: HTMLElement) {
    // Inject CSS animations
    this.injectStyles();

    // Main container (for positioning)
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position: absolute;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: 85%;
      max-width: 720px;
      display: none;
      z-index: 200;
    `;

    // Inner box with styling
    this.innerBox = document.createElement('div');
    this.innerBox.style.cssText = `
      position: relative;
      background: linear-gradient(180deg, rgba(35, 30, 45, 0.97) 0%, rgba(25, 22, 35, 0.98) 100%);
      border: 3px solid rgba(180, 160, 140, 0.4);
      border-radius: 16px;
      padding: 24px 28px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #f0e6d8;
      box-shadow:
        0 8px 32px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05) inset,
        0 2px 0 rgba(255, 255, 255, 0.03) inset;
      opacity: 0;
      transform: translateY(10px);
      animation: dialogueSlideIn 0.25s ease-out forwards;
    `;
    this.container.appendChild(this.innerBox);

    // Close button (X)
    this.closeBtn = document.createElement('button');
    this.closeBtn.innerHTML = '&times;';
    this.closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      width: 28px;
      height: 28px;
      border: none;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      color: rgba(240, 230, 216, 0.5);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      transition: all 0.15s ease;
    `;
    this.closeBtn.onmouseenter = () => {
      this.closeBtn.style.background = 'rgba(255, 255, 255, 0.15)';
      this.closeBtn.style.color = 'rgba(240, 230, 216, 0.9)';
    };
    this.closeBtn.onmouseleave = () => {
      this.closeBtn.style.background = 'rgba(255, 255, 255, 0.08)';
      this.closeBtn.style.color = 'rgba(240, 230, 216, 0.5)';
    };
    this.closeBtn.onclick = () => {
      if (this.onCancel) {
        this.onCancel();
      }
    };
    this.innerBox.appendChild(this.closeBtn);

    // Speaker name label
    this.speakerEl = document.createElement('div');
    this.speakerEl.style.cssText = `
      display: inline-block;
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 12px;
      padding: 4px 12px;
      background: linear-gradient(135deg, rgba(136, 180, 220, 0.25) 0%, rgba(100, 140, 180, 0.15) 100%);
      border: 1px solid rgba(136, 180, 220, 0.3);
      border-radius: 20px;
      color: #a8d4f0;
      letter-spacing: 0.3px;
    `;
    this.innerBox.appendChild(this.speakerEl);

    // Text content with cursor
    const textContainer = document.createElement('div');
    textContainer.style.cssText = `
      font-size: 17px;
      line-height: 1.6;
      min-height: 50px;
      letter-spacing: 0.2px;
    `;

    this.textEl = document.createElement('span');
    this.cursorEl = document.createElement('span');
    this.cursorEl.style.cssText = `
      display: inline-block;
      width: 2px;
      height: 1.1em;
      background: #f0e6d8;
      margin-left: 2px;
      vertical-align: text-bottom;
      opacity: 1;
    `;
    this.cursorEl.className = 'dialogue-cursor';

    textContainer.appendChild(this.textEl);
    textContainer.appendChild(this.cursorEl);
    this.innerBox.appendChild(textContainer);

    // Choices container
    this.choicesEl = document.createElement('div');
    this.choicesEl.style.cssText = `
      margin-top: 18px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    `;
    this.innerBox.appendChild(this.choicesEl);

    // Continue hint
    this.continueHint = document.createElement('div');
    this.continueHint.style.cssText = `
      margin-top: 16px;
      font-size: 13px;
      color: rgba(240, 230, 216, 0.4);
      text-align: center;
      display: none;
      animation: dialoguePulse 2s ease-in-out infinite;
    `;
    this.continueHint.innerHTML = '▼ Press <span style="color: rgba(240, 230, 216, 0.6); font-weight: 500;">E</span> to continue';
    this.innerBox.appendChild(this.continueHint);

    parentContainer.appendChild(this.container);

    // Listen for E key to advance dialogue
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  private injectStyles(): void {
    if (document.getElementById('dialogue-box-styles')) return;

    const style = document.createElement('style');
    style.id = 'dialogue-box-styles';
    style.textContent = `
      @keyframes dialogueSlideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes dialoguePulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }

      @keyframes dialogueCursorBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

      .dialogue-cursor-blink {
        animation: dialogueCursorBlink 0.8s ease-in-out infinite;
      }

      .dialogue-choice-btn {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
        border: 1px solid rgba(180, 160, 140, 0.25);
        border-radius: 10px;
        padding: 12px 16px;
        color: #e8ddd0;
        font-size: 15px;
        cursor: pointer;
        text-align: left;
        transition: all 0.15s ease-out;
        font-family: inherit;
      }

      .dialogue-choice-btn:hover {
        background: linear-gradient(135deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.06) 100%);
        border-color: rgba(180, 160, 140, 0.4);
        transform: translateX(4px);
      }

      .dialogue-choice-btn .choice-number {
        display: inline-block;
        width: 22px;
        height: 22px;
        line-height: 22px;
        text-align: center;
        background: rgba(136, 180, 220, 0.2);
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        margin-right: 10px;
        color: #a8d4f0;
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible()) return;

    // Escape to cancel/close dialogue
    if (e.code === 'Escape') {
      if (this.onCancel) {
        this.onCancel();
      }
      return;
    }

    if (e.code === 'KeyE') {
      if (this.isTyping) {
        // Skip typewriter, show full text
        this.skipTypewriter();
      } else if (this.currentNext.length <= 1) {
        // No choices (0 or 1 connection), advance dialogue
        if (this.onComplete) {
          this.onComplete(this.currentNext[0]); // undefined if no next
        }
      }
    }

    // Number keys for choices (only when multiple options)
    if (this.currentNext.length > 1 && !this.isTyping) {
      const num = parseInt(e.key);
      if (num >= 1 && num <= this.currentNext.length) {
        const selected = this.currentNext[num - 1];
        if (selected && this.onComplete) {
          this.onComplete(selected);
        }
      }
    }
  }

  /**
   * Show a dialogue node
   */
  show(node: DialogueNode, onComplete: DialogueBoxCallback, onCancel?: DialogueCancelCallback): void {
    this.onComplete = onComplete;
    this.onCancel = onCancel ?? null;
    this.currentNext = node.next ?? [];

    // Set speaker
    if (node.speaker) {
      this.speakerEl.textContent = node.speaker;
      this.speakerEl.style.display = 'inline-block';
    } else {
      this.speakerEl.style.display = 'none';
    }

    // Clear previous
    this.choicesEl.innerHTML = '';
    this.continueHint.style.display = 'none';

    // Reset cursor
    this.cursorEl.classList.remove('dialogue-cursor-blink');
    this.cursorEl.style.opacity = '1';

    // Reset animation for subsequent dialogues
    this.innerBox.style.animation = 'none';
    // Force reflow
    void this.innerBox.offsetHeight;
    this.innerBox.style.animation = 'dialogueSlideIn 0.25s ease-out forwards';

    // Start typewriter
    this.startTypewriter(node.text);

    this.container.style.display = 'block';
  }

  private startTypewriter(text: string): void {
    this.fullText = text;
    this.displayedText = '';
    this.isTyping = true;
    this.textEl.textContent = '';

    let index = 0;
    this.typewriterInterval = window.setInterval(() => {
      if (index < this.fullText.length) {
        this.displayedText += this.fullText[index];
        this.textEl.textContent = this.displayedText;
        index++;
      } else {
        this.finishTypewriter();
      }
    }, this.typewriterSpeed);
  }

  private skipTypewriter(): void {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    this.textEl.textContent = this.fullText;
    this.finishTypewriter();
  }

  private finishTypewriter(): void {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    this.isTyping = false;

    // Start cursor blinking
    this.cursorEl.classList.add('dialogue-cursor-blink');

    // Show choices or continue hint
    if (this.currentNext.length > 1) {
      // Multiple options - show choice buttons
      this.cursorEl.style.opacity = '0'; // Hide cursor when choices appear
      this.showChoices();
    } else {
      // Single connection or end - show continue hint
      this.continueHint.style.display = 'block';
    }
  }

  private showChoices(): void {
    this.choicesEl.innerHTML = '';

    this.currentNext.forEach((nextItem, index) => {
      const btn = document.createElement('button');
      btn.className = 'dialogue-choice-btn';

      // Create number badge
      const numberSpan = document.createElement('span');
      numberSpan.className = 'choice-number';
      numberSpan.textContent = String(index + 1);

      btn.appendChild(numberSpan);
      btn.appendChild(document.createTextNode(nextItem.text ?? 'Continue'));

      btn.addEventListener('click', () => {
        if (this.onComplete) {
          this.onComplete(nextItem);
        }
      });

      this.choicesEl.appendChild(btn);
    });
  }

  hide(): void {
    this.container.style.display = 'none';
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    this.isTyping = false;
    this.onComplete = null;
    this.cursorEl.classList.remove('dialogue-cursor-blink');
  }

  isVisible(): boolean {
    return this.container.style.display !== 'none';
  }

  dispose(): void {
    this.hide();
    this.container.remove();
  }
}
