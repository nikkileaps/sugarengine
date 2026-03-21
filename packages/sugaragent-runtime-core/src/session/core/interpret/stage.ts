import {
  buildEvidencePreview,
  enhanceInterpretationWithFacetSimilarity,
} from '../query-interpretation.js';
import {
  collectLoreEntityRouteMatches,
  refineRouteWithLoreEntityMentions,
  routeIntentToQueryType,
  routeTurnIntent,
  routeTurnIntentFromInterpretation,
  type LoreEntityRouteMatch,
  type LoreEntityRouteRefinement,
  type QueryType,
  type RoutingResult,
} from '../routing.js';
import {
  attachSubjectSelectionToInterpretation,
} from '../subject-relevance.js';
import type {
  QueryInterpretation,
  ReferentPreviewCandidate,
} from '../turn-contracts.js';

interface ConversationTurnLike {
  role?: unknown;
  text?: unknown;
}

interface NpcProfileLike {
  loreScopes?: unknown;
  selfLoreScopes?: unknown;
  relatedLoreScopes?: unknown;
  selfEntityId?: unknown;
}

interface TurnContextLike {
  queryType?: unknown;
  interactionMode?: unknown;
  regionName?: unknown;
  regionPath?: unknown;
  currentActivity?: unknown;
  currentGoal?: unknown;
}

interface TopicCoverageContextLike {
  activeTopic?: unknown;
}

export interface InterpretStageInput {
  playerMessage: string;
  npcName: string;
  targetLanguage?: string;
  history?: ConversationTurnLike[];
  turnContext?: TurnContextLike | null;
  topicCoverageContext?: TopicCoverageContextLike | null;
  recentReferentPreview?: ReferentPreviewCandidate[];
  npcProfile?: NpcProfileLike | null;
  loreArtifacts?: unknown;
  embedTexts?: ((texts: string[]) => Promise<number[][]>) | null;
}

export interface InterpretStageSemanticDiagnostics {
  exemplarEnabled: boolean;
  exemplarAttempted: boolean;
  exemplarChanged: boolean;
  degradedReason?: string;
}

export interface InterpretStageResult {
  routing: RoutingResult;
  queryType: QueryType;
  loreEntityHints: LoreEntityRouteMatch[];
  routingRefinement: LoreEntityRouteRefinement;
  semanticDiagnostics: InterpretStageSemanticDiagnostics;
  embeddingDegradedReason: string | null;
  interpretationPreview: ReturnType<typeof buildEvidencePreview>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

export async function runInterpretStage(input: InterpretStageInput): Promise<InterpretStageResult> {
  const loreEntityHints = collectLoreEntityRouteMatches(input.playerMessage, input.loreArtifacts);
  const interpretationPreview = buildEvidencePreview({
    selfEntityId: normalizeOptionalString(input.npcProfile?.selfEntityId),
    regionName: normalizeOptionalString(input.turnContext?.regionName),
    regionPath: normalizeOptionalString(input.turnContext?.regionPath),
    currentActivity: normalizeOptionalString(input.turnContext?.currentActivity),
    currentGoal: normalizeOptionalString(input.turnContext?.currentGoal),
    activeTopic: normalizeOptionalString(input.topicCoverageContext?.activeTopic),
    recentReferents: Array.isArray(input.recentReferentPreview) ? input.recentReferentPreview : [],
    loreScopes: normalizeStringArray(input.npcProfile?.loreScopes),
    selfLoreScopes: normalizeStringArray(input.npcProfile?.selfLoreScopes),
    relatedLoreScopes: normalizeStringArray(input.npcProfile?.relatedLoreScopes),
    entityIds: loreEntityHints
      .filter((entry) => entry.filterKind === 'entityIds')
      .map((entry) => entry.entityId),
    locationIds: loreEntityHints
      .filter((entry) => entry.filterKind === 'locationIds')
      .map((entry) => entry.entityId),
    tagHints: loreEntityHints.map((entry) => entry.matchedText),
  });

  const baseRouting = routeTurnIntent(input.playerMessage, input.npcName, {
    targetLanguage: input.targetLanguage,
    history: input.history,
    scene: {
      regionName: normalizeOptionalString(input.turnContext?.regionName),
      regionPath: normalizeOptionalString(input.turnContext?.regionPath),
      currentActivity: normalizeOptionalString(input.turnContext?.currentActivity),
      currentGoal: normalizeOptionalString(input.turnContext?.currentGoal),
    },
    loreEntityHints,
    evidencePreview: interpretationPreview,
  });

  const semanticDiagnostics: InterpretStageSemanticDiagnostics = {
    exemplarEnabled: typeof input.embedTexts === 'function',
    exemplarAttempted: false,
    exemplarChanged: false,
    degradedReason: undefined,
  };

  let embeddingDegradedReason: string | null = null;
  let interpretedRouting = baseRouting;
  if (baseRouting.interpretation && typeof input.embedTexts === 'function') {
    semanticDiagnostics.exemplarAttempted = true;
    try {
      const enhancedRouting = routeTurnIntentFromInterpretation(
        input.playerMessage,
        await enhanceInterpretationWithFacetSimilarity({
          interpretation: baseRouting.interpretation,
          embedTexts: input.embedTexts,
        }),
        {
          targetLanguage: input.targetLanguage,
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
    playerMessage: input.playerMessage,
    loreArtifacts: input.loreArtifacts,
  });
  let resolvedRouting = routingRefinement.route;

  if (resolvedRouting.interpretation) {
    resolvedRouting = {
      ...resolvedRouting,
      interpretation: await attachSubjectSelectionToInterpretation({
        interpretation: resolvedRouting.interpretation,
        playerMessage: input.playerMessage,
        routeMatches: routingRefinement.matches,
        recentReferents: Array.isArray(input.recentReferentPreview) ? input.recentReferentPreview : [],
        selfEntityId: normalizeOptionalString(input.npcProfile?.selfEntityId),
        embedTexts: input.embedTexts ?? undefined,
      }),
    };
  }

  const explicitQueryType = normalizeOptionalString(input.turnContext?.queryType);
  const queryType: QueryType = explicitQueryType === 'conversation'
    || explicitQueryType === 'self_query'
    || explicitQueryType === 'other_query'
    || explicitQueryType === 'world_query'
    || explicitQueryType === 'mixed_query'
    ? explicitQueryType
    : routeIntentToQueryType(resolvedRouting.intent);

  return {
    routing: resolvedRouting,
    queryType,
    loreEntityHints,
    routingRefinement,
    semanticDiagnostics,
    embeddingDegradedReason,
    interpretationPreview,
  };
}
