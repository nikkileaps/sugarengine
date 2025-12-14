import { Screen, COMMON_SCREEN_STYLES } from './Screen';

/**
 * Title/main menu screen
 */
export class TitleScreen extends Screen {
  private onNewGameHandler: (() => void) | null = null;
  private onContinueHandler: (() => void) | null = null;
  private onQuitHandler: (() => void) | null = null;
  private hasSaves = false;
  private menuContainer: HTMLDivElement | null = null;

  protected getClassName(): string {
    return 'screen title-screen';
  }

  protected getStyleId(): string {
    return 'title-screen-styles';
  }

  protected getStyles(): string {
    return `
      ${COMMON_SCREEN_STYLES}

      .title-screen {
        background: linear-gradient(90deg, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.6) 40%, rgba(0, 0, 0, 0.2) 70%, transparent 100%);
        z-index: 500;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        transition: opacity 0.5s ease-out;
      }

      .title-screen.fading {
        opacity: 0;
        pointer-events: none;
      }

      .title-content {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        padding: 60px 80px;
      }

      .title-logo {
        font-size: 52px;
        font-weight: 700;
        color: #f0e6d8;
        margin-bottom: 8px;
        text-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
        letter-spacing: 2px;
      }

      .title-subtitle {
        font-size: 16px;
        color: rgba(240, 230, 216, 0.6);
        margin-bottom: 50px;
        font-style: italic;
      }

      .title-menu {
        display: flex;
        flex-direction: column;
        width: 260px;
        gap: 8px;
      }

      .title-menu .menu-item {
        text-align: left;
        padding-left: 20px;
      }

      .title-footer {
        position: absolute;
        bottom: 30px;
        left: 80px;
        font-size: 13px;
        color: rgba(240, 230, 216, 0.4);
      }

      .title-version {
        position: absolute;
        bottom: 30px;
        right: 30px;
        font-size: 12px;
        color: rgba(240, 230, 216, 0.3);
      }
    `;
  }

  protected buildUI(): void {
    // Content container
    const content = document.createElement('div');
    content.className = 'title-content';

    // Logo
    const logo = document.createElement('h1');
    logo.className = 'title-logo';
    logo.textContent = 'Sugarengine';
    content.appendChild(logo);

    // Subtitle
    const subtitle = document.createElement('div');
    subtitle.className = 'title-subtitle';
    subtitle.textContent = 'A cozy adventure awaits';
    content.appendChild(subtitle);

    // Menu container
    this.menuContainer = document.createElement('div');
    this.menuContainer.className = 'title-menu';
    content.appendChild(this.menuContainer);

    this.element.appendChild(content);

    // Footer hint
    const footer = document.createElement('div');
    footer.className = 'title-footer key-hint';
    footer.innerHTML = 'Use <span class="key">\u2191</span><span class="key">\u2193</span> and <span class="key">Enter</span> to select';
    this.element.appendChild(footer);

    // Version
    const version = document.createElement('div');
    version.className = 'title-version';
    version.textContent = 'v0.1.0';
    this.element.appendChild(version);

    // Build initial menu
    this.buildMenu();
  }

  private buildMenu(): void {
    if (!this.menuContainer) return;

    this.menuItems = [
      {
        id: 'new-game',
        label: 'New Game',
        action: () => this.fadeOutAndExecute(() => this.onNewGameHandler?.())
      },
      {
        id: 'continue',
        label: 'Continue',
        action: () => this.fadeOutAndExecute(() => this.onContinueHandler?.()),
        disabled: !this.hasSaves
      },
      {
        id: 'quit',
        label: 'Quit',
        action: () => this.onQuitHandler?.() // Quit doesn't need fade
      }
    ];

    // Clear and rebuild menu
    this.menuContainer.innerHTML = '';
    this.menuItems.forEach((item, index) => {
      const button = this.createMenuButton(item, index);
      this.menuContainer?.appendChild(button);
    });
  }

  /**
   * Fade out the title screen then execute a callback
   */
  private fadeOutAndExecute(callback: () => void): void {
    this.element.classList.add('fading');

    // Wait for transition to complete
    setTimeout(() => {
      this.hide();
      this.element.classList.remove('fading');
      callback();
    }, 500); // Match CSS transition duration
  }

  /**
   * Update whether saves exist (enables/disables Continue)
   */
  setHasSaves(hasSaves: boolean): void {
    this.hasSaves = hasSaves;
    this.buildMenu();
    this.selectedIndex = this.findFirstEnabledIndex();
    this.updateSelection();
  }

  setOnNewGame(handler: () => void): void {
    this.onNewGameHandler = handler;
  }

  setOnContinue(handler: () => void): void {
    this.onContinueHandler = handler;
  }

  setOnQuit(handler: () => void): void {
    this.onQuitHandler = handler;
  }

  protected onEscape(): void {
    // No action on escape from title screen
  }
}
