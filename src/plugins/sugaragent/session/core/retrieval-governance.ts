import {
  isKnowledgeSeekingQueryType,
  type QueryType,
  type RoutingIntent,
} from './routing';
import {
  countEvidenceTokens,
  lexicalOverlapScore,
  normalizeEvidenceTextForPlan,
  tokenizeForPlan,
} from './retrieval-text';
import {
  expandFacetQueryTokenVariants,
  extractFacetQueryTokens,
} from './knowledge-query';

export type ConversationMode = 'character' | 'narrative' | 'hybrid';
export type RerankBudgetTier = 'low' | 'standard' | 'high';
export type EvidenceOwnerType = 'npc' | 'player' | 'world' | 'beat' | 'unknown';

interface RecordLike {
  [key: string]: unknown;
}

interface MatchChunk {
  chunkId?: unknown;
  pageId?: unknown;
  title?: unknown;
  sectionHeading?: unknown;
  summary?: unknown;
  content?: unknown;
  metadata?: unknown;
}

interface LoreMatchCandidate extends RecordLike {
  score?: unknown;
  pool?: unknown;
  poolRank?: unknown;
  chunk?: MatchChunk;
  rerankScore?: unknown;
}

interface LoreSource {
  commit?: unknown;
}

interface LoreManifest {
  schemaVersion?: unknown;
  loreArtifactVersion?: unknown;
  toolVersion?: unknown;
  source?: LoreSource;
}

interface LoreArtifacts {
  manifest?: LoreManifest;
}

interface EvidenceBudget {
  maxFacts: number;
  maxSpans: number;
  maxContextTokens: number;
  maxMemoryFacts: number;
  maxBeatFacts: number;
}

interface EvidenceBudgetWithMode extends EvidenceBudget {
  mode: ConversationMode;
}

interface RetrievalQualityThreshold {
  minCoverage: number;
  minSupportConfidence: number;
  maxConflictRisk: number;
}

interface RetrievalQualityThresholdWithMode extends RetrievalQualityThreshold {
  mode: ConversationMode;
}

interface ResolveRerankBudgetTierInput {
  mode: unknown;
  queryType: unknown;
  routingIntent: unknown;
  hasBeatContract: boolean;
}

interface BuildRerankCacheKeyInput {
  query: unknown;
  queryType: unknown;
  routingIntent: unknown;
  mode: unknown;
  budgetTier: unknown;
  loreScopes?: unknown;
  selfLoreScopes?: unknown;
  relatedLoreScopes?: unknown;
  selfEntityId?: unknown;
  retrievalFilters?: unknown;
  artifactVersion: unknown;
  modelVersion: unknown;
}

interface ComputeRerankEntryScoreInput {
  candidate: LoreMatchCandidate;
  query: unknown;
  queryType: unknown;
}

interface RerankLoreMatchesInput {
  candidates: unknown;
  query: unknown;
  queryType: unknown;
  mode: unknown;
  budgetTier: unknown;
  cache?: Map<string, { ranked: LoreMatchCandidate[] }>;
  cacheKey: string;
}

interface EvaluateRetrievalQualityInput {
  query: unknown;
  interpretation?: unknown;
  mode: unknown;
  queryType: unknown;
  routeIntent: unknown;
  selectedMatches: unknown;
}

interface EvidenceEntryLike {
  sourceId?: unknown;
  sourceType?: unknown;
  text?: unknown;
  factId?: unknown;
  chunkId?: unknown;
  verificationStatus?: unknown;
  provenance?: unknown;
  entityIds?: unknown;
  anchorTerms?: unknown;
  selfAttributed?: unknown;
}

interface EvidenceItem {
  evidenceId: string;
  sourceId: string;
  sourceType: string;
  ownerType: EvidenceOwnerType;
  text: string;
  factId?: string;
  chunkId?: string;
  verificationStatus: string;
  provenance?: RecordLike;
  entityIds: string[];
  anchorTerms?: string[];
  selfAttributed: boolean;
  confidence: number;
}

interface RankEvidenceForBudgetInput {
  items: unknown;
  mode: unknown;
  playerMessage: unknown;
  queryType: unknown;
  routeIntent: unknown;
}

interface ApplyEvidenceBudgetInput extends RankEvidenceForBudgetInput {
  budget: EvidenceBudget;
}

interface BuildEvidencePackInput {
  evidenceEntries: unknown;
  loreMatches: unknown;
  mode: unknown;
  playerMessage: unknown;
  queryType: unknown;
  routing: { intent?: unknown; policyPath?: unknown } | null | undefined;
  selfEntityId: unknown;
  npcId: unknown;
}

interface PickEvidenceForIntentRankedEntry {
  item: EvidenceItem;
  overlap: number;
  score: number;
}

const MAX_SESSION_FACTS_PER_NPC = 24;
const LORE_OVERRIDE_MIN_SCORE = 1.2;
const LORE_OVERRIDE_MIN_MARGIN = 0.35;
const RERANK_CACHE_MAX_ENTRIES = 256;

const EVIDENCE_BUDGETS_BY_MODE: Record<ConversationMode, EvidenceBudget> = {
  character: {
    maxFacts: 12,
    maxSpans: 12,
    maxContextTokens: 700,
    maxMemoryFacts: 6,
    maxBeatFacts: 0,
  },
  narrative: {
    maxFacts: 16,
    maxSpans: 16,
    maxContextTokens: 920,
    maxMemoryFacts: 6,
    maxBeatFacts: 8,
  },
  hybrid: {
    maxFacts: 14,
    maxSpans: 14,
    maxContextTokens: 820,
    maxMemoryFacts: 7,
    maxBeatFacts: 6,
  },
};

