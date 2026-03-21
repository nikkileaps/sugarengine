import { describe, expect, it } from 'vitest';
import { runGovernedLoreRetrieval } from './retrieval-pipeline.js';

describe('retrieval-pipeline', () => {
  const emptyArtifacts = {
    chunks: [],
    factById: {},
  };

  it('does not attempt corrective retrieval when failure is structural and scopes are absent', async () => {
    const result = await runGovernedLoreRetrieval({
      loreArtifacts: emptyArtifacts,
      canRetrieveLore: true,
      shouldAttemptLoreRetrieval: true,
      playerMessage: 'where is the old resort?',
      mode: 'character',
      routingIntent: 'lore_world',
      queryType: 'world_query',
      activeBeatId: undefined,
      loreScopes: [],
      selfLoreScopes: [],
      relatedLoreScopes: [],
      selfEntityId: undefined,
      hasBeatContract: false,
      rerankCache: undefined,
      artifactVersion: undefined,
      modelVersion: undefined,
      rerankerClass: 'lexical',
    });

    expect(result.governance.correctiveAttempted).toBe(false);
    expect(result.governance.qualityPath).toBe('single_pass');
  });

  it('permits one corrective retrieval pass when reformulation might help', async () => {
    const result = await runGovernedLoreRetrieval({
      loreArtifacts: emptyArtifacts,
      canRetrieveLore: true,
      shouldAttemptLoreRetrieval: true,
      playerMessage: 'where is the old resort?',
      mode: 'character',
      routingIntent: 'lore_world',
      queryType: 'world_query',
      activeBeatId: undefined,
      loreScopes: ['world.locations'],
      selfLoreScopes: [],
      relatedLoreScopes: [],
      selfEntityId: undefined,
      hasBeatContract: false,
      rerankCache: undefined,
      artifactVersion: undefined,
      modelVersion: undefined,
      rerankerClass: 'lexical',
    });

    expect(result.governance.correctiveAttempted).toBe(true);
    expect(result.governance.attempts).toHaveLength(2);
  });

  it('does not let self or related scopes hide world lore on world queries', async () => {
    const artifacts = {
      chunks: [
        {
          chunkId: 'lore.locations.earendale#overview',
          pageId: 'lore.locations.earendale',
          title: 'Earendale',
          sectionHeading: 'Overview',
          summary: 'Earendale is a market town.',
          content: 'Earendale is a market town.',
          tokens: ['earendale', 'market', 'town'],
          metadata: {
            id: 'lore.locations.earendale',
            title: 'Earendale',
            entity_ids: [],
            location_ids: ['locations.earendale'],
            faction_ids: [],
            beat_ids: [],
            tags: ['earendale'],
            fact_ids: [],
          },
        },
        {
          chunkId: 'lore.npcs.rick#profile',
          pageId: 'lore.npcs.rick',
          title: 'Rick Cheese Roll',
          sectionHeading: 'Profile',
          summary: 'Rick loves cheese.',
          content: 'Rick loves cheese.',
          tokens: ['rick', 'cheese'],
          metadata: {
            id: 'lore.npcs.rick',
            title: 'Rick Cheese Roll',
            entity_ids: ['npc.rick'],
            location_ids: [],
            faction_ids: [],
            beat_ids: [],
            tags: ['rick'],
            fact_ids: [],
          },
        },
      ],
      factById: {},
    };

    const result = await runGovernedLoreRetrieval({
      loreArtifacts: artifacts,
      canRetrieveLore: true,
      shouldAttemptLoreRetrieval: true,
      playerMessage: 'Do you know anything about Earendale?',
      mode: 'character',
      routingIntent: 'lore_world',
      queryType: 'world_query',
      activeBeatId: undefined,
      loreScopes: [],
      selfLoreScopes: ['npcs.rick'],
      relatedLoreScopes: ['npc.rowan'],
      selfEntityId: 'npc.rick',
      hasBeatContract: false,
      rerankCache: undefined,
      artifactVersion: undefined,
      modelVersion: undefined,
      rerankerClass: 'lexical',
      retrievalFilters: {
        locationIds: ['locations.earendale'],
      },
    });

    expect(result.loreMatches.length).toBeGreaterThan(0);
    expect(result.loreMatches[0]?.chunk.chunkId).toContain('earendale');
  });

  it('treats explicit location filters as retrieval gates for world lore queries', async () => {
    const artifacts = {
      chunks: [
        {
          chunkId: 'lore.locations.earendale#overview',
          pageId: 'lore.locations.earendale',
          title: 'Earendale',
          sectionHeading: 'Overview',
          summary: 'Earendale is a resort town with a station.',
          content: 'Earendale is a resort town with a station.',
          tokens: ['earendale', 'resort', 'town', 'station'],
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
        {
          chunkId: 'lore.history.earendale-fair#overview',
          pageId: 'lore.history.earendale-fair',
          title: 'Earendale Lantern Fair',
          sectionHeading: 'Overview',
          summary: 'The Earendale Lantern Fair fills the station square every spring.',
          content: 'The Earendale Lantern Fair fills the station square every spring.',
          tokens: ['earendale', 'lantern', 'fair', 'station', 'spring'],
          metadata: {
            id: 'lore.history.earendale-fair',
            title: 'Earendale Lantern Fair',
            entity_ids: [],
            location_ids: [],
            faction_ids: [],
            beat_ids: [],
            tags: ['earendale', 'festival'],
            fact_ids: [],
          },
        },
        {
          chunkId: 'lore.npcs.bippity#family',
          pageId: 'lore.npcs.bippity',
          title: 'Bippity Roo',
          sectionHeading: 'Family',
          summary: "His wife's name is Janet Roo.",
          content: "His wife's name is Janet Roo.",
          tokens: ['wife', 'janet', 'roo', 'family'],
          metadata: {
            id: 'lore.npcs.bippity',
            title: 'Bippity Roo',
            entity_ids: ['npc.bippity'],
            location_ids: ['locations.rackwick'],
            faction_ids: [],
            beat_ids: [],
            tags: ['bippity', 'family', 'earendale'],
            fact_ids: [],
          },
        },
      ],
      factById: {},
    };

    const result = await runGovernedLoreRetrieval({
      loreArtifacts: artifacts,
      canRetrieveLore: true,
      shouldAttemptLoreRetrieval: true,
      playerMessage: 'Do you know anything about Earendale?',
      mode: 'character',
      routingIntent: 'lore_world',
      queryType: 'world_query',
      activeBeatId: undefined,
      loreScopes: [],
      selfLoreScopes: [],
      relatedLoreScopes: [],
      selfEntityId: undefined,
      hasBeatContract: false,
      rerankCache: undefined,
      artifactVersion: undefined,
      modelVersion: undefined,
      rerankerClass: 'lexical',
      retrievalFilters: {
        locationIds: ['locations.earendale'],
        aliases: ['earendale'],
      },
    });

    expect(result.loreMatches.length).toBeGreaterThan(0);
    expect(result.loreMatches.some((entry) => entry?.chunk?.chunkId?.includes('earendale#overview'))).toBe(true);
    expect(result.loreMatches.some((entry) => entry?.chunk?.chunkId?.includes('earendale-fair'))).toBe(true);
    expect(result.loreMatches.some((entry) => entry?.chunk?.chunkId?.includes('bippity'))).toBe(false);
  });

  it('merges lexical and vector candidates and surfaces vector diagnostics', async () => {
    const artifacts = {
      chunks: [
        {
          chunkId: 'lore.locations.earendale#overview',
          pageId: 'lore.locations.earendale',
          title: 'Earendale',
          sectionHeading: 'Overview',
          summary: 'Earendale is a floating town.',
          content: 'Earendale is a floating town with a train station.',
          tokens: ['earendale', 'floating', 'town', 'train', 'station'],
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
      chunkVectors: [
        {
          chunkId: 'lore.locations.earendale#overview',
          vector: [1, 0, 0],
        },
      ],
      factById: {},
    };

    const result = await runGovernedLoreRetrieval({
      loreArtifacts: artifacts,
      canRetrieveLore: true,
      shouldAttemptLoreRetrieval: true,
      playerMessage: 'Tell me about the floating town by the station',
      interpretation: {
        schemaVersion: 1,
        lane: 'knowledge',
        target: 'world',
        facet: 'general_lore',
        timeframe: 'unknown',
        focusText: 'Tell me about the floating town by the station',
        normalizedText: 'Tell me about the floating town by the station',
        referents: [],
        discourse: {
          repair: false,
          filler: false,
          contrast: false,
          emphasis: false,
        },
        candidateScores: [],
        confidence: 0.8,
        margin: 0.3,
        ambiguous: false,
      },
      mode: 'character',
      routingIntent: 'lore_world',
      queryType: 'world_query',
      loreScopes: [],
      selfLoreScopes: [],
      relatedLoreScopes: [],
      hasBeatContract: false,
      rerankerClass: 'lexical',
      embedTexts: async () => [[1, 0, 0]],
    });

    expect(result.governance.vectorCandidateCount).toBeGreaterThan(0);
    expect(result.governance.mergedCandidateCount).toBeGreaterThan(0);
    expect(result.loreMatches[0]?.vectorScore).toBeGreaterThan(0);
  });

  it('treats ambiguous knowledge interpretations as retrieval-eligible even before route disambiguation', async () => {
    const artifacts = {
      chunks: [
        {
          chunkId: 'lore.locations.skyharbor#overview',
          pageId: 'lore.locations.skyharbor',
          title: 'Skyharbor',
          sectionHeading: 'Overview',
          summary: 'Skyharbor is a floating town reached by train.',
          content: 'Skyharbor is a floating town reached by train.',
          tokens: ['skyharbor', 'floating', 'town', 'train'],
          metadata: {
            id: 'lore.locations.skyharbor',
            title: 'Skyharbor',
            entity_ids: [],
            location_ids: ['locations.skyharbor'],
            faction_ids: [],
            beat_ids: [],
            tags: ['skyharbor', 'town'],
            fact_ids: [],
          },
        },
      ],
      chunkVectors: [
        {
          chunkId: 'lore.locations.skyharbor#overview',
          vector: [1, 0, 0],
        },
      ],
      factById: {},
    };

    const result = await runGovernedLoreRetrieval({
      loreArtifacts: artifacts,
      canRetrieveLore: true,
      shouldAttemptLoreRetrieval: true,
      playerMessage: 'Do you know the floating town reached by train?',
      interpretation: {
        schemaVersion: 1,
        lane: 'knowledge',
        target: 'self',
        facet: 'identity',
        timeframe: 'habitual',
        focusText: 'Do you know the floating town reached by train?',
        normalizedText: 'Do you know the floating town reached by train?',
        referents: [],
        discourse: {
          repair: false,
          filler: false,
          contrast: false,
          emphasis: false,
        },
        candidateScores: [
          {
            lane: 'knowledge',
            target: 'self',
            facet: 'identity',
            timeframe: 'habitual',
            score: 0.5882,
          },
          {
            lane: 'knowledge',
            target: 'world',
            facet: 'general_lore',
            timeframe: 'unknown',
            score: 0.5807,
          },
        ],
        confidence: 0.5882,
        margin: 0.0075,
        ambiguous: true,
      },
      mode: 'character',
      routingIntent: 'unclear',
      queryType: 'conversation',
      loreScopes: ['locations.skyharbor'],
      selfLoreScopes: [],
      relatedLoreScopes: [],
      hasBeatContract: false,
      rerankerClass: 'lexical',
      embedTexts: async () => [[1, 0, 0]],
    });

    expect(result.governance.attempted).toBe(true);
    expect(result.retrievalQuality.required).toBe(true);
    expect(result.governance.vectorCandidateCount).toBeGreaterThan(0);
  });
});
