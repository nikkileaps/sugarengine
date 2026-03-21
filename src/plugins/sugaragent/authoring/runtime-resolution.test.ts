import { describe, expect, it } from 'vitest';
import {
  isObjectiveActiveInQuestSnapshot,
  resolveSugarAgentPolicy,
  resolveSugarAgentProfile,
  selectActiveSugarAgentBeatContract,
} from './runtime-resolution';

const bundle = {
  schemaVersion: 1 as const,
  generatedAt: '2026-03-07T00:00:00.000Z',
  source: {
    gameId: 'test-game',
    name: 'Test Game',
  },
  policy: {
    runtimeMode: 'auto' as const,
    globalSafetyBounds: ['no profanity'],
  },
  profiles: [
    {
      npcId: 'npc.guard',
      persona: 'Watchful guard',
      tone: 'brisk',
      constraints: ['stay on topic'],
      loreScopes: ['city.gate'],
      selfEntityId: 'entity.guard',
      selfLoreScopes: [],
      relatedLoreScopes: [],
    },
  ],
  beatContracts: [
    {
      id: 'beat.guard.generic',
      questId: 'quest.guard.alert',
      npcId: 'npc.guard',
      objective: 'Generic guard beat.',
      requiredFacts: ['Generic fact'],
      forbiddenFacts: [],
      completionRule: 'player_ack' as const,
      stageId: 'stage.alert',
    },
    {
      id: 'beat.guard.talk',
      questId: 'quest.guard.alert',
      npcId: 'npc.guard',
      objective: 'Talk objective beat.',
      requiredFacts: ['Specific fact'],
      forbiddenFacts: [],
      completionRule: 'player_ack' as const,
      stageId: 'stage.alert',
      objectiveId: 'obj.guard.talk',
    },
  ],
};

describe('runtime-resolution', () => {
  it('resolves runtime policy and npc profile from the bundle', () => {
    expect(resolveSugarAgentPolicy(bundle, 'llama')).toEqual({
      generation: {
        provider: 'selfHosted',
        selfHosted: {
          runtimeMode: 'auto',
        },
        openai: {
          model: 'gpt-5-mini',
          baseUrl: 'https://api.openai.com/v1',
        },
      },
      runtimeMode: 'auto',
      globalSafetyBounds: ['no profanity'],
    });
    expect(resolveSugarAgentProfile(bundle, 'npc.guard')).toMatchObject({
      persona: 'Watchful guard',
      tone: 'brisk',
      constraints: ['stay on topic'],
      loreScopes: ['city.gate'],
      selfEntityId: 'entity.guard',
    });
  });

  it('selects the objective-bound contract when the objective is active', () => {
    const selected = selectActiveSugarAgentBeatContract(bundle, 'npc.guard', [
      {
        questId: 'quest.guard.alert',
        currentStageId: 'stage.alert',
        objectives: [{ objectiveId: 'obj.guard.talk', state: 'active' }],
      },
    ]);

    expect(selected?.id).toBe('beat.guard.talk');
  });

  it('falls back to stage-level contract when the objective is not active', () => {
    const selected = selectActiveSugarAgentBeatContract(bundle, 'npc.guard', [
      {
        questId: 'quest.guard.alert',
        currentStageId: 'stage.alert',
        objectives: [{ objectiveId: 'obj.guard.talk', state: 'completed' }],
      },
    ]);

    expect(selected?.id).toBe('beat.guard.generic');
  });

  it('checks objective activity from the generic quest snapshot', () => {
    expect(isObjectiveActiveInQuestSnapshot([
      {
        questId: 'quest.guard.alert',
        currentStageId: 'stage.alert',
        objectives: [{ objectiveId: 'obj.guard.talk', state: 'active' }],
      },
    ], 'quest.guard.alert', 'obj.guard.talk')).toBe(true);
    expect(isObjectiveActiveInQuestSnapshot([
      {
        questId: 'quest.guard.alert',
        currentStageId: 'stage.alert',
        objectives: [{ objectiveId: 'obj.guard.talk', state: 'completed' }],
      },
    ], 'quest.guard.alert', 'obj.guard.talk')).toBe(false);
  });
});
