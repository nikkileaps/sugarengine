import {
  resolveInitiativePolicy,
} from '../initiative.js';
import {
  computeNoveltyState,
} from '../turn-planning.js';
import {
  checkSocialResponseForFactualLeakage,
  resolveTurnPath,
} from '../turn-path-routing.js';
import {
  routeIntentToQueryType,
  hasLikelyQuestionForm,
  type QueryType,
  type RoutingIntent,
  type RoutingResult,
} from '../routing.js';
import {
  createEvidenceFirstTurnPlanV2,
  hasDirectAnswerableStateEvidence,
  isEvidenceItemRelevantForTurn,
  validateAndRepairTurnPlanV2,
} from './planning.js';
import {
  extractExplicitPlayerFacts,
} from '../memory-provenance.js';
import {
  buildDeterministicSocialReply,
} from '../turn-realization.js';
import type {
  EvidenceFirstPipelineDiagnostics,
  LanguageAdaptationContext,
  NpcStateSnapshot,
  QueryInterpretation,
  TurnRoutingDecision,
  TurnPlan,
  ValidatedTurnPlan,
} from '../turn-contracts.js';
import type { RetrieveStageResult } from '../retrieve/index.js';

interface TopicCoverageContextLike {
  activeTopic?: unknown;
  [key: string]: unknown;
}

interface BeatContractLike {
  [key: string]: unknown;
}

interface RoutingLike extends Partial<RoutingResult> {
  intent: RoutingIntent;
  interpretation?: QueryInterpretation;
}

export interface PlanStageInput {
  npcId: string;
  playerMessage: string;
  recentNpcReplies?: string[];
  routing: RoutingLike;
  retrieve: RetrieveStageResult;
  snapshot: NpcStateSnapshot;
  history?: unknown[];
  turnIndexWithNpc: number;
  topicCoverageContext?: TopicCoverageContextLike | null;
  beatContract?: BeatContractLike | null;
  adaptationContext?: LanguageAdaptationContext | null;
  loreEntityIds?: string[];
  isFirstMeeting?: boolean;
}

export interface PlanStageResult {
  queryType: QueryType;
  turnRouting: TurnRoutingDecision;
  initiativePolicy: ReturnType<typeof resolveInitiativePolicy>;
  plan: TurnPlan;
  validatedPlan: ValidatedTurnPlan & { droppedClaims?: unknown[] };
  diagnostics: EvidenceFirstPipelineDiagnostics;
}

function computeEvidenceBackedRetrievalConfidence(input: {
  queryType: QueryType;
  routeIntent: RoutingIntent;
  retrievalMatches?: unknown[];
  evidenceItems?: Array<{ ownerType?: unknown }>;
}): number {
  const retrievalMatches = Array.isArray(input.retrievalMatches) ? input.retrievalMatches : [];
  const evidenceItems = Array.isArray(input.evidenceItems) ? input.evidenceItems : [];

  if (retrievalMatches.length > 0) return 0.7;

  const npcEvidenceCount = evidenceItems.filter((item) => item?.ownerType === 'npc' || item?.ownerType === 'beat').length;
  if ((input.queryType === 'self_query' || input.routeIntent === 'identity_self') && npcEvidenceCount > 0) {
    return 0.76;
  }
  if (evidenceItems.length > 0) return 0.42;
  return 0.1;
}