const RERANK_CANDIDATE_CAPS_BY_MODE: Record<ConversationMode, Record<RerankBudgetTier, number>> = {
  character: {
    low: 6,
    standard: 8,
    high: 10,
  },
  narrative: {
    low: 8,
    standard: 10,
    high: 12,
  },
  hybrid: {
    low: 7,
    standard: 9,
    high: 11,
  },
};

const RETRIEVAL_QUALITY_THRESHOLDS_BY_MODE: Record<ConversationMode, RetrievalQualityThreshold> = {
  character: {
    minCoverage: 0.2,
    minSupportConfidence: 0.34,
    maxConflictRisk: 0.45,
  },
  narrative: {
    minCoverage: 0.24,
    minSupportConfidence: 0.38,
    maxConflictRisk: 0.4,
  },
  hybrid: {
    minCoverage: 0.22,
    minSupportConfidence: 0.36,
    maxConflictRisk: 0.42,
  },
};

const EVIDENCE_OWNER_TYPES = new Set<EvidenceOwnerType>([
  'npc',
  'player',
  'world',
  'beat',
  'unknown',
]);

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
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeFact(text: unknown): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.?!]+$/, '');
}

function normalizeConversationMode(mode: unknown): ConversationMode {
  return mode === 'narrative' || mode === 'hybrid' ? mode : 'character';
}

function normalizeQueryType(value: unknown): QueryType {
  return value === 'self_query'
    || value === 'other_query'
    || value === 'world_query'
    || value === 'mixed_query'
    ? value
    : 'conversation';
}

