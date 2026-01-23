import { InspectionData } from '../inspection/types';

/**
 * UI component for displaying inspection content (newspapers, signs, lore objects)
 * Supports rich content with titles, images, and multiple sections
 */
export class InspectionUI {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private headerImageEl: HTMLImageElement;
  private titleEl: HTMLDivElement;
  private subtitleEl: HTMLDivElement;
  private contentEl: HTMLDivElement;
  private closeHint: HTMLDivElement;

  private onClose: (() => void) | null = null;
  private boundHandleKeyDown: (e: KeyboardEvent) => void;

  constructor(parentContainer: HTMLElement) {
    this.injectStyles();

    // Full-screen overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'inspection-overlay';

    // Main panel
    this.panel = document.createElement('div');
    this.panel.className = 'inspection-panel';

    // Header image (optional)
    this.headerImageEl = document.createElement('img');
    this.headerImageEl.className = 'inspection-header-image';
    this.headerImageEl.style.display = 'none';
    this.panel.appendChild(this.headerImageEl);

    // Title
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'inspection-title';
    this.panel.appendChild(this.titleEl);

    // Subtitle (optional)
    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'inspection-subtitle';
    this.panel.appendChild(this.subtitleEl);

    // Scrollable content area
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'inspection-content';
    this.panel.appendChild(this.contentEl);

    // Close hint
    this.closeHint = document.createElement('div');
    this.closeHint.className = 'inspection-close-hint';
    this.closeHint.innerHTML = 'Press <span class="inspection-key">E</span> or <span class="inspection-key">ESC</span> to close';
    this.panel.appendChild(this.closeHint);

    this.overlay.appendChild(this.panel);
    parentContainer.appendChild(this.overlay);

    // Bind keydown handler
    this.boundHandleKeyDown = (e: KeyboardEvent) => this.handleKeyDown(e);
  }

  private injectStyles(): void {
    if (document.getElementById('inspection-ui-styles')) return;

    const style = document.createElement('style');
    style.id = 'inspection-ui-styles';
    style.textContent = `
      .inspection-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: none;
        justify-content: center;
        align-items: center;
        z-index: 250;
        opacity: 0;
        transition: opacity 0.2s ease-out;
      }

      .inspection-overlay.visible {
        display: flex;
        opacity: 1;
      }

      .inspection-panel {
        background: linear-gradient(180deg, rgba(45, 40, 55, 0.98) 0%, rgba(30, 27, 40, 0.99) 100%);
        border: 3px solid rgba(180, 160, 140, 0.4);
        border-radius: 16px;
        padding: 28px 32px;
        max-width: 600px;
        max-height: 80vh;
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
        animation: inspectionSlideIn 0.25s ease-out forwards;
      }

      @keyframes inspectionSlideIn {
        from {
          opacity: 0;
          transform: scale(0.95) translateY(10px);
        }
        to {
          opacity: 1;
          transform: scale(1) translateY(0);
        }
      }

      .inspection-header-image {
        width: 100%;
        max-height: 180px;
        object-fit: cover;
        border-radius: 10px;
        margin-bottom: 20px;
        border: 1px solid rgba(180, 160, 140, 0.2);
      }

      .inspection-title {
        font-size: 22px;
        font-weight: 700;
        color: #f0e6d8;
        margin-bottom: 6px;
        letter-spacing: 0.3px;
      }

      .inspection-subtitle {
        font-size: 14px;
        color: rgba(240, 230, 216, 0.5);
        margin-bottom: 20px;
        font-style: italic;
      }

      .inspection-content {
        flex: 1;
        overflow-y: auto;
        font-size: 16px;
        line-height: 1.7;
        color: #e0d6c8;
        padding-right: 8px;
      }

      .inspection-content::-webkit-scrollbar {
        width: 6px;
      }

      .inspection-content::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 3px;
      }

      .inspection-content::-webkit-scrollbar-thumb {
        background: rgba(180, 160, 140, 0.3);
        border-radius: 3px;
      }

      .inspection-content::-webkit-scrollbar-thumb:hover {
        background: rgba(180, 160, 140, 0.5);
      }

      .inspection-section {
        margin-bottom: 24px;
      }

      .inspection-section:last-child {
        margin-bottom: 0;
      }

      .inspection-section-headline {
        font-size: 17px;
        font-weight: 600;
        color: #a8d4f0;
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(168, 212, 240, 0.2);
      }

      .inspection-section-content {
        color: #e0d6c8;
      }

      .inspection-section-image {
        max-width: 100%;
        border-radius: 8px;
        margin-top: 12px;
        border: 1px solid rgba(180, 160, 140, 0.2);
      }

      .inspection-close-hint {
        margin-top: 20px;
        padding-top: 16px;
        border-top: 1px solid rgba(180, 160, 140, 0.15);
        font-size: 13px;
        color: rgba(240, 230, 216, 0.4);
        text-align: center;
      }

      .inspection-key {
        display: inline-block;
        padding: 2px 8px;
        background: rgba(136, 180, 220, 0.2);
        border: 1px solid rgba(136, 180, 220, 0.3);
        border-radius: 4px;
        font-weight: 600;
        color: #a8d4f0;
        font-size: 12px;
      }
    `;
    document.head.appendChild(style);
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isVisible()) return;

