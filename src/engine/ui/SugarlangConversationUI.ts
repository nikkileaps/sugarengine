/**
 * SugarlangConversationUI — unified conversation panel for Sugarlang scenes.
 *
 * Combines:
 *   - NPC speaker name + utterance (target language)
 *   - SupportStrip (support language with <kw> highlighting)
 *   - ResponseModeUI (interactive response widgets)
 *   - Feedback display (evaluation hints/results)
 *
 * This panel replaces the AgentConversationUI for sugarlang-scripted sessions.
 */

import type { ConversationTurnEnvelope, PlayerInput } from '../conversation/types';
import { InputManager } from '../core/InputManager';
import { SupportStrip } from './SupportStrip';
import type { GlossaryChipData } from './SupportStrip';
import { ResponseModeUI } from './ResponseModeUI';
import type { ResponseModeResult } from './ResponseModeUI';

/** Repair option data passed from the provider for UI rendering. */
export interface RepairOptionView {
  repairId: string;
  label: string;
  type: 'fixed' | 'clarification_template';
}

export interface SugarlangTurnView {
  utterance: string;
  speakerName?: string;
  emotion?: string;
  supportText?: string;
  responseContract: ConversationTurnEnvelope['responseContract'];
  /** Band policy info for adaptive display. */
  bandPolicy?: {
    showSupportStrip: boolean;
    showGlosses: boolean;
    bandId: string;
  };
  /** Glossary chip data for B2-B3 display. */
  glossaryChips?: GlossaryChipData[];
  /** Authored repair options for this turn. */
  repairOptions?: RepairOptionView[];
  /** Whether repair controls should be visible right now. */
  showRepairOptions?: boolean;
  /** Tappable target-language words from the utterance for clarification prefill. */
  tappableWords?: string[];
}

type SugarlangSubmitHandler = (input: PlayerInput) => void;
type SugarlangCloseHandler = () => void;
type RepairHandler = (repairId: string, prefillWord?: string) => void;

export class SugarlangConversationUI {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private speakerEl: HTMLDivElement;
  private utteranceEl: HTMLDivElement;
  private repairArea: HTMLDivElement;
  private supportStrip: SupportStrip;
  private feedbackEl: HTMLDivElement;
  private responseModeUI: ResponseModeUI;
  private submitHandler: SugarlangSubmitHandler | null = null;
  private closeHandler: SugarlangCloseHandler | null = null;
  private repairHandler: RepairHandler | null = null;
  private visible = false;
  private awaitingAdvance = false;
  private boundHandleKeyDown: (e: KeyboardEvent) => void = () => {};

