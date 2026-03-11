import { describe, expect, it } from 'vitest';
import { generateDraftScaffold } from '../draft-scaffold';
import { artifactPaths, deserializeLexiconPack } from '../artifacts';

describe('generateDraftScaffold', () => {
  it('seeds shared lexicon files for supported target languages', () => {
    const files = generateDraftScaffold({
      quests: [
        {
          id: 'quest-1',
          name: 'Station Introductions',
          stages: [],
        },
      ],
      dialogues: [],
      npcs: [],
      regions: [],
      items: [],
    }, {
      targetLanguages: ['en', 'es', 'it'],
    });

    const enLexicon = files.get(artifactPaths.lexicon('en'));
    const esLexicon = files.get(artifactPaths.lexicon('es'));
    const itLexicon = files.get(artifactPaths.lexicon('it'));

    expect(enLexicon).toBeDefined();
    expect(esLexicon).toBeDefined();
    expect(itLexicon).toBeDefined();

    const en = deserializeLexiconPack(enLexicon!);
    const es = deserializeLexiconPack(esLexicon!);
    const it = deserializeLexiconPack(itLexicon!);

    expect(en.errors).toEqual([]);
    expect(es.errors).toEqual([]);
    expect(it.errors).toEqual([]);

    expect(en.data?.targetLanguage).toBe('en');
    expect(es.data?.targetLanguage).toBe('es');
    expect(it.data?.targetLanguage).toBe('it');

    expect(en.data?.entries.length).toBeGreaterThan(0);
    expect(es.data?.entries.length).toBeGreaterThan(0);
    expect(it.data?.entries.length).toBeGreaterThan(0);
  });
});
