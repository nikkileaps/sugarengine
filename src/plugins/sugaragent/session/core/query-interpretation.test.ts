import { describe, expect, it } from 'vitest';
import { buildEvidencePreview, extractFacetQueryTokens, interpretQuery } from './query-interpretation';

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
});
