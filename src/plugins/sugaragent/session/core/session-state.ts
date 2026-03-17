import fs from 'node:fs';
import path from 'node:path';
import type { ReferentPreviewCandidate, ReferentSourceRole } from './turn-contracts';

export const DEFAULT_SESSION_DIR = path.resolve('.sugaragent-sim-sessions');
export const MAX_HISTORY_ENTRIES = 8;
export const MAX_SESSION_FACTS_PER_NPC = 24;
export const MAX_SESSION_EVENTS_PER_NPC = 64;
export const MAX_TOPIC_COVERAGE_PER_NPC = 24;
export const MAX_REFERENT_CANDIDATES_PER_NPC = 16;
export const TOPIC_EXHAUSTION_MIN_MENTIONS = 3;
export const TOPIC_EXHAUSTION_MAX_NOVELTY = 0.34;

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
  'yeah',
  'yep',
  'yup',
  'ok',
  'okay',
  'well',
  'man',
  'dude',
  'hmm',
  'uh',
  'umm',
  'huh',
  'right',
  'sure',
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

interface RecordLike {
  [key: string]: unknown;
}

interface SessionHistoryEntry {
  role: string;
  text: string;
  updatedAt: number;
}

interface SessionEvent {
  id: string;
  type: string;
  ownerType: string;
  text: string;
  timestamp: number;
  source?: string;
}

interface TopicCoverageEntry {
  topic: string;
  mentions: number;
  novelty: number;
  exhausted: boolean;
  lastMentionAt: number;
}

interface SessionReferentEntry {
  kind: ReferentPreviewCandidate['kind'];
  text: string;
  id?: string;
  topic?: string;
  sourceRole: ReferentSourceRole;
  mentions: number;
  confidence: number;
  salience: number;
  lastSeenAt: number;
}

interface SessionNpcState {
  facts: string[];
  history: SessionHistoryEntry[];
  events: SessionEvent[];
  topicCoverage: TopicCoverageEntry[];
  referents: SessionReferentEntry[];
  updatedAt: number;
}

interface SessionState {
  schemaVersion: 4;
  sessionId: string;
  updatedAt: number;
  npcs: Record<string, SessionNpcState>;
}

export interface LoadedSessionState {
  pathToFile: string;
  state: SessionState;
  loaded: boolean;
}

interface SessionHandle {
  pathToFile: string;
  state: SessionState;
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function toSafeTimestamp(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

export function sanitizeSessionId(sessionId: unknown): string {
  return String(sessionId ?? 'default')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'default';
}

export function resolveSessionPath(sessionId: unknown, sessionDir = DEFAULT_SESSION_DIR): string {
  const sanitized = sanitizeSessionId(sessionId);
  return path.join(sessionDir, `${sanitized}.json`);
}

export function createEmptySessionState(sessionId: string): SessionState {
  return {
    schemaVersion: 4,
    sessionId,
    updatedAt: Date.now(),
    npcs: {},
  };
}

export function normalizeFact(text: unknown): string {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '');
}

export function normalizeTopicToken(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u00c0-\u024f_-]+/g, '');
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeReferentSourceRole(value: unknown): ReferentSourceRole {
  return value === 'player'
    || value === 'npc'
    || value === 'scene'
    || value === 'lore'
    || value === 'memory'
    ? value
    : 'unknown';
}

function isReferentKind(value: unknown): value is SessionReferentEntry['kind'] {
  return value === 'npc'
    || value === 'entity'
    || value === 'location'
    || value === 'faction'
    || value === 'topic';
}

function normalizeReferentTopic(topic: unknown, fallbackText?: unknown): string | undefined {
  const explicit = normalizeTopicToken(topic);
  if (explicit) return explicit;
  const fallback = normalizeTopicToken(fallbackText);
  return fallback || undefined;
}

export function extractConversationTopics(message: unknown): string[] {
  const source = String(message ?? '').trim();
  if (!source) return [];
  const tokenizedWords = source
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s_-]+/g, ' ')
    .split(/\s+/);

  const focusedTopics: string[] = [];
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

