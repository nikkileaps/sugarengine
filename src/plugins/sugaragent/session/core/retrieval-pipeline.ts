import { retrieveLoreChunks } from '../../lore/lore-lib';
import {
  expandFacetQueryTokenVariants,
  extractFacetQueryTokens,
} from './knowledge-query';
import {
  isKnowledgeSeekingQueryType,
  type QueryType,
  type RoutingIntent,
} from './routing';
import {
  buildCorrectiveLoreQuery,
  buildRerankCacheKey,
  evaluateRetrievalQuality,
  normalizeConversationModeForPolicy,
  rerankLoreMatches,
  resolveRerankBudgetTier,
  resolveRerankCandidateCap,
} from './retrieval-governance';
import type { QueryInterpretation } from './turn-contracts';

interface RecordLike {
  [key: string]: unknown;
}

interface ScopedRetrievalPoolsInput {
  queryType: QueryType;
  routingIntent: RoutingIntent | 'unclear';
  loreScopes?: unknown;
  selfLoreScopes?: unknown;
  relatedLoreScopes?: unknown;
}

interface ScopedRetrievalPools {
  loreScopes: string[];
  selfLoreScopes: string[];
  relatedLoreScopes: string[];
}

interface CorrectiveRetrievalInput {
  qualityReason?: string;
  queryType: QueryType;
  routingIntent: RoutingIntent | 'unclear';
  loreScopes?: unknown;
  selfLoreScopes?: unknown;
  relatedLoreScopes?: unknown;
  selfEntityId?: unknown;
}

interface RetrievalFilters {
  entityIds?: string[];
  locationIds?: string[];
  factionIds?: string[];
}

type RerankCache = Map<string, { ranked: Array<Record<string, unknown>> }>;

