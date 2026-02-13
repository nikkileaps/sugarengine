import { ItemDefinition } from '../../inventory';
import { ReadableView, LayoutResult, createCloseHint } from './layoutTypes';

export const flyerStyles = `
  .itemview-panel.itemview-flyer-mode {
    max-width: 480px;
    max-height: 85vh;
    padding: 20px;
    transform-origin: center center;
  }

  .itemview-flyer-image-wrap {
    position: relative;
    text-align: center;
  }

  .itemview-flyer-image-wrap img {
    max-width: 100%;
    max-height: 65vh;
    object-fit: contain;
    border-radius: 6px;
    border: 1px solid rgba(180, 160, 140, 0.2);
    display: block;
    margin: 0 auto;
  }

  .itemview-flyer-title {
    font-size: 18px;
    font-weight: 700;
    color: #f0e6d8;
    text-align: center;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
`;

export function renderFlyer(
  contentEl: HTMLDivElement,
  item: ItemDefinition,
  view: ReadableView,
): LayoutResult {
  // Optional title
  if (view.title) {
    const title = document.createElement('div');
    title.className = 'itemview-flyer-title';
    title.textContent = view.title;
    contentEl.appendChild(title);
  }

  // Image — use view.image or first page
  const imageSrc = view.image || (view.pages && view.pages[0]);
  if (imageSrc) {
    const wrap = document.createElement('div');
    wrap.className = 'itemview-flyer-image-wrap';
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = view.title || item.name;
    wrap.appendChild(img);
    contentEl.appendChild(wrap);
  }

  contentEl.appendChild(createCloseHint('ESC'));

  return {
    pages: [],
    panelClass: 'itemview-flyer-mode',
  };
}
