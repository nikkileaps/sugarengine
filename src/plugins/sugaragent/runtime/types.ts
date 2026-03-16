import type { PluginPedagogyContext } from '../../../engine/plugins/types';

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
    pedagogyContext?: PluginPedagogyContext;
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
  /**
   * Runs the local chat/generation model for structured turn output.
   *
   * This is the generative path. It is distinct from `embed(texts)`, which is
   * used for semantic similarity in interpretation/retrieval and must not be
   * treated as a truth-selection authority.
   */
  generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse>;
  /**
   * Runs the local embedding model and returns one normalized vector per input text.
   *
   * SugarAgent uses these vectors as advisory semantic signals for query
   * interpretation and retrieval. Embeddings improve "what does this text mean?"
   * and "what lore is semantically close to this text?", but they do not replace
   * evidence governance or factual validation.
   */
  embed(texts: string[]): Promise<number[][]>;
  unloadModel(modelId: string): Promise<void>;
}
