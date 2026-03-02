export interface RuntimeHealthStatus {
  ok: boolean;
  detail?: string;
}

export interface RuntimeGenerateStructuredRequest {
  npcId: string;
  npcName: string;
  playerMessage: string;
  attempt: number;
  repair: boolean;
}

export interface RuntimeGenerateStructuredResponse {
  jsonText: string;
}

export interface LocalRuntimeBridge {
  health(): Promise<RuntimeHealthStatus>;
  loadModel(modelId: string): Promise<void>;
  generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse>;
  embed(texts: string[]): Promise<number[][]>;
  unloadModel(modelId: string): Promise<void>;
}
