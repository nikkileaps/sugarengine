import { describe, expect, it } from 'vitest';
import { runGovernedLoreRetrieval } from './retrieval-pipeline';

describe('retrieval-pipeline', () => {
  const emptyArtifacts = {
    chunks: [],
    factById: {},
  };

  it('does not attempt corrective retrieval when failure is structural and scopes are absent', () => {
    const result = runGovernedLoreRetrieval({
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

  it('permits one corrective retrieval pass when reformulation might help', () => {
    const result = runGovernedLoreRetrieval({
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

  it('does not let self or related scopes hide world lore on world queries', () => {
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

    const result = runGovernedLoreRetrieval({
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
});
