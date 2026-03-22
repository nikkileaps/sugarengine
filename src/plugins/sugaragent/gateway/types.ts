import type {
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthRequest,
  RuntimeHealthStatus,
  SugarAgentRuntimeMode,
} from '../../../../packages/sugaragent-runtime-core/src';

export interface AgentTurnGateway {
  health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus>;
  generateStructured(
    request: RuntimeGenerateStructuredRequest,
  ): Promise<RuntimeGenerateStructuredResponse>;
  loadModel?(modelId: string): Promise<void>;
  unloadModel?(modelId: string): Promise<void>;
  embed?(texts: string[]): Promise<number[][]>;
}

export type {
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthRequest,
  RuntimeHealthStatus,
  SugarAgentRuntimeMode,
} from '../../../../packages/sugaragent-runtime-core/src';
