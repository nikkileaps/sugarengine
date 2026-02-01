/**
 * Audio system types
 */

export type SoundCategory = 'music' | 'sfx' | 'ambient';

export type AudioState = 'menu' | 'game';

export interface AudioConfig {
  masterVolume?: number;    // 0-1, default 1
  musicVolume?: number;     // 0-1, default 0.7
  sfxVolume?: number;       // 0-1, default 1
  ambientVolume?: number;   // 0-1, default 0.5
  fadeDuration?: number;    // ms, default 1000
}

export interface SoundOptions {
  loop?: boolean;
  sprite?: Record<string, [number, number]>;
}
