/**
 * @file session/runtime.ts
 * @description SugarAgent preview-session runtime for Vite middleware.
 * @publicSurface createSugarAgentSession
 * @privateDetails Local llama invocation, prompt construction, lore retrieval, and persisted preview session state.
 * @see ../../docs/api/plugins/sugaragent/17-sugaragent-session-runtime.md
 */

import path from 'node:path';
import {
  loadLoreArtifacts,
} from '../lore/lore-lib.js';
import {
  createLocalEmbeddingsService,
  LOCAL_EMBEDDING_MODEL_ID,
} from '../runtime/local-embeddings-service.js';
import { createLocalLlamaGenerationService } from '../runtime/local-generation-service.js';
import type {
  ResolvedSugarAgentGenerationConfig,
} from '../runtime/generation-config.js';
import {
  collectLoreEntityRouteMatches,
  isKnowledgeSeekingQueryType,
  refineRouteWithLoreEntityMentions,
  routeIntentToQueryType,
  routeTurnIntentFromInterpretation,
  routeIntentUsesLore,
  routeTurnIntent,
} from './core/routing.js';
import {
  applyTurnToSession,
  buildRecentReferentPreview,
  buildTurnTopicCoverageContext,
  countPlayerTurns,
  getSessionFactsForNpc,
  getSessionReferentsForNpc,
  getSessionTopicCoverageForNpc,
  loadSessionState,
  MAX_HISTORY_ENTRIES,
} from './core/session-state.js';
import {
  buildGroundingEvidenceEntries,
} from './core/grounding/evidence.js';
import {
  REPLY_PARTS_JSON_SCHEMA,
  buildReplyPartsPrompt,
  buildReplyPartsRepairPrompt,
  buildSupportSlotsFromGroundingEvidence,
  filterSupportSlotsForQueryType,
  materializeTurnOutputFromReplyParts,
  normalizeReplyPartsForValidation,
  parseReplyPartsResponseDetailed,
  type ParsedReplyPartsTurn,
  type ReplyPart,
  type ReplyPartKind,
} from './core/grounding/reply-parts.js';
import {
  GROUNDED_REPLY_AUDIT_JSON_SCHEMA,
  parseGroundedReplyAuditDetailed,
} from './core/grounding/reply-audit.js';
import {
  buildReplyPartsValidationRepairReason,
  validateReplyPartsContract,
} from './core/grounding/reply-parts-validator.js';
import {
  createGroundedUncertaintyReply,
} from './core/turn-realization.js';
import {
  localizeGroundedReplyExemplar,
  localizeSimpleSocialReply,
} from './core/language-stock.js';
import {
  buildDeliveryContractPromptLines,
  normalizeDeliveryContract,
  selectDeliveryClaims,
  summarizeDeliveryContractForDiagnostics,
  validateReplyAgainstDeliveryContract,
} from './core/delivery-contract.js';
import {
  runEvidenceFirstPipeline,
  buildNpcStateSnapshot,
  enrichEvidencePackWithEpistemics,
  hasDirectAnswerableStateEvidence,
  isEvidenceItemRelevantForTurn,
} from './core/evidence-first-pipeline.js';
import {
  buildSugarlangLanguageAdaptationContext,
  estimateTextLanguage,
  normalizeLanguageCode,
  resolveLanguageAdaptationContext,
} from './core/language-adaptation.js';
import {
  buildEvidencePreview,
  enhanceInterpretationWithFacetSimilarity,
} from './core/query-interpretation.js';
import {
  attachSubjectSelectionToInterpretation,
} from './core/subject-relevance.js';
import {
  runGovernedLoreRetrieval,
} from './core/retrieval-pipeline.js';
import {
  buildEvidencePack,
  resolveConversationMode,
} from './core/retrieval-governance.js';
import {
  resolveInitiativePolicy,
} from './core/initiative.js';
import {
  hasLikelyQuestionForm,
} from './core/routing.js';
import {
  isLikelySmallTalkQuery,
  isProtectedShortSocialTurn,
} from './core/social-cues.js';
import {
  computeNoveltyState,
} from './core/turn-planning.js';
import {
  extractNpcCommitments,
  filterMemoryWrites,
} from './core/memory-provenance.js';
import {
  extractDeclaredIdentityName,
  isLikelyGreetingOnlyMessage,
  validateTurnQuality,
} from './core/turn-quality.js';
import {
  detectSocialAcknowledgement,
  isLikelyLightweightLocationPrompt,
} from './core/social-cues.js';
import {
  checkSocialResponseForFactualLeakage,
} from './core/turn-path-routing.js';
import type { SugarAgentTurnOutput } from '../contracts/turn.js';
import type { QueryType, RoutingResult } from './core/routing.js';
import type {
  EvidenceFirstPipelineDiagnostics,
  LanguageAdaptationContext,
  QueryInterpretation,
  ReferentPreviewCandidate,
  ResolvedPrimaryReferent,
  SubjectRelationPolicy,
} from './core/turn-contracts.js';
import type { PluginPedagogyContext } from '../pedagogy.js';
import type {
  EmbeddingsService,
  JsonGenerationRequest,
  JsonGenerationService,
  ModelLifecycleService,
  RuntimeHealthService,
} from '../services.js';
import type { SugarAgentSessionRuntime } from '../session.js';

type RecordLike = Record<string, any>;

function emitReplyLanguageDebugLog(input: {
  stage: string;
  turnContext: unknown;
  replyText: string;
  partKinds?: string[];
  npcId?: string;
  routeIntent?: string;
  queryType?: string;
  turnPath?: string;
}) {
  const pedagogyContext = getPedagogyContext(input.turnContext);
  const targetLanguage = normalizeLanguageCode(pedagogyContext?.targetLanguage);
  const supportLanguage = normalizeLanguageCode(pedagogyContext?.supportLanguage);
  if (!targetLanguage && !supportLanguage) return;

  const learnerBand = normalizeOptionalString(pedagogyContext?.learnerBand);
  const supportPolicy = normalizeOptionalString(pedagogyContext?.supportLanguagePolicy);
  const estimate = estimateTextLanguage(input.replyText, targetLanguage);

  console.debug('[sugaragent][language]', {
    stage: input.stage,
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    turnPath: input.turnPath,
    targetLanguage,
    supportLanguage,
    learnerBand,
    supportPolicy,
    deliveryContract: summarizeDeliveryContractForDiagnostics(pedagogyContext?.deliveryContract),
    estimatedLanguage: estimate.estimatedLanguage,
    mismatchSuspected: estimate.mismatchSuspected,
    scoreByLanguage: estimate.scoreByLanguage,
    partKinds: input.partKinds ?? [],
    preview: sanitizePromptText(input.replyText).slice(0, 200),
  });
}

function emitPlanRealizationStatusLog(input: {
  stage: string;
  turnContext: unknown;
  npcId?: string;
  routeIntent?: string;
  queryType?: string;
  turnPath?: string;
  strategy?: string;
  attempt?: number;
  failureReason?: string;
  rawPreview?: string;
  estimatedLanguage?: string;
  mismatchSuspected?: boolean;
  allowedClaimOrdinals?: number[];
  acceptedClaimOrdinals?: number[];
  allowedSupportSlots?: string[];
  validationMode?: string;
  auditRawPreview?: string;
  allowedClaimPreviews?: Array<{
    claimOrdinal: number;
    mode: string;
    text: string;
    supportSlotIds?: string[];
  }>;
  candidatePartsPreview?: Array<Record<string, unknown>>;
  auditPartsPreview?: Array<Record<string, unknown>>;
}) {
  const pedagogyContext = getPedagogyContext(input.turnContext);
  const targetLanguage = normalizeLanguageCode(pedagogyContext?.targetLanguage);
  const supportLanguage = normalizeLanguageCode(pedagogyContext?.supportLanguage);
  if (!targetLanguage && !supportLanguage) return;

  console.debug('[sugaragent][realization]', {
    stage: input.stage,
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    turnPath: input.turnPath,
    strategy: input.strategy,
    attempt: input.attempt,
    targetLanguage,
    supportLanguage,
    learnerBand: normalizeOptionalString(pedagogyContext?.learnerBand),
    supportPolicy: normalizeOptionalString(pedagogyContext?.supportLanguagePolicy),
    deliveryContract: summarizeDeliveryContractForDiagnostics(pedagogyContext?.deliveryContract),
    estimatedLanguage: input.estimatedLanguage,
    mismatchSuspected: input.mismatchSuspected,
    validationMode: input.validationMode,
    allowedClaimOrdinals: input.allowedClaimOrdinals,
    acceptedClaimOrdinals: input.acceptedClaimOrdinals,
    allowedSupportSlots: input.allowedSupportSlots,
    knowledgeCoverage: Array.isArray(input.allowedClaimOrdinals) && input.allowedClaimOrdinals.length > 0
      ? ((input.acceptedClaimOrdinals?.length ?? 0) > 0 ? 'covered' : 'available_but_not_covered')
      : 'no_allowed_claims',
    failureReason: input.failureReason,
    rawPreview: input.rawPreview ? sanitizePromptText(input.rawPreview).slice(0, 240) : undefined,
    auditRawPreview: input.auditRawPreview ? sanitizePromptText(input.auditRawPreview).slice(0, 240) : undefined,
    allowedClaimPreviews: Array.isArray(input.allowedClaimPreviews)
      ? input.allowedClaimPreviews.slice(0, 3).map((claim) => ({
        claimOrdinal: claim.claimOrdinal,
        mode: sanitizePromptText(claim.mode).slice(0, 24),
        text: sanitizePromptText(claim.text).slice(0, 160),
        supportSlotIds: Array.isArray(claim.supportSlotIds) ? claim.supportSlotIds.slice(0, 6) : undefined,
      }))
      : undefined,
    candidatePartsPreview: Array.isArray(input.candidatePartsPreview)
      ? input.candidatePartsPreview.slice(0, 3)
      : undefined,
    auditPartsPreview: Array.isArray(input.auditPartsPreview)
      ? input.auditPartsPreview.slice(0, 3)
      : undefined,
  });
}

function emitRoutingRefinementDebugLog(input: {
  npcId?: string;
  playerMessage?: string;
  routeIntent?: string;
  queryType?: string;
  matches?: Array<{
    entityId?: string;
    entityType?: string;
    matchedText?: string;
    filterKind?: string | null;
  }>;
  retrievalFilters?: {
    entityIds?: string[];
    locationIds?: string[];
    factionIds?: string[];
    aliases?: string[];
  } | null;
}) {
  console.debug('[sugaragent][routing-refinement]', {
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    playerPreview: sanitizePromptText(input.playerMessage).slice(0, 120),
    matches: Array.isArray(input.matches)
      ? input.matches.slice(0, 6).map((match) => ({
        entityId: normalizeOptionalString(match?.entityId),
        entityType: normalizeOptionalString(match?.entityType),
        matchedText: sanitizePromptText(match?.matchedText ?? '').slice(0, 60),
        filterKind: match?.filterKind ?? null,
      }))
      : [],
    retrievalFilters: input.retrievalFilters ?? null,
  });
}

function emitRetrievalTopMatchesDebugLog(input: {
  npcId?: string;
  routeIntent?: string;
  queryType?: string;
  retrievalFilters?: {
    entityIds?: string[];
    locationIds?: string[];
    factionIds?: string[];
    aliases?: string[];
  } | null;
  matches?: Array<Record<string, unknown>>;
}) {
  const topMatches = Array.isArray(input.matches) ? input.matches.slice(0, 5) : [];
  console.debug('[sugaragent][retrieval-top]', {
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    retrievalFilters: input.retrievalFilters ?? null,
    topMatches: topMatches.map((entry) => {
      const chunk = isRecord(entry?.chunk) ? entry.chunk : null;
      const metadata = isRecord(chunk?.metadata) ? chunk.metadata : null;
      return {
        chunkId: normalizeOptionalString(chunk?.chunkId),
        title: normalizeOptionalString(chunk?.title),
        score: typeof entry?.score === 'number' && Number.isFinite(entry.score)
          ? Number(entry.score.toFixed(4))
          : undefined,
        pool: normalizeOptionalString(entry?.pool),
        retrievalRing: normalizeOptionalString(entry?.retrievalRing),
        retrievalRingReason: normalizeOptionalString(entry?.retrievalRingReason),
        entityIds: Array.isArray(metadata?.entity_ids) ? metadata.entity_ids.slice(0, 4) : [],
        locationIds: Array.isArray(metadata?.location_ids) ? metadata.location_ids.slice(0, 4) : [],
        tags: Array.isArray(metadata?.tags) ? metadata.tags.slice(0, 4) : [],
      };
    }),
  });
}

function emitSubjectSelectionDebugLog(input: {
  npcId?: string;
  routeIntent?: string;
  queryType?: string;
  primaryReferent?: ResolvedPrimaryReferent;
  relationPolicy?: SubjectRelationPolicy;
}) {
  console.debug('[sugaragent][subject-selection]', {
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    primaryReferent: input.primaryReferent
      ? {
          id: normalizeOptionalString(input.primaryReferent.id),
          text: sanitizePromptText(input.primaryReferent.text).slice(0, 80),
          kind: input.primaryReferent.kind,
          confidence: input.primaryReferent.confidence,
        }
      : null,
    relationPolicy: input.relationPolicy
      ? {
          facet: input.relationPolicy.facet,
          preferredRelationDistances: input.relationPolicy.preferredRelationDistances,
          incidentalAllowed: input.relationPolicy.incidentalAllowed,
          associatedFallbackAllowed: input.relationPolicy.associatedFallbackAllowed,
          evidenceBudget: input.relationPolicy.evidenceBudget ?? null,
        }
      : null,
  });
}

function normalizeDebugScopeToken(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('lore.') && trimmed.length > 5) {
    return trimmed.slice(5);
  }
  return trimmed;
}

function expandDebugScopeAliases(scope: string): string[] {
  const normalized = normalizeDebugScopeToken(scope);
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  const placeScopeMatch = normalized.match(/^(town|city|place|region|location|locations)\.([a-z0-9._-]+)$/);
  if (placeScopeMatch?.[2]) {
    const placeId = placeScopeMatch[2];
    const tail = placeId.split('.').pop();
    aliases.add(`locations.${placeId}`);
    if (tail && tail.length >= 3) {
      aliases.add(tail);
      aliases.add(`locations.${tail}`);
    }
  }
  return [...aliases];
}

