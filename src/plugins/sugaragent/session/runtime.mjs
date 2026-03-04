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
const LORE_OVERRIDE_MIN_SCORE = 1.2;
const LORE_OVERRIDE_MIN_MARGIN = 0.35;
const SESSION_DIR = path.resolve('.sugaragent-sim-sessions');
const DEFAULT_AUTHORING_BUNDLE_PATH = path.resolve('public/plugins/sugaragent/authoring.bundle.json');
const CADENCE_SCENARIO_ID = 'crowd-town';
const VALID_QUERY_TYPES = new Set([
  'conversation',
  'self_query',
  'other_query',
  'world_query',
  'mixed_query',
]);
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
  const queryType = normalizeQueryType(value.queryType);
  const isFirstMeeting = typeof value.isFirstMeeting === 'boolean'
    ? value.isFirstMeeting
    : undefined;
  const turnIndexWithNpc = typeof value.turnIndexWithNpc === 'number'
    && Number.isFinite(value.turnIndexWithNpc)
    ? Math.max(1, Math.floor(value.turnIndexWithNpc))
    : undefined;
  const normalized = {};
  if (gameId) normalized.gameId = gameId;
  if (regionPath) normalized.regionPath = regionPath;
  if (episodeId) normalized.episodeId = episodeId;
  if (queryType) normalized.queryType = queryType;
  if (isFirstMeeting !== undefined) normalized.isFirstMeeting = isFirstMeeting;
  if (turnIndexWithNpc !== undefined) normalized.turnIndexWithNpc = turnIndexWithNpc;
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
    schemaVersion: 1,
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

function extractSalientFacts(message) {
  const source = (message ?? '').trim();
  if (!source) return [];
  const lower = source.toLowerCase();
  const facts = [];

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
      updatedAt: Date.now(),
    };
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
      || parsed.schemaVersion !== 1
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
  }

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
  if (typeof turnContext.queryType === 'string' && turnContext.queryType.trim().length > 0) {
    lines.push(`- Query type: ${sanitizePromptText(turnContext.queryType).slice(0, 64)}`);
  }
  if (typeof turnContext.isFirstMeeting === 'boolean') {
    lines.push(`- First meeting with player: ${turnContext.isFirstMeeting ? 'yes' : 'no'}`);
  }
  if (typeof turnContext.turnIndexWithNpc === 'number' && Number.isFinite(turnContext.turnIndexWithNpc)) {
    lines.push(`- Turn index with player: ${Math.max(1, Math.floor(turnContext.turnIndexWithNpc))}`);
  }
  if (lines.length === 0) return null;
  return ['Runtime context:', ...lines].join('\n');
}

