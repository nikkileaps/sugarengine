import { retrieveLoreChunks, retrieveLoreChunksByVector } from '../../../lore/lore-lib.js';
import {
  expandFacetQueryTokenVariants,
  extractFacetQueryTokens,
} from '../knowledge-query.js';
import {
  annotateEvidenceSubjectRelevance,
} from '../subject-relevance.js';
import {
  isKnowledgeSeekingQueryType,
  type QueryType,
  type RoutingIntent,
} from '../routing.js';
import {
  buildCorrectiveLoreQuery,
  buildRerankCacheKey,
  evaluateRetrievalQuality,
  normalizeConversationModeForPolicy,
  rerankLoreMatches,
  resolveRerankBudgetTier,
  resolveRerankCandidateCap,
} from '../retrieval-governance.js';
import type {
  QueryInterpretation,
  RetrievalRing,
  RetrievalRingReason,
  SubjectRelationDistance,
  SubjectRelationReason,
  SubjectReferentKind,
} from '../turn-contracts.js';

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
  aliases?: string[];
}

interface RingedSelection {
  selected: Array<Record<string, unknown>>;
  activeRings: RetrievalRing[];
  ringCounts: Record<RetrievalRing, number>;
  usedRingStrategy: boolean;
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
  embedTexts?: ((texts: string[]) => Promise<number[][]>) | null;
}

