// @ts-nocheck
import {
  buildClarificationQuestion,
  buildProactiveQuestion,
  createNormalizedInitiativeDecision,
  normalizeGoalType,
  normalizeInitiativeAction,
  summarizeInitiativeHistory,
} from './initiative';
import {
  pickEvidenceForIntent,
  selectKnowledgeEvidence,
  splitEvidenceIntoClaims,
  toRecallClaimText,
} from './retrieval-governance';
import {
  extractConversationTopics,
  extractSalientFacts,
  normalizeFact,
  normalizeTopicToken,
} from './session-state';

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const TOPIC_EXHAUSTION_MAX_NOVELTY = 0.34;

export function normalizePlanSpeechAct(value) {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (
    normalized === 'answer'
    || normalized === 'clarify'
    || normalized === 'recall'
    || normalized === 'uncertain'
    || normalized === 'ask'
    || normalized === 'close'
    || normalized === 'chat'
  ) {
    return normalized;
  }
  return 'chat';
}

export function isPlanClaimCompatible({
  claim,
  evidenceItems,
  queryType,
  routeIntent,
  selfEntityId,
  npcId,
}) {
  const subject = normalizeOptionalString(claim?.subject)?.toLowerCase() ?? '';
  const normalizedSelfEntityId = normalizeOptionalString(selfEntityId)?.toLowerCase();
  const normalizedNpcId = normalizeOptionalString(npcId)?.toLowerCase();

  if (routeIntent === 'session_recall') {
    return evidenceItems.every((item) => item.ownerType === 'player');
  }

  if (subject === 'player') {
    return evidenceItems.every((item) => item.ownerType === 'player');
  }

  const subjectIsNpc = subject === 'npc'
    || (normalizedSelfEntityId && subject === normalizedSelfEntityId)
    || (normalizedNpcId && subject === normalizedNpcId);

  if (queryType === 'self_query' || routeIntent === 'identity_self' || subjectIsNpc) {
    return evidenceItems.some((item) => item.ownerType === 'npc' || item.ownerType === 'beat');
  }

  if (queryType === 'world_query' || routeIntent === 'lore_world') {
    return evidenceItems.every((item) => item.ownerType !== 'player');
  }

  return true;
}

export function allowedSpeechActsForInitiativeAction(action) {
  const normalizedAction = normalizeInitiativeAction(action, 'player_respond');
  if (normalizedAction === 'abstain') return ['uncertain'];
  if (normalizedAction === 'clarify') return ['ask', 'clarify'];
  if (normalizedAction === 'close') return ['close'];
  if (normalizedAction === 'npc_initiate') return ['ask', 'chat', 'answer', 'recall'];
  return ['answer', 'recall', 'chat', 'ask'];
}

export function defaultSpeechActForInitiativeAction(action) {
  const normalizedAction = normalizeInitiativeAction(action, 'player_respond');
  if (normalizedAction === 'abstain') return 'uncertain';
  if (normalizedAction === 'clarify') return 'ask';
  if (normalizedAction === 'close') return 'close';
  return 'chat';
}

