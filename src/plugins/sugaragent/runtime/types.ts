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
  npcProfile?: {
    persona?: string;
    tone?: string;
    constraints?: string[];
    loreScopes?: string[];
    selfEntityId?: string;
    selfLoreScopes?: string[];
    relatedLoreScopes?: string[];
  };
  globalSafetyBounds?: string[];
  context?: {
    gameId?: string;
    regionPath?: string;
    episodeId?: string;
  };
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
