/**
 * AudioManager - Manages game audio using Howler.js
 *
 * Provides music, SFX, and ambient sound playback with volume controls
 * and state-based transitions (menu ↔ game).
 */

import { Howl, Howler } from 'howler';
import { AudioConfig, AudioState, SoundCategory, SoundOptions } from './types';

interface LoadedSound {
  howl: Howl;
  category: SoundCategory;
}

const DEFAULT_CONFIG: Required<AudioConfig> = {
  masterVolume: 1,
  musicVolume: 0.7,
  sfxVolume: 1,
  ambientVolume: 0.5,
  fadeDuration: 1000,
};

export class AudioManager {
  private config: Required<AudioConfig>;
  private sounds: Map<string, LoadedSound> = new Map();
  private currentMusic: string | null = null;
  private state: AudioState = 'menu';

  constructor(config?: AudioConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.applyMasterVolume();
  }

  /**
   * Load a sound file
   */
  load(id: string, url: string, category: SoundCategory, options?: SoundOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const howl = new Howl({
        src: [url],
        loop: options?.loop ?? false,
        sprite: options?.sprite,
        volume: this.getCategoryVolume(category),
        onload: () => {
          resolve();
        },
        onloaderror: (_id, error) => {
          console.error(`[Audio] Failed to load ${id}:`, error);
          reject(error);
        },
      });

      this.sounds.set(id, { howl, category });
    });
  }

  /**
   * Play a sound
   * @returns Sound instance ID (for spatial audio, stopping specific instance, etc.)
   */
  play(id: string, spriteId?: string): number {
    const sound = this.sounds.get(id);
    if (!sound) {
      console.warn(`[Audio] Sound not loaded: ${id}`);
      return -1;
    }

    // If this is music, track it and stop any current music
    if (sound.category === 'music') {
      if (this.currentMusic && this.currentMusic !== id) {
        this.stop(this.currentMusic);
      }
      this.currentMusic = id;
    }

    return sound.howl.play(spriteId);
  }

  /**
   * Stop a sound
   */
  stop(id: string, fadeOut = false): void {
    const sound = this.sounds.get(id);
    if (!sound) return;

    if (fadeOut) {
      sound.howl.fade(sound.howl.volume(), 0, this.config.fadeDuration);
      sound.howl.once('fade', () => {
        sound.howl.stop();
      });
    } else {
      sound.howl.stop();
    }

    if (sound.category === 'music' && this.currentMusic === id) {
      this.currentMusic = null;
    }
  }

  /**
   * Pause a sound
   */
  pause(id: string): void {
    const sound = this.sounds.get(id);
    if (sound) {
      sound.howl.pause();
    }
  }

  /**
   * Resume a paused sound
   */
  resume(id: string): void {
    const sound = this.sounds.get(id);
    if (sound) {
      sound.howl.play();
    }
  }

  /**
   * Fade in a sound
   */
  fadeIn(id: string, duration?: number): void {
    const sound = this.sounds.get(id);
    if (!sound) return;

    const targetVolume = this.getCategoryVolume(sound.category);
    sound.howl.volume(0);
    sound.howl.play();
    sound.howl.fade(0, targetVolume, duration ?? this.config.fadeDuration);
  }

  /**
   * Fade out a sound
   */
  fadeOut(id: string, duration?: number): void {
    const sound = this.sounds.get(id);
    if (!sound) return;

    sound.howl.fade(sound.howl.volume(), 0, duration ?? this.config.fadeDuration);
    sound.howl.once('fade', () => {
      sound.howl.stop();
    });
  }

  /**
   * Check if a sound is playing
   */
  isPlaying(id: string): boolean {
    const sound = this.sounds.get(id);
    return sound ? sound.howl.playing() : false;
  }

  // ========================================
  // Volume Controls
  // ========================================

  setMasterVolume(v: number): void {
    this.config.masterVolume = Math.max(0, Math.min(1, v));
    this.applyMasterVolume();
  }

  setMusicVolume(v: number): void {
    this.config.musicVolume = Math.max(0, Math.min(1, v));
    this.applyCategoryVolume('music');
  }

  setSFXVolume(v: number): void {
    this.config.sfxVolume = Math.max(0, Math.min(1, v));
    this.applyCategoryVolume('sfx');
  }

  setAmbientVolume(v: number): void {
    this.config.ambientVolume = Math.max(0, Math.min(1, v));
    this.applyCategoryVolume('ambient');
  }

  getMasterVolume(): number {
    return this.config.masterVolume;
  }

  getMusicVolume(): number {
    return this.config.musicVolume;
  }

  getSFXVolume(): number {
    return this.config.sfxVolume;
  }

  getAmbientVolume(): number {
    return this.config.ambientVolume;
  }

  private applyMasterVolume(): void {
    Howler.volume(this.config.masterVolume);
  }

  private applyCategoryVolume(category: SoundCategory): void {
    const volume = this.getCategoryVolume(category);
    for (const [, sound] of this.sounds) {
      if (sound.category === category) {
        sound.howl.volume(volume);
      }
    }
  }

  private getCategoryVolume(category: SoundCategory): number {
    switch (category) {
      case 'music': return this.config.musicVolume;
      case 'sfx': return this.config.sfxVolume;
      case 'ambient': return this.config.ambientVolume;
    }
  }

  // ========================================
  // State Transitions
  // ========================================

  /**
   * Transition from menu to game (fade out menu music)
   */
  transitionToGame(): void {
    if (this.state === 'game') return;
    this.state = 'game';

    if (this.currentMusic) {
      this.fadeOut(this.currentMusic);
    }
  }

  /**
   * Transition from game to menu (fade in menu music)
   */
  transitionToMenu(menuMusicId = 'menu-music'): void {
    if (this.state === 'menu') return;
    this.state = 'menu';

    // Stop any current music
    if (this.currentMusic) {
      this.stop(this.currentMusic);
    }

    // Fade in menu music if loaded
    if (this.sounds.has(menuMusicId)) {
      this.currentMusic = menuMusicId;
      this.fadeIn(menuMusicId);
    }
  }

  getState(): AudioState {
    return this.state;
  }

  // ========================================
  // Cleanup
  // ========================================

  /**
   * Unload a specific sound
   */
  unload(id: string): void {
    const sound = this.sounds.get(id);
    if (sound) {
      sound.howl.unload();
      this.sounds.delete(id);
    }
  }

  /**
   * Unload all sounds and clean up
   */
  dispose(): void {
    for (const [id] of this.sounds) {
      this.unload(id);
    }
    Howler.unload();
  }
}
