// @ts-nocheck
import { enrichEvidencePackWithEpistemics } from '../evidence/enrichment.js';
import { isEvidenceAvailableForPlanning } from '../epistemology.js';
import { isKnowledgeSeekingQueryType } from '../routing.js';
import {
  buildPlannedClaim,
  chooseClaimMode,
  requiredHedgeForMode,
  maxSpecificityForMode,
} from '../claim-planning.js';
import { lexicalOverlapScore, tokenizeForPlan } from '../retrieval-text.js';
import {
  extractFacetQueryTokens,
  expandFacetQueryTokenVariants,
} from '../knowledge-query.js';
import {
  isRelationDistanceAdmissible,
  relationDistanceWeight,
} from '../subject-relevance.js';
import {
  extractExplicitPlayerFacts,
} from '../memory-provenance.js';

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

function formatNpcSelfKnowledgeClaimText(item, snapshot, facet = 'unknown') {
  const fullText = normalizeClaimText(item?.text);
  if (!fullText) return '';
  const sentences = String(fullText)
    .split(/(?<=[.!?])\s+/)
    .map((entry) => normalizeClaimText(entry))
    .filter(Boolean);
  const sentenceMatchers = {
    occupation: /\b(own|owns|run|runs|work|works|job|occupation|shop|store|stall|merchant|manager)\b/i,
    preference: /\b(like|likes|love|loves|hate|hates|prefer|prefers|favorite|favourite|obsessed)\b/i,
    identity: /\b(name|called|is)\b/i,
    current_activity: /\b(right now|currently|doing|watching|minding|working)\b/i,
    background: /\b(from|grew|family|past|background)\b/i,
  };
  const preferredSentence = (
    sentenceMatchers[facet]
      ? sentences.find((sentence) => sentenceMatchers[facet].test(sentence))
      : undefined
  ) ?? sentences[0] ?? fullText;
  const npcName = normalizeClaimText(snapshot?.npcName || '');
  if (!npcName) return preferredSentence || fullText;

  const replacements = [
    { pattern: new RegExp(`^${escapeRegex(npcName)}\\s+owns\\b`, 'i'), replacement: 'I own' },
    { pattern: new RegExp(`^${escapeRegex(npcName)}\\s+runs\\b`, 'i'), replacement: 'I run' },
    { pattern: new RegExp(`^${escapeRegex(npcName)}\\s+works\\b`, 'i'), replacement: 'I work' },
    { pattern: new RegExp(`^${escapeRegex(npcName)}\\s+is\\b`, 'i'), replacement: 'I am' },
    { pattern: /^(he|she)\s+owns\b/i, replacement: 'I own' },
    { pattern: /^(he|she)\s+runs\b/i, replacement: 'I run' },
    { pattern: /^(he|she)\s+works\b/i, replacement: 'I work' },
    { pattern: /^(he|she)\s+is\b/i, replacement: 'I am' },
    { pattern: /^(he|she)\s+likes\b/i, replacement: 'I like' },
    { pattern: /^(he|she)\s+loves\b/i, replacement: 'I love' },
    { pattern: /^(he|she)\s+hates\b/i, replacement: 'I hate' },
    { pattern: /^(he|she)\s+prefers\b/i, replacement: 'I prefer' },
  ];

  for (const { pattern, replacement } of replacements) {
    if (pattern.test(preferredSentence)) {
      return preferredSentence.replace(pattern, replacement);
    }
  }

  return preferredSentence || fullText;
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
    ? item.anchorTerms
        .filter((entry) => typeof entry === 'string')
        .filter((entry) => !/[.#/]/.test(entry))
    : [];
  return [
    normalizeClaimText(item?.text),
    ...anchorTerms,
  ].join(' ');
}

function assessKnowledgeEvidenceRelevance(item, playerMessageOrInterpretation) {
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
  const selfPreferenceQuestion = (
    playerMessageOrInterpretation
    && typeof playerMessageOrInterpretation === 'object'
    && playerMessageOrInterpretation.target === 'self'
    && interpretationFacet === 'preference'
    && (item?.ownerType === 'npc' || item?.selfAttributed === true)
    && matchedTokens >= 1
    && coverage >= 0.5
  );
  const claimable = queryTokens.length <= 1
    ? matchedTokens > 0
    : coverage > 0.5 || matchedTokens >= 2 || broadLoreQuestion || selfPreferenceQuestion;
  return {
    matchedTokens,
    coverage: Number(coverage.toFixed(4)),
    claimable,
  };
}

function playerExplicitlyRequestsRepeat(playerMessage) {
  return /\b(again|repeat|say that again|what did you say|one more time)\b/i.test(String(playerMessage ?? ''));
}

function isCurrentLocationRoutineStateItem(item) {
  return item?.sourceType === 'routine_state' && item?.provenance?.kind === 'current_location';
}

function isExplicitCurrentLocationQuestion(playerMessage) {
  return /\b(where are we|where am i|where is this|what place is this|this place|right now|currently|here)\b/i.test(
    String(playerMessage ?? ''),
  );
}

function isGenericWorldLoreInterpretation(playerMessageOrInterpretation) {
  if (!playerMessageOrInterpretation || typeof playerMessageOrInterpretation !== 'object') return false;
  return playerMessageOrInterpretation.target === 'world'
    && playerMessageOrInterpretation.facet === 'general_lore';
}

function recentReplyOverlapPenalty(item, recentNpcReplies, playerMessage) {
  if (recentNpcReplies.length === 0 || playerExplicitlyRequestsRepeat(playerMessage)) {
    return 0;
  }
  const evidenceText = buildEvidenceRelevanceText(item);
  const maxOverlap = recentNpcReplies.reduce((best, reply) => {
    return Math.max(best, lexicalOverlapScore(evidenceText, reply));
  }, 0);
  if (maxOverlap >= 0.72) return 0.32;
  if (maxOverlap >= 0.48) return 0.18;
  return 0;
}

export function hasDirectAnswerableStateEvidence(items, playerMessageOrInterpretation) {
  return (Array.isArray(items) ? items : []).some((item) => (
    item?.sourceType === 'routine_state'
    && assessKnowledgeEvidenceRelevance(item, playerMessageOrInterpretation).claimable
  ));
}

function selectClaimableKnowledgeEvidence(
  items,
  playerMessageOrInterpretation,
  options = {},
) {
  const recentNpcReplies = Array.isArray(options.recentNpcReplies)
    ? options.recentNpcReplies
        .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
        .slice(-3)
    : [];
  const genericWorldLore = isGenericWorldLoreInterpretation(playerMessageOrInterpretation);
  const currentLocationQuestion = isExplicitCurrentLocationQuestion(options.playerMessage ?? '');
  const relationPolicy = (
    playerMessageOrInterpretation
    && typeof playerMessageOrInterpretation === 'object'
    && playerMessageOrInterpretation.relationPolicy
  )
    ? playerMessageOrInterpretation.relationPolicy
    : undefined;
  const ranked = (Array.isArray(items) ? items : [])
    .map((item) => {
      const relevance = assessKnowledgeEvidenceRelevance(item, playerMessageOrInterpretation);
      const currentLocationPenalty = isCurrentLocationRoutineStateItem(item) && !currentLocationQuestion
        ? (genericWorldLore ? 0.42 : 0.28)
        : 0;
      const loreChunkBoost = genericWorldLore && item?.sourceType === 'lore_chunk' ? 0.08 : 0;
      const relationWeight = typeof relationPolicy === 'object' && relationPolicy
        ? relationDistanceWeight(item.relationDistance, relationPolicy)
        : 1;
      const repeatPenalty = recentReplyOverlapPenalty(
        item,
        recentNpcReplies,
        options.playerMessage ?? '',
      );
      return {
        item,
        relevance,
        admissible: typeof relationPolicy === 'object' && relationPolicy
          ? isRelationDistanceAdmissible(item.relationDistance, relationPolicy)
          : true,
        priority: Number((
          (
            (relevance.coverage * 0.62)
            + (relevance.matchedTokens * 0.14)
            + ((item?.confidence ?? 0) * 0.22)
            + loreChunkBoost
            - currentLocationPenalty
            - repeatPenalty
          )
          * relationWeight
          + (item?.relationDistance === 'primary' ? 0.06 : 0)
          + (item?.relationDistance === 'associated' ? 0.02 : 0)
        ).toFixed(4)),
      };
    })
    .sort((a, b) => (
      b.priority - a.priority
      || b.relevance.coverage - a.relevance.coverage
      || b.relevance.matchedTokens - a.relevance.matchedTokens
      || (b.item?.confidence ?? 0) - (a.item?.confidence ?? 0)
    ))
    .filter((entry) => entry.relevance.claimable && entry.admissible);

  if (ranked.length === 0) {
    const associatedFallback = (Array.isArray(items) ? items : [])
      .map((item) => {
        const relevance = assessKnowledgeEvidenceRelevance(item, playerMessageOrInterpretation);
        return {
          item,
          relevance,
          priority: Number((
            (relevance.coverage * 0.62)
            + (relevance.matchedTokens * 0.14)
            + ((item?.confidence ?? 0) * 0.22)
          ).toFixed(4)),
        };
      })
      .filter((entry) => (
        entry.relevance.claimable
        && entry.item?.relationDistance === 'associated'
      ))
      .sort((a, b) => (
        b.priority - a.priority
        || (b.item?.confidence ?? 0) - (a.item?.confidence ?? 0)
      ));
    if (associatedFallback.length > 0) {
      return associatedFallback.map((entry) => entry.item);
    }
  }

  const rankedItems = currentLocationQuestion
    ? (() => {
        const currentLocationEntries = ranked.filter((entry) => isCurrentLocationRoutineStateItem(entry.item));
        if (currentLocationEntries.length === 0) return ranked;
        return [
          ...currentLocationEntries,
          ...ranked.filter((entry) => !isCurrentLocationRoutineStateItem(entry.item)),
        ];
      })()
    : (() => {
        const hasNonLocationClaimable = ranked.some((entry) => !isCurrentLocationRoutineStateItem(entry.item));
        if (!hasNonLocationClaimable) return ranked;
        return ranked.filter((entry) => !isCurrentLocationRoutineStateItem(entry.item));
      })();

  if (!relationPolicy?.evidenceBudget) {
    return rankedItems.map((entry) => entry.item);
  }

  const selected = [];
  let primaryCount = 0;
  let associatedCount = 0;
  const primaryPreferred = (relationPolicy.preferredRelationDistances[0] ?? 'primary') === 'primary';
  const hasPrimaryCandidate = rankedItems.some((entry) => entry.item?.relationDistance === 'primary');
  const primaryEntries = primaryPreferred
    ? rankedItems.filter((entry) => entry.item?.relationDistance === 'primary')
    : rankedItems;

  for (const entry of primaryEntries) {
    const distance = entry.item?.relationDistance;
    if (distance === 'primary') {
      if (primaryCount >= relationPolicy.evidenceBudget.maxPrimary) continue;
      primaryCount += 1;
      selected.push(entry.item);
      continue;
    }
    if (primaryPreferred && hasPrimaryCandidate) {
      continue;
    }
    if (distance === 'associated') {
      if (associatedCount >= relationPolicy.evidenceBudget.maxAssociated) continue;
      associatedCount += 1;
      selected.push(entry.item);
      continue;
    }
    if (!distance) {
      selected.push(entry.item);
    }
  }
  for (const entry of rankedItems) {
    const distance = entry.item?.relationDistance;
    if (distance !== 'associated') continue;
    if (associatedCount >= relationPolicy.evidenceBudget.maxAssociated) break;
    if (selected.some((item) => item.evidenceId === entry.item.evidenceId)) continue;
    associatedCount += 1;
    selected.push(entry.item);
  }
  if (selected.length > 0) {
    return selected;
  }

  return rankedItems.map((entry) => entry.item);
}

function pickPrimaryEvidenceForMode(evidenceItems, mode) {
  if (!Array.isArray(evidenceItems) || evidenceItems.length === 0) return null;
  if (mode === 'rumor') {
    return evidenceItems.find((item) => item?.knowledgeClass === 'rumor') ?? evidenceItems[0] ?? null;
  }
  if (mode === 'inferred') {
    return evidenceItems.find((item) => item?.accessPolicy === 'assert') ?? evidenceItems[0] ?? null;
  }
  return evidenceItems[0] ?? null;
}

function buildCorroboratedClaims(selected, subjectResolver, startingIndex = 0, snapshot = {}, playerMessage = '') {
  const claims = [];
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

export function createEvidenceFirstTurnPlanV2(input) {
  const {
    npcId,
    npcName,
    playerMessage,
    recentNpcReplies,
    queryType,
    routing,
    evidencePack,
    selfEntityId,
    mode,
    beatContract,
    initiativePolicy,
  } = input;

  const enrichedPack = enrichEvidencePackWithEpistemics(evidencePack, beatContract);
  const interpretationOrMessage = routing?.interpretation ?? playerMessage;
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

  if (routing?.intent === 'social_chat' && !isKnowledgeSeekingQueryType(queryType)) {
    plan.speechAct = action === 'npc_initiate' ? 'ask' : 'chat';
    return { plan, plannerMeta: { selectedEvidence: [], enrichedPack } };
  }

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

  const selected = selectClaimableKnowledgeEvidence(availableItems, interpretationOrMessage, {
    playerMessage,
    recentNpcReplies,
  }).slice(0, 5);
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
          ? formatNpcSelfKnowledgeClaimText(item, { npcName }, routing?.interpretation?.facet ?? 'unknown')
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

export function validateAndRepairTurnPlanV2(input) {
  const { plan, evidencePack, snapshot } = input;
  void snapshot;
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
