import type { JsonGenerationService } from '../services.js';
import type { SugarAgentRuntimeMode } from '../runtime-bridge.js';
import {
  createLocalLlamaGenerationService,
  type LocalLlamaGenerationServiceOptions,
} from './local-generation-service.js';
import {
  createOpenAIGenerationService,
} from './openai-generation-service.js';
import type {
  ResolvedSugarAgentGenerationConfig,
  SugarAgentGenerationConfig,
} from './generation-config.js';
import {
  resolveSugarAgentGenerationConfig,
} from './generation-config.js';

export interface ResolveGenerationServiceOptions extends LocalLlamaGenerationServiceOptions {
  generation?: SugarAgentGenerationConfig | null;
  legacyRuntimeMode?: SugarAgentRuntimeMode;
  openAiApiKey?: string | null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveOpenAiApiKey(explicitKey?: string | null): string | null {
  return normalizeOptionalString(explicitKey)
    ?? normalizeOptionalString(process.env.GAME_API_SUGARAGENT_OPENAI_API_KEY)
    ?? normalizeOptionalString(process.env.OPENAI_API_KEY)
    ?? null;
}

export function resolveGenerationServiceWithConfig(
  options: ResolveGenerationServiceOptions = {},
): {
  generation: ResolvedSugarAgentGenerationConfig;
  generationService: JsonGenerationService;
} {
  const generation = resolveSugarAgentGenerationConfig({
    generation: options.generation,
    legacyRuntimeMode: options.legacyRuntimeMode,
    fallbackRuntimeMode: options.legacyRuntimeMode ?? 'llama',
  });

  if (generation.provider === 'openai') {
    return {
      generation,
      generationService: createOpenAIGenerationService({
        apiKey: resolveOpenAiApiKey(options.openAiApiKey),
        model: generation.openai.model,
        baseUrl: generation.openai.baseUrl,
      }),
    };
  }

  return {
    generation,
    generationService: createLocalLlamaGenerationService({
      llamaBin: options.llamaBin,
      modelPath: options.modelPath,
      llamaTimeoutMs: options.llamaTimeoutMs,
      llamaBinArgs: options.llamaBinArgs,
      llamaArgs: options.llamaArgs,
    }),
  };
}
