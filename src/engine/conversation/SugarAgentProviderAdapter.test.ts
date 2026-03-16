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
      {} as any,
      { text: 'hello' } as any,
    );

    expect(runAgentTurn).toHaveBeenCalledTimes(1);
    expect(runAgentTurn.mock.calls[0]?.[0]?.context).toMatchObject({
      gameId: 'wordlarky',
      regionPath: 'regions.station',
      regionName: 'Station',
      episodeId: 'ep1',
    });
  });
});
