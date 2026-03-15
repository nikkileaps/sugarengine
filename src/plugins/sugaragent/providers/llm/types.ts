import type { SugarAgentTurnOutput } from '../../contracts/turn';
import type { PluginAgentTurnDiagnostics } from '../../../../engine/plugins/types';

export interface LLMGenerateRequest {
  npcId: string;
  npcName: string;
  playerMessage: string;
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
    runtimeMode?: 'llama' | 'auto' | 'mock';
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

export interface LLMGenerateResult {
  output: SugarAgentTurnOutput;
  attempts: number;
  usedFallback: boolean;
  fallbackKind?: 'provider_unavailable' | 'validation_fallback' | 'deterministic_runtime';
  validationErrors: string[];
  rawResponses: string[];
  diagnostics?: PluginAgentTurnDiagnostics;
}

export interface LLMHealthStatus {
  ok: boolean;
  detail?: string;
}

export interface LLMProvider {
  readonly name: string;
  health(): Promise<LLMHealthStatus>;
  generateStructured(request: LLMGenerateRequest): Promise<LLMGenerateResult>;
}
