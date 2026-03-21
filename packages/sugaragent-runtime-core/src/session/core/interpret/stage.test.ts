import { describe, expect, it } from 'vitest';
import { runInterpretStage } from './stage.js';

describe('interpret stage', () => {
  it('returns a bounded world-lore interpretation handoff for named places', async () => {
    const result = await runInterpretStage({
      playerMessage: 'Do you know anything about Earendale?',
      npcName: 'Ricky Cheese Roll',
      targetLanguage: 'es',
      history: [],
      turnContext: {
        interactionMode: 'character',
      },
      topicCoverageContext: {
        activeTopic: null,
      },
      recentReferentPreview: [],
      npcProfile: {
        loreScopes: ['town.earendale'],
        selfEntityId: 'npc.rick-roll',
      },
      loreArtifacts: {
        chunks: [
          {
            chunkId: 'lore.locations.towns.town.earendale#earendale',
            pageId: 'lore.locations.towns.town.earendale',
            title: 'Earendale',
            metadata: {
              id: 'lore.locations.towns.town.earendale',
              title: 'Earendale',
              entity_ids: [],
              location_ids: ['locations.earendale'],
              faction_ids: [],
              beat_ids: [],
              tags: ['earendale'],
              fact_ids: [],
            },
          },
        ],
      },
      embedTexts: async (texts) => texts.map((_, index) => [index + 1, 0, 0]),
    });

    expect(result.routing.intent).toBe('lore_world');
    expect(result.queryType).toBe('world_query');
    expect(result.loreEntityHints[0]?.entityId).toBe('locations.earendale');
    expect(result.routing.interpretation?.primaryReferent?.id).toBe('locations.earendale');
    expect(result.routingRefinement.retrievalFilters.locationIds).toEqual(['locations.earendale']);
  });

  it('degrades gracefully when semantic facet enhancement fails', async () => {
    const result = await runInterpretStage({
      playerMessage: 'What is your job?',
      npcName: 'Ricky Cheese Roll',
      targetLanguage: 'es',
      history: [],
      turnContext: {
        queryType: 'self_query',
      },
      topicCoverageContext: null,
      recentReferentPreview: [],
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
      },
      loreArtifacts: {
        chunks: [],
      },
      embedTexts: async () => {
        throw new Error('embeddings unavailable');
      },
    });

    expect(result.routing.intent).toBe('identity_self');
    expect(result.queryType).toBe('self_query');
    expect(result.semanticDiagnostics.exemplarEnabled).toBe(true);
    expect(result.semanticDiagnostics.exemplarAttempted).toBe(true);
    expect(result.semanticDiagnostics.degradedReason).toContain('embeddings unavailable');
    expect(result.embeddingDegradedReason).toContain('embeddings unavailable');
  });
});
