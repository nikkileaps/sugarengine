import { describe, expect, it, vi } from 'vitest';

import {
  handleSugarAgentEmbedHttpRequest,
  handleSugarAgentGenerateStructuredHttpRequest,
  handleSugarAgentHealthHttpRequest,
} from './runtime-http.js';

describe('runtime-http handlers', () => {
  it('passes runtime health through the shared HTTP contract', async () => {
    const runtimeServices = {
      async health(request) {
        return {
          ok: true,
          detail: `ready:${request?.gameId ?? 'none'}`,
          runtimeIdentity: {
            packageName: '@nikkileaps/sugaragent-runtime-core',
            version: '0.0.1-test',
          },
        };
      },
    } as any;

    const result = await handleSugarAgentHealthHttpRequest({
      runtimeServices,
      request: {
        runtimeMode: 'llama',
      },
      gameId: 'wordlark',
      sessionId: 'session-1',
    });

    expect(result).toEqual({
      statusCode: 200,
      body: {
        ok: true,
        detail: 'ready:wordlark',
        runtimeIdentity: {
          packageName: '@nikkileaps/sugaragent-runtime-core',
          version: '0.0.1-test',
        },
        sessionId: 'session-1',
      },
    });
  });

  it('adds route-level context overrides before generateStructured', async () => {
    const generateStructured = vi.fn(async () => ({
      jsonText: '{"utterance":"hola"}',
      attempts: 1,
      usedFallback: false,
      validationErrors: [],
      diagnostics: {
        startup: {
          runtime: {
            mode: 'llama',
          },
        },
      },
    }));
    const runtimeServices = {
      generateStructured,
    } as any;

    const result = await handleSugarAgentGenerateStructuredHttpRequest({
      runtimeServices,
      request: {
        npcId: 'npc-1',
        npcName: 'Rick',
        playerMessage: 'hola',
        attempt: 1,
        repair: false,
        context: {
          traceId: 'trace-1',
        },
      },
      gameId: 'wordlark',
      sessionScopeId: 'session-1',
    });

    expect(generateStructured).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        traceId: 'trace-1',
        gameId: 'wordlark',
        sessionScopeId: 'session-1',
      }),
    }));
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      ok: true,
      jsonText: '{"utterance":"hola"}',
    });
  });

  it('returns a stable 400 envelope when generateStructured request is missing', async () => {
    const result = await handleSugarAgentGenerateStructuredHttpRequest({
      runtimeServices: {} as any,
      request: undefined,
    });

    expect(result).toEqual({
      statusCode: 400,
      body: {
        ok: false,
        error: 'missing_request',
      },
    });
  });

  it('passes embed requests through the shared HTTP contract', async () => {
    const runtimeServices = {
      async embed(texts: string[]) {
        return texts.map(() => [1, 0, 0]);
      },
    } as any;

    const result = await handleSugarAgentEmbedHttpRequest({
      runtimeServices,
      texts: ['hello'],
    });

    expect(result).toEqual({
      statusCode: 200,
      body: {
        ok: true,
        vectors: [[1, 0, 0]],
      },
    });
  });
});
