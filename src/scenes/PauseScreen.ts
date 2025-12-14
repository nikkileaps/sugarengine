import { Screen, COMMON_SCREEN_STYLES } from './Screen';

/**
 * Pause menu overlay (shown on top of paused gameplay)
 */
export class PauseScreen extends Screen {
  private onResumeHandler: (() => void) | null = null;
  private onSaveHandler: (() => void) | null = null;
  private onLoadHandler: (() => void) | null = null;
  private onQuitToTitleHandler: (() => void) | null = null;
  private menuContainer: HTMLDivElement | null = null;

  protected getClassName(): string {
    return 'screen pause-screen';
  }

  protected getStyleId(): string {
    return 'pause-screen-styles';
  }

  protected getStyles(): string {
    return `
      ${COMMON_SCREEN_STYLES}

      .pause-screen {
        background: rgba(0, 0, 0, 0.7);
        z-index: 400;
        flex-direction: column;
      }

      .pause-panel {
        background: linear-gradient(180deg, rgba(40, 35, 50, 0.95) 0%, rgba(30, 27, 40, 0.95) 100%);
        border: 3px solid rgba(180, 160, 140, 0.4);
        border-radius: 16px;
        padding: 32px 40px;
        box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
        min-width: 280px;
      }

      .pause-header {
        text-align: center;
        margin-bottom: 28px;
      }

      .pause-header h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
        color: #f0e6d8;
        letter-spacing: 1px;
      }

      .pause-menu {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .pause-footer {
        margin-top: 24px;
        text-align: center;
        padding-top: 16px;
        border-top: 1px solid rgba(180, 160, 140, 0.15);
      }
    `;
  }

  protected buildUI(): void {
    const panel = document.createElement('div');
    panel.className = 'pause-panel';

    // Header
    const header = document.createElement('div');
    header.className = 'pause-header';
    const title = document.createElement('h2');
    title.textContent = 'Paused';
    header.appendChild(title);
    panel.appendChild(header);

    // Menu
    this.menuContainer = document.createElement('div');
    this.menuContainer.className = 'pause-menu';
    panel.appendChild(this.menuContainer);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'pause-footer key-hint';
    footer.innerHTML = 'Press <span class="key">Esc</span> to resume';
    panel.appendChild(footer);

    this.element.appendChild(panel);

    // Build menu
    this.buildMenu();
  }

  private buildMenu(): void {
    if (!this.menuContainer) return;

    this.menuItems = [
      {
        id: 'resume',
        label: 'Resume',
        action: () => this.onResumeHandler?.()
      },
      {
        id: 'save',
        label: 'Save Game',
        action: () => this.onSaveHandler?.()
      },
      {
        id: 'load',
        label: 'Load Game',
        action: () => this.onLoadHandler?.()
      },
      {
        id: 'quit',
        label: 'Quit to Title',
        action: () => this.onQuitToTitleHandler?.()
      }
    ];

    // Clear and rebuild
    this.menuContainer.innerHTML = '';
    this.menuItems.forEach((item, index) => {
      const button = this.createMenuButton(item, index);
      this.menuContainer?.appendChild(button);
    });
  }

  setOnResume(handler: () => void): void {
    this.onResumeHandler = handler;
  }

  setOnSave(handler: () => void): void {
    this.onSaveHandler = handler;
  }

  setOnLoad(handler: () => void): void {
    this.onLoadHandler = handler;
  }

  setOnQuitToTitle(handler: () => void): void {
    this.onQuitToTitleHandler = handler;
  }

  protected onEscape(): void {
    // Escape resumes game
    this.onResumeHandler?.();
  }
}
