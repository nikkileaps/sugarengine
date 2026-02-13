import { marked } from 'marked';
import { ItemDefinition, ItemView } from '../inventory';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

/** Extract the readable view or null */
type ReadableView = Extract<ItemView, { type: 'readable' }>;

/**
 * Detail view popup for inventory items.
 * Renders different content based on ItemDefinition.view type:
 * - readable (no layout): scrollable text with optional sections
 * - readable (book): paginated chapters with cover, TOC, markdown
 * - readable (newspaper): image page gallery
 * - examine: large icon + description
 * - consumable: description + action button
 */
export class ItemViewUI {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;
  private onUseCallback: (() => void) | null = null;

  // Book pagination state
  private bookPages: HTMLElement[] = [];
  private currentPage = 0;
  private pageIndicator: HTMLDivElement | null = null;

  // Newspaper zoom/pan state
  private zoomLevel = 1;
  private panX = 0;
  private panY = 0;
  private panStartX = 0;
  private panStartY = 0;
  private panStartPanX = 0;
  private panStartPanY = 0;
  private activeNewspaperImg: HTMLImageElement | null = null;
  private zoomIndicator: HTMLSpanElement | null = null;

  constructor(parentContainer: HTMLElement) {
    this.injectStyles();

    this.overlay = document.createElement('div');
    this.overlay.className = 'itemview-overlay';

    this.panel = document.createElement('div');
    this.panel.className = 'itemview-panel';

    this.contentEl = document.createElement('div');
    this.contentEl.className = 'itemview-content';
    this.panel.appendChild(this.contentEl);

    this.overlay.appendChild(this.panel);
    parentContainer.appendChild(this.overlay);

    // Block wheel events from reaching the game camera when overlay is visible
    this.overlay.addEventListener('wheel', (e) => {
      e.stopPropagation();
    }, { passive: true });

    this.boundHandleKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  }

