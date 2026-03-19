import { describe, expect, it } from 'vitest';

import {
  createBrowserTraceId,
  isHostedWebRuntimeConfig,
  resolvePublishedWebRuntimeConfig,
} from './runtimeConfig';

describe('resolvePublishedWebRuntimeConfig', () => {
  it('defaults to local preview when no hosted API URL is configured', () => {
    const config = resolvePublishedWebRuntimeConfig({});
    expect(config).toEqual({
      target: 'local_preview',
      backendRequired: false,
      credentials: 'same-origin',
    });
  });

  it('resolves hosted web runtime config from Vite env', () => {
    const config = resolvePublishedWebRuntimeConfig({
      VITE_GAME_API_BASE_URL: 'https://api.wordlark.example.com/',
      VITE_GAME_API_REQUIRED: 'true',
      VITE_GAME_API_CREDENTIALS: 'include',
    });

    expect(isHostedWebRuntimeConfig(config)).toBe(true);
    if (!isHostedWebRuntimeConfig(config)) {
      throw new Error('expected hosted config');
    }
    expect(config.gameApiBaseUrl).toBe('https://api.wordlark.example.com');
    expect(config.backendRequired).toBe(true);
    expect(config.credentials).toBe('include');
  });
});

describe('createBrowserTraceId', () => {
  it('creates stable browser trace id strings', () => {
    const traceId = createBrowserTraceId('game');
    expect(traceId).toMatch(/^trace_game_\d+_\d+$/);
  });
});
