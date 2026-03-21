import {
  buildGroundingEvidenceEntries,
  type GroundingEvidenceEntry,
} from '../grounding/evidence.js';
import {
  enrichEvidencePackWithEpistemics,
} from '../evidence/enrichment.js';
import {
  runGovernedLoreRetrieval,
} from './pipeline.js';
import {
  buildEvidencePack,
  resolveConversationMode,
} from '../retrieval-governance.js';
import {
  isKnowledgeSeekingQueryType,
  routeIntentUsesLore,
  type QueryType,
  type RoutingIntent,
} from '../routing.js';
import type { QueryInterpretation } from '../turn-contracts.js';

interface RecordLike {
  [key: string]: unknown;
}

interface NpcProfileLike {
  loreScopes?: unknown;
  selfLoreScopes?: unknown;
  relatedLoreScopes?: unknown;
  selfEntityId?: unknown;
  persona?: unknown;
}

interface RoutingLike {
  intent?: RoutingIntent | string;
  policyPath?: unknown;
  interpretation?: QueryInterpretation | null;
}

interface TurnContextLike {
  interactionMode?: unknown;
  regionPath?: unknown;
  regionName?: unknown;
  currentActivity?: unknown;
  currentGoal?: unknown;
}

interface BeatContractLike {
  beatId?: unknown;
}

export interface RetrieveStageInput {
  npcId: string;
  npcName: string;
  playerMessage: string;
  queryType: QueryType;
  routing: RoutingLike;
  loreArtifacts?: unknown;
  npcProfile?: NpcProfileLike | null;
  memoryFacts?: unknown;
  history?: unknown;
  turnContext?: TurnContextLike | null;
  beatContract?: BeatContractLike | null;
  requireLoreScopeForRetrieval?: boolean;
  retrievalFilters?: {
    entityIds?: string[];
    locationIds?: string[];
    factionIds?: string[];
    aliases?: string[];
  } | null;
  embedTexts?: ((texts: string[]) => Promise<number[][]>) | null;
  modelVersion?: unknown;
  rerankerClass?: string;
  embeddingDegradedReason?: string | null;
}

export interface RetrieveStageResult {
  loreScopes: string[];
  selfLoreScopes: string[];
  relatedLoreScopes: string[];
  resolvedMode: ReturnType<typeof resolveConversationMode>;
  retrieval: {
    attempted: boolean;
    matches: Array<Record<string, unknown>>;
    quality: Record<string, unknown>;
    governance: Record<string, unknown>;
    embeddingDegradedReason?: string | null;
  };
  groundingEvidenceEntries: GroundingEvidenceEntry[];
  evidencePack: ReturnType<typeof buildEvidencePack>;
  enrichedEvidencePack: ReturnType<typeof enrichEvidencePackWithEpistemics>;
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

export async function runRetrieveStage(input: RetrieveStageInput): Promise<RetrieveStageResult> {
  const loreScopes = normalizeStringArray(input.npcProfile?.loreScopes);
  const selfLoreScopes = normalizeStringArray(input.npcProfile?.selfLoreScopes);
  const relatedLoreScopes = normalizeStringArray(input.npcProfile?.relatedLoreScopes);
  const hasScopes = loreScopes.length > 0 || selfLoreScopes.length > 0 || relatedLoreScopes.length > 0;
  const canRetrieveLore = Boolean(input.loreArtifacts);
  const shouldAttemptLoreRetrieval = canRetrieveLore
    && (
      isKnowledgeSeekingQueryType(input.queryType)
      || routeIntentUsesLore(input.routing?.intent ?? 'unclear')
      || input.routing?.interpretation?.lane === 'knowledge'
    )
    && (!input.requireLoreScopeForRetrieval || hasScopes);

  const resolvedMode = resolveConversationMode(input.turnContext, Boolean(input.beatContract));
  const governedRetrieval = await runGovernedLoreRetrieval({
    loreArtifacts: input.loreArtifacts,
    canRetrieveLore,
    shouldAttemptLoreRetrieval,
    playerMessage: input.playerMessage,
    interpretation: input.routing?.interpretation,
    mode: resolvedMode,
    routingIntent: input.routing?.intent ?? 'unclear',
    queryType: input.queryType,
    activeBeatId: normalizeOptionalString(input.beatContract?.beatId),
    loreScopes,
    selfLoreScopes,
    relatedLoreScopes,
    selfEntityId: input.npcProfile?.selfEntityId,
    hasBeatContract: Boolean(input.beatContract),
    rerankCache: undefined,
    artifactVersion: undefined,
    modelVersion: input.modelVersion,
    rerankerClass: input.rerankerClass ?? 'lexical',
    retrievalFilters: input.retrievalFilters ?? undefined,
    embedTexts: input.embedTexts ?? undefined,
  });

  const retrieval = {
    attempted: governedRetrieval.governance.attempted,
    matches: governedRetrieval.loreMatches,
    quality: governedRetrieval.retrievalQuality,
    governance: governedRetrieval.governance,
    embeddingDegradedReason: input.embeddingDegradedReason ?? null,
  };

  const groundingEvidenceEntries = buildGroundingEvidenceEntries({
    loreMatches: retrieval.matches,
    loreArtifacts: input.loreArtifacts as RecordLike | null | undefined,
    npcId: input.npcId,
    npcName: input.npcName,
    npcProfile: input.npcProfile as RecordLike | null | undefined,
    selfEntityId: input.npcProfile?.selfEntityId,
    beatContract: input.beatContract as RecordLike | null | undefined,
    memoryFacts: input.memoryFacts,
    playerMessage: input.playerMessage,
    history: input.history,
    regionPath: input.turnContext?.regionPath,
    regionName: input.turnContext?.regionName,
    currentActivity: input.turnContext?.currentActivity,
    currentGoal: input.turnContext?.currentGoal,
  });

  const evidencePack = buildEvidencePack({
    evidenceEntries: groundingEvidenceEntries,
    loreMatches: retrieval.matches,
    mode: resolvedMode,
    playerMessage: input.playerMessage,
    queryType: input.queryType,
    routing: input.routing,
    selfEntityId: input.npcProfile?.selfEntityId,
    npcId: input.npcId,
  });
  const enrichedEvidencePack = enrichEvidencePackWithEpistemics(
    evidencePack,
    input.beatContract,
  );

  return {
    loreScopes,
    selfLoreScopes,
    relatedLoreScopes,
    resolvedMode,
    retrieval,
    groundingEvidenceEntries,
    evidencePack,
    enrichedEvidencePack,
  };
}
