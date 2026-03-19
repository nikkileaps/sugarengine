import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { HttpGameApiRuntimeBridge } from './HttpGameApiRuntimeBridge';

describe('HttpGameApiRuntimeBridge', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts health checks to the hosted sugaragent health route with credentialed requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, detail: 'hosted-ready' }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const bridge = new HttpGameApiRuntimeBridge({
      baseUrl: 'https://api.wordlark.example.com',
      runtimeMode: 'llama',
      gameId: 'wordlark',
    });

    const status = await bridge.health();

    expect(status).toEqual({ ok: true, detail: 'hosted-ready' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.wordlark.example.com/sugaragent/health',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    const fetchArgs = fetchMock.mock.calls[0]?.[1];
    expect(typeof fetchArgs?.body).toBe('string');
    expect(String(fetchArgs?.body)).toContain('"runtimeMode":"llama"');
    expect(String(fetchArgs?.body)).toContain('"gameId":"wordlark"');
  });

  it('maps generateStructured onto the hosted domain route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        jsonText: '{"utterance":"hola"}',
        attempts: 1,
        usedFallback: false,
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const bridge = new HttpGameApiRuntimeBridge({
      baseUrl: 'https://api.wordlark.example.com',
    });

    const result = await bridge.generateStructured({
      npcId: 'npc-1',
      npcName: 'Rick',
      playerMessage: 'hola',
      attempt: 1,
      repair: false,
    });

    expect(result.jsonText).toBe('{"utterance":"hola"}');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.wordlark.example.com/sugaragent/generateStructured',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    const fetchArgs = fetchMock.mock.calls[0]?.[1];
    expect(fetchArgs?.headers).toMatchObject({
      'Content-Type': 'application/json',
    });
    expect(String((fetchArgs?.headers as Record<string, string>)['X-Trace-Id'] ?? '')).toMatch(/^trace_bridge_\d+_\d+$/);
  });

  it('forwards the conversation trace id as a hosted request header when present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        jsonText: '{"utterance":"ciao"}',
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const bridge = new HttpGameApiRuntimeBridge({
      baseUrl: 'https://api.wordlark.example.com',
    });

    await bridge.generateStructured({
      npcId: 'npc-1',
      npcName: 'Rick',
      playerMessage: 'ciao',
      attempt: 1,
      repair: false,
      context: {
        traceId: 'trace_session_1',
      },
    });

    const fetchArgs = fetchMock.mock.calls[0]?.[1];
    expect(fetchArgs?.headers).toMatchObject({
      'X-Trace-Id': 'trace_session_1',
    });
  });

  it('maps hosted auth failures to a user-facing session message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      json: async () => ({ error: 'invalid_session' }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const bridge = new HttpGameApiRuntimeBridge({
      baseUrl: 'https://api.wordlark.example.com',
    });

    await expect(() => bridge.generateStructured({
      npcId: 'npc-1',
      npcName: 'Rick',
      playerMessage: 'hola',
      attempt: 1,
      repair: false,
    })).rejects.toThrow('Your hosted play session expired. Sign in again and retry.');
  });

  it('uses the hosted health route to satisfy loadModel readiness semantics', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, detail: 'ready' }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const bridge = new HttpGameApiRuntimeBridge({
      baseUrl: 'https://api.wordlark.example.com',
    });

    await bridge.loadModel('chat-fast');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.wordlark.example.com/sugaragent/health');
  });

  it('treats unloadModel as a no-op because hosted model lifecycle is backend-owned', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;

    const bridge = new HttpGameApiRuntimeBridge({
      baseUrl: 'https://api.wordlark.example.com',
    });

    await bridge.unloadModel('chat-fast');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