function collectDebugChunkScopeTokens(chunk: RecordLike | null): Set<string> {
  const metadata = isRecord(chunk?.metadata) ? chunk.metadata : null;
  const rawCandidates = [
    normalizeOptionalString(chunk?.chunkId),
    normalizeOptionalString(chunk?.pageId),
    normalizeOptionalString(metadata?.id),
    ...normalizeStringArray(metadata?.tags),
    ...normalizeStringArray(metadata?.entity_ids),
    ...normalizeStringArray(metadata?.location_ids),
    ...normalizeStringArray(metadata?.faction_ids),
    ...normalizeStringArray(metadata?.beat_ids),
  ];

  const tokens = new Set<string>();
  for (const candidate of rawCandidates) {
    const normalized = normalizeDebugScopeToken(candidate);
    if (!normalized) continue;
    tokens.add(normalized);
    for (const part of normalized.split(/[.#/_-]+/)) {
      if (part.length >= 3) tokens.add(part);
    }
  }
  return tokens;
}

function matchesDebugScopeFilters(chunk: RecordLike | null, scopeFilters: string[]): boolean {
  if (scopeFilters.length === 0) return true;
  const chunkTokens = collectDebugChunkScopeTokens(chunk);
  for (const scope of scopeFilters) {
    for (const alias of expandDebugScopeAliases(scope)) {
      if (chunkTokens.has(alias)) return true;
      for (const token of chunkTokens) {
        if (token.startsWith(`${alias}.`) || token.endsWith(`.${alias}`)) return true;
      }
    }
  }
  return false;
}

function emitSelfRetrievalGateDebugLog(input: {
  npcId?: string;
  routeIntent?: string;
  queryType?: string;
  selfEntityId?: string;
  loreScopes?: string[];
  selfLoreScopes?: string[];
  relatedLoreScopes?: string[];
  loreArtifacts?: unknown;
  retrievalAttempted?: boolean;
  retrievalMatchCount?: number;
}) {
  if (input.queryType !== 'self_query' && input.routeIntent !== 'identity_self') return;

  const chunks = isRecord(input.loreArtifacts) && Array.isArray(input.loreArtifacts.chunks)
    ? input.loreArtifacts.chunks.filter((entry): entry is RecordLike => isRecord(entry))
    : [];
  const normalizedSelfEntityId = normalizeOptionalString(input.selfEntityId)?.toLowerCase();
  const normalizedLoreScopes = normalizeStringArray(input.loreScopes)
    .map((entry) => normalizeDebugScopeToken(entry))
    .filter((entry): entry is string => Boolean(entry));
  const normalizedSelfLoreScopes = normalizeStringArray(input.selfLoreScopes)
    .map((entry) => normalizeDebugScopeToken(entry))
    .filter((entry): entry is string => Boolean(entry));
  const effectiveScopeFilters = normalizedSelfLoreScopes;

  const exactSelfMatches = chunks.filter((chunk) => {
    const metadata = isRecord(chunk.metadata) ? chunk.metadata : null;
    const entityIds = normalizeStringArray(metadata?.entity_ids).map((entry) => entry.toLowerCase());
    return Boolean(normalizedSelfEntityId && entityIds.includes(normalizedSelfEntityId));
  });
  const scopeMatches = effectiveScopeFilters.length > 0
    ? chunks.filter((chunk) => matchesDebugScopeFilters(chunk, effectiveScopeFilters))
    : [];
  const includedSelfChunks = chunks.filter((chunk) => {
    const metadata = isRecord(chunk.metadata) ? chunk.metadata : null;
    const entityIds = normalizeStringArray(metadata?.entity_ids).map((entry) => entry.toLowerCase());
    const exactSelfMatch = Boolean(normalizedSelfEntityId && entityIds.includes(normalizedSelfEntityId));
    if (exactSelfMatch) return true;
    if (effectiveScopeFilters.length === 0) return false;
    return matchesDebugScopeFilters(chunk, effectiveScopeFilters);
  });

  console.debug('[sugaragent][self-retrieval-gate]', {
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    selfEntityId: normalizedSelfEntityId ?? null,
    retrievalAttempted: input.retrievalAttempted ?? null,
    retrievalMatchCount: input.retrievalMatchCount ?? null,
    loreArtifactChunkCount: chunks.length,
    effectiveScopeFilters,
    exactSelfEntityChunkCount: exactSelfMatches.length,
    scopeEligibleChunkCount: scopeMatches.length,
    includedSelfChunkCount: includedSelfChunks.length,
    exactSelfEntityChunks: exactSelfMatches.slice(0, 4).map((chunk) => ({
      chunkId: normalizeOptionalString(chunk.chunkId),
      title: normalizeOptionalString(chunk.title),
      pageId: normalizeOptionalString(chunk.pageId),
    })),
    scopeEligibleChunks: scopeMatches.slice(0, 4).map((chunk) => ({
      chunkId: normalizeOptionalString(chunk.chunkId),
      title: normalizeOptionalString(chunk.title),
      pageId: normalizeOptionalString(chunk.pageId),
    })),
    includedSelfChunks: includedSelfChunks.slice(0, 4).map((chunk) => {
      const metadata = isRecord(chunk.metadata) ? chunk.metadata : null;
      return {
        chunkId: normalizeOptionalString(chunk.chunkId),
        title: normalizeOptionalString(chunk.title),
        pageId: normalizeOptionalString(chunk.pageId),
        entityIds: normalizeStringArray(metadata?.entity_ids).slice(0, 4),
      };
    }),
  });
}

function emitSelfRetrievalQualityDebugLog(input: {
  npcId?: string;
  routeIntent?: string;
  queryType?: string;
  retrieval?: {
    quality?: RecordLike;
    governance?: RecordLike;
  } | null;
}) {
  if (input.queryType !== 'self_query' && input.routeIntent !== 'identity_self') return;
  const quality = isRecord(input.retrieval?.quality) ? input.retrieval?.quality : null;
  const governance = isRecord(input.retrieval?.governance) ? input.retrieval?.governance : null;
  const attempts = Array.isArray(governance?.attempts) ? governance.attempts : [];
  console.debug('[sugaragent][self-retrieval-quality]', {
    npcId: input.npcId,
    routeIntent: input.routeIntent,
    queryType: input.queryType,
    quality: quality
      ? {
          required: quality.required === true,
          pass: quality.pass === true,
          reason: normalizeOptionalString(quality.reason),
          coverage: typeof quality.coverage === 'number' && Number.isFinite(quality.coverage)
            ? Number(quality.coverage.toFixed(4))
            : null,
          supportConfidence: typeof quality.supportConfidence === 'number' && Number.isFinite(quality.supportConfidence)
            ? Number(quality.supportConfidence.toFixed(4))
            : null,
          conflictRisk: typeof quality.conflictRisk === 'number' && Number.isFinite(quality.conflictRisk)
            ? Number(quality.conflictRisk.toFixed(4))
            : null,
        }
      : null,
    governance: governance
      ? {
          candidateCount: typeof governance.candidateCount === 'number' ? governance.candidateCount : null,
          selectedCount: typeof governance.selectedCount === 'number' ? governance.selectedCount : null,
          qualityPath: normalizeOptionalString(governance.qualityPath),
          qualityReason: normalizeOptionalString(governance.qualityReason),
          qualityGatePassed: governance.qualityGatePassed === true,
          correctiveAttempted: governance.correctiveAttempted === true,
        }
      : null,
    attempts: attempts.slice(0, 2).map((attempt) => {
      const qualityRecord = isRecord(attempt?.quality) ? attempt.quality : null;
      return {
        attempt: normalizeOptionalString(attempt?.attempt),
        query: sanitizePromptText(attempt?.query ?? '').slice(0, 120),
        candidateCount: typeof attempt?.candidateCount === 'number' ? attempt.candidateCount : null,
        selectedCount: typeof attempt?.selectedCount === 'number' ? attempt.selectedCount : null,
        reason: normalizeOptionalString(qualityRecord?.reason),
        pass: qualityRecord?.pass === true,
        coverage: typeof qualityRecord?.coverage === 'number' && Number.isFinite(qualityRecord.coverage)
          ? Number(qualityRecord.coverage.toFixed(4))
          : null,
        supportConfidence: typeof qualityRecord?.supportConfidence === 'number' && Number.isFinite(qualityRecord.supportConfidence)
          ? Number(qualityRecord.supportConfidence.toFixed(4))
          : null,
      };
    }),
  });
}

interface SessionRuntime extends RuntimeHealthService, ModelLifecycleService, EmbeddingsService {
  name: string;
  generateJson(request: JsonGenerationRequest): Promise<{ jsonText: string; rawText?: string }>;
}

interface GenerationDiagnostics {
  draft: {
    attempted: boolean;
    success: boolean;
    failureReason?: string;
    skippedReason?: string;
  };
  replyParts: {
    attempted: boolean;
    success: boolean;
    attemptCount: number;
    repairAttempted: boolean;
    partCount: number;
    groundedPartCount: number;
    failureReason?: string;
    skippedReason?: string;
    rawResponsePreview?: string;
    rawPartsPreview?: Array<Record<string, unknown>>;
    auditAttempted?: boolean;
    auditSuccess?: boolean;
    auditFailureReason?: string;
    auditRawResponsePreview?: string;
    auditPartsPreview?: Array<Record<string, unknown>>;
    allowedSupportSlots?: string[];
    allowedClaimOrdinals?: number[];
    acceptedClaimOrdinals?: number[];
    verificationMode?: 'generator_auditor';
    estimatedLanguage?: string;
    mismatchSuspected?: boolean;
  };
}

interface ValidatedPlanClaimSlot {
  claimOrdinal: number;
  claimId: string;
  mode: 'grounded' | 'inferred' | 'rumor';
  text: string;
  supportSlotIds: string[];
}

function getNormalizedDeliveryContract(turnContext: unknown) {
  return normalizeDeliveryContract(getPedagogyContext(turnContext)?.deliveryContract);
}

interface SessionOptions {
  npc: string;
  debugProvider?: 'echo';
  runtime: 'llama' | 'mock' | 'auto';
  generation?: ResolvedSugarAgentGenerationConfig;
  session: string | null;
  loreDir: string;
  useLore: boolean;
  missingGameLoreBundle: boolean;
  llamaBin: string | null;
  modelPath: string | null;
  llamaTimeoutMs: number;
  llamaBinArgs: string[];
  llamaArgs: string[];
  turnContext: RecordLike | null;
  requireLoreScopeForRetrieval: boolean;
  generationService?: JsonGenerationService;
  embeddingsService?: EmbeddingsService;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items: string[] = [];
  for (const entry of value) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function dedupeMergeStringArrays(...sources: unknown[]): string[] {
  return normalizeStringArray(sources.flatMap((entry) => (Array.isArray(entry) ? entry : [])));
}

function sanitizePromptText(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}


function buildTurnReferentCandidates(input: {
  playerMessage: string;
  targetLanguage?: string;
  npcName?: string;
  activeTopic?: string | null;
  sceneRegionName?: string;
  sceneRegionPath?: string;
  loreEntityHints?: Array<{
    entityId: string;
    entityType: 'world' | 'character' | 'faction' | 'unknown';
    matchedText: string;
  }>;
  interpretation?: QueryInterpretation;
}): ReferentPreviewCandidate[] {
  const candidates: ReferentPreviewCandidate[] = [];
  const activeTopic = normalizeOptionalString(input.activeTopic);
  const npcName = normalizeOptionalString(input.npcName)?.toLowerCase();
  const explicitNpcMention = npcName ? input.playerMessage.toLowerCase().includes(npcName) : false;

  for (const referent of input.interpretation?.referents ?? []) {
    if (referent.kind === 'npc' && !explicitNpcMention) continue;
    candidates.push({
      kind: referent.kind,
      text: referent.text,
      id: referent.id,
      confidence: referent.confidence,
      topic: activeTopic ?? referent.text,
      sourceRole: 'player',
    });
  }

  for (const hint of input.loreEntityHints ?? []) {
    if (hint.entityType === 'unknown') continue;
    candidates.push({
      kind: hint.entityType === 'world'
        ? 'location'
        : hint.entityType === 'faction'
          ? 'faction'
          : 'entity',
      text: hint.matchedText,
      id: hint.entityId,
      confidence: 0.72,
      topic: activeTopic ?? hint.matchedText,
      sourceRole: 'lore',
    });
  }

  if (activeTopic) {
    candidates.push({
      kind: 'topic',
      text: activeTopic,
      id: activeTopic,
      confidence: 0.56,
      topic: activeTopic,
      sourceRole: 'memory',
    });
  }

  if (isLikelyLightweightLocationPrompt(input.playerMessage, input.targetLanguage)) {
    const sceneLocation = normalizeOptionalString(input.sceneRegionName) ?? normalizeOptionalString(input.sceneRegionPath);
    if (sceneLocation) {
      candidates.push({
        kind: 'location',
        text: sceneLocation,
        id: sceneLocation,
        confidence: 0.68,
        topic: sceneLocation,
        sourceRole: 'scene',
      });
    }
  }

  const deduped = new Map<string, ReferentPreviewCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id ?? candidate.text}`.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || (candidate.confidence ?? 0) > (existing.confidence ?? 0)) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()].slice(0, 8);
}

function computeEvidenceBackedRetrievalConfidence(input: RecordLike | null | undefined): number {
  const queryType = input?.queryType;
  const routeIntent = input?.routeIntent;
  const retrievalMatches = Array.isArray(input?.retrievalMatches) ? input.retrievalMatches : [];
  const evidenceItems = Array.isArray(input?.evidenceItems) ? input.evidenceItems : [];

  if (retrievalMatches.length > 0) return 0.7;

  const npcEvidenceCount = evidenceItems.filter((item) => item?.ownerType === 'npc' || item?.ownerType === 'beat').length;
  if ((queryType === 'self_query' || routeIntent === 'identity_self') && npcEvidenceCount > 0) {
    return 0.76;
  }
  if (evidenceItems.length > 0) return 0.42;
  return 0.1;
}

function parseReplyPartsTurnFromText(text: unknown) {
  if (typeof text !== 'string' || text.trim().length === 0) return null;
  return parseReplyPartsResponseDetailed(text).turn;
}

function buildValidatedPlanSupportSlots(input: RecordLike | null | undefined) {
  const plan = isRecord(input?.plan) ? input.plan : {};
  const claims = Array.isArray(plan.claims) ? plan.claims : [];
  const evidenceIdToItem = input?.evidencePack?.evidenceIdToItem instanceof Map
    ? input.evidencePack.evidenceIdToItem
    : new Map();
  const allowedSourceIds = new Set();
  for (const claim of claims) {
    if (!isRecord(claim) || !Array.isArray(claim.evidenceIds)) continue;
    for (const evidenceId of claim.evidenceIds) {
      const item = evidenceIdToItem.get(evidenceId);
      const sourceId = normalizeOptionalString(item?.sourceId);
      if (sourceId) allowedSourceIds.add(sourceId);
    }
  }
  if (allowedSourceIds.size === 0) return [];

  const evidenceEntries = Array.isArray(input?.evidenceEntries) ? input.evidenceEntries : [];
  const filteredEvidenceEntries = evidenceEntries.filter((entry) => allowedSourceIds.has(entry.sourceId));
  return filterSupportSlotsForQueryType({
    supportSlots: buildSupportSlotsFromGroundingEvidence({
      evidenceEntries: filteredEvidenceEntries,
      selfEntityId: input?.selfEntityId,
      npcId: input?.npcId,
      maxSlots: 6,
    }),
    queryType: input?.queryType,
  });
}

function buildValidatedPlanClaimMetadata(input: RecordLike | null | undefined) {
  const plan = isRecord(input?.plan) ? input.plan : {};
  const claims = Array.isArray(plan.claims) ? plan.claims : [];
  const evidenceIdToItem = input?.evidencePack?.evidenceIdToItem instanceof Map
    ? input.evidencePack.evidenceIdToItem
    : new Map();
  const supportSlots = Array.isArray(input?.supportSlots) ? input.supportSlots : [];
  const slotIdsBySourceId = new Map<string, string[]>();
  for (const slot of supportSlots) {
    const sourceId = normalizeOptionalString(slot?.sourceId);
    const slotId = normalizeOptionalString(slot?.slotId);
    if (!sourceId || !slotId) continue;
    const existing = slotIdsBySourceId.get(sourceId) ?? [];
    if (!existing.includes(slotId)) existing.push(slotId);
    slotIdsBySourceId.set(sourceId, existing);
  }

  const planClaims = claims
    .map((claim, index) => {
      const claimId = normalizeOptionalString(claim?.claimId);
      const mode = normalizeOptionalString(claim?.mode);
      if (!claimId || (mode !== 'grounded' && mode !== 'inferred' && mode !== 'rumor')) {
        return null;
      }
      const supportSlotIds = Array.isArray(claim?.evidenceIds)
        ? Array.from(new Set(
          claim.evidenceIds.flatMap((evidenceId: unknown) => {
            const evidence = evidenceIdToItem.get(evidenceId);
            const sourceId = normalizeOptionalString(evidence?.sourceId);
            if (!sourceId) return [];
            return slotIdsBySourceId.get(sourceId) ?? [];
          }),
        ))
        : [];
      return {
        claimOrdinal: index + 1,
        claimId,
        mode,
        text: sanitizePromptText(claim?.text ?? ''),
        supportSlotIds,
      };
    })
    .filter((entry): entry is ValidatedPlanClaimSlot => entry !== null);

  const claimsByOrdinal = new Map(
    planClaims.map((claim) => [claim.claimOrdinal, claim] as const),
  );
  const selection = selectDeliveryClaims({
    claims: planClaims,
    deliveryContract: getPedagogyContext(input?.turnContext)?.deliveryContract,
    playerMessage: input?.playerMessage,
  });
  const deliveryClaims = selection.selectedClaims;
  const deliveryClaimsByOrdinal = new Map(
    deliveryClaims.map((claim) => [claim.claimOrdinal, claim] as const),
  );

  return {
    planClaims,
    deliveryClaims,
    allowedClaimOrdinals: deliveryClaims.map((claim) => claim.claimOrdinal),
    claimsByOrdinal,
    deliveryClaimsByOrdinal,
    omittedClaimOrdinals: selection.omittedClaimOrdinals,
  };
}

function buildValidatedPlanInstructionLines(input: RecordLike | null | undefined): string[] {
  const safeInput = isRecord(input) ? input : {};
  const plan = isRecord(safeInput.plan) ? safeInput.plan : {};
  const targetLanguage = normalizeLanguageCode(getPedagogyContext(safeInput.turnContext)?.targetLanguage);
  const deliveryContract = getNormalizedDeliveryContract(safeInput.turnContext);
  const claims = Array.isArray(safeInput.planClaims)
    ? safeInput.planClaims
    : Array.isArray(plan.claims)
      ? plan.claims
      : [];
  const lines = [
    'Validated plan:',
    `- Speech act: ${sanitizePromptText(plan.speechAct || 'chat')}`,
    `- Route intent: ${sanitizePromptText(plan.routeIntent || safeInput.routeIntent || 'unknown')}`,
  ];

  if (claims.length === 0) {
    lines.push('- No factual claims are allowed in this reply.');
  } else {
    lines.push(
      targetLanguage !== 'default' && targetLanguage !== 'en'
        ? '- Source meaning notes (not canonical surface wording):'
        : '- Allowed factual claims:',
    );
    claims.slice(0, 6).forEach((claim, index) => {
      const mode = sanitizePromptText(claim?.mode || 'grounded');
      const text = sanitizePromptText(claim?.text || '');
      lines.push(`  ${index + 1}. [kind=${mode}] ${text}`);
    });
  }

  if (deliveryContract?.maxKnowledgeClaims) {
    lines.push(`Only these selected delivery claims are eligible for this reply. Stay within ${deliveryContract.maxKnowledgeClaims} knowledge claim(s).`);
  }
  lines.push('Use only the factual content listed above. Do not add new facts outside that list.');
  lines.push(
    targetLanguage !== 'default' && targetLanguage !== 'en'
      ? 'Translate the factual relationship into the target language instead of mirroring the source wording.'
      : 'You may paraphrase the allowed claims, but you must not mention internal numbering.',
  );
  lines.push('Only include the claims that are actually relevant to the player message. You do not need to cover every allowed claim.');
  lines.push('Preserve certainty level exactly:');
  lines.push('- grounded claims must stay grounded');
  lines.push('- inferred claims must keep a soft hedge such as "I think" or "it seems"');
  lines.push('- rumor claims must keep a strong hedge such as "I heard" or "people say"');
  lines.push('If the validated plan is uncertain, return an uncertain part instead of guessing.');
  return lines;
}

function buildPlanBoundReplyPartsPrompt(input: RecordLike | null | undefined): string {
  const safeInput = isRecord(input) ? input : {};
  const turnContext = isRecord(safeInput.turnContext) ? safeInput.turnContext : null;

  return [
    ...buildLanguageInstructionLines(turnContext),
    buildPedagogyBlock(turnContext),
    ...buildGroundedTargetLanguageAnchorLines({
      turnContext,
      planClaims: Array.isArray(safeInput.planClaims) ? safeInput.planClaims : [],
    }),
    `Return a short NPC reply for ${sanitizePromptText(safeInput.npcName || 'NPC')} as ordered reply parts.`,
    'Return ONLY one JSON object. No markdown. No explanation.',
    'Use 1 to 3 parts total.',
    'Allowed part kinds: social, grounded, inferred, rumor, uncertain, close.',
    'For grounded turns, use social parts only for brief framing. Put factual content in grounded, inferred, or rumor parts.',
    'Do not include support ids, claim ids, evidence ids, or any internal bookkeeping in the JSON.',
    'Do not mention internal numbering in the visible text.',
    'Answer only what is relevant to the player message. Do not volunteer extra lore just because it is available.',
    `Query type: ${sanitizePromptText(safeInput.queryType || 'conversation')}`,
    `Route intent: ${sanitizePromptText(safeInput.routeIntent || 'unknown')}`,
    `Player message: ${sanitizePromptText(safeInput.playerMessage || '(none)')}`,
    buildValidatedPlanInstructionLines(safeInput).join('\n'),
  ].filter(Boolean).join('\n');
}

function buildPlanBoundReplyPartsRepairPrompt(input: RecordLike | null | undefined): string {
  const safeInput = isRecord(input) ? input : {};
  const turnContext = isRecord(safeInput.turnContext) ? safeInput.turnContext : null;
  return [
    ...buildLanguageInstructionLines(turnContext),
    buildPedagogyBlock(turnContext),
    ...buildGroundedTargetLanguageAnchorLines({
      turnContext,
      planClaims: Array.isArray(safeInput.planClaims) ? safeInput.planClaims : [],
    }),
    `Previous grounded realization failed: ${sanitizePromptText(safeInput.failureReason || 'invalid previous response')}.`,
    'Retry now with strict JSON only.',
    'Do not include support ids, claim ids, evidence ids, or any internal bookkeeping.',
    'Keep the reply natural and conversational, but use only the allowed factual content.',
    'If the previous reply was too dense, keep fewer facts, fewer sentences, and simpler wording this time.',
    'If the factual content is not answerable without adding a new fact, return an uncertain part.',
    buildValidatedPlanInstructionLines(safeInput).join('\n'),
  ].filter(Boolean).join('\n');
}

function buildGroundedReplyAuditPrompt(input: {
  turnContext?: unknown;
  playerMessage?: unknown;
  queryType?: unknown;
  routeIntent?: unknown;
  generatedTurn: ParsedReplyPartsTurn;
  planClaims: ValidatedPlanClaimSlot[];
}): string {
  const safeInput = isRecord(input) ? input : {};
  const turnContext = safeInput.turnContext;
  const generatedTurn = safeInput.generatedTurn;
  const planClaims = Array.isArray(safeInput.planClaims) ? safeInput.planClaims : [];
  const candidateParts = Array.isArray(generatedTurn.parts) ? generatedTurn.parts : [];
  const expectedIndexes = candidateParts.map((_, index) => index);

  const claimLines = planClaims.length === 0
    ? ['- No factual claims are allowed in this reply.']
    : planClaims.map((claim) => `- Claim ${claim.claimOrdinal} [kind=${claim.mode}]: ${claim.text}`);

  const candidateReply = JSON.stringify({
    parts: generatedTurn.parts.map((part) => ({
      kind: part.kind,
      text: part.text,
    })),
    emotion: generatedTurn.emotion,
    intent: generatedTurn.intent,
  });

  const examplePartAudits = candidateParts.map((part, index) => {
    const kind = normalizeOptionalString(part?.kind);
    if (kind === 'social' || kind === 'close' || kind === 'uncertain') {
      return {
        partIndex: index,
        role: kind,
        claimOrdinals: [],
        hedgeSufficient: true,
        notes: `${kind} part`,
      };
    }
    return {
      partIndex: index,
      role: 'knowledge',
      claimOrdinals: planClaims.length > 0 ? [1] : [],
      hedgeSufficient: true,
      notes: 'states only the supported claim(s) in this part',
    };
  });
  const exampleOutput = JSON.stringify({
    partAudits: examplePartAudits,
    unsupportedFacts: [],
  });

  return [
    'You are auditing an NPC reply for supported factual coverage.',
    'Return ONLY one JSON object. No markdown. No explanation.',
    'Your job is classification, not rewriting.',
    'For each reply part, choose exactly one role: social, knowledge, uncertain, close, unsupported.',
    'Role meanings:',
    '- social = brief greeting, acknowledgement, or small-talk with no factual claim',
    '- knowledge = a factual statement that expresses one or more allowed claims',
    '- uncertain = an explicit statement of not knowing or being unsure',
    '- close = a conversational sign-off or wrap-up such as goodbye or "that is all", with no factual claim',
    '- unsupported = factual content that is outside the allowed claim table',
    'Important: close means closing the conversation. It does NOT mean "close enough" or "approximately related."',
    ...buildDeliveryContractPromptLines(getPedagogyContext(turnContext)?.deliveryContract),
    `The candidate reply has exactly ${candidateParts.length} parts.`,
    `You must return exactly ${candidateParts.length} partAudits, one for each partIndex in [${expectedIndexes.join(', ')}].`,
    'Do not invent extra part indexes. Do not omit any candidate part index.',
    'Use role=knowledge only when the part clearly states one or more allowed claims from the claim table.',
    'claimOrdinals must contain only the claim numbers actually stated by that part.',
    'If a part adds any factual content outside the allowed claim table, mark that part unsupported and leave claimOrdinals empty.',
    'Set hedgeSufficient=true only when the part preserves the required certainty for every matched claim.',
    'For grounded claims, hedgeSufficient should be true unless the part sounds weaker than the claim.',
    'For social, uncertain, close, or unsupported parts, claimOrdinals must be empty.',
    'Role constraints by generated part kind:',
    '- generated kind grounded/inferred/rumor -> audit role must be knowledge or unsupported',
    '- generated kind social -> audit role must be social or unsupported',
    '- generated kind uncertain -> audit role must be uncertain or unsupported',
    '- generated kind close -> audit role must be close or unsupported',
    'The allowed claim table may be written as source-language meaning notes, while the candidate reply may be written in the target language.',
    'Judge semantic meaning, not surface wording. A correct Spanish, French, German, Italian, or Portuguese rendering of an allowed English claim still counts as that claim.',
    'Do not downgrade a factual translated answer to close, social, or unsupported just because it is not in the same language as the claim table.',
    'Proper names may remain unchanged across languages. Translated surrounding grammar still matches the same claim.',
    'A generated grounded/inferred/rumor part that clearly expresses an allowed claim in another language should almost always audit as knowledge.',
    'Do not copy a generic example. Use only the actual candidate reply parts shown below.',
    `Query type: ${sanitizePromptText(input.queryType || 'conversation')}`,
    `Route intent: ${sanitizePromptText(input.routeIntent || 'unknown')}`,
    `Player message: ${sanitizePromptText(input.playerMessage || '(none)')}`,
    'Allowed claims:',
    ...claimLines,
    'Candidate reply JSON:',
    candidateReply,
    'Cross-language example:',
    '{"allowedClaim":"Earendale is a small town on a floating chunk of land.","candidatePart":{"kind":"grounded","text":"Earendale es un pueblo pequeno en un pedazo de tierra flotante."},"correctAudit":{"partIndex":0,"role":"knowledge","claimOrdinals":[1],"hedgeSufficient":true,"notes":"same claim in Spanish"}}',
    'Output shape:',
    exampleOutput,
  ].join('\n');
}

function materializeAuditedGroundedTurn(input: {
  generatedTurn: ParsedReplyPartsTurn;
  planClaims: ValidatedPlanClaimSlot[];
  unsupportedFacts?: string[];
  partAudits?: Array<{
    partIndex: number;
    role: 'social' | 'knowledge' | 'uncertain' | 'close' | 'unsupported';
    claimOrdinals: number[];
    hedgeSufficient?: boolean;
    notes?: string;
  }>;
}) {
  const generatedTurn = input.generatedTurn;
  const partAudits = Array.isArray(input.partAudits) ? input.partAudits : [];
  const normalizedPartAudits = partAudits
    .filter((entry) => Number.isFinite(entry?.partIndex))
    .filter((entry) => entry.partIndex >= 0 && entry.partIndex < generatedTurn.parts.length)
    .sort((left, right) => left.partIndex - right.partIndex);
  const auditByIndex = new Map<number, typeof normalizedPartAudits[number]>();
  for (const entry of normalizedPartAudits) {
    if (!auditByIndex.has(entry.partIndex)) {
      auditByIndex.set(entry.partIndex, entry);
    }
  }
  const claimsByOrdinal = new Map(input.planClaims.map((claim) => [claim.claimOrdinal, claim] as const));
  const unsupportedFacts = normalizeStringArray(input.unsupportedFacts);
  if (unsupportedFacts.length > 0) {
    return {
      failureReason: `audit_unsupported_facts:${unsupportedFacts.join(' | ')}`,
      auditedTurn: null,
      acceptedClaimOrdinals: [] as number[],
    };
  }
  if (auditByIndex.size !== generatedTurn.parts.length) {
    return {
      failureReason: `audit_part_count_mismatch:${auditByIndex.size}/${generatedTurn.parts.length}`,
      auditedTurn: null,
      acceptedClaimOrdinals: [] as number[],
    };
  }

  const acceptedClaimOrdinals = new Set<number>();
  const finalParts: ReplyPart[] = [];

  for (let index = 0; index < generatedTurn.parts.length; index += 1) {
    const part = generatedTurn.parts[index];
    const generatedKind = part?.kind;
    const generatedKnowledgeKind = generatedKind === 'grounded' || generatedKind === 'inferred' || generatedKind === 'rumor';
    const audit = auditByIndex.get(index);
    if (!audit) {
      return {
        failureReason: `audit_missing_part:${index}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }

    if (generatedKnowledgeKind && audit.role !== 'knowledge' && audit.role !== 'unsupported') {
      return {
        failureReason: `audit_invalid_role_transition:${index}:${generatedKind}->${audit.role}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }
    if (!generatedKnowledgeKind && generatedKind && audit.role !== generatedKind && audit.role !== 'unsupported') {
      return {
        failureReason: `audit_invalid_role_transition:${index}:${generatedKind}->${audit.role}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }

    if (audit.role === 'unsupported') {
      return {
        failureReason: `audit_unsupported_part:${index}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }

    if (audit.role === 'knowledge') {
      if (audit.claimOrdinals.length === 0) {
        return {
          failureReason: `audit_missing_claim_match:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      const matchedClaims = audit.claimOrdinals
        .map((ordinal) => claimsByOrdinal.get(ordinal))
        .filter((claim): claim is ValidatedPlanClaimSlot => claim != null);
      if (matchedClaims.length !== audit.claimOrdinals.length) {
        return {
          failureReason: `audit_unknown_claim_ordinal:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      const distinctModes = Array.from(new Set(matchedClaims.map((claim) => claim.mode)));
      if (distinctModes.length !== 1) {
        return {
          failureReason: `audit_mixed_claim_modes:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      const resolvedKind = distinctModes[0] as ReplyPartKind;
      if (audit.hedgeSufficient === false || (resolvedKind !== 'grounded' && audit.hedgeSufficient !== true)) {
        return {
          failureReason: `audit_insufficient_hedge:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      const support = Array.from(new Set(
        matchedClaims.flatMap((claim) => claim.supportSlotIds),
      ));
      if (support.length === 0) {
        return {
          failureReason: `audit_missing_support:${index}`,
          auditedTurn: null,
          acceptedClaimOrdinals: [] as number[],
        };
      }
      matchedClaims.forEach((claim) => acceptedClaimOrdinals.add(claim.claimOrdinal));
      finalParts.push({
        kind: resolvedKind,
        text: part.text,
        support,
      });
      continue;
    }

    if (audit.claimOrdinals.length > 0) {
      return {
        failureReason: `audit_nonknowledge_claim_match:${index}`,
        auditedTurn: null,
        acceptedClaimOrdinals: [] as number[],
      };
    }

    if (audit.role === 'social' || audit.role === 'uncertain' || audit.role === 'close') {
      finalParts.push({
        kind: audit.role,
        text: part.text,
      });
      continue;
    }

    return {
      failureReason: `audit_invalid_role:${index}`,
      auditedTurn: null,
      acceptedClaimOrdinals: [] as number[],
    };
  }

  return {
    failureReason: undefined,
    auditedTurn: {
      ...generatedTurn,
      parts: finalParts,
    },
    acceptedClaimOrdinals: [...acceptedClaimOrdinals].sort((left, right) => left - right),
  };
}

function buildSocialFastReplyPartsPrompt(input: RecordLike | null | undefined): string {
  const safeInput = isRecord(input) ? input : {};
  const npcName = safeInput.npcName;
  const playerMessage = safeInput.playerMessage;
  const turnContext = isRecord(safeInput.turnContext)
    ? {
      ...safeInput.turnContext,
      queryType: 'conversation',
      routingIntent: 'social_chat',
    }
    : {
      queryType: 'conversation',
      routingIntent: 'social_chat',
    };
  const socialVocabularyBlock = buildB0SocialVocabularyBlock(turnContext, playerMessage);

  const blocks = [
    `You are ${sanitizePromptText(npcName || 'NPC')}, an NPC in a game.`,
    'This is a social fast-path turn. The player is not asking for grounded lore.',
    'Reply naturally and in character. Sound like a person in the world, not a generic assistant.',
    ...buildLanguageInstructionLines(turnContext),
    'Keep the visible reply concise: 1 to 2 short sentences.',
    'Prefer exactly one social part unless a second social part helps the flow.',
    'Do not use grounded parts.',
    'Do not use uncertain parts.',
    'Do not invent world facts, quest facts, location facts, or private player facts.',
    'Do not dump biography or backstory unless the player directly asks.',
    'If the player greets you, greet them naturally.',
    'If the player introduces themselves, acknowledge that naturally.',
    'Avoid generic filler like "Tell me more", "What can I help with?", or "Could you clarify?" unless it is truly necessary.',
    buildGlobalSafetyBlock(safeInput.globalSafetyBounds),
    buildNpcProfileBlock(safeInput.npcProfile),
    buildTurnContextBlock(turnContext),
    buildPedagogyBlock(turnContext),
    socialVocabularyBlock,
    buildMemoryFactBlock(safeInput.memoryFacts),
    buildHistoryBlock(safeInput.history),
    buildReplyPartsPrompt({
      npcName,
      playerMessage,
      queryType: 'conversation',
      routeIntent: 'social_chat',
      supportSlots: [],
    }),
    'Style examples:',
    'Player: "hello"',
    'Assistant JSON: {"parts":[{"kind":"social","text":"Hi. I\'m the station keeper."}],"emotion":"warm","intent":"conversation","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    'Player: "I\'m Mim."',
    'Assistant JSON: {"parts":[{"kind":"social","text":"Nice to meet you, Mim. I\'m the station keeper."}],"emotion":"warm","intent":"conversation","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    'Player: "thanks"',
    'Assistant JSON: {"parts":[{"kind":"social","text":"You\'re welcome."}],"emotion":"warm","intent":"conversation","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}',
    'For this turn, every part must be kind "social" or "close".',
    `Current player message: ${sanitizePromptText(playerMessage)}`,
  ].filter(Boolean);

  return blocks.join('\n');
}

function buildB0SocialVocabularyBlock(turnContext: unknown, playerMessage: unknown): string | null {
  const pedagogyContext = getPedagogyContext(turnContext);
  const learnerBand = normalizeOptionalString(pedagogyContext?.learnerBand)?.toUpperCase();
  if (learnerBand !== 'B0') return null;

  const targetLanguage = normalizeOptionalString(pedagogyContext?.targetLanguage);
  const supportLanguage = normalizeOptionalString(pedagogyContext?.supportLanguage);
  const supportPolicy = normalizeOptionalString(pedagogyContext?.supportLanguagePolicy);
  const message = normalizeOptionalString(playerMessage) ?? '';
  const vocabulary: string[] = [];

  if (targetLanguage === 'es') {
    if (isLikelyGreetingOnlyMessage(message, targetLanguage)) {
      vocabulary.push('hola', 'si', 'no', 'gracias', 'no se');
    } else {
      const acknowledgement = detectSocialAcknowledgement(message, targetLanguage);
      if (acknowledgement === 'gratitude') {
        vocabulary.push('de nada', 'gracias', 'si', 'no');
      } else if (isLikelySmallTalkQuery(message, targetLanguage)) {
        vocabulary.push('bien', 'mal', 'y tu', 'hola', 'no se');
      } else {
        vocabulary.push('hola', 'si', 'no', 'gracias', 'no se');
      }
    }
  }

  const deduped = Array.from(new Set(
    vocabulary
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  )).slice(0, 8);
  if (deduped.length === 0) return null;

  const lines = [
    `B0 preferred social vocabulary for this turn: ${deduped.join(', ')}.`,
    'Strongly prefer these words or equally basic variants. Do not add decorative target-language words unless they are necessary.',
  ];
  if (
    targetLanguage
    && supportLanguage
    && (supportPolicy === 'full_support' || supportPolicy === 'heavy_support')
  ) {
    lines.push(`If extra warmth is needed, keep it in ${supportLanguage} rather than introducing richer ${targetLanguage} vocabulary.`);
  }
  return lines.join('\n');
}

function shouldPreferDeterministicB0SocialTurn(turnContext: unknown, playerMessage: unknown): boolean {
  const pedagogyContext = getPedagogyContext(turnContext);
  const learnerBand = normalizeOptionalString(pedagogyContext?.learnerBand)?.toUpperCase();
  if (learnerBand !== 'B0') return false;
  return isProtectedShortSocialTurn(
    playerMessage,
    pedagogyContext?.targetLanguage,
  );
}

async function realizeValidatedPlanWithReplyPartsTransport(input: RecordLike | null | undefined) {
  const safeInput = isRecord(input) ? input : {};
  const {
    runtime,
    ensureModelLoaded,
    npcName,
    playerMessage,
    queryType,
    routeIntent,
    plan,
    evidencePack,
    evidenceEntries,
    selfEntityId,
    npcId,
    generationDiagnostics,
  } = safeInput;

  const planClaims = Array.isArray(plan?.claims) ? plan.claims : [];
  const speechAct = normalizeOptionalString(plan?.speechAct) ?? 'chat';
  if (planClaims.length === 0 && speechAct !== 'chat' && speechAct !== 'answer' && speechAct !== 'recall') {
    generationDiagnostics.replyParts.skippedReason = 'no-realization-needed';
    return null;
  }

  const allSupportSlots = buildValidatedPlanSupportSlots({
    plan,
    evidencePack,
    evidenceEntries,
    selfEntityId,
    npcId,
    queryType,
  });
  const claimMetadata = buildValidatedPlanClaimMetadata({
    plan,
    evidencePack,
    supportSlots: allSupportSlots,
    playerMessage,
    turnContext: safeInput.turnContext,
  });
  const allowedSupportSlots = allSupportSlots.filter((slot) => (
    claimMetadata.deliveryClaims.some((claim) => claim.supportSlotIds.includes(slot.slotId))
  ));
  const allowedClaimPreviews = claimMetadata.deliveryClaims.map((claim) => ({
    claimOrdinal: claim.claimOrdinal,
    mode: claim.mode,
    text: claim.text,
    supportSlotIds: claim.supportSlotIds,
  }));

  await ensureModelLoaded();
  generationDiagnostics.draft.attempted = true;
  generationDiagnostics.replyParts.attempted = true;
  generationDiagnostics.replyParts.attemptCount = 0;
  generationDiagnostics.replyParts.repairAttempted = false;
  generationDiagnostics.replyParts.auditAttempted = false;
  generationDiagnostics.replyParts.auditSuccess = false;
  generationDiagnostics.replyParts.auditFailureReason = undefined;
  generationDiagnostics.replyParts.auditRawResponsePreview = undefined;
  generationDiagnostics.replyParts.auditPartsPreview = undefined;
  generationDiagnostics.replyParts.allowedSupportSlots = allowedSupportSlots.map((slot) => slot.slotId);
  generationDiagnostics.replyParts.allowedClaimOrdinals = claimMetadata.allowedClaimOrdinals;
  generationDiagnostics.replyParts.verificationMode = 'generator_auditor';

  let repairReason: string | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    generationDiagnostics.replyParts.attemptCount = attempt;
    generationDiagnostics.replyParts.repairAttempted = attempt > 1;
    generationDiagnostics.replyParts.failureReason = undefined;
    generationDiagnostics.replyParts.rawResponsePreview = undefined;
    generationDiagnostics.replyParts.rawPartsPreview = undefined;
    generationDiagnostics.replyParts.partCount = 0;
    generationDiagnostics.replyParts.groundedPartCount = 0;
    generationDiagnostics.replyParts.acceptedClaimOrdinals = undefined;
    generationDiagnostics.replyParts.auditAttempted = false;
    generationDiagnostics.replyParts.auditSuccess = false;
    generationDiagnostics.replyParts.auditFailureReason = undefined;
    generationDiagnostics.replyParts.auditRawResponsePreview = undefined;
    generationDiagnostics.replyParts.auditPartsPreview = undefined;

    const prompt = attempt === 1
      ? buildPlanBoundReplyPartsPrompt({
        npcName,
        playerMessage,
        queryType,
        routeIntent,
        plan,
        planClaims: claimMetadata.deliveryClaims,
        turnContext: safeInput.turnContext,
        supportSlots: allowedSupportSlots,
      })
      : buildPlanBoundReplyPartsRepairPrompt({
        npcName,
        playerMessage,
        queryType,
        routeIntent,
        plan,
        planClaims: claimMetadata.deliveryClaims,
        turnContext: safeInput.turnContext,
        supportSlots: allowedSupportSlots,
        failureReason: repairReason,
      });
    const generated = await runtime.generateJson({
      kind: 'validated-plan-realization',
      prompt,
      schemaText: REPLY_PARTS_JSON_SCHEMA,
      maxTokens: Math.min(420, 180 + (claimMetadata.deliveryClaims.length * 70)),
      attempt,
      input: {
        npcName,
        playerMessage,
        turnContext: safeInput.turnContext,
        planClaims: claimMetadata.deliveryClaims,
      },
    });

    const replyPartsSourceText = typeof generated.rawText === 'string' && generated.rawText.trim().length > 0
      ? generated.rawText
      : generated.jsonText;
    generationDiagnostics.replyParts.rawResponsePreview = sanitizePromptText(replyPartsSourceText).slice(0, 320);

    const parsedResult = parseReplyPartsResponseDetailed(replyPartsSourceText);
    if (!parsedResult.turn) {
      repairReason = parsedResult.failureReason ?? 'invalid_json';
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = `reply-parts-${repairReason}`;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'parse-failed',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        rawPreview: replyPartsSourceText,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        allowedClaimPreviews,
        validationMode: 'generator_auditor',
      });
      continue;
    }

    generationDiagnostics.replyParts.rawPartsPreview = parsedResult.turn.parts.map((part) => ({
      kind: part.kind,
      text: part.text,
      support: Array.isArray(part.support) ? part.support : undefined,
    }));

    generationDiagnostics.replyParts.auditAttempted = true;
    const auditPrompt = buildGroundedReplyAuditPrompt({
      turnContext: safeInput.turnContext,
      playerMessage,
      queryType,
      routeIntent,
      generatedTurn: parsedResult.turn,
      planClaims: claimMetadata.deliveryClaims,
    });
    const auditGenerated = await runtime.generateJson({
      kind: 'grounded-reply-audit',
      prompt: auditPrompt,
      schemaText: GROUNDED_REPLY_AUDIT_JSON_SCHEMA,
      maxTokens: Math.min(320, 180 + (parsedResult.turn.parts.length * 40)),
      attempt: 1,
      temperature: '0.15',
      input: {
        playerMessage,
        queryType,
        routeIntent,
        generatedTurn: parsedResult.turn,
        planClaims: claimMetadata.deliveryClaims,
        turnContext: safeInput.turnContext,
      },
    });
    const auditSourceText = typeof auditGenerated.rawText === 'string' && auditGenerated.rawText.trim().length > 0
      ? auditGenerated.rawText
      : auditGenerated.jsonText;
    generationDiagnostics.replyParts.auditRawResponsePreview = sanitizePromptText(auditSourceText).slice(0, 320);
    const parsedAudit = parseGroundedReplyAuditDetailed(auditSourceText);
    if (!parsedAudit.audit) {
      repairReason = `audit_${parsedAudit.failureReason ?? 'invalid_json'}`;
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = repairReason;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      generationDiagnostics.replyParts.auditSuccess = false;
      generationDiagnostics.replyParts.auditFailureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'audit-parse-failed',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        rawPreview: replyPartsSourceText,
        auditRawPreview: auditSourceText,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        allowedClaimPreviews,
        candidatePartsPreview: generationDiagnostics.replyParts.rawPartsPreview,
        validationMode: 'generator_auditor',
      });
      continue;
    }

    generationDiagnostics.replyParts.auditPartsPreview = parsedAudit.audit.partAudits.map((part) => ({
      partIndex: part.partIndex,
      role: part.role,
      claimOrdinals: part.claimOrdinals,
      hedgeSufficient: part.hedgeSufficient,
      notes: part.notes,
    }));

    const auditedTurnResult = materializeAuditedGroundedTurn({
      generatedTurn: parsedResult.turn,
      planClaims: claimMetadata.deliveryClaims,
      unsupportedFacts: parsedAudit.audit.unsupportedFacts,
      partAudits: parsedAudit.audit.partAudits,
    });
    generationDiagnostics.replyParts.acceptedClaimOrdinals = auditedTurnResult.acceptedClaimOrdinals;
    if (!auditedTurnResult.auditedTurn) {
      repairReason = auditedTurnResult.failureReason ?? 'audit_rejected';
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = repairReason;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      generationDiagnostics.replyParts.auditSuccess = false;
      generationDiagnostics.replyParts.auditFailureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'audit-rejected',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        rawPreview: replyPartsSourceText,
        auditRawPreview: auditSourceText,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        allowedClaimPreviews,
        candidatePartsPreview: generationDiagnostics.replyParts.rawPartsPreview,
        auditPartsPreview: generationDiagnostics.replyParts.auditPartsPreview,
        validationMode: 'generator_auditor',
      });
      continue;
    }

    const normalized = normalizeReplyPartsForValidation({
      turn: auditedTurnResult.auditedTurn,
      supportSlots: allowedSupportSlots,
      queryType,
    }) ?? auditedTurnResult.auditedTurn;
    const validation = validateReplyPartsContract({
      parts: normalized.parts,
      supportSlots: allowedSupportSlots,
      queryType,
      intent: normalized.intent,
    });
    const realizedKnowledgeParts = normalized.parts.filter((part) => (
      part.kind === 'grounded' || part.kind === 'inferred' || part.kind === 'rumor'
    )).length;
    generationDiagnostics.replyParts.partCount = normalized.parts.length;
    generationDiagnostics.replyParts.groundedPartCount = realizedKnowledgeParts;
    generationDiagnostics.replyParts.auditSuccess = true;
    generationDiagnostics.replyParts.auditFailureReason = undefined;

    if (!validation.valid) {
      repairReason = buildReplyPartsValidationRepairReason(validation);
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = 'reply-parts-validation-failed';
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'contract-rejected',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        rawPreview: replyPartsSourceText,
        auditRawPreview: auditSourceText,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        allowedClaimPreviews,
        candidatePartsPreview: generationDiagnostics.replyParts.rawPartsPreview,
        auditPartsPreview: generationDiagnostics.replyParts.auditPartsPreview,
        validationMode: 'generator_auditor',
      });
      continue;
    }

    const materialized = materializeTurnOutputFromReplyParts({
      turn: {
        ...normalized,
        beatEvidence: isRecord(normalized.beatEvidence)
          ? normalized.beatEvidence
          : {
            coveredFacts: [],
            uncoveredFacts: [],
            completionSignal: 'none',
            confidence: 0,
          },
      },
      supportSlots: allowedSupportSlots,
    });

    emitReplyLanguageDebugLog({
      stage: 'validated-plan-realization-candidate',
      turnContext: safeInput.turnContext,
      npcId: normalizeOptionalString(npcId) ?? undefined,
      routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
      queryType: normalizeOptionalString(queryType) ?? undefined,
      turnPath: 'grounded',
      replyText: materialized.utterance,
      partKinds: normalized.parts.map((part) => part.kind),
    });

    const languageEstimate = estimateTextLanguage(
      materialized.utterance,
      getPedagogyContext(safeInput.turnContext)?.targetLanguage,
    );
    generationDiagnostics.replyParts.estimatedLanguage = languageEstimate.estimatedLanguage;
    generationDiagnostics.replyParts.mismatchSuspected = languageEstimate.mismatchSuspected;
    if (languageEstimate.mismatchSuspected) {
      repairReason = `language_mismatch:${languageEstimate.estimatedLanguage}`;
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = repairReason;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'language-rejected',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        estimatedLanguage: languageEstimate.estimatedLanguage,
        mismatchSuspected: languageEstimate.mismatchSuspected,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        allowedClaimPreviews,
        candidatePartsPreview: generationDiagnostics.replyParts.rawPartsPreview,
        auditPartsPreview: generationDiagnostics.replyParts.auditPartsPreview,
        validationMode: 'generator_auditor',
      });
      continue;
    }

    const deliveryContractCheck = validateReplyAgainstDeliveryContract({
      deliveryContract: getPedagogyContext(safeInput.turnContext)?.deliveryContract,
      utterance: materialized.utterance,
      acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
      knowledgePartCount: realizedKnowledgeParts,
      learnerBand: getPedagogyContext(safeInput.turnContext)?.learnerBand,
      supportLanguagePolicy: getPedagogyContext(safeInput.turnContext)?.supportLanguagePolicy,
    });
    if (!deliveryContractCheck.ok) {
      repairReason = deliveryContractCheck.failureReason ?? 'delivery_contract_rejected';
      generationDiagnostics.draft.success = false;
      generationDiagnostics.draft.failureReason = repairReason;
      generationDiagnostics.replyParts.success = false;
      generationDiagnostics.replyParts.failureReason = repairReason;
      emitPlanRealizationStatusLog({
        stage: 'delivery-contract-rejected',
        strategy: 'generator_auditor',
        attempt,
        turnContext: safeInput.turnContext,
        npcId: normalizeOptionalString(npcId) ?? undefined,
        routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
        queryType: normalizeOptionalString(queryType) ?? undefined,
        turnPath: 'grounded',
        failureReason: repairReason,
        estimatedLanguage: languageEstimate.estimatedLanguage,
        mismatchSuspected: languageEstimate.mismatchSuspected,
        allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
        acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
        allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
        allowedClaimPreviews,
        candidatePartsPreview: generationDiagnostics.replyParts.rawPartsPreview,
        auditPartsPreview: generationDiagnostics.replyParts.auditPartsPreview,
        validationMode: 'generator_auditor',
      });
      continue;
    }

    generationDiagnostics.draft.success = true;
    generationDiagnostics.replyParts.success = true;
    generationDiagnostics.replyParts.failureReason = undefined;
    emitPlanRealizationStatusLog({
      stage: 'accepted',
      strategy: 'generator_auditor',
      attempt,
      turnContext: safeInput.turnContext,
      npcId: normalizeOptionalString(npcId) ?? undefined,
      routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
      queryType: normalizeOptionalString(queryType) ?? undefined,
      turnPath: 'grounded',
      estimatedLanguage: languageEstimate.estimatedLanguage,
      mismatchSuspected: languageEstimate.mismatchSuspected,
      allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
      acceptedClaimOrdinals: auditedTurnResult.acceptedClaimOrdinals,
      allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
      allowedClaimPreviews,
      candidatePartsPreview: generationDiagnostics.replyParts.rawPartsPreview,
      auditPartsPreview: generationDiagnostics.replyParts.auditPartsPreview,
      validationMode: 'generator_auditor',
    });
    return materialized;
  }

  emitPlanRealizationStatusLog({
    stage: 'exhausted',
    strategy: 'generator_auditor',
    attempt: generationDiagnostics.replyParts.attemptCount,
    turnContext: safeInput.turnContext,
    npcId: normalizeOptionalString(npcId) ?? undefined,
    routeIntent: normalizeOptionalString(routeIntent) ?? undefined,
    queryType: normalizeOptionalString(queryType) ?? undefined,
    turnPath: 'grounded',
    failureReason: generationDiagnostics.replyParts.failureReason,
    allowedClaimOrdinals: claimMetadata.allowedClaimOrdinals,
    allowedSupportSlots: allowedSupportSlots.map((slot) => slot.slotId),
    allowedClaimPreviews,
    candidatePartsPreview: generationDiagnostics.replyParts.rawPartsPreview,
    auditPartsPreview: generationDiagnostics.replyParts.auditPartsPreview,
    validationMode: 'generator_auditor',
  });
  return null;
}

function buildMockSocialReplyParts(requestInput: unknown) {
  const input = isRecord(requestInput) ? requestInput : {};
  const npcName = normalizeOptionalString(input.npcName) ?? 'NPC';
  const playerMessage = normalizeOptionalString(input.playerMessage) ?? '';
  const targetLanguage = normalizeOptionalString(getPedagogyContext(input.turnContext)?.targetLanguage);
  const declaredName = extractDeclaredIdentityName(playerMessage, targetLanguage);
  const acknowledgement = detectSocialAcknowledgement(playerMessage, targetLanguage);
  const smallTalkQuery = isLikelySmallTalkQuery(playerMessage, targetLanguage);

  let text = localizeSimpleSocialReply('hi_im_npc', targetLanguage, { npcName });
  if (declaredName) {
    const safeName = declaredName.charAt(0).toUpperCase() + declaredName.slice(1);
    text = localizeSimpleSocialReply('nice_to_meet_you', targetLanguage, {
      npcName,
      playerName: safeName,
    });
  } else if (smallTalkQuery) {
    text = localizeSimpleSocialReply('status_good_and_you', targetLanguage);
  } else if (acknowledgement === 'gratitude') {
    text = localizeSimpleSocialReply('any_time', targetLanguage);
  } else if (acknowledgement === 'shared_preference') {
    text = /\bcheese\b/i.test(playerMessage)
      ? localizeSimpleSocialReply('shared_preference_cheese', targetLanguage)
      : localizeSimpleSocialReply('shared_preference', targetLanguage);
  } else if (acknowledgement) {
    text = localizeSimpleSocialReply('agreement', targetLanguage);
  } else if (!isLikelyGreetingOnlyMessage(playerMessage, targetLanguage) && playerMessage) {
    text = localizeSimpleSocialReply('agreement', targetLanguage);
  }

  return {
    parts: [
      {
        kind: 'social',
        text,
      },
    ],
    emotion: 'warm',
    intent: 'conversation',
    proposedIntents: [],
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
  };
}

async function realizeSocialFastWithReplyPartsTransport(input: RecordLike | null | undefined) {
  const safeInput = isRecord(input) ? input : {};
  const {
    runtime,
    ensureModelLoaded,
    npcName,
    playerMessage,
    history,
    memoryFacts,
    npcProfile,
    globalSafetyBounds,
    turnContext,
    isFirstMeeting,
    generationDiagnostics,
  } = safeInput;

  if (shouldPreferDeterministicB0SocialTurn(turnContext, playerMessage)) {
    generationDiagnostics.replyParts.skippedReason = 'b0_deterministic_social_lane';
    return null;
  }

  await ensureModelLoaded();
  generationDiagnostics.draft.attempted = true;
  generationDiagnostics.replyParts.attempted = true;
  generationDiagnostics.replyParts.attemptCount = 1;
  generationDiagnostics.replyParts.repairAttempted = false;
  generationDiagnostics.replyParts.allowedSupportSlots = [];

  const prompt = buildSocialFastReplyPartsPrompt({
    npcName,
    playerMessage,
    history,
    memoryFacts,
    npcProfile,
    globalSafetyBounds,
    turnContext,
  });

  const generated = await runtime.generateJson({
    kind: 'social-fast-realization',
    prompt,
    schemaText: REPLY_PARTS_JSON_SCHEMA,
    maxTokens: 140,
    attempt: 1,
    temperature: '0.72',
    input: {
      npcName,
      playerMessage,
      turnContext,
      supportSlots: [],
    },
  });

  const replyPartsSourceText = typeof generated.rawText === 'string' && generated.rawText.trim().length > 0
    ? generated.rawText
    : generated.jsonText;
  generationDiagnostics.replyParts.rawResponsePreview = sanitizePromptText(replyPartsSourceText).slice(0, 320);

  const parsed = parseReplyPartsTurnFromText(replyPartsSourceText);
  if (!parsed) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-invalid-json';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'invalid_json';
    return null;
  }

  const normalized = normalizeReplyPartsForValidation({
    turn: parsed,
    supportSlots: [],
    queryType: 'conversation',
  }) ?? parsed;
  generationDiagnostics.replyParts.rawPartsPreview = normalized.parts.map((part) => ({
    kind: part.kind,
    text: part.text,
  }));

  const validation = validateReplyPartsContract({
    parts: normalized.parts,
    supportSlots: [],
    queryType: 'conversation',
    intent: normalized.intent,
  });
  generationDiagnostics.replyParts.partCount = normalized.parts.length;
  generationDiagnostics.replyParts.groundedPartCount = normalized.parts.filter((part) => part.kind === 'grounded').length;

  if (!validation.valid) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-reply-parts-validation-failed';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = buildReplyPartsValidationRepairReason(validation);
    return null;
  }

  if (normalized.parts.some((part) => part.kind !== 'social' && part.kind !== 'close')) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-non-social-part';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'social_fast_requires_social_parts';
    return null;
  }

  const materialized = materializeTurnOutputFromReplyParts({
    turn: {
      ...normalized,
      beatEvidence: isRecord(normalized.beatEvidence)
        ? normalized.beatEvidence
        : {
          coveredFacts: [],
          uncoveredFacts: [],
          completionSignal: 'none',
          confidence: 0,
        },
    },
    supportSlots: [],
  });
  const languageEstimate = estimateTextLanguage(
    materialized.utterance,
    getPedagogyContext(turnContext)?.targetLanguage,
  );
  generationDiagnostics.replyParts.estimatedLanguage = languageEstimate.estimatedLanguage;
  generationDiagnostics.replyParts.mismatchSuspected = languageEstimate.mismatchSuspected;
  if (languageEstimate.mismatchSuspected) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-language-mismatch';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'social_fast_language_mismatch';
    emitPlanRealizationStatusLog({
      stage: 'language-rejected',
      strategy: 'social_fast_reply_parts',
      attempt: 1,
      turnContext,
      routeIntent: 'social_chat',
      queryType: 'conversation',
      turnPath: 'social_fast',
      estimatedLanguage: languageEstimate.estimatedLanguage,
      mismatchSuspected: languageEstimate.mismatchSuspected,
      failureReason: 'social_fast_language_mismatch',
      validationMode: 'social_reply_parts',
    });
    return null;
  }

  const deliveryContractCheck = validateReplyAgainstDeliveryContract({
    deliveryContract: getPedagogyContext(turnContext)?.deliveryContract,
    utterance: materialized.utterance,
    acceptedClaimOrdinals: [],
    knowledgePartCount: 0,
    learnerBand: getPedagogyContext(turnContext)?.learnerBand,
    supportLanguagePolicy: getPedagogyContext(turnContext)?.supportLanguagePolicy,
  });
  if (!deliveryContractCheck.ok) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = deliveryContractCheck.failureReason ?? 'social-fast-delivery-contract-rejected';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = deliveryContractCheck.failureReason ?? 'social_fast_delivery_contract_rejected';
    emitPlanRealizationStatusLog({
      stage: 'delivery-contract-rejected',
      strategy: 'social_fast_reply_parts',
      attempt: 1,
      turnContext,
      routeIntent: 'social_chat',
      queryType: 'conversation',
      turnPath: 'social_fast',
      failureReason: generationDiagnostics.replyParts.failureReason,
      validationMode: 'social_reply_parts',
    });
    return null;
  }

  const quality = validateTurnQuality(
    materialized,
    playerMessage,
    history,
    memoryFacts,
    {
      initiativeAction: 'player_respond',
      npcName,
      isFirstMeeting,
      routingIntent: 'social_chat',
      queryType: 'conversation',
      regionPath: turnContext?.regionPath,
      regionName: turnContext?.regionName,
    },
  );
  if (!quality.valid) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = `social-fast-turn-quality:${quality.reason}`;
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = quality.reason;
    return null;
  }

  if (checkSocialResponseForFactualLeakage(materialized.utterance)) {
    generationDiagnostics.draft.success = false;
    generationDiagnostics.draft.failureReason = 'social-fast-factual-leakage';
    generationDiagnostics.replyParts.success = false;
    generationDiagnostics.replyParts.failureReason = 'social_fast_factual_leakage';
    return null;
  }

  generationDiagnostics.draft.success = true;
  generationDiagnostics.replyParts.success = true;
  generationDiagnostics.replyParts.failureReason = undefined;
  emitReplyLanguageDebugLog({
    stage: 'social-fast-realization-candidate',
    turnContext,
    turnPath: 'social_fast',
    replyText: normalized.parts.map((part) => part.text).join(' '),
    partKinds: normalized.parts.map((part) => part.kind),
  });
  return materialized;
}

function toMode(interactionMode: unknown): 'character' | 'narrative' | 'hybrid' {
  if (interactionMode === 'scripted') return 'narrative';
  if (interactionMode === 'hybrid') return 'hybrid';
  return 'character';
}

function buildHistoryBlock(history: unknown): string {
  const entries = Array.isArray(history) ? history.slice(-MAX_HISTORY_ENTRIES) : [];
  if (entries.length === 0) {
    return 'Recent conversation:\n- none';
  }
  const lines = entries.map((entry) => {
    const role = entry?.role === 'npc' ? 'npc' : 'player';
    const text = sanitizePromptText(entry?.text ?? '').slice(0, 260);
    return `- ${role}: ${text}`;
  });
  return `Recent conversation:\n${lines.join('\n')}`;
}

function buildMemoryFactBlock(memoryFacts: unknown): string {
  const facts = Array.isArray(memoryFacts) ? memoryFacts.slice(-24) : [];
  if (facts.length === 0) return 'Known player facts:\n- none';
  return `Known player facts:\n${facts.map((fact) => `- ${sanitizePromptText(fact).slice(0, 220)}`).join('\n')}`;
}

function buildNpcProfileBlock(npcProfile: unknown): string | null {
  if (!isRecord(npcProfile)) return null;
  const lines: string[] = [];
  const persona = normalizeOptionalString(npcProfile.persona);
  const tone = normalizeOptionalString(npcProfile.tone);
  const constraints = normalizeStringArray(npcProfile.constraints);
  if (persona) lines.push(`- Persona: ${sanitizePromptText(persona).slice(0, 280)}`);
  if (tone) lines.push(`- Tone: ${sanitizePromptText(tone).slice(0, 120)}`);
  if (constraints.length > 0) {
    lines.push(`- Constraints: ${constraints.map((entry) => sanitizePromptText(entry)).join(' | ')}`);
  }
  if (lines.length === 0) return null;
  return ['NPC authored profile:', ...lines].join('\n');
}

function buildGlobalSafetyBlock(globalSafetyBounds: unknown): string | null {
  const bounds = normalizeStringArray(globalSafetyBounds);
  if (bounds.length === 0) return null;
  return [
    'Global safety bounds:',
    ...bounds.map((entry) => `- ${sanitizePromptText(entry)}`),
  ].join('\n');
}

function getPedagogyContext(turnContext: unknown): PluginPedagogyContext | null {
  if (!isRecord(turnContext) || !isRecord(turnContext.pedagogyContext)) return null;
  return turnContext.pedagogyContext as PluginPedagogyContext;
}

function buildPedagogyVocabularyList(pedagogyContext: PluginPedagogyContext): string[] {
  const groundingScope = Array.isArray(pedagogyContext.groundingScope)
    ? pedagogyContext.groundingScope
    : [];
  const focusIds = new Set(pedagogyContext.teachingSubset?.focusLexicalEntryIds ?? []);
  const preferredEntries = focusIds.size > 0
    ? groundingScope.filter((entry) => focusIds.has(entry.lexicalEntryId))
    : groundingScope;

  return Array.from(new Set(
    preferredEntries
      .map((entry) => normalizeOptionalString(entry.targetForm))
      .filter((entry): entry is string => Boolean(entry)),
  )).slice(0, 8);
}

function buildLanguageInstructionLines(turnContext: unknown): string[] {
  const pedagogyContext = getPedagogyContext(turnContext);
  const targetLanguage = normalizeOptionalString(pedagogyContext?.targetLanguage);
  const supportLanguage = normalizeOptionalString(pedagogyContext?.supportLanguage);
  const supportPolicy = normalizeOptionalString(pedagogyContext?.supportLanguagePolicy);
  const learnerBand = normalizeOptionalString(pedagogyContext?.learnerBand)?.toUpperCase();
  const deliveryContract = normalizeDeliveryContract(pedagogyContext?.deliveryContract);

  if (!targetLanguage) {
    return [
      'Respond in the same language as the player message unless asked to switch languages.',
      'If the player message is English, respond in English.',
    ];
  }

  const lines = [
    `Sugarlang target language is ${targetLanguage}. Keep the visible reply in ${targetLanguage}.`,
    deliveryContract
      ? 'Use the delivery contract below to keep factual density and wording at the intended learner level.'
      : 'Prefer simple, learnable target-language wording.',
    'Do not switch back to the player language just because the player wrote in it.',
  ];

  if (deliveryContract?.preferHighFrequencyLexicon) {
    lines.push('Prefer high-frequency, learnable target-language wording when natural.');
  }
  if (deliveryContract?.allowExactNumbers === false) {
    lines.push('Avoid exact numeric details unless they are essential to answer the question.');
  }
  if (learnerBand === 'B0') {
    lines.push('B0 learner band: keep the reply extremely simple and beginner-safe.');
    lines.push('Prefer 1 very short sentence. Avoid idioms, slang, ornate punctuation, and uncommon synonyms.');
  }

  if (supportPolicy === 'target_only') {
    lines.push('Do not include support-language words or translations in the visible reply.');
  } else if (supportPolicy === 'target_dominant') {
    lines.push(
      `Keep the reply overwhelmingly in ${targetLanguage}.` +
      `${supportLanguage ? ` Use ${supportLanguage} only for a tiny clarification if absolutely necessary.` : ''}`,
    );
  } else if (supportPolicy === 'light_support' || supportPolicy === 'heavy_support' || supportPolicy === 'full_support') {
    lines.push(
      `${supportLanguage ? `If a gloss is necessary, keep it short and in ${supportLanguage}.` : 'If a gloss is necessary, keep it very short.'}` +
      ' The target-language reply should still lead.',
    );
    if (learnerBand === 'B0') {
      lines.push(
        `${supportLanguage ? `For B0, a short mixed ${targetLanguage}/${supportLanguage} reply is better than a longer all-${targetLanguage} sentence.` : `For B0, keep the ${targetLanguage} reply to about 2-4 simple words when possible.`}`,
      );
    }
  }

  return lines;
}

function buildPedagogyBlock(turnContext: unknown): string | null {
  const pedagogyContext = getPedagogyContext(turnContext);
  if (!pedagogyContext) return null;

  const lines: string[] = [];
  const targetLanguage = normalizeOptionalString(pedagogyContext.targetLanguage);
  const supportLanguage = normalizeOptionalString(pedagogyContext.supportLanguage);
  const learnerBand = normalizeOptionalString(pedagogyContext.learnerBand);
  const supportPolicy = normalizeOptionalString(pedagogyContext.supportLanguagePolicy);
  const correctionPosture = normalizeOptionalString(pedagogyContext.correctionPosture);
  const deliveryContractSummary = summarizeDeliveryContractForDiagnostics(pedagogyContext.deliveryContract);
  const trackedPoolSize = Array.isArray(pedagogyContext.availableTrackedLexicalEntryIds)
    ? pedagogyContext.availableTrackedLexicalEntryIds.length
    : 0;
  const focusVocabulary = buildPedagogyVocabularyList(pedagogyContext);

  if (targetLanguage) lines.push(`- Target language: ${sanitizePromptText(targetLanguage)}`);
  if (supportLanguage) lines.push(`- Support language: ${sanitizePromptText(supportLanguage)}`);
  if (learnerBand) lines.push(`- Learner band: ${sanitizePromptText(learnerBand)}`);
  if (supportPolicy) lines.push(`- Support policy: ${sanitizePromptText(supportPolicy)}`);
  if (correctionPosture) lines.push(`- Correction posture: ${sanitizePromptText(correctionPosture)}`);
  if (deliveryContractSummary) lines.push(`- Delivery contract: ${deliveryContractSummary}`);
  if (trackedPoolSize > 0) lines.push(`- Tracked vocabulary pool: ${trackedPoolSize} items`);
  if (focusVocabulary.length > 0) {
    lines.push(`- Prefer this target-language vocabulary when natural: ${focusVocabulary.join(', ')}`);
  }
  if (pedagogyContext.ambientHaloAllowance) {
    const halo = pedagogyContext.ambientHaloAllowance;
    lines.push(
      '- Ambient vocabulary allowance:' +
      ` trackedLookahead=${halo.maxTrackedLookahead ?? 0}` +
      ` untrackedPhrases=${halo.maxUntrackedPhrases ?? 0}` +
      ` higherBand=${halo.allowHigherBandTracked ? 'yes' : 'no'}` +
      ` flavor=${halo.allowUntrackedFlavor ? 'yes' : 'no'}`,
    );
  }

  if (lines.length === 0) return null;
  return ['Sugarlang pedagogy context:', ...lines].join('\n');
}

function extractProperNameAnchorsFromClaims(planClaims: Array<{ text?: string }>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const claim of planClaims) {
    const text = sanitizePromptText(claim?.text ?? '');
    if (!text) continue;
    const matches = text.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3}\b/g) ?? [];
    for (const match of matches) {
      const normalized = match.trim();
      if (
        normalized.length < 3
        || normalized === 'I'
        || normalized === 'The'
        || seen.has(normalized)
      ) {
        continue;
      }
      seen.add(normalized);
      output.push(normalized);
      if (output.length >= 8) return output;
    }
  }
  return output;
}

function buildGroundedTargetLanguageAnchorLines(input: {
  turnContext?: unknown;
  planClaims?: Array<{ text?: string }>;
}): string[] {
  const pedagogyContext = getPedagogyContext(input.turnContext);
  const targetLanguage = normalizeOptionalString(pedagogyContext?.targetLanguage);
  if (!targetLanguage || normalizeLanguageCode(targetLanguage) === 'en') return [];
  const deliveryContract = normalizeDeliveryContract(pedagogyContext?.deliveryContract);

  const focusVocabulary = pedagogyContext ? buildPedagogyVocabularyList(pedagogyContext) : [];
  const properNames = extractProperNameAnchorsFromClaims(
    Array.isArray(input.planClaims) ? input.planClaims : [],
  );

  const groundedExample = localizeGroundedReplyExemplar('grounded', targetLanguage);
  const inferredExample = localizeGroundedReplyExemplar('inferred', targetLanguage);
  const rumorExample = localizeGroundedReplyExemplar('rumor', targetLanguage);
  const uncertainExample = localizeGroundedReplyExemplar('uncertain', targetLanguage);

  const lines = [
    `Important: when the target language is ${targetLanguage}, the factual claim notes below are source-language meaning notes only.`,
    `Write the visible factual reply directly in ${targetLanguage}. Do not mirror English relation words from the source notes.`,
    'Proper names may stay as names, but the surrounding grammar and relation words must be in the target language.',
  ];

  if (properNames.length > 0) {
    lines.push(`Proper names you may keep as-is: ${properNames.join(', ')}`);
  }
  if (focusVocabulary.length > 0) {
    lines.push(`Prefer these target-language anchor words when natural: ${focusVocabulary.join(', ')}`);
  }

  lines.push(...buildDeliveryContractPromptLines(deliveryContract));
  lines.push('Target-language factual style examples (imitate the language and simplicity, not the facts):');
  lines.push(`{"parts":[{"kind":"grounded","text":"${groundedExample}"}],"emotion":"grounded","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  lines.push(`{"parts":[{"kind":"inferred","text":"${inferredExample}"}],"emotion":"guarded","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  lines.push(`{"parts":[{"kind":"rumor","text":"${rumorExample}"}],"emotion":"uncertain","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  lines.push(`{"parts":[{"kind":"uncertain","text":"${uncertainExample}"}],"emotion":"uncertain","intent":"uncertain","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":[],"completionSignal":"none","confidence":0}}`);
  return lines;
}

function tokenizeSnippetText(text: unknown): string[] {
  return sanitizePromptText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s_-]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

function scoreCitationSnippet(queryTokens: string[], snippet: unknown): number {
  const snippetTokens = tokenizeSnippetText(snippet);
  if (snippetTokens.length === 0) return 0;
  if (queryTokens.length === 0) return 0.1;
  const snippetSet = new Set(snippetTokens);
  let overlap = 0;
  for (const token of queryTokens) {
    if (snippetSet.has(token)) overlap += 1;
  }
  return overlap / Math.max(1, Math.min(queryTokens.length, 5));
}

function resolveCitationSnippetForMatch(matchEntry: any, query: unknown, loreArtifacts: any): string {
  const chunk = matchEntry?.chunk;
  if (!chunk) return '';

  const fallbackSummary = sanitizePromptText(chunk.summary ?? '');
  const queryTokens = tokenizeSnippetText(query);
  const candidates: string[] = [];

  if (fallbackSummary) {
    candidates.push(fallbackSummary);
  }

  const chunkFactIds = Array.isArray(chunk?.metadata?.fact_ids)
    ? chunk.metadata.fact_ids.filter((entry: unknown): entry is string => typeof entry === 'string')
    : [];
  if (chunkFactIds.length > 0 && isRecord(loreArtifacts?.factById)) {
    for (const factId of chunkFactIds) {
      const fact = loreArtifacts.factById[factId];
      const statement = normalizeOptionalString(fact?.statement);
      if (statement) candidates.push(statement);
    }
  }

  const chunkId = normalizeOptionalString(chunk?.chunkId);
  if (chunkId && isRecord(loreArtifacts?.factsByChunkId)) {
    const factsForChunk = Array.isArray(loreArtifacts.factsByChunkId[chunkId])
      ? loreArtifacts.factsByChunkId[chunkId]
      : [];
    for (const fact of factsForChunk) {
      const statement = normalizeOptionalString(fact?.statement);
      if (statement) candidates.push(statement);
    }
  }

  let bestSnippet = fallbackSummary;
  let bestScore = scoreCitationSnippet(queryTokens, fallbackSummary);
  for (const candidate of candidates) {
    const score = scoreCitationSnippet(queryTokens, candidate);
    if (score > bestScore) {
      bestScore = score;
      bestSnippet = candidate;
    }
  }

  const finalSnippet = normalizeOptionalString(bestSnippet)
    ?? normalizeOptionalString(fallbackSummary)
    ?? `${normalizeOptionalString(chunk.sourceFile) ?? 'lore'}#${normalizeOptionalString(chunk.sectionHeading) ?? 'section'}`;
  return sanitizePromptText(finalSnippet).slice(0, 360);
}

function buildLoreCitationDefaults(loreMatches: unknown, query: unknown, loreArtifacts: any) {
  if (!Array.isArray(loreMatches) || loreMatches.length === 0) return [];
  const defaults: Array<{ sourceId: string; snippet: string }> = [];
  const seenSourceIds = new Set();
  for (const entry of loreMatches.slice(0, 4)) {
    const sourceId = normalizeOptionalString(entry?.chunk?.chunkId);
    if (!sourceId || seenSourceIds.has(sourceId)) continue;
    seenSourceIds.add(sourceId);
    defaults.push({
      sourceId,
      snippet: resolveCitationSnippetForMatch(entry, query, loreArtifacts),
    });
  }
  return defaults;
}

function hydrateModelCitationsWithLore(modelCitations: unknown, loreMatches: unknown, query: unknown, loreArtifacts: any) {
  const defaults = buildLoreCitationDefaults(loreMatches, query, loreArtifacts);
  const defaultsBySourceId = new Map(defaults.map((entry) => [entry.sourceId, entry.snippet]));
  const hydrated: Array<{ sourceId: string; snippet?: string }> = [];
  const seenSourceIds = new Set();
  const source = Array.isArray(modelCitations) ? modelCitations : [];

  for (const rawCitation of source) {
    if (!isRecord(rawCitation)) continue;
    const sourceId = normalizeOptionalString(rawCitation.sourceId);
    if (!sourceId || seenSourceIds.has(sourceId)) continue;
    const snippet = normalizeOptionalString(rawCitation.snippet) ?? defaultsBySourceId.get(sourceId);
    hydrated.push(snippet ? { sourceId, snippet } : { sourceId });
    seenSourceIds.add(sourceId);
  }

  for (const fallbackCitation of defaults) {
    if (seenSourceIds.has(fallbackCitation.sourceId)) continue;
    hydrated.push(fallbackCitation);
    seenSourceIds.add(fallbackCitation.sourceId);
  }

  return hydrated;
}

function buildLoreEvidenceBlock(loreMatches: unknown, query: unknown, loreArtifacts: any): string | null {
  const defaults = buildLoreCitationDefaults(loreMatches, query, loreArtifacts);
  if (defaults.length === 0) return null;
  const lines = defaults.map((entry) => `- ${entry.sourceId}: ${entry.snippet}`);
  return [
    'Lore evidence you may use (prefer these over guessing):',
    ...lines,
    'If you use lore evidence, include citations with sourceId from the list above and a short snippet.',
  ].join('\n');
}

function buildTurnContextBlock(turnContext: unknown): string | null {
  if (!isRecord(turnContext)) return null;
  const lines: string[] = [];
  const gameId = normalizeOptionalString(turnContext.gameId);
  const regionPath = normalizeOptionalString(turnContext.regionPath);
  const regionName = normalizeOptionalString(turnContext.regionName);
  const episodeId = normalizeOptionalString(turnContext.episodeId);
  const queryType = normalizeOptionalString(turnContext.queryType);
  const routingIntent = normalizeOptionalString(turnContext.routingIntent);
  const policyPath = normalizeOptionalString(turnContext.routingPolicyPath);
  const interactionMode = normalizeOptionalString(turnContext.interactionMode);
  const interactionPolicy = normalizeOptionalString(turnContext.interactionPolicy);
  if (gameId) lines.push(`- Game: ${sanitizePromptText(gameId)}`);
  if (regionName) {
    lines.push(`- Current location (authoritative): ${sanitizePromptText(regionName)}`);
  } else if (regionPath) {
    lines.push(`- Current region (authoritative): ${sanitizePromptText(regionPath)}`);
  }
  if (regionPath && regionPath !== regionName) {
    lines.push(`- Region path: ${sanitizePromptText(regionPath)}`);
  }
  if (regionName || regionPath) {
    lines.push('- Treat the current location above as authoritative. A destination the player mentions is not the current location.');
  }
  if (episodeId) lines.push(`- Episode: ${sanitizePromptText(episodeId)}`);
  if (interactionMode) lines.push(`- Interaction mode: ${sanitizePromptText(interactionMode)}`);
  if (interactionPolicy) lines.push(`- Interaction policy: ${sanitizePromptText(interactionPolicy)}`);
  if (queryType) lines.push(`- Query type: ${sanitizePromptText(queryType)}`);
  if (routingIntent) lines.push(`- Routing intent: ${sanitizePromptText(routingIntent)}`);
  if (policyPath) lines.push(`- Routing policy path: ${sanitizePromptText(policyPath)}`);

  const topicCoverage = isRecord(turnContext.topicCoverage) ? turnContext.topicCoverage : null;
  if (topicCoverage) {
    const activeTopic = normalizeOptionalString(topicCoverage.activeTopic);
    const exhausted = topicCoverage.exhausted === true;
    if (activeTopic) {
      lines.push(`- Active topic: ${sanitizePromptText(activeTopic)}`);
    }
    if (exhausted) {
      lines.push('- Active topic appears exhausted; gracefully wrap up and suggest a new topic.');
    }
  }
  const isFirstMeeting = turnContext.isFirstMeeting === true;
  const turnIndex = Number.isFinite(turnContext.turnIndexWithNpc) ? turnContext.turnIndexWithNpc : undefined;
  if (turnIndex != null) {
    lines.push(`- Turn ${turnIndex} with this player${isFirstMeeting ? ' (first meeting)' : ''}`);
  }
  if (!isFirstMeeting) {
    lines.push('- You already know this player. Do NOT re-introduce yourself or repeat your name unless asked.');
  }

  if (lines.length === 0) return null;
  return ['Turn context:', ...lines].join('\n');
}

function buildLlamaPrompt(input: RecordLike | null | undefined): string {
  const safeInput = isRecord(input) ? input : {};
  const {
    npcName,
    playerMessage,
    history,
    memoryFacts,
    npcProfile,
    globalSafetyBounds,
    turnContext,
    supportSlots,
    attempt,
    repair,
    repairReason,
  } = safeInput;

  const blocks = [
    `You are ${npcName}, an NPC in a game.`,
    'Have a short, natural back-and-forth conversation with the player.',
    ...buildLanguageInstructionLines(turnContext),
    'Never repeat the player message verbatim.',
    'Never repeat something you already said in the conversation history.',
    'Keep the total visible reply concise (1-2 sentences).',
    buildGlobalSafetyBlock(globalSafetyBounds),
    buildNpcProfileBlock(npcProfile),
    buildTurnContextBlock(turnContext),
    buildPedagogyBlock(turnContext),
    buildMemoryFactBlock(memoryFacts),
    buildHistoryBlock(history),
    buildReplyPartsPrompt({
      npcName,
      playerMessage,
      queryType: turnContext?.queryType,
      routeIntent: turnContext?.routingIntent,
      supportSlots,
    }),
  ].filter(Boolean);

  if (repair) {
    blocks.push(buildReplyPartsRepairPrompt({
      npcName,
      playerMessage,
      queryType: turnContext?.queryType,
      routeIntent: turnContext?.routingIntent,
      supportSlots,
      failureReason: repairReason,
    }));
  }

  blocks.push(`attempt=${Number.isFinite(attempt) ? attempt : 1}`);
  blocks.push(`Current player message: ${sanitizePromptText(playerMessage)}`);
  return blocks.join('\n');
}

function createGenerationDiagnostics(): GenerationDiagnostics {
  return {
    draft: {
      attempted: false,
      success: false,
      failureReason: undefined,
      skippedReason: undefined,
    },
    replyParts: {
      attempted: false,
      success: false,
      attemptCount: 0,
      repairAttempted: false,
      partCount: 0,
      groundedPartCount: 0,
      failureReason: undefined,
      skippedReason: undefined,
      rawResponsePreview: undefined,
      rawPartsPreview: undefined,
      auditAttempted: undefined,
      auditSuccess: undefined,
      auditFailureReason: undefined,
      auditRawResponsePreview: undefined,
      auditPartsPreview: undefined,
      allowedSupportSlots: undefined,
      allowedClaimOrdinals: undefined,
      acceptedClaimOrdinals: undefined,
      verificationMode: undefined,
      estimatedLanguage: undefined,
      mismatchSuspected: undefined,
    },
  };
}

function resetGenerationDiagnosticsForAttempt(generationDiagnostics: GenerationDiagnostics): void {
  generationDiagnostics.draft.attempted = false;
  generationDiagnostics.draft.success = false;
  generationDiagnostics.draft.failureReason = undefined;
  generationDiagnostics.draft.skippedReason = undefined;

  generationDiagnostics.replyParts.attempted = false;
  generationDiagnostics.replyParts.success = false;
  generationDiagnostics.replyParts.attemptCount = 0;
  generationDiagnostics.replyParts.repairAttempted = false;
  generationDiagnostics.replyParts.partCount = 0;
  generationDiagnostics.replyParts.groundedPartCount = 0;
  generationDiagnostics.replyParts.failureReason = undefined;
  generationDiagnostics.replyParts.skippedReason = undefined;
  generationDiagnostics.replyParts.rawResponsePreview = undefined;
  generationDiagnostics.replyParts.rawPartsPreview = undefined;
  generationDiagnostics.replyParts.auditAttempted = undefined;
  generationDiagnostics.replyParts.auditSuccess = undefined;
  generationDiagnostics.replyParts.auditFailureReason = undefined;
  generationDiagnostics.replyParts.auditRawResponsePreview = undefined;
  generationDiagnostics.replyParts.auditPartsPreview = undefined;
  generationDiagnostics.replyParts.allowedSupportSlots = undefined;
  generationDiagnostics.replyParts.allowedClaimOrdinals = undefined;
  generationDiagnostics.replyParts.acceptedClaimOrdinals = undefined;
  generationDiagnostics.replyParts.verificationMode = undefined;
  generationDiagnostics.replyParts.estimatedLanguage = undefined;
  generationDiagnostics.replyParts.mismatchSuspected = undefined;
}

function normalizeRuntimeMode(runtime: unknown): 'llama' | 'mock' | 'auto' {
  if (runtime === 'llama' || runtime === 'mock') return runtime;
  return 'auto';
}

function dedupeMockLocalizedSentences(text: string): string {
  const parts = text.match(/[^.!?]+[.!?]?/g) ?? [text];
  const deduped: string[] = [];
  for (const part of parts.map((entry) => entry.trim()).filter(Boolean)) {
    const normalized = part.toLowerCase();
    if (normalized === deduped[deduped.length - 1]?.toLowerCase()) continue;
    deduped.push(part);
  }
  return deduped.join(' ').trim();
}

function localizeMockKnowledgeText(
  originalText: string,
  targetLanguage: string | null,
): string {
  if (!originalText || !targetLanguage) return originalText;

  if (targetLanguage === 'es') {
    return dedupeMockLocalizedSentences(
      originalText
        .replace(/(^|[.!?]\s+)The\s+(?=[A-Z])/g, '$1')
        .replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Estamos en $1 ahora.')
        .replace(/\bI remember that\b/gi, 'Recuerdo que')
        .replace(/\bCould you clarify what you want to know\??/gi, 'Puedes decirlo de forma mas simple?')
        .replace(/\bI think that is enough for now\. Goodbye\./gi, 'Creo que ya basta por ahora. Adios.')
        .replace(/\bGot it\. Tell me a little more and I'?ll help where I can\./gi, 'Entiendo. Dime un poco mas y ayudo si puedo.')
        .replace(/\bA town\b/gi, 'Un pueblo')
        .replace(/\blocated on\b/gi, 'ubicado en')
        .replace(/\bfloating chunk of land\b/gi, 'trozo flotante de tierra')
        .replace(/\bthat broke off from\b/gi, 'que se desprendio de')
        .replace(/\bthe ear of the Great Head\b/gi, 'la oreja de la Gran Cabeza')
        .replace(/\bis located just outside of\b/gi, 'esta justo fuera de')
        .replace(/\bis located just outside\b/gi, 'esta justo fuera de')
        .replace(/\blocated just outside of\b/gi, 'justo fuera de')
        .replace(/\blocated just outside\b/gi, 'justo fuera de')
        .replace(/\bthe town\b/gi, 'el pueblo')
        .replace(/\bde el\b/gi, 'del'),
    );
  }

  if (targetLanguage === 'fr') {
    return originalText.replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Nous sommes a $1 maintenant.');
  }
  if (targetLanguage === 'de') {
    return originalText.replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Wir sind jetzt in $1.');
  }
  if (targetLanguage === 'it') {
    return originalText.replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Siamo a $1 adesso.');
  }
  if (targetLanguage === 'pt') {
    return originalText.replace(/\bWe are at\s+(.+?)\s+right now\.?$/i, 'Estamos em $1 agora.');
  }

  return originalText;
}

function createServiceBackedRuntime(input: {
  generationService: JsonGenerationService;
  embeddingsService: EmbeddingsService;
}): SessionRuntime {
  return {
    name: input.generationService.name,
    health: input.generationService.health.bind(input.generationService),
    loadModel: input.generationService.loadModel.bind(input.generationService),
    unloadModel: input.generationService.unloadModel.bind(input.generationService),
    async generateJson(request: JsonGenerationRequest) {
      return input.generationService.generateStructured(request);
    },
    async embed(texts: string[]) {
      return input.embeddingsService.embed(Array.isArray(texts) ? texts : []);
    },
  };
}

function createMockRuntime(embeddingsService: EmbeddingsService): SessionRuntime {
  let loaded = false;

  function buildMockReplyParts(requestInput: unknown) {
    const input = isRecord(requestInput) ? requestInput : {};
    const npcName = normalizeOptionalString(input.npcName) ?? 'NPC';
    const playerMessage = normalizeOptionalString(input.playerMessage) ?? '';
    const queryType = normalizeOptionalString(input.turnContext?.queryType) ?? 'conversation';
    const targetLanguage = normalizeOptionalString(getPedagogyContext(input.turnContext)?.targetLanguage);
    const planClaims = Array.isArray(input.planClaims)
      ? input.planClaims.filter((entry: unknown) => isRecord(entry) && typeof entry.claimOrdinal === 'number')
      : [];

    if (planClaims.length > 0) {
      const selectedClaim = isRecord(planClaims[0]) ? planClaims[0] : null;
      const claimMode = normalizeOptionalString(selectedClaim?.mode);
      const knowledgeKind = claimMode === 'inferred' || claimMode === 'rumor' ? claimMode : 'grounded';
      const baseText = normalizeOptionalString(selectedClaim?.text)
        ?? `${npcName} knows about that.`;
      return {
        parts: [
          {
            kind: knowledgeKind,
            text: localizeMockKnowledgeText(baseText, targetLanguage),
          },
        ],
        emotion: queryType === 'self_query' ? 'warm' : 'grounded',
        intent: 'answer',
        proposedIntents: [],
        beatEvidence: {
          coveredFacts: [],
          uncoveredFacts: [],
          completionSignal: 'none',
          confidence: 0,
        },
      };
    }

    if (isKnowledgeSeekingQueryType(queryType)) {
      return {
        parts: [
          {
            kind: 'uncertain',
            text: createGroundedUncertaintyReply(
              queryType,
              normalizeOptionalString(getPedagogyContext(input?.turnContext)?.targetLanguage),
            ).utterance,
          },
        ],
        emotion: 'uncertain',
        intent: 'uncertain',
        proposedIntents: [],
        beatEvidence: {
          coveredFacts: [],
          uncoveredFacts: [],
          completionSignal: 'none',
          confidence: 0,
        },
      };
    }

    return {
      parts: [
        {
          kind: 'social',
          text: playerMessage
            ? `I heard you say: "${playerMessage}".`
            : `Hello, I am ${npcName}.`,
        },
      ],
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      beatEvidence: {
        coveredFacts: [],
        uncoveredFacts: [],
        completionSignal: 'none',
        confidence: 0,
      },
    };
  }

  function buildMockReplyAudit(requestInput: unknown) {
    const input = isRecord(requestInput) ? requestInput : {};
    const generatedTurn = isRecord(input.generatedTurn) ? input.generatedTurn : {};
    const parts = Array.isArray(generatedTurn.parts) ? generatedTurn.parts : [];
    const planClaims = Array.isArray(input.planClaims)
      ? input.planClaims.filter((entry: unknown) => isRecord(entry) && typeof entry.claimOrdinal === 'number')
      : [];
    const firstClaimOrdinal = Number.isFinite(planClaims[0]?.claimOrdinal)
      ? Math.max(1, Math.floor(Number(planClaims[0].claimOrdinal)))
      : 1;
    const partAudits = parts.map((part, index) => {
      const kind = normalizeOptionalString(part?.kind);
      if (kind === 'social' || kind === 'close' || kind === 'uncertain') {
        return {
          partIndex: index,
          role: kind,
          claimOrdinals: [],
          hedgeSufficient: true,
          notes: 'mock non-knowledge part',
        };
      }
      return {
        partIndex: index,
        role: 'knowledge',
        claimOrdinals: planClaims.length > 0 ? [firstClaimOrdinal] : [],
        hedgeSufficient: true,
        notes: 'mock matched first claim',
      };
    });
    return {
      partAudits,
      unsupportedFacts: [],
    };
  }

  async function generateJson(request: any) {
    if (!loaded) {
      throw new Error('Model must be loaded before generateStructured');
    }
    if (request?.kind === 'social-fast-realization') {
      return {
        jsonText: JSON.stringify(buildMockSocialReplyParts(request?.input ?? request)),
      };
    }
    if (request?.kind === 'grounded-reply-audit') {
      return {
        jsonText: JSON.stringify(buildMockReplyAudit(request?.input ?? request)),
      };
    }
    return {
      jsonText: JSON.stringify(buildMockReplyParts(request?.input ?? request)),
    };
  }
  return {
    name: 'mock',
    async health() {
      return { ok: true, detail: 'mock-runtime-ready' };
    },
    async loadModel() {
      loaded = true;
    },
    async generateJson(request) {
      return generateJson(request);
    },
    async embed(texts) {
      return embeddingsService.embed(Array.isArray(texts) ? texts : []);
    },
    async unloadModel() {
      loaded = false;
    },
  };
}

function defaultPipelineDiagnostics(input: RecordLike | null | undefined): RecordLike {
  const safeInput = isRecord(input) ? input : {};
  const routeIntent = safeInput.routing?.intent ?? 'unclear';
  const policyPath = safeInput.routing?.policyPath ?? 'safe_chat';
  const queryType = safeInput.queryType ?? routeIntentToQueryType(routeIntent);
  const interpretation = isRecord(safeInput.routing?.interpretation) ? safeInput.routing.interpretation : null;
  const semantic = isRecord(safeInput.routing?.semantic) ? safeInput.routing.semantic : {};
  const loreMatchCount = Array.isArray(safeInput.loreMatches) ? safeInput.loreMatches.length : 0;
  const retrieval = isRecord(safeInput.retrieval) ? safeInput.retrieval : {};
  const missingGameLoreBundle = safeInput.missingGameLoreBundle === true;
  const retrievalAttempted = safeInput.retrievalAttempted === true
    || (missingGameLoreBundle && isKnowledgeSeekingQueryType(queryType));
  const retrievalCandidateCount = Number.isFinite(retrieval.candidateCount)
    ? Math.max(0, Math.floor(Number(retrieval.candidateCount)))
    : (retrievalAttempted ? loreMatchCount : 0);
  const retrievalSelectedCount = Number.isFinite(retrieval.selectedCount)
    ? Math.max(0, Math.floor(Number(retrieval.selectedCount)))
    : loreMatchCount;
  const validationErrors = Array.isArray(safeInput.validationErrors) ? safeInput.validationErrors : [];
  const validationDecision = normalizeOptionalString(safeInput.validationDecision)
    ?? (safeInput.usedFallback ? 'fallback' : (validationErrors.length > 0 ? 'repair' : 'accept'));
  const unsupportedClaims = Number.isFinite(safeInput.unsupportedClaims)
    ? Math.max(0, Math.floor(safeInput.unsupportedClaims))
    : 0;
  const requiresRepair = safeInput.requiresRepair === true
    || validationDecision === 'repair'
    || validationDecision === 'fallback';

  return {
    version: 'v2',
    enabled: true,
    mode: toMode(safeInput.turnContext?.interactionMode),
    routeIntent,
    policyPath,
    queryType,
    routing: {
      routeIntent,
      queryType,
      policyPath,
      interpretation: interpretation
        ? {
            lane: normalizeOptionalString(interpretation.lane),
            target: normalizeOptionalString(interpretation.target),
            facet: normalizeOptionalString(interpretation.facet),
            timeframe: normalizeOptionalString(interpretation.timeframe),
            focusText: normalizeOptionalString(interpretation.focusText),
            confidence: Number.isFinite(interpretation.confidence) ? Number(interpretation.confidence) : undefined,
            margin: Number.isFinite(interpretation.margin) ? Number(interpretation.margin) : undefined,
            ambiguous: interpretation.ambiguous === true,
            referentCount: Array.isArray(interpretation.referents) ? interpretation.referents.length : 0,
            topReferent: Array.isArray(interpretation.referents) && interpretation.referents[0]
              ? `${String(interpretation.referents[0].kind)}:${String(interpretation.referents[0].text)}`
              : undefined,
          }
        : undefined,
      semantic: {
        exemplarEnabled: semantic.exemplarEnabled === true,
        exemplarAttempted: semantic.exemplarAttempted === true,
        exemplarChanged: semantic.exemplarChanged === true,
        degradedReason: normalizeOptionalString(semantic.degradedReason),
      },
    },
    retrieval: {
      attempted: retrievalAttempted,
      candidateCount: retrievalCandidateCount,
      selectedCount: retrievalSelectedCount,
      lexicalCandidateCount: Number.isFinite(retrieval.lexicalCandidateCount)
        ? Math.max(0, Math.floor(Number(retrieval.lexicalCandidateCount)))
        : undefined,
      vectorCandidateCount: Number.isFinite(retrieval.vectorCandidateCount)
        ? Math.max(0, Math.floor(Number(retrieval.vectorCandidateCount)))
        : undefined,
      mergedCandidateCount: Number.isFinite(retrieval.mergedCandidateCount)
        ? Math.max(0, Math.floor(Number(retrieval.mergedCandidateCount)))
        : undefined,
      qualityPath: missingGameLoreBundle
        ? 'error'
        : normalizeOptionalString(retrieval.qualityPath)
          ?? (retrievalAttempted ? (retrievalSelectedCount > 0 ? 'single_pass' : 'abstain') : 'not_required'),
      qualityReason: missingGameLoreBundle
        ? 'missing_game_lore_bundle'
        : normalizeOptionalString(retrieval.qualityReason)
          ?? (retrievalAttempted ? (retrievalSelectedCount > 0 ? 'lore-selected' : 'no-lore-selected') : 'not_required'),
      qualityGatePassed: retrieval.qualityGatePassed === true,
      correctiveAttempted: retrieval.correctiveAttempted === true,
      embeddingAvailable: retrieval.embeddingAvailable === true,
      degradedReason: normalizeOptionalString(retrieval.degradedReason),
      vectorModelId: normalizeOptionalString(retrieval.vectorModelId),
    },
    initiative: {
      decision: {
        initiator: 'npc',
        action: 'player_respond',
        primaryGoal: routeIntent === 'social_chat' ? 'social_goal' : 'character_goal',
        secondaryGoals: [policyPath],
        expectedPlayerResponseType: 'free_text',
        reason: `route:${routeIntent}`,
        policyBounded: true,
      },
      inputs: {
        topicCoverage: isRecord(safeInput.turnContext?.topicCoverage) ? safeInput.turnContext.topicCoverage : undefined,
      },
      bounds: {},
      goalStack: [],
    },
    groundingDecision: validationDecision,
    fallbackReason: safeInput.usedFallback ? 'generation-fallback' : undefined,
    validation: {
      decision: validationDecision,
      errors: validationErrors,
      unsupportedClaims,
      requiresRepair,
      source: 'npc_output',
      npcOutputValidated: true,
      progressionGateEvaluated: false,
    },
    generation: isRecord(safeInput.generation) ? safeInput.generation : createGenerationDiagnostics(),
  };
}

function mergeTurnContext(base: unknown, override: unknown): RecordLike {
  const left = isRecord(base) ? base : {};
  const right = isRecord(override) ? override : {};
  const merged = {
    ...left,
    ...right,
  };
  if (isRecord(left.topicCoverage) || isRecord(right.topicCoverage)) {
    merged.topicCoverage = {
      ...(isRecord(left.topicCoverage) ? left.topicCoverage : {}),
      ...(isRecord(right.topicCoverage) ? right.topicCoverage : {}),
    };
  }
  return merged;
}

const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  npc: 'baker',
  debugProvider: undefined,
  runtime: 'llama',
  generation: undefined,
  session: null,
  loreDir: 'plugins/sugaragent/lore/generated',
  useLore: true,
  missingGameLoreBundle: false,
  llamaBin: null,
  modelPath: null,
  llamaTimeoutMs: 120000,
  llamaBinArgs: [],
  llamaArgs: [],
  turnContext: null,
  requireLoreScopeForRetrieval: false,
  generationService: undefined,
  embeddingsService: undefined,
};

function normalizeSessionOptions(options: RecordLike = {}): SessionOptions {
  const normalized = {
    ...DEFAULT_SESSION_OPTIONS,
    ...options,
  } as SessionOptions & {
    provider?: unknown;
    debugProvider?: unknown;
  };
  // The session runtime does not currently load packed SugarAgent authoring artifacts.
  // Preview callers must pass resolved npcProfile/globalSafetyBounds from the host/plugin layer.
  if (typeof normalized.npc !== 'string' || normalized.npc.trim().length === 0) {
    throw new Error('Invalid npc value.');
  }
  const legacyProvider = normalized.provider;
  if (legacyProvider !== undefined && legacyProvider !== 'local' && legacyProvider !== 'echo') {
    throw new Error('Invalid provider. Use "echo" for the legacy debug path.');
  }
  if (normalized.debugProvider !== undefined && normalized.debugProvider !== 'echo') {
    throw new Error('Invalid debugProvider. Use "echo" for the legacy debug path.');
  }
  normalized.debugProvider = normalized.debugProvider === 'echo' || legacyProvider === 'echo'
    ? 'echo'
    : undefined;
  normalized.npc = normalized.npc.trim();
  normalized.useLore = normalized.useLore !== false;
  normalized.llamaTimeoutMs = Number.isFinite(normalized.llamaTimeoutMs)
    ? Math.max(1, Math.floor(normalized.llamaTimeoutMs))
    : 120000;
  normalized.llamaBinArgs = Array.isArray(normalized.llamaBinArgs) ? normalized.llamaBinArgs : [];
  normalized.llamaArgs = Array.isArray(normalized.llamaArgs) ? normalized.llamaArgs : [];
  return normalized;
}

function createEchoReply(message: string): SugarAgentTurnOutput {
  return {
    utterance: `Echo: ${message}`,
    emotion: 'neutral',
    intent: 'echo',
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

function didSemanticInterpretationChange(
  baseRouting: RoutingResult,
  enhancedRouting: RoutingResult,
): boolean {
  const baseInterpretation = isRecord(baseRouting?.interpretation) ? baseRouting.interpretation : null;
  const enhancedInterpretation = isRecord(enhancedRouting?.interpretation) ? enhancedRouting.interpretation : null;
  if ((baseRouting?.intent ?? 'unclear') !== (enhancedRouting?.intent ?? 'unclear')) {
    return true;
  }
  if (!baseInterpretation || !enhancedInterpretation) {
    return false;
  }
  return (
    normalizeOptionalString(baseInterpretation.lane) !== normalizeOptionalString(enhancedInterpretation.lane)
    || normalizeOptionalString(baseInterpretation.target) !== normalizeOptionalString(enhancedInterpretation.target)
    || normalizeOptionalString(baseInterpretation.facet) !== normalizeOptionalString(enhancedInterpretation.facet)
    || normalizeOptionalString(baseInterpretation.timeframe) !== normalizeOptionalString(enhancedInterpretation.timeframe)
  );
}

export async function createSugarAgentSession(options: RecordLike = {}): Promise<SugarAgentSessionRuntime> {
  const args = normalizeSessionOptions(options);
  const sessionId = normalizeOptionalString(args.session) ?? `preview-default-${args.npc}`;
  const session = loadSessionState(sessionId);
  const loreArtifacts = args.useLore ? loadLoreArtifacts(args.loreDir) : null;
  const embeddingsService = args.embeddingsService ?? createLocalEmbeddingsService();
  const requestedRuntimeMode = normalizeRuntimeMode(args.runtime);
  const localGenerationService = args.generationService ?? createLocalLlamaGenerationService({
    llamaBin: args.llamaBin,
    modelPath: args.modelPath,
    llamaTimeoutMs: args.llamaTimeoutMs,
    llamaBinArgs: args.llamaBinArgs,
    llamaArgs: args.llamaArgs,
  });
  let runtime = requestedRuntimeMode === 'mock'
    ? createMockRuntime(embeddingsService)
    : createServiceBackedRuntime({
      generationService: localGenerationService,
      embeddingsService,
    });
  let modelLoaded = false;

  let runtimeHealth = await runtime.health();
  if (!runtimeHealth.ok && requestedRuntimeMode === 'auto') {
    runtime = createMockRuntime(embeddingsService);
    runtimeHealth = await runtime.health();
  } else if (!runtimeHealth.ok && runtime.name !== 'mock') {
    throw new Error(`Local runtime health check failed: ${runtimeHealth.detail ?? 'unknown error'}`);
  }
  const runtimeMode = runtime.name === 'mock' ? 'mock' : 'llama';

  const baseTurnContext = isRecord(args.turnContext) ? args.turnContext : {};

  async function ensureModelLoaded() {
    if (modelLoaded) return;
    await runtime.loadModel('chat-fast');
    modelLoaded = true;
  }

  return {
    startup: {
      runtime: {
        mode: runtimeMode,
        health: runtimeHealth,
        generation: args.generation
          ? {
            provider: args.generation.provider,
            model: args.generation.provider === 'openai'
              ? args.generation.openai.model
              : undefined,
            baseUrl: args.generation.provider === 'openai'
              ? args.generation.openai.baseUrl
              : undefined,
            runtimeMode: args.generation.provider === 'selfHosted'
              ? args.generation.selfHosted.runtimeMode
              : undefined,
          }
          : undefined,
      },
      session: {
        id: sessionId,
        loaded: session.loaded,
        pathToFile: session.pathToFile,
      },
      lore: {
        loaded: Boolean(loreArtifacts),
        chunkCount: Array.isArray(loreArtifacts?.chunks) ? loreArtifacts.chunks.length : 0,
        dir: path.resolve(args.loreDir),
      },
    },
    async runTurn(playerMessage: unknown, turnOptions: RecordLike = {}) {
      const message = normalizeOptionalString(playerMessage);
      if (!message) {
        throw new Error('playerMessage must be a non-empty string');
      }

      const turnOptionsRecord: RecordLike = isRecord(turnOptions) ? turnOptions : {};
      const npcName = normalizeOptionalString(turnOptionsRecord.npcName) ?? args.npc;
      const npcProfile = isRecord(turnOptionsRecord.npcProfileOverride ?? turnOptionsRecord.npcProfile)
        ? (turnOptionsRecord.npcProfileOverride ?? turnOptionsRecord.npcProfile)
        : {};
      const globalSafetyBounds = dedupeMergeStringArrays(
        turnOptionsRecord.globalSafetyBoundsOverride,
        turnOptionsRecord.globalSafetyBounds,
      );

      const npcSessionState = session.state.npcs[args.npc];
      const history = Array.isArray(npcSessionState?.history) ? npcSessionState.history.slice(-MAX_HISTORY_ENTRIES) : [];
      const memoryFacts = getSessionFactsForNpc(session, args.npc);
      const priorPlayerTurns = countPlayerTurns(history);
      const topicCoverageContext = buildTurnTopicCoverageContext(
        getSessionTopicCoverageForNpc(session, args.npc),
        message,
      ) ?? undefined;
      const recentReferentPreview = buildRecentReferentPreview(
        getSessionReferentsForNpc(session, args.npc),
        message,
        {
          activeTopic: topicCoverageContext?.activeTopic ?? null,
        },
      );
      const derivedContext = {
        isFirstMeeting: priorPlayerTurns === 0,
        turnIndexWithNpc: priorPlayerTurns + 1,
        ...(topicCoverageContext ? { topicCoverage: topicCoverageContext } : {}),
      };
      const turnContext = mergeTurnContext(
        mergeTurnContext(baseTurnContext, turnOptionsRecord.context),
        derivedContext,
      );
      const targetLanguage = normalizeOptionalString(getPedagogyContext(turnContext)?.targetLanguage);

      const loreEntityHints = collectLoreEntityRouteMatches(message, loreArtifacts);
      let semanticDiagnostics = {
        exemplarEnabled: true,
        exemplarAttempted: false,
        exemplarChanged: false,
        degradedReason: undefined as string | undefined,
      };
      const interpretationPreview = buildEvidencePreview({
        selfEntityId: npcProfile?.selfEntityId,
        regionName: normalizeOptionalString(turnContext?.regionName),
        regionPath: normalizeOptionalString(turnContext?.regionPath),
        currentActivity: normalizeOptionalString(turnContext?.currentActivity),
        currentGoal: normalizeOptionalString(turnContext?.currentGoal),
        activeTopic: topicCoverageContext?.activeTopic ?? undefined,
        recentReferents: recentReferentPreview,
        loreScopes: normalizeStringArray(npcProfile?.loreScopes),
        selfLoreScopes: normalizeStringArray(npcProfile?.selfLoreScopes),
        relatedLoreScopes: normalizeStringArray(npcProfile?.relatedLoreScopes),
        entityIds: loreEntityHints
          .filter((entry) => entry.filterKind === 'entityIds')
          .map((entry) => entry.entityId),
        locationIds: loreEntityHints
          .filter((entry) => entry.filterKind === 'locationIds')
          .map((entry) => entry.entityId),
        tagHints: loreEntityHints.map((entry) => entry.matchedText),
      });
      const baseRouting = routeTurnIntent(message, npcName, {
        targetLanguage,
        history,
        scene: {
          regionName: normalizeOptionalString(turnContext?.regionName),
          regionPath: normalizeOptionalString(turnContext?.regionPath),
          currentActivity: normalizeOptionalString(turnContext?.currentActivity),
          currentGoal: normalizeOptionalString(turnContext?.currentGoal),
        },
        loreEntityHints,
        evidencePreview: interpretationPreview,
      });
      let embeddingDegradedReason: string | null = null;
      let interpretedRouting = baseRouting;
      // Phase B closed with exemplar-assisted interpretation as the default
      // semantic path. Degraded lexical-only scoring is fallback behavior only
      // when embeddings fail or are unavailable; it is not an alternate main
      // path and should stay observable in logs/diagnostics.
      if (baseRouting.interpretation) {
        semanticDiagnostics.exemplarAttempted = true;
        try {
          const enhancedRouting = routeTurnIntentFromInterpretation(
            message,
            await enhanceInterpretationWithFacetSimilarity({
              interpretation: baseRouting.interpretation,
              embedTexts: (texts) => runtime.embed(texts),
            }),
            {
              targetLanguage,
              explicitLoreMatchCount: loreEntityHints.length,
            },
          );
          semanticDiagnostics.exemplarChanged = didSemanticInterpretationChange(baseRouting, enhancedRouting);
          interpretedRouting = enhancedRouting;
        } catch (error) {
          embeddingDegradedReason = error instanceof Error ? error.message : String(error);
          semanticDiagnostics.degradedReason = embeddingDegradedReason;
        }
      }
      const routingRefinement = refineRouteWithLoreEntityMentions({
        route: interpretedRouting,
        playerMessage: message,
        loreArtifacts,
      });
      let resolvedRouting = routingRefinement.route;
      if (resolvedRouting.interpretation) {
        resolvedRouting = {
          ...resolvedRouting,
          interpretation: await attachSubjectSelectionToInterpretation({
            interpretation: resolvedRouting.interpretation,
            playerMessage: message,
            routeMatches: routingRefinement.matches,
            recentReferents: recentReferentPreview,
            selfEntityId: npcProfile?.selfEntityId,
            embedTexts: runtime.embed.bind(runtime),
          }),
        };
      }
      const queryType: QueryType = (() => {
        const explicit = normalizeOptionalString(turnContext.queryType);
        return explicit === 'conversation'
          || explicit === 'self_query'
          || explicit === 'other_query'
          || explicit === 'world_query'
          || explicit === 'mixed_query'
          ? explicit
          : routeIntentToQueryType(resolvedRouting.intent);
      })();
      emitRoutingRefinementDebugLog({
        npcId: args.npc,
        playerMessage: message,
        routeIntent: resolvedRouting.intent,
        queryType,
        matches: routingRefinement.matches,
        retrievalFilters: routingRefinement.retrievalFilters,
      });
      emitSubjectSelectionDebugLog({
        npcId: args.npc,
        routeIntent: resolvedRouting.intent,
        queryType,
        primaryReferent: resolvedRouting.interpretation?.primaryReferent,
        relationPolicy: resolvedRouting.interpretation?.relationPolicy,
      });
      turnContext.queryType = queryType;
      turnContext.routingIntent = resolvedRouting.intent;
      turnContext.routingPolicyPath = resolvedRouting.policyPath;
      const generationDiagnostics = createGenerationDiagnostics();

      if (args.debugProvider === 'echo') {
        const output = createEchoReply(message);
        generationDiagnostics.draft.skippedReason = 'echo_provider';
        generationDiagnostics.replyParts.skippedReason = 'echo_provider';
        applyTurnToSession(session, args.npc, message, output.utterance, {
          referentCandidates: buildTurnReferentCandidates({
            playerMessage: message,
            targetLanguage,
            npcName,
            activeTopic: topicCoverageContext?.activeTopic ?? null,
            sceneRegionName: normalizeOptionalString(turnContext?.regionName),
            sceneRegionPath: normalizeOptionalString(turnContext?.regionPath),
            loreEntityHints,
            interpretation: resolvedRouting.interpretation,
          }),
          activeTopic: topicCoverageContext?.activeTopic ?? null,
        });
        return {
          output,
          attempts: 1,
          usedFallback: false,
          validationErrors: [],
          loreMatches: [],
          routing: resolvedRouting,
          pipeline: defaultPipelineDiagnostics({
            routing: {
              ...resolvedRouting,
              semantic: semanticDiagnostics,
            },
            queryType,
            loreMatches: [],
            retrievalAttempted: false,
            retrieval: embeddingDegradedReason
              ? {
                  embeddingAvailable: false,
                  degradedReason: embeddingDegradedReason,
                  vectorModelId: LOCAL_EMBEDDING_MODEL_ID,
                }
              : undefined,
            missingGameLoreBundle: args.missingGameLoreBundle === true,
            usedFallback: false,
            validationErrors: [],
            turnContext,
            generation: generationDiagnostics,
          }),
          grounding: {
            summary: {
              decision: 'accept',
              unsupportedCount: 0,
            },
          },
        };
      }

      const loreScopes = normalizeStringArray(npcProfile?.loreScopes);
      const selfLoreScopes = normalizeStringArray(npcProfile?.selfLoreScopes);
      const relatedLoreScopes = normalizeStringArray(npcProfile?.relatedLoreScopes);
      const hasScopes = loreScopes.length > 0 || selfLoreScopes.length > 0 || relatedLoreScopes.length > 0;
      const requireScopes = args.requireLoreScopeForRetrieval === true;
      const canRetrieveLore = Boolean(loreArtifacts);
      const shouldAttemptLoreRetrieval = canRetrieveLore
        && (
          isKnowledgeSeekingQueryType(queryType)
          || routeIntentUsesLore(resolvedRouting.intent)
          || resolvedRouting.interpretation?.lane === 'knowledge'
        )
        && (!requireScopes || hasScopes);

      const governedRetrieval = await runGovernedLoreRetrieval({
        loreArtifacts,
        canRetrieveLore,
        shouldAttemptLoreRetrieval,
        playerMessage: message,
        interpretation: resolvedRouting.interpretation,
        mode: toMode(turnContext?.interactionMode),
        routingIntent: resolvedRouting.intent,
        queryType,
        activeBeatId: normalizeOptionalString(turnOptionsRecord.beatContract?.beatId),
        loreScopes,
        selfLoreScopes,
        relatedLoreScopes,
        selfEntityId: npcProfile.selfEntityId,
        hasBeatContract: Boolean(turnOptionsRecord.beatContract),
        rerankCache: undefined,
        artifactVersion: undefined,
        modelVersion: LOCAL_EMBEDDING_MODEL_ID,
        rerankerClass: 'lexical',
        retrievalFilters: routingRefinement.retrievalFilters,
        embedTexts: (texts) => runtime.embed(texts),
      });
      const retrieval = {
        attempted: governedRetrieval.governance.attempted,
        matches: governedRetrieval.loreMatches,
        quality: governedRetrieval.retrievalQuality,
        governance: governedRetrieval.governance,
        embeddingDegradedReason,
      };
      emitSelfRetrievalGateDebugLog({
        npcId: args.npc,
        routeIntent: resolvedRouting.intent,
        queryType,
        selfEntityId: npcProfile.selfEntityId,
        loreScopes,
        selfLoreScopes,
        relatedLoreScopes,
        loreArtifacts,
        retrievalAttempted: retrieval.attempted,
        retrievalMatchCount: retrieval.matches.length,
      });
      emitSelfRetrievalQualityDebugLog({
        npcId: args.npc,
        routeIntent: resolvedRouting.intent,
        queryType,
        retrieval,
      });
      emitRetrievalTopMatchesDebugLog({
        npcId: args.npc,
        routeIntent: resolvedRouting.intent,
        queryType,
        retrievalFilters: routingRefinement.retrievalFilters,
        matches: retrieval.matches,
      });
      const groundingEvidenceEntries = buildGroundingEvidenceEntries({
        loreMatches: retrieval.matches,
        loreArtifacts,
        npcId: args.npc,
        npcName,
        npcProfile,
        selfEntityId: npcProfile.selfEntityId,
        memoryFacts,
        playerMessage: message,
        history,
        regionPath: turnContext?.regionPath,
        regionName: turnContext?.regionName,
        currentActivity: turnContext?.currentActivity,
        currentGoal: turnContext?.currentGoal,
      });
      // ---------------------------------------------------------------
      // Evidence-first pipeline (ADR-SA-025)
      // Knowledge turns create and validate a plan before any LLM call.
      // The LLM generation loop below is used as the realization transport
      // for already-validated plans, or as fallback for social turns.
      // ---------------------------------------------------------------
      const mode = toMode(turnContext?.interactionMode);
      const hasBeatContract = Boolean(turnOptionsRecord.beatContract);
      const resolvedMode = resolveConversationMode(turnContext, hasBeatContract);
      const evidencePackForPipeline = buildEvidencePack({
        evidenceEntries: groundingEvidenceEntries,
        loreMatches: retrieval.matches,
        mode: resolvedMode,
        playerMessage: message,
        queryType,
        routing: resolvedRouting,
        selfEntityId: npcProfile.selfEntityId,
        npcId: args.npc,
      });
      const enrichedEvidencePack = enrichEvidencePackWithEpistemics(
        evidencePackForPipeline,
        turnOptionsRecord.beatContract,
      );
      const snapshot = buildNpcStateSnapshot({
        npcId: args.npc,
        npcName,
        selfEntityId: npcProfile.selfEntityId,
        mode: resolvedMode,
        locationId: normalizeOptionalString(turnContext?.regionName)
          ?? normalizeOptionalString(turnContext?.regionPath),
        currentActivity: normalizeOptionalString(turnContext?.currentActivity),
        currentGoal: normalizeOptionalString(turnContext?.currentGoal),
        activeBeatId: normalizeOptionalString(turnOptionsRecord.beatContract?.beatId),
      });

      // Resolve initiative policy
      const playerHasQuestion = hasLikelyQuestionForm(message);
      const turnIndexWithNpc = derivedContext.turnIndexWithNpc;
      const noveltyState = computeNoveltyState({
        history,
        turnIndexWithNpc,
        routingIntent: resolvedRouting.intent,
        topicCoverage: topicCoverageContext,
        playerMessage: message,
        normalizeForEchoCheck: (text: string) => sanitizePromptText(text).toLowerCase(),
        maxNovelty: 0.34,
      });
      const relevantEvidenceItems = enrichedEvidencePack.items.filter((item) => isEvidenceItemRelevantForTurn(item, {
        queryType,
        routeIntent: resolvedRouting.intent,
        selfEntityId: npcProfile.selfEntityId,
        npcId: args.npc,
      }));
      const hasDirectAnswerEvidence = hasDirectAnswerableStateEvidence(
        relevantEvidenceItems,
        resolvedRouting.interpretation ?? message,
      );

      const initiativePolicy = resolveInitiativePolicy({
        mode: resolvedMode,
        routingIntent: resolvedRouting.intent,
        queryType,
        interpretation: resolvedRouting.interpretation,
        playerMessage: message,
        playerHasQuestion,
        turnIndexWithNpc,
        noveltyState,
        beatContract: turnOptionsRecord.beatContract,
        hasEvidence: relevantEvidenceItems.length > 0,
        hasDirectAnswerEvidence,
        retrievalConfidence: computeEvidenceBackedRetrievalConfidence({
          queryType,
          routeIntent: resolvedRouting.intent,
          retrievalMatches: retrieval.matches,
          evidenceItems: relevantEvidenceItems,
        }),
        isFirstMeeting: derivedContext.isFirstMeeting,
      });

      // Resolve delivery-language context from Sugarlang pedagogy first,
      // then fall back to any SugarAgent-local language model if present.
      const adaptationContext = buildSugarlangLanguageAdaptationContext(getPedagogyContext(turnContext))
        ?? await resolveLanguageAdaptationContext(null, null);
      snapshot.deliveryLanguageContext = adaptationContext;

      // Run the evidence-first pipeline
      const efResult = await runEvidenceFirstPipeline({
        playerMessage: message,
        recentNpcReplies: history
          .filter((entry) => isRecord(entry) && entry.role === 'npc' && typeof entry.text === 'string')
          .slice(-3)
          .map((entry) => String(entry.text ?? '')),
        routing: resolvedRouting,
        snapshot,
        evidencePack: evidencePackForPipeline,
        initiativePolicy,
        beatContract: turnOptionsRecord.beatContract,
        adaptationContext,
        loreEntityIds: routingRefinement.loreEntityIds,
      });

      let efOutput = efResult.output;
      let efPlanAcceptable = efResult.validatedPlan?.acceptable !== false;
      const validationErrors = Array.isArray(efResult.validatedPlan?.errors)
        ? [...efResult.validatedPlan.errors]
        : [];
      const validatedPlan = efResult.validatedPlan?.plan ?? efResult.plan;
      const groundedTurn = efResult.turnRouting?.path === 'grounded';
      const socialFastTurn = efResult.turnRouting?.path === 'social_fast';
      const canUseModelRealization = groundedTurn
        && efPlanAcceptable
        && validatedPlan
        && (
          validatedPlan.speechAct === 'answer'
          || validatedPlan.speechAct === 'recall'
          || validatedPlan.speechAct === 'chat'
        );

      if (canUseModelRealization) {
        const realized = await realizeValidatedPlanWithReplyPartsTransport({
          runtime,
          ensureModelLoaded,
          npcName,
          playerMessage: message,
          queryType,
          routeIntent: resolvedRouting.intent,
          plan: validatedPlan,
          evidencePack: enrichedEvidencePack,
          evidenceEntries: groundingEvidenceEntries,
          selfEntityId: npcProfile.selfEntityId,
          npcId: args.npc,
          turnContext,
          generationDiagnostics,
        });

        if (realized) {
          efOutput = realized;
          efResult.diagnostics.semanticVerification = undefined;
          efResult.diagnostics.deterministicFallbackUsed = false;
        } else {
          efResult.diagnostics.deterministicFallbackUsed = true;
          const replyPartsFailureReason = normalizeOptionalString(generationDiagnostics.replyParts.failureReason);
          if (replyPartsFailureReason) {
            validationErrors.push(replyPartsFailureReason);
          }
        }
      } else if (socialFastTurn) {
        const realized = await realizeSocialFastWithReplyPartsTransport({
          runtime,
          ensureModelLoaded,
          npcName,
          playerMessage: message,
          history,
          memoryFacts,
          npcProfile,
          globalSafetyBounds,
          turnContext,
          isFirstMeeting: derivedContext.isFirstMeeting,
          generationDiagnostics,
        });
        if (realized) {
          efOutput = realized;
          efResult.diagnostics.deterministicFallbackUsed = false;
        } else {
          efResult.diagnostics.deterministicFallbackUsed = true;
          const replyPartsFailureReason = normalizeOptionalString(generationDiagnostics.replyParts.failureReason);
          if (replyPartsFailureReason) {
            validationErrors.push(replyPartsFailureReason);
          }
        }
      } else {
        generationDiagnostics.replyParts.skippedReason = generationDiagnostics.replyParts.skippedReason ?? 'deterministic-plan';
      }
      const enforcedTargetLanguage = normalizeLanguageCode(adaptationContext?.targetLanguage);
      if (
        groundedTurn
        && enforcedTargetLanguage
        && enforcedTargetLanguage !== 'en'
      ) {
        const deliveryEstimate = estimateTextLanguage(efOutput.utterance, enforcedTargetLanguage);
        if (deliveryEstimate.mismatchSuspected) {
          const mismatchReason = `delivery-language-mismatch:${deliveryEstimate.estimatedLanguage}`;
          validationErrors.push(mismatchReason);
          generationDiagnostics.replyParts.failureReason = generationDiagnostics.replyParts.failureReason ?? mismatchReason;
          efOutput = createGroundedUncertaintyReply(queryType, adaptationContext?.targetLanguage);
          efResult.diagnostics.deterministicFallbackUsed = true;
          emitPlanRealizationStatusLog({
            stage: 'fallback-enforced',
            strategy: 'target_language_guardrail',
            attempt: generationDiagnostics.replyParts.attemptCount,
            turnContext,
            npcId: args.npc,
            routeIntent: resolvedRouting.intent,
            queryType,
            turnPath: efResult.turnRouting?.path,
            estimatedLanguage: deliveryEstimate.estimatedLanguage,
            mismatchSuspected: deliveryEstimate.mismatchSuspected,
            failureReason: mismatchReason,
            allowedClaimOrdinals: generationDiagnostics.replyParts.allowedClaimOrdinals,
            acceptedClaimOrdinals: generationDiagnostics.replyParts.acceptedClaimOrdinals,
            allowedSupportSlots: generationDiagnostics.replyParts.allowedSupportSlots,
            validationMode: generationDiagnostics.replyParts.verificationMode,
          });
        }
      }
      efResult.diagnostics.deliveryLanguageContextApplied = (adaptationContext ?? null) != null;

      const acceptedPlan = validatedPlan ?? {
        claims: [],
        memoryWrites: [],
      };
      const persistedMemoryWrites = [
        ...filterMemoryWrites({ plan: acceptedPlan }),
        ...extractNpcCommitments(efOutput.utterance, acceptedPlan),
      ];
      emitReplyLanguageDebugLog({
        stage: 'delivered-turn',
        turnContext,
        npcId: args.npc,
        routeIntent: resolvedRouting.intent,
        queryType,
        turnPath: efResult.turnRouting?.path,
        replyText: efOutput.utterance,
      });
      const persistedReferentCandidates = buildTurnReferentCandidates({
        playerMessage: message,
        targetLanguage,
        npcName,
        activeTopic: topicCoverageContext?.activeTopic ?? null,
        sceneRegionName: normalizeOptionalString(turnContext?.regionName),
        sceneRegionPath: normalizeOptionalString(turnContext?.regionPath),
        loreEntityHints,
        interpretation: resolvedRouting.interpretation,
      });

      applyTurnToSession(session, args.npc, message, efOutput.utterance, {
        memoryWrites: persistedMemoryWrites,
        referentCandidates: persistedReferentCandidates,
        activeTopic: topicCoverageContext?.activeTopic ?? null,
      });

      validationErrors.sort();
      const dedupedValidationErrors = validationErrors.filter((entry, index, entries) => entries.indexOf(entry) === index);
      const usedFallback = efResult.diagnostics.deterministicFallbackUsed === true || efPlanAcceptable === false;

      const pipeline = defaultPipelineDiagnostics({
        routing: {
          ...resolvedRouting,
          semantic: semanticDiagnostics,
        },
        queryType,
        loreMatches: retrieval.matches,
        retrieval: {
          attempted: retrieval.attempted,
          candidateCount: retrieval.governance.candidateCount,
          selectedCount: retrieval.governance.selectedCount,
          lexicalCandidateCount: retrieval.governance.lexicalCandidateCount,
          vectorCandidateCount: retrieval.governance.vectorCandidateCount,
          mergedCandidateCount: retrieval.governance.mergedCandidateCount,
          qualityPath: retrieval.governance.qualityPath,
          qualityReason: retrieval.governance.qualityReason,
          qualityGatePassed: retrieval.governance.qualityGatePassed,
          correctiveAttempted: retrieval.governance.correctiveAttempted,
          embeddingAvailable: retrieval.governance.embeddingAvailable,
          degradedReason: retrieval.governance.degradedReason ?? retrieval.embeddingDegradedReason ?? undefined,
          vectorModelId: LOCAL_EMBEDDING_MODEL_ID,
        },
        retrievalAttempted: retrieval.attempted,
        missingGameLoreBundle: args.missingGameLoreBundle === true,
        usedFallback,
        validationErrors: dedupedValidationErrors,
        validationDecision: usedFallback ? 'fallback' : (efPlanAcceptable ? 'accept' : 'repair'),
        unsupportedClaims: efResult.validatedPlan?.droppedClaims?.length ?? 0,
        requiresRepair: usedFallback || !efPlanAcceptable,
        turnContext,
        generation: generationDiagnostics,
      });
      pipeline.retrievalQuality = retrieval.quality;
      pipeline.evidenceFirst = efResult.diagnostics;
      pipeline.evidenceFirst.retrievalGovernance = retrieval.governance;
      pipeline.version = 'evidence_first_v1';

      return {
        output: efOutput,
        attempts: generationDiagnostics.replyParts.attemptCount,
        usedFallback,
        fallbackKind: usedFallback ? 'deterministic_runtime' : undefined,
        validationErrors: dedupedValidationErrors,
        loreMatches: retrieval.matches,
        routing: resolvedRouting,
        pipeline,
        grounding: {
          summary: {
            decision: usedFallback ? 'fallback' : (efPlanAcceptable ? 'accept' : 'repair'),
            unsupportedCount: efResult.validatedPlan?.droppedClaims?.length ?? 0,
          },
        },
      };
    },
  };
}
