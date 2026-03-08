import {
  mergeValidationBoundary,
  PLUGIN_API_VERSION,
} from '../../engine/plugins';
import type {
  EnginePlugin,
  PluginAgentBeatContract,
  PluginAgentBeatEvidence,
  PluginAgentTurnDiagnostics,
  PluginAgentTurnRequest,
  PluginAgentTurnResult,
  PluginEvent,
  InteractionRequest,
} from '../../engine/plugins';
import { LocalLLMProvider } from './providers/llm/LocalLLMProvider';
import type { LLMGenerateResult } from './providers/llm/types';
import type { LocalRuntimeBridge } from './runtime';
import { HttpLocalRuntimeBridge, TauriLocalRuntimeBridge } from './runtime';
import type { SugarAgentAuthoringBundleV1 } from './authoring/artifacts';
import {
  isObjectiveActiveInQuestSnapshot,
  resolveSugarAgentPolicy,
  resolveSugarAgentProfile,
  selectActiveSugarAgentBeatContract,
} from './authoring/runtime-resolution';
import {
  isKnowledgeSeekingQueryType,
  routeIntentToQueryType,
  routeTurnIntent,
} from './session/core/routing';
import {
  evaluateSugarAgentBeatCompletion,
  shouldFallbackToScriptedForBeat,
} from './session/core/beat-runtime';
import {
  createGroundedUncertaintyReply,
} from './session/core/turn-realization';

export interface SugarAgentPluginOptions {
  /**
   * Override plugin id for local experiments.
   * Default keeps save namespace stable as "sugaragent".
   */
  id?: string;
  /**
   * Collects lightweight event counters for phase-0 smoke checks.
   */
  captureEvents?: boolean;
  /**
   * Optional runtime bridge override for local-LLM turn generation.
   * If omitted, browser runtime defaults to HttpLocalRuntimeBridge.
   */
  runtimeBridge?: LocalRuntimeBridge;
  /**
   * Disable provider-backed generation and force deterministic turns.
   */
  disableProvider?: boolean;
  /**
   * Preferred local runtime mode for bridge health/init and turn generation context.
   * Defaults to "llama".
   */
  runtimeMode?: 'llama' | 'auto' | 'mock';
  /**
   * Optional packed authoring bundle resolved outside engine core.
   */
  authoringBundle?: SugarAgentAuthoringBundleV1 | null;
}

export interface SugarAgentPlayerModelV1 {
  targetLanguage?: string;
  estimatedLevel?: string;
  confidence?: number;
}

export interface SugarAgentRelationshipStateV1 {
  affinity: number;
  trust: number;
  respect: number;
  tension: number;
  lastUpdated: number;
}

export interface SugarAgentEpisodicMemoryRecordV1 {
  id: string;
  timestamp: number;
  type: string;
  summary: string;
  salience: number;
  tags?: string[];
}

export interface SugarAgentSemanticBeliefRecordV1 {
  id: string;
  updatedAt: number;
  belief: string;
  confidence: number;
  source?: string;
}

export interface SugarAgentConversationSummaryV1 {
  id: string;
  timestamp: number;
  summary: string;
  salience: number;
}

export interface SugarAgentNPCMemoryStateV1 {
  relationship: SugarAgentRelationshipStateV1;
  episodic: SugarAgentEpisodicMemoryRecordV1[];
  semantic: SugarAgentSemanticBeliefRecordV1[];
  conversationSummaries: SugarAgentConversationSummaryV1[];
}

export interface SugarAgentDialogueSessionStateV1 {
  npcId: string;
  activeBeatId?: string;
  questId?: string;
  objectiveId?: string;
  coveredFacts?: string[];
  uncoveredFacts?: string[];
  lastResolvedMode?: PluginAgentTurnDiagnostics['mode'];
  lastResolvedModeReason?: string;
  turnCount: number;
  updatedAt: number;
}

export interface SugarAgentPluginStateV1 {
  schemaVersion: 1;
  updatedAt: number;
  playerModel: SugarAgentPlayerModelV1;
  npcs: Record<string, SugarAgentNPCMemoryStateV1>;
  dialogueSessions?: Record<string, SugarAgentDialogueSessionStateV1>;
  runtime?: SugarAgentRuntimeStatusV1;
}

export interface SugarAgentRuntimeStatusV1 {
  provider: 'local' | 'deterministic';
  healthy: boolean;
  detail?: string;
  lastOutcome?: 'ready' | 'provider_ok' | 'provider_fallback_validation' | 'provider_error' | 'provider_unavailable';
  lastAttempts?: number;
  lastValidationErrors?: string[];
  lastTurnDiagnostics?: PluginAgentTurnDiagnostics;
  lastUpdated: number;
}