export interface GovernedLoreRetrievalResult {
  loreMatches: Array<Record<string, unknown>>;
  retrievalQuality: Record<string, unknown>;
  governance: Record<string, unknown>;
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

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
      loreScopes: [],
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

function mergeRetrievalCandidates(input: {
  lexicalCandidates: Array<Record<string, unknown>>;
  vectorCandidates: Array<Record<string, unknown>>;
}): Array<Record<string, unknown>> {
  const mergedByChunkId = new Map<string, Record<string, unknown>>();

  const absorb = (candidate: Record<string, unknown>, source: 'lexical' | 'vector') => {
    const chunk = isRecord(candidate.chunk) ? candidate.chunk : null;
    const chunkId = typeof chunk?.chunkId === 'string' ? chunk.chunkId : '';
    if (!chunkId) return;
    const existing = mergedByChunkId.get(chunkId) ?? {
      ...candidate,
      sources: [],
    };
    const lexicalScore = typeof candidate.lexicalScore === 'number' && Number.isFinite(candidate.lexicalScore)
      ? Number(candidate.lexicalScore)
      : source === 'lexical' && typeof candidate.score === 'number' && Number.isFinite(candidate.score)
        ? Number(candidate.score)
        : typeof existing.lexicalScore === 'number' && Number.isFinite(existing.lexicalScore)
          ? Number(existing.lexicalScore)
          : undefined;
    const vectorScore = typeof candidate.vectorScore === 'number' && Number.isFinite(candidate.vectorScore)
      ? Number(candidate.vectorScore)
      : typeof existing.vectorScore === 'number' && Number.isFinite(existing.vectorScore)
        ? Number(existing.vectorScore)
        : undefined;
    const sources = Array.isArray(existing.sources) ? existing.sources as string[] : [];
    if (!sources.includes(source)) sources.push(source);
    const mergedScore = Math.max(
      typeof lexicalScore === 'number' ? lexicalScore : 0,
      typeof candidate.score === 'number' && Number.isFinite(candidate.score) ? Number(candidate.score) : 0,
      typeof vectorScore === 'number' ? vectorScore * 2.5 : 0,
    );
    mergedByChunkId.set(chunkId, {
      ...existing,
      ...candidate,
      lexicalScore,
      vectorScore,
      score: Number(mergedScore.toFixed(4)),
      sources,
    });
  };

  for (const candidate of input.lexicalCandidates) {
    if (isRecord(candidate)) absorb(candidate, 'lexical');
  }
  for (const candidate of input.vectorCandidates) {
    if (isRecord(candidate)) absorb(candidate, 'vector');
  }

  return [...mergedByChunkId.values()]
    .sort((left, right) => (
      asFiniteScore(right) - asFiniteScore(left)
      || String((isRecord(left.chunk) ? left.chunk.chunkId : '') ?? '')
        .localeCompare(String((isRecord(right.chunk) ? right.chunk.chunkId : '') ?? ''))
    ));
}

function asFiniteScore(candidate: Record<string, unknown>): number {
  return typeof candidate.score === 'number' && Number.isFinite(candidate.score)
    ? Number(candidate.score)
    : 0;
}

function mapRelationDistanceToRing(distance: SubjectRelationDistance | undefined): RetrievalRing {
  if (distance === 'primary') return 'direct';
  if (distance === 'associated') return 'associated';
  return 'ambient';
}

function mapRelationReasonToRingReason(
  reason: SubjectRelationReason | undefined,
  fallback: RetrievalRingReason,
): RetrievalRingReason {
  if (reason === 'direct_id_match') return 'direct_subject_match';
  if (reason === 'direct_page_match') return 'direct_page_match';
  if (reason === 'direct_location_match') return 'direct_location_match';
  if (reason === 'associated_entity_relation' || reason === 'associated_location_relation') {
    return 'explicit_association';
  }
  if (reason === 'mention_only') return 'semantic_neighbor';
  if (reason === 'tag_only') return 'tag_neighbor';
  return fallback;
}

function annotateRetrievalCandidateRing(input: {
  candidate: Record<string, unknown>;
  interpretation?: QueryInterpretation | null;
  queryType: QueryType;
  routingIntent: RoutingIntent | 'unclear';
  selfEntityId?: unknown;
}): Record<string, unknown> {
  const candidate = isRecord(input.candidate) ? input.candidate : {};
  const chunk = isRecord(candidate.chunk) ? candidate.chunk : null;
  const metadata = isRecord(chunk?.metadata) ? chunk.metadata : null;
  const normalizedSelfEntityId = normalizeOptionalString(input.selfEntityId)?.toLowerCase();
  const chunkEntityIds = normalizeStringArray(metadata?.entity_ids).map((entry) => entry.toLowerCase());
  const selfEntityMatch = candidate.selfEntityMatch === true
    || Boolean(normalizedSelfEntityId && chunkEntityIds.includes(normalizedSelfEntityId));
  const isSelfQuery = input.queryType === 'self_query' || input.routingIntent === 'identity_self';

  const subjectRelevance = input.interpretation
    ? annotateEvidenceSubjectRelevance({
      sourceType: 'lore_chunk',
      sourceId: normalizeOptionalString(chunk?.chunkId),
      ownerType: typeof candidate.pool === 'string' && candidate.pool === 'self'
        ? 'npc'
        : 'world',
      text: normalizeOptionalString(chunk?.summary) ?? normalizeOptionalString(chunk?.content) ?? normalizeOptionalString(chunk?.title) ?? '',
      entityIds: normalizeStringArray(metadata?.entity_ids),
      locationIds: normalizeStringArray(metadata?.location_ids),
      factionIds: normalizeStringArray(metadata?.faction_ids),
      pageId: normalizeOptionalString(chunk?.pageId),
      pageTitle: normalizeOptionalString(chunk?.title),
      sectionHeading: normalizeOptionalString(chunk?.sectionHeading),
      anchorTerms: [
        normalizeOptionalString(chunk?.title),
        normalizeOptionalString(chunk?.sectionHeading),
        normalizeOptionalString(chunk?.pageId),
        ...normalizeStringArray(metadata?.tags),
        ...normalizeStringArray(metadata?.entity_ids),
        ...normalizeStringArray(metadata?.location_ids),
        ...normalizeStringArray(metadata?.faction_ids),
      ].filter((entry): entry is string => Boolean(entry)),
      tags: normalizeStringArray(metadata?.tags),
      provenance: null,
    }, input.interpretation)
    : undefined;

  let retrievalRing: RetrievalRing = 'ambient';
  let retrievalRingReason: RetrievalRingReason = typeof candidate.pool === 'string' && candidate.pool === 'related'
    ? 'relation_scope'
    : 'ambient_scope';

  if (isSelfQuery && selfEntityMatch) {
    retrievalRing = 'direct';
    retrievalRingReason = 'exact_self_entity';
  } else if (isSelfQuery && candidate.pool === 'self') {
    retrievalRing = 'direct';
    retrievalRingReason = 'explicit_self_scope';
  } else if (subjectRelevance) {
    retrievalRing = mapRelationDistanceToRing(subjectRelevance.relationDistance);
    retrievalRingReason = mapRelationReasonToRingReason(subjectRelevance.reason, retrievalRingReason);
  } else if (candidate.pool === 'related') {
    retrievalRing = 'associated';
    retrievalRingReason = 'relation_scope';
  }

  return {
    ...candidate,
    retrievalRing,
    retrievalRingReason,
    subjectId: subjectRelevance?.subjectId ?? candidate.subjectId,
    subjectKind: subjectRelevance?.subjectKind ?? candidate.subjectKind,
    relationDistance: subjectRelevance?.relationDistance ?? candidate.relationDistance,
    relationStrength: subjectRelevance?.relationStrength ?? candidate.relationStrength,
    relationReason: subjectRelevance?.reason ?? candidate.relationReason,
  };
}

function countCandidatesByRing(ranked: Array<Record<string, unknown>>): Record<RetrievalRing, number> {
  const counts: Record<RetrievalRing, number> = {
    direct: 0,
    associated: 0,
    ambient: 0,
  };
  for (const entry of ranked) {
    const ring = entry?.retrievalRing;
    if (ring === 'direct' || ring === 'associated' || ring === 'ambient') {
      counts[ring] += 1;
    }
  }
  return counts;
}

function selectCandidatesByRing(input: {
  ranked: Array<Record<string, unknown>>;
  interpretation?: QueryInterpretation | null;
  queryType: QueryType;
  routingIntent: RoutingIntent | 'unclear';
  maxSelected: number;
}): RingedSelection {
  const ranked = Array.isArray(input.ranked)
    ? input.ranked.filter((entry): entry is Record<string, unknown> => isRecord(entry))
    : [];
  const relationPolicy = input.interpretation?.relationPolicy;
  const hasRingContext = Boolean(
    (input.queryType === 'self_query' || input.routingIntent === 'identity_self')
    || input.interpretation?.primaryReferent,
  );
  if (!hasRingContext) {
    return {
      selected: ranked.slice(0, input.maxSelected),
      activeRings: [],
      ringCounts: countCandidatesByRing(ranked),
      usedRingStrategy: false,
    };
  }

  const effectivePolicy = relationPolicy ?? {
    facet: 'unknown',
    preferredRelationDistances: ['primary', 'associated'] as Array<'primary' | 'associated'>,
    incidentalAllowed: false,
    associatedFallbackAllowed: true,
    evidenceBudget: {
      maxPrimary: Math.max(1, Math.min(2, input.maxSelected)),
      maxAssociated: 1,
    },
  };

  const direct = ranked.filter((entry) => entry.retrievalRing === 'direct');
  const associated = ranked.filter((entry) => entry.retrievalRing === 'associated');
  const ambient = ranked.filter((entry) => entry.retrievalRing === 'ambient');
  const ringCounts = {
    direct: direct.length,
    associated: associated.length,
    ambient: ambient.length,
  };
  const activeRings: RetrievalRing[] = [];
  const selected: Array<Record<string, unknown>> = [];
  const maxPrimary = Math.max(1, Math.min(input.maxSelected, effectivePolicy.evidenceBudget?.maxPrimary ?? input.maxSelected));
  const maxAssociated = Math.max(0, Math.min(input.maxSelected, effectivePolicy.evidenceBudget?.maxAssociated ?? 1));
  const preferredPrimary = (effectivePolicy.preferredRelationDistances[0] ?? 'primary') === 'primary';

  const takeFromRing = (entries: Array<Record<string, unknown>>, ring: RetrievalRing, limit: number) => {
    if (entries.length === 0 || limit <= 0 || selected.length >= input.maxSelected) return;
    const remaining = Math.max(0, input.maxSelected - selected.length);
    if (remaining <= 0) return;
    const toTake = entries.slice(0, Math.min(limit, remaining));
    if (toTake.length === 0) return;
    activeRings.push(ring);
    selected.push(...toTake);
  };

  if (preferredPrimary) {
    takeFromRing(direct, 'direct', maxPrimary);
    if (
      effectivePolicy.associatedFallbackAllowed
      && (selected.length === 0 || selected.length < Math.min(maxPrimary, input.maxSelected))
    ) {
      takeFromRing(associated, 'associated', maxAssociated || 1);
    }
  } else {
    takeFromRing(associated, 'associated', maxAssociated || 1);
    if (selected.length === 0 || selected.length < Math.min(2, input.maxSelected)) {
      takeFromRing(direct, 'direct', Math.min(maxPrimary, 1));
    }
  }

  if (selected.length === 0 && effectivePolicy.incidentalAllowed) {
    takeFromRing(ambient, 'ambient', 1);
  }

  return {
    selected: selected.slice(0, input.maxSelected),
    activeRings: [...new Set(activeRings)],
    ringCounts,
    usedRingStrategy: true,
  };
}

function annotateRetrievalCandidates(input: {
  candidates: Array<Record<string, unknown>>;
  interpretation?: QueryInterpretation | null;
  queryType: QueryType;
  routingIntent: RoutingIntent | 'unclear';
  selfEntityId?: unknown;
}): Array<Record<string, unknown>> {
  return (Array.isArray(input.candidates) ? input.candidates : [])
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((candidate) => annotateRetrievalCandidateRing({
      candidate,
      interpretation: input.interpretation,
      queryType: input.queryType,
      routingIntent: input.routingIntent,
      selfEntityId: input.selfEntityId,
    }));
}

export async function runGovernedLoreRetrieval({
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
  embedTexts,
}: GovernedLoreRetrievalInput): Promise<GovernedLoreRetrievalResult> {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const budgetTier = resolveRerankBudgetTier({
    mode: normalizedMode,
    queryType,
    routingIntent,
    hasBeatContract,
  });
  const candidateCap = resolveRerankCandidateCap(normalizedMode, budgetTier);
  const interpretationRequestsKnowledge = Boolean(
    interpretation
    && typeof interpretation === 'object'
    && interpretation.lane === 'knowledge',
  );
  const knowledgeTurn = interpretationRequestsKnowledge
    || isKnowledgeSeekingQueryType(queryType)
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
      lexicalCandidateCount: 0,
      vectorCandidateCount: 0,
      mergedCandidateCount: 0,
      embeddingAvailable: typeof embedTexts === 'function',
      degradedReason: null,
      attempts: [],
      qualityGatePassed: !knowledgeTurn,
    },
  };

  if (!canRetrieveLore || !shouldAttemptLoreRetrieval) {
    return baseResult;
  }

  const retrieveMaxResults = Math.max(candidateCap * 2, candidateCap);
  const retrievalQuery = buildInterpretationRetrievalQuery(playerMessage, interpretation);
  const lexicalCandidates = retrieveLoreChunks(loreArtifacts, retrievalQuery, {
    ...scopeOptions,
    maxResults: retrieveMaxResults,
  });
  let vectorCandidates: Array<Record<string, unknown>> = [];
  let degradedReason: string | null = null;
  // Vector retrieval is part of the primary Phase B path. If embeddings are
  // unavailable or fail, we degrade explicitly to lexical/entity retrieval; we
  // do not keep a second feature-flagged "main path" alive here.
  if (typeof embedTexts === 'function' && Array.isArray((loreArtifacts as RecordLike | null)?.chunkVectors)) {
    try {
      const [queryVector] = await embedTexts([retrievalQuery]);
      vectorCandidates = retrieveLoreChunksByVector(loreArtifacts, queryVector, {
        ...scopeOptions,
        maxResults: retrieveMaxResults,
      });
    } catch (error) {
      degradedReason = error instanceof Error ? error.message : String(error);
      vectorCandidates = [];
    }
  }
  const initialCandidates = annotateRetrievalCandidates({
    candidates: mergeRetrievalCandidates({
      lexicalCandidates,
      vectorCandidates,
    }),
    interpretation,
    queryType,
    routingIntent,
    selfEntityId,
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
  const initialSelection = selectCandidatesByRing({
    ranked: initialRerank.ranked,
    interpretation,
    queryType,
    routingIntent,
    maxSelected: Math.min(3, candidateCap),
  });
  const initialSelected = initialSelection.selected;
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
  let finalSelection = initialSelection;
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
      lexicalCandidateCount: lexicalCandidates.length,
      vectorCandidateCount: vectorCandidates.length,
      mergedCandidateCount: initialCandidates.length,
      candidateCount: initialCandidates.length,
      selectedCount: initialSelected.length,
      activeRings: initialSelection.activeRings,
      ringCounts: initialSelection.ringCounts,
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
      degradedReason,
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
      correctiveLoreScopes = [];
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

    const correctiveLexicalCandidates = retrieveLoreChunks(loreArtifacts, correctiveQuery, {
      ...scopeOptions,
      maxResults: retrieveMaxResults,
      loreScopes: correctiveLoreScopes,
      selfLoreScopes: correctiveSelfLoreScopes,
      relatedLoreScopes: correctiveRelatedLoreScopes,
    });
    let correctiveVectorCandidates: Array<Record<string, unknown>> = [];
    if (typeof embedTexts === 'function' && Array.isArray((loreArtifacts as RecordLike | null)?.chunkVectors)) {
      try {
        const [correctiveQueryVector] = await embedTexts([correctiveQuery]);
        correctiveVectorCandidates = retrieveLoreChunksByVector(loreArtifacts, correctiveQueryVector, {
          ...scopeOptions,
          maxResults: retrieveMaxResults,
          loreScopes: correctiveLoreScopes,
          selfLoreScopes: correctiveSelfLoreScopes,
          relatedLoreScopes: correctiveRelatedLoreScopes,
        });
      } catch (error) {
        degradedReason = degradedReason ?? (error instanceof Error ? error.message : String(error));
        correctiveVectorCandidates = [];
      }
    }
    const correctiveCandidates = annotateRetrievalCandidates({
      candidates: mergeRetrievalCandidates({
        lexicalCandidates: correctiveLexicalCandidates,
        vectorCandidates: correctiveVectorCandidates,
      }),
      interpretation,
      queryType,
      routingIntent,
      selfEntityId,
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
    const correctiveSelection = selectCandidatesByRing({
      ranked: correctiveRerank.ranked,
      interpretation,
      queryType,
      routingIntent,
      maxSelected: Math.min(3, candidateCap),
    });
    const correctiveSelected = correctiveSelection.selected;
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
      lexicalCandidateCount: correctiveLexicalCandidates.length,
      vectorCandidateCount: correctiveVectorCandidates.length,
      mergedCandidateCount: correctiveCandidates.length,
      candidateCount: correctiveCandidates.length,
      selectedCount: correctiveSelected.length,
      activeRings: correctiveSelection.activeRings,
      ringCounts: correctiveSelection.ringCounts,
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
      degradedReason,
    });

    const useCorrective = correctiveQualityScore >= initialQualityScore;
    if (useCorrective) {
      finalRanked = correctiveRerank.ranked;
      finalSelected = correctiveSelected;
      finalSelection = correctiveSelection;
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
    ? (finalSelection.usedRingStrategy
        ? finalSelected
        : finalRanked.slice(0, Math.max(2, Math.min(4, candidateCap))))
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
      lexicalCandidateCount: lexicalCandidates.length,
      vectorCandidateCount: vectorCandidates.length,
      mergedCandidateCount: finalRanked.length,
      activeRings: finalSelection.activeRings,
      ringCounts: finalSelection.ringCounts,
      embeddingAvailable: typeof embedTexts === 'function' && degradedReason === null,
      degradedReason,
      attempts: attemptLogs,
      qualityGatePassed: knowledgeGatePassed,
    },
  };
}
