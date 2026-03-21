import type { SugarAgentRuntimeMode } from '../runtime-bridge.js';

export type SugarAgentGenerationProvider = 'selfHosted' | 'openai';

export interface SugarAgentSelfHostedGenerationConfig {
  runtimeMode?: SugarAgentRuntimeMode;
}

export interface SugarAgentOpenAiGenerationConfig {
  model?: string;
  baseUrl?: string;
}

export interface SugarAgentGenerationConfig {
  provider?: SugarAgentGenerationProvider;
  selfHosted?: SugarAgentSelfHostedGenerationConfig;
  openai?: SugarAgentOpenAiGenerationConfig;
}

export interface ResolvedSugarAgentGenerationConfig {
  provider: SugarAgentGenerationProvider;
  selfHosted: {
    runtimeMode: SugarAgentRuntimeMode;
  };
  openai: {
    model: string;
    baseUrl: string;
  };
}

export interface ResolveSugarAgentGenerationConfigInput {
  generation?: SugarAgentGenerationConfig | null;
  legacyRuntimeMode?: unknown;
  fallbackRuntimeMode?: SugarAgentRuntimeMode;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeRuntimeMode(value: unknown, fallback: SugarAgentRuntimeMode): SugarAgentRuntimeMode {
  return value === 'llama' || value === 'auto' || value === 'mock'
    ? value
    : fallback;
}

function normalizeProvider(value: unknown): SugarAgentGenerationProvider | undefined {
  return value === 'selfHosted' || value === 'openai'
    ? value
    : undefined;
}

function normalizeBaseUrl(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.replace(/\/+$/, '') : undefined;
}

export function resolveSugarAgentGenerationConfig(
  input: ResolveSugarAgentGenerationConfigInput = {},
): ResolvedSugarAgentGenerationConfig {
  const fallbackRuntimeMode = normalizeRuntimeMode(input.fallbackRuntimeMode, 'llama');
  const generation = typeof input.generation === 'object' && input.generation !== null
    ? input.generation
    : {};
  const provider = normalizeProvider(generation.provider) ?? 'selfHosted';
  const legacyRuntimeMode = normalizeRuntimeMode(input.legacyRuntimeMode, fallbackRuntimeMode);
  const selfHostedRuntimeMode = normalizeRuntimeMode(
    generation.selfHosted?.runtimeMode,
    legacyRuntimeMode,
  );
  const openAiModel = normalizeOptionalString(generation.openai?.model) ?? 'gpt-5-mini';
  const openAiBaseUrl = normalizeBaseUrl(generation.openai?.baseUrl) ?? 'https://api.openai.com/v1';

  return {
    provider,
    selfHosted: {
      runtimeMode: selfHostedRuntimeMode,
    },
    openai: {
      model: openAiModel,
      baseUrl: openAiBaseUrl,
    },
  };
}

export function serializeResolvedGenerationConfig(
  config: ResolvedSugarAgentGenerationConfig,
): string {
  return JSON.stringify({
    provider: config.provider,
    selfHosted: {
      runtimeMode: config.selfHosted.runtimeMode,
    },
    openai: {
      model: config.openai.model,
      baseUrl: config.openai.baseUrl,
    },
  });
}
