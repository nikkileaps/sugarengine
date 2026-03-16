/**
 * @fileoverview Evidence-first turn pipeline orchestration.
 *
 * Implements: ADR-SA-025 (canonical live path)
 *
 * Pipeline: route → retrieve → build evidence pack → resolve initiative →
 * plan → validate plan → deterministic baseline realization → semantic verify → persist
 *
 * Final player-facing multilingual delivery is handled by the runtime
 * plan-realization layer, which realizes validated claims directly in the
 * target language when a delivery-language context is present.
 */

import type { SugarAgentBeatEvidence, SugarAgentTurnOutput } from '../../contracts/turn';
import type { QueryType, RoutingIntent, RoutingResult } from './routing';
import { routeIntentToQueryType, isKnowledgeSeekingQueryType, routeIntentUsesLore } from './routing';
import { resolveTurnPath, checkSocialResponseForFactualLeakage } from './turn-path-routing';
import { enrichEvidenceWithEpistemics, isEvidenceAvailableForPlanning } from './epistemology';
import {
  buildPlannedClaim,
  chooseClaimMode,
  requiredHedgeForMode,
  maxSpecificityForMode,
  deterministicHedgePrefix,
} from './claim-planning';
import { tokenizeForPlan } from './retrieval-text';
import {
  extractFacetQueryTokens,
  expandFacetQueryTokenVariants,
  extractKnowledgeFocusText,
} from './knowledge-query';
import {
  extractDeclaredIdentityName,
  isLikelyGreetingOnlyMessage,
} from './turn-quality';
import { detectSocialAcknowledgement, isLikelySmallTalkQuery } from './social-cues';
import {
  localizeGroundedUncertaintyReply,
  localizeSimpleSocialReply,
} from './language-stock';
import { verifyRealizationAgainstPlan } from './semantic/verification';
import { extractExplicitPlayerFacts, filterMemoryWrites, extractNpcCommitments } from './memory-provenance';
import type {
  TurnPath,
  TurnPlan,
  ValidatedTurnPlan,
  NpcStateSnapshot,
  EpistemicEvidenceItem,
  PlannedClaim,
  LanguageAdaptationContext,
  EvidenceFirstPipelineDiagnostics,
  MemoryWrite,
  TurnRoutingDecision,
  TurnRiskSignals,
  QueryInterpretation,
  SemanticVerificationResult,
} from './turn-contracts';

interface BuildNpcStateSnapshotInput {
  npcId?: unknown;
  npcName?: unknown;
  selfEntityId?: unknown;
  mode?: unknown;
  locationId?: unknown;
  currentActivity?: unknown;
  currentGoal?: unknown;
  activeBeatId?: unknown;
}

type EvidencePackItem = Omit<EpistemicEvidenceItem, 'knowledgeClass' | 'accessPolicy' | 'disclosurePolicy'> & Partial<
  Pick<EpistemicEvidenceItem, 'knowledgeClass' | 'accessPolicy' | 'disclosurePolicy'>
>;

interface EvidencePackLike {
  items: EvidencePackItem[];
  evidenceIdToItem?: Map<string, EvidencePackItem>;
}

interface EnrichedEvidencePack extends EvidencePackLike {
  items: EpistemicEvidenceItem[];
  evidenceIdToItem?: Map<string, EpistemicEvidenceItem>;
}

function isEpistemicEvidenceItem(item: EvidencePackItem): item is EpistemicEvidenceItem {
  return Boolean(item?.knowledgeClass && item?.accessPolicy && item?.disclosurePolicy);
}

interface EvidenceItemRelevanceInput {
  routeIntent?: RoutingIntent | string;
  queryType?: QueryType | string;
  selfEntityId?: string;
  npcId?: string;
}

interface PipelineRoutingInput extends Partial<RoutingResult> {
  intent: RoutingIntent;
  interpretation?: QueryInterpretation;
}

type InitiativeActionLike = 'npc_initiate' | 'player_respond' | 'clarify' | 'abstain' | 'close';

interface InitiativePolicyLike {
  decision?: {
    action?: InitiativeActionLike | string;
    [key: string]: unknown;
  };
}

interface EvidenceFirstPlannerInput {
  npcId: string;
  npcName: string;
  playerMessage: string;
  queryType: QueryType | string;
  routing?: PipelineRoutingInput | null;
  evidencePack: EvidencePackLike;
  selfEntityId?: string;
  mode?: NpcStateSnapshot['mode'];
  beatContract?: unknown;
  initiativePolicy?: InitiativePolicyLike | null;
}

interface PlannerMeta {
  selectedEvidence: EpistemicEvidenceItem[];
  enrichedPack: EnrichedEvidencePack;
}

interface ValidatePlanInput {
  plan: TurnPlan;
  evidencePack?: EnrichedEvidencePack | null;
  snapshot?: NpcStateSnapshot | null;
}

interface ValidatedTurnPlanResult extends ValidatedTurnPlan {
  droppedClaims: PlannedClaim[];
}