export interface SugarAgentPluginStateV0 {
  schemaVersion: 0;
  seenEvents: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSafeCounter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function toSafeTimestamp(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function toSafeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
}

function enforcePreviewGrounding(
  generated: LLMGenerateResult,
  request: PluginAgentTurnRequest,
): {
  generated: LLMGenerateResult;
  usedGroundingFallback: boolean;
  groundingDebug: {
    stage:
      | 'skipped-provider-fallback'
      | 'skipped-runtime-grounding-not-required'
      | 'trusted-runtime-grounding'
      | 'missing-reply-parts-contract';
    routeIntent: string;
    queryType: string;
    evidenceCount: number;
    decision: 'accept' | 'repair' | 'fallback';
    unsupportedClaims: number;
    requiresRepair: boolean;
  };
} {
  const providerValidation = isRecord(generated.diagnostics?.validation)
    ? generated.diagnostics.validation
    : {};
  const providerGeneration = isRecord(generated.diagnostics?.generation)
    ? generated.diagnostics.generation
    : {};
  const providerReplyParts = isRecord(providerGeneration.replyParts)
    ? providerGeneration.replyParts
    : {};
  const providerValidationDecision = toSafeString(providerValidation.decision);
  if (generated.usedFallback) {
    return {
      generated,
      usedGroundingFallback: false,
      groundingDebug: {
        stage: 'skipped-provider-fallback',
        routeIntent: 'unknown',
        queryType: 'conversation',
        evidenceCount: 0,
        decision: 'fallback',
        unsupportedClaims: 0,
        requiresRepair: false,
      },
    };
  }

  const npcName = request.npcName ?? request.npcId;
  const routing = routeTurnIntent(request.playerMessage, npcName);
  const queryType = routeIntentToQueryType(routing.intent);
  const requiresRuntimeGrounding = isKnowledgeSeekingQueryType(queryType) || routing.intent === 'session_recall';

  if (!requiresRuntimeGrounding) {
    return {
      generated,
      usedGroundingFallback: false,
      groundingDebug: {
        stage: 'skipped-runtime-grounding-not-required',
        routeIntent: routing.intent,
        queryType,
        evidenceCount: Array.isArray(generated.output.citations) ? generated.output.citations.length : 0,
        decision: providerValidationDecision === 'fallback'
          ? 'fallback'
          : providerValidationDecision === 'repair'
            ? 'repair'
            : 'accept',
        unsupportedClaims: typeof providerValidation.unsupportedClaims === 'number'
          ? providerValidation.unsupportedClaims
          : 0,
        requiresRepair: providerValidation.requiresRepair === true,
      },
    };
  }

  if (providerReplyParts.attempted === true || providerValidation.npcOutputValidated === true) {
    return {
      generated,
      usedGroundingFallback: false,
      groundingDebug: {
        stage: 'trusted-runtime-grounding',
        routeIntent: routing.intent,
        queryType,
        evidenceCount: Array.isArray(generated.output.citations) ? generated.output.citations.length : 0,
        decision: providerValidationDecision === 'fallback'
          ? 'fallback'
          : providerValidationDecision === 'repair'
            ? 'repair'
            : 'accept',
        unsupportedClaims: typeof providerValidation.unsupportedClaims === 'number'
          ? providerValidation.unsupportedClaims
          : 0,
        requiresRepair: providerValidation.requiresRepair === true,
      },
    };
  }

  const validationErrors = [
    ...generated.validationErrors,
    'pipeline-v4 reply-parts contract missing for grounded turn',
  ].filter((entry, index, arr) => arr.indexOf(entry) === index);
  const diagnosticsBase = isRecord(generated.diagnostics) ? generated.diagnostics : {};
  const baseGeneration = isRecord(diagnosticsBase.generation) ? diagnosticsBase.generation : {};
  const baseReplyParts = isRecord(baseGeneration.replyParts) ? baseGeneration.replyParts : {};
  const diagnostics: PluginAgentTurnDiagnostics = {
    ...(generated.diagnostics ?? {}),
    validation: {
      ...(isRecord(diagnosticsBase.validation) ? diagnosticsBase.validation : {}),
      decision: 'fallback',
      errors: validationErrors,
      unsupportedClaims: 1,
      requiresRepair: true,
    },
    generation: {
      ...baseGeneration,
      replyParts: {
        ...baseReplyParts,
        attempted: false,
        success: false,
        failureReason: 'required_but_not_provided_by_runtime',
      },
    },
  };

  return {
    generated: {
      ...generated,
      output: createGroundedUncertaintyReply(queryType) as LLMGenerateResult['output'],
      validationErrors,
      diagnostics,
    },
    usedGroundingFallback: true,
    groundingDebug: {
      stage: 'missing-reply-parts-contract',
      routeIntent: routing.intent,
      queryType,
      evidenceCount: Array.isArray(generated.output.citations) ? generated.output.citations.length : 0,
      decision: 'fallback',
      unsupportedClaims: 1,
      requiresRepair: true,
    },
  };
}

function normalizeRuntimeMode(value: unknown): 'llama' | 'auto' | 'mock' {
  if (value === 'auto' || value === 'mock' || value === 'llama') {
    return value;
  }
  return 'llama';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_NPC_KEY = 'system';
const MAX_EPISODIC_PER_NPC = 48;
const MAX_SUMMARIES_PER_NPC = 24;
const MAX_SEMANTIC_PER_NPC = 24;
const MAX_DIALOGUE_SESSIONS = 24;

function createRelationship(now: number): SugarAgentRelationshipStateV1 {
  return {
    affinity: 0,
    trust: 0,
    respect: 0,
    tension: 0,
    lastUpdated: now,
  };
}

function createNpcMemory(now: number): SugarAgentNPCMemoryStateV1 {
  return {
    relationship: createRelationship(now),
    episodic: [],
    semantic: [],
    conversationSummaries: [],
  };
}

function createDefaultState(now: number): SugarAgentPluginStateV1 {
  return {
    schemaVersion: 1,
    updatedAt: now,
    playerModel: {},
    npcs: {},
    dialogueSessions: {},
    runtime: {
      provider: 'deterministic',
      healthy: false,
      detail: 'provider-not-initialized',
      lastOutcome: 'provider_unavailable',
      lastUpdated: now,
    },
  };
}

function ensureNpcMemory(state: SugarAgentPluginStateV1, npcId: string, now: number): SugarAgentNPCMemoryStateV1 {
  if (!state.npcs[npcId]) {
    state.npcs[npcId] = createNpcMemory(now);
  }
  return state.npcs[npcId]!;
}

function ensureDialogueSessions(state: SugarAgentPluginStateV1): Record<string, SugarAgentDialogueSessionStateV1> {
  if (!state.dialogueSessions) {
    state.dialogueSessions = {};
  }
  return state.dialogueSessions;
}

function capByRecent<T extends { timestamp?: number; updatedAt?: number }>(entries: T[], maxItems: number): T[] {
  if (entries.length <= maxItems) return entries;
  return entries
    .slice()
    .sort((a, b) => {
      const aTime = a.timestamp ?? a.updatedAt ?? 0;
      const bTime = b.timestamp ?? b.updatedAt ?? 0;
      return aTime - bTime;
    })
    .slice(-maxItems);
}

function clearDialogueSessions(
  sessions: Record<string, SugarAgentDialogueSessionStateV1>,
  matcher: (session: SugarAgentDialogueSessionStateV1) => boolean,
): void {
  for (const [key, session] of Object.entries(sessions)) {
    if (matcher(session)) {
      delete sessions[key];
    }
  }
}

function pushEpisodic(
  npc: SugarAgentNPCMemoryStateV1,
  type: string,
  summary: string,
  salience: number,
  now: number,
): void {
  npc.episodic.push({
    id: `${type}:${now}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    type,
    summary,
    salience: clamp(salience, 0, 1),
  });
  npc.episodic = capByRecent(npc.episodic, MAX_EPISODIC_PER_NPC);
}

function pushSummary(
  npc: SugarAgentNPCMemoryStateV1,
  summary: string,
  salience: number,
  now: number,
): void {
  npc.conversationSummaries.push({
    id: `summary:${now}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    summary,
    salience: clamp(salience, 0, 1),
  });
  npc.conversationSummaries = capByRecent(npc.conversationSummaries, MAX_SUMMARIES_PER_NPC);
}

function buildProviderUnavailableTurn(npcName?: string): PluginAgentTurnResult {
  const displayName = typeof npcName === 'string' && npcName.trim().length > 0
    ? npcName.trim()
    : 'this NPC';
  return {
    utterance: `I cannot respond right now because the local language runtime is unavailable for ${displayName}. Please try again.`,
    emotion: 'neutral',
    intent: 'abstain',
    citations: [],
  };
}

type RuntimeInteractionModeInput = 'scripted' | 'agent' | 'hybrid' | 'unknown';
type RuntimeInteractionPolicyInput = 'scripted-first' | 'agent-first' | 'fallback' | 'unknown';

interface TurnModeResolution {
  mode: Exclude<PluginAgentTurnDiagnostics['mode'], 'unknown'>;
  reason: string;
  interactionMode: RuntimeInteractionModeInput;
  interactionPolicy: RuntimeInteractionPolicyInput;
  hasBeatContract: boolean;
}

function normalizeInteractionMode(value: unknown): RuntimeInteractionModeInput {
  if (value === 'scripted' || value === 'agent' || value === 'hybrid') return value;
  return 'unknown';
}

function normalizeInteractionPolicy(value: unknown): RuntimeInteractionPolicyInput {
  if (value === 'scripted-first' || value === 'agent-first' || value === 'fallback') return value;
  return 'unknown';
}

function isTauriRuntimeEnvironment(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

function resolveTurnMode(options: {
  interactionMode: unknown;
  interactionPolicy: unknown;
  hasBeatContract: boolean;
}): TurnModeResolution {
  const interactionMode = normalizeInteractionMode(options.interactionMode);
  const interactionPolicy = normalizeInteractionPolicy(options.interactionPolicy);
  const policySuffix = `policy=${interactionPolicy}`;

  if (options.hasBeatContract) {
    if (interactionMode === 'hybrid') {
      return {
        mode: 'hybrid',
        reason: `active-beat+hybrid-mode;${policySuffix}`,
        interactionMode,
        interactionPolicy,
        hasBeatContract: true,
      };
    }
    if (interactionMode === 'agent') {
      return {
        mode: 'narrative',
        reason: `active-beat+agent-mode;${policySuffix}`,
        interactionMode,
        interactionPolicy,
        hasBeatContract: true,
      };
    }
    if (interactionMode === 'scripted') {
      return {
        mode: 'narrative',
        reason: `active-beat-overrides-scripted-mode;${policySuffix}`,
        interactionMode,
        interactionPolicy,
        hasBeatContract: true,
      };
    }
    return {
      mode: 'narrative',
      reason: `active-beat-default-narrative;${policySuffix}`,
      interactionMode,
      interactionPolicy,
      hasBeatContract: true,
    };
  }

  if (interactionMode === 'hybrid') {
    return {
      mode: 'hybrid',
      reason: `hybrid-mode-without-active-beat;${policySuffix}`,
      interactionMode,
      interactionPolicy,
      hasBeatContract: false,
    };
  }
  if (interactionMode === 'agent') {
    return {
      mode: 'character',
      reason: `agent-mode-without-active-beat;${policySuffix}`,
      interactionMode,
      interactionPolicy,
      hasBeatContract: false,
    };
  }
  if (interactionMode === 'scripted') {
    return {
      mode: 'character',
      reason: `scripted-mode-routed-to-agent-turn;${policySuffix}`,
      interactionMode,
      interactionPolicy,
      hasBeatContract: false,
    };
  }
  return {
    mode: 'character',
    reason: `missing-interaction-mode-default-character;${policySuffix}`,
    interactionMode,
    interactionPolicy,
    hasBeatContract: false,
  };
}

function defaultInitiativeForMode(
  mode: PluginAgentTurnDiagnostics['mode'],
): NonNullable<PluginAgentTurnDiagnostics['initiative']> {
  if (mode === 'narrative' || mode === 'hybrid') {
    return {
      initiator: 'player',
      action: 'player_respond',
      primaryGoal: 'beat_goal',
      expectedPlayerResponseType: 'ack',
    };
  }
  return {
    initiator: 'player',
    action: 'player_respond',
    primaryGoal: 'character_goal',
    expectedPlayerResponseType: 'free_text',
  };
}

function normalizeTurnDiagnostics(
  diagnostics: PluginAgentTurnDiagnostics | undefined,
  options: {
    interactionMode?: 'scripted' | 'agent' | 'hybrid';
    interactionPolicy?: 'scripted-first' | 'agent-first' | 'fallback';
    hasBeatContract: boolean;
    previousMode?: PluginAgentTurnDiagnostics['mode'];
    usedFallback: boolean;
    validationErrors: string[];
    timestamp: number;
  },
): PluginAgentTurnDiagnostics {
  const resolved = resolveTurnMode({
    interactionMode: options.interactionMode,
    interactionPolicy: options.interactionPolicy,
    hasBeatContract: options.hasBeatContract,
  });
  const base = diagnostics ?? {};
  const mode = resolved.mode;
  const fallbackDecision = options.usedFallback
    ? 'fallback'
    : options.validationErrors.length > 0
      ? 'repair'
      : 'accept';
  const previousMode = options.previousMode;
  const modeChanged = typeof previousMode === 'string' && previousMode !== mode;
  const transitionReason = typeof previousMode === 'string'
    ? (modeChanged
      ? `mode-transition:${previousMode}->${mode};${resolved.reason}`
      : `mode-stable:${mode}`)
    : `mode-initialized:${mode}`;
  const mergedValidationErrors = [
    ...(Array.isArray(base.validation?.errors) ? base.validation.errors : []),
    ...options.validationErrors,
  ].filter((entry, index, arr) => arr.indexOf(entry) === index);

  const normalized: PluginAgentTurnDiagnostics = {
    ...base,
    mode,
    modeReason: resolved.reason,
    modeResolution: {
      interactionMode: resolved.interactionMode,
      interactionPolicy: resolved.interactionPolicy,
      hasBeatContract: resolved.hasBeatContract,
    },
    modeTransition: {
      from: previousMode,
      to: mode,
      changed: modeChanged,
      reason: transitionReason,
    },
    initiative: base.initiative ?? (options.usedFallback
      ? {
        initiator: 'npc',
        action: 'abstain',
        primaryGoal: 'repair_goal',
        expectedPlayerResponseType: 'free_text',
        reason: 'provider-fallback',
        policyBounded: true,
      }
      : defaultInitiativeForMode(mode)),
    evidenceBudget: base.evidenceBudget ?? {
      usage: {
        facts: 0,
        spans: 0,
        contextTokens: 0,
        memoryItems: 0,
        beatFacts: options.hasBeatContract ? 1 : 0,
      },
      withinBudget: true,
    },
    retrieval: base.retrieval ?? {
      attempted: false,
      candidateCount: 0,
      selectedCount: 0,
      qualityPath: 'not_required',
      qualityReason: 'provider-unavailable',
      correctiveAttempted: false,
    },
    validation: {
      ...mergeValidationBoundary(base.validation, {
        npcOutputValidated: true,
      }),
      decision: base.validation?.decision ?? fallbackDecision,
      errors: mergedValidationErrors,
      unsupportedClaims: base.validation?.unsupportedClaims ?? 0,
      requiresRepair: base.validation?.requiresRepair ?? (options.usedFallback || options.validationErrors.length > 0),
    },
    pipelineVersion: base.pipelineVersion ?? 'phase1-contract-spine',
    timestampMs: options.timestamp,
  };
  return normalized;
}

function normalizeText(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3);
}

function factCoveredByUtterance(utterance: string, fact: string): boolean {
  const utteranceTokens = new Set(tokenize(utterance));
  const factTokens = tokenize(fact);
  if (factTokens.length === 0) return false;

  let matches = 0;
  for (const token of factTokens) {
    if (utteranceTokens.has(token)) {
      matches += 1;
    }
  }
  return matches / factTokens.length >= 0.6;
}

function detectCompletionSignal(
  contract: PluginAgentBeatContract,
  playerMessage: string,
): PluginAgentBeatEvidence['completionSignal'] {
  const normalized = normalizeText(playerMessage);

  switch (contract.completionRule) {
    case 'player_ack':
      return (
        normalized.includes('got it')
        || normalized.includes('understood')
        || normalized.includes('okay')
        || normalized.includes('ok')
        || normalized.includes('thanks')
        || normalized.includes('thank you')
      )
        ? 'player_ack'
        : 'none';
    case 'player_action':
      return (
        normalized.includes('i did it')
        || normalized.includes('done')
        || (typeof contract.completionTarget === 'string' && contract.completionTarget.length > 0 && normalized.includes(normalizeText(contract.completionTarget)))
      )
        ? 'player_action'
        : 'none';
    case 'engine_flag':
      return 'none';
    default:
      return 'none';
  }
}

function buildBeatEvidence({
  contract,
  utterance,
  playerMessage,
  priorCoveredFacts = [],
}: {
  contract: PluginAgentBeatContract;
  utterance: string;
  playerMessage: string;
  priorCoveredFacts?: string[];
}): PluginAgentBeatEvidence {
  const requiredFacts = Array.isArray(contract.requiredFacts)
    ? contract.requiredFacts.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const covered = new Set(
    Array.isArray(priorCoveredFacts)
      ? priorCoveredFacts.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
  );

  for (const fact of requiredFacts) {
    if (factCoveredByUtterance(utterance, fact)) {
      covered.add(fact);
    }
  }

  const coveredFacts = requiredFacts.filter((fact) => covered.has(fact));
  const uncoveredFacts = requiredFacts.filter((fact) => !covered.has(fact));
  const completionSignal = detectCompletionSignal(contract, playerMessage);
  const coverageRatio = requiredFacts.length > 0 ? coveredFacts.length / requiredFacts.length : 1;
  const confidence = clamp(
    0.2 + coverageRatio * 0.65 + (completionSignal !== 'none' ? 0.15 : 0),
    0,
    1,
  );

  return {
    beatId: contract.id,
    coveredFacts,
    uncoveredFacts,
    completionSignal,
    confidence,
  };
}

function enrichTurnWithBeatEvidence({
  turn,
  contract,
  playerMessage,
  priorCoveredFacts = [],
}: {
  turn: PluginAgentTurnResult;
  contract: PluginAgentBeatContract;
  playerMessage: string;
  priorCoveredFacts?: string[];
}): { turn: PluginAgentTurnResult; beatEvidence: PluginAgentBeatEvidence } {
  const beatEvidence = buildBeatEvidence({
    contract,
    utterance: turn.utterance,
    playerMessage,
    priorCoveredFacts,
  });

  return {
    turn: {
      ...turn,
      beatEvidence,
    },
    beatEvidence,
  };
}

function applyRelationshipDelta(
  relationship: SugarAgentRelationshipStateV1,
  delta: Partial<Pick<SugarAgentRelationshipStateV1, 'affinity' | 'trust' | 'respect' | 'tension'>>,
  now: number,
): void {
  relationship.affinity = clamp(relationship.affinity + (delta.affinity ?? 0), -100, 100);
  relationship.trust = clamp(relationship.trust + (delta.trust ?? 0), -100, 100);
  relationship.respect = clamp(relationship.respect + (delta.respect ?? 0), -100, 100);
  relationship.tension = clamp(relationship.tension + (delta.tension ?? 0), -100, 100);
  relationship.lastUpdated = now;
}

function compactState(state: SugarAgentPluginStateV1): void {
  const npcEntries = Object.entries(state.npcs);
  for (const [, npc] of npcEntries) {
    npc.episodic = capByRecent(npc.episodic, MAX_EPISODIC_PER_NPC);
    npc.conversationSummaries = capByRecent(npc.conversationSummaries, MAX_SUMMARIES_PER_NPC);
    npc.semantic = capByRecent(npc.semantic, MAX_SEMANTIC_PER_NPC);
  }

  if (!state.dialogueSessions) return;
  const sessions = Object.entries(state.dialogueSessions)
    .sort((a, b) => (a[1].updatedAt ?? 0) - (b[1].updatedAt ?? 0))
    .slice(-MAX_DIALOGUE_SESSIONS);
  state.dialogueSessions = Object.fromEntries(sessions);
}

function parseRelationship(raw: unknown, now: number): SugarAgentRelationshipStateV1 {
  if (!isRecord(raw)) return createRelationship(now);
  return {
    affinity: clamp(toSafeNumber(raw.affinity), -100, 100),
    trust: clamp(toSafeNumber(raw.trust), -100, 100),
    respect: clamp(toSafeNumber(raw.respect), -100, 100),
    tension: clamp(toSafeNumber(raw.tension), -100, 100),
    lastUpdated: toSafeTimestamp(raw.lastUpdated, now),
  };
}

function parseEpisodic(raw: unknown): SugarAgentEpisodicMemoryRecordV1 | null {
  if (!isRecord(raw)) return null;
  const id = toSafeString(raw.id);
  const type = toSafeString(raw.type);
  const summary = toSafeString(raw.summary);
  if (!id || !type || !summary) return null;
  return {
    id,
    type,
    summary,
    timestamp: toSafeTimestamp(raw.timestamp, 0),
    salience: clamp(toSafeNumber(raw.salience), 0, 1),
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
  };
}

function parseSemantic(raw: unknown): SugarAgentSemanticBeliefRecordV1 | null {
  if (!isRecord(raw)) return null;
  const id = toSafeString(raw.id);
  const belief = toSafeString(raw.belief);
  if (!id || !belief) return null;
  return {
    id,
    belief,
    updatedAt: toSafeTimestamp(raw.updatedAt, 0),
    confidence: clamp(toSafeNumber(raw.confidence, 0.5), 0, 1),
    source: toSafeString(raw.source),
  };
}

function parseSummary(raw: unknown): SugarAgentConversationSummaryV1 | null {
  if (!isRecord(raw)) return null;
  const id = toSafeString(raw.id);
  const summary = toSafeString(raw.summary);
  if (!id || !summary) return null;
  return {
    id,
    summary,
    timestamp: toSafeTimestamp(raw.timestamp, 0),
    salience: clamp(toSafeNumber(raw.salience), 0, 1),
  };
}

function parseConversationMode(raw: unknown): PluginAgentTurnDiagnostics['mode'] | undefined {
  return raw === 'character' || raw === 'narrative' || raw === 'hybrid' || raw === 'unknown'
    ? raw
    : undefined;
}

function parseDialogueSession(raw: unknown): SugarAgentDialogueSessionStateV1 | null {
  if (!isRecord(raw)) return null;
  const npcId = toSafeString(raw.npcId);
  if (!npcId) return null;
  return {
    npcId,
    activeBeatId: toSafeString(raw.activeBeatId),
    questId: toSafeString(raw.questId),
    objectiveId: toSafeString(raw.objectiveId),
    coveredFacts: Array.isArray(raw.coveredFacts)
      ? raw.coveredFacts.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    uncoveredFacts: Array.isArray(raw.uncoveredFacts)
      ? raw.uncoveredFacts.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    lastResolvedMode: parseConversationMode(raw.lastResolvedMode),
    lastResolvedModeReason: toSafeString(raw.lastResolvedModeReason),
    turnCount: toSafeCounter(raw.turnCount),
    updatedAt: toSafeTimestamp(raw.updatedAt, 0),
  };
}

function parseRuntimeStatus(raw: unknown, now: number): SugarAgentRuntimeStatusV1 | null {
  if (!isRecord(raw)) return null;
  const provider = raw.provider === 'local'
    ? 'local'
    : raw.provider === 'deterministic'
      ? 'deterministic'
      : null;
  if (!provider) return null;
  const lastOutcome = raw.lastOutcome === 'ready'
    || raw.lastOutcome === 'provider_ok'
    || raw.lastOutcome === 'provider_fallback_validation'
    || raw.lastOutcome === 'provider_error'
    || raw.lastOutcome === 'provider_unavailable'
    ? raw.lastOutcome
    : undefined;
  return {
    provider,
    healthy: raw.healthy === true,
    detail: toSafeString(raw.detail),
    lastOutcome,
    lastAttempts: typeof raw.lastAttempts === 'number' && Number.isFinite(raw.lastAttempts)
      ? Math.max(0, Math.floor(raw.lastAttempts))
      : undefined,
    lastValidationErrors: Array.isArray(raw.lastValidationErrors)
      ? raw.lastValidationErrors.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    lastTurnDiagnostics: isRecord(raw.lastTurnDiagnostics)
      ? raw.lastTurnDiagnostics as PluginAgentTurnDiagnostics
      : undefined,
    lastUpdated: toSafeTimestamp(raw.lastUpdated, now),
  };
}

function parseStateV1(raw: Record<string, unknown>, now: number): SugarAgentPluginStateV1 {
  const state = createDefaultState(now);
  state.updatedAt = toSafeTimestamp(raw.updatedAt, now);

  if (isRecord(raw.playerModel)) {
    state.playerModel = {
      targetLanguage: toSafeString(raw.playerModel.targetLanguage),
      estimatedLevel: toSafeString(raw.playerModel.estimatedLevel),
      confidence: raw.playerModel.confidence === undefined
        ? undefined
        : clamp(toSafeNumber(raw.playerModel.confidence), 0, 1),
    };
  }

  if (isRecord(raw.npcs)) {
    for (const [npcId, value] of Object.entries(raw.npcs)) {
      if (!isRecord(value)) continue;
      const npcMemory: SugarAgentNPCMemoryStateV1 = {
        relationship: parseRelationship(value.relationship, now),
        episodic: Array.isArray(value.episodic)
          ? value.episodic
            .map(parseEpisodic)
            .filter((entry): entry is SugarAgentEpisodicMemoryRecordV1 => entry !== null)
          : [],
        semantic: Array.isArray(value.semantic)
          ? value.semantic
            .map(parseSemantic)
            .filter((entry): entry is SugarAgentSemanticBeliefRecordV1 => entry !== null)
          : [],
        conversationSummaries: Array.isArray(value.conversationSummaries)
          ? value.conversationSummaries
            .map(parseSummary)
            .filter((entry): entry is SugarAgentConversationSummaryV1 => entry !== null)
          : [],
      };
      state.npcs[npcId] = npcMemory;
    }
  }

  if (isRecord(raw.dialogueSessions)) {
    const sessions: Record<string, SugarAgentDialogueSessionStateV1> = {};
    for (const [sessionId, value] of Object.entries(raw.dialogueSessions)) {
      const parsed = parseDialogueSession(value);
      if (!parsed) continue;
      sessions[sessionId] = parsed;
    }
    state.dialogueSessions = sessions;
  }

  const runtimeStatus = parseRuntimeStatus(raw.runtime, now);
  if (runtimeStatus) {
    state.runtime = runtimeStatus;
  }

  compactState(state);
  return state;
}

function migrateV0ToV1(raw: SugarAgentPluginStateV0, now: number): SugarAgentPluginStateV1 {
  const migrated = createDefaultState(now);
  if (raw.seenEvents > 0) {
    const npc = ensureNpcMemory(migrated, DEFAULT_NPC_KEY, now);
    pushSummary(
      npc,
      `Migrated legacy SugarAgent counters (${raw.seenEvents} historical events).`,
      0.2,
      now,
    );
  }
  return migrated;
}

/**
 * SugarAgent plugin runtime with phase-3 persistence envelope and
 * phase-10A/10B/10C interaction hooks.
 */
export function createSugarAgentPlugin(options: SugarAgentPluginOptions = {}): EnginePlugin {
  const pluginId = options.id ?? 'sugaragent';
  const captureEvents = options.captureEvents ?? true;
  const authoringBundle = options.authoringBundle ?? null;
  const resolvedPolicy = resolveSugarAgentPolicy(
    authoringBundle,
    normalizeRuntimeMode(options.runtimeMode),
  );
  const resolvedRuntimeMode = resolvedPolicy.runtimeMode;
  let state: SugarAgentPluginStateV1 = createDefaultState(Date.now());
  let lastNpcId: string | null = null;
  let localProvider: LocalLLMProvider | null = null;

  const updateRuntimeStatus = (
    patch: Partial<Omit<SugarAgentRuntimeStatusV1, 'provider' | 'healthy'>> & Pick<SugarAgentRuntimeStatusV1, 'provider' | 'healthy'>,
  ): void => {
    const now = Date.now();
    state.runtime = {
      ...(state.runtime ?? {
        provider: 'deterministic',
        healthy: false,
        lastUpdated: now,
      }),
      ...patch,
      lastUpdated: now,
    };
    state.updatedAt = now;
  };

  const recordLastTurnDiagnostics = (diagnostics: PluginAgentTurnDiagnostics): void => {
    const now = Date.now();
    state.runtime = {
      ...(state.runtime ?? {
        provider: localProvider ? 'local' : 'deterministic',
        healthy: localProvider !== null,
        lastUpdated: now,
      }),
      lastTurnDiagnostics: diagnostics,
      lastUpdated: now,
    };
    state.updatedAt = now;
  };

  function resolveRuntimeBridge(): LocalRuntimeBridge | null {
    if (options.disableProvider) return null;
    if (options.runtimeBridge) return options.runtimeBridge;
    if (typeof window !== 'undefined') {
      if (isTauriRuntimeEnvironment()) {
        return new TauriLocalRuntimeBridge({
          runtimeMode: resolvedRuntimeMode,
          // Keep preview/dev parity when native command surface is not available yet.
          fallbackBridge: new HttpLocalRuntimeBridge({
            runtimeMode: resolvedRuntimeMode,
          }),
        });
      }
      return new HttpLocalRuntimeBridge({
        runtimeMode: resolvedRuntimeMode,
      });
    }
    return null;
  }

  const trackEvent = (event: PluginEvent): void => {
    if (!captureEvents) return;
    const now = Date.now();
    state.updatedAt = now;
    const npcId = ((): string => {
      if ('npcId' in event && typeof event.npcId === 'string') {
        lastNpcId = event.npcId;
        return event.npcId;
      }
      return lastNpcId ?? DEFAULT_NPC_KEY;
    })();
    const npc = ensureNpcMemory(state, npcId, now);

    switch (event.type) {
      case 'interactionHandled': {
        applyRelationshipDelta(
          npc.relationship,
          {
            affinity: 1,
            trust: event.source === 'quest' ? 1 : 0.5,
            respect: event.source === 'quest' ? 1 : 0.5,
            tension: -0.25,
          },
          now,
        );
        pushSummary(npc, `Interaction resolved via ${event.source}.`, 0.25, now);
        break;
      }
      case 'dialogueStarted': {
        const sessions = ensureDialogueSessions(state);
        const sessionKey = npcId;
        const existing = sessions[sessionKey];
        sessions[sessionKey] = {
          npcId,
          activeBeatId: existing?.activeBeatId,
          questId: existing?.questId,
          objectiveId: existing?.objectiveId,
          coveredFacts: existing?.coveredFacts ?? [],
          uncoveredFacts: existing?.uncoveredFacts ?? [],
          lastResolvedMode: existing?.lastResolvedMode,
          lastResolvedModeReason: existing?.lastResolvedModeReason,
          turnCount: (existing?.turnCount ?? 0) + 1,
          updatedAt: now,
        };
        pushSummary(npc, 'Conversation started.', 0.2, now);
        break;
      }
      case 'dialogueEnded':
        pushSummary(npc, 'Conversation ended.', 0.2, now);
        break;
      case 'questStarted':
        pushEpisodic(npc, 'questStarted', `Quest started: ${event.questName}`, 0.6, now);
        applyRelationshipDelta(npc.relationship, { respect: 0.5 }, now);
        break;
      case 'questCompleted': {
        pushEpisodic(npc, 'questCompleted', `Quest completed: ${event.questName}`, 0.9, now);
        applyRelationshipDelta(npc.relationship, { affinity: 1.5, trust: 1 }, now);
        const sessions = ensureDialogueSessions(state);
        clearDialogueSessions(
          sessions,
          (session) => session.questId === event.questId,
        );
        break;
      }
      case 'objectiveCompleted':
        if (event.description) {
          pushEpisodic(npc, 'objectiveCompleted', event.description, 0.7, now);
        }
        if (event.objectiveId) {
          const sessions = ensureDialogueSessions(state);
          clearDialogueSessions(
            sessions,
            (session) => session.questId === event.questId && session.objectiveId === event.objectiveId,
          );
        }
        break;
      case 'itemAdded':
      case 'itemPickedUp':
        pushEpisodic(
          npc,
          event.type,
          `Player obtained ${event.quantity}x ${event.itemId}.`,
          0.55,
          now,
        );
        break;
      case 'stateChanged':
        if (event.change.namespace === 'flags') {
          pushEpisodic(
            npc,
            'stateChanged',
            `World flag changed: ${event.change.key}.`,
            0.45,
            now,
          );
        }
        break;
      default:
        break;
    }

    compactState(state);
  };

  const resolveInteraction = (request: InteractionRequest) => {
    return {
      type: 'openAgentConversation',
      npcId: request.npcId,
      npcName: request.npcName,
    } as const;
  };

  const runAgentTurn = async (request: PluginAgentTurnRequest): Promise<PluginAgentTurnResult | null> => {
    const message = request.playerMessage?.trim();
    if (!message) return null;

    const now = Date.now();
    state.updatedAt = now;
    const npc = ensureNpcMemory(state, request.npcId, now);
    const sessions = ensureDialogueSessions(state);
    const activeQuests = Array.isArray(request.context?.questSnapshot)
      ? request.context.questSnapshot
      : [];
    const flagSnapshot = isRecord(request.context?.flagSnapshot)
      ? request.context.flagSnapshot as Record<string, unknown>
      : {};
    const beatContract = selectActiveSugarAgentBeatContract(
      authoringBundle,
      request.npcId,
      activeQuests,
    );
    const beatSessionKey = beatContract ? `${request.npcId}:${beatContract.id}` : request.npcId;
    const beatExistingSession = beatContract ? sessions[beatSessionKey] : undefined;
    const modeSession = beatExistingSession ?? sessions[request.npcId];

    let turn: PluginAgentTurnResult;
    const interactionMode = request.context?.interactionMode;
    const interactionPolicy = request.context?.interactionPolicy;
    const previousMode = modeSession?.lastResolvedMode;
    const nextTurnCount = (modeSession?.turnCount ?? 0) + 1;
    const nextBeatTurnCount = beatContract ? ((beatExistingSession?.turnCount ?? 0) + 1) : undefined;
    const turnBudgetFallback = Boolean(
      beatContract
      && nextBeatTurnCount !== undefined
      && shouldFallbackToScriptedForBeat(beatContract, nextBeatTurnCount),
    );
    const npcProfile = resolveSugarAgentProfile(authoringBundle, request.npcId);
    const runtimeContext = {
      gameId: request.context?.gameId,
      regionPath: request.context?.regionPath,
      episodeId: request.context?.episodeId,
      runtimeMode: resolvedRuntimeMode,
      interactionMode,
      interactionPolicy,
      isFirstMeeting: (modeSession?.turnCount ?? 0) === 0,
      turnIndexWithNpc: nextTurnCount,
      topicCoverage: request.context?.topicCoverage,
    };

    if (turnBudgetFallback && beatContract && nextBeatTurnCount !== undefined) {
      const diagnostics = normalizeTurnDiagnostics(undefined, {
        interactionMode,
        interactionPolicy,
        hasBeatContract: true,
        previousMode,
        usedFallback: true,
        validationErrors: ['turn-budget-exhausted-fallback-routed'],
        timestamp: now,
      });
      diagnostics.validation = mergeValidationBoundary(diagnostics.validation, {
        progressionGateEvaluated: true,
      });
      diagnostics.beatEvaluator = {
        status: 'failed',
        beatId: beatContract.id,
        questId: beatContract.questId,
        objectiveId: beatContract.objectiveId,
        coveragePassed: false,
        rulePassed: false,
        beatIdMatched: false,
        forbiddenPassed: true,
        confidencePassed: false,
        confidence: 0,
        completionSignal: 'none',
        reason: 'turn-budget-exhausted-fallback-routed',
      };
      diagnostics.timestampMs = now;
      recordLastTurnDiagnostics(diagnostics);

      const actions: NonNullable<PluginAgentTurnResult['actions']> = [];
      if (beatContract.fallbackScriptId) {
        actions.push({ type: 'startDialogue', dialogueId: beatContract.fallbackScriptId });
      }
      actions.push({ type: 'closeConversation' });

      turn = {
        utterance: 'Let us continue this through the scripted briefing.',
        emotion: 'neutral',
        intent: 'fallback',
        actions,
        diagnostics,
      };
      sessions[beatSessionKey] = {
        npcId: request.npcId,
        activeBeatId: beatContract.id,
        questId: beatContract.questId,
        objectiveId: beatContract.objectiveId,
        coveredFacts: beatExistingSession?.coveredFacts ?? [],
        uncoveredFacts: beatExistingSession?.uncoveredFacts ?? [],
        lastResolvedMode: turn.diagnostics?.mode,
        lastResolvedModeReason: turn.diagnostics?.modeReason,
        turnCount: nextBeatTurnCount,
        updatedAt: now,
      };
    } else if (localProvider) {
      try {
        const generatedFromProvider = await localProvider.generateStructured({
          npcId: request.npcId,
          npcName: request.npcName ?? 'Friend',
          playerMessage: message,
          npcProfile,
          globalSafetyBounds: resolvedPolicy.globalSafetyBounds,
          context: runtimeContext,
        });
        const {
          generated,
          usedGroundingFallback,
          groundingDebug,
        } = enforcePreviewGrounding(generatedFromProvider, request);
        const usedProviderFallback = generatedFromProvider.usedFallback;
        const usedFallback = usedProviderFallback || usedGroundingFallback;
        const diagnostics = normalizeTurnDiagnostics(generated.diagnostics, {
          interactionMode,
          interactionPolicy,
          hasBeatContract: Boolean(beatContract),
          previousMode,
          usedFallback,
          validationErrors: generated.validationErrors,
          timestamp: now,
        });
        console.debug('[sugaragent][grounding]', {
          npcId: request.npcId,
          stage: groundingDebug.stage,
          routeIntent: groundingDebug.routeIntent,
          queryType: groundingDebug.queryType,
          evidenceCount: groundingDebug.evidenceCount,
          decision: groundingDebug.decision,
          unsupportedClaims: groundingDebug.unsupportedClaims,
          requiresRepair: groundingDebug.requiresRepair,
          fallbackApplied: usedGroundingFallback,
        });
        if (
          diagnostics.validation?.decision === 'fallback'
          || diagnostics.validation?.decision === 'repair'
        ) {
          console.debug('[sugaragent][grounding][detail]', {
            npcId: request.npcId,
            stage: groundingDebug.stage,
            routeIntent: groundingDebug.routeIntent,
            queryType: groundingDebug.queryType,
            providerAttempts: generated.attempts,
            providerUsedFallback: usedProviderFallback,
            pluginAppliedFallback: usedGroundingFallback,
            validationDecision: diagnostics.validation?.decision,
            validationErrors: diagnostics.validation?.errors ?? [],
            unsupportedClaims: diagnostics.validation?.unsupportedClaims ?? 0,
            requiresRepair: diagnostics.validation?.requiresRepair ?? false,
            retrievalAttempted: diagnostics.retrieval?.attempted ?? false,
            retrievalCandidateCount: diagnostics.retrieval?.candidateCount ?? 0,
            retrievalSelectedCount: diagnostics.retrieval?.selectedCount ?? 0,
            retrievalQualityPath: diagnostics.retrieval?.qualityPath ?? 'unknown',
            retrievalQualityReason: diagnostics.retrieval?.qualityReason ?? 'unknown',
            retrievalCorrectiveAttempted: diagnostics.retrieval?.correctiveAttempted ?? false,
            replyPartsAttempted: diagnostics.generation?.replyParts?.attempted ?? false,
            replyPartsSuccess: diagnostics.generation?.replyParts?.success ?? false,
            replyPartCount: diagnostics.generation?.replyParts?.partCount ?? 0,
            groundedPartCount: diagnostics.generation?.replyParts?.groundedPartCount ?? 0,
            replyPartsFailureReason: diagnostics.generation?.replyParts?.failureReason,
            replyPartsSkippedReason: diagnostics.generation?.replyParts?.skippedReason,
            replyPartsRawResponsePreview: diagnostics.generation?.replyParts?.rawResponsePreview,
            replyPartsRawPartsPreview: diagnostics.generation?.replyParts?.rawPartsPreview,
            allowedSupportSlots: diagnostics.generation?.replyParts?.allowedSupportSlots ?? [],
            returnedCitations: Array.isArray(generated.output.citations) ? generated.output.citations.length : 0,
          });
        }
        updateRuntimeStatus({
          provider: 'local',
          healthy: true,
          detail: usedProviderFallback
            ? (generated.fallbackKind === 'provider_unavailable' ? 'provider-unavailable' : 'validation-fallback')
            : usedGroundingFallback
              ? 'grounding-fallback'
              : 'provider-ok',
          lastOutcome: usedFallback
            ? (generated.fallbackKind === 'provider_unavailable' ? 'provider_unavailable' : 'provider_fallback_validation')
            : 'provider_ok',
          lastAttempts: generated.attempts,
          lastValidationErrors: generated.validationErrors.slice(-3),
          lastTurnDiagnostics: diagnostics,
        });
        if (usedProviderFallback) {
          if (generated.fallbackKind === 'provider_unavailable') {
            console.warn('[sugaragent] Local provider is unavailable; returning provider-unavailable output.', {
              npcId: request.npcId,
              attempts: generated.attempts,
              errors: generated.validationErrors,
            });
          } else {
            console.warn('[sugaragent] Local provider returned fallback output after validation failures.', {
              npcId: request.npcId,
              attempts: generated.attempts,
              errors: generated.validationErrors,
            });
          }
        }
        if (usedGroundingFallback) {
          console.warn('[sugaragent] Reply-parts contract was missing for a grounded turn; returning uncertainty response.', {
            npcId: request.npcId,
            routeIntent: groundingDebug.routeIntent,
            queryType: groundingDebug.queryType,
            errors: generated.validationErrors,
          });
        }
        const providerTurn = usedProviderFallback && generated.fallbackKind === 'provider_unavailable'
          ? buildProviderUnavailableTurn(request.npcName)
          : {
            utterance: generated.output.utterance,
            emotion: generated.output.emotion,
            intent: generated.output.intent,
            citations: generated.output.citations,
            beatEvidence: generated.output.beatEvidence,
          };
        turn = {
          ...providerTurn,
          diagnostics,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const diagnostics = normalizeTurnDiagnostics(undefined, {
          interactionMode,
          interactionPolicy,
          hasBeatContract: Boolean(beatContract),
          previousMode,
          usedFallback: true,
          validationErrors: [`provider-error: ${detail}`],
          timestamp: now,
        });
        updateRuntimeStatus({
          provider: 'local',
          healthy: false,
          detail,
          lastOutcome: 'provider_error',
          lastTurnDiagnostics: diagnostics,
        });
        console.warn('[sugaragent] Local provider failed in runAgentTurn, using deterministic fallback.', error);
        turn = buildProviderUnavailableTurn(request.npcName);
        turn = {
          ...turn,
          diagnostics,
        };
      }
    } else {
      const diagnostics = normalizeTurnDiagnostics(undefined, {
        interactionMode,
        interactionPolicy,
        hasBeatContract: Boolean(beatContract),
        previousMode,
        usedFallback: true,
        validationErrors: ['provider-unavailable'],
        timestamp: now,
      });
      updateRuntimeStatus({
        provider: 'deterministic',
        healthy: false,
        detail: 'provider-unavailable',
        lastOutcome: 'provider_unavailable',
        lastTurnDiagnostics: diagnostics,
      });
      turn = buildProviderUnavailableTurn(request.npcName);
      turn = {
        ...turn,
        diagnostics,
      };
    }
    if (beatContract && !turnBudgetFallback) {
      const enriched = enrichTurnWithBeatEvidence({
        turn,
        contract: beatContract,
        playerMessage: message,
        priorCoveredFacts: beatExistingSession?.coveredFacts ?? [],
      });
      turn = enriched.turn;
      const evaluation = evaluateSugarAgentBeatCompletion(
        beatContract,
        enriched.beatEvidence,
        flagSnapshot,
      );
      turn.diagnostics = {
        ...(turn.diagnostics ?? {}),
        validation: mergeValidationBoundary(turn.diagnostics?.validation, {
          progressionGateEvaluated: true,
        }),
        beatEvaluator: {
          status: evaluation.passed ? 'passed' : 'failed',
          beatId: beatContract.id,
          questId: beatContract.questId,
          objectiveId: beatContract.objectiveId,
          coveragePassed: evaluation.coveragePassed,
          rulePassed: evaluation.rulePassed,
          beatIdMatched: evaluation.beatIdMatched,
          forbiddenPassed: evaluation.forbiddenPassed,
          confidencePassed: evaluation.confidencePassed,
          missingRequiredFacts: evaluation.missingRequiredFacts,
          forbiddenFactMentions: evaluation.forbiddenFactMentions,
          confidence: evaluation.confidence,
          completionSignal: evaluation.completionSignal,
          reason: evaluation.passed
            ? 'completion-accepted'
            : (!evaluation.beatIdMatched
              ? 'beat-id-mismatch'
              : (!evaluation.coveragePassed
                ? 'required-facts-not-covered'
                : (!evaluation.forbiddenPassed
                  ? 'forbidden-fact-mentioned'
                  : (!evaluation.rulePassed
                    ? 'completion-rule-not-satisfied'
                    : 'low-confidence-evidence')))),
        },
        timestampMs: now,
      };
      if (
        evaluation.passed
        && beatContract.objectiveId
        && isObjectiveActiveInQuestSnapshot(activeQuests, beatContract.questId, beatContract.objectiveId)
      ) {
        turn.actions = [
          ...(turn.actions ?? []),
          {
            type: 'completeObjective',
            questId: beatContract.questId,
            objectiveId: beatContract.objectiveId,
          },
        ];
      }
      sessions[beatSessionKey] = {
        npcId: request.npcId,
        activeBeatId: beatContract.id,
        questId: beatContract.questId,
        objectiveId: beatContract.objectiveId,
        coveredFacts: enriched.beatEvidence.coveredFacts,
        uncoveredFacts: enriched.beatEvidence.uncoveredFacts,
        lastResolvedMode: turn.diagnostics?.mode,
        lastResolvedModeReason: turn.diagnostics?.modeReason,
        turnCount: nextBeatTurnCount ?? nextTurnCount,
        updatedAt: now,
      };
    } else if (!beatContract) {
      sessions[beatSessionKey] = {
        npcId: request.npcId,
        lastResolvedMode: turn.diagnostics?.mode,
        lastResolvedModeReason: turn.diagnostics?.modeReason,
        turnCount: nextTurnCount,
        updatedAt: now,
      };
    }

    if (turn.diagnostics) {
      recordLastTurnDiagnostics(turn.diagnostics);
    }

    pushSummary(npc, `Player: ${message}`, 0.35, now);
    pushSummary(npc, `NPC: ${turn.utterance}`, 0.3, now);
    applyRelationshipDelta(
      npc.relationship,
      {
        affinity: 0.5,
        trust: 0.25,
        respect: 0.2,
        tension: -0.1,
      },
      now,
    );

    compactState(state);
    return turn;
  };

  const init = async (): Promise<void> => {
    const runtimeBridge = resolveRuntimeBridge();
    if (!runtimeBridge) {
      localProvider = null;
      updateRuntimeStatus({
        provider: 'deterministic',
        healthy: false,
        detail: options.disableProvider ? 'provider-disabled' : 'runtime-bridge-unavailable',
        lastOutcome: 'provider_unavailable',
      });
      return;
    }

    const provider = new LocalLLMProvider({
      runtime: runtimeBridge,
      maxAttempts: 3,
      defaultRuntimeMode: resolvedRuntimeMode,
    });

    try {
      const health = await provider.health();
      if (!health.ok) {
        console.warn('[sugaragent] Local provider unavailable; runAgentTurn will return provider-unavailable abstain output.', health.detail);
        localProvider = null;
        updateRuntimeStatus({
          provider: 'deterministic',
          healthy: false,
          detail: health.detail ?? 'provider-unavailable',
          lastOutcome: 'provider_unavailable',
        });
        return;
      }
      localProvider = provider;
      updateRuntimeStatus({
        provider: 'local',
        healthy: true,
        detail: health.detail ?? 'runtime-ready',
        lastOutcome: 'ready',
      });
    } catch (error) {
      console.warn('[sugaragent] Failed to initialize local provider; runAgentTurn will return provider-unavailable abstain output.', error);
      localProvider = null;
      const detail = error instanceof Error ? error.message : String(error);
      updateRuntimeStatus({
        provider: 'deterministic',
        healthy: false,
        detail,
        lastOutcome: 'provider_unavailable',
      });
    }
  };

  const loadState = (raw: unknown): void => {
    if (!isRecord(raw)) return;
    const schemaVersion = raw.schemaVersion;
    const now = Date.now();

    if (schemaVersion === 1) {
      state = parseStateV1(raw, now);
      return;
    }
    if (schemaVersion === 0) {
      state = migrateV0ToV1(
        {
          schemaVersion: 0,
          seenEvents: toSafeCounter(raw.seenEvents),
        },
        now,
      );
    }
  };

  return {
    descriptor: {
      id: pluginId,
      version: '0.5.0',
      apiVersion: PLUGIN_API_VERSION,
    },
    init,
    dispose: () => {},
    onEvent: trackEvent,
    resolveInteraction,
    runAgentTurn,
    serializeState: () => ({ ...state }),
    loadState,
  };
}
