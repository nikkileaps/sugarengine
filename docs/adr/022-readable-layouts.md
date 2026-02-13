# ADR-022: Readable Item Layouts

## Status

Accepted (Phases 1-3 Implemented)

## Context

ADR-021 added the `ItemView` discriminated union with a basic `readable` type that shows scrollable text sections. This works for short notes and signs, but the game world needs richer readable items — a multi-page newspaper designed in InDesign, a book with chapters and a cover, a handwritten letter, a postcard with a front image, a flyer pinned to a notice board.

These are all "readable" items but with fundamentally different **presentations**. A newspaper is image pages you flip through. A book is paginated markdown with chapters and a table of contents. A postcard has a front image and back text you flip between. A letter is short text on an aged-paper background.

### The Problem

The current `readable` variant has `content?: string` and `sections?: { heading?; text }[]`. This is fine for a simple note but can't express:

- **Page-turning** — newspapers and books aren't scrolled, they're paged
- **Cover/back matter** — books have covers, blurbs, author attribution
- **Chapters** — long-form content needs structure beyond flat sections
- **Image pages** — a newspaper designed in InDesign should display as pre-rendered page images
- **Two-sided items** — a postcard has a front (image) and back (text)
- **Visual identity** — a letter should look like a letter, not a generic text panel

Adding separate view types (`book`, `newspaper`, `letter`, `postcard`, `flyer`) would create type explosion. The underlying content model is shared — they all have some combination of text, images, titles, and authors. The difference is **layout and presentation**.

### Prior Art

| System | Approach |
|--------|----------|
| Elder Scrolls (Skyrim) | Book items open a paginated reader with page-turn. All books use the same reader, different content. |
| Disco Elysium | Thought Cabinet entries, case notes use the same viewer with different visual treatments. |
| Gone Home | Found documents have different visual styles (letters, postcards, notes) but share a "read" interaction. |
| Return of the Obra Dinn | Journal pages with different layouts (sketches, text, diagrams) in one paginated book UI. |
| EPUB format | Single container format, multiple renderers (reflowable text, fixed-layout pages). |

The common pattern: **one content model, multiple visual layouts**.

### InDesign Workflow

The Rackwick City Gazette Post is designed in InDesign with professional layout — columns, typography, pull quotes, mastheads. Markdown or HTML cannot reproduce this. The practical workflow is:

1. Design in InDesign
2. Export pages as PNG images (File > Export > PNG)
3. Reference image paths in the item data
4. Game renders images in a page-flipping gallery

This is the `newspaper` layout — pre-rendered image pages. No text parsing needed.

For authored content (books, letters), markdown is the right format — expressive enough for rich text with headings, emphasis, images, and blockquotes, authorable in any text editor.

## Decision

### 1. Layout Field on Readable

Extend the `readable` view type with a `layout` field and additional content fields. When `layout` is omitted, the current scrollable text behavior is preserved (backwards compatible).

```typescript
export type ReadableLayout = 'book' | 'newspaper' | 'letter' | 'postcard' | 'flyer';

export type ItemView =
  | {
      type: 'readable';
      layout?: ReadableLayout;

      // Text content (existing)
      content?: string;       // simple text or markdown body
      sections?: { heading?: string; text: string }[];

      // Book structure
      title?: string;         // display title (overrides item.name in the reader)
      author?: string;
      cover?: string;         // cover image path
      blurb?: string;         // back cover text
      chapters?: { title: string; content: string }[];  // markdown per chapter

      // Image content
      pages?: string[];       // pre-rendered page images (newspaper, flyer)
      image?: string;         // single image (postcard front)
    }
  | { type: 'examine' }
  | { type: 'consumable'; action: string };
```

### 2. Layout Renderers

Each layout is a rendering strategy within `ItemViewUI`. The layout determines which fields are used and how the content is presented.

#### No layout (default) — Note/Scroll

Current behavior. Scrollable panel with `content` or `sections`. Used for short notes, signs, and simple text readables.

- **Fields used**: `content`, `sections`
- **UI**: Scrollable panel, same as current implementation
- **Interaction**: Scroll to read, ESC to close