interface RunEvidenceFirstPipelineInput {
  playerMessage: string;
  routing: PipelineRoutingInput;
  snapshot: NpcStateSnapshot;
  evidencePack: EvidencePackLike;
  initiativePolicy?: InitiativePolicyLike | null;
  beatContract?: unknown;
  adaptationContext?: LanguageAdaptationContext | null;
  loreEntityIds?: string[];
}

interface EvidenceFirstPipelineResult {
  output: SugarAgentTurnOutput;
  plan: TurnPlan;
  validatedPlan: ValidatedTurnPlanResult;
  verification: SemanticVerificationResult;
  memoryWrites: MemoryWrite[];
  diagnostics: EvidenceFirstPipelineDiagnostics;
  turnRouting: TurnRoutingDecision;
}

const EMPTY_BEAT_EVIDENCE: SugarAgentBeatEvidence = {
  coveredFacts: [],
  uncoveredFacts: [],
  completionSignal: 'none',
  confidence: 0,
};

// ---------------------------------------------------------------------------
// NPC State Snapshot builder
// ---------------------------------------------------------------------------

export function buildNpcStateSnapshot(input: BuildNpcStateSnapshotInput): NpcStateSnapshot {
  const npcId = typeof input.npcId === 'string' ? input.npcId : '';
  const npcName = typeof input.npcName === 'string' ? input.npcName : '';
  const selfEntityId = typeof input.selfEntityId === 'string' ? input.selfEntityId : undefined;
  const mode = input.mode === 'narrative' || input.mode === 'hybrid' ? input.mode : 'character';

  return {
    npcId,
    npcName,
    selfEntityId,
    mode,
    locationId: typeof input.locationId === 'string' ? input.locationId : undefined,
    currentActivity: typeof input.currentActivity === 'string' ? input.currentActivity : undefined,
    currentGoal: typeof input.currentGoal === 'string' ? input.currentGoal : undefined,
    activeBeatId: typeof input.activeBeatId === 'string' ? input.activeBeatId : undefined,
    deliveryLanguageContext: null,
  };
}

// ---------------------------------------------------------------------------
// Evidence enrichment
// ---------------------------------------------------------------------------

export function enrichEvidencePackWithEpistemics(
  evidencePack: EvidencePackLike,
  beatContract?: unknown,
): EnrichedEvidencePack {
  if (!evidencePack || !Array.isArray(evidencePack.items)) {
    return {
      items: [],
      evidenceIdToItem: new Map<string, EpistemicEvidenceItem>(),
    };
  }

  const enrichedItems: EpistemicEvidenceItem[] = evidencePack.items.map((item) =>
    isEpistemicEvidenceItem(item)
      ? item
      : enrichEvidenceWithEpistemics(item, beatContract as { urgency?: string } | null | undefined),
  );

  const enrichedIdToItem = new Map<string, EpistemicEvidenceItem>();
  for (const item of enrichedItems) {
    enrichedIdToItem.set(item.evidenceId, item);
  }

  return {
    ...evidencePack,
    items: enrichedItems,
    evidenceIdToItem: enrichedIdToItem,
  };
}

function normalizeClaimText(text: unknown): string {
  return String(text ?? '').trim().replace(/[.!?]+$/, '');
}

function evidenceTargetsCurrentNpc(
  item: EpistemicEvidenceItem | null | undefined,
  selfEntityId: string | undefined,
  npcId: string | undefined,
): boolean {
  const entityIds = Array.isArray(item?.entityIds)
    ? item.entityIds.filter((entry) => typeof entry === 'string').map((entry) => entry.toLowerCase())
    : [];
  const normalizedSelfEntityId = typeof selfEntityId === 'string' ? selfEntityId.trim().toLowerCase() : '';
  const normalizedNpcId = typeof npcId === 'string' ? npcId.trim().toLowerCase() : '';
  return Boolean(
    (normalizedSelfEntityId && entityIds.includes(normalizedSelfEntityId))
    || (normalizedNpcId && entityIds.includes(normalizedNpcId))
    || item?.selfAttributed === true,
  );
}

export function isEvidenceItemRelevantForTurn(
  item: EpistemicEvidenceItem | null | undefined,
  input: EvidenceItemRelevanceInput,
): boolean {
  if (!item) return false;
  const routeIntent = input?.routeIntent;
  const queryType = input?.queryType;
  const targetsCurrentNpc = evidenceTargetsCurrentNpc(item, input?.selfEntityId, input?.npcId);

  if (routeIntent === 'session_recall') {
    return item.ownerType === 'player';
  }

  if (routeIntent === 'identity_self' || queryType === 'self_query') {
    if (item.sourceType === 'self_profile') return true;
    if (item.ownerType === 'npc') return true;
    if (item.ownerType === 'beat') return targetsCurrentNpc;
    return false;
  }

  if (routeIntent === 'lore_world' || queryType === 'world_query') {
    return item.ownerType === 'world' || item.ownerType === 'beat' || item.ownerType === 'unknown';
  }

  if (routeIntent === 'lore_other' || queryType === 'other_query') {
    if (item.ownerType === 'player') return false;
    if (item.sourceType === 'self_profile') return false;
    if (targetsCurrentNpc) return false;
    return item.ownerType === 'world' || item.ownerType === 'beat' || item.ownerType === 'unknown' || item.ownerType === 'npc';
  }

  if (routeIntent === 'mixed_knowledge' || queryType === 'mixed_query') {
    return item.ownerType !== 'player';
  }

  return true;
}