function normalizeRoutingIntent(value: unknown): RoutingIntent | 'unclear' {
  return value === 'social_chat'
    || value === 'session_recall'
    || value === 'identity_self'
    || value === 'lore_world'
    || value === 'lore_other'
    || value === 'mixed_knowledge'
    || value === 'unclear'
    ? value
    : 'unclear';
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function isEvidenceOwnerType(value: unknown): value is EvidenceOwnerType {
  return value === 'npc'
    || value === 'player'
    || value === 'world'
    || value === 'beat'
    || value === 'unknown';
}

function isEvidenceItem(value: unknown): value is EvidenceItem {
  if (!isRecord(value)) return false;
  if (typeof value.evidenceId !== 'string') return false;
  if (typeof value.sourceId !== 'string') return false;
  if (typeof value.sourceType !== 'string') return false;
  if (!isEvidenceOwnerType(value.ownerType)) return false;
  if (typeof value.text !== 'string') return false;
  if (typeof value.confidence !== 'number' || !Number.isFinite(value.confidence)) return false;
  if (!Array.isArray(value.entityIds) || !value.entityIds.every((entry) => typeof entry === 'string')) return false;
  return true;
}

function isPickEvidenceForIntentRankedEntry(value: unknown): value is PickEvidenceForIntentRankedEntry {
  if (!isRecord(value)) return false;
  if (!isEvidenceItem(value.item)) return false;
  if (typeof value.overlap !== 'number' || !Number.isFinite(value.overlap)) return false;
  if (typeof value.score !== 'number' || !Number.isFinite(value.score)) return false;
  return true;
}

function candidateSemanticText(candidate: LoreMatchCandidate): string {
  const chunk = isRecord(candidate.chunk) ? candidate.chunk as MatchChunk : null;
  return normalizeEvidenceTextForPlan(
    [
      normalizeOptionalString(chunk?.title) ?? '',
      normalizeOptionalString(chunk?.sectionHeading) ?? '',
      normalizeOptionalString(chunk?.summary) ?? '',
      normalizeOptionalString(chunk?.content) ?? '',
    ].join(' '),
  );
}

function candidateCoverageText(candidate: LoreMatchCandidate): string {
  const chunk = isRecord(candidate.chunk) ? candidate.chunk as MatchChunk : null;
  const metadata = isRecord(chunk?.metadata) ? chunk.metadata as RecordLike : null;
  // Coverage should consider the same identity-bearing surface that raw retrieval uses.
  // Otherwise proper-noun lore hits can be retrieved, then falsely rejected as coverage_low.
  return normalizeEvidenceTextForPlan(
    [
      normalizeOptionalString(chunk?.title) ?? '',
      normalizeOptionalString(chunk?.sectionHeading) ?? '',
      normalizeOptionalString(metadata?.title) ?? '',
      normalizeOptionalString(chunk?.pageId) ?? '',
      normalizeOptionalString(chunk?.chunkId) ?? '',
      normalizeOptionalString(metadata?.id) ?? '',
      ...normalizeStringArray(metadata?.tags),
      ...normalizeStringArray(metadata?.entity_ids),
      ...normalizeStringArray(metadata?.location_ids),
      ...normalizeStringArray(metadata?.faction_ids),
      ...normalizeStringArray(metadata?.beat_ids),
      normalizeOptionalString(chunk?.summary) ?? '',
      normalizeOptionalString(chunk?.content) ?? '',
    ].join(' '),
  );
}

export function evaluateLoreOverrideConfidence(matches: unknown): {
  shouldOverride: boolean;
  reason: string;
  topScore: number;
  secondScore: number;
  margin: number;
} {
  if (!Array.isArray(matches) || matches.length === 0) {
    return {
      shouldOverride: false,
      reason: 'no_matches',
      topScore: 0,
      secondScore: 0,
      margin: 0,
    };
  }

  const first = isRecord(matches[0]) ? matches[0] : {};
  const second = isRecord(matches[1]) ? matches[1] : {};
  const topScore = asFiniteNumber(first.score);
  const secondScore = asFiniteNumber(second.score);
  const margin = Math.max(0, topScore - secondScore);
  const meetsScore = topScore >= LORE_OVERRIDE_MIN_SCORE;
  const meetsMargin = matches.length < 2 || margin >= LORE_OVERRIDE_MIN_MARGIN;
  const shouldOverride = meetsScore && meetsMargin;

  return {
    shouldOverride,
    reason: shouldOverride
      ? 'ok'
      : (!meetsScore ? 'top_score_below_threshold' : 'score_margin_below_threshold'),
    topScore,
    secondScore,
    margin,
  };
}

export function resolveConversationMode(turnContext: unknown, hasBeatContract: boolean): ConversationMode {
  const interactionMode = isRecord(turnContext) ? turnContext.interactionMode : undefined;
  if (hasBeatContract) {
    if (interactionMode === 'hybrid') return 'hybrid';
    return 'narrative';
  }
  if (interactionMode === 'hybrid') return 'hybrid';
  return 'character';
}

export function normalizeConversationModeForPolicy(mode: unknown): ConversationMode {
  return normalizeConversationMode(mode);
}

export function resolveEvidenceBudget(mode: unknown): EvidenceBudgetWithMode {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const selected = EVIDENCE_BUDGETS_BY_MODE[normalizedMode] ?? EVIDENCE_BUDGETS_BY_MODE.character;
  return {
    ...selected,
    mode: normalizedMode,
  };
}

export function resolveRetrievalQualityThreshold(mode: unknown): RetrievalQualityThresholdWithMode {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const selected = RETRIEVAL_QUALITY_THRESHOLDS_BY_MODE[normalizedMode] ?? RETRIEVAL_QUALITY_THRESHOLDS_BY_MODE.character;
  return {
    ...selected,
    mode: normalizedMode,
  };
}

export function resolveRerankBudgetTier(input: ResolveRerankBudgetTierInput): RerankBudgetTier {
  const normalizedMode = normalizeConversationModeForPolicy(input.mode);
  const queryType = normalizeQueryType(input.queryType);
  const routingIntent = normalizeRoutingIntent(input.routingIntent);
  if (input.hasBeatContract && (normalizedMode === 'narrative' || normalizedMode === 'hybrid')) {
    return 'high';
  }
  if (isKnowledgeSeekingQueryType(queryType)) {
    return normalizedMode === 'character' ? 'standard' : 'high';
  }
  if (routingIntent === 'social_chat' || routingIntent === 'unclear') {
    return 'low';
  }
  return 'standard';
}

export function resolveRerankCandidateCap(mode: unknown, budgetTier: unknown): number {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const tier = budgetTier === 'low' || budgetTier === 'high' ? budgetTier : 'standard';
  const byMode = RERANK_CANDIDATE_CAPS_BY_MODE[normalizedMode] ?? RERANK_CANDIDATE_CAPS_BY_MODE.character;
  const cap = byMode[tier];
  return Number.isFinite(cap) ? Math.max(1, Math.floor(cap)) : 8;
}

export function createEmptyBeatEvidence(): {
  coveredFacts: string[];
  uncoveredFacts: string[];
  completionSignal: 'none';
  confidence: number;
} {
  return {
    coveredFacts: [],
    uncoveredFacts: [],
    completionSignal: 'none',
    confidence: 0,
  };
}

export function inferEvidenceOwnerType(entry: unknown, selfEntityId: unknown, npcId: unknown): EvidenceOwnerType {
  const sourceType = isRecord(entry) && typeof entry.sourceType === 'string' ? entry.sourceType : 'unknown';
  let ownerType: EvidenceOwnerType = 'unknown';
  if (sourceType === 'player_fact' || sourceType === 'session_fact') ownerType = 'player';
  else if (sourceType === 'self_profile') ownerType = 'npc';
  else if (sourceType === 'beat_fact') ownerType = 'beat';
  else if (sourceType === 'routine_state') ownerType = isRecord(entry) && entry.selfAttributed === true ? 'npc' : 'world';
  else if (sourceType === 'lore_chunk') {
    if (isRecord(entry) && entry.selfAttributed === true) ownerType = 'npc';
    else {
      const entityIds = isRecord(entry) && Array.isArray(entry.entityIds)
        ? entry.entityIds.filter((value): value is string => typeof value === 'string').map((value) => value.toLowerCase())
        : [];
      const normalizedSelfEntityId = normalizeOptionalString(selfEntityId)?.toLowerCase();
      const normalizedNpcId = normalizeOptionalString(npcId)?.toLowerCase();
      if (
        (normalizedSelfEntityId && entityIds.includes(normalizedSelfEntityId))
        || (normalizedNpcId && entityIds.includes(normalizedNpcId))
      ) {
        ownerType = 'npc';
      } else if (entityIds.length > 0) {
        ownerType = 'world';
      }
    }
  }
  return EVIDENCE_OWNER_TYPES.has(ownerType) ? ownerType : 'unknown';
}

export function splitEvidenceIntoClaims(text: unknown, limit = 2, focusText = ''): string[] {
  const normalized = normalizeEvidenceTextForPlan(text);
  if (!normalized) return [];
  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => normalizeFact(entry))
    .filter(Boolean);
  if (sentences.length === 0) return [];
  const maxUnits = Math.max(1, limit);
  if (sentences.length <= maxUnits) return sentences;
  const focus = normalizeEvidenceTextForPlan(focusText);
  if (!focus) return sentences.slice(0, maxUnits);

  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      overlap: lexicalOverlapScore(focus, sentence),
    }))
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.index - b.index;
    });
  const topOverlap = ranked[0]?.overlap ?? 0;
  if (topOverlap <= 0) {
    return sentences.slice(0, maxUnits);
  }
  return ranked.slice(0, maxUnits).map((entry) => entry.sentence);
}

