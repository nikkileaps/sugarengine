import { InputManager } from '../core/InputManager';
import type { ConversationEngagementOption } from '../conversation';

export interface NPCInteractionChoiceRequest {
  npcId: string;
  npcName?: string;
  options: ConversationEngagementOption[];
}

export class NPCInteractionChooserUI {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private subtitleEl: HTMLDivElement;
  private optionsEl: HTMLDivElement;
  private visible = false;
  private activeOptions: ConversationEngagementOption[] = [];
  private resolveChoice: ((choice: ConversationEngagementOption | null) => void) | null = null;
  private readonly boundHandleKeyDown: (event: KeyboardEvent) => void;

  constructor(parent: HTMLElement) {
    this.injectStyles();

    this.overlay = document.createElement('div');
    this.overlay.className = 'npc-interaction-chooser-overlay';

    this.panel = document.createElement('div');
    this.panel.className = 'npc-interaction-chooser-panel';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'npc-interaction-chooser-title';
    this.panel.appendChild(this.titleEl);

    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'npc-interaction-chooser-subtitle';
    this.panel.appendChild(this.subtitleEl);

    this.optionsEl = document.createElement('div');
    this.optionsEl.className = 'npc-interaction-chooser-options';
    this.panel.appendChild(this.optionsEl);

    this.overlay.appendChild(this.panel);
    parent.appendChild(this.overlay);

    this.boundHandleKeyDown = (event: KeyboardEvent) => {
      if (!this.visible) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        this.finish(null);
        return;
      }
      if (event.code.startsWith('Digit')) {
        const index = Number.parseInt(event.code.slice(5), 10) - 1;
        if (Number.isInteger(index) && index >= 0 && index < this.activeOptions.length) {
          event.preventDefault();
          this.finish(this.activeOptions[index]!);
        }
      }
    };
  }

  private injectStyles(): void {
    if (document.getElementById('npc-interaction-chooser-styles')) return;

    const style = document.createElement('style');
    style.id = 'npc-interaction-chooser-styles';
    style.textContent = `
      .npc-interaction-chooser-overlay {
        position: absolute;
        inset: 0;
        z-index: 235;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: rgba(8, 8, 12, 0.55);
      }

      .npc-interaction-chooser-overlay.visible {
        display: flex;
      }

      .npc-interaction-chooser-panel {
        width: min(460px, 92vw);
        border-radius: 16px;
        border: 1px solid rgba(180, 160, 140, 0.28);
        background: linear-gradient(180deg, rgba(28, 24, 36, 0.98), rgba(18, 16, 24, 0.98));
        box-shadow: 0 18px 42px rgba(0, 0, 0, 0.4);
        padding: 18px;
        color: #f1e7dc;
        font-family: 'Segoe UI', system-ui, sans-serif;
      }

      .npc-interaction-chooser-title {
        font-size: 18px;
        font-weight: 600;
      }

      .npc-interaction-chooser-subtitle {
        margin-top: 6px;
        font-size: 13px;
        color: rgba(241, 231, 220, 0.7);
      }

      .npc-interaction-chooser-options {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .npc-interaction-chooser-option {
        width: 100%;
        text-align: left;
        border-radius: 12px;
        border: 1px solid rgba(180, 160, 140, 0.22);
        background: rgba(255, 255, 255, 0.04);
        color: inherit;
        padding: 14px 16px;
        cursor: pointer;
        transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
      }

      .npc-interaction-chooser-option:hover {
        transform: translateY(-1px);
        border-color: rgba(136, 180, 220, 0.45);
        background: rgba(136, 180, 220, 0.1);
      }

      .npc-interaction-chooser-option-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 15px;
        font-weight: 600;
      }

      .npc-interaction-chooser-option-key {
        font-size: 12px;
        color: rgba(168, 212, 240, 0.85);
      }

      .npc-interaction-chooser-option-description {
        margin-top: 4px;
        font-size: 12px;
        color: rgba(241, 231, 220, 0.68);
      }
    `;
    document.head.appendChild(style);
  }

  private renderOptions(): void {
    this.optionsEl.replaceChildren();

    this.activeOptions.forEach((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'npc-interaction-chooser-option';
      button.addEventListener('click', () => this.finish(option));

      const label = document.createElement('div');
      label.className = 'npc-interaction-chooser-option-label';
      label.textContent = option.label;

      const key = document.createElement('span');
      key.className = 'npc-interaction-chooser-option-key';
      key.textContent = `${index + 1}`;
      label.appendChild(key);

      button.appendChild(label);

      if (option.description) {
        const description = document.createElement('div');
        description.className = 'npc-interaction-chooser-option-description';
        description.textContent = option.description;
        button.appendChild(description);
      }

      this.optionsEl.appendChild(button);
    });
  }

  private finish(choice: ConversationEngagementOption | null): void {
    const resolve = this.resolveChoice;
    this.resolveChoice = null;
    this.hide();
    resolve?.(choice);
  }

  async choose(
    request: NPCInteractionChoiceRequest,
  ): Promise<ConversationEngagementOption | null> {
    if (request.options.length === 0) return null;
    if (this.resolveChoice) {
      this.finish(null);
    }

    this.activeOptions = request.options;
    this.titleEl.textContent = request.npcName
      ? `${request.npcName}: choose how to engage`
      : 'Choose how to engage';
    this.subtitleEl.textContent = 'Pick a conversation mode, or press Escape to cancel.';
    this.renderOptions();
    this.show();

    return await new Promise<ConversationEngagementOption | null>((resolve) => {
      this.resolveChoice = resolve;
    });
  }

  show(): void {
    if (this.visible) return;
    this.visible = true;
    this.overlay.classList.add('visible');
    InputManager.getInstance()?.pushContext({
      name: 'npc-interaction-chooser',
      handleKeyDown: this.boundHandleKeyDown,
    });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    this.overlay.classList.remove('visible');
    InputManager.getInstance()?.popContext('npc-interaction-chooser');
  }

  isVisible(): boolean {
    return this.visible;
  }
}
