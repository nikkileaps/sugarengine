/**
 * AmbientController - Manages ambient/environmental sounds
 *
 * Plays sounds at random intervals to create atmosphere (wind, birds, etc.)
 */

import { AudioManager } from './AudioManager';

export interface AmbientSound {
  id: string;
  minInterval: number;  // minimum seconds between plays
  maxInterval: number;  // maximum seconds between plays
  minDuration?: number; // minimum seconds to play (optional)
  maxDuration?: number; // maximum seconds to play (optional)
}

interface TrackedAmbient {
  config: AmbientSound;
  timeoutId: number | null;
}

export class AmbientController {
  private audio: AudioManager;
  private ambients: Map<string, TrackedAmbient> = new Map();
  private isRunning = false;

  constructor(audio: AudioManager) {
    this.audio = audio;
  }

  /**
   * Add an ambient sound to the controller
   */
  add(config: AmbientSound): void {
    this.ambients.set(config.id, {
      config,
      timeoutId: null,
    });

    // If already running, start this one immediately
    if (this.isRunning) {
      this.scheduleNext(config.id);
    }
  }

  /**
   * Remove an ambient sound
   */
  remove(id: string): void {
    const tracked = this.ambients.get(id);
    if (tracked?.timeoutId) {
      clearTimeout(tracked.timeoutId);
    }
    this.ambients.delete(id);
  }

  /**
   * Start playing all ambient sounds
   */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    for (const id of this.ambients.keys()) {
      this.scheduleNext(id);
    }
  }

  /**
   * Stop all ambient sounds
   */
  stop(): void {
    this.isRunning = false;

    for (const [id, tracked] of this.ambients) {
      if (tracked.timeoutId) {
        clearTimeout(tracked.timeoutId);
        tracked.timeoutId = null;
      }
      this.audio.stop(id);
    }
  }

  /**
   * Schedule the next play of an ambient sound
   */
  private scheduleNext(id: string): void {
    const tracked = this.ambients.get(id);
    if (!tracked || !this.isRunning) return;

    const { minInterval, maxInterval, minDuration, maxDuration } = tracked.config;
    const delay = minInterval + Math.random() * (maxInterval - minInterval);

    tracked.timeoutId = window.setTimeout(() => {
      if (this.isRunning) {
        this.audio.play(id);

        // If duration is specified, stop after random duration
        if (minDuration !== undefined && maxDuration !== undefined) {
          const duration = minDuration + Math.random() * (maxDuration - minDuration);
          window.setTimeout(() => {
            if (this.isRunning) {
              this.audio.stop(id);
            }
          }, duration * 1000);
        }

        this.scheduleNext(id);
      }
    }, delay * 1000);
  }

  /**
   * Clean up
   */
  dispose(): void {
    this.stop();
    this.ambients.clear();
  }
}