function parseSourceOrdinal(sourceId: unknown): number {
  const value = normalizeOptionalString(sourceId);
  if (!value) return 0;
  const parts = value.split(':');
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part) continue;
    const parsed = Number.parseInt(part, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function sourcePriorityForBudget(item: EvidenceItem, mode: unknown): number {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  switch (item.sourceType) {
    case 'beat_fact':
      return normalizedMode === 'character' ? 72 : 110;
    case 'player_fact':
      return 100;
    case 'session_fact':
      return 90;
    case 'lore_chunk':
      return 82;
    case 'self_profile':
      return 70;
    default:
      return 60;
  }
}

function ownerQueryCompatibilityScore(ownerType: EvidenceOwnerType, queryType: QueryType, routeIntent: RoutingIntent | 'unclear'): number {
  if (routeIntent === 'session_recall') {
    return ownerType === 'player' ? 1 : 0;
  }
  if (queryType === 'self_query' || routeIntent === 'identity_self') {
    if (ownerType === 'npc' || ownerType === 'beat') return 1;
    return 0.1;
  }
  if (queryType === 'world_query' || routeIntent === 'lore_world') {
    if (ownerType === 'world' || ownerType === 'beat' || ownerType === 'unknown') return 1;
    return 0.2;
  }
  if (queryType === 'other_query' || queryType === 'mixed_query' || routeIntent === 'lore_other' || routeIntent === 'mixed_knowledge') {
    return ownerType === 'player' ? 0.25 : 0.9;
  }
  return 0.7;
}

function rankEvidenceForBudget(input: RankEvidenceForBudgetInput): Array<{
  item: EvidenceItem;
  index: number;
  score: number;
  overlap: number;
  compatibility: number;
}> {
  const queryType = normalizeQueryType(input.queryType);
  const routeIntent = normalizeRoutingIntent(input.routeIntent);
  return (Array.isArray(input.items) ? input.items : [])
    .map((item, index) => {
      if (!isEvidenceItem(item)) return null;
      const typedItem = item;
      const overlap = lexicalOverlapScore(input.playerMessage, typedItem.text);
      const compatibility = ownerQueryCompatibilityScore(typedItem.ownerType, queryType, routeIntent);
      const confidence = typeof typedItem.confidence === 'number' && Number.isFinite(typedItem.confidence)
        ? Math.max(0, Math.min(1, typedItem.confidence))
        : 0.5;
      const recencyBoost = (typedItem.sourceType === 'player_fact' || typedItem.sourceType === 'session_fact')
        ? Math.min(1, parseSourceOrdinal(typedItem.sourceId) / MAX_SESSION_FACTS_PER_NPC)
        : 0;
      const sourcePriority = sourcePriorityForBudget(typedItem, input.mode);
      const score = sourcePriority
        + (compatibility * 15)
        + (overlap * 12)
        + (confidence * 8)
        + (recencyBoost * 6);
      return {
        item: typedItem,
        index,
        score: Number(score.toFixed(4)),
        overlap: Number(overlap.toFixed(4)),
        compatibility: Number(compatibility.toFixed(4)),
      };
    })
    .filter((entry): entry is {
      item: EvidenceItem;
      index: number;
      score: number;
      overlap: number;
      compatibility: number;
    } => entry !== null)
    .sort((a, b) => (
      b.score - a.score
      || a.item.sourceId.localeCompare(b.item.sourceId)
      || a.index - b.index
    ));
}

function applyEvidenceBudget(input: ApplyEvidenceBudgetInput): {
  selectedItems: EvidenceItem[];
  usage: {
    facts: number;
    spans: number;
    contextTokens: number;
    memoryItems: number;
    beatFacts: number;
  };
  withinBudget: true;
  droppedCount: number;
  rankedCount: number;
} {
  const ranked = rankEvidenceForBudget(input);
  const usage = {
    facts: 0,
    spans: 0,
    contextTokens: 0,
    memoryItems: 0,
    beatFacts: 0,
  };
  const selected: EvidenceItem[] = [];
  let skippedForBudget = 0;
  for (const entry of ranked) {
    const item = entry.item;
    const tokenCost = countEvidenceTokens(item.text);
    const nextFacts = usage.facts + 1;
    const nextSpans = usage.spans + 1;
    const nextContextTokens = usage.contextTokens + tokenCost;
    const isMemoryItem = item.sourceType === 'session_fact' || item.sourceType === 'player_fact';
    const nextMemoryItems = usage.memoryItems + (isMemoryItem ? 1 : 0);
    const isBeatFact = item.sourceType === 'beat_fact';
    const nextBeatFacts = usage.beatFacts + (isBeatFact ? 1 : 0);

    if (nextFacts > input.budget.maxFacts) {
      skippedForBudget += 1;
      continue;
    }
    if (nextSpans > input.budget.maxSpans) {
      skippedForBudget += 1;
      continue;
    }
    if (nextContextTokens > input.budget.maxContextTokens) {
      skippedForBudget += 1;
      continue;
    }
    if (nextMemoryItems > input.budget.maxMemoryFacts) {
      skippedForBudget += 1;
      continue;
    }
    if (nextBeatFacts > input.budget.maxBeatFacts) {
      skippedForBudget += 1;
      continue;
    }

    selected.push(item);
    usage.facts = nextFacts;
    usage.spans = nextSpans;
    usage.contextTokens = nextContextTokens;
    usage.memoryItems = nextMemoryItems;
    usage.beatFacts = nextBeatFacts;
  }

  return {
    selectedItems: selected,
    usage,
    withinBudget: true,
    droppedCount: skippedForBudget,
    rankedCount: ranked.length,
  };
}

export function buildLoreArtifactVersionToken(loreArtifacts: unknown): string {
  const typedArtifacts = isRecord(loreArtifacts) ? loreArtifacts as LoreArtifacts : null;
  if (!isRecord(typedArtifacts?.manifest)) return 'no-lore-artifact';
  const manifest = typedArtifacts.manifest as LoreManifest;
  const source = isRecord(manifest.source) ? manifest.source as LoreSource : undefined;
  const schemaVersion = normalizeOptionalString(String(manifest?.schemaVersion ?? '1')) ?? '1';
  const loreArtifactVersion = normalizeOptionalString(manifest?.loreArtifactVersion) ?? 'unknown-artifact';
  const toolVersion = normalizeOptionalString(manifest?.toolVersion) ?? 'unknown-tool';
  const sourceCommit = normalizeOptionalString(source?.commit) ?? 'unknown-commit';
  return `schema:${schemaVersion}|artifact:${loreArtifactVersion}|tool:${toolVersion}|commit:${sourceCommit}`;
}

function normalizeScopesForCache(scopes: unknown): string[] {
  return normalizeStringArray(scopes)
    .map((entry) => entry.toLowerCase())
    .sort((a, b) => a.localeCompare(b));
}

function normalizeRetrievalFiltersForCache(filters: unknown): string {
  const value = isRecord(filters) ? filters : {};
  const entityIds = normalizeStringArray(value.entityIds).map((entry) => entry.toLowerCase());
  const locationIds = normalizeStringArray(value.locationIds).map((entry) => entry.toLowerCase());
  const factionIds = normalizeStringArray(value.factionIds).map((entry) => entry.toLowerCase());
  return [
    `e=${entityIds.sort((a, b) => a.localeCompare(b)).join(',') || 'none'}`,
    `l=${locationIds.sort((a, b) => a.localeCompare(b)).join(',') || 'none'}`,
    `f=${factionIds.sort((a, b) => a.localeCompare(b)).join(',') || 'none'}`,
  ].join(';');
}

export function buildRerankCacheKey(input: BuildRerankCacheKeyInput): string {
  const normalizedQuery = tokenizeForPlan(input.query).join(' ');
  const scopes = [
    ...normalizeScopesForCache(input.loreScopes),
    ...normalizeScopesForCache(input.selfLoreScopes),
    ...normalizeScopesForCache(input.relatedLoreScopes),
  ].join(',');
  const selfEntity = normalizeOptionalString(input.selfEntityId)?.toLowerCase() ?? 'none';
  const filters = normalizeRetrievalFiltersForCache(input.retrievalFilters);
  return [
    `q=${normalizedQuery}`,
    `qt=${String(input.queryType ?? 'conversation')}`,
    `ri=${String(input.routingIntent ?? 'unclear')}`,
    `mode=${String(input.mode ?? 'character')}`,
    `tier=${String(input.budgetTier ?? 'standard')}`,
    `scope=${scopes || 'none'}`,
    `self=${selfEntity}`,
    `filters=${filters}`,
    `artifact=${String(input.artifactVersion ?? 'unknown')}`,
    `model=${String(input.modelVersion ?? 'unknown')}`,
  ].join('|');
}

function computeRerankEntryScore(input: ComputeRerankEntryScoreInput): number {
  const baseScore = typeof input.candidate.score === 'number' && Number.isFinite(input.candidate.score)
    ? Math.max(0, Math.min(1, input.candidate.score / 4))
    : 0.3;
  const overlap = lexicalOverlapScore(input.query, candidateCoverageText(input.candidate));
  let poolBoost = 0;
  if (input.candidate.pool === 'self') poolBoost += 0.18;
  if (input.candidate.pool === 'related') poolBoost += normalizeQueryType(input.queryType) === 'other_query' ? 0.12 : 0.02;
  if (input.candidate.pool === 'ambient') poolBoost += normalizeQueryType(input.queryType) === 'world_query' ? 0.1 : 0.03;
  const rerankScore = (baseScore * 0.48) + (overlap * 0.42) + poolBoost;
  return Number(Math.max(0, Math.min(1, rerankScore)).toFixed(4));
}

export function rerankLoreMatches(input: RerankLoreMatchesInput): {
  ranked: LoreMatchCandidate[];
  candidateCap: number;
  cacheHit: boolean;
  latencyMs: number;
} {
  const candidateCap = resolveRerankCandidateCap(input.mode, input.budgetTier);
  const startedAt = Date.now();

  if (input.cache?.has(input.cacheKey)) {
    const cached = input.cache.get(input.cacheKey);
    return {
      ranked: Array.isArray(cached?.ranked) ? cached.ranked : [],
      candidateCap,
      cacheHit: true,
      latencyMs: Date.now() - startedAt,
    };
  }

  const ranked = (Array.isArray(input.candidates) ? input.candidates : [])
    .filter((candidate): candidate is LoreMatchCandidate => isRecord(candidate))
    .map((candidate) => ({
      ...candidate,
      rerankScore: computeRerankEntryScore({
        candidate,
        query: input.query,
        queryType: input.queryType,
      }),
    }))
    .sort((a, b) => (
      asFiniteNumber(b.rerankScore) - asFiniteNumber(a.rerankScore)
      || asFiniteNumber(a.poolRank, Number.MAX_SAFE_INTEGER) - asFiniteNumber(b.poolRank, Number.MAX_SAFE_INTEGER)
      || String(a.chunk?.chunkId ?? '').localeCompare(String(b.chunk?.chunkId ?? ''))
    ))
    .slice(0, candidateCap);

  if (input.cache) {
    input.cache.set(input.cacheKey, { ranked });
    if (input.cache.size > RERANK_CACHE_MAX_ENTRIES) {
      const oldestKey = input.cache.keys().next().value;
      if (typeof oldestKey === 'string') {
        input.cache.delete(oldestKey);
      }
    }
  }

  return {
    ranked,
    candidateCap,
    cacheHit: false,
    latencyMs: Date.now() - startedAt,
  };
}

function computeEvidenceConflictRisk(matches: unknown): number {
  const selected = Array.isArray(matches) ? matches : [];
  if (selected.length < 2) return 0;
  const negationPattern = /\b(no|not|never|none|without|cannot|can't|isn't|aren't|wasn't|weren't|didn't|don't|doesn't)\b/i;
  let comparablePairs = 0;
  let conflictingPairs = 0;
  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) {
      const left = isRecord(selected[i]) ? selected[i] as LoreMatchCandidate : {};
      const right = isRecord(selected[j]) ? selected[j] as LoreMatchCandidate : {};
      const leftText = candidateSemanticText(left);
      const rightText = candidateSemanticText(right);
      const overlap = lexicalOverlapScore(leftText, rightText);
      if (overlap < 0.22) continue;
      comparablePairs += 1;
      const leftNegated = negationPattern.test(leftText);
      const rightNegated = negationPattern.test(rightText);
      if (leftNegated !== rightNegated) {
        conflictingPairs += 1;
      }
    }
  }
  if (comparablePairs === 0) return 0;
  return Number((conflictingPairs / comparablePairs).toFixed(4));
}

