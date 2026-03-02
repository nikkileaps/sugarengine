import { describe, expect, it } from 'vitest';
import {
  evaluateAgentBeatCompletion,
  parseRuntimeAgentBeatContracts,
  selectActiveAgentBeatContract,
  shouldFallbackToScriptedForBeat,
} from './agentBeatRuntime';

describe('agentBeatRuntime', () => {
  it('parses valid beat contracts from project data and indexes them by npc', () => {
    const parsed = parseRuntimeAgentBeatContracts({
      quests: [
        {
          id: 'quest.guard.alert',
          agentBeatContracts: [
            {
              id: 'beat.guard.alert',
              npcId: 'npc.guard',
              objective: 'Explain gate alert.',
              requiredFacts: ['Gate is on lockdown.'],
              completionRule: 'player_ack',
              stageId: 'stage.alert',
              objectiveId: 'obj.guard.talk',
            },
            {
              id: '',
              npcId: 'npc.guard',
              objective: 'invalid',
              requiredFacts: ['x'],
              completionRule: 'player_ack',
            },
          ],
        },
      ],
    });

    const guardContracts = parsed.get('npc.guard') ?? [];
    expect(guardContracts).toHaveLength(1);
    expect(guardContracts[0]).toMatchObject({
      id: 'beat.guard.alert',
      questId: 'quest.guard.alert',
      stageId: 'stage.alert',
      objectiveId: 'obj.guard.talk',
    });
  });

  it('selects active objective-bound contract for npc from active quest context', () => {
    const byNpc = parseRuntimeAgentBeatContracts({
      quests: [
        {
          id: 'quest.guard.alert',
          agentBeatContracts: [
            {
              id: 'beat.guard.generic',
              npcId: 'npc.guard',
              objective: 'Generic guard beat.',
              requiredFacts: ['Generic fact'],
              completionRule: 'player_ack',
              stageId: 'stage.alert',
            },
            {
              id: 'beat.guard.talk',
              npcId: 'npc.guard',
              objective: 'Talk objective beat.',
              requiredFacts: ['Specific fact'],
              completionRule: 'player_ack',
              stageId: 'stage.alert',
              objectiveId: 'obj.guard.talk',
            },
          ],
        },
      ],
    });

    const selected = selectActiveAgentBeatContract({
      npcId: 'npc.guard',
      contractsByNpc: byNpc,
      activeQuests: [{ questId: 'quest.guard.alert', currentStageId: 'stage.alert' }],
      getObjectiveState: (questId, objectiveId) =>
        questId === 'quest.guard.alert' && objectiveId === 'obj.guard.talk' ? 'active' : null,
    });

    expect(selected?.id).toBe('beat.guard.talk');
  });

  it('requires objective to be active before selecting objective-bound contract', () => {
    const byNpc = parseRuntimeAgentBeatContracts({
      quests: [
        {
          id: 'quest.guard.alert',
          agentBeatContracts: [
            {
              id: 'beat.guard.talk',
              npcId: 'npc.guard',
              objective: 'Talk objective beat.',
              requiredFacts: ['Specific fact'],
              completionRule: 'player_ack',
              stageId: 'stage.alert',
              objectiveId: 'obj.guard.talk',
            },
            {
              id: 'beat.guard.stage',
              npcId: 'npc.guard',
              objective: 'Stage-level beat.',
              requiredFacts: ['Stage fact'],
              completionRule: 'player_ack',
              stageId: 'stage.alert',
            },
          ],
        },
      ],
    });

    const selected = selectActiveAgentBeatContract({
      npcId: 'npc.guard',
      contractsByNpc: byNpc,
      activeQuests: [{ questId: 'quest.guard.alert', currentStageId: 'stage.alert' }],
      getObjectiveState: () => 'completed',
    });

    expect(selected?.id).toBe('beat.guard.stage');
  });

  it('evaluates coverage + completion rule deterministically', () => {
    const contract = {
      id: 'beat.guard.alert',
      questId: 'quest.guard.alert',
      npcId: 'npc.guard',
      objective: 'Explain gate alert.',
      requiredFacts: ['Gate is on lockdown.'],
      completionRule: 'player_ack' as const,
    };

    const passed = evaluateAgentBeatCompletion(
      contract,
      {
        beatId: 'beat.guard.alert',
        coveredFacts: ['Gate is on lockdown.'],
        uncoveredFacts: [],
        completionSignal: 'player_ack',
        confidence: 0.9,
      },
      () => undefined,
    );
    expect(passed.passed).toBe(true);

    const failed = evaluateAgentBeatCompletion(
      contract,
      {
        beatId: 'beat.guard.alert',
        coveredFacts: [],
        uncoveredFacts: ['Gate is on lockdown.'],
        completionSignal: 'player_ack',
        confidence: 0.5,
      },
      () => undefined,
    );
    expect(failed.passed).toBe(false);
    expect(failed.coveragePassed).toBe(false);
  });

  it('supports engine_flag rule via host flag lookup', () => {
    const contract = {
      id: 'beat.guard.flag',
      questId: 'quest.guard.alert',
      npcId: 'npc.guard',
      objective: 'Wait for engine flag.',
      requiredFacts: ['Flag fact'],
      completionRule: 'engine_flag' as const,
      completionTarget: 'gate.alert.acknowledged',
    };

    const evaluation = evaluateAgentBeatCompletion(
      contract,
      {
        beatId: 'beat.guard.flag',
        coveredFacts: ['Flag fact'],
        uncoveredFacts: [],
        completionSignal: 'none',
        confidence: 0.7,
      },
      (flagName) => flagName === 'gate.alert.acknowledged',
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.rulePassed).toBe(true);
  });

  it('enforces max-turn fallback guardrail', () => {
    const contract = {
      id: 'beat.guard.alert',
      questId: 'quest.guard.alert',
      npcId: 'npc.guard',
      objective: 'Explain gate alert.',
      requiredFacts: ['Gate is on lockdown.'],
      completionRule: 'player_ack' as const,
      maxTurns: 2,
    };

    expect(shouldFallbackToScriptedForBeat(contract, 1)).toBe(false);
    expect(shouldFallbackToScriptedForBeat(contract, 2)).toBe(false);
    expect(shouldFallbackToScriptedForBeat(contract, 3)).toBe(true);
  });
});