export function validateAndRepairTurnPlan({
  plan,
  evidencePack,
  queryType,
  routeIntent,
  selfEntityId,
  npcId,
  initiativePolicy,
  pipelineVersion = 'v2',
}) {
  const errors = [];
  const evidenceIdToItem = evidencePack?.evidenceIdToItem instanceof Map ? evidencePack.evidenceIdToItem : new Map();
  const policyDecision = createNormalizedInitiativeDecision(
    initiativePolicy?.decision,
    normalizeGoalType(plan?.primaryGoal, 'character_goal'),
  );
  const normalizedPlan = isRecord(plan)
    ? {
      ...plan,
      speechAct: normalizePlanSpeechAct(plan.speechAct),
      claims: Array.isArray(plan.claims) ? [...plan.claims] : [],
      memoryWrite: Array.isArray(plan.memoryWrite) ? [...plan.memoryWrite] : [],
      questionBack: normalizeOptionalString(plan.questionBack) ?? null,
      initiativeDecision: createNormalizedInitiativeDecision(
        plan.initiativeDecision,
        policyDecision.primaryGoal,
      ),
    }
    : {
      schemaVersion: 1,
      pipelineVersion,
      speechAct: 'uncertain',
      claims: [],
      memoryWrite: [],
      questionBack: null,
      initiativeDecision: policyDecision,
      abstention: {
        reason: 'invalid_plan_shape',
        confidence: 1,
      },
    };

  const validClaims = [];
  const droppedClaims = [];
  for (const claim of normalizedPlan.claims) {
    if (!isRecord(claim)) {
      errors.push('claim entry must be an object');
      droppedClaims.push(claim);
      continue;
    }
    const text = normalizeFact(claim.text);
    const evidenceIds = Array.isArray(claim.evidenceIds)
      ? claim.evidenceIds.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
      : [];
    if (!text) {
      errors.push('claim text is empty');
      droppedClaims.push(claim);
      continue;
    }
    if (evidenceIds.length === 0) {
      errors.push(`claim has no evidence ids: ${text}`);
      droppedClaims.push(claim);
      continue;
    }
    const evidenceItems = [];
    for (const evidenceId of evidenceIds) {
      const item = evidenceIdToItem.get(evidenceId);
      if (!item) {
        errors.push(`claim references unknown evidence id: ${evidenceId}`);
        continue;
      }
      evidenceItems.push(item);
    }
    if (evidenceItems.length === 0) {
      droppedClaims.push(claim);
      continue;
    }
    if (!isPlanClaimCompatible({
      claim,
      evidenceItems,
      queryType,
      routeIntent,
      selfEntityId,
      npcId,
    })) {
      errors.push(`claim subject/evidence ownership mismatch: ${text}`);
      droppedClaims.push(claim);
      continue;
    }
    validClaims.push({
      claimId: normalizeOptionalString(claim.claimId) ?? `c_${validClaims.length + 1}`,
      subject: normalizeOptionalString(claim.subject) ?? 'world',
      ownerType: normalizeOptionalString(claim.ownerType) ?? evidenceItems[0]?.ownerType ?? 'unknown',
      text,
      evidenceIds,
      confidence: typeof claim.confidence === 'number' && Number.isFinite(claim.confidence)
        ? Math.max(0, Math.min(1, claim.confidence))
        : Math.max(0.35, Math.min(1, evidenceItems[0]?.confidence ?? 0.5)),
    });
  }

  let initiativeDecision = createNormalizedInitiativeDecision(
    normalizedPlan.initiativeDecision,
    policyDecision.primaryGoal,
  );
  if (initiativeDecision.action !== policyDecision.action) {
    errors.push(`initiative action mismatch: planned=${initiativeDecision.action} policy=${policyDecision.action}`);
    initiativeDecision = {
      ...policyDecision,
      reason: `${policyDecision.reason};validator-aligned`,
      policyBounded: true,
    };
  }
  if (initiativeDecision.initiator !== policyDecision.initiator) {
    initiativeDecision.initiator = policyDecision.initiator;
    initiativeDecision.policyBounded = true;
  }
  initiativeDecision.primaryGoal = policyDecision.primaryGoal;
  initiativeDecision.secondaryGoals = Array.isArray(policyDecision.secondaryGoals)
    ? [...policyDecision.secondaryGoals]
    : [];
  initiativeDecision.expectedPlayerResponseType = policyDecision.expectedPlayerResponseType;

  let speechAct = normalizePlanSpeechAct(normalizedPlan.speechAct);
  const allowedSpeechActs = allowedSpeechActsForInitiativeAction(initiativeDecision.action);
  if (!allowedSpeechActs.includes(speechAct)) {
    errors.push(`speechAct "${speechAct}" violates initiative action "${initiativeDecision.action}"`);
    speechAct = defaultSpeechActForInitiativeAction(initiativeDecision.action);
  }

  if ((speechAct === 'answer' || speechAct === 'recall') && validClaims.length === 0) {
    speechAct = 'uncertain';
    errors.push('required claims missing after validation');
  }
  if (
    (queryType === 'self_query' || routeIntent === 'identity_self')
    && speechAct === 'answer'
    && !validClaims.some((claim) => {
      const subject = normalizeOptionalString(claim.subject)?.toLowerCase() ?? '';
      const normalizedSelfEntityId = normalizeOptionalString(selfEntityId)?.toLowerCase();
      const normalizedNpcId = normalizeOptionalString(npcId)?.toLowerCase();
      return subject === 'npc'
        || (normalizedSelfEntityId && subject === normalizedSelfEntityId)
        || (normalizedNpcId && subject === normalizedNpcId);
    })
  ) {
    speechAct = 'uncertain';
    errors.push('self query plan lacks self-attributed claim');
  }

  if (speechAct === 'uncertain' || speechAct === 'ask' || speechAct === 'close') {
    if (validClaims.length > 0) {
      errors.push(`claims removed for speechAct=${speechAct}`);
    }
    validClaims.length = 0;
  }

  const questionBack = speechAct === 'ask'
    ? (normalizeOptionalString(normalizedPlan.questionBack)
      ?? buildClarificationQuestion({ queryType, routeIntent }))
    : speechAct === 'close'
      ? (normalizeOptionalString(normalizedPlan.questionBack) ?? null)
      : null;

  const repairedPlan = {
    ...normalizedPlan,
    speechAct,
    questionBack,
    initiativeDecision,
    primaryGoal: initiativeDecision.primaryGoal,
    secondaryGoals: initiativeDecision.secondaryGoals,
    expectedPlayerResponseType: initiativeDecision.expectedPlayerResponseType,
    claims: validClaims,
    abstention: speechAct === 'uncertain' || speechAct === 'close'
      ? (isRecord(normalizedPlan.abstention)
        ? normalizedPlan.abstention
        : {
          reason: speechAct === 'close'
            ? 'initiative_close'
            : 'insufficient_grounded_claims',
          confidence: speechAct === 'close' ? 0.95 : 0.9,
        })
      : normalizedPlan.abstention ?? null,
  };

  return {
    valid: errors.length === 0,
    errors,
    repairedPlan,
    droppedClaims,
    validClaims,
  };
}

