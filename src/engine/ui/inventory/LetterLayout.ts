import { ItemDefinition } from '../../inventory';
import { ReadableView, LayoutResult, createCloseHint } from './layoutTypes';

export const letterStyles = `
  .itemview-panel.itemview-letter-mode {
    max-width: 480px;
    background:
      linear-gradient(135deg, rgba(85, 70, 50, 0.15) 0%, transparent 50%),
      linear-gradient(180deg, rgba(70, 60, 45, 0.98) 0%, rgba(55, 45, 35, 0.99) 100%);
    border-color: rgba(160, 140, 100, 0.35);
  }

  .itemview-letter-greeting {
    font-size: 20px;
    font-family: Georgia, 'Times New Roman', serif;
    font-style: italic;
    color: #e8dcc8;
    margin-bottom: 20px;
  }

  .itemview-letter-body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 15px;
    font-style: italic;
    line-height: 1.9;
    color: #ddd0b8;
    white-space: pre-wrap;
  }

  .itemview-letter-signature {
    margin-top: 28px;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 16px;
    font-style: italic;
    color: rgba(232, 220, 200, 0.7);
    text-align: right;
  }
`;

export function renderLetter(
  contentEl: HTMLDivElement,
  _item: ItemDefinition,
  view: ReadableView,
): LayoutResult {
  // Title as greeting
  if (view.title) {
    const greeting = document.createElement('div');
    greeting.className = 'itemview-letter-greeting';
    greeting.textContent = view.title;
    contentEl.appendChild(greeting);
  }

  // Body text
  if (view.content) {
    const body = document.createElement('div');
    body.className = 'itemview-letter-body';
    body.textContent = view.content;
    contentEl.appendChild(body);
  }

  // Author as signature
  if (view.author) {
    const sig = document.createElement('div');
    sig.className = 'itemview-letter-signature';
    sig.textContent = `\u2014 ${view.author}`;
    contentEl.appendChild(sig);
  }

  contentEl.appendChild(createCloseHint('ESC'));

  return {
    pages: [],
    panelClass: 'itemview-letter-mode',
  };
}
