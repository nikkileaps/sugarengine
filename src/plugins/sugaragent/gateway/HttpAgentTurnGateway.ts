import type {
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthRequest,
  RuntimeHealthStatus,
  SugarAgentRuntimeMode,
} from './types';
import type { AgentTurnGateway } from './types';

interface GatewayHttpResponse {
  ok?: boolean;
  detail?: string;
  runtimeIdentity?: RuntimeHealthStatus['runtimeIdentity'];
  jsonText?: string;
  attempts?: number;
  usedFallback?: boolean;
  fallbackKind?: 'provider_unavailable' | 'validation_fallback' | 'deterministic_runtime';
  validationErrors?: string[];
  diagnostics?: Record<string, unknown>;
  vectors?: number[][];
  error?: string;
}

export interface HttpAgentTurnGatewayOptions {
  baseUrl?: string;
  runtimeMode?: SugarAgentRuntimeMode;
  gameId?: string;
  credentials?: RequestCredentials;
}

let nextGatewayTraceId = 1;

function createGatewayTraceId(): string {
  return `trace_gateway_${nextGatewayTraceId++}_${Date.now()}`;
}

function formatGatewayError(status: number, fallback: string): string {
  if (status === 401) return 'Your hosted play session expired. Sign in again and retry.';
  if (status === 429) return 'The conversation service is busy right now. Please wait a moment and try again.';
  if (status >= 500) return 'The conversation service is unavailable right now. Please try again soon.';
  return fallback;
}

export class HttpAgentTurnGateway implements AgentTurnGateway {
  private readonly baseUrl: string;
  private readonly runtimeMode?: SugarAgentRuntimeMode;
  private readonly gameId?: string;
  private readonly credentials?: RequestCredentials;

  constructor(options: HttpAgentTurnGatewayOptions = {}) {
    this.baseUrl = (options.baseUrl ?? '').trim().replace(/\/+$/, '');
    this.runtimeMode = options.runtimeMode;
    this.gameId = options.gameId;
    this.credentials = options.credentials ?? (this.baseUrl ? 'include' : undefined);
  }

  private urlFor(path: string): string {
    if (!this.baseUrl) return path;
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private async post(
    path: string,
    body: Record<string, unknown>,
    traceId?: string,
  ): Promise<GatewayHttpResponse> {
    const response = await fetch(this.urlFor(path), {
      method: 'POST',
      ...(this.credentials ? { credentials: this.credentials } : {}),
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-Id': traceId ?? createGatewayTraceId(),
      },
      body: JSON.stringify(body),
    });

    const parsed = await response.json().catch(() => ({} as GatewayHttpResponse));
    if (!response.ok) {
      const detail = formatGatewayError(
        response.status,
        parsed?.error || parsed?.detail || `${response.status} ${response.statusText}`,
      );
      throw new Error(detail);
    }
    return parsed as GatewayHttpResponse;
  }

  async health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus> {
    const result = await this.post('/sugaragent/health', {
      request: {
        runtimeMode: request?.runtimeMode ?? this.runtimeMode,
        gameId: request?.gameId ?? this.gameId,
        generation: request?.generation,
      },
    });
    return {
      ok: result.ok === true,
      detail: result.detail,
      runtimeIdentity: result.runtimeIdentity,
    };
  }

  async generateStructured(
    request: RuntimeGenerateStructuredRequest,
  ): Promise<RuntimeGenerateStructuredResponse> {
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
}
