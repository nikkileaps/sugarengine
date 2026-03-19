import { describe, expect, it } from 'vitest';
import {
  buildEvidencePreview,
  enhanceInterpretationWithFacetSimilarity,
  extractFacetQueryTokens,
  interpretQuery,
} from './query-interpretation.js';

describe('query interpretation', () => {
  it('classifies short self job questions as self occupation knowledge', () => {
    const interpretation = interpretQuery({
      playerMessage: 'What do you do?',
      npcName: 'Rick Roll',
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
      }),
    });

    expect(interpretation.lane).toBe('knowledge');
    expect(interpretation.target).toBe('self');
    expect(interpretation.facet).toBe('occupation');
    expect(interpretation.ambiguous).toBe(false);
    expect(extractFacetQueryTokens(interpretation)).toEqual(
      expect.arrayContaining(['job']),
    );
  });

  it('treats repair phrasing as occupation intent instead of filler chat', () => {
    const interpretation = interpretQuery({
      playerMessage: 'No, I mean what is your job?',
      npcName: 'Rick Roll',
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
      }),
    });

    expect(interpretation.discourse.repair).toBe(true);
    expect(interpretation.lane).toBe('knowledge');
    expect(interpretation.target).toBe('self');
    expect(interpretation.facet).toBe('occupation');
  });

  it('resolves current-scene location questions against authoritative scene context', () => {
    const interpretation = interpretQuery({
      playerMessage: 'Where are we right now?',
      npcName: 'Rick Roll',
      scene: {
        regionName: 'Station',
        regionPath: 'regions.station',
      },
      evidencePreview: buildEvidencePreview({
        regionName: 'Station',
        regionPath: 'regions.station',
      }),
    });

    expect(interpretation.lane).toBe('knowledge');
    expect(interpretation.target).toBe('world');
    expect(interpretation.facet).toBe('location');
    expect(interpretation.referents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'location',
          text: 'Station',
        }),
      ]),
    );
    expect(extractFacetQueryTokens(interpretation)).toEqual(
      expect.arrayContaining(['station']),
    );
  });

  it('distinguishes current activity from habitual occupation', () => {
    const interpretation = interpretQuery({
      playerMessage: 'What are you doing right now?',
      npcName: 'Rick Roll',
      scene: {
        currentActivity: 'running the cheese stall',
      },
      evidencePreview: buildEvidencePreview({
        currentActivity: 'running the cheese stall',
      }),
    });

    expect(interpretation.lane).toBe('knowledge');
    expect(interpretation.target).toBe('self');
    expect(interpretation.facet).toBe('current_activity');
    expect(extractFacetQueryTokens(interpretation)).toEqual(
      expect.arrayContaining(['doing']),
    );
  });

  it('does not pollute world-lore token extraction with the current npc referent', () => {
    const interpretation = interpretQuery({
      playerMessage: 'Do you know anything about Earendale?',
      npcName: 'Rick Cheese Roll',
      loreEntityHints: [
        {
          entityId: 'locations.earendale',
          entityType: 'world',
          matchedText: 'Earendale',
          filterKind: 'locationIds',
        },
      ],
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
      }),
    });

    expect(interpretation.target).toBe('world');
    expect(extractFacetQueryTokens(interpretation)).toEqual(['earendale', 'history']);
  });

  it('classifies founding questions about a town as world lore instead of clarifying', () => {
    const interpretation = interpretQuery({
      playerMessage: 'Who founded this town?',
      npcName: 'Librarian',
    });

    expect(interpretation.lane).toBe('knowledge');
    expect(interpretation.target).toBe('world');
    expect(interpretation.facet).toBe('general_lore');
    expect(interpretation.ambiguous).toBe(false);
  });

  it('treats epistemic lore prompts as world knowledge instead of npc self-questions', () => {
    const interpretation = interpretQuery({
      playerMessage: 'What do you know about the resort near here?',
      npcName: 'Baker',
    });

    expect(interpretation.lane).toBe('knowledge');
    expect(interpretation.target).toBe('world');
  });

  it('keeps acknowledgement-only turns in the social lane instead of forcing ambiguity', () => {
    const interpretation = interpretQuery({
      playerMessage: 'Yay! I love cheese!',
      npcName: 'Rick Cheese Roll',
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
      }),
    });

    expect(interpretation.lane).toBe('social');
    expect(interpretation.ambiguous).toBe(false);
  });

  it('keeps short Spanish reciprocal turns in the social lane', () => {
    const interpretation = interpretQuery({
      playerMessage: 'Bien! Y tu?',
      npcName: 'Rick Cheese Roll',
      targetLanguage: 'es',
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
      }),
    });

    expect(interpretation.lane).toBe('social');
    expect(interpretation.ambiguous).toBe(false);
  });

  it('recognizes Spanish self-introductions as social turns', () => {
    const interpretation = interpretQuery({
      playerMessage: 'Me llamo Mim. Y tu?',
      npcName: 'Rick Cheese Roll',
      targetLanguage: 'es',
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
      }),
    });

    expect(interpretation.lane).toBe('social');
    expect(interpretation.ambiguous).toBe(false);
  });

  it('protects lightweight Spanish location prompts from world-lore routing', () => {
    const interpretation = interpretQuery({
      playerMessage: 'Donde estas?',
      npcName: 'Rick Cheese Roll',
      targetLanguage: 'es',
      scene: {
        regionName: 'Station',
        regionPath: 'regions.station',
      },
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
        regionName: 'Station',
        regionPath: 'regions.station',
      }),
    });

    expect(interpretation.lane).toBe('social');
    expect(interpretation.ambiguous).toBe(false);
  });

  it('uses exemplar similarity to boost occupation interpretation for paraphrased work questions', async () => {
    const interpretation = interpretQuery({
      playerMessage: 'What kind of work do you do around here?',
      npcName: 'Rick Roll',
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      }),
    });

    const enhanced = await enhanceInterpretationWithFacetSimilarity({
      interpretation,
      embedTexts: async (texts) => texts.map((text) => (
        text.includes('work do you do')
          ? [1, 0, 0]
          : text.includes('what do you do for work')
            ? [1, 0, 0]
            : text.includes('what is your job')
              ? [1, 0, 0]
              : [0, 1, 0]
      )),
    });

    expect(enhanced.lane).toBe('knowledge');
    expect(enhanced.target).toBe('self');
    expect(enhanced.facet).toBe('occupation');
  });

  it('reuses the strongest recent location referent for backreference follow-ups', () => {
    const interpretation = interpretQuery({
      playerMessage: 'Who founded it?',
      npcName: 'Rick Roll',
      evidencePreview: buildEvidencePreview({
        activeTopic: 'earendale',
        recentReferents: [
          {
            kind: 'location',
            text: 'Earendale',
            id: 'locations.earendale',
            confidence: 0.88,
            salience: 0.88,
            topic: 'earendale',
            sourceRole: 'lore',
          },
          {
            kind: 'location',
            text: 'Station',
            id: 'regions.station',
            confidence: 0.44,
            salience: 0.44,
            topic: 'station',
            sourceRole: 'scene',
          },
        ],
      }),
    });

    expect(interpretation.lane).toBe('knowledge');
    expect(interpretation.target).toBe('world');
    expect(interpretation.facet).toBe('general_lore');
    expect(interpretation.referents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'location',
          text: 'Earendale',
        }),
      ]),
    );
  });

  it('does not silently guess between competing person referents', () => {
    const interpretation = interpretQuery({
      playerMessage: 'What about him?',
      npcName: 'Rick Roll',
      evidencePreview: buildEvidencePreview({
        recentReferents: [
          {
            kind: 'entity',
            text: 'Captain Rowan',
            id: 'npc.rowan',
            confidence: 0.69,
            salience: 0.69,
            topic: 'rowan',
            sourceRole: 'lore',
          },
          {
            kind: 'entity',
            text: 'Mayor Bell',
            id: 'npc.bell',
            confidence: 0.66,
            salience: 0.66,
            topic: 'bell',
            sourceRole: 'lore',
          },
        ],
      }),
    });

    expect(interpretation.referents).toEqual([]);
    expect(interpretation.ambiguous).toBe(true);
  });
});
