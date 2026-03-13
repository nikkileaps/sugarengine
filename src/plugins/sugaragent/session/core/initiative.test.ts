import { describe, expect, it } from 'vitest';
import {
  buildClarificationQuestion,
  buildProactiveQuestion,
  createNormalizedInitiativeDecision,
  normalizeInitiativeAction,
  resolveInitiativePolicy,
} from './initiative';

describe('initiative', () => {
  it('normalizes initiative action with safe fallback', () => {
    expect(normalizeInitiativeAction('clarify')).toBe('clarify');
    expect(normalizeInitiativeAction('unknown')).toBe('player_respond');
  });

  it('builds clarification/proactive prompts deterministically', () => {
    expect(buildClarificationQuestion({
      queryType: 'other_query',
      routeIntent: 'lore_other',
    })).toContain('specifically');

    expect(buildProactiveQuestion({
      mode: 'narrative',
      beatContract: {
        objective: 'Talk to the station manager about the resort.',
      },
    })).toContain('Does that make sense so far?');
  });

  it('resolves close action on exhausted social chat', () => {
    const policy = resolveInitiativePolicy({
      mode: 'character',
      routingIntent: 'social_chat',
      queryType: 'conversation',
      playerMessage: 'hello',
      playerHasQuestion: false,
      turnIndexWithNpc: 9,
      noveltyState: {
        turnPressure: true,
        repeatedNpcReplyRisk: true,
        activeTopic: 'coffee',
        activeTopicNovelty: 0.1,
        exhaustedTopics: ['coffee'],
        trackedTopicCount: 1,
        playerTopics: ['coffee'],
        topicExhausted: true,
        exhausted: true,
        initiativeHistory: {
          recentNpcQuestionCount: 0,
          recentNpcReplyCount: 3,
          repeatedNpcReplyRisk: true,
        },
      },
      beatContract: null,
      hasEvidence: true,
      retrievalConfidence: 0.9,
      isFirstMeeting: false,
    });

    expect(policy.decision.action).toBe('close');
    expect(policy.decision.primaryGoal).toBe('closure_goal');
  });

  it('normalizes external initiative decisions with policy defaults', () => {
    const decision = createNormalizedInitiativeDecision(
      {
        action: 'npc_initiate',
        primaryGoal: 'beat_goal',
        expectedPlayerResponseType: 'choice',
      },
      'character_goal',
      {
        completionRule: 'player_action',
      },
    );

    expect(decision.action).toBe('npc_initiate');
    expect(decision.primaryGoal).toBe('beat_goal');
    expect(decision.expectedPlayerResponseType).toBe('choice');
  });
});