export async function runPlanStage(input: PlanStageInput): Promise<PlanStageResult> {
  const normalizedRouting: RoutingResult = {
    intent: input.routing.intent,
    confidence: typeof input.routing.confidence === 'number' ? input.routing.confidence : 0.5,
    margin: typeof input.routing.margin === 'number' ? input.routing.margin : 0.2,
    candidateScores: Array.isArray(input.routing.candidateScores) ? input.routing.candidateScores : [],
    policyPath: input.routing.policyPath ?? 'safe_chat',
    ...(input.routing.interpretation ? { interpretation: input.routing.interpretation } : {}),
  };

  const queryType = routeIntentToQueryType(normalizedRouting.intent);
  const turnRouting = resolveTurnPath(
    normalizedRouting,
    input.playerMessage,
    input.snapshot,
    input.loreEntityIds,
  );

  const diagnostics: EvidenceFirstPipelineDiagnostics = {
    pipelineVersion: 'evidence_first_v1',
    turnPath: turnRouting.path,
    riskSignals: {
      hasKnowledgeWhCue: turnRouting.factualRiskSignals.includes('knowledge_wh_cue'),
      hasRecallCue: turnRouting.factualRiskSignals.includes('recall_cue'),
      hasLoreEntityMention: turnRouting.factualRiskSignals.includes('lore_entity_mention'),
      hasFactualClausePattern: turnRouting.factualRiskSignals.includes('factual_clause_pattern'),
      hasRouteConflict: turnRouting.factualRiskSignals.includes('route_conflict'),
    },
    pathDecision: {
      semanticSocialProtected: turnRouting.semanticSocialProtected === true,
      heuristicFallbackUsed: turnRouting.heuristicFallbackUsed === true,
      heuristicFallbackReason: turnRouting.heuristicFallbackReason,
      suppressedRiskSignals: turnRouting.suppressedRiskSignals,
    },
    deliveryLanguageContextApplied: false,
    deterministicFallbackUsed: false,
  };

  const noveltyState = computeNoveltyState({
    history: input.history,
    turnIndexWithNpc: input.turnIndexWithNpc,
    routingIntent: normalizedRouting.intent,
    topicCoverage: input.topicCoverageContext,
    playerMessage: input.playerMessage,
    normalizeForEchoCheck: (text: string) => String(text ?? '').trim().toLowerCase(),
    maxNovelty: 0.34,
  });

  const relevantEvidenceItems = input.retrieve.enrichedEvidencePack.items.filter((item) => isEvidenceItemRelevantForTurn(item, {
    queryType,
    routeIntent: normalizedRouting.intent,
    selfEntityId: input.snapshot.selfEntityId,
    npcId: input.npcId,
  }));
  const hasDirectAnswerEvidence = hasDirectAnswerableStateEvidence(
    relevantEvidenceItems,
    normalizedRouting.interpretation ?? input.playerMessage,
  );

  const initiativePolicy = resolveInitiativePolicy({
    mode: input.snapshot.mode,
    routingIntent: normalizedRouting.intent,
    queryType,
    interpretation: normalizedRouting.interpretation,
    playerMessage: input.playerMessage,
    playerHasQuestion: hasLikelyQuestionForm(input.playerMessage),
    turnIndexWithNpc: input.turnIndexWithNpc,
    noveltyState,
    beatContract: input.beatContract,
    hasEvidence: relevantEvidenceItems.length > 0,
    hasDirectAnswerEvidence,
    retrievalConfidence: computeEvidenceBackedRetrievalConfidence({
      queryType,
      routeIntent: normalizedRouting.intent,
      retrievalMatches: input.retrieve.retrieval.matches,
      evidenceItems: relevantEvidenceItems,
    }),
    isFirstMeeting: input.isFirstMeeting === true,
  });

  if (turnRouting.path === 'social_fast') {
    const socialPlan: TurnPlan = {
      schemaVersion: 1,
      pipelineVersion: 'evidence_first_v1',
      mode: input.snapshot.mode,
      routeIntent: normalizedRouting.intent,
      queryType,
      speechAct: 'chat',
      claims: [],
      socialActs: [],
      questionBack: null,
      memoryWrites: extractExplicitPlayerFacts(input.playerMessage),
      initiativeDecision: initiativePolicy?.decision ?? {},
      abstention: null,
    };

    const socialTurn = buildDeterministicSocialReply(
      input.playerMessage,
      input.snapshot,
      input.adaptationContext ?? null,
      Array.isArray(input.recentNpcReplies) ? input.recentNpcReplies : [],
    );
    if (!checkSocialResponseForFactualLeakage(socialTurn.utterance)) {
      return {
        queryType,
        turnRouting,
        initiativePolicy,
        plan: socialPlan,
        validatedPlan: { acceptable: true, plan: socialPlan, errors: [], droppedClaims: [] },
        diagnostics,
      };
    }
  }

  const { plan, plannerMeta } = createEvidenceFirstTurnPlanV2({
    npcId: input.snapshot.npcId,
    npcName: input.snapshot.npcName,
    playerMessage: input.playerMessage,
    recentNpcReplies: input.recentNpcReplies,
    queryType,
    routing: normalizedRouting,
    evidencePack: input.retrieve.enrichedEvidencePack,
    selfEntityId: input.snapshot.selfEntityId,
    mode: input.snapshot.mode,
    beatContract: input.beatContract,
    initiativePolicy,
  });

  diagnostics.subjectSelection = {
    primaryReferent: normalizedRouting.interpretation?.primaryReferent,
    relationPolicy: normalizedRouting.interpretation?.relationPolicy,
    selectedEvidence: plannerMeta.selectedEvidence.slice(0, 4).map((item) => ({
      evidenceId: item.evidenceId,
      sourceId: item.sourceId,
      relationDistance: item.relationDistance,
      relationReason: item.relationReason,
      subjectId: item.subjectId,
      subjectKind: item.subjectKind,
      score: Number(item.confidence.toFixed(4)),
    })),
  };

  const validated = validateAndRepairTurnPlanV2({
    plan,
    evidencePack: input.retrieve.enrichedEvidencePack,
    snapshot: input.snapshot,
  });

  diagnostics.planOutcome = {
    speechAct: validated.plan.speechAct,
    claimCount: validated.plan.claims.length,
    claimModes: {
      grounded: validated.plan.claims.filter((claim) => claim.mode === 'grounded').length,
      inferred: validated.plan.claims.filter((claim) => claim.mode === 'inferred').length,
      rumor: validated.plan.claims.filter((claim) => claim.mode === 'rumor').length,
    },
    acceptable: validated.acceptable,
    errors: validated.errors,
  };
  diagnostics.subjectSelection.selectedClaims = validated.plan.claims.slice(0, 4).map((claim) => ({
    claimId: claim.claimId,
    relationDistance: claim.relationDistance,
    relationReason: claim.relationReason,
    subjectId: claim.relationSubjectId,
    subjectKind: claim.relationSubjectKind,
  }));

  return {
    queryType,
    turnRouting: {
      ...turnRouting,
      path: 'grounded',
    },
    initiativePolicy,
    plan,
    validatedPlan: validated,
    diagnostics,
  };
}
