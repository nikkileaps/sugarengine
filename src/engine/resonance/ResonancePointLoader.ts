/**
 * ResonancePointLoader - Loads resonance point definitions from project data
 */

import type { ResonancePointConfig, ResonanceDifficulty } from './types';

export class ResonancePointLoader {
  /**
   * Parse resonance point definitions from project data
   */
  static parseResonancePoints(projectData: unknown): ResonancePointConfig[] {
    if (!projectData || typeof projectData !== 'object') {
      return [];
    }

    const data = projectData as {
      resonancePoints?: Array<{
        id?: string;
        name?: string;
        description?: string;
        icon?: string;
        resonanceReward?: number;
        difficulty?: string;
        cooldownMinutes?: number;
      }>;
    };

    if (!data.resonancePoints || !Array.isArray(data.resonancePoints)) {
      return [];
    }

    return data.resonancePoints
      .filter((rp) => rp.id && rp.name)
      .map((rp) => ({
        id: rp.id!,
        name: rp.name!,
        description: rp.description,
        icon: rp.icon,
        resonanceReward: rp.resonanceReward ?? 10,
        difficulty: (rp.difficulty as ResonanceDifficulty) || 'easy',
        cooldownMinutes: rp.cooldownMinutes,
      }));
  }
}
