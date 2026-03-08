/**
 * Find the Luggage — Shared Lexicon Packs.
 *
 * Defines the reusable teaching vocabulary for both English and Spanish targets.
 * Only B0/B1 entries for Phase 1.
 */

import type { LexiconPack } from '../../types';

export const SPANISH_LEXICON: LexiconPack = {
  targetLanguage: 'es',
  entries: [
    // B0 active concepts
    {
      conceptId: 'object.suitcase',
      targetForm: 'maleta',
      alternates: ['maletas'],
      gloss: 'suitcase',
      category: 'object',
      introductionBand: 'B0',
      usage: 'active',
      groundable: true,
    },
    {
      conceptId: 'color.red',
      targetForm: 'roja',
      alternates: ['rojo'],
      gloss: 'red',
      category: 'color',
      introductionBand: 'B0',
      usage: 'active',
      groundable: true,
    },
    {
      conceptId: 'affirmation.yes',
      targetForm: 'sí',
      alternates: ['si'],
      gloss: 'yes',
      category: 'function',
      introductionBand: 'B0',
      usage: 'active',
      groundable: false,
    },
    // B1 active concepts
    {
      conceptId: 'color.blue',
      targetForm: 'azul',
      gloss: 'blue',
      category: 'color',
      introductionBand: 'B1',
      usage: 'active',
      groundable: true,
    },
    {
      conceptId: 'location.here',
      targetForm: 'aquí',
      alternates: ['aca', 'acá'],
      gloss: 'here',
      category: 'location',
      introductionBand: 'B1',
      usage: 'active',
      groundable: false,
    },
    {
      conceptId: 'location.there',
      targetForm: 'allí',
      alternates: ['allá', 'alli', 'alla'],
      gloss: 'there',
      category: 'location',
      introductionBand: 'B1',
      usage: 'active',
      groundable: false,
    },
    {
      conceptId: 'verb.is_located',
      targetForm: 'está',
      alternates: ['esta'],
      gloss: 'is / is located',
      category: 'verb',
      introductionBand: 'B1',
      usage: 'active',
      groundable: false,
    },
  ],
};

export const ENGLISH_LEXICON: LexiconPack = {
  targetLanguage: 'en',
  entries: [
    // B0 active concepts
    {
      conceptId: 'object.suitcase',
      targetForm: 'suitcase',
      alternates: ['luggage', 'bag'],
      gloss: 'maleta',
      category: 'object',
      introductionBand: 'B0',
      usage: 'active',
      groundable: true,
    },
    {
      conceptId: 'color.red',
      targetForm: 'red',
      gloss: 'roja',
      category: 'color',
      introductionBand: 'B0',
      usage: 'active',
      groundable: true,
    },
    {
      conceptId: 'affirmation.yes',
      targetForm: 'yes',
      alternates: ['yeah', 'yep'],
      gloss: 'sí',
      category: 'function',
      introductionBand: 'B0',
      usage: 'active',
      groundable: false,
    },
    // B1 active concepts
    {
      conceptId: 'color.blue',
      targetForm: 'blue',
      gloss: 'azul',
      category: 'color',
      introductionBand: 'B1',
      usage: 'active',
      groundable: true,
    },
    {
      conceptId: 'location.here',
      targetForm: 'here',
      gloss: 'aquí',
      category: 'location',
      introductionBand: 'B1',
      usage: 'active',
      groundable: false,
    },
    {
      conceptId: 'location.there',
      targetForm: 'there',
      gloss: 'allí',
      category: 'location',
      introductionBand: 'B1',
      usage: 'active',
      groundable: false,
    },
    {
      conceptId: 'verb.is_located',
      targetForm: 'is',
      gloss: 'está',
      category: 'verb',
      introductionBand: 'B1',
      usage: 'active',
      groundable: false,
    },
  ],
};