    if (e.code === 'Escape' || e.code === 'KeyE') {
      e.preventDefault();
      this.hide();
    }
  }

  /**
   * Show inspection content
   */
  show(data: InspectionData, onClose?: () => void): void {
    this.onClose = onClose ?? null;

    // Header image
    if (data.headerImage) {
      this.headerImageEl.src = data.headerImage;
      this.headerImageEl.style.display = 'block';
    } else {
      this.headerImageEl.style.display = 'none';
    }

    // Title
    this.titleEl.textContent = data.title;

    // Subtitle
    if (data.subtitle) {
      this.subtitleEl.textContent = data.subtitle;
      this.subtitleEl.style.display = 'block';
    } else {
      this.subtitleEl.style.display = 'none';
    }

    // Content
    this.contentEl.innerHTML = '';

    if (data.sections && data.sections.length > 0) {
      // Multi-section format (newspapers, magazines)
      for (const section of data.sections) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'inspection-section';

        if (section.headline) {
          const headlineEl = document.createElement('div');
          headlineEl.className = 'inspection-section-headline';
          headlineEl.textContent = section.headline;
          sectionEl.appendChild(headlineEl);
        }

        const contentEl = document.createElement('div');
        contentEl.className = 'inspection-section-content';
        contentEl.textContent = section.content;
        sectionEl.appendChild(contentEl);

        if (section.image) {
          const imageEl = document.createElement('img');
          imageEl.className = 'inspection-section-image';
          imageEl.src = section.image;
          sectionEl.appendChild(imageEl);
        }

        this.contentEl.appendChild(sectionEl);
      }
    } else if (data.content) {
      // Simple single-content format
      const contentEl = document.createElement('div');
      contentEl.className = 'inspection-section-content';
      contentEl.textContent = data.content;
      this.contentEl.appendChild(contentEl);
    }

    // Reset animation
    this.panel.style.animation = 'none';
    void this.panel.offsetHeight;
    this.panel.style.animation = 'inspectionSlideIn 0.25s ease-out forwards';

    // Show overlay
    this.overlay.classList.add('visible');

    // Add keydown listener
    window.addEventListener('keydown', this.boundHandleKeyDown);
  }

  /**
   * Hide inspection UI
   */
  hide(): void {
    this.overlay.classList.remove('visible');
    window.removeEventListener('keydown', this.boundHandleKeyDown);

    if (this.onClose) {
      this.onClose();
      this.onClose = null;
    }
  }

  /**
   * Check if inspection UI is visible
   */
  isVisible(): boolean {
    return this.overlay.classList.contains('visible');
  }

  /**
   * Set callback for when inspection closes
   */
  setOnClose(handler: () => void): void {
    this.onClose = handler;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.hide();
    window.removeEventListener('keydown', this.boundHandleKeyDown);
    this.overlay.remove();
  }
}