#### `book` — Paginated Book

Full reading experience with cover, table of contents, paginated chapters, and back cover.

- **Fields used**: `title`, `author`, `cover`, `blurb`, `chapters`
- **Content format**: `chapters[].content` is **markdown**, rendered to HTML
- **UI structure**:
  1. **Cover page** — cover image with title and author overlay
  2. **Table of contents** — auto-generated from chapter titles, clickable
  3. **Chapter pages** — rendered markdown, paginated into fixed-height pages via CSS column overflow
  4. **Back cover** — blurb text
- **Interaction**: Left/Right arrow keys or click edges to turn pages. Page indicator (Page 3 of 24). ESC to close.
- **Typography**: Serif body text, styled headings, proper paragraph spacing. Markdown images render inline.

#### `newspaper` — Image Page Gallery

Pre-designed pages displayed as images in a page-flipping gallery. For content designed in external tools (InDesign, Photoshop, Figma).

- **Fields used**: `pages`, `title`
- **UI**: Single page displayed at a time, sized to fit the panel. Optional title bar with newspaper name.
- **Interaction**: Left/Right arrow keys to flip pages. Page indicator. ESC to close.

#### `letter` — Handwritten Letter

Short-to-medium text presented on an aged/paper background with handwritten-style typography.

- **Fields used**: `content`, `author`, `title`
- **UI**: Single panel, paper-textured background (CSS gradient, no image dependency). Title as "Dear..." or greeting. Author shown as signature at bottom. Slightly tilted or inset presentation.
- **Typography**: Serif italic or handwriting-style font. Warm color palette.
- **Interaction**: Scroll if long, ESC to close.

#### `postcard` — Two-Sided Card

Front image, click/flip to reveal text on the back.

- **Fields used**: `image`, `content`, `author`
- **UI**: Card-shaped panel. Front shows `image` filling the card. Click or press Space to flip (CSS 3D transform). Back shows `content` text and `author` as sender.
- **Interaction**: Click/Space to flip between sides. ESC to close.

#### `flyer` — Single Page Display

A single image or short bold text, presented as a pinned or posted flyer.

- **Fields used**: `image` or `pages[0]`, `title`
- **UI**: Single image/page, slightly rotated or "pinned" aesthetic. Optional title.
- **Interaction**: ESC to close.

### 3. Markdown Rendering

For book chapter content, add `marked` as a dependency (~7kb gzipped, zero dependencies). Render markdown to HTML, sanitize output (strip `<script>` tags — defense in depth even though content is author-controlled).

```typescript
import { marked } from 'marked';

const html = marked.parse(chapter.content);
```

Markdown features supported in book content:
- Headings (`#`, `##`, `###`) — styled as chapter sub-sections
- Paragraphs, line breaks
- **Bold**, *italic*, ~~strikethrough~~
- Images (`![alt](path)`) — inline or block
- Blockquotes — for character quotes, excerpts
- Horizontal rules (`---`) — scene breaks / section dividers
- Lists (ordered and unordered)
- Links (rendered as styled text, not clickable — this is a game, not a browser)

### 4. Book Pagination

Text content is paginated into fixed-height pages rather than scrolled. This creates the "turning pages" feel.

**Approach**: CSS multi-column layout on a fixed-height container.

```css
.book-page-container {
  column-count: 1;
  column-fill: auto;
  height: 500px;        /* fixed page height */
  overflow: hidden;     /* hide overflow — content flows to next "page" */
}
```

To navigate pages, translate the container horizontally by one column-width per page. Total page count is calculated from `scrollWidth / containerWidth`.

This avoids manually splitting HTML at arbitrary points (which would break mid-paragraph or mid-element). The browser handles the content flow naturally.

### 5. Editor UI

Extend the Interaction card in `ItemDetail.tsx`:

