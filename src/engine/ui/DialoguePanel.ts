import { DialogueNode, DialogueNext, DialoguePresenter, PLAYER, PLAYER_VO, EXCERPT } from '../dialogue';

/**
 * Disco Elysium-style dialogue panel — right side of screen.
 *
 * Four layout zones:
 *   - History:     scrollable past turns
 *   - Active:      current turn with typewriter (or custom widget)
 *   - Enrichment:  plugin slot (hidden when empty)
 *   - Actions:     choices / continue / custom action buttons
 *
 * Both History and Active live inside a shared scroll container so the
 * player can scroll through the full conversation.
 */
export class DialoguePanel implements DialoguePresenter {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private scrollArea: HTMLDivElement;
  private historyContainer: HTMLDivElement;
  private activeContainer: HTMLDivElement;
  private enrichmentContainer: HTMLDivElement;
  private actionsContainer: HTMLDivElement;

  // Typewriter state
  private typewriterInterval: number | null = null;
  private currentTextEl: HTMLSpanElement | null = null;
  private fullText = '';
  private displayedText = '';
  private isTyping = false;
  private typewriterSpeed = 25;

  // Current turn state
  private currentNext: DialogueNext[] = [];
  private onComplete: ((selected?: DialogueNext) => void) | null = null;
  private onCancel: (() => void) | null = null;
  private hasActiveWidget = false;

  // Timestamp for filtering stale key events
  private visibleSince = 0;

  echoPlayerChoice = true;

  // Speaker color palette
  private speakerColors: Record<string, string> = {};
  private colorPalette = [
    '#e8a87c', '#85c1e9', '#82e0aa', '#d7bde2',
    '#f9e79f', '#f1948a', '#abebc6', '#d2b4de',
  ];
  private colorIndex = 0;