function computeReferentSalience(input: {
  mentions: number;
  confidence: number;
  sourceRole: ReferentSourceRole;
  topicMatch: boolean;
}): number {
  const mentionBoost = Math.min(0.24, Math.max(0, input.mentions - 1) * 0.05);
  const sourceBoost = input.sourceRole === 'lore'
    ? 0.08
    : input.sourceRole === 'scene'
      ? 0.05
      : input.sourceRole === 'npc'
        ? 0.03
        : 0;
  const topicBoost = input.topicMatch ? 0.08 : 0;
  return Number(Math.max(0.2, Math.min(1, 0.32 + input.confidence * 0.4 + mentionBoost + sourceBoost + topicBoost)).toFixed(4));
}

export function computeTopicNovelty(mentions: unknown): number {
  const safeMentions = Number.isFinite(mentions) ? Math.max(1, Math.floor(Number(mentions))) : 1;
  const novelty = 1 / (1 + (safeMentions - 1) * 0.75);
  return Number(Math.max(0.05, Math.min(1, novelty)).toFixed(4));
}

export function isTopicExhausted(entry: unknown): boolean {
  if (!isRecord(entry)) return false;
  const mentions = Number.isFinite(entry.mentions) ? Math.max(0, Math.floor(Number(entry.mentions))) : 0;
  const novelty = typeof entry.novelty === 'number' && Number.isFinite(entry.novelty)
    ? entry.novelty
    : computeTopicNovelty(mentions);
  return mentions >= TOPIC_EXHAUSTION_MIN_MENTIONS && novelty <= TOPIC_EXHAUSTION_MAX_NOVELTY;
}

export function extractSalientFacts(message: unknown): string[] {
  const source = String(message ?? '').trim();
  if (!source) return [];
  const lower = source.toLowerCase();
  const facts: string[] = [];

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

  return Array.from(new Set(facts));
}

function persistMemoryWritesToNpc(
  npc: SessionNpcState,
  memoryWrites: unknown,
  now: number,
): void {
  const writes = Array.isArray(memoryWrites) ? memoryWrites : [];
  if (writes.length === 0) return;

  const nextFacts = new Set(npc.facts);
  for (const write of writes) {
    if (!isRecord(write)) continue;
    const type = typeof write.type === 'string' ? write.type : 'unknown';
    const source = typeof write.source === 'string' ? write.source : 'runtime_memory';
    const ownerType = typeof write.ownerType === 'string' && EVIDENCE_OWNER_TYPES.has(write.ownerType)
      ? write.ownerType
      : 'unknown';
    const text = normalizeFact(write.text);
    if (!text) continue;

    if (type === 'player_fact') {
      nextFacts.add(text);
      npc.events.push({
        id: `player_fact:${now}:${randomId()}`,
        type: 'player_fact',
        ownerType: 'player',
        text,
        timestamp: now,
        source,
      });
      continue;
    }

    if (type === 'npc_commitment' || type === 'shared_event') {
      npc.events.push({
        id: `${type}:${now}:${randomId()}`,
        type,
        ownerType,
        text,
        timestamp: now,
        source,
      });
    }
  }

  npc.facts = Array.from(nextFacts).slice(-MAX_SESSION_FACTS_PER_NPC);
}

export function ensureSessionNpc(state: SessionState, npcId: string): SessionNpcState {
  if (!state.npcs[npcId]) {
    state.npcs[npcId] = {
      facts: [],
      history: [],
      events: [],
      topicCoverage: [],
      referents: [],
      updatedAt: Date.now(),
    };
  }
  if (!Array.isArray(state.npcs[npcId].events)) {
    state.npcs[npcId].events = [];
  }
  if (!Array.isArray(state.npcs[npcId].topicCoverage)) {
    state.npcs[npcId].topicCoverage = [];
  }
  if (!Array.isArray(state.npcs[npcId].referents)) {
    state.npcs[npcId].referents = [];
  }
  return state.npcs[npcId];
}

