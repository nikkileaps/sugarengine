import { describe, expect, it } from 'vitest';
import {
  evaluateSugarAgentBeatCompletion,
  shouldFallbackToScriptedForBeat,
} from './beat-runtime';

describe('beat-runtime', () => {
  it('evaluates coverage + completion rule deterministically', () => {
    const contract = {
      id: 'beat.guard.alert',
      questId: 'quest.guard.alert',
      npcId: 'npc.guard',
      objective: 'Explain gate alert.',
      requiredFacts: ['Gate is on lockdown.'],
      completionRule: 'player_ack' as const,
    };

    const passed = evaluateSugarAgentBeatCompletion(
      contract,
      {
        beatId: 'beat.guard.alert',
        coveredFacts: ['Gate is on lockdown.'],
        uncoveredFacts: [],
        completionSignal: 'player_ack',
        confidence: 0.9,
      },
      {},
    );
    expect(passed.passed).toBe(true);
    expect(passed.beatIdMatched).toBe(true);
    expect(passed.coveragePassed).toBe(true);
    expect(passed.confidencePassed).toBe(true);

    const failed = evaluateSugarAgentBeatCompletion(
      contract,
      {
        beatId: 'beat.guard.alert',
        coveredFacts: [],
        uncoveredFacts: ['Gate is on lockdown.'],
        completionSignal: 'player_ack',
        confidence: 0.5,
      },
      {},
    );
    expect(failed.passed).toBe(false);
    expect(failed.coveragePassed).toBe(false);
  });

  it('supports engine_flag rule via generic flag snapshot', () => {
    const contract = {
      id: 'beat.guard.flag',
      questId: 'quest.guard.alert',
      npcId: 'npc.guard',
      objective: 'Wait for engine flag.',
      requiredFacts: ['Flag fact'],
      completionRule: 'engine_flag' as const,
      completionTarget: 'gate.alert.acknowledged',
    };

    const evaluation = evaluateSugarAgentBeatCompletion(
      contract,
      {
        beatId: 'beat.guard.flag',
        coveredFacts: ['Flag fact'],
        uncoveredFacts: [],
        completionSignal: 'none',
        confidence: 0.7,
      },
      { 'gate.alert.acknowledged': true },
    );

    expect(evaluation.passed).toBe(true);
    expect(evaluation.rulePassed).toBe(true);
  });

  it('fails deterministic evaluation when forbidden fact is covered', () => {
    const contract = {
      id: 'beat.guard.alert',
      questId: 'quest.guard.alert',
      npcId: 'npc.guard',
      objective: 'Explain gate alert.',
      requiredFacts: ['Gate is on lockdown.'],
      forbiddenFacts: ['Reveal captain identity.'],
      completionRule: 'player_ack' as const,
    };

    const evaluation = evaluateSugarAgentBeatCompletion(
      contract,
      {
        beatId: 'beat.guard.alert',
        coveredFacts: ['Gate is on lockdown.', 'Reveal captain identity.'],
        uncoveredFacts: [],
        completionSignal: 'player_ack',
        confidence: 0.95,
      },
      {},
    );

    expect(evaluation.passed).toBe(false);
    expect(evaluation.forbiddenPassed).toBe(false);
    expect(evaluation.forbiddenFactMentions).toContain('reveal captain identity.');
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