export function normalizeTopicCoverageContext(topicCoverage, playerMessage, options = {}) {
  const playerTopics = extractConversationTopics(playerMessage);
  if (!isRecord(topicCoverage)) {
    return {
      playerTopics,
      activeTopic: playerTopics[0] ?? null,
      activeTopicNovelty: undefined,
      exhaustedTopics: [],
      trackedTopicCount: undefined,
      topicExhausted: false,
    };
  }

  const activeTopic = normalizeTopicToken(String(topicCoverage.activeTopic ?? '')) || (playerTopics[0] ?? null);
  const activeTopicNovelty = typeof topicCoverage.activeTopicNovelty === 'number'
    && Number.isFinite(topicCoverage.activeTopicNovelty)
    ? Number(Math.max(0, Math.min(1, topicCoverage.activeTopicNovelty)).toFixed(4))
    : undefined;
  const exhaustedTopics = Array.isArray(topicCoverage.exhaustedTopics)
    ? topicCoverage.exhaustedTopics
      .map((entry) => normalizeTopicToken(String(entry ?? '')))
      .filter((entry) => entry.length > 0)
      .slice(-8)
    : [];
  const trackedTopicCount = typeof topicCoverage.trackedTopicCount === 'number'
    && Number.isFinite(topicCoverage.trackedTopicCount)
    ? Math.max(0, Math.floor(topicCoverage.trackedTopicCount))
    : undefined;

  const activeTopicIsExhausted = activeTopic
    ? exhaustedTopics.includes(activeTopic)
    : false;
  const maxNovelty = typeof options.maxNovelty === 'number'
    ? options.maxNovelty
    : TOPIC_EXHAUSTION_MAX_NOVELTY;
  const exhaustedByNovelty = activeTopicNovelty !== undefined
    ? activeTopicNovelty <= maxNovelty
    : false;
  const explicitExhausted = topicCoverage.exhausted === true;

  return {
    playerTopics,
    activeTopic,
    activeTopicNovelty,
    exhaustedTopics,
    trackedTopicCount,
    topicExhausted: explicitExhausted || activeTopicIsExhausted || exhaustedByNovelty,
  };
}

