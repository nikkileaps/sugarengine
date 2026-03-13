import { marked } from 'marked';
import { ItemDefinition } from '../../inventory';
import { ReadableView, LayoutResult } from './layoutTypes';

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

export const bookStyles = `
  .itemview-panel.itemview-book-mode {
    max-width: 640px;
    max-height: 85vh;
  }

  .itemview-book-page {
    display: none;
    flex-direction: column;
    min-height: 0;
  }

  .itemview-book-page.active {
    display: flex;
  }

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
`;

function buildChapterPage(chapter: { title: string; content: string }): HTMLElement {
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

  return page;
}

export function renderBook(
  contentEl: HTMLDivElement,
  item: ItemDefinition,
  view: ReadableView,
): LayoutResult {
  const pages: HTMLElement[] = [];
  const chapters = view.chapters ?? [];
  const bookTitle = view.title || item.name;

  // Disable content scrolling — we paginate instead
  contentEl.style.overflow = 'hidden';

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
  const coverTitleEl = document.createElement('div');
  coverTitleEl.className = 'itemview-book-cover-title';
  coverTitleEl.textContent = bookTitle;
  coverInner.appendChild(coverTitleEl);
  if (view.author) {
    const coverAuthor = document.createElement('div');
    coverAuthor.className = 'itemview-book-cover-author';
    coverAuthor.textContent = `by ${view.author}`;
    coverInner.appendChild(coverAuthor);
  }
  coverPage.appendChild(coverInner);
  pages.push(coverPage);

  // Track chapter-to-page mapping for TOC
  const chapterPageIndices: number[] = [];
  let bindPageJumps: ((goToPage: (i: number) => void) => void) | undefined;

  if (chapters.length > 1) {
    // Page 1: Table of Contents
    const tocPage = document.createElement('div');
    tocPage.className = 'itemview-book-page';
    const tocInner = document.createElement('div');
    tocInner.className = 'itemview-book-toc';
    const tocTitle = document.createElement('div');
    tocTitle.className = 'itemview-book-toc-title';
    tocTitle.textContent = 'Contents';
    tocInner.appendChild(tocTitle);

    const tocEntries: { pageNumEl: HTMLElement; entryEl: HTMLElement; chapterIdx: number }[] = [];

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
      tocEntries.push({ pageNumEl: pageNum, entryEl: entry, chapterIdx: i });
    }

    tocPage.appendChild(tocInner);
    pages.push(tocPage);

    // Build chapter pages
    for (let i = 0; i < chapters.length; i++) {
      chapterPageIndices.push(pages.length);
      pages.push(buildChapterPage(chapters[i]!));
    }

    // Fill in TOC page numbers
    for (const entry of tocEntries) {
      const pageIdx = chapterPageIndices[entry.chapterIdx];
      entry.pageNumEl.textContent = pageIdx != null ? String(pageIdx + 1) : '';
    }

    // Deferred: bind TOC click handlers once goToPage is available
    bindPageJumps = (goToPage) => {
      for (const entry of tocEntries) {
        const targetPage = chapterPageIndices[entry.chapterIdx];
        if (targetPage != null) {
          entry.entryEl.addEventListener('click', () => goToPage(targetPage));
        }
      }
    };
  } else {
    // Single chapter — no TOC
    for (let i = 0; i < chapters.length; i++) {
      chapterPageIndices.push(pages.length);
      pages.push(buildChapterPage(chapters[i]!));
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
    pages.push(backPage);
  }

  // Add all pages to content
  for (const page of pages) {
    contentEl.appendChild(page);
  }

  return {
    pages,
    panelClass: 'itemview-book-mode',
    bindPageJumps,
  };
}
