import type {
  LocalRuntimeBridge,
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthStatus,
} from './types';

export type MockRuntimeMode = 'valid' | 'invalid-once' | 'invalid-always';

export interface MockLocalRuntimeBridgeOptions {
  mode?: MockRuntimeMode;
}

function buildValidPayload(request: RuntimeGenerateStructuredRequest): string {
  return JSON.stringify({
    utterance: `I heard you say: "${request.playerMessage}".`,
    emotion: 'warm',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
  });
}

export class MockLocalRuntimeBridge implements LocalRuntimeBridge {
  private calls = 0;
  private loaded = false;
  private readonly mode: MockRuntimeMode;

  constructor(options: MockLocalRuntimeBridgeOptions = {}) {
    this.mode = options.mode ?? 'valid';
  }

  async health(): Promise<RuntimeHealthStatus> {
    return { ok: true, detail: 'mock-runtime-ready' };
  }

  async loadModel(_modelId: string): Promise<void> {
    this.loaded = true;
  }

  async generateStructured(
    request: RuntimeGenerateStructuredRequest,
  ): Promise<RuntimeGenerateStructuredResponse> {
    this.calls += 1;

    if (!this.loaded) {
      throw new Error('Model must be loaded before generateStructured');
    }

    if (this.mode === 'invalid-always') {
      return { jsonText: '{"utterance": ' };
    }

    if (this.mode === 'invalid-once' && this.calls === 1 && !request.repair) {
      return { jsonText: '{"utterance": ' };
    }

    return { jsonText: buildValidPayload(request) };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((_text) => [0, 0, 0]);
  }

  async unloadModel(_modelId: string): Promise<void> {
    this.loaded = false;
  }
}
