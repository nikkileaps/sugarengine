/**
 * @fileoverview Canonical turn-pipeline contracts for the evidence-first turn path.
 *
 * Implements: ADR-SA-025, ADR-SA-026, ADR-SA-027, ADR-SA-028, ADR-SA-031
 *
 * These types are consumed by:
 * - turn-path-routing (social_fast vs grounded decision)
 * - retrieval governance (evidence-pack construction)
 * - turn planning (claim planning with epistemic metadata)
 * - semantic verification (post-realization verification)
 * - memory provenance (filtered memory writes)
 * - language adaptation (post-plan wording adjustment)
 */

// ---------------------------------------------------------------------------
// Epistemic metadata (ADR-SA-026)
// ---------------------------------------------------------------------------

export type KnowledgeClass =
  | 'self_profile'
  | 'routine_state'
  | 'witnessed_event'
  | 'public_fact'
  | 'rumor'
  | 'private_other'
  | 'faction_internal'
  | 'player_assertion'
  | 'beat_fact';

export type AccessPolicy = 'assert' | 'hedged' | 'recall_only' | 'forbidden';
export type DisclosurePolicy = 'volunteer_ok' | 'answer_only' | 'never';

// ---------------------------------------------------------------------------
// Multi-strength claims (ADR-SA-027)
// ---------------------------------------------------------------------------

export type ClaimMode = 'grounded' | 'inferred' | 'rumor';
export type RequiredHedge = 'none' | 'soft' | 'strong';

export interface PlannedClaim {
  claimId: string;
  mode: ClaimMode;
  subject: string;
  ownerType: 'npc' | 'player' | 'world' | 'beat' | 'unknown';
  text: string;
  evidenceIds: string[];
  confidence: number;
  requiredHedge: RequiredHedge;
  maxSpecificity: 'exact' | 'bounded' | 'coarse';
}

export interface PlannedSocialAct {
  actId: string;
  text: string;
  actType: 'greeting' | 'acknowledgement' | 'empathy' | 'politeness' | 'clarifying_question' | 'topic_closure';
}

// ---------------------------------------------------------------------------
// Turn routing (ADR-SA-025)
// ---------------------------------------------------------------------------

export type TurnPath = 'social_fast' | 'grounded';

export interface TurnRiskSignals {
  hasKnowledgeWhCue: boolean;
  hasRecallCue: boolean;
  hasLoreEntityMention: boolean;
  hasFactualClausePattern: boolean;
  hasRouteConflict: boolean;
}

export interface TurnRoutingDecision {
  routeIntent: string;
  path: TurnPath;
  socialFastPathEligible: boolean;
  routeConfidence: number;
  factualRiskSignals: string[];
}

// ---------------------------------------------------------------------------
// Query interpretation (ADR-SA-032)
// ---------------------------------------------------------------------------

export type QueryLane = 'social' | 'knowledge' | 'memory';
export type QueryTarget = 'self' | 'world' | 'other' | 'mixed' | 'unknown';
export type QueryFacet =
  | 'identity'
  | 'occupation'
  | 'current_activity'
  | 'location'
  | 'background'
  | 'preference'
  | 'relationship'
  | 'general_lore'
  | 'unknown';
export type QueryTimeframe = 'current' | 'habitual' | 'past' | 'future' | 'unknown';

export interface ResolvedReferent {
  kind: 'npc' | 'entity' | 'location' | 'faction' | 'topic';
  text: string;
  id?: string;
  confidence: number;
}

export type ReferentSourceRole = 'player' | 'npc' | 'scene' | 'lore' | 'memory' | 'unknown';

export interface ReferentPreviewCandidate {
  kind: ResolvedReferent['kind'];
  text: string;
  id?: string;
  confidence?: number;
  salience?: number;
  lastSeenAt?: number;
  topic?: string;
  sourceRole?: ReferentSourceRole;
}

export interface DiscourseMarkers {
  repair: boolean;
  filler: boolean;
  contrast: boolean;
  emphasis: boolean;
}

export interface EvidencePreview {
  selfSummary: {
    entityId?: string;
    identityTokens: string[];
    occupationTokens: string[];
    backgroundTokens: string[];
    preferenceTokens: string[];
  };
  sceneSummary: {
    regionName?: string;
    regionPath?: string;
    currentActivity?: string;
    currentGoal?: string;
  };
  topicSummary: {
    activeTopic?: string;
    recentReferents: ReferentPreviewCandidate[];
  };
  scopeHints: {
    loreScopes: string[];
    selfLoreScopes: string[];
    relatedLoreScopes: string[];
    entityIds: string[];
    locationIds: string[];
    tagHints: string[];
  };
}

export interface QueryInterpretationCandidate {
  lane: QueryLane;
  target: QueryTarget;
  facet: QueryFacet;
  timeframe: QueryTimeframe;
  score: number;
}

export interface QueryInterpretation {
  schemaVersion: 1;
  lane: QueryLane;
  target: QueryTarget;
  facet: QueryFacet;
  timeframe: QueryTimeframe;
  focusText: string;
  normalizedText: string;
  referents: ResolvedReferent[];
  discourse: DiscourseMarkers;
  candidateScores: QueryInterpretationCandidate[];
  confidence: number;
  margin: number;
  ambiguous: boolean;
}

// ---------------------------------------------------------------------------
// NPC state snapshot (ADR-SA-025)
// ---------------------------------------------------------------------------

