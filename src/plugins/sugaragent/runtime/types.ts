export type SugarAgentRuntimeMode = 'llama' | 'auto' | 'mock';

export interface RuntimeHealthStatus {
  ok: boolean;
  detail?: string;
}

export interface RuntimeHealthRequest {
  runtimeMode?: SugarAgentRuntimeMode;
  gameId?: string;
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
    regionName?: string;
    episodeId?: string;
    runtimeMode?: SugarAgentRuntimeMode;
    interactionMode?: 'scripted' | 'agent' | 'hybrid';
    interactionPolicy?: 'scripted-first' | 'agent-first' | 'fallback';
    isFirstMeeting?: boolean;
    turnIndexWithNpc?: number;
    topicCoverage?: {
      activeTopic?: string;
      activeTopicNovelty?: number;
      exhaustedTopics?: string[];
      trackedTopicCount?: number;
      exhausted?: boolean;
    };
  };
}

export interface RuntimeGenerateStructuredResponse {
  jsonText: string;
  attempts?: number;
  usedFallback?: boolean;
  fallbackKind?: 'provider_unavailable' | 'validation_fallback' | 'deterministic_runtime';
  validationErrors?: string[];
  diagnostics?: Record<string, unknown>;
}

export interface LocalRuntimeBridge {
  health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus>;
  loadModel(modelId: string): Promise<void>;
  generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse>;
  embed(texts: string[]): Promise<number[][]>;
  unloadModel(modelId: string): Promise<void>;
}