  private injectStyles(): void {
    if (document.getElementById('itemview-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'itemview-ui-styles';
    style.textContent = `
      .itemview-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 350;
        opacity: 0;
        transition: opacity 0.2s ease-out;
      }

      .itemview-overlay.visible {
        display: flex;
        opacity: 1;
      }

      .itemview-panel {
        background: linear-gradient(180deg, rgba(45, 40, 55, 0.98) 0%, rgba(30, 27, 40, 0.99) 100%);
        border: 3px solid rgba(180, 160, 140, 0.4);
        border-radius: 16px;
        padding: 28px 32px;
        max-width: 520px;
        max-height: 75vh;
        width: 90%;
        display: flex;
        flex-direction: column;
        font-family: 'Segoe UI', system-ui, sans-serif;
        color: #f0e6d8;
        box-shadow:
          0 12px 48px rgba(0, 0, 0, 0.6),
          0 0 0 1px rgba(255, 255, 255, 0.05) inset,
          0 2px 0 rgba(255, 255, 255, 0.03) inset;
        transform: scale(0.95) translateY(10px);
        opacity: 0;
        animation: itemviewSlideIn 0.25s ease-out forwards;
      }

      .itemview-panel.itemview-book-mode {
        max-width: 640px;
        max-height: 85vh;
      }

      .itemview-panel.itemview-newspaper-mode {
        max-width: 720px;
        max-height: 90vh;
        padding: 20px 24px;
      }

      @keyframes itemviewSlideIn {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(10px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .itemview-content {
        flex: 1;
        overflow-y: auto;
        padding-right: 8px;
      }

      .itemview-content::-webkit-scrollbar {
        width: 6px;
      }

      .itemview-content::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
      }

      .itemview-content::-webkit-scrollbar-thumb {
        background: rgba(180, 160, 140, 0.3);
        border-radius: 3px;
      }

      .itemview-content::-webkit-scrollbar-thumb:hover {
        background: rgba(180, 160, 140, 0.5);
      }

      .itemview-title {
        font-size: 22px;
        font-weight: 700;
        color: #f0e6d8;
        margin-bottom: 6px;
        letter-spacing: 0.3px;
      }

      .itemview-category {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #a8d4f0;
        margin-bottom: 16px;
      }

      .itemview-description {
        font-size: 15px;
        line-height: 1.7;
        color: #e0d6c8;
        margin-bottom: 16px;
      }

      .itemview-section {
        margin-bottom: 20px;
      }

      .itemview-section:last-child {
        margin-bottom: 0;
      }

      .itemview-section-heading {
        font-size: 17px;
        font-weight: 600;
        color: #a8d4f0;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(168, 212, 240, 0.2);
      }

      .itemview-section-text {
        font-size: 15px;
        line-height: 1.7;
        color: #e0d6c8;
        white-space: pre-wrap;
      }

      .itemview-examine-icon {
        font-size: 64px;
        text-align: center;
        margin-bottom: 16px;
        padding: 16px;
      }

      .itemview-action-btn {
        display: block;
        width: 100%;
        padding: 12px 24px;
        margin-top: 8px;
        background: rgba(168, 212, 240, 0.15);
        border: 2px solid rgba(168, 212, 240, 0.3);
        border-radius: 10px;
        color: #a8d4f0;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease-out;
        font-family: inherit;
      }

      .itemview-action-btn:hover {
        background: rgba(168, 212, 240, 0.25);
        border-color: rgba(168, 212, 240, 0.5);
      }

      .itemview-close-hint {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid rgba(180, 160, 140, 0.15);
        font-size: 13px;
        color: rgba(240, 230, 216, 0.4);
        text-align: center;
      }

      .itemview-key {
        display: inline-block;
        padding: 2px 8px;
        background: rgba(136, 180, 220, 0.2);
        border: 1px solid rgba(136, 180, 220, 0.3);
        border-radius: 4px;
        font-weight: 600;
        color: #a8d4f0;
        font-size: 12px;
      }

      /* ========================================
         Book Layout
         ======================================== */

      .itemview-book-page {
        display: none;
        flex-direction: column;
        min-height: 0;
      }

      .itemview-book-page.active {
        display: flex;
      }

      /* Cover page */
      .itemview-book-cover {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 32px 24px;
        flex: 1;
      }

      .itemview-book-cover-image {
        max-width: 70%;
        max-height: 300px;
        border-radius: 8px;
        margin-bottom: 24px;
        border: 1px solid rgba(180, 160, 140, 0.2);
        object-fit: contain;
      }

      .itemview-book-cover-title {
        font-size: 28px;
        font-weight: 700;
        color: #f0e6d8;
        margin-bottom: 8px;
        letter-spacing: 0.5px;
        font-family: Georgia, 'Times New Roman', serif;
      }

      .itemview-book-cover-author {
        font-size: 16px;
        color: rgba(240, 230, 216, 0.6);
        font-style: italic;
        font-family: Georgia, 'Times New Roman', serif;
      }

      /* Table of contents */
      .itemview-book-toc {
        padding: 16px 0;
      }

      .itemview-book-toc-title {
        font-size: 20px;
        font-weight: 700;
        color: #f0e6d8;
        margin-bottom: 20px;
        font-family: Georgia, 'Times New Roman', serif;
        text-align: center;
      }

      .itemview-book-toc-entry {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        padding: 8px 4px;
        border-bottom: 1px dotted rgba(180, 160, 140, 0.15);
        cursor: pointer;
        transition: color 0.15s ease-out;
      }

      .itemview-book-toc-entry:hover {
        color: #a8d4f0;
      }

      .itemview-book-toc-chapter {
        font-size: 15px;
        color: #e0d6c8;
        font-family: Georgia, 'Times New Roman', serif;
      }

      .itemview-book-toc-page {
        font-size: 13px;
        color: rgba(240, 230, 216, 0.4);
        margin-left: 12px;
        flex-shrink: 0;
      }

      /* Chapter content */
      .itemview-book-chapter-title {
        font-size: 22px;
        font-weight: 700;
        color: #f0e6d8;
        margin-bottom: 20px;
        padding-bottom: 12px;
        border-bottom: 2px solid rgba(180, 160, 140, 0.2);
        font-family: Georgia, 'Times New Roman', serif;
      }

      .itemview-book-body {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 15px;
        line-height: 1.8;
        color: #e0d6c8;
      }

      .itemview-book-body h1,
      .itemview-book-body h2,
      .itemview-book-body h3 {
        font-weight: 700;
        color: #f0e6d8;
        margin-top: 24px;
        margin-bottom: 12px;
      }

      .itemview-book-body h1 { font-size: 20px; }
      .itemview-book-body h2 { font-size: 18px; }
      .itemview-book-body h3 { font-size: 16px; color: #a8d4f0; }

      .itemview-book-body p {
        margin: 0 0 12px 0;
        text-indent: 1.5em;
      }

      .itemview-book-body p:first-child {
        text-indent: 0;
      }

      .itemview-book-body blockquote {
        margin: 16px 0;
        padding: 12px 20px;
        border-left: 3px solid rgba(168, 212, 240, 0.3);
        background: rgba(168, 212, 240, 0.05);
        border-radius: 0 8px 8px 0;
        font-style: italic;
        color: rgba(240, 230, 216, 0.8);
      }

      .itemview-book-body blockquote p {
        text-indent: 0;
        margin-bottom: 0;
      }

      .itemview-book-body hr {
        border: none;
        text-align: center;
        margin: 24px 0;
        color: rgba(180, 160, 140, 0.4);
      }

      .itemview-book-body hr::after {
        content: '* * *';
        letter-spacing: 8px;
      }

      .itemview-book-body img {
        max-width: 100%;
        border-radius: 8px;
        margin: 16px 0;
        border: 1px solid rgba(180, 160, 140, 0.2);
      }

      .itemview-book-body ul,
      .itemview-book-body ol {
        margin: 8px 0 12px 0;
        padding-left: 24px;
      }

      .itemview-book-body li {
        margin-bottom: 4px;
      }

      .itemview-book-body a {
        color: #a8d4f0;
        text-decoration: none;
      }

      .itemview-book-body strong {
        color: #f0e6d8;
      }

      /* Back cover */
      .itemview-book-back {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 32px 24px;
        flex: 1;
      }

      .itemview-book-back-blurb {
        font-size: 15px;
        line-height: 1.7;
        color: rgba(240, 230, 216, 0.7);
        font-style: italic;
        font-family: Georgia, 'Times New Roman', serif;
        max-width: 400px;
      }

      .itemview-book-back-author {
        margin-top: 24px;
        font-size: 14px;
        color: rgba(240, 230, 216, 0.5);
        font-family: Georgia, 'Times New Roman', serif;
      }

      /* Page navigation */
      .itemview-page-nav {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid rgba(180, 160, 140, 0.15);
        user-select: none;
      }

      .itemview-page-btn {
        background: rgba(168, 212, 240, 0.1);
        border: 1px solid rgba(168, 212, 240, 0.2);
        border-radius: 8px;
        color: #a8d4f0;
        font-size: 14px;
        font-weight: 600;
        padding: 6px 16px;
        cursor: pointer;
        transition: all 0.15s ease-out;
        font-family: inherit;
        min-width: 80px;
      }

      .itemview-page-btn:hover:not(:disabled) {
        background: rgba(168, 212, 240, 0.2);
        border-color: rgba(168, 212, 240, 0.4);
      }

      .itemview-page-btn:disabled {
        opacity: 0.3;
        cursor: default;
      }

      .itemview-page-indicator {
        font-size: 13px;
        color: rgba(240, 230, 216, 0.4);
      }

      .itemview-page-hint {
        font-size: 11px;
        color: rgba(240, 230, 216, 0.3);
        text-align: center;
        margin-top: 8px;
      }

      /* ========================================
         Newspaper Layout
         ======================================== */

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

      .itemview-zoom-controls {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .itemview-zoom-btn {
        background: rgba(168, 212, 240, 0.1);
        border: 1px solid rgba(168, 212, 240, 0.2);
        border-radius: 6px;
        color: #a8d4f0;
        font-size: 16px;
        font-weight: 700;
        width: 28px;
        height: 28px;
        cursor: pointer;
        transition: all 0.15s ease-out;
        font-family: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        line-height: 1;
      }

      .itemview-zoom-btn:hover {
        background: rgba(168, 212, 240, 0.2);
        border-color: rgba(168, 212, 240, 0.4);
      }

      .itemview-zoom-level {
        font-size: 12px;
        color: rgba(240, 230, 216, 0.4);
        min-width: 40px;
        text-align: center;
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible()) return;

    if (e.code === 'Escape') {
      e.preventDefault();
      this.hide();
      return;
    }

    // Page navigation for book/newspaper
    if (this.bookPages.length > 0) {
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') {
        e.preventDefault();
        this.goToPage(this.currentPage + 1);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.goToPage(this.currentPage - 1);
      }
    }
  }

  private getCategoryIcon(category: string): string {
    switch (category) {
      case 'quest': return '\uD83D\uDCDC';
      case 'gift': return '\uD83C\uDF81';
      case 'key': return '\uD83D\uDD11';
      default: return '\u2726';
    }
  }

  show(item: ItemDefinition, onUse?: () => void): void {
    this.onUseCallback = onUse ?? null;
    this.contentEl.innerHTML = '';
    this.bookPages = [];
    this.currentPage = 0;
    this.pageIndicator = null;

    // Reset panel mode classes
    this.panel.classList.remove('itemview-book-mode', 'itemview-newspaper-mode');

    const view = item.view;
    if (!view) return;

    switch (view.type) {
      case 'readable':
        if (view.layout === 'book') {
          this.panel.classList.add('itemview-book-mode');
          this.renderBook(item, view);
        } else if (view.layout === 'newspaper') {
          this.panel.classList.add('itemview-newspaper-mode');
          this.renderNewspaper(item, view);
        } else {
          // Default: scrollable text (note/scroll)
          this.renderDefaultReadable(item, view);
        }
        break;
      case 'examine':
        this.renderExamine(item);
        break;
      case 'consumable':
        this.renderConsumable(item, view);
        break;
    }

    // Reset animation
    this.panel.style.animation = 'none';
    void this.panel.offsetHeight;
    this.panel.style.animation = 'itemviewSlideIn 0.25s ease-out forwards';

    this.overlay.classList.add('visible');
    window.addEventListener('keydown', this.boundHandleKeyDown);
  }

  // ========================================
  // Default readable (no layout) — scrollable text
  // ========================================

  private renderDefaultReadable(item: ItemDefinition, view: ReadableView): void {
    // Title + category header
    this.appendHeader(item);

    if (view.sections && view.sections.length > 0) {
      for (const section of view.sections) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'itemview-section';

        if (section.heading) {
          const heading = document.createElement('div');
          heading.className = 'itemview-section-heading';
          heading.textContent = section.heading;
          sectionEl.appendChild(heading);
        }

        const text = document.createElement('div');
        text.className = 'itemview-section-text';
        text.textContent = section.text;
        sectionEl.appendChild(text);

        this.contentEl.appendChild(sectionEl);
      }
    } else if (view.content) {
      const text = document.createElement('div');
      text.className = 'itemview-section-text';
      text.textContent = view.content;
      this.contentEl.appendChild(text);
    }

    this.appendCloseHint('ESC');
  }

  // ========================================
  // Book layout — paginated chapters with cover & TOC
  // ========================================

  private renderBook(item: ItemDefinition, view: ReadableView): void {
    const chapters = view.chapters ?? [];
    const bookTitle = view.title || item.name;

    // Disable content scrolling — we paginate instead
    this.contentEl.style.overflow = 'hidden';

    // Build all pages
    // Page 0: Cover
    const coverPage = document.createElement('div');
    coverPage.className = 'itemview-book-page';
    const coverInner = document.createElement('div');
    coverInner.className = 'itemview-book-cover';
    if (view.cover) {
      const coverImg = document.createElement('img');
      coverImg.className = 'itemview-book-cover-image';
      coverImg.src = view.cover;
      coverInner.appendChild(coverImg);
    }
    const coverTitle = document.createElement('div');
    coverTitle.className = 'itemview-book-cover-title';
    coverTitle.textContent = bookTitle;
    coverInner.appendChild(coverTitle);
    if (view.author) {
      const coverAuthor = document.createElement('div');
      coverAuthor.className = 'itemview-book-cover-author';
      coverAuthor.textContent = `by ${view.author}`;
      coverInner.appendChild(coverAuthor);
    }
    coverPage.appendChild(coverInner);
    this.bookPages.push(coverPage);

    // Track chapter-to-page mapping for TOC
    const chapterPageIndices: number[] = [];

    // Page 1: Table of Contents (if multiple chapters)
    if (chapters.length > 1) {
      const tocPage = document.createElement('div');
      tocPage.className = 'itemview-book-page';
      const tocInner = document.createElement('div');
      tocInner.className = 'itemview-book-toc';
      const tocTitle = document.createElement('div');
      tocTitle.className = 'itemview-book-toc-title';
      tocTitle.textContent = 'Contents';
      tocInner.appendChild(tocTitle);

      // We'll fill page numbers after building chapter pages
      const tocEntries: { el: HTMLElement; chapterIdx: number }[] = [];

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i]!;
        const entry = document.createElement('div');
        entry.className = 'itemview-book-toc-entry';
        const chapterName = document.createElement('span');
        chapterName.className = 'itemview-book-toc-chapter';
        chapterName.textContent = ch.title;
        entry.appendChild(chapterName);
        const pageNum = document.createElement('span');
        pageNum.className = 'itemview-book-toc-page';
        entry.appendChild(pageNum);
        tocInner.appendChild(entry);
        tocEntries.push({ el: pageNum, chapterIdx: i });

        // Click to jump to chapter
        const chapterIndex = i;
        entry.addEventListener('click', () => {
          const targetPage = chapterPageIndices[chapterIndex];
          if (targetPage != null) this.goToPage(targetPage);
        });
      }

      tocPage.appendChild(tocInner);
      this.bookPages.push(tocPage);

      // Build chapter pages, then update TOC page numbers
      for (let i = 0; i < chapters.length; i++) {
        chapterPageIndices.push(this.bookPages.length);
        this.buildChapterPage(chapters[i]!);
      }

      // Fill in TOC page numbers
      for (const entry of tocEntries) {
        const pageIdx = chapterPageIndices[entry.chapterIdx];
        entry.el.textContent = pageIdx != null ? String(pageIdx + 1) : '';
      }
    } else {
      // Single chapter — no TOC
      for (let i = 0; i < chapters.length; i++) {
        chapterPageIndices.push(this.bookPages.length);
        this.buildChapterPage(chapters[i]!);
      }
    }

    // Back cover (if blurb or author)
    if (view.blurb || view.author) {
      const backPage = document.createElement('div');
      backPage.className = 'itemview-book-page';
      const backInner = document.createElement('div');
      backInner.className = 'itemview-book-back';
      if (view.blurb) {
        const blurb = document.createElement('div');
        blurb.className = 'itemview-book-back-blurb';
        blurb.textContent = view.blurb;
        backInner.appendChild(blurb);
      }
      if (view.author) {
        const author = document.createElement('div');
        author.className = 'itemview-book-back-author';
        author.textContent = view.author;
        backInner.appendChild(author);
      }
      backPage.appendChild(backInner);
      this.bookPages.push(backPage);
    }

    // Add all pages to content
    for (const page of this.bookPages) {
      this.contentEl.appendChild(page);
    }

    // Navigation + page indicator
    this.appendPageNav();

    // Show first page
    this.goToPage(0);
  }

  private buildChapterPage(chapter: { title: string; content: string }): void {
    const page = document.createElement('div');
    page.className = 'itemview-book-page';

    const chapterTitle = document.createElement('div');
    chapterTitle.className = 'itemview-book-chapter-title';
    chapterTitle.textContent = chapter.title;
    page.appendChild(chapterTitle);

    const body = document.createElement('div');
    body.className = 'itemview-book-body';

    // Render markdown to HTML
    const html = marked.parse(chapter.content) as string;
    // Sanitize: strip <script> tags as defense-in-depth
    body.innerHTML = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Make links non-clickable (this is a game, not a browser)
    const links = body.querySelectorAll('a');
    for (const link of links) {
      link.removeAttribute('href');
      link.style.cursor = 'default';
    }

    page.appendChild(body);

    // The chapter content scrolls within its page
    body.style.flex = '1';
    body.style.overflowY = 'auto';
    body.style.paddingRight = '8px';

    this.bookPages.push(page);
  }

  // ========================================
  // Newspaper layout — image page gallery
  // ========================================

  private renderNewspaper(item: ItemDefinition, view: ReadableView): void {
    const pages = view.pages ?? [];
    if (pages.length === 0) return;

    // Disable content scrolling
    this.contentEl.style.overflow = 'hidden';
    this.contentEl.style.display = 'flex';
    this.contentEl.style.flexDirection = 'column';

    // Optional title
    const newspaperTitle = view.title || item.name;
    const titleEl = document.createElement('div');
    titleEl.className = 'itemview-newspaper-title';
    titleEl.textContent = newspaperTitle;
    this.contentEl.appendChild(titleEl);

    // Build one page element per image
    for (const pageSrc of pages) {
      const pageEl = document.createElement('div');
      pageEl.className = 'itemview-book-page'; // reuse page visibility class
      const inner = document.createElement('div');
      inner.className = 'itemview-newspaper-page';
      const img = document.createElement('img');
      img.src = pageSrc;
      img.alt = `${newspaperTitle} page`;
      inner.appendChild(img);

      // Pan: mouse drag (attach move/up to window so drag works even outside bounds)
      inner.addEventListener('mousedown', (e) => {
        if (this.zoomLevel <= 1) return;
        e.preventDefault();
        e.stopPropagation();
        this.panStartX = e.clientX;
        this.panStartY = e.clientY;
        this.panStartPanX = this.panX;
        this.panStartPanY = this.panY;
        inner.classList.add('panning');
        img.style.transition = 'none';

        const onMouseMove = (ev: MouseEvent) => {
          this.panX = this.panStartPanX + (ev.clientX - this.panStartX);
          this.panY = this.panStartPanY + (ev.clientY - this.panStartY);
          this.applyNewspaperTransform(img);
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

      // Zoom: mouse wheel (stop propagation so camera doesn't zoom too)
      inner.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -0.25 : 0.25;
        this.setNewspaperZoom(this.zoomLevel + delta, img);
      }, { passive: false });

      pageEl.appendChild(inner);
      this.bookPages.push(pageEl);
      this.contentEl.appendChild(pageEl);
    }

    this.appendPageNav(true);
    this.resetNewspaperZoom();
    this.goToPage(0);
  }

  private setNewspaperZoom(level: number, img?: HTMLImageElement): void {
    this.zoomLevel = Math.max(1, Math.min(4, level));

    // If zooming back to 1, reset pan
    if (this.zoomLevel === 1) {
      this.panX = 0;
      this.panY = 0;
    }

    const target = img ?? this.activeNewspaperImg;
    if (target) this.applyNewspaperTransform(target);
    if (this.zoomIndicator) {
      this.zoomIndicator.textContent = `${Math.round(this.zoomLevel * 100)}%`;
    }
  }

  private applyNewspaperTransform(img: HTMLImageElement): void {
    if (this.zoomLevel <= 1) {
      img.style.transform = '';
      img.style.transformOrigin = 'center center';
      img.style.margin = '0 auto';
    } else {
      img.style.transformOrigin = '0 0';
      img.style.margin = '0';
      img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
    }
  }

  private resetNewspaperZoom(): void {
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    if (this.zoomIndicator) {
      this.zoomIndicator.textContent = '100%';
    }
  }

  // ========================================
  // Examine layout
  // ========================================

  private renderExamine(item: ItemDefinition): void {
    this.appendHeader(item);

    const iconEl = document.createElement('div');
    iconEl.className = 'itemview-examine-icon';
    iconEl.textContent = this.getCategoryIcon(item.category);
    this.contentEl.appendChild(iconEl);

    if (item.description) {
      const desc = document.createElement('div');
      desc.className = 'itemview-description';
      desc.textContent = item.description;
      this.contentEl.appendChild(desc);
    }

    this.appendCloseHint('ESC');
  }

  // ========================================
  // Consumable layout
  // ========================================

  private renderConsumable(item: ItemDefinition, view: Extract<ItemView, { type: 'consumable' }>): void {
    this.appendHeader(item);

    if (item.description) {
      const desc = document.createElement('div');
      desc.className = 'itemview-description';
      desc.textContent = item.description;
      this.contentEl.appendChild(desc);
    }

    const btn = document.createElement('button');
    btn.className = 'itemview-action-btn';
    btn.textContent = view.action;
    btn.addEventListener('click', () => {
      if (this.onUseCallback) {
        this.onUseCallback();
      }
    });
    this.contentEl.appendChild(btn);

    this.appendCloseHint('ESC');
  }

  // ========================================
  // Shared helpers
  // ========================================

  private appendHeader(item: ItemDefinition): void {
    const title = document.createElement('div');
    title.className = 'itemview-title';
    title.textContent = item.name;
    this.contentEl.appendChild(title);

    const category = document.createElement('div');
    category.className = 'itemview-category';
    category.textContent = item.category;
    this.contentEl.appendChild(category);
  }

  private appendCloseHint(key: string): void {
    const hint = document.createElement('div');
    hint.className = 'itemview-close-hint';
    hint.innerHTML = `Press <span class="itemview-key">${key}</span> to close`;
    this.contentEl.appendChild(hint);
  }

  private appendPageNav(withZoom = false): void {
    const nav = document.createElement('div');
    nav.className = 'itemview-page-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'itemview-page-btn';
    prevBtn.textContent = '\u2190 Prev';
    prevBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
    nav.appendChild(prevBtn);

    // Center section: page indicator + optional zoom
    const centerSection = document.createElement('div');
    centerSection.style.display = 'flex';
    centerSection.style.flexDirection = 'column';
    centerSection.style.alignItems = 'center';
    centerSection.style.gap = '6px';

    this.pageIndicator = document.createElement('div');
    this.pageIndicator.className = 'itemview-page-indicator';
    centerSection.appendChild(this.pageIndicator);

    if (withZoom) {
      const zoomControls = document.createElement('div');
      zoomControls.className = 'itemview-zoom-controls';

      const zoomOut = document.createElement('button');
      zoomOut.className = 'itemview-zoom-btn';
      zoomOut.textContent = '\u2212';
      zoomOut.addEventListener('click', () => this.setNewspaperZoom(this.zoomLevel - 0.25));
      zoomControls.appendChild(zoomOut);

      this.zoomIndicator = document.createElement('span');
      this.zoomIndicator.className = 'itemview-zoom-level';
      this.zoomIndicator.textContent = '100%';
      zoomControls.appendChild(this.zoomIndicator);

      const zoomIn = document.createElement('button');
      zoomIn.className = 'itemview-zoom-btn';
      zoomIn.textContent = '+';
      zoomIn.addEventListener('click', () => this.setNewspaperZoom(this.zoomLevel + 0.25));
      zoomControls.appendChild(zoomIn);

      centerSection.appendChild(zoomControls);
    }

    nav.appendChild(centerSection);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'itemview-page-btn';
    nextBtn.textContent = 'Next \u2192';
    nextBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
    nav.appendChild(nextBtn);

    this.contentEl.appendChild(nav);

    const hint = document.createElement('div');
    hint.className = 'itemview-page-hint';
    const hintText = withZoom
      ? 'Scroll to zoom \u00b7 drag to pan \u00b7 <span class="itemview-key">\u2190</span> <span class="itemview-key">\u2192</span> to turn pages \u00b7 <span class="itemview-key">ESC</span> to close'
      : 'Use <span class="itemview-key">\u2190</span> <span class="itemview-key">\u2192</span> arrow keys or <span class="itemview-key">ESC</span> to close';
    hint.innerHTML = hintText;
    this.contentEl.appendChild(hint);
  }

  private goToPage(pageIndex: number): void {
    if (pageIndex < 0 || pageIndex >= this.bookPages.length) return;

    // Hide current page
    this.bookPages[this.currentPage]?.classList.remove('active');

    this.currentPage = pageIndex;

    // Show new page
    this.bookPages[this.currentPage]?.classList.add('active');

    // Reset zoom on page change and track active newspaper image
    this.resetNewspaperZoom();
    const activePage = this.bookPages[this.currentPage];
    const img = activePage?.querySelector('.itemview-newspaper-page img') as HTMLImageElement | null;
    this.activeNewspaperImg = img;
    if (img) this.applyNewspaperTransform(img);

    // Update indicator
    if (this.pageIndicator) {
      this.pageIndicator.textContent = `${this.currentPage + 1} / ${this.bookPages.length}`;
    }

    // Update button states
    const nav = this.contentEl.querySelector('.itemview-page-nav');
    if (nav) {
      const buttons = nav.querySelectorAll('.itemview-page-btn');
      const prevBtn = buttons[0] as HTMLButtonElement;
      const nextBtn = buttons[1] as HTMLButtonElement;
      if (prevBtn) prevBtn.disabled = this.currentPage === 0;
      if (nextBtn) nextBtn.disabled = this.currentPage === this.bookPages.length - 1;
    }
  }

  hide(): void {
    this.overlay.classList.remove('visible');
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    this.onUseCallback = null;
    this.bookPages = [];
    this.currentPage = 0;
    this.pageIndicator = null;

    // Reset zoom/pan state
    this.resetNewspaperZoom();
    this.activeNewspaperImg = null;
    this.zoomIndicator = null;

    // Reset content styles that layouts may have changed
    this.contentEl.style.overflow = '';
    this.contentEl.style.display = '';
    this.contentEl.style.flexDirection = '';
  }

  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  dispose(): void {
    this.hide();
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    this.overlay.remove();
  }
}
