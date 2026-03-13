import type {
  LocalRuntimeBridge,
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthRequest,
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
  validationErrors?: string[];
  diagnostics?: Record<string, unknown>;
  vectors?: number[][];
  error?: string;
}

type TauriInvokeFn = (command: string, args?: Record<string, unknown>) => Promise<RuntimeBridgeResponse>;

export interface TauriLocalRuntimeBridgeOptions {
  runtimeMode?: SugarAgentRuntimeMode;
  gameId?: string;
  commandName?: string;
  /**
   * Optional bridge used when the Tauri command surface is unavailable.
   * Useful in dev when running web preview middleware.
   */
  fallbackBridge?: LocalRuntimeBridge;
  /**
   * Test hook to avoid depending on dynamic import of @tauri-apps/api/core.
   */
  invokeFn?: TauriInvokeFn;
}

function isCommandUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return normalized.includes('command')
    && (
      normalized.includes('not found')
      || normalized.includes('unknown')
      || normalized.includes('not registered')
      || normalized.includes('missing')
      || normalized.includes('unavailable')
    );
}

export class TauriLocalRuntimeBridge implements LocalRuntimeBridge {
  private runtimeMode?: SugarAgentRuntimeMode;
  private gameId?: string;
  private commandName: string;
  private fallbackBridge?: LocalRuntimeBridge;
  private invokeFn?: TauriInvokeFn;

  constructor(options: TauriLocalRuntimeBridgeOptions = {}) {
    this.runtimeMode = options.runtimeMode;
    this.gameId = options.gameId;
    this.commandName = options.commandName ?? 'sugaragent_runtime_bridge';
    this.fallbackBridge = options.fallbackBridge;
    this.invokeFn = options.invokeFn;
  }

  private async resolveInvokeFn(): Promise<TauriInvokeFn> {
    if (this.invokeFn) return this.invokeFn;
    const core = await import('@tauri-apps/api/core');
    const invoke = core.invoke as unknown as TauriInvokeFn;
    this.invokeFn = invoke;
    return invoke;
  }

  private async call(payload: RuntimeBridgeRequest): Promise<RuntimeBridgeResponse> {
    try {
      const invoke = await this.resolveInvokeFn();
      const response = await invoke(this.commandName, { request: payload });
      return response;
    } catch (error) {
      if (this.fallbackBridge && isCommandUnavailableError(error)) {
        return this.callFallback(payload);
      }
      throw error;
    }
  }

  private async callFallback(payload: RuntimeBridgeRequest): Promise<RuntimeBridgeResponse> {
    if (!this.fallbackBridge) {
      throw new Error('Fallback bridge is not configured.');
    }

    switch (payload.op) {
      case 'health': {
        const health = await this.fallbackBridge.health({
          runtimeMode: payload.runtimeMode,
          gameId: payload.gameId,
        });
        return {
          ok: health.ok,
          detail: health.detail,
        };
      }
      case 'loadModel': {
        if (!payload.modelId) {
          throw new Error('Missing modelId for loadModel.');
        }
        await this.fallbackBridge.loadModel(payload.modelId);
        return { ok: true };
      }
      case 'generateStructured': {
        if (!payload.request) {
          throw new Error('Missing request for generateStructured.');
        }
        const generated = await this.fallbackBridge.generateStructured(payload.request);
        return {
          ok: true,
          jsonText: generated.jsonText,
          attempts: generated.attempts,
          usedFallback: generated.usedFallback,
          validationErrors: generated.validationErrors,
          diagnostics: generated.diagnostics,
        };
      }
      case 'embed': {
        const vectors = await this.fallbackBridge.embed(payload.texts ?? []);
        return {
          ok: true,
          vectors,
        };
      }
      case 'unloadModel': {
        if (!payload.modelId) {
          throw new Error('Missing modelId for unloadModel.');
        }
        await this.fallbackBridge.unloadModel(payload.modelId);
        return { ok: true };
      }
      default:
        throw new Error(`Unknown runtime operation: ${(payload as { op?: string }).op ?? 'unknown'}`);
    }
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
    await this.call({
      op: 'loadModel',
      modelId,
    });
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
    await this.call({
      op: 'unloadModel',
      modelId,
    });
  }
}
