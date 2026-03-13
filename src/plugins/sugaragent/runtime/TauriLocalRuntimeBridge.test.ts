import { describe, expect, it, vi } from 'vitest';
import type { LocalRuntimeBridge } from './types';
import { TauriLocalRuntimeBridge } from './TauriLocalRuntimeBridge';

function createFallbackBridge(overrides: Partial<LocalRuntimeBridge> = {}): LocalRuntimeBridge {
  return {
    health: async () => ({ ok: true, detail: 'fallback-ready' }),
    loadModel: async () => {},
    generateStructured: async () => ({
      jsonText: '{"utterance":"fallback","emotion":"neutral","intent":"conversation","proposedIntents":[],"citations":[]}',
      diagnostics: { source: 'fallback' },
    }),
    embed: async () => [[0, 0, 0]],
    unloadModel: async () => {},
    ...overrides,
  };
}

describe('TauriLocalRuntimeBridge', () => {
  it('uses tauri invoke command surface for runtime operations', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ ok: true, detail: 'tauri-ready' })
      .mockResolvedValueOnce({
        ok: true,
        jsonText: '{"utterance":"hello","emotion":"warm","intent":"conversation","proposedIntents":[],"citations":[]}',
        diagnostics: { source: 'tauri' },
      })
      .mockResolvedValueOnce({
        ok: true,
        vectors: [[1, 2, 3]],
      });

    const bridge = new TauriLocalRuntimeBridge({
      runtimeMode: 'llama',
      gameId: 'rackwick',
      invokeFn: invoke,
    });

    const health = await bridge.health();
    expect(health).toEqual({ ok: true, detail: 'tauri-ready' });
    expect(invoke).toHaveBeenCalledWith('sugaragent_runtime_bridge', {
      request: {
        op: 'health',
        runtimeMode: 'llama',
        gameId: 'rackwick',
      },
    });

    const generated = await bridge.generateStructured({
      npcId: 'npc.baker',
      npcName: 'Baker',
      playerMessage: 'hello',
      attempt: 1,
      repair: false,
    });
    expect(generated.jsonText).toContain('"utterance":"hello"');
    expect(generated.diagnostics).toEqual({ source: 'tauri' });

    const vectors = await bridge.embed(['hello world']);
    expect(vectors).toEqual([[1, 2, 3]]);
  });

  it('falls back to provided bridge when tauri command is unavailable', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('Command sugaragent_runtime_bridge not found'));
    const fallbackGenerate = vi.fn().mockResolvedValue({
      jsonText: '{"utterance":"from-fallback","emotion":"neutral","intent":"conversation","proposedIntents":[],"citations":[]}',
      diagnostics: { source: 'fallback' },
    });
    const fallback = createFallbackBridge({
      generateStructured: fallbackGenerate,
    });

    const bridge = new TauriLocalRuntimeBridge({
      invokeFn: invoke,
      fallbackBridge: fallback,
    });

    const health = await bridge.health();
    expect(health.ok).toBe(true);
    expect(health.detail).toBe('fallback-ready');

    const generated = await bridge.generateStructured({
      npcId: 'npc.baker',
      npcName: 'Baker',
      playerMessage: 'hello',
      attempt: 1,
      repair: false,
    });
    expect(generated.jsonText).toContain('from-fallback');
    expect(fallbackGenerate).toHaveBeenCalledTimes(1);
  });

  it('preserves fallback metadata from the bridge response', async () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      jsonText: '{"utterance":"fallback","emotion":"neutral","intent":"conversation","proposedIntents":[],"citations":[]}',
      attempts: 2,
      usedFallback: true,
      validationErrors: ['attempt 1: invalid JSON'],
      diagnostics: { validation: { decision: 'fallback' } },
    });

    const bridge = new TauriLocalRuntimeBridge({
      invokeFn: invoke,
    });

    const generated = await bridge.generateStructured({
      npcId: 'npc.baker',
      npcName: 'Baker',
      playerMessage: 'hello',
      attempt: 1,
      repair: false,
    });

    expect(generated.usedFallback).toBe(true);
    expect(generated.attempts).toBe(2);
    expect(generated.validationErrors).toEqual(['attempt 1: invalid JSON']);
    expect(generated.diagnostics).toEqual({ validation: { decision: 'fallback' } });
  });

  it('does not hide non-command errors behind fallback', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('runtime timeout'));
    const fallback = createFallbackBridge();
    const bridge = new TauriLocalRuntimeBridge({
      invokeFn: invoke,
      fallbackBridge: fallback,
    });

    await expect(bridge.health()).rejects.toThrow('runtime timeout');
  });
});
