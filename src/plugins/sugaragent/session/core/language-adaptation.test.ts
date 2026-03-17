import { describe, expect, it } from 'vitest';
import {
  buildSugarlangLanguageAdaptationContext,
  estimateTextLanguage,
  isValidLanguageAdaptationContext,
  normalizeLanguageCode,
} from './language-adaptation';

describe('language adaptation context', () => {
  it('carries Sugarlang learner policy fields into the delivery language context', () => {
    const context = buildSugarlangLanguageAdaptationContext({
      learnerBand: 'B0',
      targetLanguage: 'es',
      supportLanguage: 'en',
      supportLanguagePolicy: 'full_support',
      correctionPosture: 'immediate',
      deliveryContract: {
        detailLevel: 'minimal',
        maxKnowledgeClaims: 1,
        maxKnowledgeParts: 1,
        maxSentences: 1,
        maxSentenceLength: 8,
        maxClauseDepth: 1,
        allowExactNumbers: false,
        allowEnrichmentFacts: false,
        preferConcreteFacts: true,
        preferHighFrequencyLexicon: true,
      },
      availableTrackedLexicalEntryIds: ['lex.1', 'lex.2'],
      teachingSubset: {
        focusLexicalEntryIds: ['lex.1'],
        reinforcementLexicalEntryIds: [],
        ambientLexicalEntryIds: [],
        protectedLexicalEntryIds: [],
      },
      groundingScope: [
        {
          lexicalEntryId: 'lex.1',
          targetForm: 'maleta',
          worldObjectId: 'suitcase-blue',
        },
      ],
    });

    expect(context).toMatchObject({
      targetLanguage: 'es',
      supportLanguage: 'en',
      supportLanguagePolicy: 'full_support',
      correctionPosture: 'immediate',
      learnerLevel: 'B0',
      cefrBand: 'B0',
      codeSwitchPolicy: 'gloss_only',
      glossBudget: 3,
      focusVocabulary: ['maleta'],
      maxSentenceLength: 8,
      maxClauseDepth: 1,
    });
    expect(isValidLanguageAdaptationContext(context)).toBe(true);
  });

  it('normalizes language codes to their base language', () => {
    expect(normalizeLanguageCode('es-MX')).toBe('es');
    expect(normalizeLanguageCode(' PT_br ')).toBe('pt');
    expect(normalizeLanguageCode('')).toBeNull();
  });
});

describe('language estimation', () => {
  it('recognizes target-language Spanish grounded replies as non-mismatched', () => {
    const estimate = estimateTextLanguage(
      'Estamos en la estacion ahora. El resort esta justo fuera del pueblo.',
      'es',
    );

    expect(estimate.estimatedLanguage).toBe('es');
    expect(estimate.mismatchSuspected).toBe(false);
  });

  it('flags English grounded replies as mismatched when Spanish is required', () => {
    const estimate = estimateTextLanguage(
      'We are at Station right now. The resort is just outside the town.',
      'es',
    );

    expect(estimate.estimatedLanguage).toBe('en');
    expect(estimate.mismatchSuspected).toBe(true);
  });

  it('returns unknown for punctuation-only text', () => {
    const estimate = estimateTextLanguage('...', 'es');

    expect(estimate.estimatedLanguage).toBe('unknown');
    expect(estimate.mismatchSuspected).toBe(false);
  });
});
