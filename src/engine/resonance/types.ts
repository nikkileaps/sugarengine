/**
 * Resonance System Types
 */

export type ResonanceDifficulty = 'easy' | 'medium' | 'hard';

/**
 * Configuration for a resonance point type (loaded from project data)
 */
export interface ResonancePointConfig {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  resonanceReward: number;          // 0-100, how much resonance gained on success
  difficulty: ResonanceDifficulty;
  cooldownMinutes?: number;
}

/**
 * A single trajectory point (keyframe)
 */
export interface TrajectoryPoint {
  x: number;
  y: number;
  t: number;  // Time in seconds
}

/**
 * A firefly trajectory for animation
 */
export interface Trajectory {
  points: TrajectoryPoint[];
  color: string;  // CSS color string
}

/**
 * A trajectory option shown to the player
 */
export interface TrajectoryOption {
  previewPath: { x: number; y: number }[];  // Simplified path for display
  label: string;  // "A", "B", "C", "D"
}

/**
 * A complete firefly pattern for the mini-game
 */
export interface FireflyPattern {
  id: string;
  difficulty: ResonanceDifficulty;
  trajectories: Trajectory[];       // 5 fireflies, each with a path
  correctAnswer: number;            // Index 0-3 of correct trajectory option
  options: TrajectoryOption[];      // 4 trajectory options to choose from
}

/**
 * Result of a resonance game attempt
 */
export interface ResonanceGameResult {
  success: boolean;
  resonanceGained: number;
  attemptsUsed: number;
}
