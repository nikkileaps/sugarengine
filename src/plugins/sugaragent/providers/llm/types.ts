import type { SugarAgentTurnOutput } from '../../contracts/turn';

export interface LLMGenerateRequest {
  npcId: string;
  npcName: string;
  playerMessage: string;
}

export interface LLMGenerateResult {
  output: SugarAgentTurnOutput;
  attempts: number;
  usedFallback: boolean;
  validationErrors: string[];
  rawResponses: string[];
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
