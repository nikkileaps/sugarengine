import type { SugarEngine } from '../core/Engine';
import type { SaveManager } from '../save';
import { SceneId, SaveLoadMode } from './types';
import { TitleScreen } from './TitleScreen';
import { SaveLoadScreen } from './SaveLoadScreen';
import { PauseScreen } from './PauseScreen';

/**
 * Manages scene transitions and coordinates between menus and gameplay.
 */
export class SceneManager {
  private container: HTMLElement;
  private currentScene: SceneId = 'title';

  // Screen instances (lazily created)
  private titleScreen: TitleScreen | null = null;
  private saveLoadScreen: SaveLoadScreen | null = null;
  private pauseScreen: PauseScreen | null = null;

  // External system references
  private engine: SugarEngine | null = null;
  private saveManager: SaveManager | null = null;

  // Event handlers
  private newGameHandler: (() => void) | null = null;
  private saveHandler: ((slotId: string) => void) | null = null;
  private loadHandler: ((slotId: string) => void) | null = null;
  private quitHandler: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Connect to game systems
   */
  setGameSystems(engine: SugarEngine, saveManager: SaveManager): void {
    this.engine = engine;
    this.saveManager = saveManager;
  }

  /**
   * Show title screen
   */
  async showTitle(): Promise<void> {
    this.hideAllScreens();

    if (!this.titleScreen) {
      this.titleScreen = new TitleScreen(this.container);

      this.titleScreen.setOnNewGame(() => {
        if (this.newGameHandler) {
          this.newGameHandler();
        }
      });

      this.titleScreen.setOnContinue(async () => {
        // Load the most recent save directly
        if (this.saveManager && this.loadHandler) {
          const slotId = await this.saveManager.getMostRecentSlot();
          if (slotId) {
            this.loadHandler(slotId);
            this.showGameplay();
          }
        }
      });

      this.titleScreen.setOnQuit(() => {
        if (this.quitHandler) {
          this.quitHandler();
        }
      });
    }

    // Check if saves exist for Continue button
    if (this.saveManager) {
      const hasSaves = await this.saveManager.hasSaves();
      this.titleScreen.setHasSaves(hasSaves);
    }

    this.titleScreen.show();
    this.currentScene = 'title';
  }

  /**
   * Show gameplay (hide all menus)
   */
  showGameplay(): void {
    this.hideAllScreens();
    this.currentScene = 'gameplay';

    // Resume engine if paused
    if (this.engine) {
      this.engine.resume();
    }
  }

  /**
   * Show save/load screen
   */
  async showSaveLoad(mode: SaveLoadMode, returnTo: SceneId): Promise<void> {
    // Don't hide pause screen if coming from pause
    if (returnTo !== 'pause') {
      this.hideAllScreens();
    }

    if (!this.saveLoadScreen) {
      this.saveLoadScreen = new SaveLoadScreen(this.container);

      this.saveLoadScreen.setOnSelect(async (slotId: string) => {
        const currentMode = this.saveLoadScreen?.getMode();

        if (currentMode === 'save') {
          if (this.saveHandler) {
            this.saveHandler(slotId);
          }
          // Return to pause menu after save
          if (this.pauseScreen?.isVisible()) {
            this.saveLoadScreen?.hide();
          } else {
            this.showGameplay();
          }
        } else {
          // Load mode
          if (this.loadHandler) {
            this.loadHandler(slotId);
          }
          this.showGameplay();
        }
      });
    }

    // Update back handler each time (returnTo may change between calls)
    this.saveLoadScreen.setOnBack(() => {
      this.saveLoadScreen?.hide();
      if (returnTo === 'title') {
        this.showTitle();
      }
      // If returnTo === 'pause', pause screen is already visible
    });

    // Load slot metadata
    if (this.saveManager) {
      const slots = await this.saveManager.listSlots();
      this.saveLoadScreen.setSlots(slots);
    }

    this.saveLoadScreen.show({ mode, returnTo });
    this.currentScene = 'save-load';
  }

  /**
   * Show pause screen
   */
  showPause(): void {
    if (this.currentScene !== 'gameplay') {
      return; // Can only pause from gameplay
    }

    // Pause the engine
    if (this.engine) {
      this.engine.pause();
    }

    if (!this.pauseScreen) {
      this.pauseScreen = new PauseScreen(this.container);

      this.pauseScreen.setOnResume(() => {
        this.showGameplay();
      });

      this.pauseScreen.setOnSave(() => {
        // Save directly to a single slot
        if (this.saveHandler) {
          this.saveHandler('quicksave');
        }
      });

      this.pauseScreen.setOnQuitToTitle(() => {
        this.pauseScreen?.hide();
        this.showTitle();
      });
    }

    this.pauseScreen.show();
    this.currentScene = 'pause';
  }

  /**
   * Toggle pause state
   */
  togglePause(): void {
    if (this.currentScene === 'gameplay') {
      this.showPause();
    } else if (this.currentScene === 'pause') {
      this.showGameplay();
    }
  }

  /**
   * Hide all screens
   */
  private hideAllScreens(): void {
    this.titleScreen?.hide();
    this.saveLoadScreen?.hide();
    this.pauseScreen?.hide();
  }

  /**
   * Get current scene
   */
  getCurrentScene(): SceneId {
    return this.currentScene;
  }

  /**
   * Check if a scene is blocking gameplay input
   */
  isBlocking(): boolean {
    return this.currentScene !== 'gameplay';
  }

  // Event handlers
  onNewGame(handler: () => void): void {
    this.newGameHandler = handler;
  }

  onSave(handler: (slotId: string) => void): void {
    this.saveHandler = handler;
  }

  onLoad(handler: (slotId: string) => void): void {
    this.loadHandler = handler;
  }

  onQuit(handler: () => void): void {
    this.quitHandler = handler;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.titleScreen?.dispose();
    this.saveLoadScreen?.dispose();
    this.pauseScreen?.dispose();
  }
}
