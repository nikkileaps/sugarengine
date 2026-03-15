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

  it('does not clarify a self query when self evidence is already available', () => {
    const policy = resolveInitiativePolicy({
      mode: 'character',
      routingIntent: 'identity_self',
      queryType: 'self_query',
      playerMessage: "What's your name?",
      playerHasQuestion: true,
      turnIndexWithNpc: 0,
      noveltyState: {
        turnPressure: false,
        repeatedNpcReplyRisk: false,
        activeTopic: null,
        activeTopicNovelty: null,
        exhaustedTopics: [],
        trackedTopicCount: 0,
        playerTopics: [],
        topicExhausted: false,
        exhausted: false,
        initiativeHistory: {
          recentNpcQuestionCount: 0,
          recentNpcReplyCount: 0,
          repeatedNpcReplyRisk: false,
        },
      },
      beatContract: null,
      hasEvidence: true,
      retrievalConfidence: 0.76,
      isFirstMeeting: true,
    });

    expect(policy.decision.action).toBe('player_respond');
  });

  it('does not clarify an unclear question when direct answer evidence is already available', () => {
    const policy = resolveInitiativePolicy({
      mode: 'character',
      routingIntent: 'unclear',
      queryType: 'conversation',
      playerMessage: 'Where are we right now?',
      playerHasQuestion: true,
      turnIndexWithNpc: 1,
      noveltyState: {
        turnPressure: false,
        repeatedNpcReplyRisk: false,
        activeTopic: null,
        activeTopicNovelty: null,
        exhaustedTopics: [],
        trackedTopicCount: 0,
        playerTopics: [],
        topicExhausted: false,
        exhausted: false,
        initiativeHistory: {
          recentNpcQuestionCount: 0,
          recentNpcReplyCount: 0,
          repeatedNpcReplyRisk: false,
        },
      },
      beatContract: null,
      hasEvidence: true,
      hasDirectAnswerEvidence: true,
      retrievalConfidence: 0.42,
      isFirstMeeting: false,
    });

    expect(policy.decision.action).toBe('player_respond');
  });
});
