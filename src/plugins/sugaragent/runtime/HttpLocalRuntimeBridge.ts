import type {
  LocalRuntimeBridge,
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthStatus,
} from './types';

interface RuntimeBridgeRequest {
  op: 'health' | 'loadModel' | 'generateStructured' | 'embed' | 'unloadModel';
  modelId?: string;
  request?: RuntimeGenerateStructuredRequest;
  texts?: string[];
}

interface RuntimeBridgeResponse {
  ok: boolean;
  detail?: string;
  jsonText?: string;
  vectors?: number[][];
  error?: string;
}

export interface HttpLocalRuntimeBridgeOptions {
  endpoint?: string;
}

/**
 * Browser bridge that proxies runtime calls to a local dev endpoint.
 * The endpoint runs in Node (Vite middleware) and can use SugarAgent session runtime.
 */
export class HttpLocalRuntimeBridge implements LocalRuntimeBridge {
  private endpoint: string;

  constructor(options: HttpLocalRuntimeBridgeOptions = {}) {
    this.endpoint = options.endpoint ?? '/__sugaragent/runtime';
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

  async health(): Promise<RuntimeHealthStatus> {
    const result = await this.call({ op: 'health' });
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
