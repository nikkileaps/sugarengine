import { DialogueNode, DialogueNext } from '../dialogue';

export type DialoguePanelCallback = (selected?: DialogueNext) => void;
export type DialogueCancelCallback = () => void;

/**
 * Disco Elysium-style dialogue panel
 * - Right side of screen, semi-transparent
 * - Dialogue history scrolls up as new nodes appear
 * - Choices appear at the bottom
 */
export class DialoguePanel {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private historyContainer: HTMLDivElement;
  private choicesContainer: HTMLDivElement;

  private typewriterInterval: number | null = null;
  private currentTextEl: HTMLSpanElement | null = null;
  private fullText = '';
  private displayedText = '';
  private isTyping = false;
  private typewriterSpeed = 25; // ms per character

  private currentNext: DialogueNext[] = [];
  private onComplete: DialoguePanelCallback | null = null;
  private onCancel: DialogueCancelCallback | null = null;

  // Speaker color palette (rotating through these)
  private speakerColors: Record<string, string> = {};
  private colorPalette = [
    '#e8a87c', // Warm orange
    '#85c1e9', // Light blue
    '#82e0aa', // Soft green
    '#d7bde2', // Lavender
    '#f9e79f', // Soft yellow
    '#f1948a', // Soft coral
    '#abebc6', // Mint
    '#d2b4de', // Light purple
  ];
  private colorIndex = 0;

