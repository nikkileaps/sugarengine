import { InputManager } from '../core/InputManager';

export interface AgentConversationSessionView {
  npcId: string;
  npcName?: string;
}

export interface AgentConversationTurnView {
  utterance: string;
  emotion?: string;
  intent?: string;
}

type AgentConversationSubmitHandler = (message: string) => Promise<AgentConversationTurnView>;
type AgentConversationCloseHandler = () => void;
type AgentConversationResetHandler = (
  session: AgentConversationSessionView,
) => Promise<{ detail?: string } | void>;

export class AgentConversationUI {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private titleEl: HTMLDivElement;
  private historyEl: HTMLDivElement;
  private formEl: HTMLFormElement;
  private inputEl: HTMLInputElement;
  private sendEl: HTMLButtonElement;
  private resetEl: HTMLButtonElement;
  private closeEl: HTMLButtonElement;
  private submitHandler: AgentConversationSubmitHandler | null = null;
  private closeHandler: AgentConversationCloseHandler | null = null;
  private resetHandler: AgentConversationResetHandler | null = null;
  private activeSession: AgentConversationSessionView | null = null;
  private resetting = false;
  private visible = false;
  private typingIndicatorEl: HTMLDivElement | null = null;

  constructor(parent: HTMLElement) {
    this.injectStyles();

    this.container = document.createElement('div');
    this.container.className = 'agent-chat-overlay';

    this.panel = document.createElement('div');
    this.panel.className = 'agent-chat-panel';

    const header = document.createElement('div');
    header.className = 'agent-chat-header';

    this.titleEl = document.createElement('div');
    this.titleEl.className = 'agent-chat-title';
    this.titleEl.textContent = 'Conversation';
    header.appendChild(this.titleEl);

    const headerActions = document.createElement('div');
    headerActions.className = 'agent-chat-header-actions';

    this.resetEl = document.createElement('button');
    this.resetEl.className = 'agent-chat-reset';
    this.resetEl.type = 'button';
    this.resetEl.textContent = 'Reset Memory';
    this.resetEl.style.display = 'none';
    this.resetEl.addEventListener('click', () => {
      void this.resetSession();
    });
    headerActions.appendChild(this.resetEl);

    this.closeEl = document.createElement('button');
    this.closeEl.className = 'agent-chat-close';
    this.closeEl.type = 'button';
    this.closeEl.textContent = 'Close';
    this.closeEl.addEventListener('click', () => this.closeHandler?.());
    headerActions.appendChild(this.closeEl);

    header.appendChild(headerActions);

    this.historyEl = document.createElement('div');
    this.historyEl.className = 'agent-chat-history';

    this.formEl = document.createElement('form');
    this.formEl.className = 'agent-chat-form';
    this.formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });

    this.inputEl = document.createElement('input');
    this.inputEl.className = 'agent-chat-input';
    this.inputEl.type = 'text';
    this.inputEl.placeholder = 'Type your message...';
    this.formEl.appendChild(this.inputEl);

    this.sendEl = document.createElement('button');
    this.sendEl.className = 'agent-chat-send';
    this.sendEl.type = 'submit';
    this.sendEl.textContent = 'Send';
    this.formEl.appendChild(this.sendEl);

    this.panel.appendChild(header);
    this.panel.appendChild(this.historyEl);
    this.panel.appendChild(this.formEl);
    this.container.appendChild(this.panel);
    parent.appendChild(this.container);

    // Bind handler for context stack
    this.boundHandleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        event.preventDefault();
        this.closeHandler?.();
      }
    };
  }

  private boundHandleKeyDown: (e: KeyboardEvent) => void = () => {};

  private injectStyles(): void {
    if (document.getElementById('agent-chat-styles')) return;

    const style = document.createElement('style');
    style.id = 'agent-chat-styles';
    style.textContent = `
      .agent-chat-overlay {
        position: absolute;
        inset: 0;
        z-index: 240;
        display: none;
        align-items: flex-end;
        justify-content: center;
        pointer-events: none;
        padding: 20px;
      }

      .agent-chat-overlay.visible {
        display: flex;
      }

      .agent-chat-panel {
        width: min(760px, 92vw);
        height: min(420px, 64vh);
        background: linear-gradient(180deg, rgba(20, 18, 28, 0.95), rgba(12, 11, 18, 0.96));
        border: 1px solid rgba(180, 160, 140, 0.3);
        border-radius: 12px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
        display: flex;
        flex-direction: column;
        pointer-events: auto;
        overflow: hidden;
        font-family: 'Segoe UI', system-ui, sans-serif;
      }

      .agent-chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(180, 160, 140, 0.2);
      }

      .agent-chat-title {
        font-size: 14px;
        color: #e8ddd0;
        font-weight: 600;
        letter-spacing: 0.3px;
      }

      .agent-chat-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .agent-chat-reset,
      .agent-chat-close {
        border: 1px solid rgba(180, 160, 140, 0.35);
        background: rgba(255, 255, 255, 0.04);
        color: #e8ddd0;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
      }

      .agent-chat-reset:hover,
      .agent-chat-close:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .agent-chat-history {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .agent-chat-line {
        max-width: 85%;
        line-height: 1.5;
        font-size: 14px;
        border-radius: 10px;
        padding: 8px 10px;
      }

      .agent-chat-line.player {
        align-self: flex-end;
        background: rgba(136, 180, 220, 0.2);
        border: 1px solid rgba(136, 180, 220, 0.35);
        color: #dcefff;
      }

      .agent-chat-line.npc {
        align-self: flex-start;
        background: rgba(220, 196, 160, 0.18);
        border: 1px solid rgba(220, 196, 160, 0.3);
        color: #f2e9dd;
      }

      .agent-chat-line.system {
        align-self: center;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: rgba(255, 255, 255, 0.75);
        font-size: 12px;
      }

      .agent-chat-line.typing {
        display: flex;
        align-items: center;
        gap: 4px;
        min-height: 20px;
      }

      .agent-chat-typing-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.28;
        animation: agent-chat-typing-bounce 1.1s ease-in-out infinite;
      }

      .agent-chat-typing-dot:nth-child(2) {
        animation-delay: 0.16s;
      }

      .agent-chat-typing-dot:nth-child(3) {
        animation-delay: 0.32s;
      }

      @keyframes agent-chat-typing-bounce {
        0%, 80%, 100% {
          opacity: 0.28;
          transform: translateY(0);
        }
        40% {
          opacity: 1;
          transform: translateY(-2px);
        }
      }

      .agent-chat-form {
        border-top: 1px solid rgba(180, 160, 140, 0.2);
        padding: 10px;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 10px;
      }

      .agent-chat-input {
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(180, 160, 140, 0.3);
        color: #f2e9dd;
        border-radius: 8px;
        padding: 10px 12px;
        font-size: 14px;
      }

      .agent-chat-input:focus {
        outline: none;
        border-color: rgba(136, 180, 220, 0.6);
      }

      .agent-chat-send {
        border: 1px solid rgba(136, 180, 220, 0.5);
        background: rgba(136, 180, 220, 0.2);
        color: #dcefff;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 14px;
        cursor: pointer;
      }

      .agent-chat-send:hover {
        background: rgba(136, 180, 220, 0.3);
      }

      .agent-chat-input:disabled,
      .agent-chat-send:disabled {
        opacity: 0.6;
        cursor: wait;
      }
    `;
    document.head.appendChild(style);
  }

  private addLine(role: 'player' | 'npc' | 'system', text: string): void {
    const line = document.createElement('div');
    line.className = `agent-chat-line ${role}`;
    line.textContent = text;
    this.historyEl.appendChild(line);
    this.historyEl.scrollTop = this.historyEl.scrollHeight;
  }

  private showTypingIndicator(): void {
    this.removeTypingIndicator();

    const line = document.createElement('div');
    line.className = 'agent-chat-line npc typing';
    line.setAttribute('aria-label', 'NPC is typing');

    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'agent-chat-typing-dot';
      line.appendChild(dot);
    }

    this.historyEl.appendChild(line);
    this.historyEl.scrollTop = this.historyEl.scrollHeight;
    this.typingIndicatorEl = line;
  }

  private removeTypingIndicator(): void {
    if (!this.typingIndicatorEl) return;
    this.typingIndicatorEl.remove();
    this.typingIndicatorEl = null;
  }

  private async submit(): Promise<void> {
    if (!this.submitHandler || this.resetting) return;

    const message = this.inputEl.value.trim();
    if (!message) return;

    this.inputEl.value = '';
    this.addLine('player', message);

    this.inputEl.disabled = true;
    this.sendEl.disabled = true;
    this.showTypingIndicator();

    try {
      const result = await this.submitHandler(message);
      this.removeTypingIndicator();
      this.addLine('npc', result.utterance);
    } catch (error) {
      this.removeTypingIndicator();
      const messageText = error instanceof Error ? error.message : 'Conversation failed.';
      this.addLine('system', messageText);
    } finally {
      this.inputEl.disabled = false;
      this.sendEl.disabled = false;
      this.inputEl.focus();
    }
  }

  show(session: AgentConversationSessionView): void {
    this.activeSession = { ...session };
    const displayName = session.npcName?.trim() || session.npcId;
    this.titleEl.textContent = `Talking to ${displayName}`;
    this.historyEl.innerHTML = '';
    this.typingIndicatorEl = null;
    this.addLine('system', 'Conversation started. Type your message.');
    this.container.classList.add('visible');
    this.visible = true;
    InputManager.getInstance()?.pushContext({ name: 'agentConversation', handleKeyDown: this.boundHandleKeyDown });
    this.inputEl.focus();
  }

  hide(): void {
    this.container.classList.remove('visible');
    this.visible = false;
    InputManager.getInstance()?.popContext('agentConversation');
    this.activeSession = null;
    this.removeTypingIndicator();
    this.historyEl.innerHTML = '';
    this.inputEl.value = '';
  }

  isVisible(): boolean {
    return this.visible;
  }

  setOnSubmit(handler: AgentConversationSubmitHandler): void {
    this.submitHandler = handler;
  }

  setOnClose(handler: AgentConversationCloseHandler): void {
    this.closeHandler = handler;
  }

  setOnReset(handler: AgentConversationResetHandler | null): void {
    this.resetHandler = handler;
    this.resetEl.style.display = handler ? '' : 'none';
  }

  private async resetSession(): Promise<void> {
    if (!this.resetHandler || !this.activeSession || this.resetting) return;

    this.resetting = true;
    this.inputEl.disabled = true;
    this.sendEl.disabled = true;
    this.resetEl.disabled = true;

    try {
      const result = await this.resetHandler({ ...this.activeSession });
      this.removeTypingIndicator();
      this.historyEl.innerHTML = '';
      this.addLine('system', result?.detail ?? 'Conversation memory reset. Type your message.');
    } catch (error) {
      this.removeTypingIndicator();
      const messageText = error instanceof Error ? error.message : 'Could not reset conversation memory.';
      this.addLine('system', messageText);
    } finally {
      this.resetting = false;
      this.inputEl.disabled = false;
      this.sendEl.disabled = false;
      this.resetEl.disabled = false;
      this.inputEl.focus();
    }
  }
}