function computeEvidenceCoverageScore(query: unknown, matches: unknown): number {
  const queryTokens = extractFacetQueryTokens(query);
  if (queryTokens.length === 0) return 1;
  const evidenceTokens = new Set<string>();
  for (const entry of Array.isArray(matches) ? matches : []) {
    const candidate = isRecord(entry) ? entry as LoreMatchCandidate : {};
    for (const token of tokenizeForPlan(candidateCoverageText(candidate))) {
      evidenceTokens.add(token);
    }
  }
  if (evidenceTokens.size === 0) return 0;
  let covered = 0;
  for (const token of queryTokens) {
    const variants = expandFacetQueryTokenVariants(token);
    if ([...variants].some((variant) => evidenceTokens.has(variant))) {
      covered += 1;
    }
  }
  return Number((covered / queryTokens.length).toFixed(4));
}

function normalizeRetrievalSupportScore(value: unknown): number {
  if (!Number.isFinite(value)) return 0;
  if (Number(value) <= 1) return Math.max(0, Math.min(1, Number(value)));
  return Math.max(0, Math.min(1, Number(value) / 4));
}

function computeSupportConfidence(matches: unknown): number {
  const selected = Array.isArray(matches) ? matches : [];
  if (selected.length === 0) return 0;
  const total = selected.reduce((sum, entry) => {
    const candidate = isRecord(entry) ? entry as LoreMatchCandidate : {};
    return sum + normalizeRetrievalSupportScore(candidate.rerankScore ?? candidate.score ?? 0);
  }, 0);
  return Number((total / selected.length).toFixed(4));
}

