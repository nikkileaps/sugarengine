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
