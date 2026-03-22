import { Screen, COMMON_SCREEN_STYLES } from './Screen';
import type { SugarlangPlayerProfile, SugarlangPlayerProfileUpdate } from '../core/playerProfile';

export interface TitleScreenViewModel {
  title?: string;
  subtitle?: string;
  footerHintText?: string;
  versionText?: string;
  menu?: {
    newGameLabel?: string;
    continueLabel?: string;
    quitLabel?: string;
    showQuit?: boolean;
  };
  playerProfile?: {
    sugarlang?: {
      current?: SugarlangPlayerProfile | null;
      targetLanguages?: string[];
      learnerBands?: string[];
    };
  };
}

/**
 * Title/main menu screen
 */
export class TitleScreen extends Screen {
  private onNewGameHandler: (() => void) | null = null;
  private onContinueHandler: (() => void) | null = null;
  private onQuitHandler: (() => void) | null = null;
  private onSugarlangProfileChangeHandler: ((profile: SugarlangPlayerProfileUpdate) => void) | null = null;
  private hasSaves = false;
  private config: TitleScreenViewModel | undefined;
  // Set in buildUI() - use 'declare' to prevent JS from resetting it
  declare private menuContainer: HTMLDivElement;
  declare private logoEl: HTMLHeadingElement;
  declare private subtitleEl: HTMLDivElement;
  declare private footerEl: HTMLDivElement;
  declare private versionEl: HTMLDivElement;
  declare private profileSectionEl: HTMLDivElement;
  declare private targetLanguageSelect: HTMLSelectElement;
  declare private learnerBandSelect: HTMLSelectElement;

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
        margin-top: 18px;
      }

      .title-profile {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 280px;
        padding: 16px 18px;
        margin-top: 8px;
        margin-bottom: 10px;
        border: 1px solid rgba(240, 230, 216, 0.14);
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.24);
      }

      .title-profile.hidden {
        display: none;
      }

      .title-profile-heading {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: rgba(240, 230, 216, 0.62);
      }

      .title-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .title-field label {
        font-size: 12px;
        letter-spacing: 0.4px;
        color: rgba(240, 230, 216, 0.72);
      }

      .title-field select {
        appearance: none;
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid rgba(240, 230, 216, 0.18);
        background: rgba(14, 10, 7, 0.72);
        color: #f0e6d8;
        font-size: 14px;
        outline: none;
      }

      .title-field select:focus {
        border-color: rgba(210, 170, 95, 0.82);
        box-shadow: 0 0 0 2px rgba(210, 170, 95, 0.2);
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
    this.logoEl = document.createElement('h1');
    this.logoEl.className = 'title-logo';
    content.appendChild(this.logoEl);

    // Subtitle
    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'title-subtitle';
    content.appendChild(this.subtitleEl);

    this.profileSectionEl = document.createElement('div');
    this.profileSectionEl.className = 'title-profile hidden';

    const profileHeading = document.createElement('div');
    profileHeading.className = 'title-profile-heading';
    profileHeading.textContent = 'Language Profile';
    this.profileSectionEl.appendChild(profileHeading);

    const targetLanguageField = document.createElement('div');
    targetLanguageField.className = 'title-field';
    const targetLanguageLabel = document.createElement('label');
    targetLanguageLabel.textContent = 'Target Language';
    this.targetLanguageSelect = document.createElement('select');
    this.targetLanguageSelect.addEventListener('change', () => {
      this.onSugarlangProfileChangeHandler?.({
        targetLanguage: this.targetLanguageSelect.value,
      });
    });
    targetLanguageField.appendChild(targetLanguageLabel);
    targetLanguageField.appendChild(this.targetLanguageSelect);
    this.profileSectionEl.appendChild(targetLanguageField);

    const learnerBandField = document.createElement('div');
    learnerBandField.className = 'title-field';
    const learnerBandLabel = document.createElement('label');
    learnerBandLabel.textContent = 'Level';
    this.learnerBandSelect = document.createElement('select');
    this.learnerBandSelect.addEventListener('change', () => {
      this.onSugarlangProfileChangeHandler?.({
        learnerBand: this.learnerBandSelect.value,
      });
    });
    learnerBandField.appendChild(learnerBandLabel);
    learnerBandField.appendChild(this.learnerBandSelect);
    this.profileSectionEl.appendChild(learnerBandField);

    // Menu container
    this.menuContainer = document.createElement('div');
    this.menuContainer.className = 'title-menu';
    content.appendChild(this.menuContainer);

    content.appendChild(this.profileSectionEl);

    this.element.appendChild(content);

    // Footer hint
    this.footerEl = document.createElement('div');
    this.footerEl.className = 'title-footer key-hint';
    this.element.appendChild(this.footerEl);

    // Version
    this.versionEl = document.createElement('div');
    this.versionEl.className = 'title-version';
    this.element.appendChild(this.versionEl);

    this.applyConfig();
  }

  private buildMenu(): void {
    if (!this.menuContainer) return;

    const configuredMenu = this.config?.menu ?? {};
    const menuItems = [
      {
        id: 'new-game',
        label: configuredMenu.newGameLabel ?? 'New Game',
        action: () => this.fadeOutAndExecute(() => this.onNewGameHandler?.())
      },
      {
        id: 'continue',
        label: configuredMenu.continueLabel ?? 'Continue',
        action: () => this.fadeOutAndExecute(() => this.onContinueHandler?.()),
        disabled: !this.hasSaves
      },
      configuredMenu.showQuit === false ? null : {
        id: 'quit',
        label: configuredMenu.quitLabel ?? 'Quit',
        action: () => this.onQuitHandler?.() // Quit doesn't need fade
      },
    ].filter((item): item is NonNullable<typeof item> => item !== null);

    this.menuItems = menuItems;

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

  setOnSugarlangProfileChange(handler: (profile: SugarlangPlayerProfileUpdate) => void): void {
    this.onSugarlangProfileChangeHandler = handler;
  }

  setConfig(config: TitleScreenViewModel): void {
    this.config = config;
    this.applyConfig();
  }

  protected onEscape(): void {
    // No action on escape from title screen
  }

  private applyConfig(): void {
    if (!this.logoEl) return;
    const config = this.config ?? {};

    this.logoEl.textContent = config.title ?? 'Rackwick City';
    this.subtitleEl.textContent = config.subtitle ?? 'A cozy adventure awaits';
    this.subtitleEl.style.display = this.subtitleEl.textContent.trim().length > 0 ? '' : 'none';
    this.footerEl.innerHTML = config.footerHintText
      ?? 'Use <span class="key">\u2191</span><span class="key">\u2193</span> and <span class="key">Enter</span> to select';
    this.versionEl.textContent = config.versionText ?? 'v0.1.0';

    const sugarlangProfile = config.playerProfile?.sugarlang?.current ?? null;
    const hasSugarlangProfile = Boolean(sugarlangProfile);
    this.profileSectionEl.classList.toggle('hidden', !hasSugarlangProfile);
    this.renderSugarlangProfile(sugarlangProfile ?? null);
    this.buildMenu();
  }

  private renderSugarlangProfile(profile: SugarlangPlayerProfile | null): void {
    this.targetLanguageSelect.innerHTML = '';
    this.learnerBandSelect.innerHTML = '';
    if (!profile) return;

    const targetLanguages = this.collectConfiguredTargetLanguages(profile.targetLanguage);
    const learnerBands = this.collectConfiguredLearnerBands(profile.learnerBand);

    for (const language of targetLanguages) {
      const option = document.createElement('option');
      option.value = language;
      option.textContent = language.toUpperCase();
      this.targetLanguageSelect.appendChild(option);
    }
    this.targetLanguageSelect.value = profile.targetLanguage;

    for (const band of learnerBands) {
      const option = document.createElement('option');
      option.value = band;
      option.textContent = band;
      this.learnerBandSelect.appendChild(option);
    }
    this.learnerBandSelect.value = profile.learnerBand;
  }

  private collectConfiguredTargetLanguages(activeLanguage: string): string[] {
    const configured = this.config?.playerProfile?.sugarlang?.targetLanguages ?? [];
    return Array.from(new Set([...configured, activeLanguage]));
  }

  private collectConfiguredLearnerBands(activeBand: string): string[] {
    const configured = this.config?.playerProfile?.sugarlang?.learnerBands ?? [];
    return Array.from(new Set([...configured, activeBand]));
  }
}
