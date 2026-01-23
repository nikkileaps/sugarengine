/**
 * Scene identifiers for the game
 */
export type SceneId = 'title' | 'gameplay' | 'save-load' | 'pause';

/**
 * Save/Load screen mode
 */
export type SaveLoadMode = 'save' | 'load';

/**
 * Menu item for keyboard navigation
 */
export interface MenuItem {
  id: string;
  label: string;
  action: () => void;
  disabled?: boolean;
}

/**
 * Options passed when showing a screen
 */
export interface ScreenShowOptions {
  mode?: SaveLoadMode;
  returnTo?: SceneId;
}

/**
 * Save slot metadata for display
 */
export interface SaveSlotDisplay {
  slotId: string;
  isEmpty: boolean;
  name: string;
  playTime?: string;
  regionName?: string;
  savedAt?: string;
}
