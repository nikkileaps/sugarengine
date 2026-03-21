import { describe, expect, it } from 'vitest';
import { resolvePrimaryReferent } from './subject-relevance.js';

describe('subject relevance', () => {
  it('prefers the npc self referent over an object noun in self preference queries', async () => {
    const primary = await resolvePrimaryReferent({
      interpretation: {
        schemaVersion: 1,
        lane: 'knowledge',
        target: 'self',
        facet: 'preference',
        timeframe: 'habitual',
        focusText: 'Do you like cheese?',
        normalizedText: 'do you like cheese',
        referents: [
          {
            kind: 'topic',
            text: 'cheese',
            confidence: 1,
          },
        ],
        discourse: {
          repair: false,
          filler: false,
          contrast: false,
          emphasis: false,
        },
        candidateScores: [],
        confidence: 0.92,
        margin: 0.31,
        ambiguous: false,
      },
      playerMessage: 'Do you like cheese?',
      routeMatches: [],
      recentReferents: [],
      selfEntityId: 'npc.rick-roll',
      embedTexts: null,
    });

    expect(primary?.id).toBe('npc.rick-roll');
    expect(primary?.kind).toBe('npc');
  });
});
