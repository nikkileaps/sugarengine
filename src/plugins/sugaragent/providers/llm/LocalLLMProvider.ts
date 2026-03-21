import {
  parseTurnOutput,
  validateTurnOutput,
} from '../../contracts/turn';
import type { SugarAgentTurnOutput } from '../../contracts/turn';
import type {
  LLMGenerateRequest,
  LLMGenerateResult,
  LLMHealthStatus,
  LLMProvider,
} from './types';
import type { LocalRuntimeBridge } from '../../runtime/types';
import type { SugarAgentRuntimeMode } from '../../runtime/types';
import type { RuntimeGenerateStructuredResponse } from '../../runtime/types';
import type { PluginAgentTurnDiagnostics } from '../../../../engine/plugins/types';
import type {
  SugarAgentGenerationConfig,
} from '../../../../../packages/sugaragent-runtime-core/src/runtime/generation-config.js';

export interface LocalLLMProviderOptions {
  runtime: LocalRuntimeBridge;
  modelId?: string;
  maxAttempts?: number;
  defaultRuntimeMode?: SugarAgentRuntimeMode;
  defaultGenerationConfig?: SugarAgentGenerationConfig;
}

function fallbackOutput(playerMessage: string): SugarAgentTurnOutput {
  return {
    utterance: `I heard you say "${playerMessage}". I need a moment, please try again.`,
    emotion: 'neutral',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
  };
}

function parseJson(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

export class LocalLLMProvider implements LLMProvider {
  readonly name = 'local';
  private readonly runtime: LocalRuntimeBridge;
  private readonly modelId: string;
  private readonly maxAttempts: number;
  private readonly defaultRuntimeMode?: SugarAgentRuntimeMode;
  private readonly defaultGenerationConfig?: SugarAgentGenerationConfig;
  private loaded = false;

  constructor(options: LocalLLMProviderOptions) {
    this.runtime = options.runtime;
    this.modelId = options.modelId ?? 'chat-fast';
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 2);
    this.defaultRuntimeMode = options.defaultRuntimeMode;
    this.defaultGenerationConfig = options.defaultGenerationConfig;
  }

  async health(): Promise<LLMHealthStatus> {
    const status = await this.runtime.health({
      runtimeMode: this.defaultRuntimeMode,
      generation: this.defaultGenerationConfig,
    });
    return {
      ok: status.ok,
      detail: status.detail,
    };
  }

  async generateStructured(request: LLMGenerateRequest): Promise<LLMGenerateResult> {
    const logger = (globalThis as { console?: { debug?: (...args: unknown[]) => void } }).console;
    const trimmedMessage = typeof request.playerMessage === 'string'
      ? request.playerMessage.trim()
      : '';
    logger?.debug?.('[sugaragent][llm-provider][start]', {
      provider: this.name,
      runtimeMode: request.context?.runtimeMode ?? this.defaultRuntimeMode ?? 'llama',
      generationProvider: request.generation?.provider ?? this.defaultGenerationConfig?.provider ?? 'selfHosted',
      npcId: request.npcId,
      messageLength: trimmedMessage.length,
      hasProfile: Boolean(request.npcProfile),
      hasSafetyBounds: Array.isArray(request.globalSafetyBounds) && request.globalSafetyBounds.length > 0,
    });

    const validationErrors: string[] = [];
    const rawResponses: string[] = [];
    let latestDiagnostics: PluginAgentTurnDiagnostics | undefined;

    if (!this.loaded) {
      try {
        await this.runtime.loadModel(this.modelId);
        this.loaded = true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        validationErrors.push(`loadModel failed: ${message}`);
        return {
          output: fallbackOutput(request.playerMessage),
          attempts: 0,
          usedFallback: true,
          fallbackKind: 'provider_unavailable',
          validationErrors,
          rawResponses,
          diagnostics: latestDiagnostics,
        };
      }
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let runtimeResponse: RuntimeGenerateStructuredResponse;
      try {
        const runtimeContext: NonNullable<LLMGenerateRequest['context']> = request.context
          ? { ...request.context }
          : {};
        if (!runtimeContext.runtimeMode && this.defaultRuntimeMode) {
          runtimeContext.runtimeMode = this.defaultRuntimeMode;
        }
        runtimeResponse = await this.runtime.generateStructured({
          npcId: request.npcId,
          npcName: request.npcName,
          playerMessage: request.playerMessage,
          attempt,
          repair: attempt > 1,
          generation: request.generation ?? this.defaultGenerationConfig,
          npcProfile: request.npcProfile,
          globalSafetyBounds: request.globalSafetyBounds,
          context: runtimeContext,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        validationErrors.push(`attempt ${attempt}: runtime error: ${message}`);
        continue;
      }

      rawResponses.push(runtimeResponse.jsonText);
      if (runtimeResponse.diagnostics) {
        latestDiagnostics = runtimeResponse.diagnostics as PluginAgentTurnDiagnostics;
      }
      const runtimeValidationErrors = Array.isArray(runtimeResponse.validationErrors)
        ? runtimeResponse.validationErrors
          .filter((entry): entry is string => typeof entry === 'string')
        : [];
      const runtimeAttempts = Number.isFinite(runtimeResponse.attempts)
        ? Math.max(1, Number(runtimeResponse.attempts))
        : attempt;
      const runtimeUsedFallback = runtimeResponse.usedFallback === true;
      const runtimeFallbackKind = runtimeResponse.fallbackKind === 'provider_unavailable'
        || runtimeResponse.fallbackKind === 'validation_fallback'
        || runtimeResponse.fallbackKind === 'deterministic_runtime'
        ? runtimeResponse.fallbackKind
        : undefined;

      let parsed: unknown;
      try {
        parsed = parseJson(runtimeResponse.jsonText);
      } catch {
        validationErrors.push(`attempt ${attempt}: invalid JSON`);
        continue;
      }

      const validation = validateTurnOutput(parsed);
      if (!validation.valid) {
        validationErrors.push(`attempt ${attempt}: ${validation.errors.join('; ')}`);
        continue;
      }

      const output = parseTurnOutput(parsed);
      if (!output) {
        validationErrors.push(`attempt ${attempt}: schema parse returned null`);
        continue;
      }

      if (runtimeUsedFallback && runtimeFallbackKind !== 'deterministic_runtime') {
        const mergedValidationErrors = [
          ...validationErrors,
          ...runtimeValidationErrors,
        ].filter((entry, index, arr) => arr.indexOf(entry) === index);
        return {
          output,
          attempts: runtimeAttempts,
          usedFallback: true,
          fallbackKind: runtimeFallbackKind ?? 'validation_fallback',
          validationErrors: mergedValidationErrors,
          rawResponses,
          diagnostics: latestDiagnostics,
        };
      }

      return {
        output,
        attempts: runtimeAttempts,
        usedFallback: false,
        fallbackKind: runtimeFallbackKind,
        validationErrors: [
          ...validationErrors,
          ...runtimeValidationErrors,
        ].filter((entry, index, arr) => arr.indexOf(entry) === index),
        rawResponses,
        diagnostics: latestDiagnostics,
      };
    }

    return {
      output: fallbackOutput(request.playerMessage),
      attempts: this.maxAttempts,
      usedFallback: true,
      fallbackKind: validationErrors.some((entry) => entry.includes('runtime error') || entry.includes('loadModel failed'))
        ? 'provider_unavailable'
        : 'validation_fallback',
      validationErrors,
      rawResponses,
      diagnostics: latestDiagnostics,
    };
  }
}
