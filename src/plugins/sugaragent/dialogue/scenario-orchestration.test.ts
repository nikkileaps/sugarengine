import { describe, expect, it } from 'vitest';
import {
  createSimScenarioFromBeatContract,
  createScenarioState,
  getSimScenario,
  orchestrateScenarioTurn,
} from './scenario-orchestration.ts';

describe('SugarAgent scenario orchestration (ADR-005 MVP)', () => {
  it('gates legal and illegal intents and emits beat evidence', () => {
    const scenario = getSimScenario('beat-guard-alert');
    expect(scenario).toBeTruthy();
    const state = createScenarioState(scenario);
    expect(state).toBeTruthy();

    const result = orchestrateScenarioTurn({
      scenario,
      scenarioState: state,
      playerMessage: 'what is happening at the gate?',
      turnOutput: {
        utterance: 'The situation is tense.',
        emotion: 'serious',
        intent: 'explain',
        proposedIntents: [],
        citations: [],
      },
    });

    expect(result.logs.some((line: string) => line.startsWith('intent-executed='))).toBe(true);
    expect(result.logs.some((line: string) => line.startsWith('intent-rejected='))).toBe(true);
    expect(result.logs.some((line: string) => line.startsWith('beat-evidence='))).toBe(true);
    expect(result.output.beatEvidence?.beatId).toBe('beat.guard.alert');
    expect(result.output.beatEvidence?.uncoveredFacts.length).toBe(0);
    expect(result.state.completed).toBe(false);
  });

  it('uses scripted fallback once beat max-turn budget is exceeded without completion', () => {
    const scenario = getSimScenario('beat-guard-alert');
    expect(scenario).toBeTruthy();
    const state = createScenarioState(scenario);
    expect(state).toBeTruthy();

    const firstTurn = orchestrateScenarioTurn({
      scenario,
      scenarioState: state,
      playerMessage: 'what is happening at the gate?',
      turnOutput: {
        utterance: 'I can explain.',
        emotion: 'neutral',
        intent: 'explain',
        proposedIntents: [],
        citations: [],
      },
    });

    const secondTurn = orchestrateScenarioTurn({
      scenario,
      scenarioState: firstTurn.state,
      playerMessage: 'tell me again',
      turnOutput: {
        utterance: 'Still the same situation.',
        emotion: 'neutral',
        intent: 'explain',
        proposedIntents: [],
        citations: [],
      },
    });

    expect(secondTurn.output.intent).toBe('fallback_script');
    expect(secondTurn.output.utterance).toContain('Gate stays locked under alert');
    expect(secondTurn.logs.some((line: string) => line.startsWith('beat-fallback='))).toBe(true);
    expect(secondTurn.state.completed).toBe(false);
  });

  it('builds dynamic scenario from authored beat contract', () => {
    const scenario = createSimScenarioFromBeatContract({
      id: 'beat.baker.intro',
      npcId: 'npc.baker',
      objective: 'Welcome the player and mention fresh bread.',
      requiredFacts: ['Fresh bread just came out of the oven.'],
      completionRule: 'player_ack',
      maxTurns: 1,
      fallbackScriptId: 'dlg.baker.intro.fallback',
    });
    const state = createScenarioState(scenario);
    expect(scenario.id).toBe('authoring:beat.baker.intro');
    expect(state).toBeTruthy();

    const turn = orchestrateScenarioTurn({
      scenario,
      scenarioState: state,
      playerMessage: 'hello there',
      turnOutput: {
        utterance: 'Hi there.',
        emotion: 'warm',
        intent: 'conversation',
        proposedIntents: [],
        citations: [],
      },
    });

    expect(turn.output.intent).toBe('fallback_script');
    expect(turn.output.utterance).toContain('Fresh bread just came out of the oven');
    expect(turn.logs.some((line: string) => line.startsWith('beat-fallback='))).toBe(true);
  });
});
