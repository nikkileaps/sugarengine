// @ts-nocheck
/**
 * @fileoverview Evidence-first turn pipeline orchestration.
 *
 * Implements: ADR-SA-025 (canonical live path)
 *
 * Pipeline: route → retrieve → build evidence pack → resolve initiative →
 * plan → validate plan → realize → semantic verify → persist
 *
 * This is the only correctness path for knowledge-bearing turns.
 */

import type { RoutingResult } from './routing';
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
import { verifyRealizationAgainstPlan } from './semantic/verification';
import { extractExplicitPlayerFacts, filterMemoryWrites, extractNpcCommitments } from './memory-provenance';
import { applyLanguageAdaptation, resolveLanguageAdaptationContext } from './language-adaptation';
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
} from './turn-contracts';

// ---------------------------------------------------------------------------
// NPC State Snapshot builder
// ---------------------------------------------------------------------------

export function buildNpcStateSnapshot(input) {
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
    languageAdaptation: null,
  };
}

// ---------------------------------------------------------------------------
// Evidence enrichment
// ---------------------------------------------------------------------------

export function enrichEvidencePackWithEpistemics(evidencePack, beatContract) {
  if (!evidencePack || !Array.isArray(evidencePack.items)) return evidencePack;

  const enrichedItems = evidencePack.items.map((item) =>
    item?.knowledgeClass && item?.accessPolicy && item?.disclosurePolicy
      ? item
      : enrichEvidenceWithEpistemics(item, beatContract),
  );

  const enrichedIdToItem = new Map();
  for (const item of enrichedItems) {
    enrichedIdToItem.set(item.evidenceId, item);
  }

  return {
    ...evidencePack,
    items: enrichedItems,
    evidenceIdToItem: enrichedIdToItem,
  };
}

function normalizeClaimText(text) {
  return String(text ?? '').trim().replace(/[.!?]+$/, '');
}