  constructor(parentContainer: HTMLElement) {
    this.injectStyles();

    // Full-screen overlay for event capture
    this.container = document.createElement('div');
    this.container.className = 'dialogue-panel-container';

    // Right-side panel
    this.panel = document.createElement('div');
    this.panel.className = 'dialogue-panel';

    // Scrollable area (history + active)
    this.scrollArea = document.createElement('div');
    this.scrollArea.className = 'dialogue-panel-scroll';

    this.historyContainer = document.createElement('div');
    this.historyContainer.className = 'dialogue-panel-history';
    this.scrollArea.appendChild(this.historyContainer);

    this.activeContainer = document.createElement('div');
    this.activeContainer.className = 'dialogue-panel-active';
    this.scrollArea.appendChild(this.activeContainer);

    this.panel.appendChild(this.scrollArea);

    // Enrichment zone (plugin slot — hidden when empty)
    this.enrichmentContainer = document.createElement('div');
    this.enrichmentContainer.className = 'dialogue-panel-enrichment';
    this.panel.appendChild(this.enrichmentContainer);

    // Actions zone (choices / continue / custom)
    this.actionsContainer = document.createElement('div');
    this.actionsContainer.className = 'dialogue-panel-actions';
    this.panel.appendChild(this.actionsContainer);

    this.container.appendChild(this.panel);
    parentContainer.appendChild(this.container);

    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  // ---------------------------------------------------------------------------
  // DialoguePresenter — lifecycle
  // ---------------------------------------------------------------------------

  show(): void {
    this.visibleSince = performance.now();
    this.container.classList.add('visible');
  }

  hide(): void {
    this.container.classList.remove('visible');
    this.stopTypewriter();
    this.isTyping = false;
    this.hasActiveWidget = false;
    this.onComplete = null;
    this.onCancel = null;
    this.currentTextEl = null;
    this.activeContainer.innerHTML = '';
    this.actionsContainer.innerHTML = '';
    this.enrichmentContainer.innerHTML = '';
  }

  clearHistory(): void {
    this.historyContainer.innerHTML = '';
    this.activeContainer.innerHTML = '';
    this.actionsContainer.innerHTML = '';
    this.enrichmentContainer.innerHTML = '';
    this.speakerColors = {};
    this.colorIndex = 0;
    this.hasActiveWidget = false;
  }

  // ---------------------------------------------------------------------------
  // DialoguePresenter — showNode
  // ---------------------------------------------------------------------------

  showNode(
    node: DialogueNode,
    onComplete: (selected?: DialogueNext) => void,
    onCancel?: () => void,
  ): void {
    // Stamp for stale-key filtering (must be set every call, not just on show)
    this.visibleSince = performance.now();

    // Graduate the current active entry to history
    this.graduateActive();

    this.onComplete = onComplete;
    this.onCancel = onCancel ?? null;
    this.currentNext = node.next ?? [];
    this.hasActiveWidget = false;

    // Build the active entry
    const entry = this.createEntry(node);
    this.activeContainer.appendChild(entry);

    // Clear actions while typing
    this.actionsContainer.innerHTML = '';

    // Typewriter effect
    const textEl = entry.querySelector('.dialogue-entry-text') as HTMLDivElement;
    this.currentTextEl = document.createElement('span');
    textEl.appendChild(this.currentTextEl);

    const cursorEl = document.createElement('span');
    cursorEl.className = 'dialogue-cursor';
    textEl.appendChild(cursorEl);

    this.startTypewriter(node.text, cursorEl);

    // Ensure visible
    this.container.classList.add('visible');
    this.scrollToBottom();
  }

  // ---------------------------------------------------------------------------
  // DialoguePresenter — extension points
  // ---------------------------------------------------------------------------

  getEnrichmentContainer(): HTMLElement {
    return this.enrichmentContainer;
  }

  getActionsContainer(): HTMLElement {
    return this.actionsContainer;
  }

  showActiveWidget(
    speakerName: string,
    renderFn: (container: HTMLElement) => void,
  ): void {
    this.graduateActive();
    this.hasActiveWidget = true;
    this.actionsContainer.innerHTML = '';

    const entry = document.createElement('div');
    entry.className = 'dialogue-entry';

    if (speakerName) {
      const speakerEl = document.createElement('div');
      speakerEl.className = 'dialogue-entry-speaker';
      speakerEl.textContent = speakerName;
      speakerEl.style.color = '#f0e6d8';
      entry.appendChild(speakerEl);
    }

    const contentEl = document.createElement('div');
    contentEl.className = 'dialogue-entry-widget';
    entry.appendChild(contentEl);

    this.activeContainer.appendChild(entry);
    renderFn(contentEl);
    this.scrollToBottom();
  }

  finalizeActiveWidget(text: string): void {
    if (!this.hasActiveWidget) return;

    // Replace the widget with static text
    const widgetEl = this.activeContainer.querySelector('.dialogue-entry-widget');
    if (widgetEl) {
      const textEl = document.createElement('div');
      textEl.className = 'dialogue-entry-text';
      textEl.textContent = text;
      widgetEl.replaceWith(textEl);
    }

    this.hasActiveWidget = false;
    this.graduateActive();
  }

  // ---------------------------------------------------------------------------
  // Internal: entry creation
  // ---------------------------------------------------------------------------

  private createEntry(node: DialogueNode): HTMLDivElement {
    const entry = document.createElement('div');
    entry.className = 'dialogue-entry';

    const isPlayer = node.speakerId === PLAYER.id;
    const isPlayerVO = node.speakerId === PLAYER_VO.id;
    const isExcerpt = node.speakerId === EXCERPT.id;

    if (isPlayer) entry.classList.add('player');
    else if (isPlayerVO) entry.classList.add('player-vo');
    else if (isExcerpt) entry.classList.add('excerpt');

    if (node.speaker) {
      const speakerEl = document.createElement('div');
      speakerEl.className = 'dialogue-entry-speaker';
      speakerEl.textContent = node.speaker;
      speakerEl.style.color =
        (isPlayer || isPlayerVO) ? '#f0e6d8' :
        isExcerpt ? '#d4c4a0' :
        this.getSpeakerColor(node.speaker);
      entry.appendChild(speakerEl);
    }

    const textEl = document.createElement('div');
    textEl.className = 'dialogue-entry-text';
    entry.appendChild(textEl);

    return entry;
  }

  // ---------------------------------------------------------------------------
  // Internal: active → history graduation
  // ---------------------------------------------------------------------------

  private graduateActive(): void {
    this.stopTypewriter();
    // Finish any in-progress typewriter
    if (this.currentTextEl && this.fullText) {
      this.currentTextEl.textContent = this.fullText;
    }
    // Remove cursor
    const cursor = this.activeContainer.querySelector('.dialogue-cursor');
    cursor?.remove();

    // Move all children to history
    while (this.activeContainer.firstChild) {
      this.historyContainer.appendChild(this.activeContainer.firstChild);
    }
    this.hasActiveWidget = false;
  }

  // ---------------------------------------------------------------------------
  // Internal: typewriter
  // ---------------------------------------------------------------------------

  private startTypewriter(text: string, cursorEl: HTMLSpanElement): void {
    this.stopTypewriter();
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
    this.stopTypewriter();
    if (this.currentTextEl) {
      this.currentTextEl.textContent = this.fullText;
    }
    const cursor = this.activeContainer.querySelector('.dialogue-cursor');
    if (cursor) {
      this.finishTypewriter(cursor as HTMLSpanElement);
    }
  }

  private stopTypewriter(): void {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
  }

  private finishTypewriter(cursorEl: HTMLSpanElement): void {
    this.stopTypewriter();
    this.isTyping = false;
    cursorEl.remove();

    // If external content was mounted into the actions container (e.g.,
    // ResponseModeUI for chip_composition), don't overwrite it.
    if (this.actionsContainer.children.length > 0) {
      // External actions already present — leave them.
    } else if (this.currentNext.length > 1) {
      this.showChoices();
    } else {
      this.showContinueHint();
    }

    this.scrollToBottom();
  }

  // ---------------------------------------------------------------------------
  // Internal: actions (choices / continue)
  // ---------------------------------------------------------------------------

  private showChoices(): void {
    this.actionsContainer.innerHTML = '';

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
        this.handleChoiceSelected(nextItem);
      });

