/**
 * Episode and Season types for the episodic content system.
 * Episodes are the primary unit of content delivery.
 */

/**
 * A season groups episodes together
 */
export interface Season {
  id: string;           // UUID
  name: string;         // "Season 1: The Awakening"
  order: number;        // 1, 2, 3...
}

/**
 * Completion condition types for episode progression
 */
export type CompletionCondition =
  | { type: 'quest'; questId: string }                      // Single quest completion
  | { type: 'allQuests'; questIds: string[] }               // All listed quests complete
  | { type: 'anyQuest'; questIds: string[] }                // Any listed quest complete
  | { type: 'questCount'; questIds: string[]; count: number }; // N of listed quests

/**
 * An episode contains narrative content (quests, dialogues)
 */
export interface Episode {
  id: string;           // UUID
  seasonId: string;     // UUID reference to parent season
  name: string;         // "Episode 1: New Beginnings"
  order: number;        // 1, 2, 3... within season

  /** Region ID where the player spawns when starting this episode */
  startRegion: string;

  /** What marks this episode as complete */
  completionCondition?: CompletionCondition;

  /**
   * Rare: content not reachable via quest/region chains.
   * Use sparingly for: narrators, tutorial helpers, global UI elements.
   */
  manualIncludes?: {
    npcs?: string[];    // UI-only NPCs, narrators
    items?: string[];   // Global system items
    regions?: string[]; // Always-loaded areas
  };
}

/**
 * Computed at publish time - describes what an episode needs
 */
export interface EpisodeManifest {
  seasonId: string;
  episodeId: string;
  version: number;

  /** Dependencies - derived from content analysis */
  requires: {
    npcs: string[];
    items: string[];
    regions: string[];
    quests: string[];
    dialogues: string[];
    inspections: string[];
  };

  completionCondition?: CompletionCondition;
}

/**
 * Master manifest - what's available in the game
 */
export interface GameManifest {
  gameId: string;
  version: number;

  seasons: Season[];
  episodes: Episode[];

  /** Server-controlled release state */
  released: {
    latestSeasonId: string;
    latestEpisodeId: string;
  };

  /** Where to fetch episode content */
  episodeUrls: Record<string, string>;
}

/**
 * Episode content loaded at runtime
 */
export interface EpisodeContent {
  manifest: EpisodeManifest;
  content: {
    quests: unknown[];
    dialogues: unknown[];
  };
}

/**
 * Episode progression saved in player save data
 */
export interface EpisodeProgressionData {
  currentEpisodeId: string;
  completedEpisodeIds: string[];
}
