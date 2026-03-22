import { describe, expect, it } from 'vitest';

import {
  normalizeSugarlangPlayerProfile,
  resolveSugarlangLearnerBands,
  resolveSugarlangTargetLanguages,
} from './playerProfile';

describe('playerProfile', () => {
  it('resolves a concrete sugarlang profile from configured target languages', () => {
    expect(normalizeSugarlangPlayerProfile(undefined, {
      enabled: true,
      targetLanguages: ['es', 'it'],
    })).toEqual({
      targetLanguage: 'es',
      supportLanguage: 'en',
      learnerBand: 'B0',
    });
  });

  it('clamps updates to configured target languages and learner bands', () => {
    expect(normalizeSugarlangPlayerProfile({
      targetLanguage: 'fr',
      learnerBand: 'C9',
      supportLanguage: 'de',
    }, {
      enabled: true,
      targetLanguages: ['it', 'es'],
      learnerBands: ['B1', 'B3'],
      defaultTargetLanguage: 'it',
      defaultLearnerBand: 'B3',
    })).toEqual({
      targetLanguage: 'it',
      supportLanguage: 'en',
      learnerBand: 'B3',
    });
  });

  it('returns no profile when sugarlang is disabled or has no target languages', () => {
    expect(normalizeSugarlangPlayerProfile(undefined, {
      enabled: false,
      targetLanguages: ['es'],
    })).toBeUndefined();
    expect(normalizeSugarlangPlayerProfile(undefined, {
      enabled: true,
      targetLanguages: [],
    })).toBeUndefined();
  });

  it('provides default learner bands and filters english from target languages', () => {
    expect(resolveSugarlangLearnerBands()).toEqual(['B0', 'B1', 'B2', 'B3', 'B4']);
    expect(resolveSugarlangTargetLanguages({
      targetLanguages: ['en', 'it', 'es', ''],
    })).toEqual(['it', 'es']);
  });
});
