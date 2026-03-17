import type {
  LocalRuntimeBridge,
  RuntimeHealthRequest,
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthStatus,
  SugarAgentRuntimeMode,
} from './types';

interface RuntimeBridgeRequest {
  op: 'health' | 'loadModel' | 'generateStructured' | 'embed' | 'unloadModel';
  runtimeMode?: SugarAgentRuntimeMode;
  gameId?: string;
  modelId?: string;
  request?: RuntimeGenerateStructuredRequest;
  texts?: string[];
}

interface RuntimeBridgeResponse {
  ok: boolean;
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

export interface HttpLocalRuntimeBridgeOptions {
  endpoint?: string;
  runtimeMode?: SugarAgentRuntimeMode;
  gameId?: string;
}

/**
 * Browser bridge that proxies runtime calls to a local dev endpoint.
 * The endpoint runs in Node (Vite middleware) and can use SugarAgent session runtime.
 */
export class HttpLocalRuntimeBridge implements LocalRuntimeBridge {
  private endpoint: string;
  private runtimeMode?: SugarAgentRuntimeMode;
  private gameId?: string;

  constructor(options: HttpLocalRuntimeBridgeOptions = {}) {
    this.endpoint = options.endpoint ?? '/__sugaragent/runtime';
    this.runtimeMode = options.runtimeMode;
    this.gameId = options.gameId;
  }

  private async call(payload: RuntimeBridgeRequest): Promise<RuntimeBridgeResponse> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const parsed = await response.json().catch(() => ({} as RuntimeBridgeResponse));
    if (!response.ok) {
      const detail = parsed?.error || parsed?.detail || `${response.status} ${response.statusText}`;
      throw new Error(detail);
    }
    return parsed as RuntimeBridgeResponse;
  }

  async health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus> {
    const result = await this.call({
      op: 'health',
      runtimeMode: request?.runtimeMode ?? this.runtimeMode,
      gameId: request?.gameId ?? this.gameId,
    });
    return {
      ok: result.ok === true,
      detail: result.detail,
    };
  }

  async loadModel(modelId: string): Promise<void> {
    await this.call({ op: 'loadModel', modelId });
  }

  async generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse> {
    const result = await this.call({
      op: 'generateStructured',
      request,
    });
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
    const result = await this.call({
      op: 'embed',
      texts,
    });
    return Array.isArray(result.vectors) ? result.vectors : [];
  }

  async unloadModel(modelId: string): Promise<void> {
    await this.call({ op: 'unloadModel', modelId });
  }
}
