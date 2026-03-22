import type {
  HostedSugarAgentRuntimeServices,
} from '../hosted.js';
import type {
  RuntimeGenerateStructuredRequest,
  RuntimeHealthRequest,
  RuntimeHealthStatus,
} from '../runtime-bridge.js';

export interface SugarAgentRuntimeHttpResult<TBody extends Record<string, unknown>> {
  statusCode: number;
  body: TBody;
}

export interface SugarAgentRuntimeHealthHttpBody extends RuntimeHealthStatus {
  sessionId?: string | null;
}

export interface SugarAgentRuntimeGenerateStructuredHttpBody {
  ok: true;
  jsonText: string;
  attempts?: number;
  usedFallback?: boolean;
  fallbackKind?: 'provider_unavailable' | 'validation_fallback' | 'deterministic_runtime';
  validationErrors?: string[];
  diagnostics?: Record<string, unknown>;
}

export interface SugarAgentRuntimeEmbedHttpBody {
  ok: true;
  vectors: number[][];
}

export interface SugarAgentRuntimeHttpErrorBody {
  ok: false;
  error: string;
}

function withOptionalString<T extends Record<string, unknown>>(
  body: T,
  key: string,
  value: unknown,
): T {
  if (typeof value === 'string' && value.length > 0) {
    return {
      ...body,
      [key]: value,
    };
  }
  if (value === null) {
    return {
      ...body,
      [key]: null,
    };
  }
  return body;
}

export async function handleSugarAgentHealthHttpRequest(input: {
  runtimeServices: HostedSugarAgentRuntimeServices;
  request?: RuntimeHealthRequest;
  gameId?: string;
  sessionId?: string | null;
}): Promise<SugarAgentRuntimeHttpResult<SugarAgentRuntimeHealthHttpBody>> {
  const result = await input.runtimeServices.health({
    ...input.request,
    gameId: input.gameId ?? input.request?.gameId,
  });

  return {
    statusCode: 200,
    body: withOptionalString({
      ok: result.ok,
      detail: result.detail,
      runtimeIdentity: result.runtimeIdentity,
    }, 'sessionId', input.sessionId),
  };
}

export async function handleSugarAgentGenerateStructuredHttpRequest(input: {
  runtimeServices: HostedSugarAgentRuntimeServices;
  request?: RuntimeGenerateStructuredRequest;
  gameId?: string;
  sessionScopeId?: string;
}): Promise<
  SugarAgentRuntimeHttpResult<SugarAgentRuntimeGenerateStructuredHttpBody | SugarAgentRuntimeHttpErrorBody>
> {
  if (!input.request) {
    return {
      statusCode: 400,
      body: {
        ok: false,
        error: 'missing_request',
      },
    };
  }

  const request: RuntimeGenerateStructuredRequest = {
    ...input.request,
    context: {
      ...(input.request.context ?? {}),
      ...(input.gameId ? { gameId: input.gameId } : {}),
      ...(input.sessionScopeId ? { sessionScopeId: input.sessionScopeId } : {}),
    },
  };

  const result = await input.runtimeServices.generateStructured(request);
  return {
    statusCode: 200,
    body: {
      ok: true,
      jsonText: result.jsonText,
      attempts: result.attempts,
      usedFallback: result.usedFallback,
      fallbackKind: result.fallbackKind,
      validationErrors: result.validationErrors,
      diagnostics: result.diagnostics,
    },
  };
}

export async function handleSugarAgentEmbedHttpRequest(input: {
  runtimeServices: HostedSugarAgentRuntimeServices;
  texts?: string[];
}): Promise<SugarAgentRuntimeHttpResult<SugarAgentRuntimeEmbedHttpBody>> {
  const vectors = await input.runtimeServices.embed(Array.isArray(input.texts) ? input.texts : []);
  return {
    statusCode: 200,
    body: {
      ok: true,
      vectors,
    },
  };
}