export function computeNoveltyState({
  history,
  turnIndexWithNpc,
  routingIntent,
  topicCoverage,
  playerMessage,
  normalizeForEchoCheck,
  maxNovelty,
}) {
  const initiativeHistory = summarizeInitiativeHistory(history, normalizeForEchoCheck);
  const turnPressure = typeof turnIndexWithNpc === 'number' && Number.isFinite(turnIndexWithNpc)
    ? turnIndexWithNpc >= 8
    : false;
  const topicState = normalizeTopicCoverageContext(topicCoverage, playerMessage, { maxNovelty });
  const exhausted = (routingIntent === 'social_chat' || routingIntent === 'unclear')
    && (initiativeHistory.repeatedNpcReplyRisk || turnPressure || topicState.topicExhausted);
  return {
    turnPressure,
    repeatedNpcReplyRisk: initiativeHistory.repeatedNpcReplyRisk,
    activeTopic: topicState.activeTopic,
    activeTopicNovelty: topicState.activeTopicNovelty,
    exhaustedTopics: topicState.exhaustedTopics,
    trackedTopicCount: topicState.trackedTopicCount,
    playerTopics: topicState.playerTopics,
    topicExhausted: topicState.topicExhausted,
    exhausted,
    initiativeHistory,
  };
}

export function createEvidenceFirstTurnPlan({
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
  pipelineVersion = 'v2',
}) {
  const defaultPrimaryGoal = (mode === 'narrative' || mode === 'hybrid')
    ? 'beat_goal'
    : 'character_goal';
  const initiativeDecision = createNormalizedInitiativeDecision(
    initiativePolicy?.decision,
    defaultPrimaryGoal,
    beatContract,
  );
  const plan = {
    schemaVersion: 1,
    pipelineVersion,
    mode,
    routeIntent: routing?.intent ?? 'unclear',
    policyPath: routing?.policyPath ?? 'safe_chat',
    queryType,
    initiativeDecision,
    primaryGoal: initiativeDecision.primaryGoal,
    secondaryGoals: initiativeDecision.secondaryGoals,
    expectedPlayerResponseType: initiativeDecision.expectedPlayerResponseType,
    goalStack: Array.isArray(initiativePolicy?.goalStack) ? initiativePolicy.goalStack : [],
    speechAct: 'chat',
    claims: [],
    questionBack: null,
    memoryWrite: extractSalientFacts(playerMessage).map((fact) => ({
      type: 'player_fact',
      ownerType: 'player',
      text: normalizeFact(fact),
    })),
    abstention: null,
  };

  const ranked = pickEvidenceForIntent(
    evidencePack,
    playerMessage,
    plan.routeIntent,
    queryType,
    selfEntityId,
    npcId,
  );

  if (initiativeDecision.action === 'close') {
    const topicCoverageInput = isRecord(initiativePolicy?.inputs?.topicCoverage)
      ? initiativePolicy.inputs.topicCoverage
      : null;
    const closeTopic = normalizeOptionalString(topicCoverageInput?.activeTopic);
    plan.speechAct = 'close';
    plan.questionBack = closeTopic
      ? `I think we have covered ${closeTopic} for now. Goodbye for now, and we can pick this up again later.`
      : 'I think that is enough for now. Goodbye for now, and we can pick this up again later.';
    plan.abstention = {
      reason: 'initiative_close',
      confidence: 0.96,
    };
    return {
      plan,
      plannerMeta: {
        selectedEvidence: [],
        rankedEvidence: ranked.slice(0, 5),
      },
    };
  }

  if (initiativeDecision.action === 'abstain') {
    plan.speechAct = 'uncertain';
    plan.abstention = {
      reason: 'initiative_abstain',
      confidence: 0.94,
    };
    return {
      plan,
      plannerMeta: {
        selectedEvidence: ranked.slice(0, 1),
        rankedEvidence: ranked.slice(0, 5),
      },
    };
  }

  if (initiativeDecision.action === 'clarify') {
    plan.speechAct = 'ask';
    plan.questionBack = buildClarificationQuestion({
      queryType,
      routeIntent: plan.routeIntent,
    });
    return {
      plan,
      plannerMeta: {
        selectedEvidence: ranked.slice(0, 1),
        rankedEvidence: ranked.slice(0, 5),
      },
    };
  }

  if (plan.routeIntent === 'social_chat') {
    if (initiativeDecision.action === 'npc_initiate') {
      plan.speechAct = 'ask';
      plan.questionBack = buildProactiveQuestion({
        mode,
        beatContract,
      });
    } else {
      plan.speechAct = 'chat';
    }
    return {
      plan,
      plannerMeta: {
        selectedEvidence: [],
        rankedEvidence: ranked.slice(0, 5),
      },
    };
  }

  if (plan.routeIntent === 'session_recall') {
    const selected = ranked.slice(0, 3);
    if (selected.length === 0) {
      plan.speechAct = 'uncertain';
      plan.abstention = {
        reason: 'no_memory_records',
        confidence: 0.98,
      };
      return {
        plan,
        plannerMeta: {
          selectedEvidence: [],
          rankedEvidence: [],
        },
      };
    }
    plan.speechAct = initiativeDecision.action === 'npc_initiate' ? 'ask' : 'recall';
    if (plan.speechAct === 'ask') {
      plan.questionBack = 'What detail should I remember first about you?';
      return {
        plan,
        plannerMeta: {
          selectedEvidence: selected,
          rankedEvidence: ranked.slice(0, 5),
        },
      };
    }
    let claimIndex = 0;
    for (const candidate of selected) {
      const recallText = toRecallClaimText(candidate.item.text);
      if (!recallText) continue;
      claimIndex += 1;
      plan.claims.push({
        claimId: `c_${claimIndex}`,
        subject: 'player',
        ownerType: 'player',
        text: recallText,
        evidenceIds: [candidate.item.evidenceId],
        confidence: candidate.score,
      });
    }
    if (plan.claims.length === 0) {
      plan.speechAct = 'uncertain';
      plan.abstention = {
        reason: 'no_memory_records',
        confidence: 0.98,
      };
    }
    return {
      plan,
      plannerMeta: {
        selectedEvidence: selected,
        rankedEvidence: ranked.slice(0, 5),
      },
    };
  }

  if (
    plan.routeIntent === 'identity_self'
    || plan.routeIntent === 'lore_world'
    || plan.routeIntent === 'lore_other'
    || plan.routeIntent === 'mixed_knowledge'
    || queryType === 'self_query'
    || queryType === 'other_query'
    || queryType === 'world_query'
    || queryType === 'mixed_query'
  ) {
    const selected = selectKnowledgeEvidence(ranked, 2);
    if (selected.length === 0) {
      plan.speechAct = 'uncertain';
      plan.abstention = {
        reason: 'no_grounded_evidence',
        confidence: 0.9,
      };
      return {
        plan,
        plannerMeta: {
          selectedEvidence: [],
          rankedEvidence: [],
        },
      };
    }

    plan.speechAct = 'answer';
    let claimIndex = 0;
    for (const candidate of selected) {
      const claimUnits = splitEvidenceIntoClaims(candidate.item.text, 1, playerMessage);
      for (const claimText of claimUnits) {
        claimIndex += 1;
        const subject = candidate.item.ownerType === 'player'
          ? 'player'
          : candidate.item.ownerType === 'npc'
            ? (normalizeOptionalString(selfEntityId) ?? normalizeOptionalString(npcId) ?? normalizeOptionalString(npcName) ?? 'npc')
            : 'world';
        plan.claims.push({
          claimId: `c_${claimIndex}`,
          subject,
          ownerType: candidate.item.ownerType,
          text: claimText,
          evidenceIds: [candidate.item.evidenceId],
          confidence: candidate.score,
        });
      }
    }

    if (plan.claims.length === 0) {
      plan.speechAct = 'uncertain';
      plan.abstention = {
        reason: 'no_grounded_claims',
        confidence: 0.82,
      };
    }
    return {
      plan,
      plannerMeta: {
        selectedEvidence: selected,
        rankedEvidence: ranked.slice(0, 5),
      },
    };
  }

  plan.speechAct = 'chat';
  return {
    plan,
    plannerMeta: {
      selectedEvidence: ranked.slice(0, 1),
      rankedEvidence: ranked.slice(0, 5),
    },
  };
}