interface GovernedLoreRetrievalInput {
  loreArtifacts: unknown;
  canRetrieveLore: boolean;
  shouldAttemptLoreRetrieval: boolean;
  playerMessage: string;
  interpretation?: QueryInterpretation | null;
  mode: unknown;
  routingIntent: RoutingIntent | 'unclear';
  queryType: QueryType;
  activeBeatId?: string;
  loreScopes?: unknown;
  selfLoreScopes?: unknown;
  relatedLoreScopes?: unknown;
  selfEntityId?: unknown;
  hasBeatContract: boolean;
  rerankCache?: RerankCache;
  artifactVersion?: unknown;
  modelVersion?: unknown;
  rerankerClass?: string;
  retrievalFilters?: RetrievalFilters;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function hasRetrievalScopes({
  loreScopes,
  selfLoreScopes,
  relatedLoreScopes,
}: {
  loreScopes?: unknown;
  selfLoreScopes?: unknown;
  relatedLoreScopes?: unknown;
}): boolean {
  return (Array.isArray(loreScopes) && loreScopes.length > 0)
    || (Array.isArray(selfLoreScopes) && selfLoreScopes.length > 0)
    || (Array.isArray(relatedLoreScopes) && relatedLoreScopes.length > 0);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function buildInterpretationRetrievalQuery(
  playerMessage: unknown,
  interpretation?: QueryInterpretation | null,
): string {
  if (!interpretation || typeof interpretation !== 'object') return String(playerMessage ?? '');
  const focusText = typeof interpretation.focusText === 'string' && interpretation.focusText.trim().length > 0
    ? interpretation.focusText.trim()
    : String(playerMessage ?? '').trim();
  const expandedTokens: string[] = [];
  const seen = new Set<string>();
  for (const token of extractFacetQueryTokens(interpretation)) {
    for (const variant of expandFacetQueryTokenVariants(token)) {
      if (!variant || seen.has(variant)) continue;
      seen.add(variant);
      expandedTokens.push(variant);
    }
  }
  return expandedTokens.length > 0
    ? `${focusText} ${expandedTokens.join(' ')}`
    : focusText || String(playerMessage ?? '');
}

function deriveScopedRetrievalPools({
  queryType,
  routingIntent,
  loreScopes,
  selfLoreScopes,
  relatedLoreScopes,
}: ScopedRetrievalPoolsInput): ScopedRetrievalPools {
  const normalizedLoreScopes = normalizeStringArray(loreScopes);
  const normalizedSelfLoreScopes = normalizeStringArray(selfLoreScopes);
  const normalizedRelatedLoreScopes = normalizeStringArray(relatedLoreScopes);

  if (queryType === 'self_query' || routingIntent === 'identity_self') {
    return {
      loreScopes: normalizedSelfLoreScopes.length > 0 ? [] : normalizedLoreScopes,
      selfLoreScopes: normalizedSelfLoreScopes,
      relatedLoreScopes: [],
    };
  }

  if (queryType === 'world_query' || routingIntent === 'lore_world') {
    return {
      loreScopes: normalizedLoreScopes,
      selfLoreScopes: [],
      relatedLoreScopes: [],
    };
  }

  if (queryType === 'other_query' || routingIntent === 'lore_other') {
    if (normalizedRelatedLoreScopes.length > 0) {
      return {
        loreScopes: [],
        selfLoreScopes: [],
        relatedLoreScopes: normalizedRelatedLoreScopes,
      };
    }
    return {
      loreScopes: normalizedLoreScopes,
      selfLoreScopes: [],
      relatedLoreScopes: [],
    };
  }

  return {
    loreScopes: normalizedLoreScopes,
    selfLoreScopes: normalizedSelfLoreScopes,
    relatedLoreScopes: normalizedRelatedLoreScopes,
  };
}

function shouldAttemptCorrectiveRetrieval(input: CorrectiveRetrievalInput): boolean {
  const reason = typeof input?.qualityReason === 'string' ? input.qualityReason : 'unknown';
  if (reason !== 'coverage_low' && reason !== 'support_low' && reason !== 'no_candidates') {
    return false;
  }
  if (!hasRetrievalScopes(input)) {
    return false;
  }

  const queryType = input?.queryType;
  const routingIntent = input?.routingIntent;
  const loreScopes = Array.isArray(input?.loreScopes) ? input.loreScopes : [];
  const selfLoreScopes = Array.isArray(input?.selfLoreScopes) ? input.selfLoreScopes : [];
  const relatedLoreScopes = Array.isArray(input?.relatedLoreScopes) ? input.relatedLoreScopes : [];

  if ((queryType === 'self_query' || routingIntent === 'identity_self') && selfLoreScopes.length === 0 && !input?.selfEntityId) {
    return false;
  }
  if ((queryType === 'world_query' || routingIntent === 'lore_world') && loreScopes.length === 0) {
    return false;
  }
  if ((queryType === 'other_query' || routingIntent === 'lore_other') && relatedLoreScopes.length === 0 && loreScopes.length === 0) {
    return false;
  }

  return true;
}

export function computeRetrievalQualityScore(quality: unknown): number {
  if (!isRecord(quality)) return 0;
  const coverage = typeof quality.coverage === 'number' ? quality.coverage : 0;
  const support = typeof quality.supportConfidence === 'number' ? quality.supportConfidence : 0;
  const conflictRisk = typeof quality.conflictRisk === 'number' ? quality.conflictRisk : 1;
  const score = (coverage * 0.48) + (support * 0.42) + ((1 - conflictRisk) * 0.1);
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

export function runGovernedLoreRetrieval({
  loreArtifacts,
  canRetrieveLore,
  shouldAttemptLoreRetrieval,
  playerMessage,
  interpretation,
  mode,
  routingIntent,
  queryType,
  activeBeatId,
  loreScopes,
  selfLoreScopes,
  relatedLoreScopes,
  selfEntityId,
  hasBeatContract,
  rerankCache,
  artifactVersion,
  modelVersion,
  rerankerClass,
  retrievalFilters,
}: GovernedLoreRetrievalInput) {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const budgetTier = resolveRerankBudgetTier({
    mode: normalizedMode,
    queryType,
    routingIntent,
    hasBeatContract,
  });
  const candidateCap = resolveRerankCandidateCap(normalizedMode, budgetTier);
  const knowledgeTurn = isKnowledgeSeekingQueryType(queryType)
    || routingIntent === 'identity_self'
    || routingIntent === 'lore_world'
    || routingIntent === 'lore_other'
    || routingIntent === 'mixed_knowledge';
  const scopedPools = deriveScopedRetrievalPools({
    queryType,
    routingIntent,
    loreScopes,
    selfLoreScopes,
    relatedLoreScopes,
  });
  const scopeOptions = {
    loreScopes: scopedPools.loreScopes,
    selfLoreScopes: scopedPools.selfLoreScopes,
    relatedLoreScopes: scopedPools.relatedLoreScopes,
    selfEntityId,
    queryType,
    activeBeatIds: typeof activeBeatId === 'string' ? [activeBeatId] : [],
    filters: retrievalFilters,
  };

  const baseResult = {
    loreMatches: [],
    retrievalQuality: {
      required: knowledgeTurn,
      pass: !knowledgeTurn,
      reason: !knowledgeTurn ? 'not_required' : 'no_candidates',
      coverage: knowledgeTurn ? 0 : 1,
      conflictRisk: 0,
      supportConfidence: knowledgeTurn ? 0 : 1,
      score: knowledgeTurn ? 0 : 1,
    },
    governance: {
      attempted: canRetrieveLore && shouldAttemptLoreRetrieval,
      candidateCount: 0,
      selectedCount: 0,
      correctiveAttempted: false,
      qualityPath: knowledgeTurn
        ? (canRetrieveLore && shouldAttemptLoreRetrieval ? 'single_pass' : 'no_scope')
        : 'not_required',
      qualityReason: canRetrieveLore && shouldAttemptLoreRetrieval
        ? 'not_started'
        : 'retrieval-not-allowed',
      reranker: {
        class: rerankerClass,
        budgetTier,
        candidateCap,
        cacheHit: false,
        cacheKey: null,
        artifactVersion,
        modelVersion,
        latencyMs: 0,
      },
      attempts: [],
      qualityGatePassed: !knowledgeTurn,
    },
  };

  if (!canRetrieveLore || !shouldAttemptLoreRetrieval) {
    return baseResult;
  }

  const retrieveMaxResults = Math.max(candidateCap * 2, candidateCap);
  const retrievalQuery = buildInterpretationRetrievalQuery(playerMessage, interpretation);
  const initialCandidates = retrieveLoreChunks(loreArtifacts, retrievalQuery, {
    ...scopeOptions,
    maxResults: retrieveMaxResults,
  });
  const initialCacheKey = buildRerankCacheKey({
    query: retrievalQuery,
    queryType,
    routingIntent,
    mode: normalizedMode,
    budgetTier,
    loreScopes: scopedPools.loreScopes,
    selfLoreScopes: scopedPools.selfLoreScopes,
    relatedLoreScopes: scopedPools.relatedLoreScopes,
    selfEntityId,
    retrievalFilters,
    artifactVersion,
    modelVersion,
  });
  const initialRerank = rerankLoreMatches({
    candidates: initialCandidates,
    query: retrievalQuery,
    queryType,
    mode: normalizedMode,
    budgetTier,
    cache: rerankCache,
    cacheKey: initialCacheKey,
  });
  const initialSelected = initialRerank.ranked.slice(0, Math.min(3, candidateCap));
  const initialQuality = evaluateRetrievalQuality({
    query: playerMessage,
    interpretation,
    mode: normalizedMode,
    queryType,
    routeIntent: routingIntent,
    selectedMatches: initialSelected,
  });
  const initialQualityScore = computeRetrievalQualityScore(initialQuality);

  let finalRanked = initialRerank.ranked;
  let finalSelected = initialSelected;
  let finalQuality = {
    ...initialQuality,
    score: initialQualityScore,
  };
  let qualityPath = 'single_pass';
  let qualityReason = initialQuality.reason;
  let totalRerankLatencyMs = initialRerank.latencyMs;
  let cacheHit = initialRerank.cacheHit;
  let cacheKey = initialCacheKey;
  let correctiveAttempted = false;

  const attemptLogs = [
    {
      attempt: 'initial',
      query: retrievalQuery,
      candidateCount: initialCandidates.length,
      selectedCount: initialSelected.length,
      quality: {
        coverage: initialQuality.coverage,
        conflictRisk: initialQuality.conflictRisk,
        supportConfidence: initialQuality.supportConfidence,
        score: initialQualityScore,
        reason: initialQuality.reason,
        pass: initialQuality.pass,
      },
      reranker: {
        cacheHit: initialRerank.cacheHit,
        latencyMs: initialRerank.latencyMs,
      },
    },
  ];

  if (knowledgeTurn && !initialQuality.pass && shouldAttemptCorrectiveRetrieval({
    qualityReason: initialQuality.reason,
    queryType,
    routingIntent,
    loreScopes: scopedPools.loreScopes,
    selfLoreScopes: scopedPools.selfLoreScopes,
    relatedLoreScopes: scopedPools.relatedLoreScopes,
    selfEntityId,
  })) {
    correctiveAttempted = true;
    const correctiveQuery = buildCorrectiveLoreQuery(retrievalQuery, queryType, routingIntent);
    let correctiveLoreScopes = normalizeStringArray(loreScopes);
    let correctiveSelfLoreScopes = normalizeStringArray(selfLoreScopes);
    let correctiveRelatedLoreScopes = normalizeStringArray(relatedLoreScopes);

    if (queryType === 'self_query' || routingIntent === 'identity_self') {
      if (correctiveSelfLoreScopes.length > 0) {
        correctiveLoreScopes = [...correctiveSelfLoreScopes];
      }
      correctiveRelatedLoreScopes = [];
    } else if (queryType === 'world_query' || routingIntent === 'lore_world') {
      correctiveSelfLoreScopes = [];
      correctiveRelatedLoreScopes = [];
    } else if (queryType === 'other_query' || routingIntent === 'lore_other') {
      correctiveSelfLoreScopes = [];
      if (correctiveRelatedLoreScopes.length > 0) {
        correctiveLoreScopes = [];
      }
    }

    const correctiveCandidates = retrieveLoreChunks(loreArtifacts, correctiveQuery, {
      ...scopeOptions,
      maxResults: retrieveMaxResults,
      loreScopes: correctiveLoreScopes,
      selfLoreScopes: correctiveSelfLoreScopes,
      relatedLoreScopes: correctiveRelatedLoreScopes,
    });
    const correctiveCacheKey = buildRerankCacheKey({
      query: correctiveQuery,
      queryType,
      routingIntent,
      mode: normalizedMode,
      budgetTier,
      loreScopes: correctiveLoreScopes,
      selfLoreScopes: correctiveSelfLoreScopes,
      relatedLoreScopes: correctiveRelatedLoreScopes,
      selfEntityId,
      retrievalFilters,
      artifactVersion,
      modelVersion,
    });
    const correctiveRerank = rerankLoreMatches({
      candidates: correctiveCandidates,
      query: correctiveQuery,
      queryType,
      mode: normalizedMode,
      budgetTier,
      cache: rerankCache,
      cacheKey: correctiveCacheKey,
    });
    const correctiveSelected = correctiveRerank.ranked.slice(0, Math.min(3, candidateCap));
    const correctiveQuality = evaluateRetrievalQuality({
      query: playerMessage,
      interpretation,
      mode: normalizedMode,
      queryType,
      routeIntent: routingIntent,
      selectedMatches: correctiveSelected,
    });
    const correctiveQualityScore = computeRetrievalQualityScore(correctiveQuality);

    attemptLogs.push({
      attempt: 'corrective',
      query: correctiveQuery,
      candidateCount: correctiveCandidates.length,
      selectedCount: correctiveSelected.length,
      quality: {
        coverage: correctiveQuality.coverage,
        conflictRisk: correctiveQuality.conflictRisk,
        supportConfidence: correctiveQuality.supportConfidence,
        score: correctiveQualityScore,
        reason: correctiveQuality.reason,
        pass: correctiveQuality.pass,
      },
      reranker: {
        cacheHit: correctiveRerank.cacheHit,
        latencyMs: correctiveRerank.latencyMs,
      },
    });

    const useCorrective = correctiveQualityScore >= initialQualityScore;
    if (useCorrective) {
      finalRanked = correctiveRerank.ranked;
      finalSelected = correctiveSelected;
      finalQuality = {
        ...correctiveQuality,
        score: correctiveQualityScore,
      };
      cacheHit = correctiveRerank.cacheHit;
      cacheKey = correctiveCacheKey;
      qualityReason = correctiveQuality.reason;
    } else {
      qualityReason = initialQuality.reason;
    }
    totalRerankLatencyMs += correctiveRerank.latencyMs;
    qualityPath = finalQuality.pass ? 'corrective_pass' : 'corrective_fail';
  } else if (knowledgeTurn && !initialQuality.pass) {
    qualityPath = 'single_pass';
  } else if (knowledgeTurn && initialQuality.pass) {
    qualityPath = 'single_pass';
  } else if (!knowledgeTurn) {
    qualityPath = 'not_required';
  }

  const knowledgeGatePassed = !knowledgeTurn || finalQuality.pass;
  const loreMatches = knowledgeGatePassed
    ? finalRanked.slice(0, Math.max(2, Math.min(4, candidateCap)))
    : [];
  return {
    loreMatches,
    retrievalQuality: finalQuality,
    governance: {
      attempted: true,
      candidateCount: finalRanked.length,
      selectedCount: finalSelected.length,
      correctiveAttempted,
      qualityPath,
      qualityReason,
      reranker: {
        class: rerankerClass,
        budgetTier,
        candidateCap,
        cacheHit,
        cacheKey,
        artifactVersion,
        modelVersion,
        latencyMs: totalRerankLatencyMs,
      },
      attempts: attemptLogs,
      qualityGatePassed: knowledgeGatePassed,
    },
  };
}
