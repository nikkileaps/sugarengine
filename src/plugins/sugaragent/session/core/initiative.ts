import {
  isKnowledgeSeekingQueryType,
  type QueryType,
  type RoutingIntent,
} from './routing';
import type { QueryInterpretation } from './turn-contracts';

export type InitiativeAction = 'npc_initiate' | 'player_respond' | 'clarify' | 'abstain' | 'close';
export type GoalType = 'beat_goal' | 'character_goal' | 'social_goal' | 'repair_goal' | 'closure_goal';
export type ExpectedPlayerResponseType = 'free_text' | 'ack' | 'choice' | 'action';
export type ConversationMode = 'character' | 'narrative' | 'hybrid';
export type InitiativeRoutingIntent = RoutingIntent | 'unclear';

interface RecordLike {
  [key: string]: unknown;
}

interface InitiativeHistorySummary {
  recentNpcQuestionCount: number;
  recentNpcReplyCount: number;
  repeatedNpcReplyRisk: boolean;
}

interface NoveltyState {
  turnPressure: boolean;
  repeatedNpcReplyRisk: boolean;
  activeTopic: string | null;
  activeTopicNovelty: number | undefined;
  exhaustedTopics: string[];
  trackedTopicCount: number | undefined;
  playerTopics: string[];
  topicExhausted: boolean;
  exhausted: boolean;
  initiativeHistory: InitiativeHistorySummary;
}

interface GoalCandidate {
  goalType: GoalType;
  priority: number;
  reason: string;
}

interface ResolveInitiativePolicyInput {
  mode: unknown;
  routingIntent: unknown;
  queryType: unknown;
  interpretation?: QueryInterpretation | null;
  playerMessage: unknown;
  playerHasQuestion: boolean;
  turnIndexWithNpc: unknown;
  noveltyState: NoveltyState;
  beatContract: unknown;
  hasEvidence: boolean;
  hasDirectAnswerEvidence?: boolean;
  retrievalConfidence: number;
  isFirstMeeting: boolean;
  isLikelyGreetingOnlyMessage?: (playerMessage: unknown) => boolean;
}

const INITIATIVE_ACTIONS = new Set<InitiativeAction>([
  'npc_initiate',
  'player_respond',
  'clarify',
  'abstain',
  'close',
]);

const GOAL_TYPES = new Set<GoalType>([
  'beat_goal',
  'character_goal',
  'social_goal',
  'repair_goal',
  'closure_goal',
]);

const EXPECTED_RESPONSE_TYPES = new Set<ExpectedPlayerResponseType>([
  'free_text',
  'ack',
  'choice',
  'action',
]);

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeMode(value: unknown): ConversationMode {
  return value === 'narrative' || value === 'hybrid' ? value : 'character';
}

function normalizeRoutingIntent(value: unknown): InitiativeRoutingIntent {
  if (
    value === 'social_chat'
    || value === 'session_recall'
    || value === 'identity_self'
    || value === 'lore_world'
    || value === 'lore_other'
    || value === 'mixed_knowledge'
    || value === 'unclear'
  ) {
    return value;
  }
  return 'unclear';
}