export interface NpcStateSnapshot {
  npcId: string;
  npcName: string;
  selfEntityId?: string;
  mode: 'character' | 'narrative' | 'hybrid';
  locationId?: string;
  currentActivity?: string;
  currentGoal?: string;
  mood?: string;
  activeBeatId?: string;
  relationshipState?: Record<string, number>;
  languageAdaptation?: LanguageAdaptationContext | null;
}

// ---------------------------------------------------------------------------
// Evidence pack (ADR-SA-025, ADR-SA-026, ADR-SA-029)
// ---------------------------------------------------------------------------

export interface EpistemicEvidenceItem {
  evidenceId: string;
  sourceId: string;
  sourceType: string;
  ownerType: 'npc' | 'player' | 'world' | 'beat' | 'unknown';
  knowledgeClass: KnowledgeClass;
  accessPolicy: AccessPolicy;
  disclosurePolicy: DisclosurePolicy;
  text: string;
  factId?: string;
  chunkId?: string;
  verificationStatus: string;
  provenance?: Record<string, unknown>;
  entityIds: string[];
  anchorTerms?: string[];
  selfAttributed: boolean;
  confidence: number;
  lexicalScore?: number;
  vectorScore?: number;
  rerankScore?: number;
}

// ---------------------------------------------------------------------------
// Turn plan (ADR-SA-025, ADR-SA-027)
// ---------------------------------------------------------------------------

export type PlanSpeechAct = 'answer' | 'ask' | 'clarify' | 'recall' | 'chat' | 'close' | 'uncertain';

export interface TurnPlan {
  schemaVersion: 1;
  pipelineVersion: string;
  mode: 'character' | 'narrative' | 'hybrid';
  routeIntent: string;
  queryType: string;
  speechAct: PlanSpeechAct;
  claims: PlannedClaim[];
  socialActs: PlannedSocialAct[];
  questionBack: string | null;
  memoryWrites: MemoryWrite[];
  initiativeDecision: Record<string, unknown>;
  abstention: { reason: string; confidence: number } | null;
}

export interface ValidatedTurnPlan {
  acceptable: boolean;
  plan: TurnPlan;
  errors: string[];
  droppedClaims: PlannedClaim[];
}

// ---------------------------------------------------------------------------
// Semantic verification (ADR-SA-028)
// ---------------------------------------------------------------------------

export type SemanticLane = 'social' | 'knowledge' | 'meta';
export type PropositionType = 'fact' | 'question' | 'greeting' | 'affect' | 'directive' | 'uncertain';
export type HedgeStrength = 'none' | 'soft' | 'strong';

export interface SemanticUnit {
  unitId: string;
  clauseText: string;
  lane: SemanticLane;
  propositionType: PropositionType;
  normalizedSubject?: string;
  normalizedPredicate?: string;
  normalizedObject?: string;
  hedgeStrength: HedgeStrength;
  namedEntities: string[];
}

export interface SemanticVerificationResult {
  ok: boolean;
  errors: string[];
  unsupportedUnits: SemanticUnit[];
  overassertedUnits: SemanticUnit[];
}

// ---------------------------------------------------------------------------
// Memory provenance (ADR-SA-030)
// ---------------------------------------------------------------------------

export type MemoryRecordType =
  | 'player_fact'
  | 'npc_commitment'
  | 'shared_event'
  | 'topic_marker'
  | 'relationship_signal';

export type MemorySource =
  | 'player_explicit'
  | 'npc_verified_turn'
  | 'engine_event'
  | 'beat_progress'
  | 'legacy_import';

export interface MemoryWrite {
  type: MemoryRecordType;
  ownerType: 'npc' | 'player' | 'world' | 'beat' | 'unknown';
  text: string;
  source: MemorySource;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Language adaptation (ADR-SA-031)
// ---------------------------------------------------------------------------

export interface LanguageAdaptationContext {
  schemaVersion: 1;
  source: 'sugaragent' | 'sugarlang' | 'engine';
  targetLanguage: string;
  learnerLevel?: string;
  cefrBand?: string;
  allowedRegisters?: string[];
  bannedRegisters?: string[];
  maxSentenceLength?: number;
  maxClauseDepth?: number;
  codeSwitchPolicy?: 'none' | 'gloss_only' | 'learner_choice';
  glossBudget?: number;
  focusGrammar?: string[];
  focusVocabulary?: string[];
}

// ---------------------------------------------------------------------------
// Reply part kinds (ADR-SA-027 extended)
// ---------------------------------------------------------------------------

export type ReplyPartKind = 'social' | 'grounded' | 'inferred' | 'rumor' | 'uncertain' | 'close';

export interface ExtendedReplyPart {
  kind: ReplyPartKind;
  text: string;
  support?: string[];
}

// ---------------------------------------------------------------------------
// Retrieval run (ADR-SA-029)
// ---------------------------------------------------------------------------

export interface RetrievalRun {
  strategy: 'full' | 'lexical_only' | 'degraded';
  attempted: boolean;
  correctiveAttempted: boolean;
  qualityReason: string;
  qualityPass: boolean;
}

// ---------------------------------------------------------------------------
// Pipeline diagnostics
// ---------------------------------------------------------------------------

export interface EvidenceFirstPipelineDiagnostics {
  pipelineVersion: 'evidence_first_v1';
  turnPath: TurnPath;
  riskSignals: TurnRiskSignals;
  retrievalRun?: RetrievalRun;
  planOutcome?: {
    speechAct: PlanSpeechAct;
    claimCount: number;
    claimModes: Record<ClaimMode, number>;
    acceptable: boolean;
    errors: string[];
  };
  semanticVerification?: SemanticVerificationResult;
  adaptationApplied: boolean;
  deterministicFallbackUsed: boolean;
}
