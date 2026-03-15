import { describe, expect, it } from 'vitest';
import {
  buildCorrectiveLoreQuery,
  buildEvidencePack,
  evaluateLoreOverrideConfidence,
  evaluateRetrievalQuality,
  pickEvidenceForIntent,
  resolveConversationMode,
  resolveRerankBudgetTier,
} from './retrieval-governance';
import { buildEvidencePreview, interpretQuery } from './query-interpretation';

describe('retrieval-governance', () => {
  it('applies lore override thresholds deterministically', () => {
    expect(evaluateLoreOverrideConfidence([])).toMatchObject({
      shouldOverride: false,
      reason: 'no_matches',
    });

    expect(evaluateLoreOverrideConfidence([
      { score: 1.4 },
      { score: 0.8 },
    ])).toMatchObject({
      shouldOverride: true,
      reason: 'ok',
    });
  });

  it('resolves narrative mode and rerank tier for beat contract turns', () => {
    const mode = resolveConversationMode({ interactionMode: 'hybrid' }, true);
    expect(mode).toBe('hybrid');
    expect(resolveRerankBudgetTier({
      mode,
      queryType: 'world_query',
      routingIntent: 'lore_world',
      hasBeatContract: true,
    })).toBe('high');
  });

  it('computes corrective lore query and retrieval quality gate', () => {
    expect(buildCorrectiveLoreQuery('what do you know about the resort?', 'world_query', 'lore_world'))
      .toContain('world lore');

    const nonKnowledge = evaluateRetrievalQuality({
      query: 'hello there',
      mode: 'character',
      queryType: 'conversation',
      routeIntent: 'social_chat',
      selectedMatches: [],
    });
    expect(nonKnowledge).toMatchObject({
      required: false,
      pass: true,
      reason: 'not_required',
    });
  });

  it('counts title and scope metadata toward coverage for proper-noun world lore turns', () => {
    const quality = evaluateRetrievalQuality({
      query: 'Do you know anything about Earendale?',
      mode: 'character',
      queryType: 'world_query',
      routeIntent: 'lore_world',
      selectedMatches: [
        {
          score: 1.9,
          rerankScore: 0.45,
          chunk: {
            chunkId: 'lore.locations.towns.town.earendale#overview',
            pageId: 'lore.locations.towns.town.earendale',
            title: 'Earendale',
            sectionHeading: 'Overview',
            summary: 'A station-linked resort community.',
            content: 'Visitors arrive by train for a quiet stay.',
            metadata: {
              id: 'lore.locations.towns.town.earendale',
              title: 'Earendale',
              location_ids: ['locations.earendale'],
              tags: ['earendale', 'town'],
            },
          },
        },
      ],
    });

    expect(quality.pass).toBe(true);
    expect(quality.reason).toBe('sufficient');
    expect(quality.coverage).toBeGreaterThan(0);
  });

  it('treats self job queries as covered by self lore about owning a shop', () => {
    const quality = evaluateRetrievalQuality({
      query: 'What do you do for a job?',
      mode: 'character',
      queryType: 'self_query',
      routeIntent: 'identity_self',
      selectedMatches: [
        {
          score: 1.9,
          rerankScore: 0.41,
          pool: 'self',
          chunk: {
            chunkId: 'lore.entities.npcs.rick-roll#overview',
            pageId: 'lore.entities.npcs.rick-roll',
            title: 'Rick Roll',
            sectionHeading: 'Overview',
            summary: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station.',
            content: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
            metadata: {
              id: 'lore.entities.npcs.rick-roll',
              title: 'Rick Roll',
              entity_ids: ['npc.rick-roll'],
              tags: ['rick', 'cheese', 'shop'],
            },
          },
        },
      ],
    });

    expect(quality.pass).toBe(true);
    expect(quality.reason).toBe('sufficient');
    expect(quality.coverage).toBeGreaterThan(0.2);
  });

  it('treats short self job questions as covered when interpretation resolves occupation semantics', () => {
    const interpretation = interpretQuery({
      playerMessage: 'What do you do?',
      npcName: 'Rick Roll',
      evidencePreview: buildEvidencePreview({
        selfEntityId: 'npc.rick-roll',
      }),
    });
    const quality = evaluateRetrievalQuality({
      query: 'What do you do?',
      interpretation,
      mode: 'character',
      queryType: 'self_query',
      routeIntent: 'identity_self',
      selectedMatches: [
        {
          score: 1.8,
          rerankScore: 0.4,
          pool: 'self',
          chunk: {
            chunkId: 'lore.entities.npcs.rick-roll#overview',
            pageId: 'lore.entities.npcs.rick-roll',
            title: 'Rick Roll',
            sectionHeading: 'Overview',
            summary: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station.',
            content: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
            metadata: {
              id: 'lore.entities.npcs.rick-roll',
              title: 'Rick Roll',
              entity_ids: ['npc.rick-roll'],
              tags: ['rick', 'cheese', 'shop'],
            },
          },
        },
      ],
    });

    expect(quality.pass).toBe(true);
    expect(quality.reason).toBe('sufficient');
    expect(quality.coverage).toBeGreaterThan(0.2);
  });

  it('builds evidence pack and filters recall evidence toward player facts', () => {
    const evidencePack = buildEvidencePack({
      evidenceEntries: [
        { sourceId: 'player:1', sourceType: 'player_fact', text: 'My name is Nikki' },
        { sourceId: 'lore:1', sourceType: 'lore_chunk', text: 'The resort is outside Earendale' },
      ],
      loreMatches: [],
      mode: 'character',
      playerMessage: 'what do you remember about me?',
      queryType: 'self_query',
      routing: { intent: 'session_recall', policyPath: 'memory_first' },
      selfEntityId: 'npc.baker',
      npcId: 'npc.baker',
    });

    const ranked = pickEvidenceForIntent(
      evidencePack,
      'what do you remember about me?',
      'session_recall',
      'self_query',
      'npc.baker',
      'npc.baker',
    );
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]?.item.ownerType).toBe('player');
  });
});