  constructor(parentContainer: HTMLElement) {
    this.injectStyles();

    // Main container (full screen overlay for event capture)
    this.container = document.createElement('div');
    this.container.className = 'dialogue-panel-container';

    // Right-side panel
    this.panel = document.createElement('div');
    this.panel.className = 'dialogue-panel';

    // Scrollable history area
    this.historyContainer = document.createElement('div');
    this.historyContainer.className = 'dialogue-panel-history';
    this.panel.appendChild(this.historyContainer);

    // Choices area (fixed at bottom)
    this.choicesContainer = document.createElement('div');
    this.choicesContainer.className = 'dialogue-panel-choices';
    this.panel.appendChild(this.choicesContainer);

    this.container.appendChild(this.panel);
    parentContainer.appendChild(this.container);

    // Listen for keyboard input
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  private injectStyles(): void {
    if (document.getElementById('dialogue-panel-styles')) return;

    const style = document.createElement('style');
    style.id = 'dialogue-panel-styles';
    style.textContent = `
      .dialogue-panel-container {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: none;
        justify-content: flex-end;
        align-items: stretch;
        z-index: 200;
        pointer-events: none;
      }

      .dialogue-panel-container.visible {
        display: flex;
      }

      .dialogue-panel {
        width: 380px;
        max-width: 40%;
        height: 100%;
        background: linear-gradient(
          180deg,
          rgba(20, 18, 28, 0.85) 0%,
          rgba(15, 13, 22, 0.9) 100%
        );
        border-left: 2px solid rgba(120, 100, 80, 0.3);
        display: flex;
        flex-direction: column;
        font-family: 'Segoe UI', system-ui, sans-serif;
        pointer-events: auto;
        box-shadow: -8px 0 32px rgba(0, 0, 0, 0.4);
      }

      .dialogue-panel-history {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* Custom scrollbar */
      .dialogue-panel-history::-webkit-scrollbar {
        width: 6px;
      }

      .dialogue-panel-history::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
      }

      .dialogue-panel-history::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 3px;
      }

      .dialogue-panel-history::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.25);
      }

      .dialogue-entry {
        opacity: 0;
        transform: translateY(10px);
        animation: dialogueEntryIn 0.3s ease-out forwards;
      }

      @keyframes dialogueEntryIn {
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .dialogue-entry-speaker {
        font-weight: 600;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }

      .dialogue-entry-text {
        font-size: 15px;
        line-height: 1.6;
        color: #e8e0d8;
      }

      .dialogue-entry.player .dialogue-entry-speaker {
        color: #f0e6d8;
      }

      .dialogue-entry.player .dialogue-entry-text {
        color: rgba(240, 230, 216, 0.85);
        font-style: italic;
      }

      .dialogue-entry.player-choice {
        padding-left: 16px;
        border-left: 2px solid rgba(240, 230, 216, 0.3);
      }

      .dialogue-entry.player-choice .dialogue-entry-text {
        color: rgba(240, 230, 216, 0.7);
        font-style: italic;
      }

      .dialogue-panel-choices {
        padding: 16px 24px 20px;
        border-top: 1px solid rgba(120, 100, 80, 0.2);
        background: rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .dialogue-panel-choices:empty {
        display: none;
      }

      .dialogue-choice-btn {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(180, 160, 140, 0.2);
        border-radius: 6px;
        padding: 10px 14px;
        color: #e8ddd0;
        font-size: 14px;
        cursor: pointer;
        text-align: left;
        transition: all 0.15s ease-out;
        font-family: inherit;
        display: flex;
        align-items: flex-start;
        gap: 10px;
      }

      .dialogue-choice-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(180, 160, 140, 0.4);
      }

      .dialogue-choice-btn .choice-number {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        line-height: 20px;
        text-align: center;
        background: rgba(232, 168, 124, 0.25);
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        color: #e8a87c;
      }

      .dialogue-choice-btn .choice-text {
        flex: 1;
      }

      .dialogue-continue-hint {
        text-align: center;
        padding: 12px;
        font-size: 12px;
        color: rgba(240, 230, 216, 0.4);
        animation: dialoguePulse 2s ease-in-out infinite;
      }

      @keyframes dialoguePulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.7; }
      }

      .dialogue-cursor {
        display: inline-block;
        width: 2px;
        height: 1em;
        background: #e8e0d8;
        margin-left: 1px;
        vertical-align: text-bottom;
        animation: cursorBlink 0.8s ease-in-out infinite;
      }

      @keyframes cursorBlink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible()) return;

    // Escape to cancel/close dialogue
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.onCancel) {
        this.onCancel();
      }
      return;
    }

    if (e.code === 'KeyE' || e.code === 'Space') {
      e.preventDefault();
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
   * Get or assign a color for a speaker
   */
  private getSpeakerColor(speaker: string): string {
    if (!this.speakerColors[speaker]) {
      this.speakerColors[speaker] = this.colorPalette[this.colorIndex % this.colorPalette.length]!;
      this.colorIndex++;
    }
    return this.speakerColors[speaker]!;
  }

  /**
   * Show a dialogue node (adds to history)
   */
  show(node: DialogueNode, onComplete: DialoguePanelCallback, onCancel?: DialogueCancelCallback): void {
    this.onComplete = onComplete;
    this.onCancel = onCancel ?? null;
    this.currentNext = node.next ?? [];

    // Create dialogue entry
    const entry = document.createElement('div');
    entry.className = 'dialogue-entry';

    // Check if this is the player speaking
    const isPlayer = node.speaker?.toLowerCase() === 'you' ||
                     node.speaker?.toLowerCase() === 'player';
    if (isPlayer) {
      entry.classList.add('player');
    }

    // Speaker name
    if (node.speaker) {
      const speakerEl = document.createElement('div');
      speakerEl.className = 'dialogue-entry-speaker';
      speakerEl.textContent = node.speaker;
      speakerEl.style.color = isPlayer ? '#f0e6d8' : this.getSpeakerColor(node.speaker);
      entry.appendChild(speakerEl);
    }

    // Text content
    const textEl = document.createElement('div');
    textEl.className = 'dialogue-entry-text';
    entry.appendChild(textEl);

    // Add to history
    this.historyContainer.appendChild(entry);

    // Clear choices while typing
    this.choicesContainer.innerHTML = '';

    // Start typewriter effect
    this.currentTextEl = document.createElement('span');
    textEl.appendChild(this.currentTextEl);

    const cursorEl = document.createElement('span');
    cursorEl.className = 'dialogue-cursor';
    textEl.appendChild(cursorEl);

    this.startTypewriter(node.text, cursorEl);

    // Show container
    this.container.classList.add('visible');

    // Scroll to bottom
    this.scrollToBottom();
  }

  private startTypewriter(text: string, cursorEl: HTMLSpanElement): void {
    this.fullText = text;
    this.displayedText = '';
    this.isTyping = true;

    let index = 0;
    this.typewriterInterval = window.setInterval(() => {
      if (index < this.fullText.length) {
        this.displayedText += this.fullText[index];
        if (this.currentTextEl) {
          this.currentTextEl.textContent = this.displayedText;
        }
        index++;
        this.scrollToBottom();
      } else {
        this.finishTypewriter(cursorEl);
      }
    }, this.typewriterSpeed);
  }

  private skipTypewriter(): void {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    if (this.currentTextEl) {
      this.currentTextEl.textContent = this.fullText;
    }
    // Find and remove cursor
    const cursor = this.historyContainer.querySelector('.dialogue-cursor');
    if (cursor) {
      this.finishTypewriter(cursor as HTMLSpanElement);
    }
  }

  private finishTypewriter(cursorEl: HTMLSpanElement): void {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    this.isTyping = false;

    // Remove cursor
    cursorEl.remove();

    // Show choices or continue hint
    if (this.currentNext.length > 1) {
      this.showChoices();
    } else {
      this.showContinueHint();
    }

    this.scrollToBottom();
  }

  private showChoices(): void {
    this.choicesContainer.innerHTML = '';

    this.currentNext.forEach((nextItem, index) => {
      const btn = document.createElement('button');
      btn.className = 'dialogue-choice-btn';

      const numberSpan = document.createElement('span');
      numberSpan.className = 'choice-number';
      numberSpan.textContent = String(index + 1);

      const textSpan = document.createElement('span');
      textSpan.className = 'choice-text';
      textSpan.textContent = nextItem.text ?? 'Continue';

      btn.appendChild(numberSpan);
      btn.appendChild(textSpan);

      btn.addEventListener('click', () => {
        // Add player choice to history before advancing
        this.addPlayerChoice(nextItem.text ?? 'Continue');
        if (this.onComplete) {
          this.onComplete(nextItem);
        }
      });

      this.choicesContainer.appendChild(btn);
    });
  }

  private showContinueHint(): void {
    this.choicesContainer.innerHTML = '';

    const hint = document.createElement('div');
    hint.className = 'dialogue-continue-hint';
    hint.innerHTML = 'Press <span style="color: rgba(240, 230, 216, 0.6);">E</span> to continue';
    this.choicesContainer.appendChild(hint);
  }

  /**
   * Add player's choice to history (shows what they selected)
   */
  private addPlayerChoice(text: string): void {
    const entry = document.createElement('div');
    entry.className = 'dialogue-entry player-choice';

    const textEl = document.createElement('div');
    textEl.className = 'dialogue-entry-text';
    textEl.textContent = `"${text}"`;
    entry.appendChild(textEl);

    this.historyContainer.appendChild(entry);
    this.choicesContainer.innerHTML = '';
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.historyContainer.scrollTop = this.historyContainer.scrollHeight;
    });
  }

  /**
   * Clear dialogue history (call when starting new conversation)
   */
  clearHistory(): void {
    this.historyContainer.innerHTML = '';
    this.choicesContainer.innerHTML = '';
    this.speakerColors = {};
    this.colorIndex = 0;
  }

  hide(): void {
    this.container.classList.remove('visible');
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    this.isTyping = false;
    this.onComplete = null;
    this.currentTextEl = null;
    this.choicesContainer.innerHTML = '';
  }

  isVisible(): boolean {
    return this.container.classList.contains('visible');
  }

  dispose(): void {
    this.hide();
    this.container.remove();
  }
}
