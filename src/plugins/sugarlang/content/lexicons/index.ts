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
