import { describe, expect, it } from 'vitest';
import { runRetrieveStage } from './stage.js';

describe('retrieve stage', () => {
  it('returns a bounded self-query retrieval handoff', async () => {
    const artifacts = {
      chunks: [
        {
          chunkId: 'lore.entities.npcs.rick-roll#rick-roll',
          pageId: 'lore.entities.npcs.rick-roll',
          title: 'Rick Roll',
          sectionHeading: 'Profile',
          summary: 'Rick Roll owns a Cheese Shop.',
          content: 'Rick Roll owns a Cheese Shop. He loves cheese.',
          tokens: ['rick', 'roll', 'owns', 'cheese', 'shop', 'loves'],
          metadata: {
            id: 'lore.entities.npcs.rick-roll',
            title: 'Rick Roll',
            entity_ids: ['npc.rick-roll'],
            location_ids: [],
            faction_ids: [],
            beat_ids: [],
            tags: ['earendale', 'merchant'],
            fact_ids: [],
          },
        },
        {
          chunkId: 'lore.entities.npcs.bippity-roo#bippity-roo',
          pageId: 'lore.entities.npcs.bippity-roo',
          title: 'Bippity Roo',
          sectionHeading: 'Profile',
          summary: 'Bippity Roo lives in Earendale.',
          content: 'Bippity Roo lives in Earendale.',
          tokens: ['bippity', 'roo', 'lives', 'earendale'],
          metadata: {
            id: 'lore.entities.npcs.bippity-roo',
            title: 'Bippity Roo',
            entity_ids: ['npc.bippity-roo'],
            location_ids: ['locations.earendale'],
            faction_ids: [],
            beat_ids: [],
            tags: ['earendale'],
            fact_ids: [],
          },
        },
      ],
      factById: {},
    };

    const result = await runRetrieveStage({
      npcId: 'npc_rick',
      npcName: 'Ricky Cheese Roll',
      playerMessage: 'What is your job?',
      queryType: 'self_query',
      routing: {
        intent: 'identity_self',
        interpretation: {
          schemaVersion: 1,
          lane: 'knowledge',
          target: 'self',
          facet: 'occupation',
          timeframe: 'habitual',
          focusText: 'What is your job?',
          normalizedText: 'What is your job?',
          referents: [],
          discourse: {
            repair: false,
            filler: false,
            contrast: false,
            emphasis: false,
          },
          candidateScores: [],
          confidence: 0.8,
          margin: 0.2,
          ambiguous: false,
          primaryReferent: {
            id: 'npc.rick-roll',
            text: 'Ricky Cheese Roll',
            kind: 'npc',
            confidence: 1,
          },
          relationPolicy: {
            facet: 'occupation',
            preferredRelationDistances: ['primary', 'associated'],
            incidentalAllowed: false,
            associatedFallbackAllowed: true,
            evidenceBudget: {
              maxPrimary: 2,
              maxAssociated: 1,
            },
          },
        },
      },
      loreArtifacts: artifacts,
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
        loreScopes: ['town.earendale'],
      },
      memoryFacts: [],
      history: [],
      turnContext: {
        interactionMode: 'character',
      },
      requireLoreScopeForRetrieval: false,
      retrievalFilters: {},
      modelVersion: 'test-model',
      rerankerClass: 'lexical',
    });

    expect(result.resolvedMode).toBe('character');
    expect(result.retrieval.attempted).toBe(true);
    expect(result.retrieval.matches).toHaveLength(1);
    expect(result.retrieval.matches[0]?.chunk?.chunkId).toContain('rick-roll');
    expect(result.groundingEvidenceEntries.length).toBeGreaterThan(0);
    expect(result.evidencePack.items.length).toBeGreaterThan(0);
    expect(result.enrichedEvidencePack.items.length).toBe(result.evidencePack.items.length);
  });

  it('returns direct world evidence for a named place overview query', async () => {
    const artifacts = {
      chunks: [
        {
          chunkId: 'lore.locations.earendale#overview',
          pageId: 'lore.locations.earendale',
          title: 'Earendale',
          sectionHeading: 'Overview',
          summary: 'Earendale is a floating resort town.',
          content: 'Earendale is a floating resort town.',
          tokens: ['earendale', 'floating', 'resort', 'town'],
          metadata: {
            id: 'lore.locations.earendale',
            title: 'Earendale',
            entity_ids: [],
            location_ids: ['locations.earendale'],
            faction_ids: [],
            beat_ids: [],
            tags: ['earendale', 'town'],
            fact_ids: [],
          },
        },
      ],
      factById: {},
    };

    const result = await runRetrieveStage({
      npcId: 'npc_rick',
      npcName: 'Ricky Cheese Roll',
      playerMessage: 'Do you know anything about Earendale?',
      queryType: 'world_query',
      routing: {
        intent: 'lore_world',
        interpretation: {
          schemaVersion: 1,
          lane: 'knowledge',
          target: 'world',
          facet: 'general_lore',
          timeframe: 'unknown',
          focusText: 'Do you know anything about Earendale?',
          normalizedText: 'Do you know anything about Earendale?',
          referents: [],
          discourse: {
            repair: false,
            filler: false,
            contrast: false,
            emphasis: false,
          },
          candidateScores: [],
          confidence: 0.8,
          margin: 0.2,
          ambiguous: false,
          primaryReferent: {
            id: 'locations.earendale',
            text: 'Earendale',
            kind: 'location',
            confidence: 1,
          },
          relationPolicy: {
            facet: 'general_lore',
            preferredRelationDistances: ['primary', 'associated'],
            incidentalAllowed: false,
            associatedFallbackAllowed: true,
            evidenceBudget: {
              maxPrimary: 2,
              maxAssociated: 1,
            },
          },
        },
      },
      loreArtifacts: artifacts,
      npcProfile: {
        loreScopes: ['locations.earendale'],
      },
      memoryFacts: [],
      history: [],
      turnContext: {
        interactionMode: 'character',
      },
      requireLoreScopeForRetrieval: false,
      retrievalFilters: {
        locationIds: ['locations.earendale'],
        aliases: ['earendale'],
      },
      modelVersion: 'test-model',
      rerankerClass: 'lexical',
    });

    expect(result.retrieval.matches[0]?.retrievalRing).toBe('direct');
    expect(result.retrieval.matches[0]?.chunk?.chunkId).toContain('earendale#overview');
    expect(result.evidencePack.items.some((item) => item.relationDistance === 'primary')).toBe(true);
  });
});
