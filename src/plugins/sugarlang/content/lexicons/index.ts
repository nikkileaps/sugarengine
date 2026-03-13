import type { LexiconPack } from '../../types';
import { ENGLISH_SHARED_LEXICON } from './en';
import { SPANISH_SHARED_LEXICON } from './es';
import { ITALIAN_SHARED_LEXICON } from './it';

const SHARED_LEXICONS: Record<string, LexiconPack> = {
  en: ENGLISH_SHARED_LEXICON,
  es: SPANISH_SHARED_LEXICON,
  it: ITALIAN_SHARED_LEXICON,
};

export {
  ENGLISH_SHARED_LEXICON,
  SPANISH_SHARED_LEXICON,
  ITALIAN_SHARED_LEXICON,
};

export function cloneLexiconPack(pack: LexiconPack): LexiconPack {
  return {
    ...pack,
    entries: pack.entries.map((entry) => ({
      ...entry,
      alternates: entry.alternates ? [...entry.alternates] : undefined,
    })),
  };
}

/** Languages that have a shared lexicon available for seeding. */
export function getAvailableSharedLanguages(): string[] {
  return Object.keys(SHARED_LEXICONS);
}

export function getSharedLexicon(language: string): LexiconPack {
  const seeded = SHARED_LEXICONS[language];
  if (!seeded) {
    return {
      targetLanguage: language,
      entries: [],
    };
  }
  return cloneLexiconPack(seeded);
}

/**
 * Merge any explicit (non-generated) entries from the code seed into a persisted lexicon.
 * Generated entries (IDs starting with `common.`) are left alone — only hand-authored
 * entries that are missing from the persisted pack get appended.
 * Returns a new pack if entries were added, or the original pack if nothing changed.
 */
export function mergeExplicitSeedEntries(
  persisted: LexiconPack,
  language: string,
): { pack: LexiconPack; added: number } {
  const seed = SHARED_LEXICONS[language];
  if (!seed) return { pack: persisted, added: 0 };

  const persistedIds = new Set(persisted.entries.map((e) => e.lexicalEntryId));
  const explicitMissing = seed.entries
    .filter((e) => !e.lexicalEntryId.startsWith('common.') && !persistedIds.has(e.lexicalEntryId));

  if (explicitMissing.length === 0) return { pack: persisted, added: 0 };

  // Insert explicit entries at their natural position (before generated entries)
  const firstGeneratedIdx = persisted.entries.findIndex((e) => e.lexicalEntryId.startsWith('common.'));
  const insertAt = firstGeneratedIdx === -1 ? persisted.entries.length : firstGeneratedIdx;
  const nextEntries = [
    ...persisted.entries.slice(0, insertAt),
    ...explicitMissing.map((e) => ({ ...e, alternates: e.alternates ? [...e.alternates] : undefined })),
    ...persisted.entries.slice(insertAt),
  ];

  return {
    pack: { ...persisted, entries: nextEntries },
    added: explicitMissing.length,
  };
}