function evidenceTargetsCurrentNpc(item, selfEntityId, npcId) {
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

export function isEvidenceItemRelevantForTurn(item, input) {
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

function capitalizeName(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return normalized
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSelfProfileParts(text) {
  const normalized = normalizeClaimText(text);
  if (!normalized) return {};
  const nameMatch = normalized.match(/\bNPC name:\s*([^.;]+)/i);
  const personaMatch = normalized.match(/\bPersona:\s*([^.;]+)/i);
  return {
    name: normalizeClaimText(nameMatch?.[1] ?? ''),
    persona: normalizeClaimText(personaMatch?.[1] ?? ''),
  };
}

function shouldAnswerWithNpcName(playerMessage) {
  return /\b(what(?:'s| is) your name|your name|who are you)\b/i.test(String(playerMessage ?? ''));
}

function formatSelfProfileClaimText(item, snapshot, playerMessage) {
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

function formatNpcSelfKnowledgeClaimText(item, snapshot) {
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

function buildDeterministicSocialReply(playerMessage, snapshot) {
  const message = String(playerMessage ?? '').trim();
  const npcName = normalizeClaimText(snapshot?.npcName || '') || 'friend';
  const declaredName = extractDeclaredIdentityName(message);
  const safeDeclaredName = declaredName ? capitalizeName(declaredName) : '';
  const asksIdentity = shouldAnswerWithNpcName(message);
  const frustration = /\b(i was pretty clear|i was clear|that was clear|pretty clear|be serious|come on)\b/i.test(message);

  if (frustration) {
    return {
      utterance: `Fair enough. I'm ${npcName}. Ask me directly what you want to know.`,
      emotion: 'steady',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }
  if (safeDeclaredName && asksIdentity) {
    return {
      utterance: `Nice to meet you, ${safeDeclaredName}. I'm ${npcName}.`,
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }
  if (asksIdentity) {
    return {
      utterance: `I'm ${npcName}.`,
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }
  if (safeDeclaredName) {
    return {
      utterance: `Nice to meet you, ${safeDeclaredName}. I'm ${npcName}.`,
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }
  if (isLikelyGreetingOnlyMessage(message)) {
    return {
      utterance: `Hi. I'm ${npcName}.`,
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }
  return {
    utterance: "I'm listening.",
    emotion: 'neutral',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
    beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
  };
}

function tokenizeEvidenceText(text) {
  return new Set(
    normalizeClaimText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 4),
  );
}

function countTokenOverlap(a, b) {
  if (!(a instanceof Set) || !(b instanceof Set) || a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap;
}

function haveSharedEntityIds(a, b) {
  const aIds = Array.isArray(a?.entityIds) ? a.entityIds.filter((entry) => typeof entry === 'string') : [];
  const bIds = Array.isArray(b?.entityIds) ? b.entityIds.filter((entry) => typeof entry === 'string') : [];
  if (aIds.length === 0 || bIds.length === 0) return false;
  const bIdSet = new Set(bIds.map((entry) => entry.toLowerCase()));
  return aIds.some((entry) => bIdSet.has(entry.toLowerCase()));
}

function areEvidenceItemsCompatible(a, b) {
  if (!a || !b) return false;
  if (a.evidenceId === b.evidenceId) return false;
  if (a.ownerType !== b.ownerType && a.ownerType !== 'world' && b.ownerType !== 'world') {
    return false;
  }
  if (haveSharedEntityIds(a, b)) return true;
  const overlap = countTokenOverlap(tokenizeEvidenceText(a.text), tokenizeEvidenceText(b.text));
  return overlap >= 2;
}

function buildEvidenceRelevanceText(item) {
  const anchorTerms = Array.isArray(item?.anchorTerms)
    ? item.anchorTerms.filter((entry) => typeof entry === 'string')
    : [];
  return [
    normalizeClaimText(item?.text),
    ...anchorTerms,
    typeof item?.chunkId === 'string' ? item.chunkId : '',
    typeof item?.sourceId === 'string' ? item.sourceId : '',
  ].join(' ');
}

function assessKnowledgeEvidenceRelevance(item, playerMessage) {
  const queryTokens = extractFacetQueryTokens(playerMessage);
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
  const claimable = queryTokens.length <= 1
    ? matchedTokens > 0
    : coverage > 0.5 || matchedTokens >= 2;
  return {
    matchedTokens,
    coverage: Number(coverage.toFixed(4)),
    claimable,
  };
}

export function hasDirectAnswerableStateEvidence(items, playerMessage) {
  return (Array.isArray(items) ? items : []).some((item) => (
    item?.sourceType === 'routine_state'
    && assessKnowledgeEvidenceRelevance(item, playerMessage).claimable
  ));
}

function selectClaimableKnowledgeEvidence(items, playerMessage) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const relevance = assessKnowledgeEvidenceRelevance(item, playerMessage);
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

function pickPrimaryEvidenceForMode(evidenceItems, mode) {
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) return null;
  if (mode === 'rumor') {
    return evidenceItems.find((item) => item?.knowledgeClass === 'rumor') ?? evidenceItems[0];
  }
  if (mode === 'inferred') {
    return evidenceItems.find((item) => item?.accessPolicy === 'assert') ?? evidenceItems[0];
  }
  return evidenceItems[0];
}

function buildCorroboratedClaims(selected, subjectResolver, startingIndex = 0, snapshot = {}, playerMessage = '') {
  const claims = [];
  const seenEvidenceKeys = new Set();
  let claimIndex = startingIndex;

  for (let leftIndex = 0; leftIndex < selected.length; leftIndex++) {
    const left = selected[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < selected.length; rightIndex++) {
      const right = selected[rightIndex];
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

export function createEvidenceFirstTurnPlanV2(input) {
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

  // Build memory writes with provenance
  const playerFacts = extractExplicitPlayerFacts(playerMessage);

  const plan = {
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
  const selected = selectClaimableKnowledgeEvidence(availableItems, playerMessage).slice(0, 5);
  let claimIndex = 0;
  const claims = [];
  const seenClaimTexts = new Set();

  const resolveSubject = (item) => {
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

export function validateAndRepairTurnPlanV2(input) {
  const { plan, evidencePack, snapshot } = input;
  const errors = [];
  const droppedClaims = [];
  const validClaims = [];
  const evidenceIdToItem = evidencePack?.evidenceIdToItem instanceof Map
    ? evidencePack.evidenceIdToItem
    : new Map();

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
    const items = [];
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
  const repairedPlan = {
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

export function realizeDeterministicPlan(plan, snapshot, evidencePack?) {
  const claims = plan.claims ?? [];
  const speechAct = plan.speechAct ?? 'chat';
  const npcName = snapshot.npcName ?? 'friend';

  // Build evidence ID → source mapping for citations
  const evidenceIdToItem = evidencePack?.evidenceIdToItem instanceof Map
    ? evidencePack.evidenceIdToItem
    : new Map();

  function buildCitations(claimList) {
    return claimList.flatMap((c) => (c.evidenceIds ?? []).map((id) => {
      const item = evidenceIdToItem.get(id);
      return {
        sourceId: item?.sourceId ?? item?.factId ?? id,
        snippet: item?.text ?? undefined,
      };
    }));
  }

  if (speechAct === 'uncertain') {
    const utterance = plan.queryType === 'self_query'
      ? "I don't know. I don't want to guess about my own background."
      : "I don't know.";
    return {
      utterance,
      emotion: 'uncertain',
      intent: 'uncertain',
      proposedIntents: [],
      citations: buildCitations(claims),
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }

  if (speechAct === 'ask') {
    return {
      utterance: plan.questionBack ?? 'Could you clarify what you want to know?',
      emotion: 'curious',
      intent: 'question',
      proposedIntents: [],
      citations: [],
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }

  if (speechAct === 'close') {
    return {
      utterance: plan.questionBack ?? 'I think that is enough for now. Goodbye.',
      emotion: 'warm',
      intent: 'close',
      proposedIntents: [],
      citations: [],
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }

  if (speechAct === 'recall') {
    if (claims.length === 0) {
      return {
        utterance: "I don't remember any specific details yet.",
        emotion: 'warm',
        intent: 'recall',
        proposedIntents: [],
        citations: [],
        beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
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
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }

  if (speechAct === 'answer' || speechAct === 'chat') {
    if (claims.length === 0) {
      return {
        utterance: "Got it. Tell me a little more and I'll help where I can.",
        emotion: 'neutral',
        intent: 'conversation',
        proposedIntents: [],
        citations: [],
        beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
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
      beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
    };
  }

  // Fallback social chat
  return {
    utterance: "Got it. Tell me a little more and I'll help where I can.",
    emotion: 'neutral',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
    beatEvidence: { coveredFacts: [], uncoveredFacts: [], completionSignal: 'none', confidence: 0 },
  };
}

// ---------------------------------------------------------------------------
// Main evidence-first pipeline
// ---------------------------------------------------------------------------

export function runEvidenceFirstPipeline(input) {
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

  const queryType = routeIntentToQueryType(routing.intent);

  // Step 1: Route turn path
  const turnRouting = resolveTurnPath(routing, playerMessage, snapshot, loreEntityIds);
  const diagnostics = {
    pipelineVersion: 'evidence_first_v1',
    turnPath: turnRouting.path,
    riskSignals: {
      hasKnowledgeWhCue: turnRouting.factualRiskSignals.includes('knowledge_wh_cue'),
      hasRecallCue: turnRouting.factualRiskSignals.includes('recall_cue'),
      hasLoreEntityMention: turnRouting.factualRiskSignals.includes('lore_entity_mention'),
      hasFactualClausePattern: turnRouting.factualRiskSignals.includes('factual_clause_pattern'),
      hasRouteConflict: turnRouting.factualRiskSignals.includes('route_conflict'),
    },
    adaptationApplied: false,
    deterministicFallbackUsed: false,
  };

  // Step 2: Social fast path
  if (turnRouting.path === 'social_fast') {
    const socialPlan = {
      schemaVersion: 1,
      pipelineVersion: 'evidence_first_v1',
      mode: snapshot.mode,
      routeIntent: routing.intent,
      queryType,
      speechAct: 'chat',
      claims: [],
      socialActs: [],
      questionBack: null,
      memoryWrites: extractExplicitPlayerFacts(playerMessage),
      initiativeDecision: initiativePolicy?.decision ?? {},
      abstention: null,
    };

    const socialTurn = buildDeterministicSocialReply(playerMessage, snapshot);

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
    routing,
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
  const realized = realizeDeterministicPlan(validated.plan, snapshot, enrichedPack);

  // Step 7: Apply language adaptation (currently passthrough)
  const adapted = applyLanguageAdaptation(realized, adaptationContext);
  diagnostics.adaptationApplied = adaptationContext != null;

  // Step 8: Semantic verification
  const verification = verifyRealizationAgainstPlan(
    adapted.utterance,
    validated.plan,
    enrichedPack,
    snapshot,
  );

  diagnostics.semanticVerification = verification;

  // Step 9: If verification fails, fall back to deterministic realization
  let finalOutput = adapted;
  if (!verification.ok) {
    diagnostics.deterministicFallbackUsed = true;
    finalOutput = realizeDeterministicPlan(validated.plan, snapshot, enrichedPack);
  }

  // Step 10: Build filtered memory writes
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
