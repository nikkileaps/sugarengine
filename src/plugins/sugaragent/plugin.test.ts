import { describe, expect, it } from 'vitest';
import { PLUGIN_API_VERSION } from '../../engine/plugins';
import { createSugarAgentPlugin } from './plugin';
import { MockLocalRuntimeBridge } from './runtime';

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

  it('returns explicit provider-unavailable output when no runtime bridge is available', async () => {
    const plugin = createSugarAgentPlugin();
    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'hello, my name is Nikki and i like coffee',
    });
    expect(turn?.intent).toBe('abstain');
    expect(turn?.utterance.toLowerCase()).toContain('local language runtime is unavailable');
  });

  it('uses LocalLLMProvider when a runtime bridge is configured', async () => {
    const plugin = createSugarAgentPlugin({
      runtimeBridge: new MockLocalRuntimeBridge({ mode: 'valid' }),
    });
    await plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'what are you doing here?',
    });

    expect(turn?.utterance).toContain('I heard you say');
    expect(turn?.diagnostics?.mode).toBe('character');
    expect(turn?.diagnostics?.modeResolution?.interactionMode).toBe('unknown');
    expect(turn?.diagnostics?.modeTransition?.changed).toBe(false);
    expect(turn?.diagnostics?.validation?.decision).toBe('accept');
    expect(turn?.diagnostics?.validation?.source).toBe('npc_output');
    expect(turn?.diagnostics?.validation?.npcOutputValidated).toBe(true);
    expect(turn?.diagnostics?.validation?.progressionGateEvaluated).toBe(false);
    expect(turn?.diagnostics?.initiative?.expectedPlayerResponseType).toBe('free_text');
    const snapshot = plugin.serializeState?.() as {
      runtime?: {
        provider?: string;
        healthy?: boolean;
        lastOutcome?: string;
        lastTurnDiagnostics?: {
          mode?: string;
        };
      };
    };
    expect(snapshot.runtime?.provider).toBe('local');
    expect(snapshot.runtime?.healthy).toBe(true);
    expect(snapshot.runtime?.lastOutcome).toBe('provider_ok');
    expect(snapshot.runtime?.lastTurnDiagnostics?.mode).toBe('character');
  });

  it('requires a reply-parts contract for grounded turns and converts legacy grounded output to uncertainty', async () => {
    const plugin = createSugarAgentPlugin({
      runtimeBridge: {
        async health() {
          return { ok: true, detail: 'test-runtime-ready' };
        },
        async loadModel() {},
        async generateStructured() {
          return {
            jsonText: JSON.stringify({
              utterance: 'The resort was destroyed last year.',
              emotion: 'neutral',
              intent: 'explain',
              proposedIntents: [],
              citations: [],
            }),
            diagnostics: {},
          };
        },
        async embed() {
          return [];
        },
        async unloadModel() {},
      },
    });
    await plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'what do you know about the resort near here?',
      npcProfile: {
        selfEntityId: 'npc.baker',
        selfLoreScopes: ['lore.npc.baker'],
      },
    });

    expect(turn?.intent).toBe('uncertain');
    expect(turn?.utterance.toLowerCase()).toContain('not sure');
    expect(turn?.utterance.toLowerCase()).not.toContain('local language runtime is unavailable');
    expect(turn?.diagnostics?.validation?.decision).toBe('fallback');
    expect(turn?.diagnostics?.validation?.errors?.join(' | ')).toContain('reply-parts contract missing for grounded turn');
    expect(turn?.diagnostics?.generation?.replyParts).toMatchObject({
      attempted: false,
      success: false,
      failureReason: 'required_but_not_provided_by_runtime',
    });
  });

  it('accepts mixed social and factual turns when the runtime supplies reply-parts validation', async () => {
    const plugin = createSugarAgentPlugin({
      runtimeBridge: {
        async health() {
          return { ok: true, detail: 'test-runtime-ready' };
        },
        async loadModel() {},
        async generateStructured() {
          return {
            jsonText: JSON.stringify({
              utterance: 'Yes! The Wordlark Hollow Resort and Spa is just outside Earendale.',
              emotion: 'warm',
              intent: 'explain',
              proposedIntents: [],
              citations: [
                {
                  sourceId: 'lore.locations.towns.town.earendale#overview',
                  snippet: 'The Wordlark Hollow Resort and Spa is located just outside the town.',
                },
              ],
              beatEvidence: {
                coveredFacts: [],
                uncoveredFacts: [],
                completionSignal: 'none',
                confidence: 0,
              },
            }),
            diagnostics: {
              validation: {
                decision: 'accept',
                errors: [],
                unsupportedClaims: 0,
                requiresRepair: false,
              },
              generation: {
                replyParts: {
                  attempted: true,
                  success: true,
                  partCount: 2,
                  groundedPartCount: 1,
                },
              },
            },
          };
        },
        async embed() {
          return [];
        },
        async unloadModel() {},
      },
    });
    await plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'what do you know about the resort near here?',
    });

    expect(turn?.utterance).toContain('Yes!');
    expect(turn?.utterance).toContain('just outside Earendale');
    expect(turn?.diagnostics?.validation?.decision).toBe('accept');
    expect(turn?.diagnostics?.validation?.errors?.join(' | ') ?? '').not.toContain('reply-parts contract missing');
  });

  it('preserves mixed-initiative decision metadata from provider diagnostics', async () => {
    const plugin = createSugarAgentPlugin({
      runtimeBridge: {
        async health() {
          return { ok: true, detail: 'test-runtime-ready' };
        },
        async loadModel() {},
        async generateStructured() {
          return {
            jsonText: JSON.stringify({
              utterance: 'Could you clarify which part you want first?',
              emotion: 'curious',
              intent: 'question',
              proposedIntents: [],
              citations: [],
              beatEvidence: {
                coveredFacts: [],
                uncoveredFacts: [],
                completionSignal: 'none',
                confidence: 0,
              },
            }),
            diagnostics: {
              mode: 'character',
              initiative: {
                initiator: 'npc',
                action: 'clarify',
                primaryGoal: 'repair_goal',
                secondaryGoals: ['character_goal'],
                expectedPlayerResponseType: 'free_text',
                reason: 'ambiguous-or-low-confidence-intent',
                policyBounded: true,
              },
            },
          };
        },
        async embed() {
          return [];
        },
        async unloadModel() {},
      },
    });
    await plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'can you help?',
    });

    expect(turn?.diagnostics?.initiative).toMatchObject({
      initiator: 'npc',
      action: 'clarify',
      primaryGoal: 'repair_goal',
      secondaryGoals: ['character_goal'],
      expectedPlayerResponseType: 'free_text',
      policyBounded: true,
    });
  });

  it('uses abstain initiative when provider fails and returns provider-unavailable output', async () => {
    const plugin = createSugarAgentPlugin({
      runtimeBridge: {
        async health() {
          return { ok: true, detail: 'test-runtime-ready' };
        },
        async loadModel() {},
        async generateStructured() {
          throw new Error('runtime down');
        },
        async embed() {
          return [];
        },
        async unloadModel() {},
      },
    });
    await plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'hello',
    });

    expect(turn?.diagnostics?.initiative).toMatchObject({
      initiator: 'npc',
      action: 'abstain',
      primaryGoal: 'repair_goal',
      expectedPlayerResponseType: 'free_text',
      policyBounded: true,
    });
    expect(turn?.utterance.toLowerCase()).toContain('local language runtime is unavailable');
  });

  it('does not run grounding against provider fallback output returned by the runtime bridge', async () => {
    const plugin = createSugarAgentPlugin({
      runtimeBridge: {
        async health() {
          return { ok: true, detail: 'test-runtime-ready' };
        },
        async loadModel() {},
        async generateStructured() {
          return {
            jsonText: JSON.stringify({
              utterance: 'I heard you say "hello". I need a moment, please try again.',
              emotion: 'neutral',
              intent: 'conversation',
              proposedIntents: [],
              citations: [],
              beatEvidence: {
                coveredFacts: [],
                uncoveredFacts: [],
                completionSignal: 'none',
                confidence: 0,
              },
            }),
            attempts: 2,
            usedFallback: true,
            validationErrors: ['attempt 1: invalid JSON'],
            diagnostics: {
              validation: {
                decision: 'fallback',
              },
            },
          };
        },
        async embed() {
          return [];
        },
        async unloadModel() {},
      },
    });
    await plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'what do you know about the resort?',
    });

    expect(turn?.utterance.toLowerCase()).toContain('i need a moment');
    expect(turn?.diagnostics?.validation?.decision).toBe('fallback');
    expect(turn?.diagnostics?.validation?.errors?.join(' | ')).not.toContain('grounding repair required');
  });

  it('preserves runtime reply-parts fallback as uncertainty instead of provider-unavailable output', async () => {
    const plugin = createSugarAgentPlugin({
      runtimeBridge: {
        async health() {
          return { ok: true, detail: 'test-runtime-ready' };
        },
        async loadModel() {},
        async generateStructured() {
          return {
            jsonText: JSON.stringify({
              utterance: 'I am not sure yet. I do not want to guess about my own background without records.',
              emotion: 'uncertain',
              intent: 'uncertain',
              proposedIntents: [],
              citations: [],
              beatEvidence: {
                coveredFacts: [],
                uncoveredFacts: [],
                completionSignal: 'none',
                confidence: 0,
              },
            }),
            attempts: 2,
            usedFallback: false,
            validationErrors: ['pipeline-v4 reply-parts validation fallback: self_query_ownership'],
            diagnostics: {
              validation: {
                decision: 'fallback',
                errors: ['pipeline-v4 reply-parts validation fallback: self_query_ownership'],
                unsupportedClaims: 1,
                requiresRepair: true,
              },
              generation: {
                replyParts: {
                  attempted: true,
                  success: false,
                  partCount: 1,
                  groundedPartCount: 0,
                },
              },
            },
          };
        },
        async embed() {
          return [];
        },
        async unloadModel() {},
      },
    });
    await plugin.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const turn = await plugin.runAgentTurn?.({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'who are you?',
    });

    expect(turn?.utterance.toLowerCase()).toContain('do not want to guess');
    expect(turn?.utterance.toLowerCase()).not.toContain('local language runtime is unavailable');
    expect(turn?.diagnostics?.validation?.decision).toBe('fallback');
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
    expect(turn?.beatEvidence?.uncoveredFacts.length).toBeGreaterThan(0);
    expect(turn?.beatEvidence?.completionSignal).toBe('none');
    expect(turn?.utterance).not.toContain('The gate is under lockdown');
    expect(turn?.diagnostics?.mode).toBe('narrative');
    expect(turn?.diagnostics?.modeResolution?.hasBeatContract).toBe(true);
  });

  it('tracks explicit mode transitions from character to narrative when beat context appears', async () => {
    const plugin = createSugarAgentPlugin();
    const baseline = await plugin.runAgentTurn?.({
      npcId: 'npc-guard',
      npcName: 'Guard',
      playerMessage: 'hello',
      context: {
        interactionMode: 'agent',
        interactionPolicy: 'agent-first',
      },
    });
    expect(baseline?.diagnostics?.mode).toBe('character');
    expect(baseline?.diagnostics?.modeTransition?.changed).toBe(false);

    const narrative = await plugin.runAgentTurn?.({
      npcId: 'npc-guard',
      npcName: 'Guard',
      playerMessage: 'tell me what i need to know',
      context: {
        interactionMode: 'agent',
        interactionPolicy: 'agent-first',
      },
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
      },
    });

    expect(narrative?.diagnostics?.mode).toBe('narrative');
    expect(narrative?.diagnostics?.modeTransition?.from).toBe('character');
    expect(narrative?.diagnostics?.modeTransition?.to).toBe('narrative');
    expect(narrative?.diagnostics?.modeTransition?.changed).toBe(true);
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