export function loadSessionState(sessionId: unknown, sessionDir = DEFAULT_SESSION_DIR): LoadedSessionState {
  const sanitizedSessionId = sanitizeSessionId(sessionId);
  const pathToFile = resolveSessionPath(sanitizedSessionId, sessionDir);
  if (!fs.existsSync(pathToFile)) {
    return {
      pathToFile,
      state: createEmptySessionState(sanitizedSessionId),
      loaded: false,
    };
  }

  try {
    const raw = fs.readFileSync(pathToFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (
      !isRecord(parsed)
      || (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3 && parsed.schemaVersion !== 4)
      || !isRecord(parsed.npcs)
    ) {
      return {
        pathToFile,
        state: createEmptySessionState(sanitizedSessionId),
        loaded: false,
      };
    }
    const normalized = createEmptySessionState(sanitizedSessionId);
    normalized.updatedAt = toSafeTimestamp(parsed.updatedAt, Date.now());
    for (const [npcId, value] of Object.entries(parsed.npcs)) {
      if (!isRecord(value)) continue;
      normalized.npcs[npcId] = {
        facts: Array.isArray(value.facts)
          ? value.facts.filter((entry): entry is string => typeof entry === 'string').slice(-MAX_SESSION_FACTS_PER_NPC)
          : [],
        history: Array.isArray(value.history)
          ? value.history
            .filter((entry): entry is SessionHistoryEntry => (
              isRecord(entry)
              && typeof entry.role === 'string'
              && typeof entry.text === 'string'
              && typeof entry.updatedAt === 'number'
            ))
            .slice(-MAX_HISTORY_ENTRIES)
          : [],
        events: Array.isArray(value.events)
          ? value.events
            .filter((entry): entry is RecordLike => {
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
            .filter((entry): entry is RecordLike => {
              if (!isRecord(entry)) return false;
              if (typeof entry.topic !== 'string' || entry.topic.trim().length === 0) return false;
              const mentions = Number.isFinite(entry.mentions) ? Math.max(0, Math.floor(Number(entry.mentions))) : 0;
              return mentions > 0;
            })
            .map((entry) => {
              const mentions = Number.isFinite(entry.mentions) ? Math.max(1, Math.floor(Number(entry.mentions))) : 1;
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
        referents: Array.isArray(value.referents)
          ? value.referents
            .filter((entry): entry is RecordLike => {
              if (!isRecord(entry)) return false;
              if (!isReferentKind(entry.kind)) return false;
              return typeof entry.text === 'string' && entry.text.trim().length > 0;
            })
            .map((entry) => {
              const confidence = typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
                ? Number(Math.max(0, Math.min(1, entry.confidence)).toFixed(4))
                : 0.5;
              const mentions = Number.isFinite(entry.mentions) ? Math.max(1, Math.floor(Number(entry.mentions))) : 1;
              const topic = normalizeReferentTopic(entry.topic, entry.text);
              const sourceRole = normalizeReferentSourceRole(entry.sourceRole);
              const topicMatch = typeof topic === 'string' && topic.length > 0;
              const salience = typeof entry.salience === 'number' && Number.isFinite(entry.salience)
                ? Number(Math.max(0, Math.min(1, entry.salience)).toFixed(4))
                : computeReferentSalience({
                    mentions,
                    confidence,
                    sourceRole,
                    topicMatch,
                  });
              return {
                kind: entry.kind as SessionReferentEntry['kind'],
                text: String(entry.text),
                id: normalizeOptionalString(entry.id),
                topic,
                sourceRole,
                mentions,
                confidence,
                salience,
                lastSeenAt: toSafeTimestamp(entry.lastSeenAt, Date.now()),
              };
            })
            .slice(-MAX_REFERENT_CANDIDATES_PER_NPC)
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
      state: createEmptySessionState(sanitizedSessionId),
      loaded: false,
    };
  }
}

export function resetSessionState(sessionId: unknown, sessionDir = DEFAULT_SESSION_DIR): {
  sessionId: string;
  pathToFile: string;
  existed: boolean;
} {
  const sanitized = sanitizeSessionId(sessionId);
  const pathToFile = resolveSessionPath(sanitized, sessionDir);
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

export function saveSessionState(session: SessionHandle | null | undefined): void {
  if (!session) return;
  session.state.updatedAt = Date.now();
  fs.mkdirSync(path.dirname(session.pathToFile), { recursive: true });
  fs.writeFileSync(session.pathToFile, `${JSON.stringify(session.state, null, 2)}\n`, 'utf8');
}

export function getSessionFactsForNpc(session: LoadedSessionState | null | undefined, npcId: string): string[] {
  if (!session) return [];
  const npc = session.state.npcs[npcId];
  return Array.isArray(npc?.facts) ? npc.facts : [];
}

export function getSessionTopicCoverageForNpc(
  session: LoadedSessionState | null | undefined,
  npcId: string,
): TopicCoverageEntry[] {
  if (!session) return [];
  const npc = session.state.npcs[npcId];
  return Array.isArray(npc?.topicCoverage) ? npc.topicCoverage : [];
}

export function getSessionReferentsForNpc(
  session: LoadedSessionState | null | undefined,
  npcId: string,
): SessionReferentEntry[] {
  if (!session) return [];
  const npc = session.state.npcs[npcId];
  return Array.isArray(npc?.referents) ? npc.referents : [];
}

export function buildRecentReferentPreview(
  referentEntries: unknown,
  playerMessage: unknown,
  options?: {
    activeTopic?: string | null;
  },
): ReferentPreviewCandidate[] {
  const entries = Array.isArray(referentEntries)
    ? referentEntries.filter((entry): entry is SessionReferentEntry => (
      isRecord(entry)
      && isReferentKind(entry.kind)
      && typeof entry.text === 'string'
      && entry.text.trim().length > 0
    ))
    : [];
  if (entries.length === 0) return [];

  const activeTopic = normalizeReferentTopic(options?.activeTopic);
  const playerTopics = extractConversationTopics(playerMessage);
  const playerTopicSet = new Set(playerTopics);

  return entries
    .map((entry) => {
      const topic = normalizeReferentTopic(entry.topic, entry.text);
      const topicalBoost = topic && (playerTopicSet.has(topic) || (activeTopic && topic === activeTopic))
        ? 0.12
        : 0;
      const sceneBoost = entry.sourceRole === 'scene' && /\b(here|there|place|station|town|city)\b/i.test(String(playerMessage ?? ''))
        ? 0.06
        : 0;
      const score = Number(Math.max(0, Math.min(1, (entry.salience ?? entry.confidence ?? 0.4) + topicalBoost + sceneBoost)).toFixed(4));
      return {
        kind: entry.kind,
        text: entry.text,
        id: entry.id,
        topic,
        confidence: entry.confidence,
        salience: score,
        lastSeenAt: entry.lastSeenAt,
        sourceRole: entry.sourceRole,
      } satisfies ReferentPreviewCandidate;
    })
    .sort((a, b) => (
      (b.salience ?? 0) - (a.salience ?? 0)
      || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0)
    ))
    .slice(0, 6);
}

export function buildTurnTopicCoverageContext(topicCoverageEntries: unknown, playerMessage: unknown): {
  activeTopic: string | null;
  activeTopicNovelty: number | null;
  exhaustedTopics: string[];
  trackedTopicCount: number;
  exhausted: boolean;
} | null {
  const now = Date.now();
  const entries = Array.isArray(topicCoverageEntries)
    ? topicCoverageEntries
      .filter((entry): entry is RecordLike => isRecord(entry) && typeof entry.topic === 'string' && entry.topic.trim().length > 0)
      .map((entry) => ({
        topic: normalizeTopicToken(String(entry.topic)),
        mentions: Number.isFinite(entry.mentions) ? Math.max(1, Math.floor(Number(entry.mentions))) : 1,
        novelty: typeof entry.novelty === 'number' && Number.isFinite(entry.novelty)
          ? Number(Math.max(0.05, Math.min(1, entry.novelty)).toFixed(4))
          : computeTopicNovelty(Number.isFinite(entry.mentions) ? Math.max(1, Math.floor(Number(entry.mentions))) : 1),
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

export function updateNpcTopicCoverage(npc: SessionNpcState, playerMessage: unknown, now: number): void {
  const topics = extractConversationTopics(playerMessage);
  if (!Array.isArray(npc.topicCoverage)) {
    npc.topicCoverage = [];
  }
  if (!Array.isArray(npc.events)) {
    npc.events = [];
  }
  if (topics.length === 0) return;

  const topicMap = new Map<string, TopicCoverageEntry>();
  for (const rawEntry of npc.topicCoverage) {
    if (!isRecord(rawEntry)) continue;
    const topic = normalizeTopicToken(String(rawEntry.topic ?? ''));
    if (!topic) continue;
    const mentions = Number.isFinite(rawEntry.mentions) ? Math.max(1, Math.floor(Number(rawEntry.mentions))) : 1;
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
        id: `topic_coverage:${now}:${randomId()}`,
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

function persistReferentCandidatesToNpc(
  npc: SessionNpcState,
  referentCandidates: unknown,
  now: number,
  activeTopic?: unknown,
): void {
  const candidates = Array.isArray(referentCandidates) ? referentCandidates : [];
  if (candidates.length === 0) return;

  const activeTopicToken = normalizeReferentTopic(activeTopic);
  const referentMap = new Map<string, SessionReferentEntry>();
  for (const entry of npc.referents) {
    if (!isReferentKind(entry.kind) || typeof entry.text !== 'string' || entry.text.trim().length === 0) continue;
    const key = `${entry.kind}:${entry.id ?? entry.text}`.toLowerCase();
    referentMap.set(key, entry);
  }

  for (const rawCandidate of candidates) {
    if (!isRecord(rawCandidate) || !isReferentKind(rawCandidate.kind)) continue;
    const text = normalizeOptionalString(rawCandidate.text);
    if (!text) continue;
    const id = normalizeOptionalString(rawCandidate.id);
    const key = `${rawCandidate.kind}:${id ?? text}`.toLowerCase();
    const existing = referentMap.get(key);
    const confidence = typeof rawCandidate.confidence === 'number' && Number.isFinite(rawCandidate.confidence)
      ? Number(Math.max(0, Math.min(1, rawCandidate.confidence)).toFixed(4))
      : (existing?.confidence ?? 0.5);
    const mentions = (existing?.mentions ?? 0) + 1;
    const topic = normalizeReferentTopic(rawCandidate.topic, activeTopicToken ?? text) ?? existing?.topic;
    const sourceRole = normalizeReferentSourceRole(rawCandidate.sourceRole ?? existing?.sourceRole);
    const salience = computeReferentSalience({
      mentions,
      confidence,
      sourceRole,
      topicMatch: typeof topic === 'string' && topic.length > 0 && topic === activeTopicToken,
    });

    referentMap.set(key, {
      kind: rawCandidate.kind,
      text,
      id,
      topic,
      sourceRole,
      mentions,
      confidence,
      salience,
      lastSeenAt: now,
    });
  }

  npc.referents = [...referentMap.values()]
    .sort((a, b) => (
      b.lastSeenAt - a.lastSeenAt
      || b.salience - a.salience
      || b.mentions - a.mentions
    ))
    .slice(0, MAX_REFERENT_CANDIDATES_PER_NPC);
}

export function countPlayerTurns(history: unknown): number {
  if (!Array.isArray(history)) return 0;
  return history.reduce((count, entry) => {
    return isRecord(entry) && entry.role === 'player' ? count + 1 : count;
  }, 0);
}

export function applyTurnToSession(
  session: LoadedSessionState | null | undefined,
  npcId: string,
  playerMessage: unknown,
  npcReply: unknown,
  options?: {
    memoryWrites?: unknown;
    referentCandidates?: unknown;
    activeTopic?: string | null;
  },
): void {
  if (!session) return;
  const now = Date.now();
  const npc = ensureSessionNpc(session.state, npcId);
  npc.updatedAt = now;

  const hasExplicitMemoryWrites = Array.isArray(options?.memoryWrites);
  if (hasExplicitMemoryWrites) {
    persistMemoryWritesToNpc(npc, options?.memoryWrites, now);
  } else {
    const newFacts = extractSalientFacts(playerMessage);
    if (newFacts.length > 0) {
      const merged = Array.from(new Set([...npc.facts, ...newFacts]));
      npc.facts = merged.slice(-MAX_SESSION_FACTS_PER_NPC);
      for (const fact of newFacts) {
        npc.events.push({
          id: `player_fact:${now}:${randomId()}`,
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
        id: `npc_commitment:${now}:${randomId()}`,
        type: 'npc_commitment',
        ownerType: 'npc',
        text: normalizeFact(commitment),
        timestamp: now,
        source: 'npc_reply',
      });
    }
  }

  updateNpcTopicCoverage(npc, playerMessage, now);
  persistReferentCandidatesToNpc(npc, options?.referentCandidates, now, options?.activeTopic);
  npc.events = npc.events.slice(-MAX_SESSION_EVENTS_PER_NPC);

  npc.history.push({ role: 'player', text: String(playerMessage ?? ''), updatedAt: now });
  npc.history.push({ role: 'npc', text: String(npcReply ?? ''), updatedAt: now });
  npc.history = npc.history.slice(-MAX_HISTORY_ENTRIES);
  saveSessionState(session);
}
