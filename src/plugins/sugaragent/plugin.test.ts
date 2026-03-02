import { describe, expect, it } from 'vitest';
import { PLUGIN_API_VERSION } from '../../engine/plugins';
import { createSugarAgentPlugin } from './plugin';

describe('createSugarAgentPlugin (phase 3)', () => {
  it('exposes valid plugin descriptor metadata', () => {
    const plugin = createSugarAgentPlugin();

    expect(plugin.descriptor).toEqual({
      id: 'sugaragent',
      version: '0.5.0',
      apiVersion: PLUGIN_API_VERSION,
    });
  });

  it('opens agent conversation through plugin resolution', async () => {
    const plugin = createSugarAgentPlugin();
    const result = await plugin.resolveInteraction?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      npcDefaultDialogue: 'dlg.baker.default',
      hasQuestDialogue: false,
      hasBehaviorTree: false,
    });

    expect(result).toEqual({
      type: 'openAgentConversation',
      npcId: 'npc-baker',
      npcName: 'Baker',
    });
  });

  it('produces deterministic agent turns and can recall remembered facts', async () => {
    const plugin = createSugarAgentPlugin();
    const first = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'hello, my name is Nikki and i like coffee',
    });
    expect(first?.utterance.length).toBeGreaterThan(0);

    const recall = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'what do you remember about me?',
    });
    expect(recall?.utterance.toLowerCase()).toContain('player name is nikki');
  });

  it('returns beatEvidence when a beat contract is active', async () => {
    const plugin = createSugarAgentPlugin();
    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-guard',
      npcName: 'Guard',
      playerMessage: 'hello there',
      beatContract: {
        id: 'beat.guard.alert',
        questId: 'quest.guard.alert',
        npcId: 'npc-guard',
        objective: 'Explain gate alert and passphrase.',
        requiredFacts: [
          'The gate is under lockdown.',
          'The passphrase is Sunforge.',
        ],
        completionRule: 'player_ack',
        maxTurns: 2,
      },
      beatTurnCount: 1,
    });

    expect(turn?.beatEvidence?.beatId).toBe('beat.guard.alert');
    expect(turn?.beatEvidence?.uncoveredFacts.length).toBe(0);
  });

  it('persists beat turn continuity across serialize/load and clears session on objective completion', async () => {
    const plugin = createSugarAgentPlugin();
    await plugin.runAgentTurn?.({
      npcId: 'npc-guard',
      npcName: 'Guard',
      playerMessage: 'hello there',
      beatContract: {
        id: 'beat.guard.alert',
        questId: 'quest.guard.alert',
        npcId: 'npc-guard',
        objective: 'Explain gate alert and passphrase.',
        requiredFacts: [
          'The gate is under lockdown.',
          'The passphrase is Sunforge.',
        ],
        completionRule: 'player_ack',
        objectiveId: 'obj.guard.talk',
      },
    });

    const snapshot = plugin.serializeState?.();
    const restored = createSugarAgentPlugin();
    restored.loadState?.(snapshot);

    await restored.runAgentTurn?.({
      npcId: 'npc-guard',
      npcName: 'Guard',
      playerMessage: 'thanks, got it',
      beatContract: {
        id: 'beat.guard.alert',
        questId: 'quest.guard.alert',
        npcId: 'npc-guard',
        objective: 'Explain gate alert and passphrase.',
        requiredFacts: [
          'The gate is under lockdown.',
          'The passphrase is Sunforge.',
        ],
        completionRule: 'player_ack',
        objectiveId: 'obj.guard.talk',
      },
    });

    const beforeClear = restored.serializeState?.() as {
      dialogueSessions?: Record<string, { turnCount?: number }>;
    };
    expect(beforeClear.dialogueSessions?.['npc-guard:beat.guard.alert']?.turnCount).toBe(2);

    restored.onEvent?.({
      type: 'objectiveCompleted',
      questId: 'quest.guard.alert',
      objectiveId: 'obj.guard.talk',
      description: 'Talk to the guard',
    });

    const afterClear = restored.serializeState?.() as {
      dialogueSessions?: Record<string, unknown>;
    };
    expect(afterClear.dialogueSessions?.['npc-guard:beat.guard.alert']).toBeUndefined();
  });

  it('serializes and restores namespaced plugin state safely', () => {
    const plugin = createSugarAgentPlugin();
    plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    plugin.onEvent?.({ type: 'interactionAttempt', npcId: 'npc-baker' });
    plugin.onEvent?.({
      type: 'interactionHandled',
      npcId: 'npc-baker',
      source: 'defaultDialogue',
    });
    plugin.onEvent?.({
      type: 'questCompleted',
      questId: 'quest-bread',
      questName: 'Bread Delivery',
    });

    const snapshot = plugin.serializeState?.() as {
      schemaVersion: number;
      updatedAt: number;
      npcs: Record<string, { episodic: unknown[]; conversationSummaries: unknown[] }>;
    };
    expect(snapshot.schemaVersion).toBe(1);
    expect(typeof snapshot.updatedAt).toBe('number');
    expect(snapshot.npcs['npc-baker']).toBeDefined();
    expect(snapshot.npcs['npc-baker']?.episodic.length).toBeGreaterThan(0);
    expect(snapshot.npcs['npc-baker']?.conversationSummaries.length).toBeGreaterThan(0);

    plugin.loadState?.({
      schemaVersion: 0,
      seenEvents: 9,
    });
    const migrated = plugin.serializeState?.() as {
      schemaVersion: number;
      npcs: Record<string, { conversationSummaries: unknown[] }>;
    };
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.npcs.system?.conversationSummaries.length).toBeGreaterThan(0);

    plugin.loadState?.({
      schemaVersion: 1,
      updatedAt: 123,
      playerModel: { targetLanguage: 'es', estimatedLevel: 'A2', confidence: 0.6 },
      npcs: {
        'npc-baker': {
          relationship: {
            affinity: 4,
            trust: 2,
            respect: 1,
            tension: -1,
            lastUpdated: 123,
          },
          episodic: [],
          semantic: [],
          conversationSummaries: [],
        },
      },
      dialogueSessions: {
        'npc-baker': {
          npcId: 'npc-baker',
          turnCount: 2,
          updatedAt: 123,
        },
      },
    });
    const restored = plugin.serializeState?.() as {
      schemaVersion: number;
      playerModel: { targetLanguage?: string };
      npcs: Record<string, { relationship: { affinity: number } }>;
    };
    expect(restored.schemaVersion).toBe(1);
    expect(restored.playerModel.targetLanguage).toBe('es');
    expect(restored.npcs['npc-baker']?.relationship.affinity).toBe(4);

    // Invalid schema should be ignored and keep previous valid state.
    plugin.loadState?.({ schemaVersion: 999, seenEvents: 1 });
    const afterInvalid = plugin.serializeState?.() as {
      schemaVersion: number;
      playerModel: { targetLanguage?: string };
    };
    expect(afterInvalid.schemaVersion).toBe(1);
    expect(afterInvalid.playerModel.targetLanguage).toBe('es');
  });
});
