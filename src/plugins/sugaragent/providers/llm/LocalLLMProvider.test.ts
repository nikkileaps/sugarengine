import { describe, expect, it } from 'vitest';
import { LocalLLMProvider } from './LocalLLMProvider';
import { MockLocalRuntimeBridge } from '../../runtime/MockLocalRuntimeBridge';

describe('LocalLLMProvider', () => {
  it('returns validated structured output when runtime responds with valid JSON', async () => {
    const provider = new LocalLLMProvider({
      runtime: new MockLocalRuntimeBridge({ mode: 'valid' }),
    });

    const result = await provider.generateStructured({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'hello there',
    });

    expect(result.usedFallback).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.output.utterance).toContain('hello there');
    expect(result.validationErrors).toEqual([]);
    expect(result.diagnostics?.mode).toBe('character');
    expect(result.diagnostics?.initiative?.action).toBe('player_respond');
  });

  it('retries once when first payload is invalid and then succeeds', async () => {
    const provider = new LocalLLMProvider({
      runtime: new MockLocalRuntimeBridge({ mode: 'invalid-once' }),
    });

    const result = await provider.generateStructured({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'test repair',
    });

    expect(result.usedFallback).toBe(false);
    expect(result.attempts).toBe(2);
    expect(result.validationErrors.some((entry) => entry.includes('invalid JSON'))).toBe(true);
  });

  it('falls back deterministically when all attempts are invalid', async () => {
    const provider = new LocalLLMProvider({
      runtime: new MockLocalRuntimeBridge({ mode: 'invalid-always' }),
      maxAttempts: 2,
    });

    const result = await provider.generateStructured({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'will this fallback',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.output.utterance).toContain('try again');
    expect(result.validationErrors.length).toBeGreaterThan(0);
  });

  it('proxies health status from runtime bridge', async () => {
    const provider = new LocalLLMProvider({
      runtime: new MockLocalRuntimeBridge({ mode: 'valid' }),
    });

    const status = await provider.health();
    expect(status.ok).toBe(true);
    expect(status.detail).toBe('mock-runtime-ready');
  });

  it('falls back when runtime throws during generation attempts', async () => {
    const provider = new LocalLLMProvider({
      runtime: {
        async health() {
          return { ok: true };
        },
        async loadModel() {},
        async generateStructured() {
          throw new Error('runtime unavailable');
        },
        async embed() {
          return [];
        },
        async unloadModel() {},
      },
      maxAttempts: 2,
    });

    const result = await provider.generateStructured({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'hello',
    });

    expect(result.usedFallback).toBe(true);
    expect(result.validationErrors.some((entry) => entry.includes('runtime error'))).toBe(true);
  });

  it('forwards npc profile, global safety bounds, and context to the runtime bridge', async () => {
    let capturedRequest: any = null;
    const provider = new LocalLLMProvider({
      runtime: {
        async health() {
          return { ok: true };
        },
        async loadModel() {},
        async generateStructured(request) {
          capturedRequest = request as unknown as Record<string, unknown>;
          return {
            jsonText: JSON.stringify({
              utterance: 'Acknowledged.',
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
          };
        },
        async embed() {
          return [];
        },
        async unloadModel() {},
      },
    });

    const result = await provider.generateStructured({
      npcId: 'npc-baker',
      npcName: 'Baker',
      playerMessage: 'Hello',
      npcProfile: {
        persona: 'Warm baker',
        tone: 'friendly',
        constraints: ['stay in character'],
        loreScopes: ['history.events.creation_of_rackwick_city'],
        selfEntityId: 'npc.baker',
        selfLoreScopes: ['npc.baker'],
        relatedLoreScopes: ['npc.baker.family'],
      },
      globalSafetyBounds: ['no legal advice'],
      context: {
        gameId: 'wordlark',
        regionPath: 'station',
        episodeId: 's1e1',
      },
    });

    expect(result.usedFallback).toBe(false);
    expect(capturedRequest?.npcProfile).toEqual({
      persona: 'Warm baker',
      tone: 'friendly',
      constraints: ['stay in character'],
      loreScopes: ['history.events.creation_of_rackwick_city'],
      selfEntityId: 'npc.baker',
      selfLoreScopes: ['npc.baker'],
      relatedLoreScopes: ['npc.baker.family'],
    });
    expect(capturedRequest?.globalSafetyBounds).toEqual(['no legal advice']);
    expect(capturedRequest?.context).toEqual({
      gameId: 'wordlark',
      regionPath: 'station',
      episodeId: 's1e1',
    });
  });
});
