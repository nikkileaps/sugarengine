/**
 * EpisodeManager - Runtime episode loading and progression management
 *
 * Handles:
 * - Loading game manifest
 * - Episode accessibility checks
 * - Loading episode content
 * - Episode progression tracking
 */

import type {
  Season,
  Episode,
  EpisodeManifest,
  GameManifest,
  EpisodeContent,
  CompletionCondition,
} from './types';
import type { GameSaveData } from '../save/types';

export interface EpisodeManagerConfig {
  /** Base URL for fetching content (default: '') */
  baseUrl?: string;
  /** Development mode - use in-memory project data */
  developmentMode?: boolean;
  /** Project data for development mode */
  projectData?: unknown;
}

export class EpisodeManager {
  private manifest: GameManifest | null = null;
  private loadedEpisodes: Map<string, EpisodeContent> = new Map();
  private config: EpisodeManagerConfig;
  private projectData: unknown = null;

  constructor(config: EpisodeManagerConfig = {}) {
    this.config = {
      baseUrl: '',
      developmentMode: false,
      ...config,
    };

    if (config.projectData) {
      this.projectData = config.projectData;
    }
  }

  /**
   * Initialize the episode manager by loading the game manifest
   */
  async initialize(): Promise<void> {
    if (this.config.developmentMode && this.projectData) {
      // Development mode: build manifest from project data
      this.manifest = this.buildManifestFromProject(this.projectData);
      return;
    }

    // Production mode: fetch manifest from server
    const url = `${this.config.baseUrl}/manifest.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load game manifest: ${url}`);
    }
    this.manifest = await response.json();
  }

  /**
   * Get all seasons
   */
  getSeasons(): Season[] {
    return this.manifest?.seasons || [];
  }

  /**
   * Get all episodes
   */
  getEpisodes(): Episode[] {
    return this.manifest?.episodes || [];
  }

  /**
   * Get episodes for a specific season
   */
  getSeasonEpisodes(seasonId: string): Episode[] {
    return (this.manifest?.episodes || [])
      .filter(e => e.seasonId === seasonId)
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Get a specific episode by ID
   */
  getEpisode(episodeId: string): Episode | undefined {
    return this.manifest?.episodes.find(e => e.id === episodeId);
  }

  /**
   * Get the previous episode (for checking progression)
   */
  getPreviousEpisode(episodeId: string): Episode | undefined {
    const episode = this.getEpisode(episodeId);
    if (!episode) return undefined;

    const seasonEpisodes = this.getSeasonEpisodes(episode.seasonId);
    const index = seasonEpisodes.findIndex(e => e.id === episodeId);

    if (index > 0) {
      return seasonEpisodes[index - 1];
    }

    // Check previous season
    const seasons = this.getSeasons().sort((a, b) => a.order - b.order);
    const seasonIndex = seasons.findIndex(s => s.id === episode.seasonId);

    if (seasonIndex > 0) {
      const prevSeason = seasons[seasonIndex - 1];
      if (!prevSeason) return undefined;
      const prevSeasonEpisodes = this.getSeasonEpisodes(prevSeason.id);
      return prevSeasonEpisodes[prevSeasonEpisodes.length - 1];
    }

    return undefined;
  }

  /**
   * Check if an episode has been released
   */
  isEpisodeReleased(episodeId: string): boolean {
    if (!this.manifest) return false;

    const episode = this.getEpisode(episodeId);
    if (!episode) return false;

    const latestEpisode = this.manifest.released.latestEpisodeId
      ? this.getEpisode(this.manifest.released.latestEpisodeId)
      : undefined;
    if (!latestEpisode) return true; // If no release info, assume all released

    // Compare by season order then episode order
    const episodeSeason = this.getSeasons().find(s => s.id === episode.seasonId);
    const latestSeason = this.getSeasons().find(s => s.id === latestEpisode.seasonId);

    if (!episodeSeason || !latestSeason) return true;

    if (episodeSeason.order < latestSeason.order) return true;
    if (episodeSeason.order > latestSeason.order) return false;

    return episode.order <= latestEpisode.order;
  }

  /**
   * Check if an episode is accessible based on player progression
   */
  isEpisodeAccessible(episodeId: string, saveData?: GameSaveData): boolean {
    if (!this.isEpisodeReleased(episodeId)) return false;

    const episode = this.getEpisode(episodeId);
    if (!episode) return false;

    // First episode of first season is always accessible
    if (episode.order === 1) {
      const season = this.getSeasons().find(s => s.id === episode.seasonId);
      if (season?.order === 1) return true;
    }

    // Check if previous episode is completed
    const prevEpisode = this.getPreviousEpisode(episodeId);
    if (!prevEpisode) return true; // No previous episode = accessible

    // Check save data for completion
    if (saveData?.episodes?.completedEpisodeIds.includes(prevEpisode.id)) {
      return true;
    }

    // Check if completion condition is met
    if (prevEpisode.completionCondition) {
      return this.isConditionMet(prevEpisode.completionCondition, saveData);
    }

    return false;
  }

  /**
   * Check if a completion condition is met
   */
  isConditionMet(condition: CompletionCondition, saveData?: GameSaveData): boolean {
    if (!saveData) return false;

    const completedQuests = new Set(saveData.quests.completed);

    switch (condition.type) {
      case 'quest':
        return completedQuests.has(condition.questId);

      case 'allQuests':
        return condition.questIds.every(id => completedQuests.has(id));

      case 'anyQuest':
        return condition.questIds.some(id => completedQuests.has(id));

      case 'questCount':
        const count = condition.questIds.filter(id => completedQuests.has(id)).length;
        return count >= condition.count;

      default:
        return false;
    }
  }

  /**
   * Load episode content
   */
  async loadEpisodeContent(episodeId: string): Promise<EpisodeContent> {
    // Return cached if available
    if (this.loadedEpisodes.has(episodeId)) {
      return this.loadedEpisodes.get(episodeId)!;
    }

    if (this.config.developmentMode && this.projectData) {
      // Development mode: extract content from project data
      const content = this.extractEpisodeContent(episodeId, this.projectData);
      this.loadedEpisodes.set(episodeId, content);
      return content;
    }

    // Production mode: fetch from server
    if (!this.manifest) {
      throw new Error('EpisodeManager not initialized');
    }

    const url = this.manifest.episodeUrls[episodeId];
    if (!url) {
      throw new Error(`No URL for episode: ${episodeId}`);
    }

    const manifestUrl = `${this.config.baseUrl}/${url}`;
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(`Failed to load episode manifest: ${manifestUrl}`);
    }

    const episodeManifest: EpisodeManifest = await manifestResponse.json();

    // Load quests and dialogues
    const basePath = url.replace('/manifest.json', '');
    const quests = await this.loadEpisodeQuests(basePath, episodeManifest);
    const dialogues = await this.loadEpisodeDialogues(basePath, episodeManifest);

    const content: EpisodeContent = {
      manifest: episodeManifest,
      content: {
        quests,
        dialogues,
      },
    };

    this.loadedEpisodes.set(episodeId, content);
    return content;
  }

  /**
   * Get the first episode (for new games)
   */
  getFirstEpisode(): Episode | undefined {
    const seasons = this.getSeasons().sort((a, b) => a.order - b.order);
    if (seasons.length === 0) return undefined;

    const firstSeason = seasons[0];
    if (!firstSeason) return undefined;

    const episodes = this.getSeasonEpisodes(firstSeason.id);
    return episodes[0];
  }

  /**
   * Get the current episode for a player based on save data
   */
  getCurrentEpisode(saveData?: GameSaveData): Episode | undefined {
    if (saveData?.episodes?.currentEpisodeId) {
      return this.getEpisode(saveData.episodes.currentEpisodeId);
    }
    return this.getFirstEpisode();
  }

  /**
   * Mark an episode as completed
   */
  markEpisodeCompleted(episodeId: string, saveData: GameSaveData): void {
    if (!saveData.episodes) {
      saveData.episodes = {
        currentEpisodeId: episodeId,
        completedEpisodeIds: [],
      };
    }

    if (!saveData.episodes.completedEpisodeIds.includes(episodeId)) {
      saveData.episodes.completedEpisodeIds.push(episodeId);
    }
  }

  /**
   * Set the current episode
   */
  setCurrentEpisode(episodeId: string, saveData: GameSaveData): void {
    if (!saveData.episodes) {
      saveData.episodes = {
        currentEpisodeId: episodeId,
        completedEpisodeIds: [],
      };
    }
    saveData.episodes.currentEpisodeId = episodeId;
  }

  // Private helpers

  private buildManifestFromProject(projectData: unknown): GameManifest {
    const project = projectData as {
      meta?: { gameId: string; name: string };
      seasons?: Season[];
      episodes?: Episode[];
    };

    return {
      gameId: project.meta?.gameId || 'dev-game',
      version: 1,
      seasons: project.seasons || [],
      episodes: project.episodes || [],
      released: {
        latestSeasonId: project.seasons?.[project.seasons.length - 1]?.id || '',
        latestEpisodeId: project.episodes?.[project.episodes.length - 1]?.id || '',
      },
      episodeUrls: {},
    };
  }

  private extractEpisodeContent(episodeId: string, projectData: unknown): EpisodeContent {
    const project = projectData as {
      episodes?: Episode[];
      quests?: { id: string; episodeId?: string }[];
      dialogues?: { id: string; episodeId?: string }[];
    };

    const episode = project.episodes?.find(e => e.id === episodeId);
    if (!episode) {
      throw new Error(`Episode not found: ${episodeId}`);
    }

    const quests = (project.quests || []).filter(q => q.episodeId === episodeId);
    const dialogues = (project.dialogues || []).filter(d => d.episodeId === episodeId);

    return {
      manifest: {
        seasonId: episode.seasonId,
        episodeId: episode.id,
        version: 1,
        requires: {
          npcs: [],
          items: [],
          regions: [],
          quests: quests.map(q => q.id),
          dialogues: dialogues.map(d => d.id),
          inspections: [],
        },
        completionCondition: episode.completionCondition,
      },
      content: {
        quests,
        dialogues,
      },
    };
  }

  private async loadEpisodeQuests(
    basePath: string,
    manifest: EpisodeManifest
  ): Promise<unknown[]> {
    const quests: unknown[] = [];

    for (const questId of manifest.requires.quests) {
      const url = `${this.config.baseUrl}/${basePath}/quests/${questId}.json`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          quests.push(await response.json());
        }
      } catch (e) {
        console.warn(`Failed to load quest: ${questId}`, e);
      }
    }

    return quests;
  }

  private async loadEpisodeDialogues(
    basePath: string,
    manifest: EpisodeManifest
  ): Promise<unknown[]> {
    const dialogues: unknown[] = [];

    for (const dialogueId of manifest.requires.dialogues) {
      const url = `${this.config.baseUrl}/${basePath}/dialogues/${dialogueId}.json`;
      try {
        const response = await fetch(url);
        if (response.ok) {
          dialogues.push(await response.json());
        }
      } catch (e) {
        console.warn(`Failed to load dialogue: ${dialogueId}`, e);
      }
    }

    return dialogues;
  }
}
