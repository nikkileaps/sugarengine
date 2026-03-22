import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { HttpAgentTurnGateway } from './HttpAgentTurnGateway';

describe('HttpAgentTurnGateway', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts health checks to the hosted sugaragent health route with credentialed requests', async () => {
    const runtimeIdentity = {
      packageName: '@nikkileaps/sugaragent-runtime-core',
      version: '0.0.1-test',
      buildId: 'abc123',
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, detail: 'hosted-ready', runtimeIdentity }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const gateway = new HttpAgentTurnGateway({
      baseUrl: 'https://api.wordlark.example.com',
      runtimeMode: 'llama',
      gameId: 'wordlark',
    });

    const status = await gateway.health();

    expect(status).toEqual({ ok: true, detail: 'hosted-ready', runtimeIdentity });
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

  it('maps generateStructured onto the shared sugaragent route', async () => {
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

    const gateway = new HttpAgentTurnGateway({
      baseUrl: 'https://api.wordlark.example.com',
    });

    const result = await gateway.generateStructured({
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
    expect(String((fetchArgs?.headers as Record<string, string>)['X-Trace-Id'] ?? '')).toMatch(/^trace_gateway_\d+_\d+$/);
  });

  it('forwards the conversation trace id as a request header when present', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        jsonText: '{"utterance":"ciao"}',
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const gateway = new HttpAgentTurnGateway({
      baseUrl: 'https://api.wordlark.example.com',
    });

    await gateway.generateStructured({
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

    const gateway = new HttpAgentTurnGateway({
      baseUrl: 'https://api.wordlark.example.com',
    });

    await expect(() => gateway.generateStructured({
      npcId: 'npc-1',
      npcName: 'Rick',
      playerMessage: 'hola',
      attempt: 1,
      repair: false,
    })).rejects.toThrow('Your hosted play session expired. Sign in again and retry.');
  });

  it('uses the same /sugaragent route contract for local preview without a base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        jsonText: '{"utterance":"hola"}',
      }),
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const gateway = new HttpAgentTurnGateway({
      runtimeMode: 'llama',
      gameId: 'wordlark',
    });

    await gateway.generateStructured({
      npcId: 'npc-1',
      npcName: 'Rick',
      playerMessage: 'hola',
      attempt: 1,
      repair: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/sugaragent/generateStructured',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    const fetchArgs = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(fetchArgs?.credentials).toBeUndefined();
  });
});