function normalizeQueryType(value: unknown): QueryType {
  if (
    value === 'conversation'
    || value === 'self_query'
    || value === 'other_query'
    || value === 'world_query'
    || value === 'mixed_query'
  ) {
    return value;
  }
  return 'conversation';
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeTurnIndexWithNpc(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(1, Math.floor(value));
}

function normalizeNoveltyState(value: unknown): NoveltyState {
  const fallbackHistory: InitiativeHistorySummary = {
    recentNpcQuestionCount: 0,
    recentNpcReplyCount: 0,
    repeatedNpcReplyRisk: false,
  };
  if (!isRecord(value)) {
    return {
      turnPressure: false,
      repeatedNpcReplyRisk: false,
      activeTopic: null,
      activeTopicNovelty: undefined,
      exhaustedTopics: [],
      trackedTopicCount: undefined,
      playerTopics: [],
      topicExhausted: false,
      exhausted: false,
      initiativeHistory: fallbackHistory,
    };
  }
  const history = isRecord(value.initiativeHistory)
    ? {
      recentNpcQuestionCount: Math.max(0, Math.floor(normalizeFiniteNumber(value.initiativeHistory.recentNpcQuestionCount))),
      recentNpcReplyCount: Math.max(0, Math.floor(normalizeFiniteNumber(value.initiativeHistory.recentNpcReplyCount))),
      repeatedNpcReplyRisk: normalizeBoolean(value.initiativeHistory.repeatedNpcReplyRisk),
    }
    : fallbackHistory;
  const activeTopic = normalizeOptionalString(value.activeTopic) ?? null;
  const activeTopicNovelty = typeof value.activeTopicNovelty === 'number' && Number.isFinite(value.activeTopicNovelty)
    ? value.activeTopicNovelty
    : undefined;
  const exhaustedTopics = Array.isArray(value.exhaustedTopics)
    ? value.exhaustedTopics.filter((entry): entry is string => typeof entry === 'string').slice(0, 8)
    : [];
  const trackedTopicCount = typeof value.trackedTopicCount === 'number' && Number.isFinite(value.trackedTopicCount)
    ? Math.max(0, Math.floor(value.trackedTopicCount))
    : undefined;
  const playerTopics = Array.isArray(value.playerTopics)
    ? value.playerTopics.filter((entry): entry is string => typeof entry === 'string').slice(0, 8)
    : [];

  return {
    turnPressure: normalizeBoolean(value.turnPressure),
    repeatedNpcReplyRisk: normalizeBoolean(value.repeatedNpcReplyRisk),
    activeTopic,
    activeTopicNovelty,
    exhaustedTopics,
    trackedTopicCount,
    playerTopics,
    topicExhausted: normalizeBoolean(value.topicExhausted),
    exhausted: normalizeBoolean(value.exhausted),
    initiativeHistory: history,
  };
}

export function normalizeGoalType(value: unknown, fallback: GoalType = 'character_goal'): GoalType {
  const normalized = normalizeOptionalString(value)?.toLowerCase() as GoalType | undefined;
  return normalized && GOAL_TYPES.has(normalized) ? normalized : fallback;
}

export function normalizeInitiativeAction(value: unknown, fallback: InitiativeAction = 'player_respond'): InitiativeAction {
  const normalized = normalizeOptionalString(value)?.toLowerCase() as InitiativeAction | undefined;
  return normalized && INITIATIVE_ACTIONS.has(normalized) ? normalized : fallback;
}

export function normalizeExpectedPlayerResponseType(
  value: unknown,
  fallback: ExpectedPlayerResponseType = 'free_text',
): ExpectedPlayerResponseType {
  const normalized = normalizeOptionalString(value)?.toLowerCase() as ExpectedPlayerResponseType | undefined;
  return normalized && EXPECTED_RESPONSE_TYPES.has(normalized) ? normalized : fallback;
}

export function summarizeInitiativeHistory(
  history: unknown,
  normalizeForEchoCheck: (text: string) => string,
): InitiativeHistorySummary {
  const recentNpcReplies = (Array.isArray(history) ? history : [])
    .filter((entry) => isRecord(entry) && entry.role === 'npc' && typeof entry.text === 'string')
    .slice(-4)
    .map((entry) => normalizeForEchoCheck(String(entry.text ?? '')))
    .filter(Boolean);
  const recentNpcQuestionCount = recentNpcReplies.reduce((count, text) => {
    return /\?$/.test(text) || /\b(what|where|when|why|how|who|which)\b/.test(text)
      ? count + 1
      : count;
  }, 0);
  return {
    recentNpcQuestionCount,
    recentNpcReplyCount: recentNpcReplies.length,
    repeatedNpcReplyRisk: recentNpcReplies.length >= 3 && new Set(recentNpcReplies).size <= 2,
  };
}

function buildGoalCandidates(input: {
  mode: ConversationMode;
  routingIntent: InitiativeRoutingIntent;
  queryType: QueryType;
  interpretation?: QueryInterpretation | null;
  hasBeatContract: boolean;
  beatTurnPressure: boolean;
  retrievalConfidence: number;
  hasEvidence: boolean;
  playerHasQuestion: boolean;
  noveltyState: NoveltyState;
}): GoalCandidate[] {
  const goals: GoalCandidate[] = [];
  const interpretation = input.interpretation ?? null;
  if (input.hasBeatContract && (input.mode === 'narrative' || input.mode === 'hybrid')) {
    goals.push({
      goalType: 'beat_goal',
      priority: input.beatTurnPressure ? 0.97 : 0.92,
      reason: input.beatTurnPressure ? 'active-beat-turn-pressure' : 'active-beat-context',
    });
  }

  if (input.routingIntent === 'social_chat' || interpretation?.lane === 'social') {
    goals.push({
      goalType: 'social_goal',
      priority: input.noveltyState.exhausted ? 0.42 : 0.78,
      reason: input.noveltyState.exhausted ? 'social-novelty-exhausted' : 'social-turn',
    });
  }

  if (
    input.routingIntent === 'session_recall'
    || interpretation?.lane === 'memory'
    || isKnowledgeSeekingQueryType(input.queryType)
    || interpretation?.lane === 'knowledge'
  ) {
    goals.push({
      goalType: 'character_goal',
      priority: input.routingIntent === 'session_recall' ? 0.82 : 0.74,
      reason: input.routingIntent === 'session_recall' ? 'session-memory-continuity' : 'knowledge-response',
    });
  }

  if (
    (input.routingIntent === 'unclear' && interpretation?.lane !== 'social')
    || ((isKnowledgeSeekingQueryType(input.queryType) || interpretation?.lane === 'knowledge') && !input.hasEvidence)
    || (input.playerHasQuestion && input.retrievalConfidence < 0.2)
  ) {
    goals.push({
      goalType: 'repair_goal',
      priority: 0.9,
      reason: !input.hasEvidence ? 'insufficient-evidence' : 'clarify-player-intent',
    });
  }

  if (input.noveltyState.exhausted) {
    goals.push({
      goalType: 'closure_goal',
      priority: 0.94,
      reason: 'novelty-exhaustion',
    });
  }

  return goals
    .sort((a, b) => b.priority - a.priority)
    .map((entry) => ({
      goalType: normalizeGoalType(entry.goalType, 'character_goal'),
      priority: Number(entry.priority.toFixed(4)),
      reason: normalizeOptionalString(entry.reason) ?? 'unspecified',
    }));
}

function expectedResponseTypeForAction(action: InitiativeAction, beatContract: unknown): ExpectedPlayerResponseType {
  if (action === 'close') return 'ack';
  if (action === 'clarify') return 'free_text';
  if (action === 'abstain') return 'free_text';
  if (action === 'npc_initiate' && isRecord(beatContract)) {
    if (beatContract.completionRule === 'player_ack') return 'ack';
    if (beatContract.completionRule === 'player_action') return 'action';
    if (beatContract.completionRule === 'engine_flag') return 'choice';
  }
  return 'free_text';
}

export function resolveInitiativePolicy(input: ResolveInitiativePolicyInput): {
  decision: {
    initiator: 'npc' | 'player' | 'system';
    action: InitiativeAction;
    primaryGoal: GoalType;
    secondaryGoals: GoalType[];
    expectedPlayerResponseType: ExpectedPlayerResponseType;
    reason: string;
    policyBounded: boolean;
  };
  goalStack: GoalCandidate[];
  inputs: {
    mode: ConversationMode;
    routingIntent: InitiativeRoutingIntent;
    queryType: QueryType;
    playerHasQuestion: boolean;
    retrievalConfidence: number;
    hasEvidence: boolean;
    beatTurnPressure: boolean;
    isFirstMeeting: boolean;
    turnIndexWithNpc: number | null;
    recentNpcQuestionCount: number;
    repeatedNpcReplyRisk: boolean;
    noveltyExhausted: boolean;
    interpretation: {
      lane: QueryInterpretation['lane'];
      target: QueryInterpretation['target'];
      facet: QueryInterpretation['facet'];
      timeframe: QueryInterpretation['timeframe'];
      confidence: number;
      margin: number;
      ambiguous: boolean;
    } | null;
    topicCoverage: {
      activeTopic: string | null;
      activeTopicNovelty: number | null;
      exhaustedTopics: string[];
      trackedTopicCount: number | null;
      topicExhausted: boolean;
    };
  };
  bounds: {
    proactiveLoopGuardTriggered: boolean;
    unresolvedQuestionGuardTriggered: boolean;
  };
} {
  const mode = normalizeMode(input.mode);
  const routingIntent = normalizeRoutingIntent(input.routingIntent);
  const queryType = normalizeQueryType(input.queryType);
  const interpretation = input.interpretation ?? null;
  const playerHasQuestion = normalizeBoolean(input.playerHasQuestion);
  const turnIndexWithNpc = normalizeTurnIndexWithNpc(input.turnIndexWithNpc);
  const noveltyState = normalizeNoveltyState(input.noveltyState);
  const retrievalConfidence = normalizeFiniteNumber(input.retrievalConfidence);

  const beatTurnPressure = Boolean(
    input.beatContract
    && typeof turnIndexWithNpc === 'number'
    && isRecord(input.beatContract)
    && typeof input.beatContract.maxTurns === 'number'
    && Number.isFinite(input.beatContract.maxTurns)
    && input.beatContract.maxTurns > 0
    && turnIndexWithNpc >= Math.max(1, input.beatContract.maxTurns - 1),
  );

  const goalStack = buildGoalCandidates({
    mode,
    routingIntent,
    queryType,
    interpretation,
    hasBeatContract: Boolean(input.beatContract),
    beatTurnPressure,
    retrievalConfidence,
    hasEvidence: normalizeBoolean(input.hasEvidence),
    playerHasQuestion,
    noveltyState,
  });

  const primaryGoal = normalizeGoalType(
    goalStack[0]?.goalType,
    mode === 'narrative' || mode === 'hybrid' ? 'beat_goal' : 'character_goal',
  );
  const secondaryGoals = goalStack
    .slice(1, 3)
    .map((entry) => normalizeGoalType(entry.goalType, 'character_goal'))
    .filter((value, index, source) => source.indexOf(value) === index);

  let action: InitiativeAction = 'player_respond';
  let initiator: 'npc' | 'player' | 'system' = 'player';
  let reason = 'default-player-response';

  if (noveltyState.exhausted && !playerHasQuestion && (mode === 'character' || routingIntent === 'social_chat' || routingIntent === 'unclear')) {
    action = 'close';
    initiator = 'npc';
    reason = noveltyState.topicExhausted ? 'topic-novelty-exhaustion-close' : 'novelty-exhaustion-close';
  } else if ((routingIntent === 'session_recall' || interpretation?.lane === 'memory') && !input.hasEvidence) {
    action = 'abstain';
    initiator = 'npc';
    reason = 'session-recall-missing-evidence';
  } else if ((isKnowledgeSeekingQueryType(queryType) || interpretation?.lane === 'knowledge') && !input.hasEvidence) {
    action = 'abstain';
    initiator = 'npc';
    reason = 'knowledge-turn-missing-evidence';
  } else if (
    (
      ((routingIntent === 'unclear' || interpretation?.ambiguous === true) && playerHasQuestion && interpretation?.lane !== 'social')
      || (playerHasQuestion && retrievalConfidence < 0.2 && routingIntent !== 'session_recall')
    )
    && !normalizeBoolean(input.hasDirectAnswerEvidence)
  ) {
    action = 'clarify';
    initiator = 'npc';
    reason = 'ambiguous-or-low-confidence-intent';
  } else if (
    input.beatContract
    && (mode === 'narrative' || mode === 'hybrid')
    && typeof input.isLikelyGreetingOnlyMessage === 'function'
    && input.isLikelyGreetingOnlyMessage(input.playerMessage)
    && !playerHasQuestion
  ) {
    action = 'npc_initiate';
    initiator = 'npc';
    reason = 'beat-context-proactive-opener';
  }

  const proactiveLoopGuardTriggered = (
    action === 'npc_initiate'
    && noveltyState.initiativeHistory.recentNpcQuestionCount >= 2
  );
  if (proactiveLoopGuardTriggered) {
    action = 'player_respond';
    initiator = 'player';
    reason = `${reason};proactive-loop-guard`;
  }

  const unresolvedQuestionGuardTriggered = action === 'close'
    && playerHasQuestion;
  if (unresolvedQuestionGuardTriggered) {
    action = isKnowledgeSeekingQueryType(queryType) ? 'abstain' : 'clarify';
    initiator = 'npc';
    reason = `${reason};unresolved-question-guard`;
  }

  const normalizedAction = normalizeInitiativeAction(action, 'player_respond');
  const expectedPlayerResponseType = normalizeExpectedPlayerResponseType(
    expectedResponseTypeForAction(normalizedAction, input.beatContract),
    'free_text',
  );

  return {
    decision: {
      initiator,
      action: normalizedAction,
      primaryGoal,
      secondaryGoals,
      expectedPlayerResponseType,
      reason,
      policyBounded: proactiveLoopGuardTriggered || unresolvedQuestionGuardTriggered,
    },
    goalStack,
    inputs: {
      mode,
      routingIntent,
      queryType,
      playerHasQuestion,
      retrievalConfidence: Number(retrievalConfidence.toFixed(4)),
      hasEvidence: normalizeBoolean(input.hasEvidence),
      beatTurnPressure,
      isFirstMeeting: normalizeBoolean(input.isFirstMeeting),
      turnIndexWithNpc: turnIndexWithNpc ?? null,
      recentNpcQuestionCount: noveltyState.initiativeHistory.recentNpcQuestionCount,
      repeatedNpcReplyRisk: noveltyState.repeatedNpcReplyRisk,
      noveltyExhausted: noveltyState.exhausted,
      interpretation: interpretation
        ? {
            lane: interpretation.lane,
            target: interpretation.target,
            facet: interpretation.facet,
            timeframe: interpretation.timeframe,
            confidence: Number(interpretation.confidence.toFixed(4)),
            margin: Number(interpretation.margin.toFixed(4)),
            ambiguous: interpretation.ambiguous,
          }
        : null,
      topicCoverage: {
        activeTopic: noveltyState.activeTopic ?? null,
        activeTopicNovelty: typeof noveltyState.activeTopicNovelty === 'number'
          ? Number(noveltyState.activeTopicNovelty.toFixed(4))
          : null,
        exhaustedTopics: Array.isArray(noveltyState.exhaustedTopics)
          ? noveltyState.exhaustedTopics.slice(0, 6)
          : [],
        trackedTopicCount: typeof noveltyState.trackedTopicCount === 'number'
          ? noveltyState.trackedTopicCount
          : null,
        topicExhausted: noveltyState.topicExhausted === true,
      },
    },
    bounds: {
      proactiveLoopGuardTriggered,
      unresolvedQuestionGuardTriggered,
    },
  };
}

export function buildClarificationQuestion({ queryType, routeIntent }: { queryType: unknown; routeIntent: unknown }): string {
  const normalizedQueryType = normalizeQueryType(queryType);
  const normalizedRouteIntent = normalizeRoutingIntent(routeIntent);
  if (normalizedRouteIntent === 'session_recall') {
    return 'Do you want me to recall what you have told me before, or help with something new?';
  }
  if (normalizedQueryType === 'self_query') {
    return 'Do you want to know about me, like my role or background?';
  }
  if (normalizedQueryType === 'other_query') {
    return 'Who are you asking about specifically?';
  }
  if (normalizedQueryType === 'world_query' || normalizedQueryType === 'mixed_query') {
    return 'Could you narrow that down to one place, person, or event?';
  }
  return 'Could you clarify what you want to know?';
}

export function buildProactiveQuestion({ mode, beatContract }: { mode: unknown; beatContract: unknown }): string {
  const normalizedMode = normalizeMode(mode);
  if ((normalizedMode === 'narrative' || normalizedMode === 'hybrid') && isRecord(beatContract)) {
    const objective = normalizeOptionalString(beatContract.objective);
    if (objective) {
      return `${objective} Does that make sense so far?`;
    }
    if (beatContract.completionRule === 'player_action') {
      return 'Want to try that next step now?';
    }
    return 'Would you like the key details now?';
  }
  return 'What would you like to talk about next?';
}

export function createNormalizedInitiativeDecision(
  value: unknown,
  fallbackPrimaryGoal: GoalType = 'character_goal',
  beatContract: unknown = null,
): {
  initiator: 'npc' | 'player' | 'system';
  action: InitiativeAction;
  primaryGoal: GoalType;
  secondaryGoals: GoalType[];
  expectedPlayerResponseType: ExpectedPlayerResponseType;
  reason: string;
  policyBounded: boolean;
} {
  const source = isRecord(value) ? value : {};
  const action = normalizeInitiativeAction(source.action, 'player_respond');
  const primaryGoal = normalizeGoalType(source.primaryGoal, fallbackPrimaryGoal);
  const secondaryGoals = Array.isArray(source.secondaryGoals)
    ? source.secondaryGoals
      .map((entry) => normalizeGoalType(entry, 'character_goal'))
      .filter((entry, index, arr) => arr.indexOf(entry) === index)
      .slice(0, 3)
    : [];
  return {
    initiator: source.initiator === 'npc' || source.initiator === 'system' ? source.initiator : 'player',
    action,
    primaryGoal,
    secondaryGoals,
    expectedPlayerResponseType: normalizeExpectedPlayerResponseType(
      source.expectedPlayerResponseType,
      expectedResponseTypeForAction(action, beatContract),
    ),
    reason: normalizeOptionalString(source.reason) ?? 'initiative-policy',
    policyBounded: source.policyBounded === true,
  };
}