- **Layout select**: appears when view type is `readable`. Options: None (default), Book, Newspaper, Letter, Postcard, Flyer.
- **Conditional fields** based on layout:
  - **Book**: title, author, cover image path, blurb textarea, chapters list (add/remove/reorder chapters, each with title + markdown textarea)
  - **Newspaper**: pages list (add/remove image paths)
  - **Letter**: content textarea (markdown), author input
  - **Postcard**: image path, content textarea, author input
  - **Flyer**: image path or title
- Chapter content textareas get a "Preview" toggle to show rendered markdown

### 6. Data Flow

Same as ADR-021: `ItemData.view` → postMessage → `registerProjectContent` → `ItemDefinition.view` → `InventoryUI` click → `ItemViewUI.show()`. The `layout` field and new content fields serialize as plain JSON — no special handling needed.

## Changes

### New Dependencies

- **`marked`** (~7kb gzipped) — markdown parser for book chapter content

### Modified Files

**`src/engine/inventory/types.ts`**
- Add `ReadableLayout` type
- Extend readable variant with `layout`, `title`, `author`, `cover`, `blurb`, `chapters`, `pages`, `image` fields

**`src/engine/ui/ItemViewUI.ts`**
- Add layout-specific renderers: `renderBook()`, `renderNewspaper()`, `renderLetter()`, `renderPostcard()`, `renderFlyer()`
- Add page navigation (arrow keys, page indicator)
- Add markdown rendering for book content
- Add CSS 3D flip for postcard
- Add book pagination via CSS columns

**`src/engine/ui/ItemViewUI.ts` (styles)**
- Book typography (serif, proper spacing, page layout)
- Letter aesthetic (paper background, italic text)
- Postcard flip animation
- Newspaper page display
- Page navigation controls styling

**`src/editor/panels/item/ItemDetail.tsx`**
- Layout selector within readable view type
- Conditional field groups per layout
- Chapter list editor for books (add/remove/reorder)
- Image path fields for newspaper pages, postcard front

**`src/editor/store/useEditorStore.ts`**
- Type update follows from `ItemView` changes (uses engine type)

**`src/editor/panels/item/ItemPanel.tsx`**
- Type update follows from `ItemView` changes (uses engine type)

## Implementation Phases

### Phase 1: Data Model
- Add `ReadableLayout` and new fields to `ItemView` readable variant
- Update editor types
- Verify build

### Phase 2: Book Layout
- Add `marked` dependency
- Implement markdown rendering in `ItemViewUI`
- Build book pagination (CSS column approach)
- Build page navigation (arrow keys, indicators, cover/TOC/back)
- Book-specific typography and styling

### Phase 3: Newspaper Layout
- Image page gallery renderer
- Page-flip navigation
- Newspaper styling

### Phase 4: Letter, Postcard, Flyer
- Letter renderer (paper aesthetic, signature)
- Postcard renderer (flip animation, front/back)
- Flyer renderer (single image display)

### Phase 5: Editor UI
- Layout selector in Interaction card
- Per-layout field groups
- Chapter list editor for books
- Image path lists for newspaper pages

### Phase 6: Polish
- Page-turn animations (subtle slide or fade)
- Bookmark / remember last-read page (persist in save data)
- Keyboard hints per layout (arrow keys for paging, space for flip)

## Consequences

### Positive

- One content model serves all readable item types — no type explosion
- Adding new layouts (telegram, recipe card, wanted poster) is additive — new renderer, no type changes
- InDesign workflow preserved — export PNGs, reference paths, done
- Markdown gives rich text authoring without a custom editor
- Book pagination creates genuine page-turning feel without manual page breaks
- Backwards compatible — existing readables without `layout` keep working

### Negative

- New dependency (`marked`) adds ~7kb to bundle
- Book pagination via CSS columns may have edge cases with very large images or unusual content
- Five layout renderers in one component — `ItemViewUI` grows significantly
- Postcard flip animation needs CSS 3D transforms (minor browser compat concern — all modern browsers support it)

### Neutral

- Markdown is rendered at display time, not stored as HTML — content stays editable
- Layout field is optional — progressive complexity (simple readables don't need it)
- Image pages (newspaper) require manual export from design tools — not automated
- No WYSIWYG markdown editor in the editor UI yet — plain textarea with preview toggle
