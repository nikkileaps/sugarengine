import {
  PLUGIN_API_VERSION,
} from '../../engine/plugins';
import type {
  EnginePlugin,
  InteractionRequest,
  PluginAgentBeatContract,
  PluginAgentBeatEvidence,
  PluginAgentTurnRequest,
  PluginAgentTurnResult,
  PluginEvent,
} from '../../engine/plugins';
import { LocalLLMProvider } from './providers/llm/LocalLLMProvider';
import type { LocalRuntimeBridge } from './runtime';
import { HttpLocalRuntimeBridge } from './runtime';

export interface SugarAgentPluginOptions {
  /**
   * Override plugin id for local experiments.
   * Default keeps save namespace stable as "sugaragent".
   */
  id?: string;
  /**
   * Collects lightweight event counters for phase-0 smoke checks.
   */
  captureEvents?: boolean;
  /**
   * Optional runtime bridge override for local-LLM turn generation.
   * If omitted, browser runtime defaults to HttpLocalRuntimeBridge.
   */
  runtimeBridge?: LocalRuntimeBridge;
  /**
   * Disable provider-backed generation and force deterministic turns.
   */
  disableProvider?: boolean;
}

export interface SugarAgentPlayerModelV1 {
  targetLanguage?: string;
  estimatedLevel?: string;
  confidence?: number;
}

export interface SugarAgentRelationshipStateV1 {
  affinity: number;
  trust: number;
  respect: number;
  tension: number;
  lastUpdated: number;
}

export interface SugarAgentEpisodicMemoryRecordV1 {
  id: string;
  timestamp: number;
  type: string;
  summary: string;
  salience: number;
  tags?: string[];
}

export interface SugarAgentSemanticBeliefRecordV1 {
  id: string;
  updatedAt: number;
  belief: string;
  confidence: number;
  source?: string;
}

export interface SugarAgentConversationSummaryV1 {
  id: string;
  timestamp: number;
  summary: string;
  salience: number;
}

export interface SugarAgentNPCMemoryStateV1 {
  relationship: SugarAgentRelationshipStateV1;
  episodic: SugarAgentEpisodicMemoryRecordV1[];
  semantic: SugarAgentSemanticBeliefRecordV1[];
  conversationSummaries: SugarAgentConversationSummaryV1[];
}

export interface SugarAgentDialogueSessionStateV1 {
  npcId: string;
  activeBeatId?: string;
  questId?: string;
  objectiveId?: string;
  coveredFacts?: string[];
  uncoveredFacts?: string[];
  turnCount: number;
  updatedAt: number;
}

export interface SugarAgentPluginStateV1 {
  schemaVersion: 1;
  updatedAt: number;
  playerModel: SugarAgentPlayerModelV1;
  npcs: Record<string, SugarAgentNPCMemoryStateV1>;
  dialogueSessions?: Record<string, SugarAgentDialogueSessionStateV1>;
}