function classifyTurnQueryType(playerMessage, npcName) {
  const source = (playerMessage ?? '').trim();
  if (!source) return 'conversation';
  const lower = source.toLowerCase();
  const npcLower = (npcName ?? '').trim().toLowerCase();

  const hasQuestion = source.includes('?');
  const hasKnowledgeCue = /\b(who|what|when|where|why|how|explain|tell me|do you know|know about|history|origin|founded|creation|remember)\b/.test(lower);
  if (!hasQuestion && !hasKnowledgeCue) {
    return 'conversation';
  }

  const selfCue = /\b(who are you|your name|about you|about yourself|where are you from|your past|your background|your family|remember me|have we met|did we meet|what did i (say|mention|tell you)|what do you remember about me|do you remember what i)\b/.test(lower)
    || (/\b(you|your)\b/.test(lower) && /\b(name|past|background|family|from|remember|met)\b/.test(lower));
  const worldCue = /\b(city|town|village|region|history|event|world|place|creation|founded|origin|map|forest|station|gate)\b/.test(lower);

  let otherCue = false;
  const otherTargetMatch = lower.match(/\b(?:tell me about|know about|what about)\s+([a-z0-9._-]{3,})\b/);
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

  if (selfCue && (worldCue || otherCue)) return 'mixed_query';
  if (selfCue) return 'self_query';
  if (otherCue && worldCue) return 'mixed_query';
  if (otherCue) return 'other_query';
  if (worldCue) return 'world_query';
  return 'mixed_query';
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

function validateTurnQuality(turn, playerMessage, history, memoryFacts, options = {}) {
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
  if (isLikelyRepeatOfRecentNpcReply(turn.utterance, history)) {
    return {
      valid: false,
      reason: 'utterance repeats recent npc reply',
    };
  }
  if (isLikelyRepeatOfRecentPlayerText(turn.utterance, history)) {
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
    'If the player expresses concern, acknowledge it and offer a grounded response.',
    'If asked what you remember, only use known facts listed below. If there are no known facts, say you do not remember yet.',
    'Do not invent specific memories that are not in known facts or recent conversation.',
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
  const modelPath = args.modelPath
    ?? process.env.SUGARAGENT_MODEL_PATH
    ?? resolveBundledModelPath();
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

function createLocalProvider(runtime, options = {}) {
  const maxAttempts = options.maxAttempts ?? 3;
  const loreArtifacts = options.loreArtifacts ?? null;
  const requireLoreScopeForRetrieval = options.requireLoreScopeForRetrieval === true;

  return {
    async generateStructured(input) {
      if (!runtime.loaded) {
        try {
          await runtime.loadModel('chat-fast');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            output: createDeterministicFallbackReply(input.playerMessage, input.memoryFacts ?? []),
            attempts: 0,
            usedFallback: true,
            validationErrors: [`loadModel failed: ${message}`],
            loreMatches: [],
          };
        }
      }

      const validationErrors = [];
      const normalizedTurnContext = normalizeTurnContext(input.context);
      const queryType = normalizedTurnContext?.queryType
        ?? classifyTurnQueryType(input.playerMessage, input.npcName);
      const isFirstMeeting = normalizedTurnContext?.isFirstMeeting === true;
      const runtimeTurnContext = normalizeTurnContext({
        ...(normalizedTurnContext ?? {}),
        queryType,
      });
      let sawFirstMeetingViolation = false;
      let lastValidationReason = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response;
        try {
          response = await runtime.generateStructured({
            npcName: input.npcName,
            playerMessage: input.playerMessage,
            history: input.history ?? [],
            memoryFacts: input.memoryFacts ?? [],
            npcProfile: input.npcProfile ?? null,
            globalSafetyBounds: input.globalSafetyBounds ?? [],
            context: runtimeTurnContext,
            scenario: input.scenario ?? null,
            scenarioState: input.scenarioState ?? null,
            attempt,
            repair: attempt > 1,
            repairReason: lastValidationReason,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const reason = `runtime error: ${message}`;
          validationErrors.push(`attempt ${attempt}: ${reason}`);
          lastValidationReason = reason;
          continue;
        }

        const parsed = parseStructuredFromText(response.jsonText)
          ?? parseStructuredFromText(response.rawText ?? '');
        if (!parsed) {
          const reason = 'invalid JSON';
          validationErrors.push(`attempt ${attempt}: ${reason}`);
          lastValidationReason = reason;
          continue;
        }

        const validation = validateStructuredOutput(parsed);
        if (!validation.valid) {
          const reason = validation.errors.join('; ');
          validationErrors.push(`attempt ${attempt}: ${reason}`);
          lastValidationReason = reason;
          continue;
        }

        let output = parsed;
        const activeBeatId = input.scenario?.beatContract?.beatId;
        const loreScopes = normalizeStringArray(input.npcProfile?.loreScopes);
        const selfLoreScopes = normalizeStringArray(input.npcProfile?.selfLoreScopes);
        const relatedLoreScopes = normalizeStringArray(input.npcProfile?.relatedLoreScopes);
        const selfEntityId = normalizeOptionalString(input.npcProfile?.selfEntityId);
        const shouldAttemptLoreRetrieval = isKnowledgeSeekingQueryType(queryType);
        const hasAnyScopes = loreScopes.length > 0 || selfLoreScopes.length > 0 || relatedLoreScopes.length > 0;
        const canRetrieveLore = (hasAnyScopes || !requireLoreScopeForRetrieval)
          && shouldAttemptLoreRetrieval;
        const loreMatches = canRetrieveLore
          ? retrieveLoreChunks(loreArtifacts, input.playerMessage, {
            maxResults: 2,
            activeBeatIds: typeof activeBeatId === 'string' ? [activeBeatId] : [],
            loreScopes,
            selfLoreScopes,
            relatedLoreScopes,
            selfEntityId,
            queryType,
          })
          : [];
        const loreConfidence = evaluateLoreOverrideConfidence(loreMatches);
        const topLoreMatch = loreMatches[0];
        const requiresSelfIdentityEvidence = queryType === 'self_query'
          && (Boolean(selfEntityId) || selfLoreScopes.length > 0);
        const topLoreSupportsSelfQuery = queryType === 'self_query'
          ? (!requiresSelfIdentityEvidence || isSelfEvidenceMatch(topLoreMatch, selfEntityId))
          : true;
        const shouldApplyLoreOverride = canRetrieveLore
          && loreConfidence.shouldOverride
          && topLoreSupportsSelfQuery;
        let appliedLoreMatches = [];
        if (shouldApplyLoreOverride && loreMatches.length > 0) {
          const grounded = buildLoreGroundedTurn(input.playerMessage, loreMatches);
          if (grounded) {
            output = {
              ...output,
              utterance: grounded.utterance,
              intent: grounded.intent,
              citations: grounded.citations,
              beatEvidence: output.beatEvidence ?? grounded.beatEvidence,
            };
            appliedLoreMatches = loreMatches;
          }
        }
        const shouldForceUncertaintyForSelfQuery = requiresSelfIdentityEvidence
          && (!shouldApplyLoreOverride || !topLoreSupportsSelfQuery);
        const shouldForceUncertaintyForUnsupportedKnowledge = queryType !== 'self_query'
          && isKnowledgeSeekingQueryType(queryType)
          && !shouldApplyLoreOverride;
        if (shouldForceUncertaintyForSelfQuery || shouldForceUncertaintyForUnsupportedKnowledge) {
          output = createGroundedUncertaintyReply(queryType);
          appliedLoreMatches = [];
        }
        const quality = validateTurnQuality(
          output,
          input.playerMessage,
          input.history ?? [],
          input.memoryFacts ?? [],
          { isFirstMeeting },
        );
        if (!quality.valid) {
          validationErrors.push(`attempt ${attempt}: ${quality.reason}`);
          lastValidationReason = quality.reason;
          if (
            quality.reason === 'first meeting response implies prior familiarity'
            || quality.reason === 'first meeting greeting includes ungrounded player assumptions'
          ) {
            sawFirstMeetingViolation = true;
          }
          continue;
        }

        return {
          output,
          attempts: attempt,
          usedFallback: false,
          validationErrors,
          loreMatches: appliedLoreMatches,
        };
      }

      const fallbackOutput = isFirstMeeting && sawFirstMeetingViolation
        ? createFirstMeetingFallbackReply(input.npcName)
        : createDeterministicFallbackReply(input.playerMessage, input.memoryFacts ?? []);
      return {
        output: fallbackOutput,
        attempts: maxAttempts,
        usedFallback: true,
        validationErrors,
        loreMatches: [],
      };
    },
  };
}

const MOCK_RUNTIME_WARNING = 'local provider is using mock runtime. Run `npm run sugaragent:bundle:local-llm -- --profile balanced` or pass --runtime llama with --llama-bin and --model-path for actual local LLM.';

const DEFAULT_SESSION_OPTIONS = {
  npc: 'baker',
  provider: 'echo',
  runtime: 'auto',
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
    const runtime = runtimeMode === 'llama'
      ? createLlamaCppRuntime(args)
      : createMockRuntime(args.simulateInvalidJson);

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
      const derivedTurnContext = {
        isFirstMeeting: priorPlayerTurnCount === 0,
        turnIndexWithNpc: priorPlayerTurnCount + 1,
      };
      const turnContext = mergeTurnContext(baseTurnContext, derivedTurnContext);

      if (args.provider === 'echo') {
        const output = createEchoReply(message);
        return {
          output,
          attempts: 1,
          usedFallback: false,
          validationErrors: [],
          loreMatches: [],
          citations: [],
          scenarioLogs: [],
        };
      }

      const result = await context.localProvider.generateStructured({
        npcName: args.npc,
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
