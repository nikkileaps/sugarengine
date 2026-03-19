import type {
  RuntimeHealthRequest,
  RuntimeHealthStatus,
} from './runtime-bridge.js';

export interface JsonGenerationRequest {
  kind?: string;
  prompt: string;
  schemaText?: string;
  maxTokens?: number;
  attempt?: number;
  temperature?: string;
  input?: unknown;
}

export interface ModelLifecycleService {
  loadModel(modelId: string): Promise<void>;
  unloadModel(modelId: string): Promise<void>;
}

export interface RuntimeHealthService {
  health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus>;
}

export interface StructuredGenerationResult {
  jsonText: string;
  rawText?: string;
}

export interface GenerationService<Request = unknown> {
  generateStructured(request: Request): Promise<StructuredGenerationResult>;
}

export interface JsonGenerationService
  extends GenerationService<JsonGenerationRequest>, RuntimeHealthService, ModelLifecycleService {
  name: string;
}

export interface EmbeddingsService {
  embed(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingsRuntimeHealth {
  ok: boolean;
  detail: string;
  modelId: string;
  dimension: number;
  cacheSize: number;
}

export interface EmbeddingsRuntimeService extends EmbeddingsService {
  health(): Promise<EmbeddingsRuntimeHealth>;
}
