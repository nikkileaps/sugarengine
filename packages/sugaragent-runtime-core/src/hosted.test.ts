import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildHostedSugarAgentSessionKey,
  createHostedSugarAgentRuntimeServices,
} from './hosted.js';
import type {
  EmbeddingsRuntimeService,
  JsonGenerationRequest,
  JsonGenerationService,
} from './services.js';

const tempLoreDirs = new Set<string>();

function createTempLoreDir(chunks: unknown[]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sugaragent-hosted-lore-'));
  tempLoreDirs.add(tempDir);
  fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify({
    schemaVersion: 2,
    loreArtifactVersion: 'test-artifact',
    toolVersion: 'test',
    source: { commit: 'test-commit' },
  }), 'utf8');
  fs.writeFileSync(path.join(tempDir, 'chunks.json'), JSON.stringify(chunks), 'utf8');
  fs.writeFileSync(path.join(tempDir, 'facts.json'), '[]', 'utf8');
  return tempDir;
}

describe('hosted runtime services', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const dir of tempLoreDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempLoreDirs.clear();
  });

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

  it('supports hosted OpenAI generation through the shared hosted runtime factory', async () => {
    const loreDir = createTempLoreDir([
      {
        chunkId: 'lore.entities.npcs.rick-roll#rick-roll',
        pageId: 'lore.entities.npcs.rick-roll',
        title: 'Rick Roll',
        sectionHeading: 'Overview',
        summary: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station.',
        content: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
        tokens: ['rick', 'roll', 'owns', 'cheese', 'shop', 'loves'],
        canonLevel: 'hard',
        metadata: {
          id: 'lore.entities.npcs.rick-roll',
          title: 'Rick Roll',
          canon_level: 'hard',
          entity_ids: ['npc.rick-roll'],
          location_ids: [],
          faction_ids: [],
          tags: ['rick', 'cheese', 'shop'],
          beat_ids: [],
          fact_ids: [],
        },
      },
    ]);
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        output_text: JSON.stringify({
          parts: [
            {
              kind: 'grounded',
              text: 'I love cheese.',
            },
          ],
          emotion: 'warm',
          intent: 'answer',
          proposedIntents: [],
          beatEvidence: {
            coveredFacts: [],
            uncoveredFacts: [],
            completionSignal: 'none',
            confidence: 0.8,
          },
        }),
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const embeddingsService: EmbeddingsRuntimeService = {
      async health() {
        return {
          ok: true,
          detail: 'test-embeddings-ready',
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
      loreDir,
      generation: {
        provider: 'openai',
        selfHosted: {
          runtimeMode: 'llama',
        },
        openai: {
          model: 'gpt-5-mini',
          baseUrl: 'https://api.openai.com/v1/',
        },
      },
      useLore: true,
      openAiApiKey: 'test-openai-key',
      embeddingsService,
    });

    const response = await runtimeServices.generateStructured({
      npcId: 'rick-cheese-roll',
      npcName: 'Rick Cheese Roll',
      playerMessage: 'Do you like cheese?',
      attempt: 1,
      repair: false,
      npcProfile: {
        selfEntityId: 'npc.rick-roll',
      },
      context: {
        gameId: 'wordlark',
        sessionScopeId: 'session-123',
      },
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    expect(fetchMock.mock.calls[0]).toEqual([
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-openai-key',
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining('"model":"gpt-5-mini"'),
      }),
    ]);
    expect(response.attempts).toBeGreaterThan(0);
    expect(typeof response.jsonText).toBe('string');
    expect(response.jsonText.length).toBeGreaterThan(0);
  });
});