export interface SugarAgentPluginStateV0 {
  schemaVersion: 0;
  seenEvents: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toSafeCounter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function toSafeTimestamp(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function toSafeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toSafeNumber(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const DEFAULT_NPC_KEY = 'system';
const MAX_EPISODIC_PER_NPC = 48;
const MAX_SUMMARIES_PER_NPC = 24;
const MAX_SEMANTIC_PER_NPC = 24;
const MAX_DIALOGUE_SESSIONS = 24;

function createRelationship(now: number): SugarAgentRelationshipStateV1 {
  return {
    affinity: 0,
    trust: 0,
    respect: 0,
    tension: 0,
    lastUpdated: now,
  };
}

function createNpcMemory(now: number): SugarAgentNPCMemoryStateV1 {
  return {
    relationship: createRelationship(now),
    episodic: [],
    semantic: [],
    conversationSummaries: [],
  };
}

function createDefaultState(now: number): SugarAgentPluginStateV1 {
  return {
    schemaVersion: 1,
    updatedAt: now,
    playerModel: {},
    npcs: {},
    dialogueSessions: {},
  };
}

function ensureNpcMemory(state: SugarAgentPluginStateV1, npcId: string, now: number): SugarAgentNPCMemoryStateV1 {
  if (!state.npcs[npcId]) {
    state.npcs[npcId] = createNpcMemory(now);
  }
  return state.npcs[npcId]!;
}

function ensureDialogueSessions(state: SugarAgentPluginStateV1): Record<string, SugarAgentDialogueSessionStateV1> {
  if (!state.dialogueSessions) {
    state.dialogueSessions = {};
  }
  return state.dialogueSessions;
}

function capByRecent<T extends { timestamp?: number; updatedAt?: number }>(entries: T[], maxItems: number): T[] {
  if (entries.length <= maxItems) return entries;
  return entries
    .slice()
    .sort((a, b) => {
      const aTime = a.timestamp ?? a.updatedAt ?? 0;
      const bTime = b.timestamp ?? b.updatedAt ?? 0;
      return aTime - bTime;
    })
    .slice(-maxItems);
}

function clearDialogueSessions(
  sessions: Record<string, SugarAgentDialogueSessionStateV1>,
  matcher: (session: SugarAgentDialogueSessionStateV1) => boolean,
): void {
  for (const [key, session] of Object.entries(sessions)) {
    if (matcher(session)) {
      delete sessions[key];
    }
  }
}

function pushEpisodic(
  npc: SugarAgentNPCMemoryStateV1,
  type: string,
  summary: string,
  salience: number,
  now: number,
): void {
  npc.episodic.push({
    id: `${type}:${now}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    type,
    summary,
    salience: clamp(salience, 0, 1),
  });
  npc.episodic = capByRecent(npc.episodic, MAX_EPISODIC_PER_NPC);
}

function pushSummary(
  npc: SugarAgentNPCMemoryStateV1,
  summary: string,
  salience: number,
  now: number,
): void {
  npc.conversationSummaries.push({
    id: `summary:${now}:${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
    summary,
    salience: clamp(salience, 0, 1),
  });
  npc.conversationSummaries = capByRecent(npc.conversationSummaries, MAX_SUMMARIES_PER_NPC);
}

function upsertSemanticBelief(
  npc: SugarAgentNPCMemoryStateV1,
  belief: string,
  confidence: number,
  now: number,
  source: string,
): void {
  const normalizedBelief = belief.trim();
  if (!normalizedBelief) return;

  const existing = npc.semantic.find((entry) => entry.belief === normalizedBelief);
  if (existing) {
    existing.updatedAt = now;
    existing.confidence = Math.max(existing.confidence, clamp(confidence, 0, 1));
    existing.source = source;
  } else {
    npc.semantic.push({
      id: `belief:${now}:${Math.random().toString(36).slice(2, 8)}`,
      updatedAt: now,
      belief: normalizedBelief,
      confidence: clamp(confidence, 0, 1),
      source,
    });
  }
  npc.semantic = capByRecent(npc.semantic, MAX_SEMANTIC_PER_NPC);
}

function rememberPlayerFacts(npc: SugarAgentNPCMemoryStateV1, playerMessage: string, now: number): void {
  const text = playerMessage.trim();
  if (!text) return;

  const nameMatch = text.match(/my name is ([a-z\u00c0-\u024f' -]{2,40})/i);
  if (nameMatch?.[1]) {
    upsertSemanticBelief(
      npc,
      `Player name is ${nameMatch[1].trim()}.`,
      0.85,
      now,
      'player-message',
    );
  }

  const likesMatch = text.match(/i like ([^.!?]{2,80})/i);
  if (likesMatch?.[1]) {
    upsertSemanticBelief(
      npc,
      `Player likes ${likesMatch[1].trim()}.`,
      0.72,
      now,
      'player-message',
    );
  }

  const fromMatch = text.match(/i(?:'| a)m from ([^.!?]{2,80})/i);
  if (fromMatch?.[1]) {
    upsertSemanticBelief(
      npc,
      `Player is from ${fromMatch[1].trim()}.`,
      0.75,
      now,
      'player-message',
    );
  }
}

function recentBeliefs(npc: SugarAgentNPCMemoryStateV1, limit = 2): string[] {
  return npc.semantic
    .slice()
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(-limit)
    .map((entry) => entry.belief);
}

function buildDeterministicAgentTurn({
  npcName,
  playerMessage,
  npc,
}: {
  npcName?: string;
  playerMessage: string;
  npc: SugarAgentNPCMemoryStateV1;
}): PluginAgentTurnResult {
  const normalized = playerMessage.toLowerCase();
  const displayName = typeof npcName === 'string' && npcName.trim().length > 0 ? npcName.trim() : 'Friend';

  const isGreeting = /\b(hi|hello|hey|hola|buenas)\b/i.test(playerMessage);
  const isMemoryQuestion = /\b(remember|recall|what did i mention|what do you know about me)\b/i.test(normalized);

  if (isMemoryQuestion) {
    const beliefs = recentBeliefs(npc, 3);
    if (beliefs.length > 0) {
      return {
        utterance: `${beliefs.join(' ')}`,
        emotion: 'warm',
        intent: 'recall',
      };
    }
    return {
      utterance: `I do not remember much yet, but I am listening now.`,
      emotion: 'neutral',
      intent: 'recall',
    };
  }

  if (isGreeting) {
    const beliefs = recentBeliefs(npc, 1);
    if (beliefs.length > 0) {
      return {
        utterance: `Hello. I remember: ${beliefs[0]}`,
        emotion: 'warm',
        intent: 'greet',
      };
    }
    return {
      utterance: `Hello, I am ${displayName}. What is on your mind?`,
      emotion: 'warm',
      intent: 'greet',
    };
  }

  return {
    utterance: `I hear you. Tell me more about that.`,
    emotion: 'neutral',
    intent: 'conversation',
  };
}

function normalizeText(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3);
}

function factCoveredByUtterance(utterance: string, fact: string): boolean {
  const utteranceTokens = new Set(tokenize(utterance));
  const factTokens = tokenize(fact);
  if (factTokens.length === 0) return false;

  let matches = 0;
  for (const token of factTokens) {
    if (utteranceTokens.has(token)) {
      matches += 1;
    }
  }
  return matches / factTokens.length >= 0.6;
}

function detectCompletionSignal(
  contract: PluginAgentBeatContract,
  playerMessage: string,
): PluginAgentBeatEvidence['completionSignal'] {
  const normalized = normalizeText(playerMessage);

  switch (contract.completionRule) {
    case 'player_ack':
      return (
        normalized.includes('got it')
        || normalized.includes('understood')
        || normalized.includes('okay')
        || normalized.includes('ok')
        || normalized.includes('thanks')
        || normalized.includes('thank you')
      )
        ? 'player_ack'
        : 'none';
    case 'player_action':
      return (
        normalized.includes('i did it')
        || normalized.includes('done')
        || (typeof contract.completionTarget === 'string' && contract.completionTarget.length > 0 && normalized.includes(normalizeText(contract.completionTarget)))
      )
        ? 'player_action'
        : 'none';
    case 'engine_flag':
      return 'none';
    default:
      return 'none';
  }
}

function buildBeatEvidence({
  contract,
  utterance,
  playerMessage,
  priorCoveredFacts = [],
}: {
  contract: PluginAgentBeatContract;
  utterance: string;
  playerMessage: string;
  priorCoveredFacts?: string[];
}): PluginAgentBeatEvidence {
  const requiredFacts = Array.isArray(contract.requiredFacts)
    ? contract.requiredFacts.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const covered = new Set(
    Array.isArray(priorCoveredFacts)
      ? priorCoveredFacts.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      : [],
  );

  for (const fact of requiredFacts) {
    if (factCoveredByUtterance(utterance, fact)) {
      covered.add(fact);
    }
  }

  const coveredFacts = requiredFacts.filter((fact) => covered.has(fact));
  const uncoveredFacts = requiredFacts.filter((fact) => !covered.has(fact));
  const completionSignal = detectCompletionSignal(contract, playerMessage);
  const coverageRatio = requiredFacts.length > 0 ? coveredFacts.length / requiredFacts.length : 1;
  const confidence = clamp(
    0.2 + coverageRatio * 0.65 + (completionSignal !== 'none' ? 0.15 : 0),
    0,
    1,
  );

  return {
    beatId: contract.id,
    coveredFacts,
    uncoveredFacts,
    completionSignal,
    confidence,
  };
}

function enrichTurnWithBeatEvidence({
  turn,
  contract,
  playerMessage,
  priorCoveredFacts = [],
}: {
  turn: PluginAgentTurnResult;
  contract: PluginAgentBeatContract;
  playerMessage: string;
  priorCoveredFacts?: string[];
}): { turn: PluginAgentTurnResult; beatEvidence: PluginAgentBeatEvidence } {
  let beatEvidence = buildBeatEvidence({
    contract,
    utterance: turn.utterance,
    playerMessage,
    priorCoveredFacts,
  });

  if (beatEvidence.uncoveredFacts.length > 0) {
    const missingFacts = beatEvidence.uncoveredFacts.slice(0, 2).join(' ');
    const patchedUtterance = `${turn.utterance} ${missingFacts}`.trim();
    beatEvidence = buildBeatEvidence({
      contract,
      utterance: patchedUtterance,
      playerMessage,
      priorCoveredFacts,
    });
    return {
      turn: {
        ...turn,
        utterance: patchedUtterance,
        beatEvidence,
      },
      beatEvidence,
    };
  }

  return {
    turn: {
      ...turn,
      beatEvidence,
    },
    beatEvidence,
  };
}

function applyRelationshipDelta(
  relationship: SugarAgentRelationshipStateV1,
  delta: Partial<Pick<SugarAgentRelationshipStateV1, 'affinity' | 'trust' | 'respect' | 'tension'>>,
  now: number,
): void {
  relationship.affinity = clamp(relationship.affinity + (delta.affinity ?? 0), -100, 100);
  relationship.trust = clamp(relationship.trust + (delta.trust ?? 0), -100, 100);
  relationship.respect = clamp(relationship.respect + (delta.respect ?? 0), -100, 100);
  relationship.tension = clamp(relationship.tension + (delta.tension ?? 0), -100, 100);
  relationship.lastUpdated = now;
}

function compactState(state: SugarAgentPluginStateV1): void {
  const npcEntries = Object.entries(state.npcs);
  for (const [, npc] of npcEntries) {
    npc.episodic = capByRecent(npc.episodic, MAX_EPISODIC_PER_NPC);
    npc.conversationSummaries = capByRecent(npc.conversationSummaries, MAX_SUMMARIES_PER_NPC);
    npc.semantic = capByRecent(npc.semantic, MAX_SEMANTIC_PER_NPC);
  }

  if (!state.dialogueSessions) return;
  const sessions = Object.entries(state.dialogueSessions)
    .sort((a, b) => (a[1].updatedAt ?? 0) - (b[1].updatedAt ?? 0))
    .slice(-MAX_DIALOGUE_SESSIONS);
  state.dialogueSessions = Object.fromEntries(sessions);
}

function parseRelationship(raw: unknown, now: number): SugarAgentRelationshipStateV1 {
  if (!isRecord(raw)) return createRelationship(now);
  return {
    affinity: clamp(toSafeNumber(raw.affinity), -100, 100),
    trust: clamp(toSafeNumber(raw.trust), -100, 100),
    respect: clamp(toSafeNumber(raw.respect), -100, 100),
    tension: clamp(toSafeNumber(raw.tension), -100, 100),
    lastUpdated: toSafeTimestamp(raw.lastUpdated, now),
  };
}

function parseEpisodic(raw: unknown): SugarAgentEpisodicMemoryRecordV1 | null {
  if (!isRecord(raw)) return null;
  const id = toSafeString(raw.id);
  const type = toSafeString(raw.type);
  const summary = toSafeString(raw.summary);
  if (!id || !type || !summary) return null;
  return {
    id,
    type,
    summary,
    timestamp: toSafeTimestamp(raw.timestamp, 0),
    salience: clamp(toSafeNumber(raw.salience), 0, 1),
    tags: Array.isArray(raw.tags)
      ? raw.tags.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
  };
}

function parseSemantic(raw: unknown): SugarAgentSemanticBeliefRecordV1 | null {
  if (!isRecord(raw)) return null;
  const id = toSafeString(raw.id);
  const belief = toSafeString(raw.belief);
  if (!id || !belief) return null;
  return {
    id,
    belief,
    updatedAt: toSafeTimestamp(raw.updatedAt, 0),
    confidence: clamp(toSafeNumber(raw.confidence, 0.5), 0, 1),
    source: toSafeString(raw.source),
  };
}

function parseSummary(raw: unknown): SugarAgentConversationSummaryV1 | null {
  if (!isRecord(raw)) return null;
  const id = toSafeString(raw.id);
  const summary = toSafeString(raw.summary);
  if (!id || !summary) return null;
  return {
    id,
    summary,
    timestamp: toSafeTimestamp(raw.timestamp, 0),
    salience: clamp(toSafeNumber(raw.salience), 0, 1),
  };
}

function parseDialogueSession(raw: unknown): SugarAgentDialogueSessionStateV1 | null {
  if (!isRecord(raw)) return null;
  const npcId = toSafeString(raw.npcId);
  if (!npcId) return null;
  return {
    npcId,
    activeBeatId: toSafeString(raw.activeBeatId),
    questId: toSafeString(raw.questId),
    objectiveId: toSafeString(raw.objectiveId),
    coveredFacts: Array.isArray(raw.coveredFacts)
      ? raw.coveredFacts.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    uncoveredFacts: Array.isArray(raw.uncoveredFacts)
      ? raw.uncoveredFacts.filter((entry): entry is string => typeof entry === 'string')
      : undefined,
    turnCount: toSafeCounter(raw.turnCount),
    updatedAt: toSafeTimestamp(raw.updatedAt, 0),
  };
}

function parseStateV1(raw: Record<string, unknown>, now: number): SugarAgentPluginStateV1 {
  const state = createDefaultState(now);
  state.updatedAt = toSafeTimestamp(raw.updatedAt, now);

  if (isRecord(raw.playerModel)) {
    state.playerModel = {
      targetLanguage: toSafeString(raw.playerModel.targetLanguage),
      estimatedLevel: toSafeString(raw.playerModel.estimatedLevel),
      confidence: raw.playerModel.confidence === undefined
        ? undefined
        : clamp(toSafeNumber(raw.playerModel.confidence), 0, 1),
    };
  }

  if (isRecord(raw.npcs)) {
    for (const [npcId, value] of Object.entries(raw.npcs)) {
      if (!isRecord(value)) continue;
      const npcMemory: SugarAgentNPCMemoryStateV1 = {
        relationship: parseRelationship(value.relationship, now),
        episodic: Array.isArray(value.episodic)
          ? value.episodic
            .map(parseEpisodic)
            .filter((entry): entry is SugarAgentEpisodicMemoryRecordV1 => entry !== null)
          : [],
        semantic: Array.isArray(value.semantic)
          ? value.semantic
            .map(parseSemantic)
            .filter((entry): entry is SugarAgentSemanticBeliefRecordV1 => entry !== null)
          : [],
        conversationSummaries: Array.isArray(value.conversationSummaries)
          ? value.conversationSummaries
            .map(parseSummary)
            .filter((entry): entry is SugarAgentConversationSummaryV1 => entry !== null)
          : [],
      };
      state.npcs[npcId] = npcMemory;
    }
  }

  if (isRecord(raw.dialogueSessions)) {
    const sessions: Record<string, SugarAgentDialogueSessionStateV1> = {};
    for (const [sessionId, value] of Object.entries(raw.dialogueSessions)) {
      const parsed = parseDialogueSession(value);
      if (!parsed) continue;
      sessions[sessionId] = parsed;
    }
    state.dialogueSessions = sessions;
  }

  compactState(state);
  return state;
}

function migrateV0ToV1(raw: SugarAgentPluginStateV0, now: number): SugarAgentPluginStateV1 {
  const migrated = createDefaultState(now);
  if (raw.seenEvents > 0) {
    const npc = ensureNpcMemory(migrated, DEFAULT_NPC_KEY, now);
    pushSummary(
      npc,
      `Migrated legacy SugarAgent counters (${raw.seenEvents} historical events).`,
      0.2,
      now,
    );
  }
  return migrated;
}

/**
 * SugarAgent plugin runtime with phase-3 persistence envelope and
 * phase-10A/10B/10C interaction hooks.
 */
export function createSugarAgentPlugin(options: SugarAgentPluginOptions = {}): EnginePlugin {
  const pluginId = options.id ?? 'sugaragent';
  const captureEvents = options.captureEvents ?? true;
  let state: SugarAgentPluginStateV1 = createDefaultState(Date.now());
  let lastNpcId: string | null = null;
  let localProvider: LocalLLMProvider | null = null;

  function resolveRuntimeBridge(): LocalRuntimeBridge | null {
    if (options.disableProvider) return null;
    if (options.runtimeBridge) return options.runtimeBridge;
    if (typeof window !== 'undefined') {
      return new HttpLocalRuntimeBridge();
    }
    return null;
  }

  const trackEvent = (event: PluginEvent): void => {
    if (!captureEvents) return;
    const now = Date.now();
    state.updatedAt = now;
    const npcId = ((): string => {
      if ('npcId' in event && typeof event.npcId === 'string') {
        lastNpcId = event.npcId;
        return event.npcId;
      }
      return lastNpcId ?? DEFAULT_NPC_KEY;
    })();
    const npc = ensureNpcMemory(state, npcId, now);

    switch (event.type) {
      case 'interactionHandled': {
        applyRelationshipDelta(
          npc.relationship,
          {
            affinity: 1,
            trust: event.source === 'quest' ? 1 : 0.5,
            respect: event.source === 'quest' ? 1 : 0.5,
            tension: -0.25,
          },
          now,
        );
        pushSummary(npc, `Interaction resolved via ${event.source}.`, 0.25, now);
        break;
      }
      case 'dialogueStarted': {
        const sessions = ensureDialogueSessions(state);
        const sessionKey = npcId;
        const existing = sessions[sessionKey];
        sessions[sessionKey] = {
          npcId,
          activeBeatId: existing?.activeBeatId,
          coveredFacts: existing?.coveredFacts ?? [],
          uncoveredFacts: existing?.uncoveredFacts ?? [],
          turnCount: (existing?.turnCount ?? 0) + 1,
          updatedAt: now,
        };
        pushSummary(npc, 'Conversation started.', 0.2, now);
        break;
      }
      case 'dialogueEnded':
        pushSummary(npc, 'Conversation ended.', 0.2, now);
        break;
      case 'questStarted':
        pushEpisodic(npc, 'questStarted', `Quest started: ${event.questName}`, 0.6, now);
        applyRelationshipDelta(npc.relationship, { respect: 0.5 }, now);
        break;
      case 'questCompleted': {
        pushEpisodic(npc, 'questCompleted', `Quest completed: ${event.questName}`, 0.9, now);
        applyRelationshipDelta(npc.relationship, { affinity: 1.5, trust: 1 }, now);
        const sessions = ensureDialogueSessions(state);
        clearDialogueSessions(
          sessions,
          (session) => session.questId === event.questId,
        );
        break;
      }
      case 'objectiveCompleted':
        if (event.description) {
          pushEpisodic(npc, 'objectiveCompleted', event.description, 0.7, now);
        }
        if (event.objectiveId) {
          const sessions = ensureDialogueSessions(state);
          clearDialogueSessions(
            sessions,
            (session) => session.questId === event.questId && session.objectiveId === event.objectiveId,
          );
        }
        break;
      case 'itemAdded':
      case 'itemPickedUp':
        pushEpisodic(
          npc,
          event.type,
          `Player obtained ${event.quantity}x ${event.itemId}.`,
          0.55,
          now,
        );
        break;
      case 'stateChanged':
        if (event.change.namespace === 'flags') {
          pushEpisodic(
            npc,
            'stateChanged',
            `World flag changed: ${event.change.key}.`,
            0.45,
            now,
          );
        }
        break;
      default:
        break;
    }

    compactState(state);
  };

  const resolveInteraction = (request: InteractionRequest) => {
    return {
      type: 'openAgentConversation',
      npcId: request.npcId,
      npcName: request.npcName,
    } as const;
  };

  const runAgentTurn = async (request: PluginAgentTurnRequest): Promise<PluginAgentTurnResult | null> => {
    const message = request.playerMessage?.trim();
    if (!message) return null;

    const now = Date.now();
    state.updatedAt = now;
    const npc = ensureNpcMemory(state, request.npcId, now);
    const beatContract = request.beatContract;
    const sessions = ensureDialogueSessions(state);
    const beatSessionKey = beatContract ? `${request.npcId}:${beatContract.id}` : request.npcId;
    const existingSession = sessions[beatSessionKey];

    rememberPlayerFacts(npc, message, now);

    let turn: PluginAgentTurnResult;
    if (localProvider) {
      try {
        const generated = await localProvider.generateStructured({
          npcId: request.npcId,
          npcName: request.npcName ?? 'Friend',
          playerMessage: message,
        });
        turn = {
          utterance: generated.output.utterance,
          emotion: generated.output.emotion,
          intent: generated.output.intent,
          citations: generated.output.citations,
          beatEvidence: generated.output.beatEvidence,
        };
      } catch (error) {
        console.warn('[sugaragent] Local provider failed in runAgentTurn, using deterministic fallback.', error);
        turn = buildDeterministicAgentTurn({
          npcName: request.npcName,
          playerMessage: message,
          npc,
        });
      }
    } else {
      turn = buildDeterministicAgentTurn({
        npcName: request.npcName,
        playerMessage: message,
        npc,
      });
    }
    if (beatContract) {
      const enriched = enrichTurnWithBeatEvidence({
        turn,
        contract: beatContract,
        playerMessage: message,
        priorCoveredFacts: existingSession?.coveredFacts ?? [],
      });
      turn = enriched.turn;
      sessions[beatSessionKey] = {
        npcId: request.npcId,
        activeBeatId: beatContract.id,
        questId: beatContract.questId,
        objectiveId: beatContract.objectiveId,
        coveredFacts: enriched.beatEvidence.coveredFacts,
        uncoveredFacts: enriched.beatEvidence.uncoveredFacts,
        turnCount: request.beatTurnCount ?? ((existingSession?.turnCount ?? 0) + 1),
        updatedAt: now,
      };
    }

    pushSummary(npc, `Player: ${message}`, 0.35, now);
    pushSummary(npc, `NPC: ${turn.utterance}`, 0.3, now);
    applyRelationshipDelta(
      npc.relationship,
      {
        affinity: 0.5,
        trust: 0.25,
        respect: 0.2,
        tension: -0.1,
      },
      now,
    );

    compactState(state);
    return turn;
  };

  const init = async (): Promise<void> => {
    const runtimeBridge = resolveRuntimeBridge();
    if (!runtimeBridge) {
      localProvider = null;
      return;
    }

    const provider = new LocalLLMProvider({
      runtime: runtimeBridge,
      maxAttempts: 3,
    });

    try {
      const health = await provider.health();
      if (!health.ok) {
        console.warn('[sugaragent] Local provider unavailable; deterministic fallback will be used.', health.detail);
        localProvider = null;
        return;
      }
      localProvider = provider;
    } catch (error) {
      console.warn('[sugaragent] Failed to initialize local provider; deterministic fallback will be used.', error);
      localProvider = null;
    }
  };

  const loadState = (raw: unknown): void => {
    if (!isRecord(raw)) return;
    const schemaVersion = raw.schemaVersion;
    const now = Date.now();

    if (schemaVersion === 1) {
      state = parseStateV1(raw, now);
      return;
    }
    if (schemaVersion === 0) {
      state = migrateV0ToV1(
        {
          schemaVersion: 0,
          seenEvents: toSafeCounter(raw.seenEvents),
        },
        now,
      );
    }
  };

  return {
    descriptor: {
      id: pluginId,
      version: '0.5.0',
      apiVersion: PLUGIN_API_VERSION,
    },
    init,
    dispose: () => {},
    onEvent: trackEvent,
    resolveInteraction,
    runAgentTurn,
    serializeState: () => ({ ...state }),
    loadState,
  };
}
