import {
  normalizeTopicToken,
} from './session-state';

type QueryType = 'conversation' | 'self_query' | 'other_query' | 'world_query' | 'mixed_query';
type RoutingIntent = 'social_chat' | 'session_recall' | 'identity_self' | 'lore_world' | 'lore_other' | 'mixed_knowledge' | 'unclear';

interface RecordLike {
  [key: string]: unknown;
}

interface NpcProfile {
  npcId?: string;
  persona?: string;
  tone?: string;
  selfEntityId?: string;
  constraints?: string[];
  loreScopes?: string[];
  selfLoreScopes?: string[];
  relatedLoreScopes?: string[];
}

interface TurnTopicCoverage {
  activeTopic?: string;
  activeTopicNovelty?: number;
  exhaustedTopics?: string[];
  trackedTopicCount?: number;
  exhausted?: boolean;
}

interface TurnContext {
  gameId?: string;
  regionPath?: string;
  regionName?: string;
  episodeId?: string;
  interactionMode?: 'scripted' | 'agent' | 'hybrid';
  interactionPolicy?: 'scripted-first' | 'agent-first' | 'fallback';
  queryType?: QueryType;
  routingIntent?: RoutingIntent;
  routingPolicyPath?: string;
  routingConfidence?: number;
  routingMargin?: number;
  isFirstMeeting?: boolean;
  turnIndexWithNpc?: number;
  topicCoverage?: TurnTopicCoverage;
}

const VALID_QUERY_TYPES = new Set<QueryType>([
  'conversation',
  'self_query',
  'other_query',
  'world_query',
  'mixed_query',
]);

const ROUTING_INTENT_ORDER: RoutingIntent[] = [
  'social_chat',
  'session_recall',
  'identity_self',
  'lore_world',
  'lore_other',
  'mixed_knowledge',
  'unclear',
];

export function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const entry of value) {
    const normalized = normalizeOptionalString(entry);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    entries.push(normalized);
  }
  return entries;
}

export function normalizeQueryType(value: unknown): QueryType | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase() as QueryType;
  return VALID_QUERY_TYPES.has(normalized) ? normalized : undefined;
}

export function normalizeRoutingIntent(value: unknown): RoutingIntent | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase() as RoutingIntent;
  return ROUTING_INTENT_ORDER.includes(normalized) ? normalized : undefined;
}

export function normalizeNpcProfile(value: unknown): NpcProfile | null {
  if (!isRecord(value)) return null;
  const npcId = normalizeOptionalString(value.npcId);
  const persona = normalizeOptionalString(value.persona);
  const tone = normalizeOptionalString(value.tone);
  const selfEntityId = normalizeOptionalString(value.selfEntityId);
  const constraints = normalizeStringArray(value.constraints ?? value.safetyBounds);
  const loreScopes = normalizeStringArray(value.loreScopes);
  const selfLoreScopes = normalizeStringArray(value.selfLoreScopes);
  const relatedLoreScopes = normalizeStringArray(value.relatedLoreScopes);
  const normalized: NpcProfile = {};
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

export function mergeStringArrays(base: unknown, override: unknown): string[] {
  return normalizeStringArray([...(normalizeStringArray(base)), ...(normalizeStringArray(override))]);
}

export function mergeNpcProfile(base: unknown, override: unknown): NpcProfile | null {
  const baseProfile = normalizeNpcProfile(base) ?? {};
  const overrideProfile = normalizeNpcProfile(override) ?? {};
  const merged: NpcProfile = {};
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

export function normalizeTurnContext(value: unknown): TurnContext | null {
  if (!isRecord(value)) return null;
  const gameId = normalizeOptionalString(value.gameId);
  const regionPath = normalizeOptionalString(value.regionPath);
  const regionName = normalizeOptionalString(value.regionName);
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
      const normalizedTopicCoverage: TurnTopicCoverage = {};
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
  const normalized: TurnContext = {};
  if (gameId) normalized.gameId = gameId;
  if (regionPath) normalized.regionPath = regionPath;
  if (regionName) normalized.regionName = regionName;
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

export function mergeTurnContext(base: unknown, override: unknown): TurnContext | null {
  const baseContext = normalizeTurnContext(base) ?? {};
  const overrideContext = normalizeTurnContext(override) ?? {};
  const merged = {
    ...baseContext,
    ...overrideContext,
  };
  return Object.keys(merged).length > 0 ? merged : null;
}