export function evaluateRetrievalQuality(input: EvaluateRetrievalQualityInput): {
  required: boolean;
  pass: boolean;
  reason: string;
  coverage: number;
  conflictRisk: number;
  supportConfidence: number;
} {
  const queryType = normalizeQueryType(input.queryType);
  const routeIntent = normalizeRoutingIntent(input.routeIntent);
  const knowledgeTurn = isKnowledgeSeekingQueryType(queryType)
    || routeIntent === 'identity_self'
    || routeIntent === 'lore_world'
    || routeIntent === 'lore_other'
    || routeIntent === 'mixed_knowledge';
  if (!knowledgeTurn) {
    return {
      required: false,
      pass: true,
      reason: 'not_required',
      coverage: 1,
      conflictRisk: 0,
      supportConfidence: 1,
    };
  }
  if (!Array.isArray(input.selectedMatches) || input.selectedMatches.length === 0) {
    return {
      required: true,
      pass: false,
      reason: 'no_candidates',
      coverage: 0,
      conflictRisk: 0,
      supportConfidence: 0,
    };
  }
  const thresholds = resolveRetrievalQualityThreshold(input.mode);
  const coverage = computeEvidenceCoverageScore(input.interpretation ?? input.query, input.selectedMatches);
  const conflictRisk = computeEvidenceConflictRisk(input.selectedMatches);
  const supportConfidence = computeSupportConfidence(input.selectedMatches);

  if (coverage < thresholds.minCoverage) {
    return {
      required: true,
      pass: false,
      reason: 'coverage_low',
      coverage,
      conflictRisk,
      supportConfidence,
    };
  }
  if (supportConfidence < thresholds.minSupportConfidence) {
    return {
      required: true,
      pass: false,
      reason: 'support_low',
      coverage,
      conflictRisk,
      supportConfidence,
    };
  }
  if (conflictRisk > thresholds.maxConflictRisk) {
    return {
      required: true,
      pass: false,
      reason: 'conflict_risk_high',
      coverage,
      conflictRisk,
      supportConfidence,
    };
  }
  return {
    required: true,
    pass: true,
    reason: 'sufficient',
    coverage,
    conflictRisk,
    supportConfidence,
  };
}

