import { describe, expect, it } from 'vitest';

import {
  buildRuntimeProjectDocument,
  buildSugarlangRuntimeConfig,
} from '../runtime-document.js';

describe('runtime-document', () => {
  it('builds sugarlang runtime config from artifacts and disabled languages', () => {
    expect(buildSugarlangRuntimeConfig({
      enabled: true,
      artifacts: {
        'languages/es/lexicon.json': '{"entries":[]}',
      },
      disabledLanguages: ['fr', '', 7],
    })).toEqual({
      enabled: true,
      artifacts: {
        'languages/es/lexicon.json': '{"entries":[]}',
      },
      disabledLanguages: ['fr'],
    });
  });

  it('builds a canonical runtime project document for preview or export', () => {
    expect(buildRuntimeProjectDocument({
      project: {
        meta: {
          gameId: 'wordlark',
          name: 'Wordlark',
          contentBasePath: 'assets/',
        },
        episodes: [{ id: 'episode-1' }],
        titleScreen: {
          title: 'Wordlark',
        },
      },
      contentBasePath: 'games/wordlark/assets/',
      sugarlang: {
        enabled: true,
        disabledLanguages: [],
      },
    })).toMatchObject({
      version: 1,
      meta: {
        gameId: 'wordlark',
        name: 'Wordlark',
        contentBasePath: 'games/wordlark/assets/',
      },
      defaultEpisode: 'episode-1',
      titleScreen: {
        title: 'Wordlark',
      },
      sugarlang: {
        enabled: true,
        disabledLanguages: [],
      },
    });
  });
});
