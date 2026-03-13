import { ItemDefinition } from '../../inventory';
import { ReadableView, LayoutResult, createCloseHint } from './layoutTypes';

export const postcardStyles = `
  .itemview-panel.itemview-postcard-mode {
    max-width: 520px;
    padding: 20px;
    perspective: 1000px;
  }

  .itemview-postcard-container {
    position: relative;
    width: 100%;
    aspect-ratio: 3 / 2;
    cursor: pointer;
    transform-style: preserve-3d;
    transition: transform 0.6s ease-in-out;
  }

  .itemview-postcard-container.flipped {
    transform: rotateY(180deg);
  }

  .itemview-postcard-face {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    backface-visibility: hidden;
    border-radius: 8px;
    overflow: hidden;
  }

  .itemview-postcard-front {
    background: #1a1a1a;
  }

  .itemview-postcard-front img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .itemview-postcard-back {
    transform: rotateY(180deg);
    background:
      linear-gradient(135deg, rgba(85, 70, 50, 0.1) 0%, transparent 50%),
      linear-gradient(180deg, rgba(65, 55, 42, 0.98) 0%, rgba(50, 42, 32, 0.99) 100%);
    border: 1px solid rgba(160, 140, 100, 0.25);
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 24px 28px;
  }

  .itemview-postcard-back-text {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 14px;
    font-style: italic;
    line-height: 1.8;
    color: #ddd0b8;
    white-space: pre-wrap;
    flex: 1;
  }

  .itemview-postcard-back-author {
    margin-top: 16px;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 14px;
    font-style: italic;
    color: rgba(232, 220, 200, 0.6);
    text-align: right;
  }

  .itemview-postcard-flip-hint {
    text-align: center;
    margin-top: 12px;
    font-size: 12px;
    color: rgba(240, 230, 216, 0.35);
  }
`;

export function renderPostcard(
  contentEl: HTMLDivElement,
  item: ItemDefinition,
  view: ReadableView,
): LayoutResult {
  let flipped = false;

  // Postcard container with 3D flip
  const container = document.createElement('div');
  container.className = 'itemview-postcard-container';

  // Front face — image
  const front = document.createElement('div');
  front.className = 'itemview-postcard-face itemview-postcard-front';
  if (view.image) {
    const img = document.createElement('img');
    img.src = view.image;
    img.alt = item.name;
    front.appendChild(img);
  }
  container.appendChild(front);

  // Back face — text + author
  const back = document.createElement('div');
  back.className = 'itemview-postcard-face itemview-postcard-back';
  if (view.content) {
    const text = document.createElement('div');
    text.className = 'itemview-postcard-back-text';
    text.textContent = view.content;
    back.appendChild(text);
  }
  if (view.author) {
    const author = document.createElement('div');
    author.className = 'itemview-postcard-back-author';
    author.textContent = `\u2014 ${view.author}`;
    back.appendChild(author);
  }
  container.appendChild(back);

  // Click to flip
  container.addEventListener('click', () => {
    flipped = !flipped;
    container.classList.toggle('flipped', flipped);
  });

  contentEl.appendChild(container);

  // Flip hint
  const flipHint = document.createElement('div');
  flipHint.className = 'itemview-postcard-flip-hint';
  flipHint.innerHTML = 'Click or press <span class="itemview-key">Space</span> to flip';
  contentEl.appendChild(flipHint);

  contentEl.appendChild(createCloseHint('ESC'));

  return {
    pages: [],
    panelClass: 'itemview-postcard-mode',
    onKeyDown: (code) => {
      if (code === 'Space') {
        flipped = !flipped;
        container.classList.toggle('flipped', flipped);
        return true;
      }
      return false;
    },
    onHide: () => {
      flipped = false;
      container.classList.remove('flipped');
    },
  };
}
