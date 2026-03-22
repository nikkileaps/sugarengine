import type { RuntimeFallbackKind } from './runtime-bridge.js';
import type { RuntimeCoreIdentity } from './runtime/runtime-identity.js';

export interface SugarAgentSessionStartup {
  runtime?: {
    mode?: string;
    health?: {
      ok?: boolean;
      detail?: string;
    };
    runtimeIdentity?: RuntimeCoreIdentity;
    generation?: {
      provider?: 'selfHosted' | 'openai';
      model?: string;
      baseUrl?: string;
      runtimeMode?: string;
    };
  };
  session?: {
    id?: string;
    loaded?: boolean;
    pathToFile?: string;
  };
  lore?: {
    loaded?: boolean;
    chunkCount?: number;
    dir?: string;
  };
}

export interface SugarAgentSessionTurnOptions {
  npcName?: string;
  npcProfileOverride?: Record<string, unknown>;
  globalSafetyBoundsOverride?: string[];
  context?: Record<string, unknown>;
  attempt?: number;
  repair?: boolean;
}

export interface SugarAgentSessionTurnResult {
  output: Record<string, unknown>;
  attempts: number;
  usedFallback: boolean;
  fallbackKind?: RuntimeFallbackKind | string;
  validationErrors: string[];
  loreMatches: Array<Record<string, unknown>>;
  routing?: Record<string, unknown>;
  pipeline?: Record<string, unknown>;
  grounding?: Record<string, unknown>;
}

export interface SugarAgentSessionRuntime {
  startup: SugarAgentSessionStartup;
  runTurn(
    playerMessage: string,
    turnOptions?: SugarAgentSessionTurnOptions,
  ): Promise<SugarAgentSessionTurnResult>;
}
