import path from 'node:path';
import fs from 'node:fs';
import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildLoreGroundedTurn,
  loadLoreArtifacts,
  retrieveLoreChunks,
} from '../lore/lore-lib.mjs';
import {
  buildClaimRepairReason,
  validateGroundedClaims,
} from './claim-validator.mjs';
import {
  createDeterministicFallbackReply,
} from '../dialogue/fallback-policy.mjs';
import {
  buildScenarioPromptBlock,
  createSimScenarioFromBeatContract,
  createScenarioState,
  getSimScenario,
  listSimScenarioIds,
  orchestrateScenarioTurn,
} from '../dialogue/scenario-orchestration.mjs';
import { DEFAULT_MODEL_PROFILE, getModelProfile } from '../runtime/model-profiles.mjs';
import {
  findSugarAgentBeatContract,
  findSugarAgentProfile,
  parseSugarAgentAuthoringBundle,
} from '../authoring/artifacts.mjs';
import {
  runCrowdTownCadenceSimulation,
} from '../simulation/cadence.mjs';

const execFileAsync = promisify(execFile);
const BUNDLE_ROOT = path.resolve('src/plugins/sugaragent/runtime/bundle');
const DEFAULT_BUNDLED_LLAMA_BIN = path.resolve(
  'src/plugins/sugaragent/runtime/bundle/bin/llama-completion',
);
const BUNDLE_LOCK_PATH = path.join(BUNDLE_ROOT, 'bundle.lock.json');
const defaultProfile = getModelProfile(DEFAULT_MODEL_PROFILE);
const DEFAULT_BUNDLED_MODEL_PATH = defaultProfile
  ? path.join(BUNDLE_ROOT, 'models', defaultProfile.modelFileName)
  : path.join(BUNDLE_ROOT, 'models', 'qwen3-4b-instruct-2507-q4_k_m.gguf');
const LEGACY_BUNDLED_MODEL_PATH = path.join(BUNDLE_ROOT, 'models', 'qwen2.5-0.5b-instruct-q2_k.gguf');
const MAX_HISTORY_ENTRIES = 8;
const MAX_SESSION_FACTS_PER_NPC = 24;
const MAX_SESSION_EVENTS_PER_NPC = 64;
const MAX_TOPIC_COVERAGE_PER_NPC = 24;
const TOPIC_EXHAUSTION_MIN_MENTIONS = 3;
const TOPIC_EXHAUSTION_MAX_NOVELTY = 0.34;
const LORE_OVERRIDE_MIN_SCORE = 1.2;
const LORE_OVERRIDE_MIN_MARGIN = 0.35;
const SESSION_DIR = path.resolve('.sugaragent-sim-sessions');
const DEFAULT_AUTHORING_BUNDLE_PATH = path.resolve('public/plugins/sugaragent/authoring.bundle.json');
const CADENCE_SCENARIO_ID = 'crowd-town';
const PIPELINE_VERSION_V2 = 'v2';
const VALID_QUERY_TYPES = new Set([
  'conversation',
  'self_query',
  'other_query',
  'world_query',
  'mixed_query',
]);
const ROUTING_INTENT_ORDER = [
  'social_chat',
  'session_recall',
  'identity_self',
  'lore_world',
  'lore_other',
  'mixed_knowledge',
  'unclear',
];
const INITIATIVE_ACTIONS = new Set([
  'npc_initiate',
  'player_respond',
  'clarify',
  'abstain',
  'close',
]);
const GOAL_TYPES = new Set([
  'beat_goal',
  'character_goal',
  'social_goal',
  'repair_goal',
  'closure_goal',
]);
const EXPECTED_RESPONSE_TYPES = new Set([
  'free_text',
  'ack',
  'choice',
  'action',
]);
const TOPIC_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'any',
  'are',
  'about',
  'again',
  'all',
  'also',
  'am',
  'at',
  'be',
  'been',
  'can',
  'could',
  'do',
  'for',
  'from',
  'hello',
  'hey',
  'hi',
  'how',
  'i',
  'im',
  'is',
  'it',
  'its',
  'just',
  'know',
  'like',
  'me',
  'my',
  'of',
  'on',
  'or',
  'that',
  'the',
  'there',
  'they',
  'this',
  'to',
  'today',
  'up',
  'was',
  'we',
  'what',
  'when',
  'where',
  'who',
  'why',
  'with',
  'you',
  'your',
]);
const TOPIC_ACTION_WORDS = new Set([
  'ask',
  'asked',
  'asking',
  'clarify',
  'explain',
  'feel',
  'felt',
  'help',
  'know',
  'knew',
  'like',
  'liked',
  'love',
  'loved',
  'mean',
  'meant',
  'need',
  'needed',
  'say',
  'says',
  'said',
  'share',
  'shared',
  'talk',
  'talked',
  'tell',
  'told',
  'think',
  'thought',
  'want',
  'wanted',
]);
const TOPIC_FOCUS_PREPOSITIONS = new Set([
  'about',
  'regarding',
  'concerning',
]);
const EVIDENCE_OWNER_TYPES = new Set(['npc', 'player', 'world', 'beat', 'unknown']);
const DEFAULT_BEAT_EVIDENCE = {
  coveredFacts: [],
  uncoveredFacts: [],
  completionSignal: 'none',
  confidence: 0,
};
const EVIDENCE_BUDGETS_BY_MODE = {
  character: {
    maxFacts: 12,
    maxSpans: 12,
    maxContextTokens: 700,
    maxMemoryFacts: 6,
    maxBeatFacts: 0,
  },
  narrative: {
    maxFacts: 16,
    maxSpans: 16,
    maxContextTokens: 920,
    maxMemoryFacts: 6,
    maxBeatFacts: 8,
  },
  hybrid: {
    maxFacts: 14,
    maxSpans: 14,
    maxContextTokens: 820,
    maxMemoryFacts: 7,
    maxBeatFacts: 6,
  },
};
const RERANK_CANDIDATE_CAPS_BY_MODE = {
  character: {
    low: 6,
    standard: 8,
    high: 10,
  },
  narrative: {
    low: 8,
    standard: 10,
    high: 12,
  },
  hybrid: {
    low: 7,
    standard: 9,
    high: 11,
  },
};
const RETRIEVAL_QUALITY_THRESHOLDS_BY_MODE = {
  character: {
    minCoverage: 0.2,
    minSupportConfidence: 0.34,
    maxConflictRisk: 0.45,
  },
  narrative: {
    minCoverage: 0.24,
    minSupportConfidence: 0.38,
    maxConflictRisk: 0.4,
  },
  hybrid: {
    minCoverage: 0.22,
    minSupportConfidence: 0.36,
    maxConflictRisk: 0.42,
  },
};
const RERANK_CACHE_MAX_ENTRIES = 256;
const TURN_JSON_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    utterance: { type: 'string' },
    emotion: { type: 'string' },
    intent: { type: 'string' },
    proposedIntents: { type: 'array', items: { type: 'object' } },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'string' },
          snippet: { type: 'string' },
        },
        required: ['sourceId'],
        additionalProperties: true,
      },
    },
    beatEvidence: {
      type: 'object',
      properties: {
        beatId: { type: 'string' },
        coveredFacts: { type: 'array', items: { type: 'string' } },
        uncoveredFacts: { type: 'array', items: { type: 'string' } },
        completionSignal: {
          type: 'string',
          enum: ['none', 'player_ack', 'player_action', 'engine_flag'],
        },
        confidence: { type: 'number' },
      },
      required: ['coveredFacts', 'uncoveredFacts', 'completionSignal', 'confidence'],
      additionalProperties: false,
    },
  },
  required: ['utterance', 'emotion', 'intent', 'proposedIntents', 'citations'],
  additionalProperties: false,
});
function createEchoReply(message) {
  return {
    utterance: `Echo: ${message}`,
    emotion: 'neutral',
    intent: 'echo',
    proposedIntents: [],
    citations: [],
  };
}

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const entries = [];
  for (const entry of value) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push(normalized);
  }
  return entries;
}

function normalizeQueryType(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return VALID_QUERY_TYPES.has(normalized) ? normalized : undefined;
}

function normalizeRoutingIntent(value) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return ROUTING_INTENT_ORDER.includes(normalized) ? normalized : undefined;
}

