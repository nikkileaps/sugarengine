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
import { SupportStrip } from './SupportStrip';
import { ResponseModeUI } from './ResponseModeUI';
import type { ResponseModeResult } from './ResponseModeUI';

export interface SugarlangTurnView {
  utterance: string;
  speakerName?: string;
  emotion?: string;
  supportText?: string;
  responseContract: ConversationTurnEnvelope['responseContract'];
}

type SugarlangSubmitHandler = (input: PlayerInput) => void;
type SugarlangCloseHandler = () => void;

export class SugarlangConversationUI {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private speakerEl: HTMLDivElement;
  private utteranceEl: HTMLDivElement;
  private supportStrip: SupportStrip;
  private feedbackEl: HTMLDivElement;
  private responseModeUI: ResponseModeUI;
  private submitHandler: SugarlangSubmitHandler | null = null;
  private closeHandler: SugarlangCloseHandler | null = null;
  private visible = false;

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

    window.addEventListener('keydown', (event) => {
      if (!this.visible) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        this.closeHandler?.();
      }
    });
  }

  setOnSubmit(handler: SugarlangSubmitHandler): void {
    this.submitHandler = handler;
  }

  setOnClose(handler: SugarlangCloseHandler): void {
    this.closeHandler = handler;
  }

  /**
   * Show the panel and display a turn.
   */
  show(): void {
    this.container.classList.add('visible');
    this.visible = true;
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

    // NPC utterance
    this.utteranceEl.textContent = turn.utterance;

    // Support strip
    if (turn.supportText) {
      this.supportStrip.show(turn.supportText);
    } else {
      this.supportStrip.hide();
    }

    // Clear feedback
    this.feedbackEl.textContent = '';
    this.feedbackEl.style.display = 'none';

    // Response widget
    this.responseModeUI.show(turn.responseContract);
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
    this.supportStrip.hide();
    this.responseModeUI.hide();
    this.feedbackEl.textContent = '';
    this.feedbackEl.style.display = 'none';
    this.utteranceEl.textContent = '';
    this.speakerEl.textContent = '';
  }

  isVisible(): boolean {
    return this.visible;
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