export function buildCorrectiveLoreQuery(playerMessage: unknown, queryType: unknown, routeIntent: unknown): string {
  const normalizedQueryType = normalizeQueryType(queryType);
  const normalizedRouteIntent = normalizeRoutingIntent(routeIntent);
  const base = tokenizeForPlan(playerMessage).slice(0, 16).join(' ');
  if (!base) return String(playerMessage ?? '');
  if (normalizedQueryType === 'self_query' || normalizedRouteIntent === 'identity_self') {
    return `self identity ${base}`;
  }
  if (normalizedQueryType === 'world_query' || normalizedRouteIntent === 'lore_world') {
    return `world lore ${base}`;
  }
  if (normalizedQueryType === 'other_query' || normalizedRouteIntent === 'lore_other') {
    return `related character ${base}`;
  }
  if (normalizedQueryType === 'mixed_query' || normalizedRouteIntent === 'mixed_knowledge') {
    return `world and character ${base}`;
  }
  return base;
}

export function buildEvidencePack(input: BuildEvidencePackInput): {
  schemaVersion: number;
  queryType: QueryType;
  routingIntent: RoutingIntent | 'unclear';
  policyPath: string;
  items: EvidenceItem[];
  ownerCounts: Record<string, number>;
  sourceTypeCounts: Record<string, number>;
  evidenceIdToItem: Map<string, EvidenceItem>;
  budget: {
    mode: ConversationMode;
    limits: {
      facts: number;
      spans: number;
      contextTokens: number;
      memoryItems: number;
      beatFacts: number;
    };
    usage: {
      facts: number;
      spans: number;
      contextTokens: number;
      memoryItems: number;
      beatFacts: number;
    };
    withinBudget: true;
    droppedCount: number;
    candidateCount: number;
  };
} {
  const loreScoreBySourceId = new Map<string, number>();
  for (const matchEntry of Array.isArray(input.loreMatches) ? input.loreMatches : []) {
    if (!isRecord(matchEntry) || !isRecord(matchEntry.chunk)) continue;
    const chunkId = normalizeOptionalString((matchEntry.chunk as MatchChunk).chunkId);
    if (!chunkId) continue;
    const score = typeof matchEntry.score === 'number' && Number.isFinite(matchEntry.score)
      ? Math.max(0, Math.min(1, matchEntry.score / 3))
      : 0.4;
    loreScoreBySourceId.set(chunkId, score);
  }

  const items: EvidenceItem[] = [];
  const evidenceIdToItem = new Map<string, EvidenceItem>();
  for (const entry of Array.isArray(input.evidenceEntries) ? input.evidenceEntries : []) {
    if (!isRecord(entry)) continue;
    const typedEntry = entry as EvidenceEntryLike;
    const sourceId = normalizeOptionalString(typedEntry.sourceId);
    const sourceType = normalizeOptionalString(typedEntry.sourceType) ?? 'unknown';
    const text = normalizeEvidenceTextForPlan(typedEntry.text);
    if (!sourceId || !text) continue;
    const confidence = sourceType === 'lore_chunk'
      ? (loreScoreBySourceId.get(sourceId) ?? 0.5)
      : sourceType === 'player_fact' || sourceType === 'session_fact'
        ? 0.95
        : sourceType === 'self_profile'
          ? 0.9
          : sourceType === 'beat_fact'
            ? 0.88
            : 0.6;
    const ownerType = inferEvidenceOwnerType(typedEntry, input.selfEntityId, input.npcId);
    const evidenceItem: EvidenceItem = {
      evidenceId: `ev_${items.length + 1}`,
      sourceId,
      sourceType,
      ownerType,
      text,
      factId: normalizeOptionalString(typedEntry.factId),
      chunkId: normalizeOptionalString(typedEntry.chunkId),
      verificationStatus: normalizeOptionalString(typedEntry.verificationStatus) ?? 'available',
      provenance: isRecord(typedEntry.provenance) ? typedEntry.provenance : undefined,
      entityIds: Array.isArray(typedEntry.entityIds)
        ? typedEntry.entityIds.filter((value): value is string => typeof value === 'string')
        : [],
      anchorTerms: Array.isArray(typedEntry.anchorTerms)
        ? typedEntry.anchorTerms.filter((value): value is string => typeof value === 'string')
        : [],
      selfAttributed: typedEntry.selfAttributed === true,
      confidence: Number(confidence.toFixed(4)),
    };
    items.push(evidenceItem);
  }

  const budget = resolveEvidenceBudget(input.mode);
  const budgeted = applyEvidenceBudget({
    items,
    budget,
    mode: input.mode,
    playerMessage: input.playerMessage,
    queryType: input.queryType,
    routeIntent: input.routing?.intent ?? 'unclear',
  });
  const budgetedItems = budgeted.selectedItems.map((item, index) => ({
    ...item,
    evidenceId: `ev_${index + 1}`,
  }));
  for (const item of budgetedItems) {
    evidenceIdToItem.set(item.evidenceId, item);
  }

  const ownerCounts: Record<string, number> = {};
  const sourceTypeCounts: Record<string, number> = {};
  for (const item of budgetedItems) {
    ownerCounts[item.ownerType] = (ownerCounts[item.ownerType] ?? 0) + 1;
    sourceTypeCounts[item.sourceType] = (sourceTypeCounts[item.sourceType] ?? 0) + 1;
  }

  return {
    schemaVersion: 1,
    queryType: normalizeQueryType(input.queryType),
    routingIntent: normalizeRoutingIntent(input.routing?.intent),
    policyPath: normalizeOptionalString(input.routing?.policyPath) ?? 'safe_chat',
    items: budgetedItems,
    ownerCounts,
    sourceTypeCounts,
    evidenceIdToItem,
    budget: {
      mode: budget.mode,
      limits: {
        facts: budget.maxFacts,
        spans: budget.maxSpans,
        contextTokens: budget.maxContextTokens,
        memoryItems: budget.maxMemoryFacts,
        beatFacts: budget.maxBeatFacts,
      },
      usage: budgeted.usage,
      withinBudget: budgeted.withinBudget,
      droppedCount: budgeted.droppedCount,
      candidateCount: budgeted.rankedCount,
    },
  };
}