  constructor(parent: HTMLElement) {
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'sl-conversation-overlay';

    this.panel = document.createElement('div');
    this.panel.className = 'sl-conversation-panel';

    // Speaker name
    this.speakerEl = document.createElement('div');
    this.speakerEl.className = 'sl-conversation-speaker';
    this.panel.appendChild(this.speakerEl);

    // NPC utterance (target language)
    this.utteranceEl = document.createElement('div');
    this.utteranceEl.className = 'sl-conversation-utterance';
    this.panel.appendChild(this.utteranceEl);

    // Repair responses area (rendered between utterance and response widget)
    this.repairArea = document.createElement('div');
    this.repairArea.className = 'sl-repair-area';
    this.panel.appendChild(this.repairArea);

    // Support strip (support language)
    this.supportStrip = new SupportStrip(this.panel);

    // Feedback area (evaluation hints)
    this.feedbackEl = document.createElement('div');
    this.feedbackEl.className = 'sl-conversation-feedback';
    this.panel.appendChild(this.feedbackEl);

    // Response mode UI
    this.responseModeUI = new ResponseModeUI(this.panel);
    this.responseModeUI.setOnSubmit((result) => this.handleResponseSubmit(result));

    this.container.appendChild(this.panel);
    parent.appendChild(this.container);

    // Bind handler for context stack
    this.boundHandleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.closeHandler?.();
        return;
      }
      // Advance past NPC-only delivery turns (free_form with no response widget)
      if (this.awaitingAdvance && event.code === 'Enter') {
        event.preventDefault();
        this.awaitingAdvance = false;
        this.submitHandler?.({ text: '' });
      }
    };
  }

  setOnSubmit(handler: SugarlangSubmitHandler): void {
    this.submitHandler = handler;
  }

  setOnClose(handler: SugarlangCloseHandler): void {
    this.closeHandler = handler;
  }

  setOnRepair(handler: RepairHandler): void {
    this.repairHandler = handler;
  }

  /**
   * Show the panel and display a turn.
   */
  show(): void {
    this.container.classList.add('visible');
    this.visible = true;
    InputManager.getInstance()?.pushContext({ name: 'sugarlangConversation', handleKeyDown: this.boundHandleKeyDown });
  }

  /**
   * Display a turn from the ConversationHost.
   */
  showTurn(turn: SugarlangTurnView): void {
    // Speaker
    if (turn.speakerName) {
      this.speakerEl.textContent = turn.speakerName;
      this.speakerEl.style.display = '';
    } else {
      this.speakerEl.style.display = 'none';
    }

    // NPC utterance — if tappable words exist, render them as interactive spans
    this.utteranceEl.innerHTML = '';
    if (
      turn.showRepairOptions &&
      turn.tappableWords &&
      turn.tappableWords.length > 0 &&
      turn.repairOptions?.some((r) => r.type === 'clarification_template')
    ) {
      this.renderTappableUtterance(turn.utterance, turn.tappableWords, turn.repairOptions);
    } else {
      this.utteranceEl.textContent = turn.utterance;
    }

    // Repair responses — rendered between utterance and response widget
    this.repairArea.innerHTML = '';
    if (turn.showRepairOptions && turn.repairOptions && turn.repairOptions.length > 0) {
      this.renderRepairOptions(turn.repairOptions);
    }

    // Support strip — adaptive by band
    const showStrip = turn.bandPolicy ? turn.bandPolicy.showSupportStrip : true;
    if (showStrip && turn.supportText) {
      this.supportStrip.show(turn.supportText);
    } else {
      this.supportStrip.show(''); // hide the strip content
      this.supportStrip.hide();
    }

    // Glossary chips — B2 always visible, B3 on-demand, B4 hidden
    if (turn.glossaryChips && turn.glossaryChips.length > 0 && turn.bandPolicy?.showGlosses) {
      const onDemand = turn.bandPolicy.bandId === 'B3';
      this.supportStrip.showGlossaryChips(turn.glossaryChips, onDemand);
    } else {
      this.supportStrip.hideGlossary();
    }

    // Clear feedback
    this.feedbackEl.textContent = '';
    this.feedbackEl.style.display = 'none';

    // Response widget — for free_form NPC-only turns, hide the widget and let E/Enter advance
    this.awaitingAdvance = turn.responseContract.mode === 'free_form';
    if (this.awaitingAdvance) {
      this.responseModeUI.hide();
    } else {
      this.responseModeUI.show(turn.responseContract);
    }
  }

  /**
   * Show evaluation feedback (e.g. "Try again!" or the revealed answer).
   */
  showFeedback(message: string): void {
    this.feedbackEl.textContent = message;
    this.feedbackEl.style.display = 'block';
  }

  /**
   * Submit an object selection from the game world.
   */
  submitObjectSelection(objectId: string): void {
    this.responseModeUI.submitObjectSelection(objectId);
  }

  hide(): void {
    this.container.classList.remove('visible');
    this.visible = false;
    InputManager.getInstance()?.popContext('sugarlangConversation');
    this.supportStrip.hide();
    this.responseModeUI.hide();
    this.repairArea.innerHTML = '';
    this.feedbackEl.textContent = '';
    this.feedbackEl.style.display = 'none';
    this.utteranceEl.textContent = '';
    this.speakerEl.textContent = '';
  }

  isVisible(): boolean {
    return this.visible;
  }

  private renderRepairOptions(options: RepairOptionView[]): void {
    for (const opt of options) {
      if (opt.type === 'clarification_template') continue; // rendered via tappable utterance
      const btn = document.createElement('button');
      btn.className = 'sl-repair-btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        this.repairHandler?.(opt.repairId);
      });
      this.repairArea.appendChild(btn);
    }
    // Add clarification template button if present
    const clarification = options.find((o) => o.type === 'clarification_template');
    if (clarification) {
      const btn = document.createElement('button');
      btn.className = 'sl-repair-btn sl-repair-clarification';
      btn.textContent = clarification.label;
      btn.addEventListener('click', () => {
        this.repairHandler?.(clarification.repairId);
      });
      this.repairArea.appendChild(btn);
    }
  }

  private renderTappableUtterance(text: string, tappableWords: string[], repairOptions: RepairOptionView[]): void {
    const clarification = repairOptions.find((o) => o.type === 'clarification_template');
    if (!clarification) {
      this.utteranceEl.textContent = text;
      return;
    }

    // Split the utterance and wrap tappable target-language words as clickable spans
    let remaining = text;
    const fragment = document.createDocumentFragment();

    for (const word of tappableWords) {
      const idx = remaining.toLowerCase().indexOf(word.toLowerCase());
      if (idx < 0) continue;
      // Text before the word
      if (idx > 0) {
        fragment.appendChild(document.createTextNode(remaining.substring(0, idx)));
      }
      // The tappable word
      const span = document.createElement('span');
      span.className = 'sl-tappable-word';
      span.textContent = remaining.substring(idx, idx + word.length);
      span.addEventListener('click', () => {
        this.repairHandler?.(clarification.repairId, word);
      });
      fragment.appendChild(span);
      remaining = remaining.substring(idx + word.length);
    }
    // Remaining text
    if (remaining) {
      fragment.appendChild(document.createTextNode(remaining));
    }
    this.utteranceEl.appendChild(fragment);
  }

  private handleResponseSubmit(result: ResponseModeResult): void {
    // Map ResponseModeResult → PlayerInput
    const input: PlayerInput = {
      text: result.text,
      choiceIndex: result.choiceIndex,
      objectId: result.objectId,
      blankFills: result.blankFills,
    };
    this.submitHandler?.(input);
  }

  private injectStyles(): void {
    if (document.getElementById('sl-conversation-styles')) return;
    const style = document.createElement('style');
    style.id = 'sl-conversation-styles';
    style.textContent = `
      .sl-conversation-overlay {
        position: absolute;
        inset: 0;
        z-index: 240;
        display: none;
        align-items: flex-end;
        justify-content: center;
        pointer-events: none;
        padding: 20px;
      }

      .sl-conversation-overlay.visible {
        display: flex;
      }

      .sl-conversation-panel {
        width: min(680px, 92vw);
        max-height: min(380px, 56vh);
        background: linear-gradient(180deg, rgba(20, 18, 28, 0.95), rgba(12, 11, 18, 0.96));
        border: 1px solid rgba(180, 160, 140, 0.3);
        border-radius: 12px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
        pointer-events: auto;
        overflow: hidden;
        font-family: 'Segoe UI', system-ui, sans-serif;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .sl-conversation-speaker {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        color: rgba(220, 196, 160, 0.7);
      }

      .sl-conversation-utterance {
        font-size: 16px;
        line-height: 1.5;
        color: #f2e9dd;
        padding: 4px 0;
      }

      .sl-repair-area {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 4px 0;
      }
      .sl-repair-area:empty {
        display: none;
      }

      .sl-repair-btn {
        padding: 6px 14px;
        font-size: 13px;
        font-weight: 500;
        border: 1px solid rgba(220, 180, 120, 0.35);
        background: rgba(220, 180, 120, 0.08);
        color: rgba(255, 220, 160, 0.9);
        border-radius: 16px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .sl-repair-btn:hover {
        background: rgba(220, 180, 120, 0.2);
        border-color: rgba(220, 180, 120, 0.5);
      }

      .sl-tappable-word {
        color: rgba(180, 220, 255, 0.95);
        cursor: pointer;
        border-bottom: 1px dashed rgba(180, 220, 255, 0.4);
        transition: color 0.15s;
      }
      .sl-tappable-word:hover {
        color: #fff;
        border-bottom-color: rgba(180, 220, 255, 0.7);
      }

      .sl-conversation-feedback {
        display: none;
        text-align: center;
        font-size: 14px;
        color: rgba(255, 200, 120, 0.9);
        padding: 6px 0;
        font-weight: 500;
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    this.supportStrip.dispose();
    this.responseModeUI.dispose();
    this.container.remove();
  }
}
