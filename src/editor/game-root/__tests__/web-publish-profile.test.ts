import { describe, expect, it } from 'vitest';

import {
  applyWebPublishProfileOverrides,
  parseWebPublishProfile,
  resolveWebPublishProfilePath,
} from '../web-publish-profile';

describe('web-publish-profile', () => {
  it('resolves production and staging profile paths from game-root paths', () => {
    const paths = {
      webProfileProductionPath: '/games/wordlark/release/targets/web/profile.production.json',
      webProfileStagingPath: '/games/wordlark/release/targets/web/profile.staging.json',
    };

    expect(resolveWebPublishProfilePath(paths, 'production')).toBe(paths.webProfileProductionPath);
    expect(resolveWebPublishProfilePath(paths, 'staging')).toBe(paths.webProfileStagingPath);
  });

  it('parses a web publish profile and defaults credentials to include', () => {
    const profile = parseWebPublishProfile({
      target: 'web',
      environment: 'production',
      frontend: {
        gameApiBaseUrl: 'https://api.wordlark.example.com/',
        backendRequired: true,
      },
    }, '/games/wordlark/release/targets/web/profile.production.json', 'production');

    expect(profile.target).toBe('web');
    expect(profile.environment).toBe('production');
    expect(profile.frontend.gameApiBaseUrl).toBe('https://api.wordlark.example.com');
    expect(profile.frontend.backendRequired).toBe(true);
    expect(profile.frontend.credentials).toBe('include');
    expect(profile.sugaragent.generation.provider).toBe('selfHosted');
  });

  it('preserves boolean backendRequired values from profile JSON', () => {
    const profile = parseWebPublishProfile({
      target: 'web',
      environment: 'staging',
      frontend: {
        gameApiBaseUrl: 'https://staging-api.wordlark.example.com',
        backendRequired: false,
      },
    }, '/games/wordlark/release/targets/web/profile.staging.json', 'staging');

    expect(profile.frontend.backendRequired).toBe(false);
  });

  it('applies manual overrides on top of the loaded profile', () => {
    const profile = parseWebPublishProfile({
      target: 'web',
      environment: 'staging',
      frontend: {
        gameApiBaseUrl: 'https://staging-api.wordlark.example.com',
        backendRequired: true,
        credentials: 'include',
      },
    }, '/games/wordlark/release/targets/web/profile.staging.json', 'staging');

    const resolved = applyWebPublishProfileOverrides(profile, {
      gameApiBaseUrl: ' https://override.wordlark.example.com/ ',
      backendRequired: false,
      credentials: 'omit',
    });

    expect(resolved.frontend.gameApiBaseUrl).toBe('https://override.wordlark.example.com');
    expect(resolved.frontend.backendRequired).toBe(false);
    expect(resolved.frontend.credentials).toBe('omit');
  });

  it('rejects profiles without a hosted backend URL', () => {
    expect(() => parseWebPublishProfile({
      target: 'web',
      environment: 'production',
      frontend: {},
    }, '/games/wordlark/release/targets/web/profile.production.json', 'production')).toThrow(
      'missing frontend.gameApiBaseUrl',
    );
  });

  it('parses sugaragent generation overrides from the profile', () => {
    const profile = parseWebPublishProfile({
      target: 'web',
      environment: 'production',
      frontend: {
        gameApiBaseUrl: 'https://api.wordlark.example.com/',
        backendRequired: true,
      },
      sugaragent: {
        generation: {
          provider: 'openai',
          openai: {
            model: 'gpt-5-mini',
          },
        },
      },
    }, '/games/wordlark/release/targets/web/profile.production.json', 'production');

    expect(profile.sugaragent.generation).toEqual({
      provider: 'openai',
      selfHosted: {
        runtimeMode: 'llama',
      },
      openai: {
        model: 'gpt-5-mini',
        baseUrl: 'https://api.openai.com/v1',
      },
    });
  });
});
