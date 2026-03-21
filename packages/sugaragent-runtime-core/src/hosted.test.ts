import { describe, expect, it } from 'vitest';

import {
  buildHostedSugarAgentSessionKey,
  createHostedSugarAgentRuntimeServices,
} from './hosted.js';
import type {
  EmbeddingsRuntimeService,
  JsonGenerationRequest,
  JsonGenerationService,
} from './services.js';

describe('hosted runtime services', () => {
  it('builds stable hosted session keys with auth session scope', () => {
    expect(buildHostedSugarAgentSessionKey({
      gameId: 'wordlark',
      npcId: 'rick-cheese-roll',
      sessionScopeId: 'session-123',
      runtimeMode: 'mock',
    })).toBe('wordlark__session-123__rick-cheese-roll__mock');
  });

  it('supports generateStructured through the shared hosted runtime factory', async () => {
    const runtimeServices = createHostedSugarAgentRuntimeServices({
      gameId: 'wordlark',
      loreDir: '/tmp/nonexistent-lore-dir',
      runtimeMode: 'mock',
      debugProvider: 'echo',
      useLore: false,
    });

    const response = await runtimeServices.generateStructured({
      npcId: 'rick-cheese-roll',
      npcName: 'Rick Cheese Roll',
      playerMessage: 'Hello there',
      attempt: 1,
      repair: false,
      context: {
        gameId: 'wordlark',
        sessionScopeId: 'session-123',
        runtimeMode: 'mock',
      },
    });

    expect(typeof response.jsonText).toBe('string');
    expect(response.jsonText).toContain('Echo: Hello there');
    expect(response.usedFallback).toBe(false);
    expect(response.attempts).toBe(1);
  });

  it('uses injected generation and embeddings services instead of package-internal natives', async () => {
    const generationService: JsonGenerationService = {
      name: 'injected-generation',
      async health() {
        return { ok: true, detail: 'injected-generation-ready' };
      },
      async loadModel() {},
      async unloadModel() {},
      async generateStructured(_request: JsonGenerationRequest) {
        return {
          jsonText: JSON.stringify({
            parts: [
              {
                kind: 'social',
                text: 'Injected hello.',
              },
            ],
            emotion: 'warm',
            intent: 'conversation',
            proposedIntents: [],
            beatEvidence: {
              coveredFacts: [],
              uncoveredFacts: [],
              completionSignal: 'none',
              confidence: 0,
            },
          }),
        };
      },
    };
    const embeddingsService: EmbeddingsRuntimeService = {
      async health() {
        return {
          ok: true,
          detail: 'injected-embeddings-ready',
          modelId: 'test',
          dimension: 3,
          cacheSize: 0,
        };
      },
      async embed(texts) {
        return texts.map(() => [1, 0, 0]);
      },
    };
    const runtimeServices = createHostedSugarAgentRuntimeServices({
      gameId: 'wordlark',
      loreDir: '/tmp/nonexistent-lore-dir',
      runtimeMode: 'llama',
      useLore: false,
      generationService,
      embeddingsService,
    });

    const health = await runtimeServices.health({
      gameId: 'wordlark',
      runtimeMode: 'llama',
    });
    const embedded = await runtimeServices.embed(['hello there']);
    await runtimeServices.generateStructured({
      npcId: 'rick-cheese-roll',
      npcName: 'Rick Cheese Roll',
      playerMessage: 'What do you know about Earendale?',
      attempt: 1,
      repair: false,
      context: {
        gameId: 'wordlark',
        sessionScopeId: 'session-123',
        runtimeMode: 'llama',
      },
    });

    expect(health.ok).toBe(true);
    expect(health.detail).toContain('injected-embeddings-ready');
    expect(embedded).toEqual([[1, 0, 0]]);
  });

  it('reports missing OpenAI credentials through runtime health before gameplay turns', async () => {
    const previousHostedKey = process.env.GAME_API_SUGARAGENT_OPENAI_API_KEY;
    const previousOpenAiKey = process.env.OPENAI_API_KEY;
    delete process.env.GAME_API_SUGARAGENT_OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const runtimeServices = createHostedSugarAgentRuntimeServices({
        gameId: 'wordlark',
        loreDir: '/tmp/nonexistent-lore-dir',
        generation: {
          provider: 'openai',
          openai: {
            model: 'gpt-5-mini',
            baseUrl: 'https://api.openai.com/v1',
          },
        },
        useLore: false,
        openAiApiKey: null,
      });

      const health = await runtimeServices.health({
        gameId: 'wordlark',
      });

      expect(health.ok).toBe(false);
      expect(health.detail).toContain('OpenAI API key not configured');
    } finally {
      if (typeof previousHostedKey === 'string') {
        process.env.GAME_API_SUGARAGENT_OPENAI_API_KEY = previousHostedKey;
      } else {
        delete process.env.GAME_API_SUGARAGENT_OPENAI_API_KEY;
      }
      if (typeof previousOpenAiKey === 'string') {
        process.env.OPENAI_API_KEY = previousOpenAiKey;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    }
  });
});