export function toRecallClaimText(rawText: unknown): string {
  const fact = normalizeFact(String(rawText ?? ''));
  if (!fact) return '';
  const nameMatch = fact.match(/^my name is\s+(.+)$/i);
  if (nameMatch?.[1]) return `your name is ${nameMatch[1]}`;
  const fromMatch = fact.match(/^i(?:'m| am) from\s+(.+)$/i);
  if (fromMatch?.[1]) return `you are from ${fromMatch[1]}`;
  const likeMatch = fact.match(/^i like\s+(.+)$/i);
  if (likeMatch?.[1]) return `you like ${likeMatch[1]}`;
  const speakMatch = fact.match(/^i speak\s+(.+)$/i);
  if (speakMatch?.[1]) return `you speak ${speakMatch[1]}`;
  return fact.charAt(0).toLowerCase() + fact.slice(1);
}

export function pickEvidenceForIntent(
  evidencePack: unknown,
  playerMessage: unknown,
  intent: unknown,
  queryType: unknown,
  selfEntityId: unknown,
  npcId: unknown,
): PickEvidenceForIntentRankedEntry[] {
  const items = isRecord(evidencePack) && Array.isArray(evidencePack.items)
    ? evidencePack.items
    : [];
  const normalizedIntent = normalizeRoutingIntent(intent);
  const normalizedQueryType = normalizeQueryType(queryType);
  const normalizedSelfEntityId = normalizeOptionalString(selfEntityId)?.toLowerCase();
  const normalizedNpcId = normalizeOptionalString(npcId)?.toLowerCase();

  const filtered = items.filter((item): item is EvidenceItem => {
    if (!isEvidenceItem(item)) return false;
    const typedItem = item;
    if (typedItem.sourceType === 'self_profile') {
      return false;
    }
    if (normalizedIntent === 'session_recall') {
      return typedItem.ownerType === 'player';
    }
    if (normalizedIntent === 'identity_self' || normalizedQueryType === 'self_query') {
      if (typedItem.ownerType === 'npc') {
        return typedItem.sourceType !== 'self_profile';
      }
      if (typedItem.ownerType === 'beat') {
        const entityIds = Array.isArray(typedItem.entityIds) ? typedItem.entityIds.map((entry) => String(entry).toLowerCase()) : [];
        return Boolean(
          (normalizedSelfEntityId && entityIds.includes(normalizedSelfEntityId))
          || (normalizedNpcId && entityIds.includes(normalizedNpcId))
        );
      }
      return false;
    }
    if (normalizedIntent === 'lore_world' || normalizedQueryType === 'world_query') {
      return typedItem.ownerType === 'world' || typedItem.ownerType === 'beat' || typedItem.ownerType === 'unknown';
    }
    if (normalizedIntent === 'lore_other' || normalizedQueryType === 'other_query' || normalizedIntent === 'mixed_knowledge' || normalizedQueryType === 'mixed_query') {
      return typedItem.ownerType !== 'player';
    }
    return true;
  });

  return filtered
    .map((item) => {
      const overlap = lexicalOverlapScore(playerMessage, item.text);
      const score = (overlap * 0.68) + (item.confidence * 0.32);
      return {
        item,
        overlap: Number(overlap.toFixed(4)),
        score: Number(score.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function selectKnowledgeEvidence(ranked: unknown, maxResults = 2): PickEvidenceForIntentRankedEntry[] {
  const candidates = Array.isArray(ranked)
    ? ranked.filter((entry): entry is PickEvidenceForIntentRankedEntry => isPickEvidenceForIntentRankedEntry(entry))
    : [];
  if (candidates.length === 0) return [];
  const overlapCandidates = candidates.filter((entry) => Number(entry.overlap) > 0);
  if (overlapCandidates.length > 0) {
    return overlapCandidates.slice(0, Math.max(1, maxResults));
  }
  return candidates.slice(0, 1);
}
