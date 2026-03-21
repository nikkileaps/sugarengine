import type {
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthRequest,
  RuntimeHealthStatus,
  SugarAgentRuntimeMode,
} from './runtime-bridge.js';
import type { SugarAgentSessionRuntime } from './session.js';
import {
  createSugarAgentSession,
} from './session/runtime.js';
import {
  createLocalEmbeddingsService,
} from './runtime/local-embeddings-service.js';
import type {
  EmbeddingsRuntimeService,
  JsonGenerationService,
} from './services.js';
import type {
  SugarAgentGenerationConfig,
} from './runtime/generation-config.js';
import {
  resolveGenerationServiceWithConfig,
} from './runtime/generation-service-resolver.js';

export interface HostedSugarAgentRuntimeServices {
  health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus>;
  loadModel(modelId: string): Promise<void>;
  generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse>;
  embed(texts: string[]): Promise<number[][]>;
  unloadModel(modelId: string): Promise<void>;
}

export interface HostedSugarAgentRuntimeServiceOptions {
  gameId: string;
  loreDir: string;
  runtimeMode?: SugarAgentRuntimeMode;
  debugProvider?: 'echo';
  generation?: SugarAgentGenerationConfig | null;
  useLore?: boolean;
  missingGameLoreBundle?: boolean;
  requireLoreScopeForRetrieval?: boolean;
  llamaBin?: string | null;
  modelPath?: string | null;
  llamaTimeoutMs?: number;
  llamaBinArgs?: string[];
  llamaArgs?: string[];
  openAiApiKey?: string | null;
  generationService?: JsonGenerationService;
  embeddingsService?: EmbeddingsRuntimeService;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function sanitizeSessionKeyPart(value: unknown, fallback: string): string {
  const normalized = normalizeOptionalString(value) ?? fallback;
  return normalized
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback;
}

export function buildHostedSugarAgentSessionKey(input: {
  gameId: string;
  npcId: string;
  sessionScopeId?: string;
  runtimeMode?: SugarAgentRuntimeMode;
}): string {
  return [
    sanitizeSessionKeyPart(input.gameId, 'game'),
    sanitizeSessionKeyPart(input.sessionScopeId, 'anonymous'),
    sanitizeSessionKeyPart(input.npcId, 'npc'),
    sanitizeSessionKeyPart(input.runtimeMode, 'llama'),
  ].join('__');
}

function formatHostedHealthDetail(input: {
  runtimeDetail?: string;
  embeddingDetail?: string;
}): string {
  const parts = [
    normalizeOptionalString(input.runtimeDetail),
    normalizeOptionalString(input.embeddingDetail),
  ].filter((value): value is string => typeof value === 'string');
  return parts.length > 0 ? parts.join('; ') : 'hosted-sugaragent-runtime-ready';
}

export function createHostedSugarAgentRuntimeServices(
  options: HostedSugarAgentRuntimeServiceOptions,
): HostedSugarAgentRuntimeServices {
  const sessionCache = new Map<string, Promise<SugarAgentSessionRuntime>>();
  const resolvedGeneration = resolveGenerationServiceWithConfig({
    generation: options.generation,
    legacyRuntimeMode: options.runtimeMode ?? 'llama',
    llamaBin: options.llamaBin,
    modelPath: options.modelPath,
    llamaTimeoutMs: options.llamaTimeoutMs,
    llamaBinArgs: options.llamaBinArgs,
    llamaArgs: options.llamaArgs,
    openAiApiKey: options.openAiApiKey,
  });
  const defaultRuntimeMode = resolvedGeneration.generation.selfHosted.runtimeMode;
  const embeddingsService = options.embeddingsService ?? createLocalEmbeddingsService();
  const generationService = options.generationService ?? resolvedGeneration.generationService;

  async function getSession(
    input: Pick<RuntimeGenerateStructuredRequest, 'npcId'> & {
      runtimeMode?: SugarAgentRuntimeMode;
      sessionScopeId?: string;
      gameId?: string;
    },
  ): Promise<SugarAgentSessionRuntime> {
    const runtimeMode = input.runtimeMode ?? defaultRuntimeMode;
    const resolvedGameId = normalizeOptionalString(input.gameId) ?? options.gameId;
    const cacheKey = buildHostedSugarAgentSessionKey({
      gameId: resolvedGameId,
      npcId: input.npcId,
      sessionScopeId: input.sessionScopeId,
      runtimeMode,
    });
    const existing = sessionCache.get(cacheKey);
    if (existing) return existing;

    const created = createSugarAgentSession({
      npc: input.npcId,
      debugProvider: options.debugProvider === 'echo' ? 'echo' : undefined,
      runtime: runtimeMode,
      session: cacheKey,
      loreDir: options.loreDir,
      useLore: options.useLore !== false,
      missingGameLoreBundle: options.missingGameLoreBundle === true,
      requireLoreScopeForRetrieval: options.requireLoreScopeForRetrieval === true,
      llamaBin: options.llamaBin ?? null,
      modelPath: options.modelPath ?? null,
      llamaTimeoutMs: options.llamaTimeoutMs,
      llamaBinArgs: options.llamaBinArgs ?? [],
      llamaArgs: options.llamaArgs ?? [],
      generation: resolvedGeneration.generation,
      generationService,
      embeddingsService,
    });
    sessionCache.set(cacheKey, created);
    return created;
  }

  return {
    async health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus> {
      try {
        const session = await getSession({
          npcId: 'health-check',
          gameId: request?.gameId,
          sessionScopeId: 'health',
          runtimeMode: request?.runtimeMode,
        });
        const embeddingHealth = await embeddingsService.health();
        const runtimeOk = session.startup?.runtime?.health?.ok !== false;
        return {
          ok: runtimeOk,
          detail: formatHostedHealthDetail({
            runtimeDetail: session.startup?.runtime?.health?.detail,
            embeddingDetail: embeddingHealth.detail,
          }),
        };
      } catch (error) {
        return {
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async loadModel(_modelId: string): Promise<void> {
      // Hosted model lifecycle stays backend-owned. Health/startup owns readiness.
    },

    async generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse> {
      const session = await getSession({
        npcId: request.npcId,
        gameId: request.context?.gameId,
        sessionScopeId: request.context?.sessionScopeId,
        runtimeMode: request.context?.runtimeMode,
      });
      const result = await session.runTurn(request.playerMessage, {
        npcName: request.npcName,
        npcProfileOverride: request.npcProfile,
        globalSafetyBoundsOverride: request.globalSafetyBounds,
        context: request.context,
        attempt: request.attempt,
        repair: request.repair,
      });
      return {
        jsonText: JSON.stringify(result.output),
        attempts: result.attempts,
        usedFallback: result.usedFallback,
        fallbackKind: result.fallbackKind === 'provider_unavailable'
          || result.fallbackKind === 'validation_fallback'
          || result.fallbackKind === 'deterministic_runtime'
          ? result.fallbackKind
          : undefined,
        validationErrors: Array.isArray(result.validationErrors)
          ? result.validationErrors
          : [],
        diagnostics: {
          startup: session.startup,
          routing: result.routing,
          pipeline: result.pipeline,
          grounding: result.grounding,
        },
      };
    },

    async embed(texts: string[]): Promise<number[][]> {
      return embeddingsService.embed(Array.isArray(texts) ? texts : []);
    },

    async unloadModel(_modelId: string): Promise<void> {
      sessionCache.clear();
    },
  };
}
