import { ItemDefinition } from '../../inventory';
import { ReadableView, LayoutResult } from './layoutTypes';

export const newspaperStyles = `
  .itemview-panel.itemview-newspaper-mode {
    max-width: 720px;
    max-height: 90vh;
    padding: 20px 24px;
  }

  .itemview-newspaper-page {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    position: relative;
    cursor: grab;
    user-select: none;
  }

  .itemview-newspaper-page.panning {
    cursor: grabbing;
  }

  .itemview-newspaper-page img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 4px;
    transform-origin: 0 0;
    transition: transform 0.1s ease-out;
    pointer-events: none;
    display: block;
    margin: 0 auto;
  }

  .itemview-newspaper-title {
    font-size: 14px;
    font-weight: 600;
    color: rgba(240, 230, 216, 0.5);
    text-align: center;
    margin-bottom: 12px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
`;

export function renderNewspaper(
  contentEl: HTMLDivElement,
  item: ItemDefinition,
  view: ReadableView,
): LayoutResult {
  const pages: HTMLElement[] = [];
  const pageSources = view.pages ?? [];
  if (pageSources.length === 0) return { pages: [] };

  // Zoom/pan state (owned by this closure)
  let zoomLevel = 1;
  let panX = 0;
  let panY = 0;
  let activeImg: HTMLImageElement | null = null;
  let zoomLabelEl: HTMLSpanElement | null = null;

  function applyTransform(img: HTMLImageElement): void {
    if (zoomLevel <= 1) {
      img.style.transform = '';
      img.style.transformOrigin = 'center center';
      img.style.margin = '0 auto';
    } else {
      img.style.transformOrigin = '0 0';
      img.style.margin = '0';
      img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomLevel})`;
    }
  }

  function setZoom(level: number, img?: HTMLImageElement): void {
    zoomLevel = Math.max(1, Math.min(4, level));
    if (zoomLevel === 1) {
      panX = 0;
      panY = 0;
    }
    const target = img ?? activeImg;
    if (target) applyTransform(target);
    if (zoomLabelEl) {
      zoomLabelEl.textContent = `${Math.round(zoomLevel * 100)}%`;
    }
  }

  function resetZoom(): void {
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    if (zoomLabelEl) {
      zoomLabelEl.textContent = '100%';
    }
  }

  // Disable content scrolling
  contentEl.style.overflow = 'hidden';
  contentEl.style.display = 'flex';
  contentEl.style.flexDirection = 'column';

  // Optional title
  const newspaperTitle = view.title || item.name;
  const titleEl = document.createElement('div');
  titleEl.className = 'itemview-newspaper-title';
  titleEl.textContent = newspaperTitle;
  contentEl.appendChild(titleEl);

  // Build one page element per image
  for (const pageSrc of pageSources) {
    const pageEl = document.createElement('div');
    pageEl.className = 'itemview-book-page'; // reuse page visibility class
    const inner = document.createElement('div');
    inner.className = 'itemview-newspaper-page';
    const img = document.createElement('img');
    img.src = pageSrc;
    img.alt = `${newspaperTitle} page`;
    inner.appendChild(img);

    // Pan: mouse drag
    inner.addEventListener('mousedown', (e) => {
      if (zoomLevel <= 1) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPanX = panX;
      const startPanY = panY;
      inner.classList.add('panning');
      img.style.transition = 'none';

      const onMouseMove = (ev: MouseEvent) => {
        panX = startPanX + (ev.clientX - startX);
        panY = startPanY + (ev.clientY - startY);
        applyTransform(img);
      };

      const onMouseUp = () => {
        inner.classList.remove('panning');
        img.style.transition = 'transform 0.1s ease-out';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Zoom: mouse wheel
    inner.addEventListener('wheel', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.25 : 0.25;
      setZoom(zoomLevel + delta, img);
    }, { passive: false });

    pageEl.appendChild(inner);
    pages.push(pageEl);
    contentEl.appendChild(pageEl);
  }

  return {
    pages,
    panelClass: 'itemview-newspaper-mode',
    withZoom: true,
    zoomIn: () => setZoom(zoomLevel + 0.25),
    zoomOut: () => setZoom(zoomLevel - 0.25),
    getZoomLabel: () => `${Math.round(zoomLevel * 100)}%`,
    setZoomLabelEl: (el) => { zoomLabelEl = el; },
    onPageChange: (pageIndex) => {
      resetZoom();
      const pageEl = pages[pageIndex];
      const img = pageEl?.querySelector('.itemview-newspaper-page img') as HTMLImageElement | null;
      activeImg = img;
      if (img) applyTransform(img);
    },
    onHide: () => {
      resetZoom();
      activeImg = null;
      zoomLabelEl = null;
    },
  };
}
