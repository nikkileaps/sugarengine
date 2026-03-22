import { describe, expect, it, vi } from 'vitest';
import { SugarAgentProviderAdapter } from './SugarAgentProviderAdapter';
import { createDefaultNPCInteractionCapabilities } from './interactionCapabilities';

describe('SugarAgentProviderAdapter', () => {
  it('forwards authoritative region name and path into the SugarAgent context', async () => {
    const runAgentTurn = vi.fn().mockResolvedValue({
      utterance: 'Hi there.',
      emotion: 'warm',
      intent: 'conversation',
      actions: [],
      diagnostics: {},
    });
    const pluginManager = { runAgentTurn } as any;
    const adapter = new SugarAgentProviderAdapter(pluginManager, {
      gameId: 'wordlarky',
      getCurrentRegion: () => 'regions.station',
      getCurrentRegionInfo: () => ({ path: 'regions.station', name: 'Station' }),
      getCurrentEpisode: () => 'ep1',
      getNpcInteractionCapabilities: () => ({
        ...createDefaultNPCInteractionCapabilities(),
        chat: { enabled: true },
      }),
      buildQuestSnapshot: () => [],
      serializeFlags: () => ({}),
    });

    await adapter.produceTurn(
      {
        npcId: 'npc.rick',
        npcName: 'Rick Cheese Roll',
        engagementKind: 'chat',
      } as any,
      {
        deliveryContract: {
          detailLevel: 'concise',
          maxKnowledgeClaims: 2,
          maxKnowledgeParts: 2,
        },
      } as any,
      { text: 'hello' } as any,
    );

    expect(runAgentTurn).toHaveBeenCalledTimes(1);
    expect(runAgentTurn.mock.calls[0]?.[0]?.context).toMatchObject({
      gameId: 'wordlarky',
      regionPath: 'regions.station',
      regionName: 'Station',
      episodeId: 'ep1',
      pedagogyContext: {
        deliveryContract: {
          detailLevel: 'concise',
          maxKnowledgeClaims: 2,
          maxKnowledgeParts: 2,
        },
      },
    });
  });

  it('forwards target and support languages even when no other pedagogy constraints are set', async () => {
    const runAgentTurn = vi.fn().mockResolvedValue({
      utterance: 'Hola.',
      emotion: 'warm',
      intent: 'conversation',
      actions: [],
      diagnostics: {},
    });
    const pluginManager = { runAgentTurn } as any;
    const adapter = new SugarAgentProviderAdapter(pluginManager, {
      getCurrentRegion: () => 'regions.station',
      getCurrentEpisode: () => 'ep1',
      getNpcInteractionCapabilities: () => ({
        ...createDefaultNPCInteractionCapabilities(),
        chat: { enabled: true },
      }),
      buildQuestSnapshot: () => [],
      serializeFlags: () => ({}),
    });

    await adapter.produceTurn(
      {
        npcId: 'npc.rick',
        npcName: 'Rick Cheese Roll',
        engagementKind: 'chat',
      } as any,
      {
        targetLanguage: 'es',
        supportLanguage: 'en',
      } as any,
      { text: 'hola' } as any,
    );

    expect(runAgentTurn).toHaveBeenCalledTimes(1);
    expect(runAgentTurn.mock.calls[0]?.[0]?.context?.pedagogyContext).toMatchObject({
      targetLanguage: 'es',
      supportLanguage: 'en',
    });
  });
});