      this.actionsContainer.appendChild(btn);
    });
  }

  private handleChoiceSelected(nextItem: DialogueNext): void {
    // Graduate active to history
    this.graduateActive();

    // Add the player's choice to history (unless suppressed for external flows
    // like sugarlang where the caller produces its own player turn).
    if (this.echoPlayerChoice) {
      const entry = document.createElement('div');
      entry.className = 'dialogue-entry player-choice';

      const speakerEl = document.createElement('div');
      speakerEl.className = 'dialogue-entry-speaker';
      speakerEl.textContent = PLAYER.displayName;
      speakerEl.style.color = '#f0e6d8';
      entry.appendChild(speakerEl);

      const textEl = document.createElement('div');
      textEl.className = 'dialogue-entry-text';
      textEl.textContent = nextItem.text ?? 'Continue';
      entry.appendChild(textEl);

      this.historyContainer.appendChild(entry);
    }

    this.actionsContainer.innerHTML = '';
    this.scrollToBottom();

    this.onComplete?.(nextItem);
  }

  private showContinueHint(): void {
    this.actionsContainer.innerHTML = '';

    const hint = document.createElement('div');
    hint.className = 'dialogue-continue-hint';
    hint.innerHTML = 'Press <span style="color: rgba(240, 230, 216, 0.6);">E</span> to continue';
    this.actionsContainer.appendChild(hint);
  }

  // ---------------------------------------------------------------------------
  // Internal: keyboard
  // ---------------------------------------------------------------------------

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible()) return;
    if (e.timeStamp < this.visibleSince) return;

    if (e.code === 'Escape') {
      e.preventDefault();
      this.onCancel?.();
      return;
    }

    if (e.code === 'KeyE' || e.code === 'Space') {
      e.preventDefault();
      if (this.isTyping) {
        this.skipTypewriter();
      } else if (this.currentNext.length <= 1 && !this.hasActiveWidget) {
        this.graduateActive();
        this.onComplete?.(this.currentNext[0]);
      }
    }

    // Number keys for choices
    if (this.currentNext.length > 1 && !this.isTyping) {
      const num = parseInt(e.key);
      if (num >= 1 && num <= this.currentNext.length) {
        const selected = this.currentNext[num - 1];
        if (selected) {
          this.handleChoiceSelected(selected);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: helpers
  // ---------------------------------------------------------------------------

  private getSpeakerColor(speaker: string): string {
    if (!this.speakerColors[speaker]) {
      this.speakerColors[speaker] = this.colorPalette[this.colorIndex % this.colorPalette.length]!;
      this.colorIndex++;
    }
    return this.speakerColors[speaker]!;
  }

  private scrollToBottom(): void {
    requestAnimationFrame(() => {
      this.scrollArea.scrollTop = this.scrollArea.scrollHeight;
    });
  }

  isVisible(): boolean {
    return this.container.classList.contains('visible');
  }

  dispose(): void {
    this.hide();
    this.container.remove();
  }

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  private injectStyles(): void {
    if (document.getElementById('dialogue-panel-styles')) return;

    const style = document.createElement('style');
    style.id = 'dialogue-panel-styles';
    style.textContent = `
      .dialogue-panel-container {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
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

      /* Scroll area (history + active) */
      .dialogue-panel-scroll {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .dialogue-panel-scroll::-webkit-scrollbar { width: 6px; }
      .dialogue-panel-scroll::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.05); }
      .dialogue-panel-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 3px; }
      .dialogue-panel-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.25); }

      .dialogue-panel-history {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .dialogue-panel-active {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* Enrichment zone (hidden when empty) */
      .dialogue-panel-enrichment:empty { display: none; }
      .dialogue-panel-enrichment {
        padding: 8px 24px;
        border-top: 1px solid rgba(120, 100, 80, 0.15);
      }

      /* Actions zone (hidden when empty) */
      .dialogue-panel-actions:empty { display: none; }
      .dialogue-panel-actions {
        padding: 16px 24px 20px;
        border-top: 1px solid rgba(120, 100, 80, 0.2);
        background: rgba(0, 0, 0, 0.2);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* Entries (shared by history + active) */
      .dialogue-entry {
        opacity: 0;
        transform: translateY(10px);
        animation: dialogueEntryIn 0.3s ease-out forwards;
      }

      @keyframes dialogueEntryIn {
        to { opacity: 1; transform: translateY(0); }
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

      .dialogue-entry.player .dialogue-entry-speaker { color: #f0e6d8; }
      .dialogue-entry.player .dialogue-entry-text { color: rgba(240, 230, 216, 0.85); }

      .dialogue-entry.player-vo .dialogue-entry-speaker { color: #f0e6d8; }
      .dialogue-entry.player-vo .dialogue-entry-text { color: rgba(240, 230, 216, 0.85); font-style: italic; }

      .dialogue-entry.excerpt { padding-left: 16px; border-left: 2px solid rgba(212, 196, 160, 0.3); }
      .dialogue-entry.excerpt .dialogue-entry-speaker { color: #d4c4a0; font-style: italic; font-family: Georgia, "Times New Roman", serif; text-transform: none; }
      .dialogue-entry.excerpt .dialogue-entry-text { color: rgba(212, 196, 160, 0.85); font-style: italic; font-family: Georgia, "Times New Roman", serif; }

      .dialogue-entry.player-choice .dialogue-entry-text { color: #e8e0d8; }

      .dialogue-entry-widget { padding: 8px 0; }

      /* Choice buttons */
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
        width: 20px; height: 20px; line-height: 20px;
        text-align: center;
        background: rgba(232, 168, 124, 0.25);
        border-radius: 4px;
        font-size: 12px; font-weight: 600;
        color: #e8a87c;
      }

      .dialogue-choice-btn .choice-text { flex: 1; }

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
        width: 2px; height: 1em;
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
}
