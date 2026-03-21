import type {
  LocalRuntimeBridge,
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthRequest,
  RuntimeHealthStatus,
  SugarAgentRuntimeMode,
} from './types';

interface HostedRuntimeResponse {
  ok?: boolean;
  detail?: string;
  jsonText?: string;
  attempts?: number;
  usedFallback?: boolean;
  fallbackKind?: 'provider_unavailable' | 'validation_fallback' | 'deterministic_runtime';
  validationErrors?: string[];
  diagnostics?: Record<string, unknown>;
  vectors?: number[][];
  error?: string;
}

export interface HttpGameApiRuntimeBridgeOptions {
  baseUrl?: string;
  runtimeMode?: SugarAgentRuntimeMode;
  gameId?: string;
  credentials?: RequestCredentials;
}

let nextBridgeTraceId = 1;

function createBridgeTraceId(): string {
  return `trace_bridge_${nextBridgeTraceId++}_${Date.now()}`;
}

function formatHostedBridgeError(status: number, fallback: string): string {
  if (status === 401) return 'Your hosted play session expired. Sign in again and retry.';
  if (status === 429) return 'The hosted conversation service is busy right now. Please wait a moment and try again.';
  if (status >= 500) return 'The hosted conversation service is unavailable right now. Please try again soon.';
  return fallback;
}

/**
 * Hosted browser bridge that talks to the game-api sugaragent routes.
 * It preserves the plugin-facing runtime bridge semantics while switching
 * transport from the local dev op-envelope to domain-routed HTTPS endpoints.
 */
export class HttpGameApiRuntimeBridge implements LocalRuntimeBridge {
  private readonly baseUrl: string;
  private readonly runtimeMode?: SugarAgentRuntimeMode;
  private readonly gameId?: string;
  private readonly credentials: RequestCredentials;

  constructor(options: HttpGameApiRuntimeBridgeOptions = {}) {
    const normalizedBaseUrl = (options.baseUrl ?? '').trim().replace(/\/+$/, '');
    this.baseUrl = normalizedBaseUrl;
    this.runtimeMode = options.runtimeMode;
    this.gameId = options.gameId;
    this.credentials = options.credentials ?? 'include';
  }

  private urlFor(path: string): string {
    if (!this.baseUrl) return path;
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    traceId?: string,
  ): Promise<HostedRuntimeResponse> {
    const response = await fetch(this.urlFor(path), {
      method: 'POST',
      credentials: this.credentials,
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id': traceId ?? createBridgeTraceId(),
      },
      body: JSON.stringify(body),
    });

    const parsed = await response.json().catch(() => ({} as HostedRuntimeResponse));
    if (!response.ok) {
      const detail = formatHostedBridgeError(
        response.status,
        parsed?.error || parsed?.detail || `${response.status} ${response.statusText}`,
      );
      throw new Error(detail);
    }
    return parsed as HostedRuntimeResponse;
  }

  async health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus> {
    const result = await this.post('/sugaragent/health', {
      request: {
        runtimeMode: request?.runtimeMode ?? this.runtimeMode,
        gameId: request?.gameId ?? this.gameId,
        // Hosted generation selection is backend-owned. The browser bridge
        // preserves transport semantics but does not override deploy/runtime config.
      },
    });
    return {
      ok: result.ok === true,
      detail: result.detail,
    };
  }

  async loadModel(_modelId: string): Promise<void> {
    await this.health({
      runtimeMode: this.runtimeMode,
      gameId: this.gameId,
    });
  }

  async generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse> {
    const result = await this.post('/sugaragent/generateStructured', {
      request,
    }, request.context?.traceId);
    return {
      jsonText: typeof result.jsonText === 'string' ? result.jsonText : '{}',
      attempts: Number.isFinite(result.attempts) ? Number(result.attempts) : undefined,
      usedFallback: result.usedFallback === true,
      fallbackKind: result.fallbackKind === 'provider_unavailable'
        || result.fallbackKind === 'validation_fallback'
        || result.fallbackKind === 'deterministic_runtime'
        ? result.fallbackKind
        : undefined,
      validationErrors: Array.isArray(result.validationErrors)
        ? result.validationErrors.filter((entry): entry is string => typeof entry === 'string')
        : undefined,
      diagnostics: (typeof result.diagnostics === 'object' && result.diagnostics !== null)
        ? result.diagnostics
        : undefined,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const result = await this.post('/sugaragent/embed', { texts });
    return Array.isArray(result.vectors) ? result.vectors : [];
  }

  async unloadModel(_modelId: string): Promise<void> {
    // Hosted model lifecycle is backend-owned. The bridge preserves the
    // plugin-facing contract but does not expose a player-facing unload route.
  }
}
