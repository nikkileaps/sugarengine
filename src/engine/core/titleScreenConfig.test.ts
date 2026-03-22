import { describe, expect, it } from 'vitest';

import { buildTitleScreenConfig } from './titleScreenConfig';

describe('buildTitleScreenConfig', () => {
  it('fills title from game metadata and wires sugarlang profile defaults', () => {
    const config = buildTitleScreenConfig({
      base: {
        cameraPosition: { x: 0, y: 0, z: 1 },
        cameraLookAt: { x: 0, y: 0, z: 0 },
      },
      overrides: {
        subtitle: 'Learn by talking',
        playerProfile: {
          sugarlang: {
            defaultLearnerBand: 'B3',
          },
        },
      },
      gameTitle: 'Wordlark',
      hasSugarlang: true,
      sugarlangTargetLanguages: ['es', 'it'],
    });

    expect(config.title).toBe('Wordlark');
    expect(config.subtitle).toBe('Learn by talking');
    expect(config.playerProfile?.sugarlang).toEqual({
      enabled: true,
      targetLanguages: ['es', 'it'],
      defaultTargetLanguage: undefined,
      learnerBands: undefined,
      defaultLearnerBand: 'B3',
    });
  });

  it('removes sugarlang title controls when the plugin is not active', () => {
    const config = buildTitleScreenConfig({
      base: {
        cameraPosition: { x: 0, y: 0, z: 1 },
        cameraLookAt: { x: 0, y: 0, z: 0 },
      },
      overrides: {
        playerProfile: {
          sugarlang: {
            enabled: true,
            targetLanguages: ['es'],
          },
        },
      },
      gameTitle: 'Wordlark',
      hasSugarlang: false,
      sugarlangTargetLanguages: ['es'],
    });

    expect(config.playerProfile?.sugarlang).toBeUndefined();
  });
});
