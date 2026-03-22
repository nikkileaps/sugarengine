import type { PluginPedagogyContext } from './pedagogy.js';
import type { SugarAgentGenerationConfig } from './runtime/generation-config.js';
import type { RuntimeCoreIdentity } from './runtime/runtime-identity.js';

export type SugarAgentRuntimeMode = 'llama' | 'auto' | 'mock';

export type RuntimeFallbackKind =
  | 'provider_unavailable'
  | 'validation_fallback'
  | 'deterministic_runtime';

export interface RuntimeHealthStatus {
  ok: boolean;
  detail?: string;
  runtimeIdentity?: RuntimeCoreIdentity;
}

export interface RuntimeHealthRequest {
  runtimeMode?: SugarAgentRuntimeMode;
  gameId?: string;
  generation?: SugarAgentGenerationConfig;
}

export interface RuntimeGenerateStructuredRequest {
  npcId: string;
  npcName: string;
  playerMessage: string;
  attempt: number;
  repair: boolean;
  generation?: SugarAgentGenerationConfig;
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
    traceId?: string;
    sessionScopeId?: string;
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
  fallbackKind?: RuntimeFallbackKind;
  validationErrors?: string[];
  diagnostics?: Record<string, unknown>;
}

export interface RuntimeBridge {
  health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus>;
  loadModel(modelId: string): Promise<void>;
  generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse>;
  embed(texts: string[]): Promise<number[][]>;
  unloadModel(modelId: string): Promise<void>;
}

export type LocalRuntimeBridge = RuntimeBridge;