function normalizeNpcProfile(value) {
  if (!isRecord(value)) return null;
  const npcId = normalizeOptionalString(value.npcId);
  const persona = normalizeOptionalString(value.persona);
  const tone = normalizeOptionalString(value.tone);
  const selfEntityId = normalizeOptionalString(value.selfEntityId);
  const constraints = normalizeStringArray(value.constraints ?? value.safetyBounds);
  const loreScopes = normalizeStringArray(value.loreScopes);
  const selfLoreScopes = normalizeStringArray(value.selfLoreScopes);
  const relatedLoreScopes = normalizeStringArray(value.relatedLoreScopes);
  const normalized = {};
  if (npcId) normalized.npcId = npcId;
  if (persona) normalized.persona = persona;
  if (tone) normalized.tone = tone;
  if (selfEntityId) normalized.selfEntityId = selfEntityId;
  if (constraints.length > 0) normalized.constraints = constraints;
  if (loreScopes.length > 0) normalized.loreScopes = loreScopes;
  if (selfLoreScopes.length > 0) normalized.selfLoreScopes = selfLoreScopes;
  if (relatedLoreScopes.length > 0) normalized.relatedLoreScopes = relatedLoreScopes;
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function mergeStringArrays(base, override) {
  return normalizeStringArray([...(normalizeStringArray(base)), ...(normalizeStringArray(override))]);
}

function mergeNpcProfile(base, override) {
  const baseProfile = normalizeNpcProfile(base) ?? {};
  const overrideProfile = normalizeNpcProfile(override) ?? {};
  const merged = {};
  const npcId = overrideProfile.npcId ?? baseProfile.npcId;
  const persona = overrideProfile.persona ?? baseProfile.persona;
  const tone = overrideProfile.tone ?? baseProfile.tone;
  const selfEntityId = overrideProfile.selfEntityId ?? baseProfile.selfEntityId;
  const constraints = mergeStringArrays(baseProfile.constraints, overrideProfile.constraints);
  const loreScopes = mergeStringArrays(baseProfile.loreScopes, overrideProfile.loreScopes);
  const selfLoreScopes = mergeStringArrays(baseProfile.selfLoreScopes, overrideProfile.selfLoreScopes);
  const relatedLoreScopes = mergeStringArrays(baseProfile.relatedLoreScopes, overrideProfile.relatedLoreScopes);
  if (npcId) merged.npcId = npcId;
  if (persona) merged.persona = persona;
  if (tone) merged.tone = tone;
  if (selfEntityId) merged.selfEntityId = selfEntityId;
  if (constraints.length > 0) merged.constraints = constraints;
  if (loreScopes.length > 0) merged.loreScopes = loreScopes;
  if (selfLoreScopes.length > 0) merged.selfLoreScopes = selfLoreScopes;
  if (relatedLoreScopes.length > 0) merged.relatedLoreScopes = relatedLoreScopes;
  return Object.keys(merged).length > 0 ? merged : null;
}

function normalizeTurnContext(value) {
  if (!isRecord(value)) return null;
  const gameId = normalizeOptionalString(value.gameId);
  const regionPath = normalizeOptionalString(value.regionPath);
  const episodeId = normalizeOptionalString(value.episodeId);
  const interactionMode = value.interactionMode === 'scripted'
    || value.interactionMode === 'agent'
    || value.interactionMode === 'hybrid'
    ? value.interactionMode
    : undefined;
  const interactionPolicy = value.interactionPolicy === 'scripted-first'
    || value.interactionPolicy === 'agent-first'
    || value.interactionPolicy === 'fallback'
    ? value.interactionPolicy
    : undefined;
  const queryType = normalizeQueryType(value.queryType);
  const routingIntent = normalizeRoutingIntent(value.routingIntent);
  const routingPolicyPath = normalizeOptionalString(value.routingPolicyPath);
  const routingConfidence = typeof value.routingConfidence === 'number'
    && Number.isFinite(value.routingConfidence)
    ? Math.max(0, Math.min(1, value.routingConfidence))
    : undefined;
  const routingMargin = typeof value.routingMargin === 'number'
    && Number.isFinite(value.routingMargin)
    ? Math.max(0, Math.min(1, value.routingMargin))
    : undefined;
  const isFirstMeeting = typeof value.isFirstMeeting === 'boolean'
    ? value.isFirstMeeting
    : undefined;
  const turnIndexWithNpc = typeof value.turnIndexWithNpc === 'number'
    && Number.isFinite(value.turnIndexWithNpc)
    ? Math.max(1, Math.floor(value.turnIndexWithNpc))
    : undefined;
  const rawTopicCoverage = isRecord(value.topicCoverage)
    ? value.topicCoverage
    : null;
  const topicCoverage = rawTopicCoverage
    ? (() => {
      const normalizedTopicCoverage = {};
      const activeTopic = normalizeTopicToken(String(rawTopicCoverage.activeTopic ?? ''));
      const activeTopicNovelty = typeof rawTopicCoverage.activeTopicNovelty === 'number'
        && Number.isFinite(rawTopicCoverage.activeTopicNovelty)
        ? Number(Math.max(0, Math.min(1, rawTopicCoverage.activeTopicNovelty)).toFixed(4))
        : undefined;
      const exhaustedTopics = Array.isArray(rawTopicCoverage.exhaustedTopics)
        ? rawTopicCoverage.exhaustedTopics
          .map((entry) => normalizeTopicToken(String(entry ?? '')))
          .filter((entry) => entry.length > 0)
          .slice(-6)
        : [];
      const trackedTopicCount = typeof rawTopicCoverage.trackedTopicCount === 'number'
        && Number.isFinite(rawTopicCoverage.trackedTopicCount)
        ? Math.max(0, Math.floor(rawTopicCoverage.trackedTopicCount))
        : undefined;
      const exhausted = typeof rawTopicCoverage.exhausted === 'boolean'
        ? rawTopicCoverage.exhausted
        : undefined;
      if (activeTopic) normalizedTopicCoverage.activeTopic = activeTopic;
      if (activeTopicNovelty !== undefined) normalizedTopicCoverage.activeTopicNovelty = activeTopicNovelty;
      if (exhaustedTopics.length > 0) normalizedTopicCoverage.exhaustedTopics = exhaustedTopics;
      if (trackedTopicCount !== undefined) normalizedTopicCoverage.trackedTopicCount = trackedTopicCount;
      if (exhausted !== undefined) normalizedTopicCoverage.exhausted = exhausted;
      return Object.keys(normalizedTopicCoverage).length > 0 ? normalizedTopicCoverage : undefined;
    })()
    : undefined;
  const normalized = {};
  if (gameId) normalized.gameId = gameId;
  if (regionPath) normalized.regionPath = regionPath;
  if (episodeId) normalized.episodeId = episodeId;
  if (interactionMode) normalized.interactionMode = interactionMode;
  if (interactionPolicy) normalized.interactionPolicy = interactionPolicy;
  if (queryType) normalized.queryType = queryType;
  if (routingIntent) normalized.routingIntent = routingIntent;
  if (routingPolicyPath) normalized.routingPolicyPath = routingPolicyPath;
  if (routingConfidence !== undefined) normalized.routingConfidence = routingConfidence;
  if (routingMargin !== undefined) normalized.routingMargin = routingMargin;
  if (isFirstMeeting !== undefined) normalized.isFirstMeeting = isFirstMeeting;
  if (turnIndexWithNpc !== undefined) normalized.turnIndexWithNpc = turnIndexWithNpc;
  if (topicCoverage !== undefined) normalized.topicCoverage = topicCoverage;
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function mergeTurnContext(base, override) {
  const baseContext = normalizeTurnContext(base) ?? {};
  const overrideContext = normalizeTurnContext(override) ?? {};
  const merged = {
    ...baseContext,
    ...overrideContext,
  };
  return Object.keys(merged).length > 0 ? merged : null;
}

function validateStructuredOutput(value) {
  const errors = [];
  if (!isRecord(value)) {
    return { valid: false, errors: ['turn output must be an object'] };
  }

  if (typeof value.utterance !== 'string' || value.utterance.trim().length === 0) {
    errors.push('utterance must be a non-empty string');
  }
  if (typeof value.emotion !== 'string' || value.emotion.trim().length === 0) {
    errors.push('emotion must be a non-empty string');
  }
  if (typeof value.intent !== 'string' || value.intent.trim().length === 0) {
    errors.push('intent must be a non-empty string');
  }
  if (!Array.isArray(value.proposedIntents)) {
    errors.push('proposedIntents must be an array');
  }
  if (
    !Array.isArray(value.citations) ||
    !value.citations.every((entry) => isRecord(entry) && typeof entry.sourceId === 'string')
  ) {
    errors.push('citations must be an array of { sourceId: string }');
  }

  if (value.beatEvidence !== undefined) {
    if (!isRecord(value.beatEvidence)) {
      errors.push('beatEvidence must be an object');
    } else {
      if (value.beatEvidence.beatId !== undefined && typeof value.beatEvidence.beatId !== 'string') {
        errors.push('beatEvidence.beatId must be a string when present');
      }
      if (!isStringArray(value.beatEvidence.coveredFacts)) {
        errors.push('beatEvidence.coveredFacts must be string[]');
      }
      if (!isStringArray(value.beatEvidence.uncoveredFacts)) {
        errors.push('beatEvidence.uncoveredFacts must be string[]');
      }
      if (
        value.beatEvidence.completionSignal !== 'none'
        && value.beatEvidence.completionSignal !== 'player_ack'
        && value.beatEvidence.completionSignal !== 'player_action'
        && value.beatEvidence.completionSignal !== 'engine_flag'
      ) {
        errors.push('beatEvidence.completionSignal must be one of: none, player_ack, player_action, engine_flag');
      }
      if (
        typeof value.beatEvidence.confidence !== 'number'
        || Number.isNaN(value.beatEvidence.confidence)
        || value.beatEvidence.confidence < 0
        || value.beatEvidence.confidence > 1
      ) {
        errors.push('beatEvidence.confidence must be a number between 0 and 1');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function toSafeTimestamp(value, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function sanitizeSessionId(sessionId) {
  return String(sessionId)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'default';
}

function resolveSessionPath(sessionId) {
  const sanitized = sanitizeSessionId(sessionId);
  return path.join(SESSION_DIR, `${sanitized}.json`);
}

function createEmptySessionState(sessionId) {
  return {
    schemaVersion: 3,
    sessionId,
    updatedAt: Date.now(),
    npcs: {},
  };
}

function normalizeFact(text) {
  return (text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '');
}

function normalizeTopicToken(text) {
  return (text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u00c0-\u024f_-]+/g, '');
}

function extractConversationTopics(message) {
  const source = String(message ?? '').trim();
  if (!source) return [];
  const tokenizedWords = source
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s_-]+/g, ' ')
    .split(/\s+/);

  const focusedTopics = [];
  for (let i = 0; i < tokenizedWords.length - 1; i += 1) {
    const current = normalizeTopicToken(tokenizedWords[i]);
    if (!TOPIC_FOCUS_PREPOSITIONS.has(current)) continue;
    const next = normalizeTopicToken(tokenizedWords[i + 1]);
    if (
      next.length >= 4
      && !TOPIC_STOPWORDS.has(next)
      && !TOPIC_ACTION_WORDS.has(next)
    ) {
      focusedTopics.push(next);
    }
  }

  const baseTopics = tokenizedWords
    .map(normalizeTopicToken)
    .filter((token) => (
      token.length >= 4
      && !TOPIC_STOPWORDS.has(token)
      && !TOPIC_ACTION_WORDS.has(token)
    ));

  return Array.from(new Set([...focusedTopics, ...baseTopics])).slice(0, 8);
}

function computeTopicNovelty(mentions) {
  const safeMentions = Number.isFinite(mentions) ? Math.max(1, Math.floor(mentions)) : 1;
  const novelty = 1 / (1 + (safeMentions - 1) * 0.75);
  return Number(Math.max(0.05, Math.min(1, novelty)).toFixed(4));
}

function isTopicExhausted(entry) {
  if (!isRecord(entry)) return false;
  const mentions = Number.isFinite(entry.mentions) ? Math.max(0, Math.floor(entry.mentions)) : 0;
  const novelty = typeof entry.novelty === 'number' && Number.isFinite(entry.novelty)
    ? entry.novelty
    : computeTopicNovelty(mentions);
  return mentions >= TOPIC_EXHAUSTION_MIN_MENTIONS && novelty <= TOPIC_EXHAUSTION_MAX_NOVELTY;
}

function extractSalientFacts(message) {
  const source = (message ?? '').trim();
  if (!source) return [];
  const lower = source.toLowerCase();
  const facts = [];

  const introMatch = source.match(/^(?:i am|i'm)\s+([a-z\u00c0-\u024f' -]{2,40})(?:[,.!?;:]|$)/i);
  if (introMatch?.[1]) {
    const introName = normalizeFact(introMatch[1]);
    const normalizedName = introName.toLowerCase();
    const excluded = new Set([
      'a',
      'an',
      'fine',
      'good',
      'okay',
      'ok',
      'here',
      'new',
      'sorry',
      'ready',
    ]);
    if (!excluded.has(normalizedName)) {
      facts.push(`my name is ${introName}`);
    }
  }

  const patterns = [
    /my name is ([a-z\u00c0-\u024f' -]{2,40})/i,
    /i am from ([a-z\u00c0-\u024f' -]{2,40})/i,
    /i'm from ([a-z\u00c0-\u024f' -]{2,40})/i,
    /i speak ([a-z\u00c0-\u024f' -]{2,40})/i,
    /i like ([^.!?]{3,80})/i,
    /i need ([^.!?]{3,80})/i,
    /i have ([^.!?]{3,80})/i,
    /there is ([^.!?]{3,100})/i,
    /there's ([^.!?]{3,100})/i,
    /i promised ([^.!?]{3,100})/i,
    /i gave you ([^.!?]{3,100})/i,
    /i am worried about ([^.!?]{3,100})/i,
    /i'm worried about ([^.!?]{3,100})/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (!match) continue;
    const captured = normalizeFact(match[0]);
    if (captured.length >= 6) {
      facts.push(captured);
    }
  }

  if (lower.includes('fire') && lower.includes('mountain')) {
    facts.push('There is a fire in the mountains.');
  }

  return Array.from(new Set(facts));
}

function ensureSessionNpc(state, npcId) {
  if (!state.npcs[npcId]) {
    state.npcs[npcId] = {
      facts: [],
      history: [],
      events: [],
      topicCoverage: [],
      updatedAt: Date.now(),
    };
  }
  if (!Array.isArray(state.npcs[npcId].events)) {
    state.npcs[npcId].events = [];
  }
  if (!Array.isArray(state.npcs[npcId].topicCoverage)) {
    state.npcs[npcId].topicCoverage = [];
  }
  return state.npcs[npcId];
}

function loadSessionState(sessionId) {
  const pathToFile = resolveSessionPath(sessionId);
  if (!fs.existsSync(pathToFile)) {
    return {
      pathToFile,
      state: createEmptySessionState(sessionId),
      loaded: false,
    };
  }

  try {
    const raw = fs.readFileSync(pathToFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      !isRecord(parsed)
      || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3)
      || !isRecord(parsed.npcs)
    ) {
      return {
        pathToFile,
        state: createEmptySessionState(sessionId),
        loaded: false,
      };
    }
    const normalized = createEmptySessionState(sessionId);
    normalized.updatedAt = toSafeTimestamp(parsed.updatedAt, Date.now());
    for (const [npcId, value] of Object.entries(parsed.npcs)) {
      if (!isRecord(value)) continue;
      normalized.npcs[npcId] = {
        facts: Array.isArray(value.facts)
          ? value.facts.filter((entry) => typeof entry === 'string').slice(-MAX_SESSION_FACTS_PER_NPC)
          : [],
        history: Array.isArray(value.history)
          ? value.history
            .filter((entry) => isRecord(entry) && typeof entry.role === 'string' && typeof entry.text === 'string')
            .slice(-MAX_HISTORY_ENTRIES)
          : [],
        events: Array.isArray(value.events)
          ? value.events
            .filter((entry) => {
              if (!isRecord(entry)) return false;
              if (typeof entry.id !== 'string' || entry.id.trim().length === 0) return false;
              if (typeof entry.type !== 'string' || entry.type.trim().length === 0) return false;
              if (typeof entry.ownerType !== 'string' || !EVIDENCE_OWNER_TYPES.has(entry.ownerType)) return false;
              if (typeof entry.text !== 'string' || entry.text.trim().length === 0) return false;
              return true;
            })
            .map((entry) => ({
              id: String(entry.id),
              type: String(entry.type),
              ownerType: String(entry.ownerType),
              text: String(entry.text),
              timestamp: toSafeTimestamp(entry.timestamp, Date.now()),
              source: typeof entry.source === 'string' ? entry.source : undefined,
            }))
            .slice(-MAX_SESSION_EVENTS_PER_NPC)
          : [],
        topicCoverage: Array.isArray(value.topicCoverage)
          ? value.topicCoverage
            .filter((entry) => {
              if (!isRecord(entry)) return false;
              if (typeof entry.topic !== 'string' || entry.topic.trim().length === 0) return false;
              const mentions = Number.isFinite(entry.mentions) ? Math.max(0, Math.floor(entry.mentions)) : 0;
              return mentions > 0;
            })
            .map((entry) => {
              const mentions = Number.isFinite(entry.mentions) ? Math.max(1, Math.floor(entry.mentions)) : 1;
              const topic = normalizeTopicToken(String(entry.topic));
              const novelty = typeof entry.novelty === 'number' && Number.isFinite(entry.novelty)
                ? Number(Math.max(0.05, Math.min(1, entry.novelty)).toFixed(4))
                : computeTopicNovelty(mentions);
              return {
                topic,
                mentions,
                novelty,
                exhausted: entry.exhausted === true || (mentions >= TOPIC_EXHAUSTION_MIN_MENTIONS && novelty <= TOPIC_EXHAUSTION_MAX_NOVELTY),
                lastMentionAt: toSafeTimestamp(entry.lastMentionAt, Date.now()),
              };
            })
            .filter((entry) => entry.topic.length > 0)
            .slice(-MAX_TOPIC_COVERAGE_PER_NPC)
          : [],
        updatedAt: toSafeTimestamp(value.updatedAt, Date.now()),
      };
    }
    return {
      pathToFile,
      state: normalized,
      loaded: true,
    };
  } catch {
    return {
      pathToFile,
      state: createEmptySessionState(sessionId),
      loaded: false,
    };
  }
}

function resetSessionState(sessionId) {
  const sanitized = sanitizeSessionId(sessionId);
  const pathToFile = resolveSessionPath(sessionId);
  const existed = fs.existsSync(pathToFile);
  if (existed) {
    fs.rmSync(pathToFile, { force: true });
  }
  return {
    sessionId: sanitized,
    pathToFile,
    existed,
  };
}

function saveSessionState(session) {
  if (!session) return;
  session.state.updatedAt = Date.now();
  fs.mkdirSync(path.dirname(session.pathToFile), { recursive: true });
  fs.writeFileSync(session.pathToFile, `${JSON.stringify(session.state, null, 2)}\n`, 'utf8');
}

function getSessionFactsForNpc(session, npcId) {
  if (!session) return [];
  const npc = session.state.npcs[npcId];
  return Array.isArray(npc?.facts) ? npc.facts : [];
}

function getSessionTopicCoverageForNpc(session, npcId) {
  if (!session) return [];
  const npc = session.state.npcs[npcId];
  return Array.isArray(npc?.topicCoverage) ? npc.topicCoverage : [];
}

function buildTurnTopicCoverageContext(topicCoverageEntries, playerMessage) {
  const now = Date.now();
  const entries = Array.isArray(topicCoverageEntries)
    ? topicCoverageEntries
      .filter((entry) => isRecord(entry) && typeof entry.topic === 'string' && entry.topic.trim().length > 0)
      .map((entry) => ({
        topic: normalizeTopicToken(String(entry.topic)),
        mentions: Number.isFinite(entry.mentions) ? Math.max(1, Math.floor(entry.mentions)) : 1,
        novelty: typeof entry.novelty === 'number' && Number.isFinite(entry.novelty)
          ? Number(Math.max(0.05, Math.min(1, entry.novelty)).toFixed(4))
          : computeTopicNovelty(Number.isFinite(entry.mentions) ? Math.max(1, Math.floor(entry.mentions)) : 1),
        exhausted: entry.exhausted === true || isTopicExhausted(entry),
        lastMentionAt: toSafeTimestamp(entry.lastMentionAt, 0),
      }))
      .filter((entry) => entry.topic.length > 0)
    : [];
  if (entries.length === 0) return null;

  const byTopic = new Map(entries.map((entry) => [entry.topic, entry]));
  const playerTopics = extractConversationTopics(playerMessage);
  const relevant = playerTopics
    .map((topic) => byTopic.get(topic) ?? {
      topic,
      mentions: 1,
      novelty: 1,
      exhausted: false,
      lastMentionAt: now,
    })
    .filter((entry) => Boolean(entry));
  const active = relevant.length > 0
    ? relevant
      .slice()
      .sort((a, b) => b.lastMentionAt - a.lastMentionAt)[0]
    : entries
      .slice()
      .sort((a, b) => b.lastMentionAt - a.lastMentionAt)[0];
  const exhaustedTopics = entries
    .filter((entry) => entry.exhausted || (entry.mentions >= TOPIC_EXHAUSTION_MIN_MENTIONS && entry.novelty <= TOPIC_EXHAUSTION_MAX_NOVELTY))
    .map((entry) => entry.topic)
    .slice(0, 8);
  const activeExhausted = active
    ? (active.exhausted || (active.mentions >= TOPIC_EXHAUSTION_MIN_MENTIONS && active.novelty <= TOPIC_EXHAUSTION_MAX_NOVELTY))
    : false;

  return {
    activeTopic: active?.topic ?? null,
    activeTopicNovelty: active?.novelty ?? null,
    exhaustedTopics,
    trackedTopicCount: entries.length,
    exhausted: activeExhausted,
  };
}

function updateNpcTopicCoverage(npc, playerMessage, now) {
  const topics = extractConversationTopics(playerMessage);
  if (!Array.isArray(npc.topicCoverage)) {
    npc.topicCoverage = [];
  }
  if (topics.length === 0) return;

  const topicMap = new Map();
  for (const rawEntry of npc.topicCoverage) {
    if (!isRecord(rawEntry)) continue;
    const topic = normalizeTopicToken(String(rawEntry.topic ?? ''));
    if (!topic) continue;
    const mentions = Number.isFinite(rawEntry.mentions) ? Math.max(1, Math.floor(rawEntry.mentions)) : 1;
    const novelty = typeof rawEntry.novelty === 'number' && Number.isFinite(rawEntry.novelty)
      ? Number(Math.max(0.05, Math.min(1, rawEntry.novelty)).toFixed(4))
      : computeTopicNovelty(mentions);
    topicMap.set(topic, {
      topic,
      mentions,
      novelty,
      exhausted: rawEntry.exhausted === true || (mentions >= TOPIC_EXHAUSTION_MIN_MENTIONS && novelty <= TOPIC_EXHAUSTION_MAX_NOVELTY),
      lastMentionAt: toSafeTimestamp(rawEntry.lastMentionAt, now),
    });
  }

  for (const topic of topics) {
    const existing = topicMap.get(topic);
    const mentions = (existing?.mentions ?? 0) + 1;
    const novelty = computeTopicNovelty(mentions);
    const exhausted = mentions >= TOPIC_EXHAUSTION_MIN_MENTIONS && novelty <= TOPIC_EXHAUSTION_MAX_NOVELTY;
    if (exhausted && existing?.exhausted !== true) {
      npc.events.push({
        id: `topic_coverage:${now}:${Math.random().toString(36).slice(2, 8)}`,
        type: 'topic_coverage',
        ownerType: 'unknown',
        text: `Topic "${topic}" reached novelty exhaustion after ${mentions} mentions.`,
        timestamp: now,
        source: 'topic_coverage',
      });
    }
    topicMap.set(topic, {
      topic,
      mentions,
      novelty,
      exhausted,
      lastMentionAt: now,
    });
  }

  npc.topicCoverage = [...topicMap.values()]
    .sort((a, b) => {
      if (a.lastMentionAt !== b.lastMentionAt) return a.lastMentionAt - b.lastMentionAt;
      return a.mentions - b.mentions;
    })
    .slice(-MAX_TOPIC_COVERAGE_PER_NPC);
}

function countPlayerTurns(history) {
  if (!Array.isArray(history)) return 0;
  return history.reduce((count, entry) => {
    return entry?.role === 'player' ? count + 1 : count;
  }, 0);
}

function applyTurnToSession(session, npcId, playerMessage, npcReply) {
  if (!session) return;
  const now = Date.now();
  const npc = ensureSessionNpc(session.state, npcId);
  npc.updatedAt = now;

  const newFacts = extractSalientFacts(playerMessage);
  if (newFacts.length > 0) {
    const merged = Array.from(new Set([...npc.facts, ...newFacts]));
    npc.facts = merged.slice(-MAX_SESSION_FACTS_PER_NPC);
    for (const fact of newFacts) {
      npc.events.push({
        id: `player_fact:${now}:${Math.random().toString(36).slice(2, 8)}`,
        type: 'player_fact',
        ownerType: 'player',
        text: fact,
        timestamp: now,
        source: 'player_message',
      });
    }
  }

  const npcCommitmentMatches = String(npcReply ?? '')
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => /\b(i will|i'll|i can|i promise|let me)\b/i.test(entry))
    .slice(0, 2);
  for (const commitment of npcCommitmentMatches) {
    npc.events.push({
      id: `npc_commitment:${now}:${Math.random().toString(36).slice(2, 8)}`,
      type: 'npc_commitment',
      ownerType: 'npc',
      text: normalizeFact(commitment),
      timestamp: now,
      source: 'npc_reply',
    });
  }

  updateNpcTopicCoverage(npc, playerMessage, now);
  npc.events = npc.events.slice(-MAX_SESSION_EVENTS_PER_NPC);

  npc.history.push({ role: 'player', text: playerMessage, updatedAt: now });
  npc.history.push({ role: 'npc', text: npcReply, updatedAt: now });
  npc.history = npc.history.slice(-MAX_HISTORY_ENTRIES);
  saveSessionState(session);
}

function loadAuthoringBundle(bundlePath) {
  const pathToFile = path.resolve(bundlePath ?? DEFAULT_AUTHORING_BUNDLE_PATH);
  if (!fs.existsSync(pathToFile)) {
    return {
      pathToFile,
      loaded: false,
      bundle: null,
      error: null,
    };
  }

  try {
    const raw = fs.readFileSync(pathToFile, 'utf8');
    const parsed = parseSugarAgentAuthoringBundle(JSON.parse(raw));
    if (!parsed) {
      return {
        pathToFile,
        loaded: false,
        bundle: null,
        error: `Invalid SugarAgent authoring bundle schema: ${pathToFile}`,
      };
    }
    return {
      pathToFile,
      loaded: true,
      bundle: parsed,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      pathToFile,
      loaded: false,
      bundle: null,
      error: `Failed to read SugarAgent authoring bundle: ${message}`,
    };
  }
}

function getAuthoringContractIdFromScenarioId(scenarioId) {
  if (typeof scenarioId !== 'string') return null;
  if (!scenarioId.startsWith('authoring:')) return null;
  const candidate = scenarioId.slice('authoring:'.length).trim();
  return candidate.length > 0 ? candidate : null;
}

function resolveBundledModelPath() {
  if (fs.existsSync(BUNDLE_LOCK_PATH)) {
    try {
      const raw = fs.readFileSync(BUNDLE_LOCK_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      const modelPath = parsed?.model?.modelPath;
      if (typeof modelPath === 'string' && modelPath.length > 0) {
        const resolvedPath = path.resolve(modelPath);
        if (fs.existsSync(resolvedPath)) {
          return resolvedPath;
        }
      }
    } catch {
      // Ignore malformed lock file and continue with fallback discovery.
    }
  }

  if (fs.existsSync(DEFAULT_BUNDLED_MODEL_PATH)) {
    return DEFAULT_BUNDLED_MODEL_PATH;
  }
  if (fs.existsSync(LEGACY_BUNDLED_MODEL_PATH)) {
    return LEGACY_BUNDLED_MODEL_PATH;
  }
  return null;
}

function resolveConfiguredModelPath(args) {
  const explicitModelPath = normalizeOptionalString(args?.modelPath);
  if (explicitModelPath) {
    return explicitModelPath;
  }

  const envModelPath = normalizeOptionalString(process.env.SUGARAGENT_MODEL_PATH);
  if (envModelPath) {
    return envModelPath;
  }

  return resolveBundledModelPath();
}

function resolveRuntimeMode(args) {
  if (args.runtime === 'mock' || args.runtime === 'llama') {
    return args.runtime;
  }

  const bundledModelPath = resolveBundledModelPath();
  if (fs.existsSync(DEFAULT_BUNDLED_LLAMA_BIN) && bundledModelPath) {
    return 'llama';
  }

  const envLlamaBin = process.env.SUGARAGENT_LLAMA_BIN;
  const envModelPath = process.env.SUGARAGENT_MODEL_PATH;
  if ((args.llamaBin || envLlamaBin) && (args.modelPath || envModelPath)) {
    return 'llama';
  }

  return 'mock';
}

function commandExists(command) {
  if (!command) return false;
  if (command.includes('/') || command.startsWith('.')) {
    return fs.existsSync(command);
  }

  const lookup = spawnSync('which', [command], {
    encoding: 'utf8',
  });
  return lookup.status === 0;
}

function sanitizeRuntimeOutput(text) {
  const source = text ?? '';
  const withoutAnsi = source
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001B\][^\u0007]*(\u0007|\u001B\\)/g, '');
  return withoutAnsi.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function extractJsonCandidates(text) {
  const source = sanitizeRuntimeOutput(text);
  const candidates = [];
  const seen = new Set();

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('{') || !line.endsWith('}')) {
      continue;
    }
    if (seen.has(line)) continue;
    seen.add(line);
    candidates.push(line);
  }

  for (let start = source.indexOf('{'); start >= 0; start = source.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < source.length; i += 1) {
      const ch = source[i];
      if (!ch) continue;

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') {
        depth += 1;
        continue;
      }
      if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          const candidate = source.slice(start, i + 1);
          if (!seen.has(candidate)) {
            seen.add(candidate);
            candidates.push(candidate);
          }
          break;
        }
      }
    }
  }

  return candidates;
}

function selectBestJsonCandidate(text) {
  const candidates = extractJsonCandidates(text);
  if (candidates.length === 0) return null;

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i]?.trim();
    if (!candidate) continue;

    try {
      const parsed = JSON.parse(candidate);
      if (validateStructuredOutput(parsed).valid) {
        return JSON.stringify(parsed);
      }
    } catch {
      // Keep scanning older candidates.
    }
  }

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i]?.trim();
    if (!candidate) continue;

    try {
      const parsed = JSON.parse(candidate);
      if (isRecord(parsed)) {
        return JSON.stringify(parsed);
      }
    } catch {
      // Keep scanning older candidates.
    }
  }

  return null;
}

function normalizeStructuredOutput(value) {
  if (!isRecord(value)) return null;
  const utterance = typeof value.utterance === 'string' ? value.utterance.trim() : '';
  if (!utterance) return null;

  const normalized = {
    utterance,
    emotion: typeof value.emotion === 'string' && value.emotion.trim().length > 0
      ? value.emotion
      : 'neutral',
    intent: typeof value.intent === 'string' && value.intent.trim().length > 0
      ? value.intent
      : 'conversation',
    proposedIntents: Array.isArray(value.proposedIntents) ? value.proposedIntents : [],
    citations: Array.isArray(value.citations)
      ? value.citations.filter((entry) => isRecord(entry) && typeof entry.sourceId === 'string')
      : [],
    beatEvidence: isRecord(value.beatEvidence)
      ? {
        beatId: typeof value.beatEvidence.beatId === 'string' ? value.beatEvidence.beatId : undefined,
        coveredFacts: Array.isArray(value.beatEvidence.coveredFacts)
          ? value.beatEvidence.coveredFacts.filter((entry) => typeof entry === 'string')
          : [],
        uncoveredFacts: Array.isArray(value.beatEvidence.uncoveredFacts)
          ? value.beatEvidence.uncoveredFacts.filter((entry) => typeof entry === 'string')
          : [],
        completionSignal: typeof value.beatEvidence.completionSignal === 'string'
          ? value.beatEvidence.completionSignal
          : 'none',
        confidence: typeof value.beatEvidence.confidence === 'number'
          ? value.beatEvidence.confidence
          : 0,
      }
      : undefined,
  };

  return normalized;
}

function parseStructuredFromText(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return null;
  }

  try {
    const direct = JSON.parse(text);
    const normalized = normalizeStructuredOutput(direct);
    if (normalized) return normalized;
  } catch {
    // Fall through to candidate scanning.
  }

  const candidates = extractJsonCandidates(text);
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i];
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeStructuredOutput(parsed);
      if (normalized) return normalized;
    } catch {
      // Keep scanning older candidates.
    }
  }

  return null;
}

