import type {
  RuntimeGenerateStructuredRequest,
  RuntimeGenerateStructuredResponse,
  RuntimeHealthStatus,
} from './types';
import type { AgentTurnGateway } from './types';

export type MockGatewayMode = 'valid' | 'invalid-once' | 'invalid-always';

export interface MockAgentTurnGatewayOptions {
  mode?: MockGatewayMode;
}

function buildValidPayload(request: RuntimeGenerateStructuredRequest): string {
  return JSON.stringify({
    utterance: `I heard you say: "${request.playerMessage}".`,
    emotion: 'warm',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
  });
}

function buildDiagnostics() {
  return {
    mode: 'character',
    initiative: {
      initiator: 'player',
      action: 'player_respond',
      primaryGoal: 'character_goal',
      expectedPlayerResponseType: 'free_text',
      reason: 'mock-gateway',
      policyBounded: false,
    },
    evidenceBudget: {
      usage: { facts: 0, spans: 0, contextTokens: 0, memoryItems: 0, beatFacts: 0 },
      budget: { facts: 12, spans: 12, contextTokens: 2048, memoryItems: 24, beatFacts: 8 },
      withinBudget: true,
    },
    retrieval: {
      attempted: false,
      candidateCount: 0,
      selectedCount: 0,
      qualityPath: 'not_required',
      qualityReason: 'mock-gateway',
      correctiveAttempted: false,
    },
    validation: {
      decision: 'accept',
      errors: [],
      unsupportedClaims: 0,
      requiresRepair: false,
    },
    pipelineVersion: 'mock',
    timestampMs: Date.now(),
  };
}

export class MockAgentTurnGateway implements AgentTurnGateway {
  private calls = 0;
  private readonly mode: MockGatewayMode;

  constructor(options: MockAgentTurnGatewayOptions = {}) {
    this.mode = options.mode ?? 'valid';
  }

  async health(): Promise<RuntimeHealthStatus> {
    return { ok: true, detail: 'mock-gateway-ready' };
  }

  async generateStructured(
    request: RuntimeGenerateStructuredRequest,
  ): Promise<RuntimeGenerateStructuredResponse> {
    this.calls += 1;

    if (this.mode === 'invalid-always') {
      return { jsonText: '{"utterance": ' };
    }

    if (this.mode === 'invalid-once' && this.calls === 1 && !request.repair) {
      return { jsonText: '{"utterance": ' };
    }

    return {
      jsonText: buildValidPayload(request),
      diagnostics: buildDiagnostics(),
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((_text) => [0, 0, 0]);
  }
}
