/**
 * ResponseModeUI — renders interactive response widgets for Sugarlang
 * conversation turns based on the response contract mode.
 *
 * Supported B0/B1 modes:
 *   - yes_no:           Two large buttons (Sí / No)
 *   - object_selection:  Instruction text; player clicks a world object
 *   - multiple_choice:   2–4 choice buttons
 *   - single_blank:      Sentence with one blank + word bank chips
 *   - phrase_assembly:   Reorderable word chips to build a sentence
 *   - word_bank:         Multiple blanks filled from a shared word bank
 */

import type { ResponseContract } from '../conversation/types';

export interface ResponseModeResult {
  /** The player's submitted answer. */
  text?: string;
  /** Index of selected choice (for choice-based modes). */
  choiceIndex?: number;
  /** Object ID selected (for object_selection). */
  objectId?: string;
  /** Filled blanks (for blank-fill modes). */
  blankFills?: Record<string, string>;
}

type ResponseModeSubmitHandler = (result: ResponseModeResult) => void;

export class ResponseModeUI {
  private container: HTMLDivElement;
  private widgetArea: HTMLDivElement;
  private submitHandler: ResponseModeSubmitHandler | null = null;
  private visible = false;

  constructor(parent: HTMLElement) {
    this.injectStyles();
    this.container = document.createElement('div');
    this.container.className = 'sl-response-mode';
    this.widgetArea = document.createElement('div');
    this.widgetArea.className = 'sl-response-widget';
    this.container.appendChild(this.widgetArea);
    parent.appendChild(this.container);
  }

  setOnSubmit(handler: ResponseModeSubmitHandler): void {
    this.submitHandler = handler;
  }

  /**
   * Render the appropriate response widget for the given contract.
   * Clears any previous widget.
   */
  show(contract: ResponseContract): void {
    this.widgetArea.innerHTML = '';
    this.visible = true;
    this.container.style.display = 'block';

    switch (contract.mode) {
      case 'yes_no':
        this.renderYesNo();
        break;
      case 'multiple_choice':
        this.renderMultipleChoice(contract.choices ?? []);
        break;
      case 'object_selection':
        this.renderObjectSelection(contract.hintText);
        break;
      case 'single_blank':
        this.renderSingleBlank(contract);
        break;
      case 'phrase_assembly':
        this.renderPhraseAssembly(contract.wordBank ?? []);
        break;
      case 'word_bank':
        this.renderWordBank(contract);
        break;
      case 'short_text':
        this.renderShortText(contract);
        break;
      case 'open_text':
        this.renderOpenText(contract);
        break;
      default:
        // Unsupported mode — hide.
        this.hide();
        break;
    }
  }

