import { describe, expect, it } from 'vitest';
import { runRetrieveStage } from '../retrieve/stage.js';
import { runPlanStage } from './stage.js';

describe('plan stage', () => {
  it('returns a bounded self-knowledge plan handoff', async () => {
    const artifacts = {
      chunks: [
        {
          chunkId: 'lore.entities.npcs.rick-roll#rick-roll',
          pageId: 'lore.entities.npcs.rick-roll',
          title: 'Rick Roll',
          sectionHeading: 'Profile',
          summary: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station.',
          content: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
          tokens: ['rick', 'roll', 'owns', 'cheese', 'shop', 'loves'],
          metadata: {
            id: 'lore.entities.npcs.rick-roll',
            title: 'Rick Roll',
            entity_ids: ['npc.rick-roll'],
            location_ids: [],
            faction_ids: [],
            beat_ids: [],
            tags: ['merchant'],
            fact_ids: [],
          },
        },
      ],
      factById: {},
    };

    const retrieve = await runRetrieveStage({
      npcId: 'npc_rick',
      npcName: 'Rick Roll',
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
            text: 'Rick Roll',
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

    const result = await runPlanStage({
      npcId: 'npc_rick',
      playerMessage: 'What is your job?',
      recentNpcReplies: [],
      routing: {
        intent: 'identity_self',
        confidence: 0.9,
        margin: 0.4,
        candidateScores: [],
        policyPath: 'self_knowledge',
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
        },
      },
      retrieve,
      snapshot: {
        npcId: 'npc_rick',
        npcName: 'Rick Roll',
        selfEntityId: 'npc.rick-roll',
        mode: 'character',
        deliveryLanguageContext: null,
      },
      history: [],
      turnIndexWithNpc: 0,
      topicCoverageContext: {},
      beatContract: null,
      loreEntityIds: [],
      isFirstMeeting: true,
    });

    expect(result.turnRouting.path).toBe('grounded');
    expect(result.initiativePolicy.decision?.action).toBe('player_respond');
    expect(result.validatedPlan.plan.speechAct).toBe('answer');
    expect(result.validatedPlan.plan.claims[0]?.text).toBe('I own a Cheese Shop in Wordlark Hollow Station');
  });

  it('returns a social-fast plan handoff for simple greetings', async () => {
    const result = await runPlanStage({
      npcId: 'npc_rick',
      playerMessage: 'hola',
      recentNpcReplies: [],
      routing: {
        intent: 'social_chat',
        confidence: 0.9,
        margin: 0.4,
        candidateScores: [],
        policyPath: 'chat',
      },
      retrieve: {
        loreScopes: [],
        selfLoreScopes: [],
        relatedLoreScopes: [],
        resolvedMode: 'character',
        retrieval: {
          attempted: false,
          matches: [],
          quality: {},
          governance: {},
          embeddingDegradedReason: null,
        },
        groundingEvidenceEntries: [],
        evidencePack: {
          items: [],
          evidenceIdToItem: new Map(),
        },
        enrichedEvidencePack: {
          items: [],
          evidenceIdToItem: new Map(),
        },
      },
      snapshot: {
        npcId: 'npc_rick',
        npcName: 'Ricky Cheese Roll',
        selfEntityId: 'npc.rick-roll',
        mode: 'character',
        deliveryLanguageContext: null,
      },
      history: [],
      turnIndexWithNpc: 0,
      topicCoverageContext: {},
      beatContract: null,
      loreEntityIds: [],
      isFirstMeeting: true,
    });

    expect(result.turnRouting.path).toBe('social_fast');
    expect(result.validatedPlan.acceptable).toBe(true);
    expect(result.validatedPlan.plan.speechAct).toBe('chat');
    expect(result.validatedPlan.plan.claims).toEqual([]);
  });
});
