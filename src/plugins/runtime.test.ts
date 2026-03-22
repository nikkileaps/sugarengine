import { describe, expect, it } from 'vitest';
import { buildRuntimePluginsFromProject } from './runtime';

describe('buildRuntimePluginsFromProject', () => {
  it('returns no plugins when config has no plugin entries', () => {
    const { plugins } = buildRuntimePluginsFromProject({});
    expect(plugins).toHaveLength(0);
  });

  it('enables SugarAgent from string plugin id', () => {
    const { plugins } = buildRuntimePluginsFromProject({
      plugins: ['sugaragent'],
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.descriptor.id).toBe('sugaragent');
  });

  it('enables SugarAgent from object plugin entry', () => {
    const { plugins } = buildRuntimePluginsFromProject({
      plugins: [{ id: 'sugaragent', enabled: true }],
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.descriptor.id).toBe('sugaragent');
  });

  it('treats object plugin entry as enabled when enabled is omitted', () => {
    const { plugins } = buildRuntimePluginsFromProject({
      plugins: [{ id: 'sugaragent' }],
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.descriptor.id).toBe('sugaragent');
  });

  it('does not enable SugarAgent when explicitly disabled', () => {
    const { plugins } = buildRuntimePluginsFromProject({
      plugins: [{ id: 'sugaragent', enabled: false }],
    });

    expect(plugins).toHaveLength(0);
  });

  it('supports top-level sugaragent.enabled gate', () => {
    const { plugins } = buildRuntimePluginsFromProject({
      sugaragent: { enabled: true },
    });

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.descriptor.id).toBe('sugaragent');
  });

  it('ignores unrelated plugin ids', () => {
    const { plugins } = buildRuntimePluginsFromProject({
      plugins: ['foo', { id: 'bar', enabled: true }],
    });

    expect(plugins).toHaveLength(0);
  });

  it('passes explicit SugarAgent turn-gateway options through the runtime plugin builder', async () => {
    let capturedRequest: unknown;
    const hostedBridge = {
      async health() {
        return { ok: true, detail: 'hosted-ready' };
      },
      async loadModel() {},
      async generateStructured(request: unknown) {
        capturedRequest = request;
        return {
          jsonText: JSON.stringify({
            utterance: 'Hosted hello.',
            emotion: 'warm',
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
          diagnostics: {},
        };
      },
      async embed() {
        return [];
      },
      async unloadModel() {},
    };

    const { plugins } = buildRuntimePluginsFromProject(
      { plugins: ['sugaragent'] },
      {
        sugarAgent: {
          turnGateway: hostedBridge,
        },
      },
    );

    expect(plugins).toHaveLength(1);
    const plugin = plugins[0];
    await plugin?.init({
      getNearbyInteraction: () => null,
      getNearbyInteractable: () => null,
      getNPCInfo: () => undefined,
      getPlayerPosition: () => null,
      getRegionInfo: () => null,
      executeIntent: async () => ({ success: true }),
      emit: () => {},
      subscribe: () => () => {},
    });

    const turn = await plugin?.runAgentTurn?.({
      npcId: 'npc-1',
      npcName: 'Rick',
      playerMessage: 'hello',
      context: {
        traceId: 'trace_session_1',
        interactionPolicy: 'agent-first',
      },
    });

    expect(turn?.utterance).toBe('Hosted hello.');
    expect(capturedRequest).toMatchObject({
      context: {
        traceId: 'trace_session_1',
      },
    });
  });
});
