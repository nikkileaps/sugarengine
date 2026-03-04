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

export interface LocalLLMProviderOptions {
  runtime: LocalRuntimeBridge;
  modelId?: string;
  maxAttempts?: number;
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
  private loaded = false;

  constructor(options: LocalLLMProviderOptions) {
    this.runtime = options.runtime;
    this.modelId = options.modelId ?? 'chat-fast';
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  }

  async health(): Promise<LLMHealthStatus> {
    const status = await this.runtime.health();
    return {
      ok: status.ok,
      detail: status.detail,
    };
  }

  async generateStructured(request: LLMGenerateRequest): Promise<LLMGenerateResult> {
    const validationErrors: string[] = [];
    const rawResponses: string[] = [];

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
          validationErrors,
          rawResponses,
        };
      }
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let runtimeResponse: { jsonText: string };
      try {
        runtimeResponse = await this.runtime.generateStructured({
          npcId: request.npcId,
          npcName: request.npcName,
          playerMessage: request.playerMessage,
          attempt,
          repair: attempt > 1,
          npcProfile: request.npcProfile,
          globalSafetyBounds: request.globalSafetyBounds,
          context: request.context,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        validationErrors.push(`attempt ${attempt}: runtime error: ${message}`);
        continue;
      }

      rawResponses.push(runtimeResponse.jsonText);

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

      return {
        output,
        attempts: attempt,
        usedFallback: false,
        validationErrors,
        rawResponses,
      };
    }

    return {
      output: fallbackOutput(request.playerMessage),
      attempts: this.maxAttempts,
      usedFallback: true,
      validationErrors,
      rawResponses,
    };
  }
}