  hide(): void {
    this.container.style.display = 'none';
    this.widgetArea.innerHTML = '';
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  // -------------------------------------------------------------------------
  // Mode renderers
  // -------------------------------------------------------------------------

  private renderYesNo(): void {
    const row = this.createButtonRow();
    this.addButton(row, 'Sí', () => this.submit({ text: 'sí', choiceIndex: 0 }));
    this.addButton(row, 'No', () => this.submit({ text: 'no', choiceIndex: 1 }));
  }

  private renderMultipleChoice(choices: string[]): void {
    const row = this.createButtonRow();
    choices.forEach((choice, i) => {
      this.addButton(row, choice, () => this.submit({ text: choice, choiceIndex: i }));
    });
  }

  private renderObjectSelection(hintText?: string): void {
    const instruction = document.createElement('div');
    instruction.className = 'sl-response-instruction';
    instruction.textContent = hintText ?? 'Tap the correct object in the scene.';
    this.widgetArea.appendChild(instruction);
    // Object selection is completed externally when the player clicks a world object.
    // The game wires the click to submitObjectSelection().
  }

  /** Submit an object selection result from external game interaction. */
  submitObjectSelection(objectId: string): void {
    this.submit({ objectId });
  }

  private renderSingleBlank(contract: ResponseContract): void {
    const blank = contract.blanks?.[0];
    const wordBank = contract.wordBank ?? blank?.acceptedAnswers ?? [];

    // Sentence template with blank
    if (contract.hintText) {
      const template = document.createElement('div');
      template.className = 'sl-response-template';
      template.textContent = contract.hintText;
      this.widgetArea.appendChild(template);
    }

    // Word bank chips
    const chipRow = document.createElement('div');
    chipRow.className = 'sl-chip-row';
    for (const word of wordBank) {
      const chip = document.createElement('button');
      chip.className = 'sl-chip';
      chip.textContent = word;
      chip.addEventListener('click', () => {
        this.submit({
          text: word,
          blankFills: blank ? { [blank.id]: word } : undefined,
        });
      });
      chipRow.appendChild(chip);
    }
    this.widgetArea.appendChild(chipRow);
  }

  private renderPhraseAssembly(tokens: string[]): void {
    const assemblyArea = document.createElement('div');
    assemblyArea.className = 'sl-assembly-area';
    const selectedOrder: string[] = [];
    const resultDisplay = document.createElement('div');
    resultDisplay.className = 'sl-assembly-result';
    assemblyArea.appendChild(resultDisplay);

    const chipRow = document.createElement('div');
    chipRow.className = 'sl-chip-row';

    const updateDisplay = () => {
      resultDisplay.textContent = selectedOrder.join(' ') || '(tap words to build sentence)';
    };
    updateDisplay();

    for (const token of tokens) {
      const chip = document.createElement('button');
      chip.className = 'sl-chip';
      chip.textContent = token;
      chip.addEventListener('click', () => {
        if (chip.classList.contains('sl-chip-used')) {
          // Remove from assembly
          chip.classList.remove('sl-chip-used');
          const idx = selectedOrder.indexOf(token);
          if (idx >= 0) selectedOrder.splice(idx, 1);
        } else {
          // Add to assembly
          chip.classList.add('sl-chip-used');
          selectedOrder.push(token);
        }
        updateDisplay();
      });
      chipRow.appendChild(chip);
    }

    assemblyArea.appendChild(chipRow);

    // Confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'sl-confirm-btn';
    confirmBtn.textContent = 'Confirm';
    confirmBtn.addEventListener('click', () => {
      if (selectedOrder.length > 0) {
        this.submit({ text: selectedOrder.join(' ') });
      }
    });
    assemblyArea.appendChild(confirmBtn);

    this.widgetArea.appendChild(assemblyArea);
  }

  private renderWordBank(contract: ResponseContract): void {
    const blanks = contract.blanks ?? [];
    const wordBank = contract.wordBank ?? [];
    const fills: Record<string, string> = {};
    let activeBlanks = [...blanks];

    const template = document.createElement('div');
    template.className = 'sl-response-template';
    if (contract.hintText) {
      template.textContent = contract.hintText;
    }
    this.widgetArea.appendChild(template);

    const chipRow = document.createElement('div');
    chipRow.className = 'sl-chip-row';

    for (const word of wordBank) {
      const chip = document.createElement('button');
      chip.className = 'sl-chip';
      chip.textContent = word;
      chip.addEventListener('click', () => {
        if (activeBlanks.length === 0) return;
        const blank = activeBlanks.shift()!;
        fills[blank.id] = word;
        chip.classList.add('sl-chip-used');
        chip.disabled = true;

        if (activeBlanks.length === 0) {
          this.submit({ blankFills: fills });
        }
      });
      chipRow.appendChild(chip);
    }
    this.widgetArea.appendChild(chipRow);
  }

  private renderShortText(contract: ResponseContract): void {
    // Hint text
    if (contract.hintText) {
      const hint = document.createElement('div');
      hint.className = 'sl-response-template';
      hint.textContent = contract.hintText;
      this.widgetArea.appendChild(hint);
    }

    // Glossary chips (word bank as hints, not auto-fill)
    if (contract.wordBank && contract.wordBank.length > 0) {
      const chipRow = document.createElement('div');
      chipRow.className = 'sl-chip-row sl-glossary-chips';
      for (const word of contract.wordBank) {
        const chip = document.createElement('span');
        chip.className = 'sl-glossary-chip';
        chip.textContent = word;
        chipRow.appendChild(chip);
      }
      this.widgetArea.appendChild(chipRow);
    }

    // Text input
    const inputRow = document.createElement('div');
    inputRow.className = 'sl-text-input-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sl-text-input';
    input.maxLength = contract.maxLength ?? 80;
    input.placeholder = 'Type your answer…';
    inputRow.appendChild(input);

    const submitBtn = document.createElement('button');
    submitBtn.className = 'sl-confirm-btn';
    submitBtn.textContent = 'Send';
    submitBtn.addEventListener('click', () => {
      const text = input.value.trim();
      if (text) this.submit({ text });
    });
    inputRow.appendChild(submitBtn);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = input.value.trim();
        if (text) this.submit({ text });
      }
    });

    this.widgetArea.appendChild(inputRow);
    // Auto-focus the input
    requestAnimationFrame(() => input.focus());
  }

  private renderOpenText(contract: ResponseContract): void {
    // Hint text
    if (contract.hintText) {
      const hint = document.createElement('div');
      hint.className = 'sl-response-template';
      hint.textContent = contract.hintText;
      this.widgetArea.appendChild(hint);
    }

    // Text area
    const textArea = document.createElement('textarea');
    textArea.className = 'sl-text-area';
    textArea.maxLength = contract.maxLength ?? 200;
    textArea.placeholder = 'Type your response…';
    textArea.rows = 3;
    this.widgetArea.appendChild(textArea);

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.className = 'sl-confirm-btn';
    submitBtn.textContent = 'Send';
    submitBtn.addEventListener('click', () => {
      const text = textArea.value.trim();
      if (text) this.submit({ text });
    });
    this.widgetArea.appendChild(submitBtn);

    requestAnimationFrame(() => textArea.focus());
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private createButtonRow(): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'sl-button-row';
    this.widgetArea.appendChild(row);
    return row;
  }

  private addButton(row: HTMLDivElement, label: string, onClick: () => void): void {
    const btn = document.createElement('button');
    btn.className = 'sl-response-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    row.appendChild(btn);
  }

  private submit(result: ResponseModeResult): void {
    this.submitHandler?.(result);
  }

  // -------------------------------------------------------------------------
  // Styles
  // -------------------------------------------------------------------------

  private injectStyles(): void {
    if (document.getElementById('sl-response-mode-styles')) return;
    const style = document.createElement('style');
    style.id = 'sl-response-mode-styles';
    style.textContent = `
      .sl-response-mode {
        display: none;
        padding: 10px 14px;
        border-top: 1px solid rgba(180, 160, 140, 0.2);
      }

      .sl-button-row {
        display: flex;
        gap: 10px;
        justify-content: center;
      }

      .sl-response-btn {
        flex: 1;
        max-width: 200px;
        padding: 12px 20px;
        font-size: 16px;
        font-weight: 600;
        border: 1px solid rgba(136, 180, 220, 0.5);
        background: rgba(136, 180, 220, 0.15);
        color: #dcefff;
        border-radius: 10px;
        cursor: pointer;
        transition: background 0.15s, transform 0.1s;
      }
      .sl-response-btn:hover {
        background: rgba(136, 180, 220, 0.3);
        transform: translateY(-1px);
      }
      .sl-response-btn:active {
        transform: translateY(0);
      }

      .sl-response-instruction {
        text-align: center;
        color: rgba(220, 210, 200, 0.8);
        font-size: 14px;
        padding: 12px;
        font-style: italic;
      }

      .sl-response-template {
        text-align: center;
        color: #e8ddd0;
        font-size: 15px;
        padding: 8px 0;
        margin-bottom: 8px;
      }

      .sl-chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        justify-content: center;
        padding: 4px 0;
      }

      .sl-chip {
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        border: 1px solid rgba(180, 160, 140, 0.4);
        background: rgba(255, 255, 255, 0.06);
        color: #f2e9dd;
        border-radius: 20px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .sl-chip:hover {
        background: rgba(136, 180, 220, 0.2);
        border-color: rgba(136, 180, 220, 0.5);
      }
      .sl-chip.sl-chip-used {
        background: rgba(136, 180, 220, 0.3);
        border-color: rgba(136, 180, 220, 0.6);
        color: #dcefff;
      }
      .sl-chip:disabled {
        opacity: 0.4;
        cursor: default;
      }

      .sl-assembly-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }

      .sl-assembly-result {
        min-height: 36px;
        padding: 8px 16px;
        font-size: 15px;
        color: #e8ddd0;
        background: rgba(255, 255, 255, 0.04);
        border: 1px dashed rgba(180, 160, 140, 0.3);
        border-radius: 8px;
        text-align: center;
        min-width: 200px;
      }

      .sl-confirm-btn {
        padding: 10px 24px;
        font-size: 14px;
        font-weight: 600;
        border: 1px solid rgba(100, 200, 120, 0.5);
        background: rgba(100, 200, 120, 0.15);
        color: #c5f0cc;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s;
      }
      .sl-confirm-btn:hover {
        background: rgba(100, 200, 120, 0.3);
      }

      .sl-text-input-row {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .sl-text-input {
        flex: 1;
        padding: 10px 14px;
        font-size: 15px;
        border: 1px solid rgba(180, 160, 140, 0.4);
        background: rgba(255, 255, 255, 0.06);
        color: #f2e9dd;
        border-radius: 8px;
        outline: none;
        font-family: inherit;
      }
      .sl-text-input:focus {
        border-color: rgba(136, 180, 220, 0.6);
        background: rgba(255, 255, 255, 0.08);
      }

      .sl-text-area {
        width: 100%;
        padding: 10px 14px;
        font-size: 15px;
        border: 1px solid rgba(180, 160, 140, 0.4);
        background: rgba(255, 255, 255, 0.06);
        color: #f2e9dd;
        border-radius: 8px;
        outline: none;
        resize: vertical;
        font-family: inherit;
        margin-bottom: 8px;
        box-sizing: border-box;
      }
      .sl-text-area:focus {
        border-color: rgba(136, 180, 220, 0.6);
        background: rgba(255, 255, 255, 0.08);
      }

      .sl-glossary-chips {
        margin-bottom: 6px;
      }

      .sl-glossary-chip {
        display: inline-block;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 500;
        color: rgba(180, 220, 255, 0.85);
        background: rgba(136, 180, 220, 0.1);
        border: 1px solid rgba(136, 180, 220, 0.25);
        border-radius: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  dispose(): void {
    this.container.remove();
  }
}
