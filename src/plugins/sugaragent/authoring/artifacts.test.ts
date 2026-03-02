import { describe, expect, it } from 'vitest';
import {
  buildSugarAgentAuthoringBundle,
  findSugarAgentBeatContract,
  findSugarAgentProfile,
  parseSugarAgentAuthoringBundle,
} from './artifacts';

describe('SugarAgent authoring artifacts (ADR-008)', () => {
  it('returns disabled with no bundle when plugin is not enabled', () => {
    const result = buildSugarAgentAuthoringBundle({
      npcs: [{ id: 'npc.baker', name: 'Baker' }],
      quests: [],
      dialogues: [],
    });

    expect(result.enabled).toBe(false);
    expect(result.bundle).toBeNull();
    expect(result.errors).toEqual([]);
  });

  it('builds a normalized bundle when plugin is enabled and data is valid', () => {
    const result = buildSugarAgentAuthoringBundle({
      meta: { gameId: 'rackwick', name: 'Rackwick' },
      plugins: [{ id: 'sugaragent', enabled: true, globalSafetyBounds: ['no profanity', 'no legal advice'] }],
      npcs: [
        {
          id: 'npc.guard',
          name: 'Guard',
          agentProfile: {
            persona: 'Veteran gate sentry',
            tone: 'firm',
            constraints: ['do not reveal captain identity before beat.gate.reveal'],
            loreScopes: ['city.gate', 'captain.rowan'],
          },
        },
      ],
      dialogues: [{ id: 'dlg.guard.alert.fallback' }],
      quests: [
        {
          id: 'quest.gate.alert',
          stages: [
            {
              id: 'stage.intro',
              objectives: [{ id: 'obj.talk.guard' }],
            },
          ],
          agentBeatContracts: [
            {
              id: 'beat.guard.alert',
              npcId: 'npc.guard',
              objective: 'Explain why the gate is locked and what the passphrase is.',
              requiredFacts: [
                'The gate is under alert lockdown.',
                'Captain Rowan requires Sunforge.',
              ],
              completionRule: 'player_ack',
              fallbackScriptId: 'dlg.guard.alert.fallback',
              stageId: 'stage.intro',
              objectiveId: 'obj.talk.guard',
              maxTurns: 3,
            },
          ],
        },
      ],
    });

    expect(result.enabled).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.bundle).toBeTruthy();
    expect(result.bundle?.policy.globalSafetyBounds).toEqual(['no profanity', 'no legal advice']);
    expect(result.bundle?.profiles.length).toBe(1);
    expect(result.bundle?.profiles[0]?.constraints).toEqual(['do not reveal captain identity before beat.gate.reveal']);
    expect(result.bundle?.beatContracts.length).toBe(1);
    expect(result.bundle?.beatContracts[0]?.questId).toBe('quest.gate.alert');
  });

  it('fails validation for invalid beat contracts when plugin is enabled', () => {
    const result = buildSugarAgentAuthoringBundle({
      plugins: ['sugaragent'],
      npcs: [{ id: 'npc.guard', name: 'Guard' }],
      dialogues: [],
      quests: [
        {
          id: 'quest.bad',
          stages: [{ id: 'stage.one', objectives: [] }],
          agentBeatContracts: [
            {
              id: 'beat.bad',
              npcId: 'npc.guard',
              objective: 'Bad contract',
              requiredFacts: [],
              completionRule: 'player_ack',
            },
          ],
        },
      ],
    });

    expect(result.enabled).toBe(true);
    expect(result.bundle).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((entry) => entry.includes('at least one required fact'))).toBe(true);
  });

  it('emits warning when authoring fields exist but plugin is disabled', () => {
    const result = buildSugarAgentAuthoringBundle({
      npcs: [
        {
          id: 'npc.guard',
          name: 'Guard',
          agentProfile: { persona: 'Watchful guard' },
        },
      ],
      quests: [],
      dialogues: [],
    });

    expect(result.enabled).toBe(false);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('parses and normalizes runtime authoring bundle payloads', () => {
    const parsed = parseSugarAgentAuthoringBundle({
      schemaVersion: 1,
      generatedAt: '2026-03-01T00:00:00.000Z',
      source: { gameId: 'rackwick', name: 'Rackwick' },
      profiles: [
        {
          npcId: 'npc.guard',
          persona: 'Guard',
          tone: 'firm',
          constraints: ['do not reveal gate key', 'do not reveal gate key'],
          loreScopes: ['city.gate'],
        },
        {
          npcId: 'npc.guard',
          persona: 'Newest',
          tone: 'steady',
          constraints: [],
          loreScopes: [],
        },
      ],
      beatContracts: [
        {
          id: 'beat.guard.alert',
          questId: 'quest.gate.alert',
          npcId: 'npc.guard',
          objective: 'Explain alert status.',
          requiredFacts: ['Gate alert active.'],
          forbiddenFacts: [],
          completionRule: 'player_ack',
          maxTurns: 2,
        },
      ],
    });

    expect(parsed).toBeTruthy();
    expect(parsed?.profiles.length).toBe(1);
    expect(parsed?.profiles[0]?.persona).toBe('Newest');
    expect(parsed?.profiles[0]?.constraints).toEqual([]);
    expect(parsed?.beatContracts.length).toBe(1);
  });

  it('resolves profile and beat contract lookup from parsed bundle', () => {
    const bundle = parseSugarAgentAuthoringBundle({
      schemaVersion: 1,
      generatedAt: '2026-03-01T00:00:00.000Z',
      source: {},
      profiles: [
        {
          npcId: 'npc.baker',
          persona: 'Warm baker',
          tone: 'friendly',
          constraints: ['no insults'],
          loreScopes: [],
        },
      ],
      beatContracts: [
        {
          id: 'beat.baker.greeting',
          questId: 'quest.baker.intro',
          npcId: 'npc.baker',
          objective: 'Welcome the player.',
          requiredFacts: ['Baker welcomes the player.'],
          forbiddenFacts: [],
          completionRule: 'player_ack',
        },
      ],
    });

    expect(bundle).toBeTruthy();
    const profile = findSugarAgentProfile(bundle, 'npc.baker');
    const beatById = findSugarAgentBeatContract(bundle, { contractId: 'beat.baker.greeting' });
    const beatByNpc = findSugarAgentBeatContract(bundle, { npcId: 'npc.baker' });

    expect(profile?.persona).toBe('Warm baker');
    expect(beatById?.id).toBe('beat.baker.greeting');
    expect(beatByNpc?.id).toBe('beat.baker.greeting');
  });

  it('accepts legacy safetyBounds aliases in profile and policy payloads', () => {
    const parsed = parseSugarAgentAuthoringBundle({
      schemaVersion: 1,
      generatedAt: '2026-03-01T00:00:00.000Z',
      source: {},
      policy: {
        safetyBounds: ['no profanity'],
      },
      profiles: [
        {
          npcId: 'npc.guard',
          persona: 'Guard',
          safetyBounds: ['no spoilers'],
          loreScopes: [],
        },
      ],
      beatContracts: [],
    });

    expect(parsed).toBeTruthy();
    expect(parsed?.policy.globalSafetyBounds).toEqual(['no profanity']);
    expect(parsed?.profiles[0]?.constraints).toEqual(['no spoilers']);
  });
});