function capitalizeName(value: unknown): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function escapeRegex(value: unknown): string {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSelfProfileParts(text: unknown): { name?: string; persona?: string } {
  const normalized = normalizeClaimText(text);
  if (!normalized) return {};
  const nameMatch = normalized.match(/\bNPC name:\s*([^.;]+)/i);
  const personaMatch = normalized.match(/\bPersona:\s*([^.;]+)/i);
  return {
    name: normalizeClaimText(nameMatch?.[1] ?? ''),
    persona: normalizeClaimText(personaMatch?.[1] ?? ''),
  };
}

function shouldAnswerWithNpcName(playerMessage: unknown): boolean {
  return /\b(what(?:'s| is) your name|your name|who are you)\b/i.test(String(playerMessage ?? ''));
}

function formatSelfProfileClaimText(
  item: EpistemicEvidenceItem | null | undefined,
  snapshot: Partial<NpcStateSnapshot> | null | undefined,
  playerMessage: unknown,
): string {
  const parts = extractSelfProfileParts(item?.text);
  const npcName = normalizeClaimText(parts.name || snapshot?.npcName || '');
  const persona = normalizeClaimText(parts.persona || '');

  if (shouldAnswerWithNpcName(playerMessage) && npcName) {
    return `my name is ${npcName}`;
  }
  if (npcName && persona) {
    const personaText = /^(i am|i'm)\b/i.test(persona) ? persona : `I am ${persona}`;
    return `${personaText}. My name is ${npcName}`;
  }
  if (persona) {
    return /^(i am|i'm)\b/i.test(persona) ? persona : `I am ${persona}`;
  }
  if (npcName) {
    return `my name is ${npcName}`;
  }
  return normalizeClaimText(item?.text);
}

function formatNpcSelfKnowledgeClaimText(
  item: EpistemicEvidenceItem | null | undefined,
  snapshot: Partial<NpcStateSnapshot> | null | undefined,
): string {
  const fullText = normalizeClaimText(item?.text);
  if (!fullText) return '';
  const firstSentence = normalizeClaimText(
    String(fullText).split(/(?<=[.!?])\s+/)[0],
  );
  const npcName = normalizeClaimText(snapshot?.npcName || '');
  if (!npcName) return firstSentence || fullText;

  const replacements = [
    {
      pattern: new RegExp(`^${escapeRegex(npcName)}\\s+owns\\b`, 'i'),
      replacement: 'I own',
    },
    {
      pattern: new RegExp(`^${escapeRegex(npcName)}\\s+runs\\b`, 'i'),
      replacement: 'I run',
    },
    {
      pattern: new RegExp(`^${escapeRegex(npcName)}\\s+works\\b`, 'i'),
      replacement: 'I work',
    },
    {
      pattern: new RegExp(`^${escapeRegex(npcName)}\\s+is\\b`, 'i'),
      replacement: 'I am',
    },
  ];

  for (const { pattern, replacement } of replacements) {
    if (pattern.test(firstSentence)) {
      return firstSentence.replace(pattern, replacement);
    }
  }

  return firstSentence || fullText;
}

function buildDeterministicSocialReply(
  playerMessage: string,
  snapshot: NpcStateSnapshot,
  adaptationContext?: LanguageAdaptationContext | null,
): SugarAgentTurnOutput {
  const message = String(playerMessage ?? '').trim();
  const npcName = normalizeClaimText(snapshot?.npcName || '') || 'friend';
  const targetLanguage = adaptationContext?.targetLanguage;
  const declaredName = extractDeclaredIdentityName(message, targetLanguage);
  const safeDeclaredName = declaredName ? capitalizeName(declaredName) : '';
  const asksIdentity = shouldAnswerWithNpcName(message);
  const frustration = /\b(i was pretty clear|i was clear|that was clear|pretty clear|be serious|come on)\b/i.test(message);
  const acknowledgement = detectSocialAcknowledgement(message, targetLanguage);
  const smallTalkQuery = isLikelySmallTalkQuery(message, targetLanguage);

  if (frustration) {
    return {
      utterance: `Fair enough. I'm ${npcName}. Ask me directly what you want to know.`,
      emotion: 'steady',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  if (safeDeclaredName && asksIdentity) {
    return {
      utterance: localizeSimpleSocialReply('nice_to_meet_you', targetLanguage, {
        npcName,
        playerName: safeDeclaredName,
      }),
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  if (asksIdentity) {
    return {
      utterance: localizeSimpleSocialReply('hi_im_npc', targetLanguage, { npcName }),
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  if (safeDeclaredName) {
    return {
      utterance: localizeSimpleSocialReply('nice_to_meet_you', targetLanguage, {
        npcName,
        playerName: safeDeclaredName,
      }),
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  if (isLikelyGreetingOnlyMessage(message, targetLanguage)) {
    return {
      utterance: localizeSimpleSocialReply('hi_im_npc', targetLanguage, { npcName }),
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  if (smallTalkQuery) {
    return {
      utterance: localizeSimpleSocialReply('status_good_and_you', targetLanguage),
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  if (acknowledgement === 'gratitude') {
    return {
      utterance: localizeSimpleSocialReply('any_time', targetLanguage),
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  if (acknowledgement === 'shared_preference') {
    return {
      utterance: /\bcheese\b/i.test(message)
        ? localizeSimpleSocialReply('shared_preference_cheese', targetLanguage)
        : localizeSimpleSocialReply('shared_preference', targetLanguage),
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  if (acknowledgement) {
    return {
      utterance: localizeSimpleSocialReply('agreement', targetLanguage),
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }
  return {
    utterance: localizeSimpleSocialReply('listening', targetLanguage),
    emotion: 'neutral',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
    beatEvidence: EMPTY_BEAT_EVIDENCE,
  };
}

function tokenizeEvidenceText(text: unknown): Set<string> {
  return new Set(
    normalizeClaimText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function countTokenOverlap(a: Set<string>, b: Set<string>): number {
  if (!(a instanceof Set) || !(b instanceof Set) || a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap;
}

function haveSharedEntityIds(
  a: EpistemicEvidenceItem | null | undefined,
  b: EpistemicEvidenceItem | null | undefined,
): boolean {
  const aIds = Array.isArray(a?.entityIds) ? a.entityIds.filter((entry) => typeof entry === 'string') : [];
  const bIds = Array.isArray(b?.entityIds) ? b.entityIds.filter((entry) => typeof entry === 'string') : [];
  if (aIds.length === 0 || bIds.length === 0) return false;
  const bIdSet = new Set(bIds.map((entry) => entry.toLowerCase()));
  return aIds.some((entry) => bIdSet.has(entry.toLowerCase()));
}

function areEvidenceItemsCompatible(
  a: EpistemicEvidenceItem | null | undefined,
  b: EpistemicEvidenceItem | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.evidenceId === b.evidenceId) return false;
  if (a.ownerType !== b.ownerType && a.ownerType !== 'world' && b.ownerType !== 'world') {
    return false;
  }
  if (haveSharedEntityIds(a, b)) return true;
  const overlap = countTokenOverlap(tokenizeEvidenceText(a.text), tokenizeEvidenceText(b.text));
  return overlap >= 2;
}

function buildEvidenceRelevanceText(item: EpistemicEvidenceItem | null | undefined): string {
  const anchorTerms = Array.isArray(item?.anchorTerms)
    ? item.anchorTerms
        .filter((entry) => typeof entry === 'string')
        .filter((entry) => !/[.#/]/.test(entry))
    : [];
  return [
    normalizeClaimText(item?.text),
    ...anchorTerms,
  ].join(' ');
}

function assessKnowledgeEvidenceRelevance(
  item: EpistemicEvidenceItem,
  playerMessageOrInterpretation: string | QueryInterpretation,
): { matchedTokens: number; coverage: number; claimable: boolean } {
  const queryTokens = extractFacetQueryTokens(playerMessageOrInterpretation);
  const interpretationFacet = (
    playerMessageOrInterpretation
    && typeof playerMessageOrInterpretation === 'object'
    && typeof playerMessageOrInterpretation.facet === 'string'
  )
    ? playerMessageOrInterpretation.facet
    : null;
  if (queryTokens.length === 0) {
    return {
      matchedTokens: 0,
      coverage: 1,
      claimable: true,
    };
  }
  const evidenceTokens = new Set(tokenizeForPlan(buildEvidenceRelevanceText(item)));
  let matchedTokens = 0;
  for (const token of queryTokens) {
    const variants = expandFacetQueryTokenVariants(token);
    if ([...variants].some((variant) => evidenceTokens.has(variant))) {
      matchedTokens += 1;
    }
  }
  const coverage = matchedTokens / queryTokens.length;
  const broadLoreQuestion = (
    (interpretationFacet === 'general_lore' || interpretationFacet === 'location')
    && queryTokens.length <= 2
    && matchedTokens >= 1
  );
  const claimable = queryTokens.length <= 1
    ? matchedTokens > 0
    : coverage > 0.5 || matchedTokens >= 2 || broadLoreQuestion;
  return {
    matchedTokens,
    coverage: Number(coverage.toFixed(4)),
    claimable,
  };
}

export function hasDirectAnswerableStateEvidence(
  items: EpistemicEvidenceItem[],
  playerMessageOrInterpretation: string | QueryInterpretation,
): boolean {
  return (Array.isArray(items) ? items : []).some((item) => (
    item?.sourceType === 'routine_state'
    && assessKnowledgeEvidenceRelevance(item, playerMessageOrInterpretation).claimable
  ));
}

function selectClaimableKnowledgeEvidence(
  items: EpistemicEvidenceItem[],
  playerMessageOrInterpretation: string | QueryInterpretation,
): EpistemicEvidenceItem[] {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const relevance = assessKnowledgeEvidenceRelevance(item, playerMessageOrInterpretation);
      return {
        item,
        relevance,
      };
    })
    .sort((a, b) => (
      b.relevance.coverage - a.relevance.coverage
      || b.relevance.matchedTokens - a.relevance.matchedTokens
      || (b.item?.confidence ?? 0) - (a.item?.confidence ?? 0)
    ))
    .filter((entry) => entry.relevance.claimable)
    .map((entry) => entry.item);
}

function pickPrimaryEvidenceForMode(
  evidenceItems: EpistemicEvidenceItem[],
  mode: PlannedClaim['mode'],
): EpistemicEvidenceItem | null {
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) return null;
  if (mode === 'rumor') {
    return evidenceItems.find((item) => item?.knowledgeClass === 'rumor') ?? evidenceItems[0] ?? null;
  }
  if (mode === 'inferred') {
    return evidenceItems.find((item) => item?.accessPolicy === 'assert') ?? evidenceItems[0] ?? null;
  }
  return evidenceItems[0] ?? null;
}

function buildCorroboratedClaims(
  selected: EpistemicEvidenceItem[],
  subjectResolver: (item: EpistemicEvidenceItem) => string,
  startingIndex = 0,
  snapshot: Partial<NpcStateSnapshot> = {},
  playerMessage = '',
): PlannedClaim[] {
  const claims: PlannedClaim[] = [];
  const seenEvidenceKeys = new Set();
  let claimIndex = startingIndex;

  for (let leftIndex = 0; leftIndex < selected.length; leftIndex++) {
    const left = selected[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < selected.length; rightIndex++) {
      const right = selected[rightIndex];
      if (!right) continue;
      if (!areEvidenceItemsCompatible(left, right)) continue;
      const evidenceItems = [left, right];
      const claimMode = chooseClaimMode(evidenceItems);
      if (claimMode === 'uncertain' || claimMode === 'grounded') continue;

      const evidenceKey = evidenceItems
        .map((item) => item.evidenceId)
        .sort()
        .join('|');
      if (seenEvidenceKeys.has(evidenceKey)) continue;

      const primary = pickPrimaryEvidenceForMode(evidenceItems, claimMode);
      if (!primary) continue;
      const claimText = primary?.sourceType === 'self_profile'
        ? formatSelfProfileClaimText(primary, snapshot, playerMessage)
        : normalizeClaimText(primary?.text);
      if (!claimText) continue;

      claimIndex++;
      const claim = buildPlannedClaim({
        claimId: `c_${claimIndex}`,
        subject: subjectResolver(primary),
        ownerType: primary?.ownerType ?? 'unknown',
        text: claimText,
        evidenceIds: evidenceItems.map((item) => item.evidenceId),
        evidenceItems,
      });
      if (!claim) continue;

      claims.push(claim);
      seenEvidenceKeys.add(evidenceKey);
    }
  }

  return claims;
}

// ---------------------------------------------------------------------------
// Evidence-first turn plan creation (Phase 1 + Phase 4 multi-strength)
// ---------------------------------------------------------------------------

export function createEvidenceFirstTurnPlanV2(
  input: EvidenceFirstPlannerInput,
): { plan: TurnPlan; plannerMeta: PlannerMeta } {
  const {
    npcId,
    npcName,
    playerMessage,
    queryType,
    routing,
    evidencePack,
    selfEntityId,
    mode,
    beatContract,
    initiativePolicy,
  } = input;

  // Import the existing plan creator and extend it with multi-strength claims
  const enrichedPack = enrichEvidencePackWithEpistemics(evidencePack, beatContract);
  const interpretationOrMessage = routing?.interpretation ?? playerMessage;

  // Build memory writes with provenance
  const playerFacts = extractExplicitPlayerFacts(playerMessage);

  const plan: TurnPlan = {
    schemaVersion: 1,
    pipelineVersion: 'evidence_first_v1',
    mode: mode ?? 'character',
    routeIntent: routing?.intent ?? 'unclear',
    queryType: queryType ?? 'conversation',
    speechAct: 'chat',
    claims: [],
    socialActs: [],
    questionBack: null,
    memoryWrites: playerFacts,
    initiativeDecision: initiativePolicy?.decision ?? {
      action: 'player_respond',
      initiator: 'player',
      primaryGoal: 'character_goal',
      reason: 'default',
      policyBounded: true,
    },
    abstention: null,
  };

  // Handle initiative actions
  const action = initiativePolicy?.decision?.action ?? 'player_respond';
  if (action === 'close') {
    plan.speechAct = 'close';
    plan.questionBack = 'I think that is enough for now. Goodbye for now.';
    plan.abstention = { reason: 'initiative_close', confidence: 0.96 };
    return { plan, plannerMeta: { selectedEvidence: [], enrichedPack } };
  }
  if (action === 'abstain') {
    plan.speechAct = 'uncertain';
    plan.abstention = { reason: 'initiative_abstain', confidence: 0.94 };
    return { plan, plannerMeta: { selectedEvidence: [], enrichedPack } };
  }
  if (action === 'clarify') {
    plan.speechAct = 'ask';
    plan.questionBack = 'Could you clarify what you want to know?';
    return { plan, plannerMeta: { selectedEvidence: [], enrichedPack } };
  }

  // Social chat without knowledge needs
  if (routing?.intent === 'social_chat' && !isKnowledgeSeekingQueryType(queryType)) {
    plan.speechAct = action === 'npc_initiate' ? 'ask' : 'chat';
    return { plan, plannerMeta: { selectedEvidence: [], enrichedPack } };
  }

  // Knowledge turns: select evidence and build multi-strength claims
  const availableItems = enrichedPack.items.filter((item) => (
    isEvidenceAvailableForPlanning(item)
    && isEvidenceItemRelevantForTurn(item, {
      queryType,
      routeIntent: routing?.intent,
      selfEntityId,
      npcId,
    })
  ));
  if (availableItems.length === 0) {
    plan.speechAct = 'uncertain';
    plan.abstention = { reason: 'no_available_evidence', confidence: 0.9 };
    return { plan, plannerMeta: { selectedEvidence: [], enrichedPack } };
  }

  // Pick top evidence items (already ranked by the evidence pack builder)
  const selected = selectClaimableKnowledgeEvidence(availableItems, interpretationOrMessage).slice(0, 5);
  let claimIndex = 0;
  const claims: PlannedClaim[] = [];
  const seenClaimTexts = new Set();

  const resolveSubject = (item: EpistemicEvidenceItem): string => {
    if (!item) return 'world';
    return item.ownerType === 'player'
      ? 'player'
      : item.ownerType === 'npc'
        ? (selfEntityId ?? npcId ?? npcName ?? 'npc')
        : 'world';
  };

  for (const item of selected) {
    const evidenceItems = [item];
    const claimMode = chooseClaimMode(evidenceItems);
    if (claimMode === 'uncertain' || claimMode === 'inferred') continue;
    const normalizedText = normalizeClaimText(item.text);
    if (!normalizedText) continue;
    const claimTextKey = normalizedText.toLowerCase();
    if (seenClaimTexts.has(claimTextKey)) continue;

    claimIndex++;
    const claim = buildPlannedClaim({
      claimId: `c_${claimIndex}`,
      subject: resolveSubject(item),
      ownerType: item.ownerType,
      text: item?.sourceType === 'self_profile'
        ? formatSelfProfileClaimText(item, { npcName }, playerMessage)
        : ((queryType === 'self_query' || routing?.intent === 'identity_self') && item?.ownerType === 'npc')
          ? formatNpcSelfKnowledgeClaimText(item, { npcName })
        : normalizedText,
      evidenceIds: [item.evidenceId],
      evidenceItems,
    });
    if (claim) {
      claims.push(claim);
      seenClaimTexts.add(claimTextKey);
    }
  }

  for (const inferredClaim of buildCorroboratedClaims(selected, resolveSubject, claimIndex, { npcName }, playerMessage)) {
    const claimTextKey = normalizeClaimText(inferredClaim.text).toLowerCase();
    if (!claimTextKey || seenClaimTexts.has(claimTextKey)) continue;
    claims.push(inferredClaim);
    seenClaimTexts.add(claimTextKey);
    claimIndex++;
    if (claims.length >= 3) break;
  }

  plan.claims = claims;

  if (claims.length === 0) {
    plan.speechAct = 'uncertain';
    plan.abstention = { reason: 'no_claimable_evidence', confidence: 0.85 };
  } else if (routing?.intent === 'session_recall') {
    plan.speechAct = 'recall';
  } else {
    plan.speechAct = 'answer';
  }

  return { plan, plannerMeta: { selectedEvidence: selected, enrichedPack } };
}

// ---------------------------------------------------------------------------
// Plan validation with multi-strength support
// ---------------------------------------------------------------------------

export function validateAndRepairTurnPlanV2(
  input: ValidatePlanInput,
): ValidatedTurnPlanResult {
  const { plan, evidencePack, snapshot } = input;
  void snapshot;
  const errors: string[] = [];
  const droppedClaims: PlannedClaim[] = [];
  const validClaims: PlannedClaim[] = [];
  const evidenceIdToItem = evidencePack?.evidenceIdToItem instanceof Map
    ? evidencePack.evidenceIdToItem
    : new Map<string, EpistemicEvidenceItem>();

  for (const claim of plan.claims ?? []) {
    if (!claim || !claim.text) {
      errors.push('claim entry missing text');
      droppedClaims.push(claim);
      continue;
    }
    if (!claim.evidenceIds || claim.evidenceIds.length === 0) {
      errors.push(`claim has no evidence ids: ${claim.text}`);
      droppedClaims.push(claim);
      continue;
    }

    // Verify evidence items exist and are accessible
    const items: EpistemicEvidenceItem[] = [];
    for (const eid of claim.evidenceIds) {
      const item = evidenceIdToItem.get(eid);
      if (!item) {
        errors.push(`unknown evidence: ${eid}`);
        continue;
      }
      if (item.accessPolicy === 'forbidden') {
        errors.push(`forbidden evidence used: ${eid}`);
        continue;
      }
      items.push(item);
    }
    if (items.length === 0) {
      droppedClaims.push(claim);
      continue;
    }

    // Re-validate claim mode against actual evidence
    const correctMode = chooseClaimMode(items);
    if (correctMode === 'uncertain') {
      errors.push(`claim evidence too weak: ${claim.text}`);
      droppedClaims.push(claim);
      continue;
    }
    if (correctMode === 'inferred' && items.length < 2) {
      errors.push(`inferred claim requires corroborating evidence: ${claim.text}`);
      droppedClaims.push(claim);
      continue;
    }

    validClaims.push({
      ...claim,
      mode: correctMode,
      requiredHedge: requiredHedgeForMode(correctMode),
      maxSpecificity: maxSpecificityForMode(correctMode),
    });
  }

  // Fix speech act if claims were dropped
  let speechAct = plan.speechAct;
  if ((speechAct === 'answer' || speechAct === 'recall') && validClaims.length === 0) {
    speechAct = 'uncertain';
    errors.push('no valid claims remain');
  }

  const acceptable = errors.length === 0;
  const repairedPlan: TurnPlan = {
    ...plan,
    speechAct,
    claims: validClaims,
    abstention: speechAct === 'uncertain'
      ? (plan.abstention ?? { reason: 'claims_dropped_in_validation', confidence: 0.88 })
      : plan.abstention,
  };

  return {
    acceptable,
    plan: repairedPlan,
    errors,
    droppedClaims,
  };
}

// ---------------------------------------------------------------------------
// Deterministic realization from validated plan
// ---------------------------------------------------------------------------

export function realizeDeterministicPlan(
  plan: TurnPlan,
  snapshot: NpcStateSnapshot,
  evidencePack?: EvidencePackLike | null,
  adaptationContext?: LanguageAdaptationContext | null,
): SugarAgentTurnOutput {
  const claims = plan.claims ?? [];
  const speechAct = plan.speechAct ?? 'chat';

  // Build evidence ID → source mapping for citations
  const evidenceIdToItem = evidencePack?.evidenceIdToItem instanceof Map
    ? evidencePack.evidenceIdToItem
    : new Map<string, EpistemicEvidenceItem>();

  function buildCitations(claimList: PlannedClaim[]) {
    return claimList.flatMap((c) => (c.evidenceIds ?? []).map((id) => {
      const item = evidenceIdToItem.get(id);
      return {
        sourceId: item?.sourceId ?? item?.factId ?? id,
        snippet: item?.text ?? undefined,
      };
    }));
  }

  if (speechAct === 'uncertain') {
    const utterance = localizeGroundedUncertaintyReply(
      plan.queryType,
      adaptationContext?.targetLanguage,
    );
    return {
      utterance,
      emotion: 'uncertain',
      intent: 'uncertain',
      proposedIntents: [],
      citations: buildCitations(claims),
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }

  if (speechAct === 'ask') {
    return {
      utterance: plan.questionBack ?? localizeSimpleSocialReply('clarify_simple', adaptationContext?.targetLanguage),
      emotion: 'curious',
      intent: 'question',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }

  if (speechAct === 'close') {
    return {
      utterance: plan.questionBack ?? localizeSimpleSocialReply('close_for_now', adaptationContext?.targetLanguage),
      emotion: 'warm',
      intent: 'close',
      proposedIntents: [],
      citations: [],
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }

  if (speechAct === 'recall') {
    if (claims.length === 0) {
      return {
        utterance: localizeSimpleSocialReply('remember_none', adaptationContext?.targetLanguage),
        emotion: 'warm',
        intent: 'recall',
        proposedIntents: [],
        citations: [],
        beatEvidence: EMPTY_BEAT_EVIDENCE,
      };
    }
    const recallTexts = claims.map((c) => c.text).filter(Boolean);
    const utterance = recallTexts.length === 1
      ? `I remember that ${recallTexts[0]}.`
      : `I remember that ${recallTexts[0]}, and ${recallTexts[1]}.`;
    return {
      utterance,
      emotion: 'warm',
      intent: 'recall',
      proposedIntents: [],
      citations: buildCitations(claims),
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }

  if (speechAct === 'answer' || speechAct === 'chat') {
    if (claims.length === 0) {
      return {
        utterance: localizeSimpleSocialReply('tell_me_more', adaptationContext?.targetLanguage),
        emotion: 'neutral',
        intent: 'conversation',
        proposedIntents: [],
        citations: [],
        beatEvidence: EMPTY_BEAT_EVIDENCE,
      };
    }

    // Apply hedge prefixes based on claim mode
    const claimTexts = claims.map((c) => {
      const prefix = deterministicHedgePrefix(c.mode);
      const text = c.text.replace(/[.!?]+$/, '');
      return `${prefix}${text}`;
    });

    const utterance = claimTexts.length === 1
      ? `${claimTexts[0]}.`
      : `${claimTexts[0]}. ${claimTexts[1]}.`;

    return {
      utterance,
      emotion: claims[0]?.mode === 'rumor' ? 'uncertain' : 'grounded',
      intent: speechAct === 'answer' ? 'answer_lore' : 'conversation',
      proposedIntents: [],
      citations: buildCitations(claims),
      beatEvidence: EMPTY_BEAT_EVIDENCE,
    };
  }

  // Fallback social chat
  return {
    utterance: localizeSimpleSocialReply('tell_me_more', adaptationContext?.targetLanguage),
    emotion: 'neutral',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
    beatEvidence: EMPTY_BEAT_EVIDENCE,
  };
}

// ---------------------------------------------------------------------------
// Main evidence-first pipeline
// ---------------------------------------------------------------------------

export function runEvidenceFirstPipeline(
  input: RunEvidenceFirstPipelineInput,
): EvidenceFirstPipelineResult {
  const {
    playerMessage,
    routing,
    snapshot,
    evidencePack,
    initiativePolicy,
    beatContract,
    adaptationContext,
    loreEntityIds,
  } = input;

  const normalizedRouting: RoutingResult = {
    intent: routing.intent,
    confidence: typeof routing.confidence === 'number' ? routing.confidence : 0.5,
    margin: typeof routing.margin === 'number' ? routing.margin : 0.2,
    candidateScores: Array.isArray(routing.candidateScores) ? routing.candidateScores : [],
    policyPath: routing.policyPath ?? 'safe_chat',
    ...(routing.interpretation ? { interpretation: routing.interpretation } : {}),
  };

  const queryType = routeIntentToQueryType(normalizedRouting.intent);

  // Step 1: Route turn path
  const turnRouting = resolveTurnPath(normalizedRouting, playerMessage, snapshot, loreEntityIds);
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

  // Step 2: Social fast path
  if (turnRouting.path === 'social_fast') {
    const socialPlan: TurnPlan = {
      schemaVersion: 1,
      pipelineVersion: 'evidence_first_v1',
      mode: snapshot.mode,
      routeIntent: normalizedRouting.intent,
      queryType,
      speechAct: 'chat',
      claims: [],
      socialActs: [],
      questionBack: null,
      memoryWrites: extractExplicitPlayerFacts(playerMessage),
      initiativeDecision: initiativePolicy?.decision ?? {},
      abstention: null,
    };

    const socialTurn = buildDeterministicSocialReply(playerMessage, snapshot, adaptationContext ?? null);
    // Verify social response doesn't leak facts
    if (checkSocialResponseForFactualLeakage(socialTurn.utterance)) {
      // Reroute to grounded — fall through to grounded path below
    } else {
      return {
        output: socialTurn,
        plan: socialPlan,
        validatedPlan: { acceptable: true, plan: socialPlan, errors: [], droppedClaims: [] },
        verification: { ok: true, errors: [], unsupportedUnits: [], overassertedUnits: [] },
        memoryWrites: filterMemoryWrites({ plan: socialPlan }),
        diagnostics,
        turnRouting,
      };
    }
  }

  // Step 3: Grounded path - enrich evidence with epistemics
  const enrichedPack = enrichEvidencePackWithEpistemics(evidencePack, beatContract);

  // Step 4: Create evidence-first turn plan
  const { plan } = createEvidenceFirstTurnPlanV2({
    npcId: snapshot.npcId,
    npcName: snapshot.npcName,
    playerMessage,
    queryType,
    routing: normalizedRouting,
    evidencePack: enrichedPack,
    selfEntityId: snapshot.selfEntityId,
    mode: snapshot.mode,
    beatContract,
    initiativePolicy,
  });

  // Step 5: Validate and repair plan
  const validated = validateAndRepairTurnPlanV2({
    plan,
    evidencePack: enrichedPack,
    snapshot,
  });

  diagnostics.planOutcome = {
    speechAct: validated.plan.speechAct,
    claimCount: validated.plan.claims.length,
    claimModes: {
      grounded: validated.plan.claims.filter((c) => c.mode === 'grounded').length,
      inferred: validated.plan.claims.filter((c) => c.mode === 'inferred').length,
      rumor: validated.plan.claims.filter((c) => c.mode === 'rumor').length,
    },
    acceptable: validated.acceptable,
    errors: validated.errors,
  };

  // Step 6: Realize the plan deterministically
  const realized = realizeDeterministicPlan(validated.plan, snapshot, enrichedPack, adaptationContext ?? null);

  // Step 7: Semantic verification on the source-language realization.
  const verification = verifyRealizationAgainstPlan(
    realized.utterance,
    validated.plan,
    enrichedPack,
    snapshot,
  );

  diagnostics.semanticVerification = verification;

  // Step 8: If verification fails, fall back to deterministic realization
  let finalOutput: SugarAgentTurnOutput = realized;
  if (!verification.ok) {
    diagnostics.deterministicFallbackUsed = true;
    finalOutput = realizeDeterministicPlan(validated.plan, snapshot, enrichedPack, adaptationContext ?? null);
  }

  // Step 9: Build filtered memory writes
  const memoryWrites = filterMemoryWrites({ plan: validated.plan });
  const npcCommitments = extractNpcCommitments(finalOutput.utterance, validated.plan);
  const allWrites = [...memoryWrites, ...npcCommitments];

  return {
    output: finalOutput,
    plan: validated.plan,
    validatedPlan: validated,
    verification,
    memoryWrites: allWrites,
    diagnostics,
    turnRouting,
  };
}
