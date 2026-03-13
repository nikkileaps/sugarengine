import { describe, expect, it } from 'vitest';
import { getLexiconPlanningStatus } from '../artifacts';
import { ENGLISH_SHARED_LEXICON } from '../lexicons/en';
import { SPANISH_SHARED_LEXICON } from '../lexicons/es';

describe('shared lexicon seeds', () => {
  it('provides a full V1 tracked pool for English', () => {
    expect(ENGLISH_SHARED_LEXICON.targetLanguage).toBe('en');
    expect(ENGLISH_SHARED_LEXICON.entries.length).toBe(850);
    expect(ENGLISH_SHARED_LEXICON.entries.some((entry) => entry.lexicalEntryId === 'object.suitcase')).toBe(true);

    const planning = getLexiconPlanningStatus(ENGLISH_SHARED_LEXICON);
    expect(planning.totalTracked).toBe(850);
    expect(planning.cumulativeCounts).toEqual({
      B0: 60,
      B1: 150,
      B2: 300,
      B3: 550,
      B4: 850,
    });
  });

  it('provides a full V1 tracked pool for Spanish', () => {
    expect(SPANISH_SHARED_LEXICON.targetLanguage).toBe('es');
    expect(SPANISH_SHARED_LEXICON.entries.length).toBe(850);
    expect(SPANISH_SHARED_LEXICON.entries.some((entry) => entry.lexicalEntryId === 'object.suitcase')).toBe(true);

    const planning = getLexiconPlanningStatus(SPANISH_SHARED_LEXICON);
    expect(planning.totalTracked).toBe(850);
    expect(planning.cumulativeCounts).toEqual({
      B0: 60,
      B1: 150,
      B2: 300,
      B3: 550,
      B4: 850,
    });
  });
});
