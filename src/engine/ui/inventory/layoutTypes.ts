import { ItemDefinition, ItemView } from '../../inventory';

export type ReadableView = Extract<ItemView, { type: 'readable' }>;

export interface LayoutResult {
  /** Paginated pages — empty array for non-paginated layouts */
  pages: HTMLElement[];
  /** Show zoom controls in page nav */
  withZoom?: boolean;
  /** Zoom callbacks for page nav buttons */
  zoomIn?: () => void;
  zoomOut?: () => void;
  getZoomLabel?: () => string;
  /** Allow layout to update zoom label on internal zoom changes (e.g. wheel) */
  setZoomLabelEl?: (el: HTMLSpanElement) => void;
  /** Additional keyboard handler — return true if handled */
  onKeyDown?: (code: string) => boolean;
  /** Called when page changes (for layouts that need page-change hooks) */
  onPageChange?: (pageIndex: number) => void;
  /** Cleanup on hide */
  onHide?: () => void;
  /** Panel CSS class to add */
  panelClass?: string;
  /** Deferred TOC click binding (book layout) */
  bindPageJumps?: (goToPage: (index: number) => void) => void;
}

export function createCloseHint(key: string): HTMLDivElement {
  const hint = document.createElement('div');
  hint.className = 'itemview-close-hint';
  hint.innerHTML = `Press <span class="itemview-key">${key}</span> to close`;
  return hint;
}

export function createHeader(item: ItemDefinition): DocumentFragment {
  const frag = document.createDocumentFragment();
  const title = document.createElement('div');
  title.className = 'itemview-title';
  title.textContent = item.name;
  frag.appendChild(title);
  const category = document.createElement('div');
  category.className = 'itemview-category';
  category.textContent = item.category;
  frag.appendChild(category);
  return frag;
}
