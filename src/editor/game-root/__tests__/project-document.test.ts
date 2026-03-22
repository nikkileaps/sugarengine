import { describe, expect, it } from 'vitest';

import {
  AUTHORED_CONTENT_BASE_PATH,
  buildProjectDocumentFromSnapshot,
  createStarterProjectDocument,
  normalizeAuthoredContentBasePath,
  normalizeLoadedProjectDocument,
  toGameSlug,
} from '../project-document';

describe('project-document', () => {
  it('creates a starter project with authored assets path', () => {
    const project = createStarterProjectDocument({
      gameId: 'wordlark',
      name: 'Wordlark',
      now: '2026-03-07T00:00:00.000Z',
    });

    expect(project.meta.gameId).toBe('wordlark');
    expect(project.meta.contentBasePath).toBe(AUTHORED_CONTENT_BASE_PATH);
    expect(project.defaultEpisode).toBe('episode-1');
    expect(project.seasons).toHaveLength(1);
    expect(project.episodes).toHaveLength(1);
  });

  it('normalizes legacy in-repo asset paths on load', () => {
    const project = normalizeLoadedProjectDocument({
      meta: {
        gameId: 'wordlark',
        name: 'Wordlark',
        contentBasePath: 'games/wordlark/assets/',
      },
      seasons: [],
      episodes: [],
    });

    expect(project.meta.contentBasePath).toBe(AUTHORED_CONTENT_BASE_PATH);
  });

  it('preserves authored timestamps and default episode when saving from snapshot', () => {
    const project = buildProjectDocumentFromSnapshot({
      gameId: 'wordlark',
      name: 'Wordlark',
      version: '1.2.3',
      createdAt: '2026-03-01T00:00:00.000Z',
      defaultEpisode: 'episode-2',
      seasons: [],
      episodes: [{ id: 'episode-1', seasonId: 'season-1', name: 'Episode 1', order: 1 }],
      plugins: [],
      npcs: [],
      dialogues: [],
      quests: [],
      items: [],
      inspections: [],
      regions: [],
      playerCaster: null,
      playerModel: null,
      playerAnimations: {},
      titleScreen: null,
      spells: [],
      resonancePoints: [],
      vfxDefinitions: [],
    }, { savedAt: '2026-03-07T00:00:00.000Z' });

    expect(project.meta.createdAt).toBe('2026-03-01T00:00:00.000Z');
    expect(project.meta.savedAt).toBe('2026-03-07T00:00:00.000Z');
    expect(project.defaultEpisode).toBe('episode-2');
    expect(project.meta.version).toBe('1.2.3');
  });

  it('slugifies game ids consistently', () => {
    expect(toGameSlug(' Rackwick City ')).toBe('rackwick-city');
    expect(normalizeAuthoredContentBasePath('assets')).toBe('assets/');
  });

  it('preserves extended title screen presentation and sugarlang defaults', () => {
    const project = normalizeLoadedProjectDocument({
      meta: {
        gameId: 'wordlark',
        name: 'Wordlark',
      },
      titleScreen: {
        title: 'Wordlark',
        subtitle: 'Talk your way through town',
        menu: {
          newGameLabel: 'Begin',
          showQuit: false,
        },
        playerProfile: {
          sugarlang: {
            enabled: true,
            targetLanguages: ['es', 'it'],
            defaultTargetLanguage: 'it',
            defaultLearnerBand: 'B3',
          },
        },
      },
      seasons: [],
      episodes: [],
    });

    expect(project.titleScreen).toMatchObject({
      title: 'Wordlark',
      subtitle: 'Talk your way through town',
      menu: {
        newGameLabel: 'Begin',
        showQuit: false,
      },
      playerProfile: {
        sugarlang: {
          enabled: true,
          targetLanguages: ['es', 'it'],
          defaultTargetLanguage: 'it',
          defaultLearnerBand: 'B3',
        },
      },
    });
  });
});