function sanitizePromptText(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function buildHistoryBlock(history) {
  const entries = Array.isArray(history) ? history.slice(-MAX_HISTORY_ENTRIES) : [];
  if (entries.length === 0) {
    return 'Recent conversation:\n- none';
  }

  const lines = entries.map((entry) => {
    const role = entry?.role === 'npc' ? 'npc' : 'player';
    const text = sanitizePromptText(String(entry?.text ?? '')).slice(0, 220);
    return `- ${role}: ${text}`;
  });
  return `Recent conversation:\n${lines.join('\n')}`;
}

function buildMemoryFactBlock(memoryFacts) {
  const facts = Array.isArray(memoryFacts) ? memoryFacts.slice(-MAX_SESSION_FACTS_PER_NPC) : [];
  if (facts.length === 0) {
    return 'Known player facts:\n- none';
  }
  const lines = facts.map((fact) => `- ${sanitizePromptText(String(fact)).slice(0, 220)}`);
  return `Known player facts:\n${lines.join('\n')}`;
}

function buildNpcProfileBlock(npcProfile) {
  if (!isRecord(npcProfile)) return null;
  const lines = [];
  if (typeof npcProfile.persona === 'string' && npcProfile.persona.trim().length > 0) {
    lines.push(`- Persona: ${sanitizePromptText(npcProfile.persona).slice(0, 240)}`);
  }
  if (typeof npcProfile.tone === 'string' && npcProfile.tone.trim().length > 0) {
    lines.push(`- Tone: ${sanitizePromptText(npcProfile.tone).slice(0, 120)}`);
  }
  const constraints = Array.isArray(npcProfile.constraints)
    ? npcProfile.constraints
    : Array.isArray(npcProfile.safetyBounds)
      ? npcProfile.safetyBounds
      : [];
  if (constraints.length > 0) {
    lines.push(`- Constraints: ${constraints.map((entry) => sanitizePromptText(String(entry))).join(' | ')}`);
  }
  if (Array.isArray(npcProfile.loreScopes) && npcProfile.loreScopes.length > 0) {
    lines.push(`- Lore scopes: ${npcProfile.loreScopes.map((entry) => sanitizePromptText(String(entry))).join(' | ')}`);
  }
  if (typeof npcProfile.selfEntityId === 'string' && npcProfile.selfEntityId.trim().length > 0) {
    lines.push(`- Self entity id: ${sanitizePromptText(npcProfile.selfEntityId).slice(0, 120)}`);
  }
  if (Array.isArray(npcProfile.selfLoreScopes) && npcProfile.selfLoreScopes.length > 0) {
    lines.push(`- Self lore scopes: ${npcProfile.selfLoreScopes.map((entry) => sanitizePromptText(String(entry))).join(' | ')}`);
  }
  if (Array.isArray(npcProfile.relatedLoreScopes) && npcProfile.relatedLoreScopes.length > 0) {
    lines.push(`- Related lore scopes: ${npcProfile.relatedLoreScopes.map((entry) => sanitizePromptText(String(entry))).join(' | ')}`);
  }
  if (lines.length === 0) return null;
  return ['NPC authored profile:', ...lines].join('\n');
}

function buildIdentityContractBlock(npcProfile, turnContext) {
  if (!isRecord(npcProfile)) return null;
  const lines = [];
  const selfEntityId = typeof npcProfile.selfEntityId === 'string' && npcProfile.selfEntityId.trim().length > 0
    ? npcProfile.selfEntityId.trim()
    : '';
  const hasSelfScopes = Array.isArray(npcProfile.selfLoreScopes) && npcProfile.selfLoreScopes.length > 0;
  const hasIdentityConfig = Boolean(selfEntityId) || hasSelfScopes;
  if (!hasIdentityConfig) return null;
  if (selfEntityId) {
    lines.push(`- You are canonically entity "${sanitizePromptText(selfEntityId).slice(0, 120)}".`);
  }
  if (turnContext?.queryType === 'self_query') {
    lines.push('- This is a self-question. Use only self-attributed evidence.');
    lines.push('- Do not answer with facts attributed only to other entities.');
    lines.push('- If self evidence is missing, say you are not sure.');
  }
  if (lines.length === 0) return null;
  return ['Identity grounding contract:', ...lines].join('\n');
}

function buildGlobalSafetyBlock(globalSafetyBounds) {
  if (!Array.isArray(globalSafetyBounds) || globalSafetyBounds.length === 0) return null;
  const entries = globalSafetyBounds
    .map((entry) => sanitizePromptText(String(entry)))
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return null;
  return `Global safety policy:\n- ${entries.join('\n- ')}`;
}

function buildTurnContextBlock(turnContext) {
  if (!isRecord(turnContext)) return null;
  const lines = [];
  if (typeof turnContext.gameId === 'string' && turnContext.gameId.trim().length > 0) {
    lines.push(`- Game: ${sanitizePromptText(turnContext.gameId).slice(0, 120)}`);
  }
  if (typeof turnContext.regionPath === 'string' && turnContext.regionPath.trim().length > 0) {
    lines.push(`- Region: ${sanitizePromptText(turnContext.regionPath).slice(0, 120)}`);
  }
  if (typeof turnContext.episodeId === 'string' && turnContext.episodeId.trim().length > 0) {
    lines.push(`- Episode: ${sanitizePromptText(turnContext.episodeId).slice(0, 120)}`);
  }
  if (typeof turnContext.interactionMode === 'string' && turnContext.interactionMode.trim().length > 0) {
    lines.push(`- NPC interaction mode: ${sanitizePromptText(turnContext.interactionMode).slice(0, 40)}`);
  }
  if (typeof turnContext.interactionPolicy === 'string' && turnContext.interactionPolicy.trim().length > 0) {
    lines.push(`- Engine interaction policy: ${sanitizePromptText(turnContext.interactionPolicy).slice(0, 40)}`);
  }
  if (typeof turnContext.queryType === 'string' && turnContext.queryType.trim().length > 0) {
    lines.push(`- Query type: ${sanitizePromptText(turnContext.queryType).slice(0, 64)}`);
  }
  if (typeof turnContext.routingIntent === 'string' && turnContext.routingIntent.trim().length > 0) {
    lines.push(`- Routing intent: ${sanitizePromptText(turnContext.routingIntent).slice(0, 64)}`);
  }
  if (typeof turnContext.routingPolicyPath === 'string' && turnContext.routingPolicyPath.trim().length > 0) {
    lines.push(`- Routing policy path: ${sanitizePromptText(turnContext.routingPolicyPath).slice(0, 64)}`);
  }
  if (typeof turnContext.routingConfidence === 'number' && Number.isFinite(turnContext.routingConfidence)) {
    lines.push(`- Routing confidence: ${turnContext.routingConfidence.toFixed(2)}`);
  }
  if (typeof turnContext.routingMargin === 'number' && Number.isFinite(turnContext.routingMargin)) {
    lines.push(`- Routing margin: ${turnContext.routingMargin.toFixed(2)}`);
  }
  if (typeof turnContext.isFirstMeeting === 'boolean') {
    lines.push(`- First meeting with player: ${turnContext.isFirstMeeting ? 'yes' : 'no'}`);
  }
  if (typeof turnContext.turnIndexWithNpc === 'number' && Number.isFinite(turnContext.turnIndexWithNpc)) {
    lines.push(`- Turn index with player: ${Math.max(1, Math.floor(turnContext.turnIndexWithNpc))}`);
  }
  if (isRecord(turnContext.topicCoverage)) {
    const activeTopic = normalizeOptionalString(turnContext.topicCoverage.activeTopic);
    const activeTopicNovelty = typeof turnContext.topicCoverage.activeTopicNovelty === 'number'
      && Number.isFinite(turnContext.topicCoverage.activeTopicNovelty)
      ? Number(Math.max(0, Math.min(1, turnContext.topicCoverage.activeTopicNovelty)).toFixed(2))
      : undefined;
    const exhausted = turnContext.topicCoverage.exhausted === true;
    const exhaustedTopics = Array.isArray(turnContext.topicCoverage.exhaustedTopics)
      ? turnContext.topicCoverage.exhaustedTopics
        .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
        .slice(0, 4)
      : [];
    if (activeTopic) {
      lines.push(`- Active conversation topic: ${sanitizePromptText(activeTopic).slice(0, 64)}`);
    }
    if (activeTopicNovelty !== undefined) {
      lines.push(`- Topic novelty score: ${activeTopicNovelty.toFixed(2)}`);
    }
    lines.push(`- Topic exhaustion state: ${exhausted ? 'exhausted' : 'not exhausted'}`);
    if (exhaustedTopics.length > 0) {
      lines.push(`- Exhausted topics: ${exhaustedTopics.map((entry) => sanitizePromptText(entry)).join(', ')}`);
    }
  }
  if (lines.length === 0) return null;
  return ['Runtime context:', ...lines].join('\n');
}

function isLikelySmallTalkQuery(playerMessage) {
  const source = (playerMessage ?? '').trim().toLowerCase();
  if (!source) return false;
  const normalized = source.replace(/[^a-z0-9\u00c0-\u024f\s'?]/g, ' ').replace(/\s+/g, ' ').trim();
  const patterns = [
    /\bhow are you\b/,
    /\bhow('s| is) it going\b/,
    /\bhow have you been\b/,
    /\bwhat('?s| is) up\b/,
    /\bare you (okay|ok|good)\b/,
    /\byou good\b/,
    /\bhows your day\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function normalizeRoutingSource(playerMessage) {
  const source = (playerMessage ?? '').trim();
  if (!source) return '';
  return source.replace(/\s+/g, ' ');
}

function hasLikelyQuestionForm(playerMessage) {
  const source = normalizeRoutingSource(playerMessage);
  if (!source) return false;
  if (source.includes('?')) return true;
  const normalized = source.toLowerCase();
  return /^(what|when|where|who|why|how|do|did|can|could|would|will|have|has|is|are)\b/.test(normalized);
}

function classifyTurnQueryType(playerMessage, npcName) {
  const routed = routeTurnIntent(playerMessage, npcName);
  return routeIntentToQueryType(routed.intent);
}

function routeTurnIntent(playerMessage, npcName) {
  const source = normalizeRoutingSource(playerMessage);
  if (!source) {
    return {
      intent: 'social_chat',
      confidence: 1,
      margin: 1,
      candidateScores: [{ intent: 'social_chat', score: 1 }],
      policyPath: 'chat',
    };
  }
  const lower = source.toLowerCase();
  const npcLower = (npcName ?? '').trim().toLowerCase();
  const hasQuestion = hasLikelyQuestionForm(source);
  const hasKnowledgeCue = /\b(who|what|when|where|why|how|explain|tell me|do you know|know about|know anything about|history|origin|founded|creation|remember)\b/.test(lower);

  const recallCue = /\b(remember me|have we met|did we meet|met before|what did i (say|mention|tell you)|what do you remember about me|do you remember what i|from when we talked before|from last time)\b/.test(lower);
  const biographyCue = /\b(who are you|your name|about you|about yourself|where are you from|your past|your background|your family)\b/.test(lower)
    || (/\b(you|your)\b/.test(lower) && /\b(name|past|background|family|from)\b/.test(lower));
  if (isLikelySmallTalkQuery(source)) {
    return {
      intent: 'social_chat',
      confidence: 0.94,
      margin: 0.6,
      candidateScores: [
        { intent: 'social_chat', score: 0.94 },
        { intent: 'session_recall', score: 0.16 },
      ],
      policyPath: 'chat',
    };
  }
  const worldCue = /\b(city|town|village|region|history|event|world|place|creation|founded|origin|map|forest|station|gate)\b/.test(lower);

  let otherCue = false;
  const otherTargetMatch = lower.match(/\b(?:tell me about|know(?:\s+anything)? about|what about)\s+([a-z0-9._-]{3,})\b/);
  if (otherTargetMatch) {
    const target = otherTargetMatch[1];
    const excluded = new Set([
      'you',
      'yourself',
      'your',
      'me',
      'myself',
      'town',
      'city',
      'world',
      'history',
      'place',
      'this',
      'that',
      'here',
      'there',
    ]);
    if (target && !excluded.has(target) && target !== npcLower) {
      otherCue = true;
    }
  }

  const scores = {
    social_chat: 0.18,
    session_recall: 0.08,
    identity_self: 0.1,
    lore_world: 0.1,
    lore_other: 0.1,
    mixed_knowledge: 0.1,
  };

  if (!hasQuestion && !hasKnowledgeCue) {
    scores.social_chat += 0.66;
  }
  if (recallCue && hasQuestion) {
    scores.session_recall += 0.8;
  }
  if (biographyCue) {
    scores.identity_self += 0.72;
  }
  if (worldCue) {
    scores.lore_world += 0.64;
  }
  if (otherCue) {
    scores.lore_other += 0.68;
  }

  const hasMultiKnowledgeSignals = [biographyCue, worldCue, otherCue].filter(Boolean).length >= 2;
  if (hasMultiKnowledgeSignals || (hasKnowledgeCue && !recallCue && !biographyCue && worldCue && otherCue)) {
    scores.mixed_knowledge += 0.72;
  }
  if (hasKnowledgeCue && hasQuestion) {
    scores.mixed_knowledge += 0.12;
  }

  if (recallCue && !hasQuestion) {
    scores.session_recall -= 0.3;
    scores.social_chat += 0.24;
  }

  if (biographyCue && recallCue && !worldCue && !otherCue) {
    scores.session_recall += 0.12;
  }

  const candidates = Object.entries(scores)
    .map(([intent, score]) => ({
      intent,
      score: Math.max(0, Math.min(1, score)),
    }))
    .sort((a, b) => b.score - a.score);

  const top = candidates[0] ?? { intent: 'social_chat', score: 0.5 };
  const second = candidates[1] ?? { intent: 'social_chat', score: 0 };
  const confidence = top.score;
  const margin = Math.max(0, top.score - second.score);
  const isAmbiguous = confidence < 0.48 || margin < 0.12;
  const intent = isAmbiguous ? 'unclear' : top.intent;
  const policyPath = routeIntentToPolicyPath(intent);

  return {
    intent,
    confidence: Number(confidence.toFixed(4)),
    margin: Number(margin.toFixed(4)),
    candidateScores: candidates.map((entry) => ({
      intent: entry.intent,
      score: Number(entry.score.toFixed(4)),
    })),
    policyPath,
  };
}

function routeIntentToQueryType(intent) {
  if (intent === 'identity_self') return 'self_query';
  if (intent === 'lore_world') return 'world_query';
  if (intent === 'lore_other') return 'other_query';
  if (intent === 'mixed_knowledge') return 'mixed_query';
  return 'conversation';
}

function routeIntentToPolicyPath(intent) {
  if (intent === 'session_recall') return 'memory_first';
  if (intent === 'social_chat') return 'chat';
  if (intent === 'identity_self') return 'self_knowledge';
  if (intent === 'lore_world' || intent === 'lore_other' || intent === 'mixed_knowledge') {
    return 'lore_knowledge';
  }
  return 'safe_chat';
}

function routeIntentUsesLore(intent) {
  return intent === 'identity_self'
    || intent === 'lore_world'
    || intent === 'lore_other'
    || intent === 'mixed_knowledge';
}

function routeIntentRequiresGroundingRepair(intent) {
  return intent === 'identity_self'
    || intent === 'lore_world'
    || intent === 'lore_other'
    || intent === 'mixed_knowledge';
}

function isKnowledgeSeekingQueryType(queryType) {
  return queryType === 'self_query'
    || queryType === 'other_query'
    || queryType === 'world_query'
    || queryType === 'mixed_query';
}

function evaluateLoreOverrideConfidence(matches) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return {
      shouldOverride: false,
      reason: 'no_matches',
      topScore: 0,
      secondScore: 0,
      margin: 0,
    };
  }

  const topScore = typeof matches[0]?.score === 'number' && Number.isFinite(matches[0].score)
    ? matches[0].score
    : 0;
  const secondScore = typeof matches[1]?.score === 'number' && Number.isFinite(matches[1].score)
    ? matches[1].score
    : 0;
  const margin = Math.max(0, topScore - secondScore);
  const meetsScore = topScore >= LORE_OVERRIDE_MIN_SCORE;
  const meetsMargin = matches.length < 2 || margin >= LORE_OVERRIDE_MIN_MARGIN;
  const shouldOverride = meetsScore && meetsMargin;

  return {
    shouldOverride,
    reason: shouldOverride
      ? 'ok'
      : (!meetsScore ? 'top_score_below_threshold' : 'score_margin_below_threshold'),
    topScore,
    secondScore,
    margin,
  };
}

function resolveConversationMode(turnContext, hasBeatContract) {
  const interactionMode = turnContext?.interactionMode;
  if (hasBeatContract) {
    if (interactionMode === 'hybrid') return 'hybrid';
    return 'narrative';
  }
  if (interactionMode === 'hybrid') return 'hybrid';
  return 'character';
}

function normalizeConversationModeForPolicy(mode) {
  return mode === 'narrative' || mode === 'hybrid' ? mode : 'character';
}

function resolveEvidenceBudget(mode) {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const selected = EVIDENCE_BUDGETS_BY_MODE[normalizedMode] ?? EVIDENCE_BUDGETS_BY_MODE.character;
  return {
    ...selected,
    mode: normalizedMode,
  };
}

function resolveRetrievalQualityThreshold(mode) {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const selected = RETRIEVAL_QUALITY_THRESHOLDS_BY_MODE[normalizedMode] ?? RETRIEVAL_QUALITY_THRESHOLDS_BY_MODE.character;
  return {
    ...selected,
    mode: normalizedMode,
  };
}

function resolveRerankBudgetTier({
  mode,
  queryType,
  routingIntent,
  hasBeatContract,
}) {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  if (hasBeatContract && (normalizedMode === 'narrative' || normalizedMode === 'hybrid')) {
    return 'high';
  }
  if (isKnowledgeSeekingQueryType(queryType)) {
    return normalizedMode === 'character' ? 'standard' : 'high';
  }
  if (routingIntent === 'social_chat' || routingIntent === 'unclear') {
    return 'low';
  }
  return 'standard';
}

function resolveRerankCandidateCap(mode, budgetTier) {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const tier = budgetTier === 'low' || budgetTier === 'high' ? budgetTier : 'standard';
  const byMode = RERANK_CANDIDATE_CAPS_BY_MODE[normalizedMode] ?? RERANK_CANDIDATE_CAPS_BY_MODE.character;
  const cap = byMode[tier];
  return Number.isFinite(cap) ? Math.max(1, Math.floor(cap)) : 8;
}

function normalizeGoalType(value, fallback = 'character_goal') {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return GOAL_TYPES.has(normalized) ? normalized : fallback;
}

function normalizeInitiativeAction(value, fallback = 'player_respond') {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return INITIATIVE_ACTIONS.has(normalized) ? normalized : fallback;
}

function normalizeExpectedPlayerResponseType(value, fallback = 'free_text') {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return EXPECTED_RESPONSE_TYPES.has(normalized) ? normalized : fallback;
}

function summarizeInitiativeHistory(history) {
  const recentNpcReplies = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === 'npc' && typeof entry?.text === 'string')
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

function buildGoalCandidates({
  mode,
  routingIntent,
  queryType,
  hasBeatContract,
  beatTurnPressure,
  retrievalConfidence,
  hasEvidence,
  playerHasQuestion,
  noveltyState,
}) {
  const goals = [];
  if (hasBeatContract && (mode === 'narrative' || mode === 'hybrid')) {
    goals.push({
      goalType: 'beat_goal',
      priority: beatTurnPressure ? 0.97 : 0.92,
      reason: beatTurnPressure ? 'active-beat-turn-pressure' : 'active-beat-context',
    });
  }

  if (routingIntent === 'social_chat') {
    goals.push({
      goalType: 'social_goal',
      priority: noveltyState.exhausted ? 0.42 : 0.78,
      reason: noveltyState.exhausted ? 'social-novelty-exhausted' : 'social-turn',
    });
  }

  if (routingIntent === 'session_recall' || isKnowledgeSeekingQueryType(queryType)) {
    goals.push({
      goalType: 'character_goal',
      priority: routingIntent === 'session_recall' ? 0.82 : 0.74,
      reason: routingIntent === 'session_recall' ? 'session-memory-continuity' : 'knowledge-response',
    });
  }

  if (
    routingIntent === 'unclear'
    || (isKnowledgeSeekingQueryType(queryType) && !hasEvidence)
    || (playerHasQuestion && retrievalConfidence < 0.2)
  ) {
    goals.push({
      goalType: 'repair_goal',
      priority: 0.9,
      reason: !hasEvidence ? 'insufficient-evidence' : 'clarify-player-intent',
    });
  }

  if (noveltyState.exhausted) {
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

function normalizeTopicCoverageContext(topicCoverage, playerMessage) {
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
  const exhaustedByNovelty = activeTopicNovelty !== undefined
    ? activeTopicNovelty <= TOPIC_EXHAUSTION_MAX_NOVELTY
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

function computeNoveltyState({
  history,
  turnIndexWithNpc,
  routingIntent,
  topicCoverage,
  playerMessage,
}) {
  const initiativeHistory = summarizeInitiativeHistory(history);
  const turnPressure = typeof turnIndexWithNpc === 'number' && Number.isFinite(turnIndexWithNpc)
    ? turnIndexWithNpc >= 8
    : false;
  const topicState = normalizeTopicCoverageContext(topicCoverage, playerMessage);
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

function expectedResponseTypeForAction(action, beatContract) {
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

function resolveInitiativePolicy({
  mode,
  routing,
  queryType,
  playerMessage,
  turnContext,
  history,
  beatContract,
  hasEvidence,
  retrievalConfidence,
}) {
  const routingIntent = normalizeRoutingIntent(routing?.intent) ?? 'unclear';
  const playerHasQuestion = hasLikelyQuestionForm(playerMessage);
  const turnIndexWithNpc = typeof turnContext?.turnIndexWithNpc === 'number'
    && Number.isFinite(turnContext.turnIndexWithNpc)
    ? Math.max(1, Math.floor(turnContext.turnIndexWithNpc))
    : undefined;
  const noveltyState = computeNoveltyState({
    history,
    turnIndexWithNpc,
    routingIntent,
    topicCoverage: turnContext?.topicCoverage,
    playerMessage,
  });
  const beatTurnPressure = Boolean(
    beatContract
    && typeof turnIndexWithNpc === 'number'
    && typeof beatContract?.maxTurns === 'number'
    && Number.isFinite(beatContract.maxTurns)
    && beatContract.maxTurns > 0
    && turnIndexWithNpc >= Math.max(1, beatContract.maxTurns - 1),
  );
  const goalStack = buildGoalCandidates({
    mode,
    routingIntent,
    queryType,
    hasBeatContract: Boolean(beatContract),
    beatTurnPressure,
    retrievalConfidence,
    hasEvidence,
    playerHasQuestion,
    noveltyState,
  });
  const primaryGoal = normalizeGoalType(goalStack[0]?.goalType, mode === 'narrative' || mode === 'hybrid' ? 'beat_goal' : 'character_goal');
  const secondaryGoals = goalStack
    .slice(1, 3)
    .map((entry) => normalizeGoalType(entry.goalType, 'character_goal'))
    .filter((value, index, source) => source.indexOf(value) === index);

  let action = 'player_respond';
  let initiator = 'player';
  let reason = 'default-player-response';
  if (noveltyState.exhausted && !playerHasQuestion && (mode === 'character' || routingIntent === 'social_chat' || routingIntent === 'unclear')) {
    action = 'close';
    initiator = 'npc';
    reason = noveltyState.topicExhausted ? 'topic-novelty-exhaustion-close' : 'novelty-exhaustion-close';
  } else if (routingIntent === 'session_recall' && !hasEvidence) {
    action = 'abstain';
    initiator = 'npc';
    reason = 'session-recall-missing-evidence';
  } else if (isKnowledgeSeekingQueryType(queryType) && !hasEvidence) {
    action = 'abstain';
    initiator = 'npc';
    reason = 'knowledge-turn-missing-evidence';
  } else if (routingIntent === 'unclear' || (playerHasQuestion && retrievalConfidence < 0.2 && routingIntent !== 'session_recall')) {
    action = 'clarify';
    initiator = 'npc';
    reason = 'ambiguous-or-low-confidence-intent';
  } else if (
    beatContract
    && (mode === 'narrative' || mode === 'hybrid')
    && isLikelyGreetingOnlyMessage(playerMessage)
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
    expectedResponseTypeForAction(normalizedAction, beatContract),
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
      hasEvidence,
      beatTurnPressure,
      isFirstMeeting: turnContext?.isFirstMeeting === true,
      turnIndexWithNpc: turnIndexWithNpc ?? null,
      recentNpcQuestionCount: noveltyState.initiativeHistory.recentNpcQuestionCount,
      repeatedNpcReplyRisk: noveltyState.repeatedNpcReplyRisk,
      noveltyExhausted: noveltyState.exhausted,
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

function isSelfEvidenceMatch(matchEntry, selfEntityId) {
  if (!isRecord(matchEntry)) return false;
  if (matchEntry.selfEntityMatch === true) return true;
  if (matchEntry.pool === 'self') return true;
  if (!selfEntityId) return false;
  const normalizedSelfEntityId = selfEntityId.trim().toLowerCase();
  if (!normalizedSelfEntityId) return false;
  const chunk = isRecord(matchEntry.chunk) ? matchEntry.chunk : null;
  const metadata = chunk && isRecord(chunk.metadata) ? chunk.metadata : null;
  const entityIds = Array.isArray(metadata?.entity_ids)
    ? metadata.entity_ids.filter((entry) => typeof entry === 'string').map((entry) => entry.toLowerCase())
    : [];
  return entityIds.includes(normalizedSelfEntityId);
}

function collectPlayerEvidenceFacts(playerMessage, history) {
  const facts = [];
  const seen = new Set();

  const pushFact = (rawFact) => {
    const normalized = normalizeFact(String(rawFact ?? ''));
    if (!normalized || normalized.length < 6) return;
    const canonical = normalized.toLowerCase();
    if (seen.has(canonical)) return;
    seen.add(canonical);
    facts.push(normalized);
  };

  const pushFactsFromMessage = (rawMessage) => {
    const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
    if (!message) return;
    for (const fact of extractSalientFacts(message)) {
      pushFact(fact);
    }
    if (message.length <= 220 && !hasLikelyQuestionForm(message)) {
      pushFact(message);
    }
  };

  pushFactsFromMessage(playerMessage);
  const recentPlayerMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === 'player' && typeof entry?.text === 'string')
    .slice(-4)
    .map((entry) => entry.text);
  for (const message of recentPlayerMessages) {
    pushFactsFromMessage(message);
  }

  return facts.slice(-MAX_SESSION_FACTS_PER_NPC);
}

function buildGroundingEvidenceEntries({
  loreMatches,
  loreArtifacts,
  npcId,
  npcProfile,
  selfEntityId,
  beatContract,
  memoryFacts,
  playerMessage,
  history,
}) {
  const entries = [];
  const seen = new Set();

  const pushEntry = (entry) => {
    if (!isRecord(entry)) return;
    if (typeof entry.text !== 'string') return;
    const text = entry.text.trim();
    if (!text) return;
    const sourceType = typeof entry.sourceType === 'string' ? entry.sourceType : 'unknown';
    const sourceId = typeof entry.sourceId === 'string' && entry.sourceId.trim().length > 0
      ? entry.sourceId.trim()
      : `${sourceType}:${entries.length + 1}`;
    const dedupeKey = `${sourceType}:${text.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push({
      sourceId,
      sourceType,
      text,
      selfAttributed: entry.selfAttributed === true,
      chunkId: typeof entry.chunkId === 'string' ? entry.chunkId : undefined,
      factId: typeof entry.factId === 'string' ? entry.factId : undefined,
      verificationStatus: typeof entry.verificationStatus === 'string' ? entry.verificationStatus : undefined,
      provenance: isRecord(entry.provenance) ? entry.provenance : undefined,
      entityIds: Array.isArray(entry.entityIds)
        ? entry.entityIds.filter((value) => typeof value === 'string')
        : [],
    });
  };

  const normalizedSelfEntityId = normalizeOptionalString(selfEntityId);
  const factById = isRecord(loreArtifacts?.factById)
    ? loreArtifacts.factById
    : {};
  for (const matchEntry of Array.isArray(loreMatches) ? loreMatches : []) {
    if (!isRecord(matchEntry) || !isRecord(matchEntry.chunk)) continue;
    const chunk = matchEntry.chunk;
    const chunkId = normalizeOptionalString(chunk.chunkId);
    const chunkMetadata = isRecord(chunk.metadata) ? chunk.metadata : null;
    const entityIds = Array.isArray(chunkMetadata?.entity_ids)
      ? chunkMetadata.entity_ids.filter((entry) => typeof entry === 'string')
      : [];
    const chunkFactIds = Array.isArray(chunkMetadata?.fact_ids)
      ? chunkMetadata.fact_ids.filter((entry) => typeof entry === 'string')
      : [];
    let usedFactEntries = 0;
    for (const factId of chunkFactIds.slice(0, 4)) {
      const fact = isRecord(factById[factId]) ? factById[factId] : null;
      if (!fact) continue;
      const statement = normalizeOptionalString(fact.statement);
      if (!statement) continue;
      const verificationStatus = normalizeOptionalString(fact?.verification?.status) ?? 'available';
      if (verificationStatus === 'verification_unavailable') continue;
      usedFactEntries += 1;
      pushEntry({
        sourceId: factId,
        sourceType: 'lore_chunk',
        text: statement,
        factId,
        chunkId: chunkId ?? fact.chunkId,
        verificationStatus,
        provenance: fact.provenance,
        selfAttributed: isSelfEvidenceMatch(matchEntry, normalizedSelfEntityId),
        entityIds,
      });
    }
    if (usedFactEntries > 0) {
      continue;
    }
    const chunkSummary = normalizeOptionalString(chunk.summary);
    const chunkContent = normalizeOptionalString(chunk.content);
    const combinedText = [chunkSummary, chunkContent]
      .filter((value) => typeof value === 'string')
      .join(' ')
      .trim();
    if (!combinedText) continue;
    pushEntry({
      sourceId: chunkId ?? `lore:${entries.length + 1}`,
      sourceType: 'lore_chunk',
      text: combinedText,
      chunkId: chunkId ?? undefined,
      selfAttributed: isSelfEvidenceMatch(matchEntry, normalizedSelfEntityId),
      entityIds,
    });
  }

  const profileEvidenceParts = [];
  if (normalizedSelfEntityId) {
    profileEvidenceParts.push(`Identity entity: ${normalizedSelfEntityId}.`);
  }
  if (typeof npcProfile?.persona === 'string' && npcProfile.persona.trim().length > 0) {
    profileEvidenceParts.push(`Persona: ${npcProfile.persona.trim()}.`);
  }
  if (profileEvidenceParts.length > 0) {
    pushEntry({
      sourceId: `self:${normalizedSelfEntityId ?? normalizeOptionalString(npcId) ?? 'profile'}`,
      sourceType: 'self_profile',
      text: profileEvidenceParts.join(' '),
      selfAttributed: true,
      entityIds: normalizedSelfEntityId ? [normalizedSelfEntityId] : [],
    });
  }

  const beatId = normalizeOptionalString(beatContract?.beatId ?? beatContract?.id);
  const beatNpcId = normalizeOptionalString(beatContract?.npcId);
  const beatFacts = Array.isArray(beatContract?.requiredFacts)
    ? beatContract.requiredFacts.filter((entry) => typeof entry === 'string')
    : [];
  beatFacts.forEach((fact, index) => {
    pushEntry({
      sourceId: `${beatId ?? 'beat'}:${index + 1}`,
      sourceType: 'beat_fact',
      text: fact,
      selfAttributed: Boolean(beatNpcId && normalizeOptionalString(npcId) === beatNpcId),
      entityIds: beatNpcId ? [beatNpcId] : [],
    });
  });

  (Array.isArray(memoryFacts) ? memoryFacts : [])
    .filter((entry) => typeof entry === 'string')
    .forEach((fact, index) => {
      pushEntry({
        sourceId: `session:${index + 1}`,
        sourceType: 'session_fact',
        text: fact,
      });
    });

  const playerFacts = collectPlayerEvidenceFacts(playerMessage, history);
  playerFacts.forEach((fact, index) => {
    pushEntry({
      sourceId: `player:${index + 1}`,
      sourceType: 'player_fact',
      text: fact,
    });
  });

  return entries;
}

function createEmptyBeatEvidence() {
  return {
    coveredFacts: [],
    uncoveredFacts: [],
    completionSignal: 'none',
    confidence: 0,
  };
}

function inferEvidenceOwnerType(entry, selfEntityId, npcId) {
  const sourceType = typeof entry?.sourceType === 'string' ? entry.sourceType : 'unknown';
  if (sourceType === 'player_fact' || sourceType === 'session_fact') return 'player';
  if (sourceType === 'self_profile') return 'npc';
  if (sourceType === 'beat_fact') return 'beat';
  if (sourceType === 'lore_chunk') {
    if (entry?.selfAttributed === true) return 'npc';
    const entityIds = Array.isArray(entry?.entityIds)
      ? entry.entityIds.filter((value) => typeof value === 'string').map((value) => value.toLowerCase())
      : [];
    const normalizedSelfEntityId = normalizeOptionalString(selfEntityId)?.toLowerCase();
    const normalizedNpcId = normalizeOptionalString(npcId)?.toLowerCase();
    if (
      (normalizedSelfEntityId && entityIds.includes(normalizedSelfEntityId))
      || (normalizedNpcId && entityIds.includes(normalizedNpcId))
    ) {
      return 'npc';
    }
    if (entityIds.length > 0) return 'world';
    return 'unknown';
  }
  return 'unknown';
}

function normalizeEvidenceTextForPlan(text) {
  return sanitizePromptText(String(text ?? ''))
    .replace(/^from the archives:\s*/i, '')
    .trim();
}

const PLAN_TOKEN_STOP_WORDS = new Set([
  'a',
  'about',
  'an',
  'and',
  'anything',
  'are',
  'as',
  'at',
  'be',
  'but',
  'can',
  'could',
  'do',
  'does',
  'did',
  'for',
  'from',
  'have',
  'has',
  'had',
  'how',
  'here',
  'i',
  'im',
  'is',
  'it',
  'its',
  'know',
  'me',
  'my',
  'near',
  'of',
  'on',
  'or',
  'our',
  'something',
  'that',
  'the',
  'their',
  'them',
  'there',
  'they',
  'thing',
  'this',
  'tell',
  'to',
  'was',
  'we',
  'what',
  'when',
  'where',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

function tokenizeForPlan(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]+/g, ' ')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2 && !PLAN_TOKEN_STOP_WORDS.has(entry));
}

function lexicalOverlapScore(left, right) {
  const leftTokens = tokenizeForPlan(left);
  const rightTokens = tokenizeForPlan(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const rightSet = new Set(rightTokens);
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightSet.has(token)) overlap += 1;
  }
  return overlap / leftTokens.length;
}

function splitEvidenceIntoClaims(text, limit = 2, focusText = '') {
  const normalized = normalizeEvidenceTextForPlan(text);
  if (!normalized) return [];
  const sentences = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => normalizeFact(entry))
    .filter(Boolean);
  if (sentences.length === 0) return [];
  const maxUnits = Math.max(1, limit);
  if (sentences.length <= maxUnits) return sentences;
  const focus = normalizeEvidenceTextForPlan(focusText);
  if (!focus) return sentences.slice(0, maxUnits);

  const ranked = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      overlap: lexicalOverlapScore(focus, sentence),
    }))
    .sort((a, b) => {
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.index - b.index;
    });
  const topOverlap = ranked[0]?.overlap ?? 0;
  if (topOverlap <= 0) {
    return sentences.slice(0, maxUnits);
  }
  return ranked.slice(0, maxUnits).map((entry) => entry.sentence);
}

function countEvidenceTokens(text) {
  return tokenizeForPlan(text).length;
}

function parseSourceOrdinal(sourceId) {
  const value = normalizeOptionalString(sourceId);
  if (!value) return 0;
  const parts = value.split(':');
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part) continue;
    const parsed = Number.parseInt(part, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function sourcePriorityForBudget(item, mode) {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  switch (item.sourceType) {
    case 'beat_fact':
      return normalizedMode === 'character' ? 72 : 110;
    case 'player_fact':
      return 100;
    case 'session_fact':
      return 90;
    case 'lore_chunk':
      return 82;
    case 'self_profile':
      return 70;
    default:
      return 60;
  }
}

function ownerQueryCompatibilityScore(ownerType, queryType, routeIntent) {
  if (routeIntent === 'session_recall') {
    return ownerType === 'player' ? 1 : 0;
  }
  if (queryType === 'self_query' || routeIntent === 'identity_self') {
    if (ownerType === 'npc' || ownerType === 'beat') return 1;
    return 0.1;
  }
  if (queryType === 'world_query' || routeIntent === 'lore_world') {
    if (ownerType === 'world' || ownerType === 'beat' || ownerType === 'unknown') return 1;
    return 0.2;
  }
  if (queryType === 'other_query' || queryType === 'mixed_query' || routeIntent === 'lore_other' || routeIntent === 'mixed_knowledge') {
    return ownerType === 'player' ? 0.25 : 0.9;
  }
  return 0.7;
}

function rankEvidenceForBudget({
  items,
  mode,
  playerMessage,
  queryType,
  routeIntent,
}) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      if (!isRecord(item)) return null;
      const overlap = lexicalOverlapScore(playerMessage, item.text);
      const compatibility = ownerQueryCompatibilityScore(item.ownerType, queryType, routeIntent);
      const confidence = typeof item.confidence === 'number' && Number.isFinite(item.confidence)
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.5;
      const recencyBoost = (item.sourceType === 'player_fact' || item.sourceType === 'session_fact')
        ? Math.min(1, parseSourceOrdinal(item.sourceId) / MAX_SESSION_FACTS_PER_NPC)
        : 0;
      const sourcePriority = sourcePriorityForBudget(item, mode);
      const score = sourcePriority
        + (compatibility * 15)
        + (overlap * 12)
        + (confidence * 8)
        + (recencyBoost * 6);
      return {
        item,
        index,
        score: Number(score.toFixed(4)),
        overlap: Number(overlap.toFixed(4)),
        compatibility: Number(compatibility.toFixed(4)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      b.score - a.score
      || a.item.sourceId.localeCompare(b.item.sourceId)
      || a.index - b.index
    ));
}

function applyEvidenceBudget({
  items,
  budget,
  mode,
  playerMessage,
  queryType,
  routeIntent,
}) {
  const ranked = rankEvidenceForBudget({
    items,
    mode,
    playerMessage,
    queryType,
    routeIntent,
  });
  const usage = {
    facts: 0,
    spans: 0,
    contextTokens: 0,
    memoryItems: 0,
    beatFacts: 0,
  };
  const selected = [];
  let skippedForBudget = 0;
  for (const entry of ranked) {
    const item = entry.item;
    const tokenCost = countEvidenceTokens(item.text);
    const nextFacts = usage.facts + 1;
    const nextSpans = usage.spans + 1;
    const nextContextTokens = usage.contextTokens + tokenCost;
    const isMemoryItem = item.sourceType === 'session_fact' || item.sourceType === 'player_fact';
    const nextMemoryItems = usage.memoryItems + (isMemoryItem ? 1 : 0);
    const isBeatFact = item.sourceType === 'beat_fact';
    const nextBeatFacts = usage.beatFacts + (isBeatFact ? 1 : 0);

    if (nextFacts > budget.maxFacts) {
      skippedForBudget += 1;
      continue;
    }
    if (nextSpans > budget.maxSpans) {
      skippedForBudget += 1;
      continue;
    }
    if (nextContextTokens > budget.maxContextTokens) {
      skippedForBudget += 1;
      continue;
    }
    if (nextMemoryItems > budget.maxMemoryFacts) {
      skippedForBudget += 1;
      continue;
    }
    if (nextBeatFacts > budget.maxBeatFacts) {
      skippedForBudget += 1;
      continue;
    }

    selected.push(item);
    usage.facts = nextFacts;
    usage.spans = nextSpans;
    usage.contextTokens = nextContextTokens;
    usage.memoryItems = nextMemoryItems;
    usage.beatFacts = nextBeatFacts;
  }

  return {
    selectedItems: selected,
    usage,
    withinBudget: true,
    droppedCount: skippedForBudget,
    rankedCount: ranked.length,
  };
}

function buildLoreArtifactVersionToken(loreArtifacts) {
  if (!isRecord(loreArtifacts?.manifest)) return 'no-lore-artifact';
  const manifest = loreArtifacts.manifest;
  const schemaVersion = normalizeOptionalString(String(manifest.schemaVersion ?? '1')) ?? '1';
  const loreArtifactVersion = normalizeOptionalString(manifest.loreArtifactVersion) ?? 'unknown-artifact';
  const toolVersion = normalizeOptionalString(manifest.toolVersion) ?? 'unknown-tool';
  const sourceCommit = normalizeOptionalString(manifest?.source?.commit) ?? 'unknown-commit';
  return `schema:${schemaVersion}|artifact:${loreArtifactVersion}|tool:${toolVersion}|commit:${sourceCommit}`;
}

function normalizeScopesForCache(scopes) {
  return normalizeStringArray(scopes)
    .map((entry) => entry.toLowerCase())
    .sort((a, b) => a.localeCompare(b));
}

function buildRerankCacheKey({
  query,
  queryType,
  routingIntent,
  mode,
  budgetTier,
  loreScopes,
  selfLoreScopes,
  relatedLoreScopes,
  selfEntityId,
  artifactVersion,
  modelVersion,
}) {
  const normalizedQuery = tokenizeForPlan(query).join(' ');
  const scopes = [
    ...normalizeScopesForCache(loreScopes),
    ...normalizeScopesForCache(selfLoreScopes),
    ...normalizeScopesForCache(relatedLoreScopes),
  ].join(',');
  const selfEntity = normalizeOptionalString(selfEntityId)?.toLowerCase() ?? 'none';
  return [
    `q=${normalizedQuery}`,
    `qt=${queryType}`,
    `ri=${routingIntent}`,
    `mode=${mode}`,
    `tier=${budgetTier}`,
    `scope=${scopes || 'none'}`,
    `self=${selfEntity}`,
    `artifact=${artifactVersion}`,
    `model=${modelVersion}`,
  ].join('|');
}

function computeRerankEntryScore({
  candidate,
  query,
  queryType,
}) {
  const baseScore = typeof candidate.score === 'number' && Number.isFinite(candidate.score)
    ? Math.max(0, Math.min(1, candidate.score / 4))
    : 0.3;
  const evidenceText = normalizeEvidenceTextForPlan(
    `${normalizeOptionalString(candidate?.chunk?.summary) ?? ''} ${normalizeOptionalString(candidate?.chunk?.content) ?? ''}`,
  );
  const overlap = lexicalOverlapScore(query, evidenceText);
  let poolBoost = 0;
  if (candidate.pool === 'self') poolBoost += 0.18;
  if (candidate.pool === 'related') poolBoost += queryType === 'other_query' ? 0.12 : 0.02;
  if (candidate.pool === 'ambient') poolBoost += queryType === 'world_query' ? 0.1 : 0.03;
  const rerankScore = (baseScore * 0.48) + (overlap * 0.42) + poolBoost;
  return Number(Math.max(0, Math.min(1, rerankScore)).toFixed(4));
}

function rerankLoreMatches({
  candidates,
  query,
  queryType,
  mode,
  budgetTier,
  cache,
  cacheKey,
}) {
  const candidateCap = resolveRerankCandidateCap(mode, budgetTier);
  const startedAt = Date.now();

  if (cache?.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    return {
      ranked: Array.isArray(cached?.ranked) ? cached.ranked : [],
      candidateCap,
      cacheHit: true,
      latencyMs: Date.now() - startedAt,
    };
  }

  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      ...candidate,
      rerankScore: computeRerankEntryScore({
        candidate,
        query,
        queryType,
      }),
    }))
    .sort((a, b) => (
      b.rerankScore - a.rerankScore
      || a.poolRank - b.poolRank
      || String(a?.chunk?.chunkId ?? '').localeCompare(String(b?.chunk?.chunkId ?? ''))
    ))
    .slice(0, candidateCap);

  if (cache) {
    cache.set(cacheKey, { ranked });
    if (cache.size > RERANK_CACHE_MAX_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (typeof oldestKey === 'string') {
        cache.delete(oldestKey);
      }
    }
  }

  return {
    ranked,
    candidateCap,
    cacheHit: false,
    latencyMs: Date.now() - startedAt,
  };
}

function computeEvidenceConflictRisk(matches) {
  const selected = Array.isArray(matches) ? matches : [];
  if (selected.length < 2) return 0;
  const negationPattern = /\b(no|not|never|none|without|cannot|can't|isn't|aren't|wasn't|weren't|didn't|don't|doesn't)\b/i;
  let comparablePairs = 0;
  let conflictingPairs = 0;
  for (let i = 0; i < selected.length; i += 1) {
    for (let j = i + 1; j < selected.length; j += 1) {
      const leftText = normalizeEvidenceTextForPlan(
        `${normalizeOptionalString(selected[i]?.chunk?.summary) ?? ''} ${normalizeOptionalString(selected[i]?.chunk?.content) ?? ''}`,
      );
      const rightText = normalizeEvidenceTextForPlan(
        `${normalizeOptionalString(selected[j]?.chunk?.summary) ?? ''} ${normalizeOptionalString(selected[j]?.chunk?.content) ?? ''}`,
      );
      const overlap = lexicalOverlapScore(leftText, rightText);
      if (overlap < 0.22) continue;
      comparablePairs += 1;
      const leftNegated = negationPattern.test(leftText);
      const rightNegated = negationPattern.test(rightText);
      if (leftNegated !== rightNegated) {
        conflictingPairs += 1;
      }
    }
  }
  if (comparablePairs === 0) return 0;
  return Number((conflictingPairs / comparablePairs).toFixed(4));
}

function computeEvidenceCoverageScore(query, matches) {
  const queryTokens = tokenizeForPlan(query);
  if (queryTokens.length === 0) return 1;
  const evidenceTokens = new Set();
  for (const entry of Array.isArray(matches) ? matches : []) {
    const text = normalizeEvidenceTextForPlan(
      `${normalizeOptionalString(entry?.chunk?.summary) ?? ''} ${normalizeOptionalString(entry?.chunk?.content) ?? ''}`,
    );
    for (const token of tokenizeForPlan(text)) {
      evidenceTokens.add(token);
    }
  }
  if (evidenceTokens.size === 0) return 0;
  let covered = 0;
  for (const token of queryTokens) {
    if (evidenceTokens.has(token)) covered += 1;
  }
  return Number((covered / queryTokens.length).toFixed(4));
}

function normalizeRetrievalSupportScore(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(1, value / 4));
}

function computeSupportConfidence(matches) {
  const selected = Array.isArray(matches) ? matches : [];
  if (selected.length === 0) return 0;
  const total = selected.reduce((sum, entry) => {
    return sum + normalizeRetrievalSupportScore(entry?.rerankScore ?? entry?.score ?? 0);
  }, 0);
  return Number((total / selected.length).toFixed(4));
}

function evaluateRetrievalQuality({
  query,
  mode,
  queryType,
  routeIntent,
  selectedMatches,
}) {
  const knowledgeTurn = isKnowledgeSeekingQueryType(queryType)
    || routeIntent === 'identity_self'
    || routeIntent === 'lore_world'
    || routeIntent === 'lore_other'
    || routeIntent === 'mixed_knowledge';
  if (!knowledgeTurn) {
    return {
      required: false,
      pass: true,
      reason: 'not_required',
      coverage: 1,
      conflictRisk: 0,
      supportConfidence: 1,
    };
  }
  if (!Array.isArray(selectedMatches) || selectedMatches.length === 0) {
    return {
      required: true,
      pass: false,
      reason: 'no_candidates',
      coverage: 0,
      conflictRisk: 0,
      supportConfidence: 0,
    };
  }
  const thresholds = resolveRetrievalQualityThreshold(mode);
  const coverage = computeEvidenceCoverageScore(query, selectedMatches);
  const conflictRisk = computeEvidenceConflictRisk(selectedMatches);
  const supportConfidence = computeSupportConfidence(selectedMatches);

  if (coverage < thresholds.minCoverage) {
    return {
      required: true,
      pass: false,
      reason: 'coverage_low',
      coverage,
      conflictRisk,
      supportConfidence,
    };
  }
  if (supportConfidence < thresholds.minSupportConfidence) {
    return {
      required: true,
      pass: false,
      reason: 'support_low',
      coverage,
      conflictRisk,
      supportConfidence,
    };
  }
  if (conflictRisk > thresholds.maxConflictRisk) {
    return {
      required: true,
      pass: false,
      reason: 'conflict_risk_high',
      coverage,
      conflictRisk,
      supportConfidence,
    };
  }
  return {
    required: true,
    pass: true,
    reason: 'sufficient',
    coverage,
    conflictRisk,
    supportConfidence,
  };
}

function buildCorrectiveLoreQuery(playerMessage, queryType, routeIntent) {
  const base = tokenizeForPlan(playerMessage).slice(0, 16).join(' ');
  if (!base) return playerMessage;
  if (queryType === 'self_query' || routeIntent === 'identity_self') {
    return `self identity ${base}`;
  }
  if (queryType === 'world_query' || routeIntent === 'lore_world') {
    return `world lore ${base}`;
  }
  if (queryType === 'other_query' || routeIntent === 'lore_other') {
    return `related character ${base}`;
  }
  if (queryType === 'mixed_query' || routeIntent === 'mixed_knowledge') {
    return `world and character ${base}`;
  }
  return base;
}

function buildEvidencePack({
  evidenceEntries,
  loreMatches,
  mode,
  playerMessage,
  queryType,
  routing,
  selfEntityId,
  npcId,
}) {
  const loreScoreBySourceId = new Map();
  for (const matchEntry of Array.isArray(loreMatches) ? loreMatches : []) {
    if (!isRecord(matchEntry) || !isRecord(matchEntry.chunk)) continue;
    const chunkId = normalizeOptionalString(matchEntry.chunk.chunkId);
    if (!chunkId) continue;
    const score = typeof matchEntry.score === 'number' && Number.isFinite(matchEntry.score)
      ? Math.max(0, Math.min(1, matchEntry.score / 3))
      : 0.4;
    loreScoreBySourceId.set(chunkId, score);
  }

  const items = [];
  const evidenceIdToItem = new Map();
  for (const entry of Array.isArray(evidenceEntries) ? evidenceEntries : []) {
    if (!isRecord(entry)) continue;
    const sourceId = normalizeOptionalString(entry.sourceId);
    const sourceType = normalizeOptionalString(entry.sourceType) ?? 'unknown';
    const text = normalizeEvidenceTextForPlan(entry.text);
    if (!sourceId || !text) continue;
    const confidence = sourceType === 'lore_chunk'
      ? (loreScoreBySourceId.get(sourceId) ?? 0.5)
      : sourceType === 'player_fact' || sourceType === 'session_fact'
        ? 0.95
        : sourceType === 'self_profile'
          ? 0.9
          : sourceType === 'beat_fact'
            ? 0.88
            : 0.6;
    const ownerType = inferEvidenceOwnerType(entry, selfEntityId, npcId);
    const evidenceItem = {
      evidenceId: `ev_${items.length + 1}`,
      sourceId,
      sourceType,
      ownerType,
      text,
      factId: normalizeOptionalString(entry.factId),
      chunkId: normalizeOptionalString(entry.chunkId),
      verificationStatus: normalizeOptionalString(entry.verificationStatus) ?? 'available',
      provenance: isRecord(entry.provenance) ? entry.provenance : undefined,
      entityIds: Array.isArray(entry.entityIds)
        ? entry.entityIds.filter((value) => typeof value === 'string')
        : [],
      selfAttributed: entry.selfAttributed === true,
      confidence: Number(confidence.toFixed(4)),
    };
    items.push(evidenceItem);
  }

  const budget = resolveEvidenceBudget(mode);
  const budgeted = applyEvidenceBudget({
    items,
    budget,
    mode,
    playerMessage,
    queryType,
    routeIntent: routing?.intent ?? 'unclear',
  });
  const budgetedItems = budgeted.selectedItems.map((item, index) => ({
    ...item,
    evidenceId: `ev_${index + 1}`,
  }));
  for (const item of budgetedItems) {
    evidenceIdToItem.set(item.evidenceId, item);
  }

  const ownerCounts = {};
  const sourceTypeCounts = {};
  for (const item of budgetedItems) {
    ownerCounts[item.ownerType] = (ownerCounts[item.ownerType] ?? 0) + 1;
    sourceTypeCounts[item.sourceType] = (sourceTypeCounts[item.sourceType] ?? 0) + 1;
  }

  return {
    schemaVersion: 1,
    queryType,
    routingIntent: routing?.intent ?? 'unclear',
    policyPath: routing?.policyPath ?? 'safe_chat',
    items: budgetedItems,
    ownerCounts,
    sourceTypeCounts,
    evidenceIdToItem,
    budget: {
      mode: budget.mode,
      limits: {
        facts: budget.maxFacts,
        spans: budget.maxSpans,
        contextTokens: budget.maxContextTokens,
        memoryItems: budget.maxMemoryFacts,
        beatFacts: budget.maxBeatFacts,
      },
      usage: budgeted.usage,
      withinBudget: budgeted.withinBudget,
      droppedCount: budgeted.droppedCount,
      candidateCount: budgeted.rankedCount,
    },
  };
}

function toRecallClaimText(rawText) {
  const fact = normalizeFact(String(rawText ?? ''));
  if (!fact) return '';
  const nameMatch = fact.match(/^my name is\s+(.+)$/i);
  if (nameMatch?.[1]) return `your name is ${nameMatch[1]}`;
  const fromMatch = fact.match(/^i(?:'m| am) from\s+(.+)$/i);
  if (fromMatch?.[1]) return `you are from ${fromMatch[1]}`;
  const likeMatch = fact.match(/^i like\s+(.+)$/i);
  if (likeMatch?.[1]) return `you like ${likeMatch[1]}`;
  const speakMatch = fact.match(/^i speak\s+(.+)$/i);
  if (speakMatch?.[1]) return `you speak ${speakMatch[1]}`;
  return fact.charAt(0).toLowerCase() + fact.slice(1);
}

function pickEvidenceForIntent(evidencePack, playerMessage, intent, queryType, selfEntityId, npcId) {
  const items = Array.isArray(evidencePack?.items) ? evidencePack.items : [];
  const normalizedSelfEntityId = normalizeOptionalString(selfEntityId)?.toLowerCase();
  const normalizedNpcId = normalizeOptionalString(npcId)?.toLowerCase();

  const filtered = items.filter((item) => {
    if (!isRecord(item)) return false;
    if (item.sourceType === 'self_profile') {
      return false;
    }
    if (intent === 'session_recall') {
      return item.ownerType === 'player';
    }
    if (intent === 'identity_self' || queryType === 'self_query') {
      if (item.ownerType === 'npc') {
        // Keep self-profile metadata as planner context, not spoken canon claims.
        return item.sourceType !== 'self_profile';
      }
      if (item.ownerType === 'beat') {
        const entityIds = Array.isArray(item.entityIds) ? item.entityIds.map((entry) => String(entry).toLowerCase()) : [];
        return (
          (normalizedSelfEntityId && entityIds.includes(normalizedSelfEntityId))
          || (normalizedNpcId && entityIds.includes(normalizedNpcId))
        );
      }
      return false;
    }
    if (intent === 'lore_world' || queryType === 'world_query') {
      return item.ownerType === 'world' || item.ownerType === 'beat' || item.ownerType === 'unknown';
    }
    if (intent === 'lore_other' || queryType === 'other_query' || intent === 'mixed_knowledge' || queryType === 'mixed_query') {
      return item.ownerType !== 'player';
    }
    return true;
  });

  const ranked = filtered
    .map((item) => {
      const overlap = lexicalOverlapScore(playerMessage, item.text);
      const score = (overlap * 0.68) + (item.confidence * 0.32);
      return {
        item,
        overlap: Number(overlap.toFixed(4)),
        score: Number(score.toFixed(4)),
      };
    })
    .sort((a, b) => b.score - a.score);
  return ranked;
}

function selectKnowledgeEvidence(ranked, maxResults = 2) {
  const candidates = Array.isArray(ranked)
    ? ranked.filter((entry) => isRecord(entry) && isRecord(entry.item))
    : [];
  if (candidates.length === 0) return [];
  const overlapCandidates = candidates.filter((entry) => Number(entry.overlap) > 0);
  if (overlapCandidates.length > 0) {
    return overlapCandidates.slice(0, Math.max(1, maxResults));
  }
  return candidates.slice(0, 1);
}

function buildClarificationQuestion({ queryType, routeIntent }) {
  if (routeIntent === 'session_recall') {
    return 'Do you want me to recall what you have told me before, or help with something new?';
  }
  if (queryType === 'self_query') {
    return 'Do you want to know about me, like my role or background?';
  }
  if (queryType === 'other_query') {
    return 'Who are you asking about specifically?';
  }
  if (queryType === 'world_query' || queryType === 'mixed_query') {
    return 'Could you narrow that down to one place, person, or event?';
  }
  return 'Could you clarify what you want to know?';
}

function buildProactiveQuestion({ mode, beatContract }) {
  if ((mode === 'narrative' || mode === 'hybrid') && isRecord(beatContract)) {
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

function createNormalizedInitiativeDecision(value, fallbackPrimaryGoal = 'character_goal', beatContract = null) {
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

function createEvidenceFirstTurnPlan({
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
    pipelineVersion: PIPELINE_VERSION_V2,
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

function normalizePlanSpeechAct(value) {
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

function isPlanClaimCompatible({
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

function allowedSpeechActsForInitiativeAction(action) {
  const normalizedAction = normalizeInitiativeAction(action, 'player_respond');
  if (normalizedAction === 'abstain') return ['uncertain'];
  if (normalizedAction === 'clarify') return ['ask', 'clarify'];
  if (normalizedAction === 'close') return ['close'];
  if (normalizedAction === 'npc_initiate') return ['ask', 'chat', 'answer', 'recall'];
  return ['answer', 'recall', 'chat', 'ask'];
}

function defaultSpeechActForInitiativeAction(action) {
  const normalizedAction = normalizeInitiativeAction(action, 'player_respond');
  if (normalizedAction === 'abstain') return 'uncertain';
  if (normalizedAction === 'clarify') return 'ask';
  if (normalizedAction === 'close') return 'close';
  return 'chat';
}

function validateAndRepairTurnPlan({
  plan,
  evidencePack,
  queryType,
  routeIntent,
  selfEntityId,
  npcId,
  initiativePolicy,
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
      pipelineVersion: PIPELINE_VERSION_V2,
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

function maybePrefixCopula(text) {
  const source = normalizeFact(text);
  if (!source) return '';
  const lower = source.toLowerCase();
  if (
    lower.startsWith('a ')
    || lower.startsWith('an ')
    || lower.startsWith('the ')
  ) {
    return `It's ${source}`;
  }
  return source;
}

function dedupeOrderedStrings(values) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const normalized = normalizeFact(value);
    if (!normalized) continue;
    const canonical = normalized.toLowerCase();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    output.push(normalized);
  }
  return output;
}

function capitalizeToken(value) {
  const source = normalizeOptionalString(value);
  if (!source) return '';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

function detectChatSignals(playerMessage) {
  const source = sanitizePromptText(playerMessage).toLowerCase();
  if (!source) {
    return {
      greeting: false,
      selfIntroName: null,
      decline: false,
      askIdentity: false,
      askDirection: false,
      askMemory: false,
    };
  }
  return {
    greeting: isLikelyGreetingOnlyMessage(source),
    selfIntroName: extractDeclaredIdentityName(playerMessage),
    decline: /\b(i do not|i don't|no thanks|not now|don't want|do not want)\b/.test(source),
    askIdentity: /\b(are you|who are you|your name)\b/.test(source),
    askDirection: /\b(where|how do i get|headed to|going to)\b/.test(source),
    askMemory: /\b(remember|met before|talked before)\b/.test(source),
  };
}

function createSocialChatReply({ playerMessage, npcName }) {
  const displayName = normalizeOptionalString(npcName) ?? 'friend';
  const signals = detectChatSignals(playerMessage);
  const playerName = normalizeOptionalString(signals.selfIntroName);
  const safePlayerName = playerName ? capitalizeToken(playerName) : null;

  if (signals.askIdentity) {
    return {
      utterance: `I am ${displayName}, a neighborhood baker. What can I help with?`,
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
    };
  }

  if (signals.askMemory) {
    return {
      utterance: "I don't remember details yet, but I'm glad to keep talking.",
      emotion: 'warm',
      intent: 'recall',
      proposedIntents: [],
      citations: [],
    };
  }

  if (safePlayerName && signals.decline) {
    return {
      utterance: `Nice to meet you, ${safePlayerName}. No worries at all, and good luck on your trip.`,
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
    };
  }

  if (safePlayerName) {
    return {
      utterance: `Nice to meet you, ${safePlayerName}. Thanks for introducing yourself.`,
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
    };
  }

  if (signals.greeting) {
    return {
      utterance: `Hi, I'm ${displayName}. What can I help with today?`,
      emotion: 'warm',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
    };
  }

  if (signals.askDirection) {
    return {
      utterance: "I might not know every route, but I can help if you tell me where you're trying to go.",
      emotion: 'neutral',
      intent: 'conversation',
      proposedIntents: [],
      citations: [],
    };
  }

  return {
    utterance: "Got it. Tell me a little more and I'll help where I can.",
    emotion: 'neutral',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
  };
}

function detectBeatCompletionSignal(beatContract, playerMessage) {
  if (!isRecord(beatContract)) return 'none';
  const normalizedMessage = normalizeFact(String(playerMessage ?? '')).toLowerCase();
  if (!normalizedMessage) return 'none';

  switch (beatContract.completionRule) {
    case 'player_ack':
      return (
        normalizedMessage.includes('got it')
        || normalizedMessage.includes('understood')
        || normalizedMessage.includes('okay')
        || normalizedMessage.includes('ok')
        || normalizedMessage.includes('thanks')
        || normalizedMessage.includes('thank you')
      )
        ? 'player_ack'
        : 'none';
    case 'player_action': {
      const normalizedTarget = normalizeOptionalString(beatContract.completionTarget)
        ? normalizeFact(String(beatContract.completionTarget)).toLowerCase()
        : null;
      return (
        normalizedMessage.includes('i did it')
        || normalizedMessage.includes('done')
        || normalizedMessage.includes('completed')
        || (normalizedTarget && normalizedMessage.includes(normalizedTarget))
      )
        ? 'player_action'
        : 'none';
    }
    case 'engine_flag':
    default:
      return 'none';
  }
}

function buildBeatEvidenceFromPlan(plan, beatContract, playerMessage) {
  if (!isRecord(beatContract)) return createEmptyBeatEvidence();
  const requiredFacts = Array.isArray(beatContract.requiredFacts)
    ? beatContract.requiredFacts.filter((entry) => typeof entry === 'string').map((entry) => normalizeFact(entry))
    : [];
  if (requiredFacts.length === 0) return createEmptyBeatEvidence();
  const claimTexts = Array.isArray(plan?.claims)
    ? plan.claims.filter((entry) => isRecord(entry) && typeof entry.text === 'string').map((entry) => String(entry.text))
    : [];
  const coveredFacts = [];
  const uncoveredFacts = [];
  for (const fact of requiredFacts) {
    const matched = claimTexts.some((claimText) => lexicalOverlapScore(fact, claimText) >= 0.45);
    if (matched) coveredFacts.push(fact);
    else uncoveredFacts.push(fact);
  }
  const completionSignal = detectBeatCompletionSignal(beatContract, playerMessage);
  const coverageRatio = requiredFacts.length > 0 ? coveredFacts.length / requiredFacts.length : 1;
  return {
    beatId: normalizeOptionalString(beatContract.beatId ?? beatContract.id),
    coveredFacts,
    uncoveredFacts,
    completionSignal,
    confidence: Math.max(0, Math.min(1, 0.2 + coverageRatio * 0.65 + (completionSignal !== 'none' ? 0.15 : 0))),
  };
}

function realizePlanTurn({
  plan,
  npcName,
  playerMessage,
  queryType,
  memoryFacts,
  beatContract,
}) {
  const speechAct = normalizePlanSpeechAct(plan?.speechAct);
  const displayName = normalizeOptionalString(npcName) ?? 'friend';
  const claims = Array.isArray(plan?.claims) ? plan.claims : [];
  const claimTexts = dedupeOrderedStrings(claims.map((entry) => maybePrefixCopula(entry?.text)));
  const citations = claims
    .flatMap((entry) => Array.isArray(entry?.evidenceIds) ? entry.evidenceIds : [])
    .filter((entry, index, source) => source.indexOf(entry) === index)
    .map((sourceId) => ({ sourceId }));

  if (speechAct === 'uncertain') {
    if (plan?.routeIntent === 'session_recall') {
      return {
        ...createDeterministicFallbackReply('what do you remember about me?', memoryFacts),
        beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
      };
    }
    return {
      ...createGroundedUncertaintyReply(queryType),
      beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  if (speechAct === 'recall') {
    if (claimTexts.length === 0) {
      return {
        ...createDeterministicFallbackReply('what do you remember about me?', memoryFacts),
        beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
      };
    }
    const utterance = claimTexts.length === 1
      ? `I remember that ${claimTexts[0]}.`
      : claimTexts.length === 2
        ? `I remember that ${claimTexts[0]}, and ${claimTexts[1]}.`
        : `I remember that ${claimTexts[0]}, ${claimTexts[1]}, and ${claimTexts.length - 2} other detail${claimTexts.length - 2 === 1 ? '' : 's'}.`;
    return {
      utterance,
      emotion: 'warm',
      intent: 'recall',
      proposedIntents: [],
      citations,
      beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  if (speechAct === 'answer') {
    if (claimTexts.length === 0) {
      return {
        ...createGroundedUncertaintyReply(queryType),
        beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
      };
    }
    const primary = claimTexts[0];
    const secondary = claimTexts[1];
    const utterance = secondary
      ? `${primary}. ${secondary}.`
      : `${primary}.`;
    return {
      utterance,
      emotion: 'grounded',
      intent: 'answer_lore',
      proposedIntents: [],
      citations,
      beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  if (speechAct === 'ask') {
    const prompt = normalizeOptionalString(plan?.questionBack)
      ?? 'What would you like to know?';
    return {
      utterance: prompt,
      emotion: 'curious',
      intent: 'question',
      proposedIntents: [],
      citations,
      beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  if (speechAct === 'close') {
    const closePrompt = normalizeOptionalString(plan?.questionBack)
      ?? 'I think that is all I can help with right now. Goodbye for now, and we can pick this up again later.';
    return {
      utterance: closePrompt,
      emotion: 'warm',
      intent: 'close',
      proposedIntents: [],
      citations,
      beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  return {
    ...createSocialChatReply({ playerMessage, npcName: displayName }),
    beatEvidence: buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
  };
}

function createEmptyGroundingDiagnostics(decision = 'accept') {
  return {
    claimChecks: [],
    summary: {
      supportedCount: 0,
      weakCount: 0,
      unsupportedCount: 0,
      nonFactualCount: 0,
      decision,
    },
    unsupportedClaims: [],
    requiresRepair: false,
    explicitUncertainty: false,
    hasSupportedSelfEvidence: false,
    thresholds: {
      accept: 0,
      weak: 0,
    },
  };
}

function withGroundingDecision(grounding, decision) {
  if (!isRecord(grounding) || !isRecord(grounding.summary)) {
    return createEmptyGroundingDiagnostics(decision);
  }
  return {
    ...grounding,
    summary: {
      ...grounding.summary,
      decision,
    },
  };
}

function normalizeForEchoCheck(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyEchoReply(utterance, playerMessage) {
  const normalizedReply = normalizeForEchoCheck(utterance);
  const normalizedPlayer = normalizeForEchoCheck(playerMessage);
  if (!normalizedReply || !normalizedPlayer) return false;
  const playerWords = normalizedPlayer.split(' ').filter(Boolean);
  if (playerWords.length < 4) return false;

  if (normalizedReply === normalizedPlayer) return true;
  if (
    (normalizedReply.startsWith(normalizedPlayer) || normalizedPlayer.startsWith(normalizedReply))
    && Math.min(normalizedReply.length, normalizedPlayer.length) >= 18
  ) {
    return true;
  }

  const replyWords = new Set(normalizedReply.split(' ').filter(Boolean));
  let overlap = 0;
  for (const word of playerWords) {
    if (replyWords.has(word)) overlap += 1;
  }
  return overlap / playerWords.length >= 0.9;
}

function isLikelyRepeatOfRecentNpcReply(utterance, history) {
  const normalizedReply = normalizeForEchoCheck(utterance);
  if (!normalizedReply) return false;

  const recentNpcReplies = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === 'npc')
    .slice(-3)
    .map((entry) => normalizeForEchoCheck(String(entry?.text ?? '')))
    .filter(Boolean);

  return recentNpcReplies.includes(normalizedReply);
}

function isLikelyRepeatOfRecentPlayerText(utterance, history) {
  const normalizedReply = normalizeForEchoCheck(utterance);
  if (!normalizedReply) return false;

  const recentPlayerMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === 'player')
    .slice(-4)
    .map((entry) => normalizeForEchoCheck(String(entry?.text ?? '')))
    .filter(Boolean);

  if (recentPlayerMessages.includes(normalizedReply)) {
    return true;
  }

  const replyWords = normalizedReply.split(' ').filter(Boolean);
  if (replyWords.length < 4) return false;

  for (const candidate of recentPlayerMessages) {
    const candidateWords = candidate.split(' ').filter(Boolean);
    if (candidateWords.length < 4) continue;
    const replySet = new Set(replyWords);
    let overlap = 0;
    for (const word of candidateWords) {
      if (replySet.has(word)) overlap += 1;
    }
    if (overlap / candidateWords.length >= 0.9) {
      return true;
    }
  }

  return false;
}

function isLikelyRawMemoryFact(utterance, memoryFacts) {
  const normalizedReply = normalizeForEchoCheck(utterance);
  if (!normalizedReply) return false;

  const normalizedFacts = (Array.isArray(memoryFacts) ? memoryFacts : [])
    .map((fact) => normalizeForEchoCheck(String(fact ?? '')))
    .filter(Boolean);

  if (normalizedFacts.includes(normalizedReply)) {
    return true;
  }

  const replyWords = normalizedReply.split(' ').filter(Boolean);
  if (replyWords.length < 4) return false;

  for (const fact of normalizedFacts) {
    const factWords = fact.split(' ').filter(Boolean);
    if (factWords.length < 4) continue;
    const replySet = new Set(replyWords);
    let overlap = 0;
    for (const word of factWords) {
      if (replySet.has(word)) overlap += 1;
    }
    if (overlap / factWords.length >= 0.9) {
      return true;
    }
  }

  return false;
}

function isLikelyFirstMeetingFamiliarityClaim(utterance) {
  const normalized = normalizeForEchoCheck(utterance);
  if (!normalized) return false;
  const patterns = [
    /\byou look familiar\b/,
    /\byou seem familiar\b/,
    /\bfamiliar face\b/,
    /\bwelcome back\b/,
    /\bgood to see you again\b/,
    /\bnice to see you again\b/,
    /\bsee you again\b/,
    /\bi remember you\b/,
    /\bremember you\b/,
    /\bwe have met\b/,
    /\bwe ve met\b/,
    /\bmet before\b/,
    /\bfrom last time\b/,
    /\bback again\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isLikelyGreetingOnlyMessage(playerMessage) {
  const normalized = normalizeForEchoCheck(playerMessage);
  if (!normalized) return false;
  const patterns = [
    /^(hi|hello|hey|hola|howdy)$/,
    /^(hi|hello|hey|hola|howdy)\s+(there|friend|baker|sir|maam|madam)$/,
    /^(good\s+morning|good\s+afternoon|good\s+evening)$/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isLikelyUngroundedFirstMeetingGreetingReply(utterance, playerMessage) {
  if (!isLikelyGreetingOnlyMessage(playerMessage)) return false;
  const normalized = normalizeForEchoCheck(utterance);
  if (!normalized) return false;
  const patterns = [
    /\bi noticed your\b/,
    /\byour\s+(shop|store|bakery|business|family|kids|children|mother|father|spouse|team|crew|inventory|quest|mission|castle|farm|house|home|town)\b/,
    /\byou\s+(own|run|manage|sell|bake|built|founded)\b/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

const PLAYER_ATTRIBUTION_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'been',
  'being',
  'but',
  'for',
  'from',
  'has',
  'have',
  'i',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'our',
  'that',
  'the',
  'their',
  'them',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'you',
  'your',
]);

const PLAYER_ATTRIBUTION_ALLOWED_GENERIC = new Set([
  'face',
  'message',
  'messages',
  'name',
  'question',
  'questions',
  'reply',
  'story',
  'words',
]);

const PLAYER_ATTRIBUTION_SYNONYMS = new Map([
  ['photo', ['photos', 'photograph', 'photographs', 'picture', 'pictures']],
  ['photos', ['photo', 'photograph', 'photographs', 'picture', 'pictures']],
  ['photograph', ['photo', 'photos', 'photographs', 'picture', 'pictures']],
  ['photographs', ['photo', 'photos', 'photograph', 'picture', 'pictures']],
  ['picture', ['photo', 'photos', 'photograph', 'photographs', 'pictures']],
  ['pictures', ['photo', 'photos', 'photograph', 'photographs', 'picture']],
  ['collection', ['collect', 'collections']],
  ['collections', ['collect', 'collection']],
  ['collect', ['collection', 'collections']],
  ['hobby', ['hobbies', 'pastime', 'pastimes']],
  ['hobbies', ['hobby', 'pastime', 'pastimes']],
  ['pastime', ['hobby', 'hobbies', 'pastimes']],
  ['pastimes', ['hobby', 'hobbies', 'pastime']],
]);

function normalizePlayerAttributionText(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stemPlayerAttributionToken(token) {
  if (typeof token !== 'string') return '';
  const value = token.trim().toLowerCase();
  if (!value) return '';
  if (value.endsWith('ies') && value.length > 4) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.endsWith('ing') && value.length > 5) {
    return value.slice(0, -3);
  }
  if (value.endsWith('ed') && value.length > 4) {
    return value.slice(0, -2);
  }
  if (value.endsWith('es') && value.length > 4) {
    return value.slice(0, -2);
  }
  if (value.endsWith('s') && value.length > 3) {
    return value.slice(0, -1);
  }
  return value;
}

function tokenizePlayerAttributionText(text) {
  return normalizePlayerAttributionText(text)
    .replace(/['’]s\b/g, '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 1 && !PLAYER_ATTRIBUTION_STOP_WORDS.has(entry));
}

function expandPlayerAttributionTokenVariants(token) {
  const variants = new Set();
  if (typeof token !== 'string' || token.trim().length === 0) return variants;
  const normalized = token.trim().toLowerCase();
  const stemmed = stemPlayerAttributionToken(normalized);
  variants.add(normalized);
  if (stemmed) variants.add(stemmed);
  const mapped = PLAYER_ATTRIBUTION_SYNONYMS.get(normalized) ?? [];
  for (const synonym of mapped) {
    const value = typeof synonym === 'string' ? synonym.trim().toLowerCase() : '';
    if (!value) continue;
    variants.add(value);
    const synonymStem = stemPlayerAttributionToken(value);
    if (synonymStem) variants.add(synonymStem);
  }
  return variants;
}

function normalizeAttributedPhrase(phrase) {
  const normalized = normalizePlayerAttributionText(phrase);
  if (!normalized) return '';
  return normalized
    .replace(/['’]s\b.*$/g, '')
    .replace(/\b(?:is|are|was|were|has|have|had|can|could|would|will|should|always|often|never|looks?|seems?|sounds?|feels?|been|being)\b.*$/g, '')
    .replace(/^(?:a|an|the|this|that|these|those|new|old)\s+/, '')
    .trim();
}

function extractPlayerAttributionPhrases(utterance) {
  const source = typeof utterance === 'string' ? utterance : '';
  if (!source.trim()) return [];
  const phrases = [];
  const seen = new Set();

  const pushPhrase = (rawPhrase) => {
    const normalized = normalizeAttributedPhrase(rawPhrase);
    if (!normalized || normalized.length < 2 || seen.has(normalized)) return;
    seen.add(normalized);
    phrases.push(normalized);
  };

  const possessivePattern = /\byour\s+([a-z0-9\u00c0-\u024f\s'-]{2,96})/gi;
  let match;
  while ((match = possessivePattern.exec(source)) !== null) {
    pushPhrase(match[1] ?? '');
  }

  const ownershipPattern = /\byou(?:'ve| have)?\s+(?:got|have|own|run|manage|collect)\s+(?:a|an|the)?\s*([a-z0-9\u00c0-\u024f\s'-]{2,96})/gi;
  while ((match = ownershipPattern.exec(source)) !== null) {
    pushPhrase(match[1] ?? '');
  }

  return phrases;
}

function buildPlayerEvidenceCorpus(playerMessage, history, memoryFacts) {
  const entries = [];
  const seen = new Set();

  const pushEntry = (rawText) => {
    const normalized = normalizePlayerAttributionText(rawText);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    entries.push(normalized);
  };

  for (const fact of Array.isArray(memoryFacts) ? memoryFacts : []) {
    if (typeof fact === 'string') pushEntry(fact);
  }

  for (const fact of collectPlayerEvidenceFacts(playerMessage, history)) {
    if (typeof fact === 'string') pushEntry(fact);
  }

  const recentPlayerMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === 'player' && typeof entry?.text === 'string')
    .slice(-6)
    .map((entry) => entry.text);
  for (const message of recentPlayerMessages) {
    pushEntry(message);
  }
  pushEntry(playerMessage);
  return entries;
}

function buildPlayerEvidenceTokenSet(evidenceCorpus) {
  const tokenSet = new Set();
  for (const evidenceText of Array.isArray(evidenceCorpus) ? evidenceCorpus : []) {
    for (const token of tokenizePlayerAttributionText(evidenceText)) {
      for (const variant of expandPlayerAttributionTokenVariants(token)) {
        tokenSet.add(variant);
      }
    }
  }
  return tokenSet;
}

function isAttributionPhraseSupportedByPlayerEvidence(phrase, evidenceCorpus, evidenceTokenSet) {
  const phraseText = normalizeAttributedPhrase(phrase);
  if (!phraseText) return true;
  const phraseTokens = tokenizePlayerAttributionText(phraseText);
  if (phraseTokens.length === 0) return true;
  if (phraseTokens.length === 1 && PLAYER_ATTRIBUTION_ALLOWED_GENERIC.has(phraseTokens[0])) {
    return true;
  }
  if (
    phraseTokens.length === 2
    && PLAYER_ATTRIBUTION_ALLOWED_GENERIC.has(phraseTokens[0])
    && PLAYER_ATTRIBUTION_ALLOWED_GENERIC.has(phraseTokens[1])
  ) {
    return true;
  }
  if ((Array.isArray(evidenceCorpus) ? evidenceCorpus : []).some((entry) => entry.includes(phraseText))) {
    return true;
  }
  return phraseTokens.every((token) => {
    const variants = expandPlayerAttributionTokenVariants(token);
    for (const variant of variants) {
      if (evidenceTokenSet.has(variant)) return true;
    }
    return false;
  });
}

function findUngroundedPlayerAttributionClaims(utterance, playerMessage, history, memoryFacts) {
  const phrases = extractPlayerAttributionPhrases(utterance);
  if (phrases.length === 0) return [];
  const evidenceCorpus = buildPlayerEvidenceCorpus(playerMessage, history, memoryFacts);
  const evidenceTokenSet = buildPlayerEvidenceTokenSet(evidenceCorpus);
  return phrases.filter((phrase) => !isAttributionPhraseSupportedByPlayerEvidence(phrase, evidenceCorpus, evidenceTokenSet));
}

function shouldEnforcePlayerAttributionGrounding(options = {}) {
  const routingIntent = normalizeRoutingIntent(options.routingIntent);
  if (routingIntent === 'session_recall' || routingIntent === 'social_chat' || routingIntent === 'unclear') {
    return true;
  }
  const queryType = normalizeQueryType(options.queryType);
  return queryType === 'conversation';
}

function normalizeIdentityName(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDeclaredIdentityName(message) {
  const source = sanitizePromptText(message);
  if (!source) return null;

  const explicitNameMatch = source.match(/\bmy name is\s+([a-z\u00c0-\u024f' -]{2,40})\b/i);
  if (explicitNameMatch?.[1]) {
    const normalized = normalizeIdentityName(explicitNameMatch[1]);
    return normalized || null;
  }

  const shortIntroMatch = source.match(/^(?:i am|i'm)\s+([a-z\u00c0-\u024f' -]{2,40})(?:[,.!?;:]|$)/i);
  if (!shortIntroMatch?.[1]) return null;
  const normalized = normalizeIdentityName(shortIntroMatch[1]);
  if (!normalized) return null;
  const excluded = new Set([
    'a',
    'an',
    'fine',
    'good',
    'okay',
    'ok',
    'here',
    'new',
    'sorry',
    'ready',
  ]);
  if (excluded.has(normalized)) return null;
  return normalized;
}

function extractPlayerDeclaredIdentityName(playerMessage, history) {
  const fromCurrent = extractDeclaredIdentityName(playerMessage);
  if (fromCurrent) return fromCurrent;

  const recentPlayerMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => entry?.role === 'player' && typeof entry?.text === 'string')
    .slice(-6)
    .map((entry) => entry.text)
    .reverse();
  for (const message of recentPlayerMessages) {
    const candidate = extractDeclaredIdentityName(message);
    if (candidate) return candidate;
  }
  return null;
}

function isLikelyNpcIdentityInversion(utterance, playerMessage, history, npcName) {
  const playerName = extractPlayerDeclaredIdentityName(playerMessage, history);
  if (!playerName) return false;
  const npcDeclaredName = extractDeclaredIdentityName(utterance);
  if (!npcDeclaredName) return false;
  if (npcDeclaredName !== playerName) return false;

  const normalizedNpcName = normalizeIdentityName(npcName);
  if (!normalizedNpcName) return true;
  if (
    normalizedNpcName === playerName
    || normalizedNpcName.includes(playerName)
    || playerName.includes(normalizedNpcName)
  ) {
    return false;
  }
  return true;
}

function validateTurnQuality(turn, playerMessage, history, memoryFacts, options = {}) {
  const initiativeAction = normalizeInitiativeAction(options?.initiativeAction, 'player_respond');
  const allowRepeatChecks = initiativeAction !== 'close';
  const normalizedReply = normalizeForEchoCheck(turn.utterance);
  const placeholderReplies = new Set([
    'utterance',
    'string',
    'response',
    'npc reply',
    'reply',
  ]);
  if (placeholderReplies.has(normalizedReply)) {
    return {
      valid: false,
      reason: 'utterance is a placeholder token',
    };
  }
  if (isLikelyEchoReply(turn.utterance, playerMessage)) {
    return {
      valid: false,
      reason: 'utterance mirrors player text',
    };
  }
  if (allowRepeatChecks && isLikelyRepeatOfRecentNpcReply(turn.utterance, history)) {
    return {
      valid: false,
      reason: 'utterance repeats recent npc reply',
    };
  }
  if (allowRepeatChecks && isLikelyRepeatOfRecentPlayerText(turn.utterance, history)) {
    return {
      valid: false,
      reason: 'utterance repeats earlier player text',
    };
  }
  if (isLikelyRawMemoryFact(turn.utterance, memoryFacts)) {
    return {
      valid: false,
      reason: 'utterance repeats remembered fact verbatim',
    };
  }
  if (isLikelyNpcIdentityInversion(turn.utterance, playerMessage, history, options.npcName)) {
    return {
      valid: false,
      reason: 'utterance adopts player identity as npc self-introduction',
    };
  }
  if (options.isFirstMeeting === true && isLikelyFirstMeetingFamiliarityClaim(turn.utterance)) {
    return {
      valid: false,
      reason: 'first meeting response implies prior familiarity',
    };
  }
  if (options.isFirstMeeting === true && isLikelyUngroundedFirstMeetingGreetingReply(turn.utterance, playerMessage)) {
    return {
      valid: false,
      reason: 'first meeting greeting includes ungrounded player assumptions',
    };
  }
  if (shouldEnforcePlayerAttributionGrounding(options)) {
    const ungroundedClaims = findUngroundedPlayerAttributionClaims(
      turn.utterance,
      playerMessage,
      history,
      memoryFacts,
    );
    if (ungroundedClaims.length > 0) {
      return {
        valid: false,
        reason: `player-attribution claim is not grounded in player evidence: ${ungroundedClaims[0]}`,
      };
    }
  }
  return { valid: true };
}

function buildLlamaPrompt({
  npcName,
  playerMessage,
  repair,
  repairReason,
  attempt,
  history,
  memoryFacts,
  npcProfile,
  globalSafetyBounds,
  turnContext,
  scenario,
  scenarioState,
}) {
  const historyBlock = buildHistoryBlock(history);
  const memoryFactBlock = buildMemoryFactBlock(memoryFacts);
  const npcProfileBlock = buildNpcProfileBlock(npcProfile);
  const identityContractBlock = buildIdentityContractBlock(npcProfile, turnContext);
  const globalSafetyBlock = buildGlobalSafetyBlock(globalSafetyBounds);
  const contextBlock = buildTurnContextBlock(turnContext);
  const isFirstMeeting = turnContext?.isFirstMeeting === true;
  const routingIntent = turnContext?.routingIntent;
  const scenarioPromptBlock = buildScenarioPromptBlock(scenario, scenarioState);
  const responseFormatLines = scenarioPromptBlock
    ? [
      'Return ONLY valid JSON with these keys:',
      '- utterance: NPC reply text',
      '- emotion: short lowercase tag (for example: warm, neutral, worried)',
      '- intent: short lowercase tag (for example: conversation, explain, ask)',
      '- proposedIntents: array of candidate engine intents (can be [])',
      '- citations: citation list, [] when none',
      '- beatEvidence: { beatId?, coveredFacts[], uncoveredFacts[], completionSignal, confidence }',
    ]
    : [
      'Return ONLY valid JSON with these keys:',
      '- utterance: NPC reply text',
      '- emotion: short lowercase tag (for example: warm, neutral, worried)',
      '- intent: short lowercase tag (for example: conversation, explain, ask)',
      '- proposedIntents: always [] for now',
      '- citations: always [] for now',
    ];

  return [
    `You are ${npcName}, an NPC in a game.`,
    'Have a short, natural back-and-forth conversation with the player.',
    'Respond in the same language as the player message unless asked to switch languages.',
    'If the player message is English, respond in English.',
    'Sound like a real person in a game world, not a template or assistant.',
    'Never repeat the player message verbatim.',
    'Do not repeat your previous response.',
    'Do not repeat older player lines verbatim.',
    'Do not repeat known player facts verbatim; paraphrase naturally.',
    'Never present player identity or player facts in first-person voice. Use second person ("you") when referring to player facts.',
    'If the player expresses concern, acknowledge it and offer a grounded response.',
    'If asked what you remember, only use known facts listed below. If there are no known facts, say you do not remember yet.',
    'Do not invent specific memories that are not in known facts or recent conversation.',
    ...(routingIntent === 'session_recall'
      ? [
        'This turn is session recall. If you mention player details, they must come from known facts or recent player messages.',
        'Do not attribute your own hobbies, possessions, or lore details to the player unless the player explicitly stated them.',
      ]
      : []),
    ...(isFirstMeeting
      ? [
        'This is the first meeting with this player.',
        'Do not imply prior familiarity, prior encounters, or remembered shared history.',
        'If the player only greets you (for example "hello"), reply with a simple introduction or offer to help.',
        'Do not assume facts about the player (for example their shop, possessions, or history) unless the player stated them.',
      ]
      : []),
    'Keep utterance concise (1-2 sentences).',
    ...(scenarioPromptBlock ? [scenarioPromptBlock] : []),
    ...(globalSafetyBlock ? [globalSafetyBlock] : []),
    ...(npcProfileBlock ? [npcProfileBlock] : []),
    ...(identityContractBlock ? [identityContractBlock] : []),
    ...(contextBlock ? [contextBlock] : []),
    memoryFactBlock,
    historyBlock,
    ...responseFormatLines,
    'Do not wrap the JSON in markdown.',
    'Do not use placeholder values like "string".',
    'Return a single JSON object and nothing else.',
    ...(repair
      ? [
        `Previous attempt was invalid: ${sanitizePromptText(repairReason ?? 'invalid output')}.`,
        'Rewrite with fresh wording and do not copy player phrasing.',
        'If first meeting is true, remove any implication that you already know the player.',
      ]
      : []),
    `attempt=${attempt}`,
    `repair_mode=${repair ? 'yes' : 'no'}`,
    `Current player message: ${playerMessage}`,
  ].join('\n');
}

function createMockRuntime(mode) {
  return {
    name: 'mock',
    calls: 0,
    loaded: false,
    async health() {
      return { ok: true, detail: 'mock-runtime-ready' };
    },
    async loadModel(_modelId) {
      this.loaded = true;
    },
    async generateStructured({ playerMessage, repair }) {
      if (!this.loaded) {
        throw new Error('Model must be loaded before generateStructured');
      }
      this.calls += 1;
      if (mode === 'always') {
        return { jsonText: '{"utterance": ' };
      }
      if (mode === 'once' && this.calls === 1 && !repair) {
        return { jsonText: '{"utterance": ' };
      }

      return {
        jsonText: JSON.stringify({
          utterance: `I heard you say: "${playerMessage}".`,
          emotion: 'warm',
          intent: 'conversation',
          proposedIntents: [],
          citations: [],
          beatEvidence: {
            coveredFacts: [],
            uncoveredFacts: [],
            completionSignal: 'none',
            confidence: 0,
          },
        }),
      };
    },
  };
}

function createLlamaCppRuntime(args) {
  const command = args.llamaBin
    ?? process.env.SUGARAGENT_LLAMA_BIN
    ?? (fs.existsSync(DEFAULT_BUNDLED_LLAMA_BIN) ? DEFAULT_BUNDLED_LLAMA_BIN : null);
  const modelPath = resolveConfiguredModelPath(args);
  if (!command) {
    throw new Error('Missing llama command. Set --llama-bin or SUGARAGENT_LLAMA_BIN.');
  }
  if (!modelPath) {
    throw new Error('Missing model path. Set --model-path or SUGARAGENT_MODEL_PATH.');
  }

  return {
    name: 'llama',
    loaded: false,
    async health() {
      if (!commandExists(command)) {
        return { ok: false, detail: `llama binary not found: ${command}` };
      }
      if (!fs.existsSync(modelPath)) {
        return { ok: false, detail: `model file not found: ${modelPath}` };
      }
      return { ok: true, detail: 'llama-runtime-ready' };
    },
    async loadModel(_modelId) {
      if (!fs.existsSync(modelPath)) {
        throw new Error(`Model file not found: ${modelPath}`);
      }
      this.loaded = true;
    },
    async generateStructured({
      npcName,
      playerMessage,
      repair,
      repairReason,
      attempt,
      history,
      memoryFacts,
      npcProfile,
      globalSafetyBounds,
      context,
      scenario,
      scenarioState,
    }) {
      if (!this.loaded) {
        throw new Error('Model must be loaded before generateStructured');
      }

      const prompt = buildLlamaPrompt({
        npcName,
        playerMessage,
        repair,
        repairReason,
        attempt,
        history,
        memoryFacts,
        npcProfile,
        globalSafetyBounds,
        turnContext: context,
        scenario,
        scenarioState,
      });
      const commandName = path.basename(command);
      const isCompletionBinary = commandName === 'llama-completion';
      const temperature = attempt >= 3 ? '0.95' : attempt === 2 ? '0.75' : '0.55';
      const llamaArgs = [
        ...args.llamaBinArgs,
        '-m',
        modelPath,
        '--device',
        'none',
        '--single-turn',
        ...(isCompletionBinary ? ['--no-conversation'] : []),
        '--no-display-prompt',
        '--color',
        'off',
        '--json-schema',
        TURN_JSON_SCHEMA,
        '-n',
        '140',
        '--ctx-size',
        '2048',
        '--temp',
        temperature,
        '--top-k',
        '60',
        '--top-p',
        '0.92',
        '--repeat-penalty',
        '1.15',
        '--presence-penalty',
        '0.3',
        '--frequency-penalty',
        '0.25',
        '--no-warmup',
        '-p',
        prompt,
        ...args.llamaArgs,
      ];

      const { stdout = '', stderr = '' } = await execFileAsync(command, llamaArgs, {
        timeout: args.llamaTimeoutMs,
        maxBuffer: 10 * 1024 * 1024,
      });

      const combined = `${stdout}\n${stderr}`;
      const rawText = sanitizeRuntimeOutput(combined).trim();
      const jsonText = selectBestJsonCandidate(combined);
      return {
        jsonText: jsonText ?? rawText,
        rawText,
      };
    },
  };
}

function createFirstMeetingFallbackReply(npcName) {
  const safeName = typeof npcName === 'string' && npcName.trim().length > 0
    ? npcName.trim()
    : 'friend';
  return {
    utterance: `Nice to meet you. I'm ${safeName}. What would you like to know?`,
    emotion: 'warm',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
  };
}

function createGroundedUncertaintyReply(queryType) {
  const utterance = queryType === 'self_query'
    ? 'I am not sure yet. I do not want to guess about my own background without records.'
    : 'I am not sure. I do not have reliable records about that right now.';
  return {
    utterance,
    emotion: 'uncertain',
    intent: 'uncertain',
    proposedIntents: [],
    citations: [],
    beatEvidence: {
      coveredFacts: [],
      uncoveredFacts: [],
      completionSignal: 'none',
      confidence: 0,
    },
  };
}

function computeRetrievalQualityScore(quality) {
  if (!isRecord(quality)) return 0;
  const coverage = typeof quality.coverage === 'number' ? quality.coverage : 0;
  const support = typeof quality.supportConfidence === 'number' ? quality.supportConfidence : 0;
  const conflictRisk = typeof quality.conflictRisk === 'number' ? quality.conflictRisk : 1;
  const score = (coverage * 0.48) + (support * 0.42) + ((1 - conflictRisk) * 0.1);
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function runGovernedLoreRetrieval({
  loreArtifacts,
  canRetrieveLore,
  shouldAttemptLoreRetrieval,
  playerMessage,
  mode,
  routingIntent,
  queryType,
  activeBeatId,
  loreScopes,
  selfLoreScopes,
  relatedLoreScopes,
  selfEntityId,
  hasBeatContract,
  rerankCache,
  artifactVersion,
  modelVersion,
  rerankerClass,
}) {
  const normalizedMode = normalizeConversationModeForPolicy(mode);
  const budgetTier = resolveRerankBudgetTier({
    mode: normalizedMode,
    queryType,
    routingIntent,
    hasBeatContract,
  });
  const candidateCap = resolveRerankCandidateCap(normalizedMode, budgetTier);
  const knowledgeTurn = isKnowledgeSeekingQueryType(queryType)
    || routingIntent === 'identity_self'
    || routingIntent === 'lore_world'
    || routingIntent === 'lore_other'
    || routingIntent === 'mixed_knowledge';
  const scopeOptions = {
    loreScopes,
    selfLoreScopes,
    relatedLoreScopes,
    selfEntityId,
    queryType,
    activeBeatIds: typeof activeBeatId === 'string' ? [activeBeatId] : [],
  };

  const baseResult = {
    loreMatches: [],
    retrievalQuality: {
      required: knowledgeTurn,
      pass: !knowledgeTurn,
      reason: !knowledgeTurn ? 'not_required' : 'no_candidates',
      coverage: knowledgeTurn ? 0 : 1,
      conflictRisk: 0,
      supportConfidence: knowledgeTurn ? 0 : 1,
      score: knowledgeTurn ? 0 : 1,
    },
    governance: {
      attempted: canRetrieveLore && shouldAttemptLoreRetrieval,
      candidateCount: 0,
      selectedCount: 0,
      correctiveAttempted: false,
      qualityPath: knowledgeTurn
        ? (canRetrieveLore && shouldAttemptLoreRetrieval ? 'single_pass' : 'no_scope')
        : 'not_required',
      qualityReason: canRetrieveLore && shouldAttemptLoreRetrieval
        ? 'not_started'
        : 'retrieval-not-allowed',
      reranker: {
        class: rerankerClass,
        budgetTier,
        candidateCap,
        cacheHit: false,
        cacheKey: null,
        artifactVersion,
        modelVersion,
        latencyMs: 0,
      },
      attempts: [],
      qualityGatePassed: !knowledgeTurn,
    },
  };

  if (!canRetrieveLore || !shouldAttemptLoreRetrieval) {
    return baseResult;
  }

  const retrieveMaxResults = Math.max(candidateCap * 2, candidateCap);
  const initialCandidates = retrieveLoreChunks(loreArtifacts, playerMessage, {
    ...scopeOptions,
    maxResults: retrieveMaxResults,
  });
  const initialCacheKey = buildRerankCacheKey({
    query: playerMessage,
    queryType,
    routingIntent,
    mode: normalizedMode,
    budgetTier,
    loreScopes,
    selfLoreScopes,
    relatedLoreScopes,
    selfEntityId,
    artifactVersion,
    modelVersion,
  });
  const initialRerank = rerankLoreMatches({
    candidates: initialCandidates,
    query: playerMessage,
    queryType,
    mode: normalizedMode,
    budgetTier,
    cache: rerankCache,
    cacheKey: initialCacheKey,
  });
  const initialSelected = initialRerank.ranked.slice(0, Math.min(3, candidateCap));
  const initialQuality = evaluateRetrievalQuality({
    query: playerMessage,
    mode: normalizedMode,
    queryType,
    routeIntent: routingIntent,
    selectedMatches: initialSelected,
  });
  const initialQualityScore = computeRetrievalQualityScore(initialQuality);

  let finalRanked = initialRerank.ranked;
  let finalSelected = initialSelected;
  let finalQuality = {
    ...initialQuality,
    score: initialQualityScore,
  };
  let qualityPath = 'single_pass';
  let qualityReason = initialQuality.reason;
  let totalRerankLatencyMs = initialRerank.latencyMs;
  let cacheHit = initialRerank.cacheHit;
  let cacheKey = initialCacheKey;
  let correctiveAttempted = false;

  const attemptLogs = [
    {
      attempt: 'initial',
      query: playerMessage,
      candidateCount: initialCandidates.length,
      selectedCount: initialSelected.length,
      quality: {
        coverage: initialQuality.coverage,
        conflictRisk: initialQuality.conflictRisk,
        supportConfidence: initialQuality.supportConfidence,
        score: initialQualityScore,
        reason: initialQuality.reason,
        pass: initialQuality.pass,
      },
      reranker: {
        cacheHit: initialRerank.cacheHit,
        latencyMs: initialRerank.latencyMs,
      },
    },
  ];

  if (knowledgeTurn && !initialQuality.pass) {
    correctiveAttempted = true;
    const correctiveQuery = buildCorrectiveLoreQuery(playerMessage, queryType, routingIntent);
    let correctiveLoreScopes = [...loreScopes];
    let correctiveSelfLoreScopes = [...selfLoreScopes];
    let correctiveRelatedLoreScopes = [...relatedLoreScopes];

    if (queryType === 'self_query' || routingIntent === 'identity_self') {
      if (correctiveSelfLoreScopes.length > 0) {
        correctiveLoreScopes = [...correctiveSelfLoreScopes];
      }
      correctiveRelatedLoreScopes = [];
    } else if (queryType === 'world_query' || routingIntent === 'lore_world') {
      correctiveSelfLoreScopes = [];
      correctiveRelatedLoreScopes = [];
    } else if (queryType === 'other_query' || routingIntent === 'lore_other') {
      correctiveSelfLoreScopes = [];
      if (correctiveRelatedLoreScopes.length > 0) {
        correctiveLoreScopes = [];
      }
    }

    const correctiveCandidates = retrieveLoreChunks(loreArtifacts, correctiveQuery, {
      ...scopeOptions,
      maxResults: retrieveMaxResults,
      loreScopes: correctiveLoreScopes,
      selfLoreScopes: correctiveSelfLoreScopes,
      relatedLoreScopes: correctiveRelatedLoreScopes,
    });
    const correctiveCacheKey = buildRerankCacheKey({
      query: correctiveQuery,
      queryType,
      routingIntent,
      mode: normalizedMode,
      budgetTier,
      loreScopes: correctiveLoreScopes,
      selfLoreScopes: correctiveSelfLoreScopes,
      relatedLoreScopes: correctiveRelatedLoreScopes,
      selfEntityId,
      artifactVersion,
      modelVersion,
    });
    const correctiveRerank = rerankLoreMatches({
      candidates: correctiveCandidates,
      query: correctiveQuery,
      queryType,
      mode: normalizedMode,
      budgetTier,
      cache: rerankCache,
      cacheKey: correctiveCacheKey,
    });
    const correctiveSelected = correctiveRerank.ranked.slice(0, Math.min(3, candidateCap));
    const correctiveQuality = evaluateRetrievalQuality({
      query: playerMessage,
      mode: normalizedMode,
      queryType,
      routeIntent: routingIntent,
      selectedMatches: correctiveSelected,
    });
    const correctiveQualityScore = computeRetrievalQualityScore(correctiveQuality);

    attemptLogs.push({
      attempt: 'corrective',
      query: correctiveQuery,
      candidateCount: correctiveCandidates.length,
      selectedCount: correctiveSelected.length,
      quality: {
        coverage: correctiveQuality.coverage,
        conflictRisk: correctiveQuality.conflictRisk,
        supportConfidence: correctiveQuality.supportConfidence,
        score: correctiveQualityScore,
        reason: correctiveQuality.reason,
        pass: correctiveQuality.pass,
      },
      reranker: {
        cacheHit: correctiveRerank.cacheHit,
        latencyMs: correctiveRerank.latencyMs,
      },
    });

    const useCorrective = correctiveQualityScore >= initialQualityScore;
    if (useCorrective) {
      finalRanked = correctiveRerank.ranked;
      finalSelected = correctiveSelected;
      finalQuality = {
        ...correctiveQuality,
        score: correctiveQualityScore,
      };
      cacheHit = correctiveRerank.cacheHit;
      cacheKey = correctiveCacheKey;
      qualityReason = correctiveQuality.reason;
    } else {
      qualityReason = initialQuality.reason;
    }
    totalRerankLatencyMs += correctiveRerank.latencyMs;
    qualityPath = finalQuality.pass ? 'corrective_pass' : 'corrective_fail';
  } else if (knowledgeTurn && initialQuality.pass) {
    qualityPath = 'single_pass';
  } else if (!knowledgeTurn) {
    qualityPath = 'not_required';
  }

  const knowledgeGatePassed = !knowledgeTurn || finalQuality.pass;
  const loreMatches = knowledgeGatePassed
    ? finalRanked.slice(0, Math.max(2, Math.min(4, candidateCap)))
    : [];
  return {
    loreMatches,
    retrievalQuality: finalQuality,
    governance: {
      attempted: true,
      candidateCount: finalRanked.length,
      selectedCount: finalSelected.length,
      correctiveAttempted,
      qualityPath,
      qualityReason,
      reranker: {
        class: rerankerClass,
        budgetTier,
        candidateCap,
        cacheHit,
        cacheKey,
        artifactVersion,
        modelVersion,
        latencyMs: totalRerankLatencyMs,
      },
      attempts: attemptLogs,
      qualityGatePassed: knowledgeGatePassed,
    },
  };
}

function createLocalProvider(_runtime, options = {}) {
  const loreArtifacts = options.loreArtifacts ?? null;
  const requireLoreScopeForRetrieval = options.requireLoreScopeForRetrieval === true;
  const rerankModelVersion = normalizeOptionalString(options.rerankModelVersion) ?? 'unknown-model';
  const rerankerClass = options.rerankerClass === 'learned' ? 'learned' : 'heuristic';
  const rerankCache = new Map();
  const loreArtifactVersion = buildLoreArtifactVersionToken(loreArtifacts);
  const groundingStats = {
    turnsValidated: 0,
    unsupportedClaimRejections: 0,
  };

  return {
    async generateStructured(input) {
      const stableNpcId = normalizeOptionalString(input.npcId)
        ?? normalizeOptionalString(input.npcName)
        ?? 'npc';
      const displayNpcName = normalizeOptionalString(input.npcName) ?? stableNpcId;
      const normalizedTurnContext = normalizeTurnContext(input.context);
      const routing = routeTurnIntent(input.playerMessage, displayNpcName);
      const hasExplicitQueryType = Boolean(normalizedTurnContext?.queryType);
      const queryType = normalizedTurnContext?.queryType
        ?? routeIntentToQueryType(routing.intent);
      const isFirstMeeting = normalizedTurnContext?.isFirstMeeting === true;

      const loreScopes = normalizeStringArray(input.npcProfile?.loreScopes);
      const selfLoreScopes = normalizeStringArray(input.npcProfile?.selfLoreScopes);
      const relatedLoreScopes = normalizeStringArray(input.npcProfile?.relatedLoreScopes);
      const selfEntityId = normalizeOptionalString(input.npcProfile?.selfEntityId);
      const requiresSelfIdentityEvidence = queryType === 'self_query'
        && (hasExplicitQueryType || routing.intent === 'identity_self' || routing.intent === 'mixed_knowledge')
        && (Boolean(selfEntityId) || selfLoreScopes.length > 0);
      const mode = resolveConversationMode(normalizedTurnContext, Boolean(input.scenario?.beatContract));
      const activeBeatId = input.scenario?.beatContract?.beatId;
      const shouldAttemptLoreRetrieval = hasExplicitQueryType
        ? isKnowledgeSeekingQueryType(queryType)
        : routeIntentUsesLore(routing.intent);
      const hasAnyScopes = loreScopes.length > 0 || selfLoreScopes.length > 0 || relatedLoreScopes.length > 0;
      const canRetrieveLore = (hasAnyScopes || !requireLoreScopeForRetrieval)
        && shouldAttemptLoreRetrieval;
      const retrievalGovernance = runGovernedLoreRetrieval({
        loreArtifacts,
        canRetrieveLore,
        shouldAttemptLoreRetrieval,
        playerMessage: input.playerMessage,
        mode,
        routingIntent: routing.intent,
        queryType,
        activeBeatId,
        loreScopes,
        selfLoreScopes,
        relatedLoreScopes,
        selfEntityId,
        hasBeatContract: Boolean(input.scenario?.beatContract),
        rerankCache,
        artifactVersion: loreArtifactVersion,
        modelVersion: rerankModelVersion,
        rerankerClass,
      });
      const loreMatches = retrievalGovernance.loreMatches;
      const loreOverrideConfidence = evaluateLoreOverrideConfidence(loreMatches);
      const groundingEvidenceEntries = buildGroundingEvidenceEntries({
        loreMatches,
        loreArtifacts,
        npcId: stableNpcId,
        npcProfile: input.npcProfile,
        selfEntityId,
        beatContract: input.scenario?.beatContract,
        memoryFacts: input.memoryFacts ?? [],
        playerMessage: input.playerMessage,
        history: input.history ?? [],
      });

      const pipelineDiagnostics = {
        version: PIPELINE_VERSION_V2,
        enabled: true,
        mode,
        routeIntent: routing.intent,
        policyPath: routing.policyPath,
        queryType,
      };

      const buildKnowledgeSafeFallback = (reason = 'unknown') => {
        const deterministicFallback = routing.intent === 'session_recall'
          ? createDeterministicFallbackReply('what do you remember about me?', input.memoryFacts ?? [])
          : (isKnowledgeSeekingQueryType(queryType)
            ? createGroundedUncertaintyReply(queryType)
            : createSocialChatReply({
              playerMessage: input.playerMessage,
              npcName: displayNpcName,
            }));
        return {
          output: deterministicFallback,
          reason,
        };
      };

      const evidencePack = buildEvidencePack({
        evidenceEntries: groundingEvidenceEntries,
        loreMatches,
        mode,
        playerMessage: input.playerMessage,
        queryType,
        routing,
        selfEntityId,
        npcId: stableNpcId,
      });
      const rankedEvidenceForInitiative = pickEvidenceForIntent(
        evidencePack,
        input.playerMessage,
        routing.intent,
        queryType,
        selfEntityId,
        stableNpcId,
      );
      const selectedEvidenceForInitiative = isKnowledgeSeekingQueryType(queryType)
        ? selectKnowledgeEvidence(rankedEvidenceForInitiative, 2)
        : rankedEvidenceForInitiative.slice(0, 2);
      const hasQualityEvidence = retrievalGovernance.governance.qualityGatePassed
        && selectedEvidenceForInitiative.length > 0;
      const initiativePolicy = resolveInitiativePolicy({
        mode: pipelineDiagnostics.mode,
        routing,
        queryType,
        playerMessage: input.playerMessage,
        turnContext: normalizedTurnContext,
        history: input.history ?? [],
        beatContract: input.scenario?.beatContract ?? null,
        hasEvidence: hasQualityEvidence,
        retrievalConfidence: isKnowledgeSeekingQueryType(queryType)
          ? retrievalGovernance.retrievalQuality.supportConfidence
          : (routing.confidence ?? 0.5),
      });
      const planned = createEvidenceFirstTurnPlan({
        npcId: stableNpcId,
        npcName: displayNpcName,
        playerMessage: input.playerMessage,
        queryType,
        routing,
        evidencePack,
        selfEntityId,
        mode: pipelineDiagnostics.mode,
        beatContract: input.scenario?.beatContract ?? null,
        initiativePolicy,
      });
      const validated = validateAndRepairTurnPlan({
        plan: planned.plan,
        evidencePack,
        queryType,
        routeIntent: routing.intent,
        selfEntityId,
        npcId: stableNpcId,
        initiativePolicy,
      });
      const finalPlan = validated.repairedPlan;
      const output = realizePlanTurn({
        plan: finalPlan,
        npcName: displayNpcName,
        playerMessage: input.playerMessage,
        queryType,
        memoryFacts: input.memoryFacts ?? [],
        beatContract: input.scenario?.beatContract ?? null,
      });
      const quality = validateTurnQuality(
        output,
        input.playerMessage,
        input.history ?? [],
        input.memoryFacts ?? [],
        {
          isFirstMeeting,
          queryType,
          routingIntent: routing.intent,
          npcName: displayNpcName,
          initiativeAction: finalPlan?.initiativeDecision?.action,
        },
      );
      if (!quality.valid) {
        const fallback = buildKnowledgeSafeFallback(quality.reason);
        const fallbackGrounding = withGroundingDecision({
          ...validateGroundedClaims({
            utterance: fallback.output.utterance,
            queryType,
            evidenceEntries: groundingEvidenceEntries,
            selfEntityId,
            requireSelfEvidence: requiresSelfIdentityEvidence,
          }),
          queryType,
          evidenceCount: groundingEvidenceEntries.length,
        }, 'fallback');
        groundingStats.turnsValidated += 1;
        return {
          output: fallback.output,
          attempts: 1,
          usedFallback: true,
          validationErrors: [`pipeline-v2 quality check failed: ${quality.reason}`],
          loreMatches: [],
          grounding: fallbackGrounding,
          groundingStats: { ...groundingStats },
          routing,
          pipeline: {
            ...pipelineDiagnostics,
            fallbackReason: quality.reason,
            evidenceBudget: evidencePack.budget ?? null,
            retrieval: {
              attempted: retrievalGovernance.governance.attempted,
              candidateCount: retrievalGovernance.governance.candidateCount,
              selectedCount: retrievalGovernance.governance.selectedCount,
              qualityPath: retrievalGovernance.governance.qualityPath,
              qualityReason: retrievalGovernance.governance.qualityReason,
              correctiveAttempted: retrievalGovernance.governance.correctiveAttempted,
              reranker: retrievalGovernance.governance.reranker,
              attempts: retrievalGovernance.governance.attempts,
              qualityGatePassed: retrievalGovernance.governance.qualityGatePassed,
            },
            retrievalQuality: {
              coverage: retrievalGovernance.retrievalQuality.coverage,
              conflictRisk: retrievalGovernance.retrievalQuality.conflictRisk,
              supportConfidence: retrievalGovernance.retrievalQuality.supportConfidence,
              score: retrievalGovernance.retrievalQuality.score,
              topScore: Number(loreOverrideConfidence.topScore.toFixed(4)),
              margin: Number(loreOverrideConfidence.margin.toFixed(4)),
              overrideEligible: loreOverrideConfidence.shouldOverride,
              reason: retrievalGovernance.retrievalQuality.reason,
            },
            initiative: {
              decision: finalPlan?.initiativeDecision ?? initiativePolicy.decision,
              goalStack: initiativePolicy.goalStack,
              inputs: initiativePolicy.inputs,
              bounds: initiativePolicy.bounds,
            },
          },
        };
      }

      const grounding = validateGroundedClaims({
        utterance: output.utterance,
        queryType,
        evidenceEntries: groundingEvidenceEntries,
        selfEntityId,
        requireSelfEvidence: requiresSelfIdentityEvidence,
      });
      const shouldEnforceGroundingRepair = (
        routeIntentRequiresGroundingRepair(routing.intent)
        || routing.intent === 'session_recall'
      );
      if (grounding.requiresRepair && shouldEnforceGroundingRepair) {
        const reason = buildClaimRepairReason(grounding);
        const fallback = buildKnowledgeSafeFallback(reason);
        const fallbackGrounding = withGroundingDecision({
          ...validateGroundedClaims({
            utterance: fallback.output.utterance,
            queryType,
            evidenceEntries: groundingEvidenceEntries,
            selfEntityId,
            requireSelfEvidence: requiresSelfIdentityEvidence,
          }),
          queryType,
          evidenceCount: groundingEvidenceEntries.length,
        }, 'fallback');
        groundingStats.turnsValidated += 1;
        groundingStats.unsupportedClaimRejections += 1;
        return {
          output: fallback.output,
          attempts: 1,
          usedFallback: true,
          validationErrors: [`pipeline-v2 grounding repair required: ${reason}`],
          loreMatches: [],
          grounding: fallbackGrounding,
          groundingStats: { ...groundingStats },
          routing,
          pipeline: {
            ...pipelineDiagnostics,
            fallbackReason: reason,
            evidenceBudget: evidencePack.budget ?? null,
            retrieval: {
              attempted: retrievalGovernance.governance.attempted,
              candidateCount: retrievalGovernance.governance.candidateCount,
              selectedCount: retrievalGovernance.governance.selectedCount,
              qualityPath: retrievalGovernance.governance.qualityPath,
              qualityReason: retrievalGovernance.governance.qualityReason,
              correctiveAttempted: retrievalGovernance.governance.correctiveAttempted,
              reranker: retrievalGovernance.governance.reranker,
              attempts: retrievalGovernance.governance.attempts,
              qualityGatePassed: retrievalGovernance.governance.qualityGatePassed,
            },
            retrievalQuality: {
              coverage: retrievalGovernance.retrievalQuality.coverage,
              conflictRisk: retrievalGovernance.retrievalQuality.conflictRisk,
              supportConfidence: retrievalGovernance.retrievalQuality.supportConfidence,
              score: retrievalGovernance.retrievalQuality.score,
              topScore: Number(loreOverrideConfidence.topScore.toFixed(4)),
              margin: Number(loreOverrideConfidence.margin.toFixed(4)),
              overrideEligible: loreOverrideConfidence.shouldOverride,
              reason: retrievalGovernance.retrievalQuality.reason,
            },
            initiative: {
              decision: finalPlan?.initiativeDecision ?? initiativePolicy.decision,
              goalStack: initiativePolicy.goalStack,
              inputs: initiativePolicy.inputs,
              bounds: initiativePolicy.bounds,
            },
          },
        };
      }

      const usedLoreChunkIds = new Set();
      const usedLoreSourceIds = new Set();
      for (const claim of Array.isArray(finalPlan.claims) ? finalPlan.claims : []) {
        if (!isRecord(claim)) continue;
        for (const evidenceId of Array.isArray(claim.evidenceIds) ? claim.evidenceIds : []) {
          if (typeof evidenceId !== 'string') continue;
          const evidenceItem = evidencePack.evidenceIdToItem.get(evidenceId);
          if (!evidenceItem || evidenceItem.sourceType !== 'lore_chunk') continue;
          usedLoreSourceIds.add(evidenceItem.sourceId);
          if (typeof evidenceItem.chunkId === 'string' && evidenceItem.chunkId.length > 0) {
            usedLoreChunkIds.add(evidenceItem.chunkId);
          } else {
            usedLoreChunkIds.add(evidenceItem.sourceId);
          }
        }
      }
      const selectedLoreMatches = loreMatches.filter((matchEntry) => {
        const chunkId = normalizeOptionalString(matchEntry?.chunk?.chunkId);
        const factIds = Array.isArray(matchEntry?.chunk?.metadata?.fact_ids)
          ? matchEntry.chunk.metadata.fact_ids.filter((entry) => typeof entry === 'string')
          : [];
        return Boolean(
          (chunkId && usedLoreChunkIds.has(chunkId))
          || factIds.some((factId) => usedLoreSourceIds.has(factId)),
        );
      });
      const acceptedGrounding = withGroundingDecision({
        ...grounding,
        queryType,
        evidenceCount: groundingEvidenceEntries.length,
      }, 'accept');
      const recallFallbackTriggered = routing.intent === 'session_recall'
        && finalPlan.speechAct === 'uncertain';
      const planValidationErrors = validated.errors.length > 0
        ? [`pipeline-v2 plan adjusted: ${validated.errors.join(' | ')}`]
        : [];
      const validationErrors = recallFallbackTriggered
        ? [...planValidationErrors, 'pipeline-v2 recall fallback: no_memory_records']
        : planValidationErrors;
      groundingStats.turnsValidated += 1;
      return {
        output,
        attempts: 1,
        usedFallback: recallFallbackTriggered,
        validationErrors,
        loreMatches: selectedLoreMatches,
        grounding: acceptedGrounding,
        groundingStats: { ...groundingStats },
        routing,
        pipeline: {
          ...pipelineDiagnostics,
          evidenceBudget: evidencePack.budget ?? null,
          evidence: {
            count: evidencePack.items.length,
            owners: evidencePack.ownerCounts,
            sourceTypes: evidencePack.sourceTypeCounts,
          },
          retrieval: {
            attempted: retrievalGovernance.governance.attempted,
            candidateCount: retrievalGovernance.governance.candidateCount,
            selectedCount: retrievalGovernance.governance.selectedCount,
            qualityPath: retrievalGovernance.governance.qualityPath,
            qualityReason: retrievalGovernance.governance.qualityReason,
            correctiveAttempted: retrievalGovernance.governance.correctiveAttempted,
            reranker: retrievalGovernance.governance.reranker,
            attempts: retrievalGovernance.governance.attempts,
            qualityGatePassed: retrievalGovernance.governance.qualityGatePassed,
          },
          planner: {
            speechAct: finalPlan.speechAct,
            initiativeAction: normalizeInitiativeAction(finalPlan?.initiativeDecision?.action, 'player_respond'),
            primaryGoal: normalizeGoalType(finalPlan?.initiativeDecision?.primaryGoal, 'character_goal'),
            claimCount: Array.isArray(finalPlan.claims) ? finalPlan.claims.length : 0,
            selectedEvidenceCount: Array.isArray(planned.plannerMeta?.selectedEvidence)
              ? planned.plannerMeta.selectedEvidence.length
              : 0,
            repaired: validated.valid === false,
            errors: validated.errors,
            droppedClaims: Array.isArray(validated.droppedClaims)
              ? validated.droppedClaims.length
              : 0,
          },
          abstention: {
            triggered: finalPlan.speechAct === 'uncertain',
            reason: typeof finalPlan?.abstention?.reason === 'string'
              ? finalPlan.abstention.reason
              : null,
          },
          realization: {
            strategy: 'deterministic-plan-v2',
          },
          retrievalQuality: {
            coverage: retrievalGovernance.retrievalQuality.coverage,
            conflictRisk: retrievalGovernance.retrievalQuality.conflictRisk,
            supportConfidence: retrievalGovernance.retrievalQuality.supportConfidence,
            score: retrievalGovernance.retrievalQuality.score,
            topScore: Number(loreOverrideConfidence.topScore.toFixed(4)),
            margin: Number(loreOverrideConfidence.margin.toFixed(4)),
            overrideEligible: loreOverrideConfidence.shouldOverride,
            reason: retrievalGovernance.retrievalQuality.reason,
          },
          initiative: {
            decision: finalPlan?.initiativeDecision ?? initiativePolicy.decision,
            goalStack: initiativePolicy.goalStack,
            inputs: initiativePolicy.inputs,
            bounds: initiativePolicy.bounds,
          },
          groundingDecision: acceptedGrounding?.summary?.decision ?? 'accept',
        },
      };
    },
  };
}

const MOCK_RUNTIME_WARNING = 'local provider is using mock runtime. Run `npm run sugaragent:bundle:local-llm -- --profile balanced` or pass --runtime llama with --llama-bin and --model-path for actual local LLM.';

const DEFAULT_SESSION_OPTIONS = {
  npc: 'baker',
  provider: 'echo',
  runtime: 'llama',
  simulateInvalidJson: 'never',
  useAuthoring: true,
  authoringBundlePath: DEFAULT_AUTHORING_BUNDLE_PATH,
  beatContractId: null,
  tickBudget: 6,
  loreDir: 'src/plugins/sugaragent/lore/generated',
  useLore: true,
  llamaBin: null,
  modelPath: null,
  llamaTimeoutMs: 120000,
  llamaBinArgs: [],
  llamaArgs: [],
  session: null,
  resetSession: null,
  scenario: null,
  npcProfileOverride: null,
  globalSafetyBoundsOverride: [],
  turnContext: null,
  requireLoreScopeForRetrieval: false,
  rerankerClass: 'learned',
};

function normalizeSessionOptions(options = {}) {
  const normalized = {
    ...DEFAULT_SESSION_OPTIONS,
    ...options,
  };

  if (typeof normalized.npc !== 'string' || normalized.npc.trim().length === 0) {
    throw new Error('Invalid value for npc.');
  }
  if (normalized.provider !== 'echo' && normalized.provider !== 'local') {
    throw new Error('Invalid value for provider. Use "echo" or "local".');
  }
  if (normalized.runtime !== 'auto' && normalized.runtime !== 'mock' && normalized.runtime !== 'llama') {
    throw new Error('Invalid value for runtime. Use "auto", "mock", or "llama".');
  }
  if (
    normalized.simulateInvalidJson !== 'never'
    && normalized.simulateInvalidJson !== 'once'
    && normalized.simulateInvalidJson !== 'always'
  ) {
    throw new Error('Invalid value for simulateInvalidJson. Use "never", "once", or "always".');
  }
  if (!Number.isFinite(normalized.llamaTimeoutMs) || normalized.llamaTimeoutMs <= 0) {
    throw new Error('Invalid value for llamaTimeoutMs. Must be a positive integer.');
  }
  if (!Number.isFinite(normalized.tickBudget) || normalized.tickBudget <= 0) {
    throw new Error('Invalid value for tickBudget. Must be a positive integer.');
  }
  if (normalized.rerankerClass !== 'heuristic' && normalized.rerankerClass !== 'learned') {
    throw new Error('Invalid value for rerankerClass. Use "heuristic" or "learned".');
  }

  normalized.npc = normalized.npc.trim();
  normalized.useLore = normalized.useLore !== false;
  normalized.useAuthoring = normalized.useAuthoring !== false;
  normalized.llamaTimeoutMs = Math.floor(normalized.llamaTimeoutMs);
  normalized.tickBudget = Math.max(1, Math.floor(normalized.tickBudget));
  normalized.llamaBinArgs = Array.isArray(normalized.llamaBinArgs)
    ? normalized.llamaBinArgs.map((entry) => String(entry))
    : [];
  normalized.llamaArgs = Array.isArray(normalized.llamaArgs)
    ? normalized.llamaArgs.map((entry) => String(entry))
    : [];
  normalized.authoringBundlePath = typeof normalized.authoringBundlePath === 'string'
    && normalized.authoringBundlePath.trim().length > 0
    ? normalized.authoringBundlePath.trim()
    : DEFAULT_AUTHORING_BUNDLE_PATH;
  normalized.beatContractId = typeof normalized.beatContractId === 'string'
    && normalized.beatContractId.trim().length > 0
    ? normalized.beatContractId.trim()
    : null;

  const scenarioContractId = getAuthoringContractIdFromScenarioId(normalized.scenario);
  if (normalized.beatContractId && scenarioContractId && normalized.beatContractId !== scenarioContractId) {
    throw new Error('When both scenario=authoring:<id> and beatContractId are provided, they must match.');
  }
  if (
    normalized.beatContractId
    && normalized.scenario
    && !scenarioContractId
    && normalized.scenario !== CADENCE_SCENARIO_ID
  ) {
    throw new Error('Do not combine beatContractId with a built-in scenario. Use either scenario=<id> or beatContractId.');
  }
  if (!normalized.beatContractId && scenarioContractId) {
    normalized.beatContractId = scenarioContractId;
  }

  if (normalized.beatContractId && normalized.useAuthoring === false) {
    throw new Error('beatContractId requires authoring support. Remove beatContractId or enable authoring.');
  }

  if (normalized.resetSession && !normalized.session) {
    normalized.session = normalized.resetSession;
  }
  if (
    normalized.resetSession
    && normalized.session
    && sanitizeSessionId(normalized.resetSession) !== sanitizeSessionId(normalized.session)
  ) {
    throw new Error('When both session and resetSession are provided, they must reference the same session ID.');
  }

  normalized.npcProfileOverride = normalizeNpcProfile(normalized.npcProfileOverride);
  normalized.globalSafetyBoundsOverride = normalizeStringArray(normalized.globalSafetyBoundsOverride);
  normalized.turnContext = normalizeTurnContext(normalized.turnContext);
  normalized.requireLoreScopeForRetrieval = normalized.requireLoreScopeForRetrieval === true;
  normalized.rerankerClass = normalized.rerankerClass === 'heuristic' ? 'heuristic' : 'learned';

  return normalized;
}

function formatLoreReference(entry) {
  const commit = typeof entry.chunk.sourceCommit === 'string' && entry.chunk.sourceCommit.length > 0
    ? `@${entry.chunk.sourceCommit}`
    : '';
  return `${entry.chunk.chunkId} (${entry.chunk.sourceFile}#${entry.chunk.sectionHeading}${commit})`;
}

function createSessionStartupInfo({
  args,
  scenario,
  authoring,
  npcProfile,
  globalSafetyBounds,
  beatContract,
  reset,
  session,
  loreArtifacts,
  turnContext,
  runtimeMode,
  runtimeWarning,
  runtimeHealth,
}) {
  return {
    npc: args.npc,
    provider: args.provider,
    pipeline: {
      version: PIPELINE_VERSION_V2,
      enabled: true,
    },
    scenario: scenario
      ? { id: scenario.id, description: scenario.description }
      : null,
    authoring: {
      enabled: args.useAuthoring,
      pathToFile: authoring?.pathToFile ?? path.resolve(args.authoringBundlePath),
      loaded: authoring?.loaded ?? false,
      profileNpcId: npcProfile?.npcId ?? null,
      globalSafetyBounds: Array.isArray(globalSafetyBounds) ? [...globalSafetyBounds] : [],
      beatContractId: beatContract?.id ?? null,
      warning: authoring?.error ?? null,
    },
    reset,
    session: session
      ? {
        id: sanitizeSessionId(args.session),
        loaded: session.loaded,
        pathToFile: session.pathToFile,
      }
      : null,
    context: turnContext ?? null,
    lore: loreArtifacts
      ? {
        loaded: true,
        chunkCount: loreArtifacts.chunks.length,
        dir: path.resolve(args.loreDir),
      }
      : {
        loaded: false,
        chunkCount: 0,
        dir: path.resolve(args.loreDir),
      },
    runtime: args.provider === 'local'
      ? {
        mode: runtimeMode,
        warning: runtimeWarning,
        health: runtimeHealth,
      }
      : null,
  };
}

export function listSugarAgentScenarioIds() {
  return [...listSimScenarioIds(), CADENCE_SCENARIO_ID];
}

export async function createSugarAgentSession(options = {}) {
  const args = normalizeSessionOptions(options);
  const requestedAuthoringContractId = args.beatContractId ?? getAuthoringContractIdFromScenarioId(args.scenario);
  const isCadenceScenario = args.scenario === CADENCE_SCENARIO_ID;

  const authoring = args.useAuthoring
    ? loadAuthoringBundle(args.authoringBundlePath)
    : {
      pathToFile: path.resolve(args.authoringBundlePath),
      loaded: false,
      bundle: null,
      error: null,
    };

  if (requestedAuthoringContractId && !authoring.loaded) {
    if (authoring.error) {
      throw new Error(authoring.error);
    }
    throw new Error(
      `Beat contract "${requestedAuthoringContractId}" requested but authoring bundle was not found at ${authoring.pathToFile}.`,
    );
  }

  const npcProfile = authoring.bundle
    ? findSugarAgentProfile(authoring.bundle, args.npc)
    : null;
  const globalSafetyBoundsFromAuthoring = Array.isArray(authoring.bundle?.policy?.globalSafetyBounds)
    ? authoring.bundle.policy.globalSafetyBounds
    : [];
  const globalSafetyBounds = mergeStringArrays(
    globalSafetyBoundsFromAuthoring,
    args.globalSafetyBoundsOverride,
  );
  const mergedNpcProfile = mergeNpcProfile(npcProfile, args.npcProfileOverride);
  const turnContext = args.turnContext;

  let selectedBeatContract = null;
  if (authoring.bundle && requestedAuthoringContractId) {
    selectedBeatContract = findSugarAgentBeatContract(authoring.bundle, {
      contractId: requestedAuthoringContractId,
      npcId: args.npc,
    });
    if (!selectedBeatContract) {
      const available = authoring.bundle.beatContracts
        .map((contract) => contract.id)
        .join(', ');
      throw new Error(
        `Beat contract "${requestedAuthoringContractId}" not found in authoring bundle. Available: ${available || 'none'}.`,
      );
    }
  }

  let scenario = isCadenceScenario ? null : getSimScenario(args.scenario);
  if (!scenario && selectedBeatContract && !isCadenceScenario) {
    scenario = createSimScenarioFromBeatContract(selectedBeatContract, {
      id: `authoring:${selectedBeatContract.id}`,
      description: `Authored beat contract ${selectedBeatContract.id} (${selectedBeatContract.questId}).`,
    });
  }
  if (args.scenario && !scenario && !requestedAuthoringContractId && !isCadenceScenario) {
    throw new Error(`Unknown scenario "${args.scenario}". Supported scenarios: ${listSugarAgentScenarioIds().join(', ')}`);
  }

  const scenarioState = createScenarioState(scenario);
  const scenarioInfo = isCadenceScenario
    ? {
      id: CADENCE_SCENARIO_ID,
      description: 'Town-scale near/mid/far cadence simulation with background planning budgets.',
    }
    : scenario;

  let reset = null;
  if (args.resetSession) {
    reset = resetSessionState(args.resetSession);
  }

  const session = args.session
    ? loadSessionState(args.session)
    : null;

  let loreArtifacts = null;
  if (args.useLore) {
    loreArtifacts = loadLoreArtifacts(args.loreDir);
  }

  let runtimeMode = null;
  let runtimeWarning = null;
  let runtimeHealth = null;
  let localProvider = null;

  if (args.provider === 'local') {
    runtimeMode = resolveRuntimeMode(args);
    if (runtimeMode === 'llama' && args.rerankerClass !== 'learned') {
      throw new Error(
        'Production reranker contract violation: runtime=llama requires rerankerClass=learned. Heuristic reranker is non-production only.',
      );
    }
    const runtime = runtimeMode === 'llama'
      ? createLlamaCppRuntime(args)
      : createMockRuntime(args.simulateInvalidJson);
    const rerankModelVersion = runtimeMode === 'llama'
      ? (
        normalizeOptionalString(args.modelPath)
        ?? normalizeOptionalString(path.basename(resolveConfiguredModelPath(args)))
        ?? 'llama-model'
      )
      : `mock-runtime:${args.simulateInvalidJson}`;

    if (runtimeMode === 'mock') {
      runtimeWarning = MOCK_RUNTIME_WARNING;
    }

    runtimeHealth = await runtime.health();
    if (!runtimeHealth.ok) {
      throw new Error(`Local runtime health check failed: ${runtimeHealth.detail ?? 'unknown error'}`);
    }

    localProvider = createLocalProvider(runtime, {
      loreArtifacts,
      requireLoreScopeForRetrieval: args.requireLoreScopeForRetrieval,
      rerankModelVersion,
      rerankerClass: args.rerankerClass,
    });
  }

  const cadenceBeatContract = isCadenceScenario
    ? (selectedBeatContract ?? findSugarAgentBeatContract(authoring.bundle, { npcId: args.npc }))
    : null;

  const cadenceConfig = isCadenceScenario
    ? {
      maxNpcUpdatesPerTick: args.tickBudget,
      activeBeatNpcId: cadenceBeatContract?.npcId ?? args.npc,
    }
    : null;

  const context = {
    localProvider,
    loreArtifacts,
    runtimeMode,
    conversation: session ? [...(session.state.npcs[args.npc]?.history ?? [])] : [],
    session,
    npcProfile: mergedNpcProfile,
    globalSafetyBounds,
    turnContext,
    scenario,
    scenarioState,
    cadenceConfig,
  };

  return {
    options: args,
    startup: createSessionStartupInfo({
      args,
      scenario: scenarioInfo,
      authoring,
      npcProfile: mergedNpcProfile,
      globalSafetyBounds,
      beatContract: cadenceBeatContract ?? selectedBeatContract,
      reset,
      session,
      loreArtifacts,
      turnContext,
      runtimeMode,
      runtimeWarning,
      runtimeHealth,
    }),
    runTicks(ticks) {
      if (!context.cadenceConfig) {
        throw new Error('Tick simulation is only available with --scenario crowd-town.');
      }
      const requestedTicks = Number.isFinite(ticks) ? Math.max(1, Math.floor(ticks)) : 1;
      return runCrowdTownCadenceSimulation(requestedTicks, context.cadenceConfig);
    },
    async runTurn(playerMessage, turnOptions = {}) {
      if (typeof playerMessage !== 'string' || playerMessage.trim().length === 0) {
        throw new Error('playerMessage must be a non-empty string');
      }

      const message = playerMessage.trim();
      const turnOptionRecord = isRecord(turnOptions) ? turnOptions : {};
      const turnNpcName = normalizeOptionalString(turnOptionRecord.npcName);
      const turnNpcProfile = mergeNpcProfile(
        context.npcProfile,
        turnOptionRecord.npcProfileOverride ?? turnOptionRecord.npcProfile,
      );
      const turnGlobalSafetyBounds = mergeStringArrays(
        context.globalSafetyBounds,
        turnOptionRecord.globalSafetyBoundsOverride ?? turnOptionRecord.globalSafetyBounds,
      );
      const baseTurnContext = mergeTurnContext(context.turnContext, turnOptionRecord.context);
      const priorPlayerTurnCount = countPlayerTurns(context.conversation);
      const topicCoverageContext = buildTurnTopicCoverageContext(
        getSessionTopicCoverageForNpc(context.session, args.npc),
        message,
      );
      const derivedTurnContext = {
        isFirstMeeting: priorPlayerTurnCount === 0,
        turnIndexWithNpc: priorPlayerTurnCount + 1,
        ...(topicCoverageContext ? { topicCoverage: topicCoverageContext } : {}),
      };
      const turnContext = mergeTurnContext(baseTurnContext, derivedTurnContext);

      if (args.provider === 'echo') {
        const routing = routeTurnIntent(message, args.npc);
        const output = createEchoReply(message);
        return {
          output,
          attempts: 1,
          usedFallback: false,
          validationErrors: [],
          loreMatches: [],
          grounding: createEmptyGroundingDiagnostics('accept'),
          groundingStats: {
            turnsValidated: 0,
            unsupportedClaimRejections: 0,
          },
          routing,
          pipeline: {
            version: PIPELINE_VERSION_V2,
            enabled: true,
            routeIntent: routing.intent,
            policyPath: routing.policyPath,
            queryType: 'conversation',
            mode: 'echo',
          },
          citations: [],
          scenarioLogs: [],
        };
      }

      const result = await context.localProvider.generateStructured({
        npcId: args.npc,
        npcName: turnNpcName ?? args.npc,
        playerMessage: message,
        history: context.conversation,
        memoryFacts: getSessionFactsForNpc(context.session, args.npc),
        npcProfile: turnNpcProfile,
        globalSafetyBounds: turnGlobalSafetyBounds,
        context: turnContext,
        scenario: context.scenario,
        scenarioState: context.scenarioState,
      });

      const scenarioLogs = [];
      if (context.scenario && context.scenarioState) {
        const orchestration = orchestrateScenarioTurn({
          scenario: context.scenario,
          scenarioState: context.scenarioState,
          playerMessage: message,
          turnOutput: result.output,
        });
        result.output = orchestration.output;
        context.scenarioState = orchestration.state;
        scenarioLogs.push(...orchestration.logs);
      }

      const citations = result.loreMatches.map(formatLoreReference);

      context.conversation.push({ role: 'player', text: message });
      context.conversation.push({ role: 'npc', text: result.output.utterance });
      if (context.conversation.length > MAX_HISTORY_ENTRIES) {
        context.conversation.splice(0, context.conversation.length - MAX_HISTORY_ENTRIES);
      }
      applyTurnToSession(context.session, args.npc, message, result.output.utterance);

      return {
        ...result,
        citations,
        scenarioLogs,
      };
    },
  };
}
