import { interpretQuery } from './query-interpretation';
import type { EvidencePreview, QueryInterpretation } from './turn-contracts';

export type QueryType = 'conversation' | 'self_query' | 'other_query' | 'world_query' | 'mixed_query';
export type RoutingIntent = 'social_chat' | 'session_recall' | 'identity_self' | 'lore_world' | 'lore_other' | 'mixed_knowledge' | 'unclear';
export type RoutingPolicyPath = 'chat' | 'memory_first' | 'self_knowledge' | 'lore_knowledge' | 'safe_chat';

export interface RoutingResult {
  intent: RoutingIntent;
  confidence: number;
  margin: number;
  candidateScores: Array<{ intent: string; score: number }>;
  policyPath: RoutingPolicyPath;
  interpretation?: QueryInterpretation;
}

export interface LoreEntityRouteMatch {
  entityId: string;
  entityType: 'world' | 'character' | 'faction' | 'unknown';
  matchedText: string;
  filterKind: 'entityIds' | 'locationIds' | 'factionIds' | null;
}

export interface LoreEntityRouteRefinement {
  route: RoutingResult;
  matches: LoreEntityRouteMatch[];
  loreEntityIds: string[];
  retrievalFilters: {
    entityIds?: string[];
    locationIds?: string[];
    factionIds?: string[];
  };
}

function normalizeRoutingSource(playerMessage: unknown): string {
  const source = String(playerMessage ?? '').trim();
  if (!source) return '';
  return source.replace(/\s+/g, ' ');
}

function normalizeRouteLookupText(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLoreAlias(value: unknown): string {
  const normalized = normalizeRouteLookupText(value)
    .replace(/\b(lore|locations|location|npcs|npc|factions|faction|history|world)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length >= 3 ? normalized : '';
}

function aliasFromId(value: unknown): string {
  const source = String(value ?? '').trim();
  if (!source) return '';
  const lastSegment = source.split('.').pop() ?? source;
  return normalizeLoreAlias(lastSegment.replace(/[_-]+/g, ' '));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function buildLoreEntityAliases(chunk: unknown): Array<{
  alias: string;
  entityId: string;
  entityType: LoreEntityRouteMatch['entityType'];
  filterKind: LoreEntityRouteMatch['filterKind'];
}> {
  if (!isRecord(chunk)) return [];
  const metadata = isRecord(chunk.metadata) ? chunk.metadata : {};
  const pageId = typeof chunk.pageId === 'string' ? chunk.pageId : '';
  const metadataId = typeof metadata.id === 'string' ? metadata.id : '';
  const title = typeof chunk.title === 'string'
    ? chunk.title
    : (typeof metadata.title === 'string' ? metadata.title : '');
  const locationIds = normalizeStringArray(metadata.location_ids);
  const factionIds = normalizeStringArray(metadata.faction_ids);
  const entityIds = normalizeStringArray(metadata.entity_ids);
  const candidates: Array<{
    alias: string;
    entityId: string;
    entityType: LoreEntityRouteMatch['entityType'];
    filterKind: LoreEntityRouteMatch['filterKind'];
  }> = [];
  const seen = new Set<string>();

  const pushAlias = (
    rawAlias: unknown,
    entityId: string,
    entityType: LoreEntityRouteMatch['entityType'],
    filterKind: LoreEntityRouteMatch['filterKind'],
  ) => {
    const alias = normalizeLoreAlias(rawAlias);
    if (!alias || alias.length < 4) return;
    const key = `${entityType}:${entityId}:${alias}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ alias, entityId, entityType, filterKind });
  };

  const pageLooksCharacter = pageId.includes('.npcs.') || metadataId.includes('.npcs.');
  const pageLooksWorld = pageId.includes('.locations.') || metadataId.includes('.locations.')
    || pageId.includes('.history.') || metadataId.includes('.history.')
    || pageId.includes('.world.') || metadataId.includes('.world.');

  for (const locationId of locationIds) {
    pushAlias(aliasFromId(locationId), locationId, 'world', 'locationIds');
    pushAlias(title, locationId, 'world', 'locationIds');
  }
  for (const factionId of factionIds) {
    pushAlias(aliasFromId(factionId), factionId, 'faction', 'factionIds');
    pushAlias(title, factionId, 'faction', 'factionIds');
  }
  for (const entityId of entityIds) {
    const entityType = entityId.startsWith('npc.') || entityId.startsWith('character.')
      || pageLooksCharacter
      ? 'character'
      : pageLooksWorld
        ? 'world'
        : 'unknown';
    pushAlias(aliasFromId(entityId), entityId, entityType, 'entityIds');
    pushAlias(title, entityId, entityType, 'entityIds');
  }

  if (candidates.length === 0 && title) {
    const entityType = pageLooksWorld ? 'world' : pageLooksCharacter ? 'character' : 'unknown';
    const entityId = metadataId || pageId || normalizeLoreAlias(title);
    pushAlias(title, entityId, entityType, null);
    pushAlias(aliasFromId(metadataId || pageId), entityId, entityType, null);
  }

  return candidates;
}

export function collectLoreEntityRouteMatches(
  playerMessage: unknown,
  loreArtifacts: unknown,
): LoreEntityRouteMatch[] {
  const normalizedMessage = normalizeRouteLookupText(playerMessage);
  if (!normalizedMessage) return [];
  const chunks = isRecord(loreArtifacts) && Array.isArray(loreArtifacts.chunks)
    ? loreArtifacts.chunks
    : [];
  const matches: LoreEntityRouteMatch[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    const aliases = buildLoreEntityAliases(chunk);
    for (const candidate of aliases) {
      const pattern = new RegExp(`(^|\\s)${escapeRegex(candidate.alias)}(?=$|\\s)`, 'i');
      if (!pattern.test(normalizedMessage)) continue;
      const key = `${candidate.entityType}:${candidate.entityId}:${candidate.alias}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        entityId: candidate.entityId,
        entityType: candidate.entityType,
        matchedText: candidate.alias,
        filterKind: candidate.filterKind,
      });
    }
  }

  return matches;
}

function buildRefinedRoutingResult(
  route: RoutingResult,
  intent: RoutingIntent,
): RoutingResult {
  if (intent === route.intent) return route;
  const overrideScore = Math.max(route.confidence, 0.86);
  const candidateScores = [
    { intent, score: overrideScore },
    ...route.candidateScores.filter((entry) => entry.intent !== intent),
  ]
    .slice(0, 6)
    .map((entry, index) => ({
      intent: entry.intent,
      score: Number(Math.max(0, Math.min(1, index === 0 ? overrideScore : entry.score)).toFixed(4)),
    }));

  return {
    intent,
    confidence: Number(overrideScore.toFixed(4)),
    margin: Number(Math.max(route.margin, 0.22).toFixed(4)),
    candidateScores,
    policyPath: routeIntentToPolicyPath(intent),
    interpretation: route.interpretation
      ? {
          ...route.interpretation,
          lane: intent === 'social_chat'
            ? 'social'
            : intent === 'session_recall'
              ? 'memory'
              : 'knowledge',
          target: intent === 'identity_self'
            ? 'self'
            : intent === 'lore_world'
              ? 'world'
              : intent === 'lore_other'
                ? 'other'
                : intent === 'mixed_knowledge'
                  ? 'mixed'
                  : 'unknown',
          confidence: Number(overrideScore.toFixed(4)),
          margin: Number(Math.max(route.margin, 0.22).toFixed(4)),
          ambiguous: false,
        }
      : undefined,
  };
}

export function refineRouteWithLoreEntityMentions(input: {
  route: RoutingResult;
  playerMessage: unknown;
  loreArtifacts?: unknown;
}): LoreEntityRouteRefinement {
  const route = input.route;
  const matches = collectLoreEntityRouteMatches(input.playerMessage, input.loreArtifacts);
  const retrievalFilters: LoreEntityRouteRefinement['retrievalFilters'] = {};
  for (const match of matches) {
    if (match.filterKind === 'entityIds') {
      retrievalFilters.entityIds = [...(retrievalFilters.entityIds ?? []), match.entityId];
    } else if (match.filterKind === 'locationIds') {
      retrievalFilters.locationIds = [...(retrievalFilters.locationIds ?? []), match.entityId];
    } else if (match.filterKind === 'factionIds') {
      retrievalFilters.factionIds = [...(retrievalFilters.factionIds ?? []), match.entityId];
    }
  }

  const normalizedMessage = normalizeRouteLookupText(input.playerMessage);
  const hasKnowledgeCue = /\b(who|what|when|where|why|how|explain|tell me|do you know|know about|know anything about|history|origin|founded|creation|remember)\b/i.test(normalizedMessage);
  const hasKnowledgeIntent = hasLikelyQuestionForm(input.playerMessage)
    || hasKnowledgeCue
    || route.intent === 'lore_world'
    || route.intent === 'lore_other'
    || route.intent === 'mixed_knowledge'
    || route.intent === 'unclear';

  let refinedRoute = route;
  if (hasKnowledgeIntent && matches.length > 0) {
    const hasWorld = matches.some((match) => match.entityType === 'world' || match.entityType === 'faction');
    const hasCharacter = matches.some((match) => match.entityType === 'character');
    if (hasWorld && !hasCharacter) {
      refinedRoute = buildRefinedRoutingResult(route, 'lore_world');
    } else if (hasCharacter && !hasWorld) {
      refinedRoute = buildRefinedRoutingResult(route, 'lore_other');
    } else if (hasWorld && hasCharacter) {
      refinedRoute = buildRefinedRoutingResult(route, 'mixed_knowledge');
    }
  }

  return {
    route: refinedRoute,
    matches,
    loreEntityIds: matches.map((match) => match.entityId),
    retrievalFilters,
  };
}

export function hasLikelyQuestionForm(playerMessage: unknown): boolean {
  const source = normalizeRoutingSource(playerMessage);
  if (!source) return false;
  if (source.includes('?')) return true;
  const normalized = source.toLowerCase();
  return /^(what|when|where|who|why|how|do|did|can|could|would|will|have|has|is|are)\b/.test(normalized);
}

function isLikelySmallTalkQuery(playerMessage: unknown): boolean {
  const source = String(playerMessage ?? '').trim().toLowerCase();
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

export function routeIntentToQueryType(intent: string): QueryType {
  if (intent === 'identity_self') return 'self_query';
  if (intent === 'lore_world') return 'world_query';
  if (intent === 'lore_other') return 'other_query';
  if (intent === 'mixed_knowledge') return 'mixed_query';
  return 'conversation';
}

export function routeIntentToPolicyPath(intent: string): RoutingPolicyPath {
  if (intent === 'session_recall') return 'memory_first';
  if (intent === 'social_chat') return 'chat';
  if (intent === 'identity_self') return 'self_knowledge';
  if (intent === 'lore_world' || intent === 'lore_other' || intent === 'mixed_knowledge') {
    return 'lore_knowledge';
  }
  return 'safe_chat';
}

function projectInterpretationIntent(interpretation: QueryInterpretation): RoutingIntent {
  if (interpretation.ambiguous) return 'unclear';
  if (interpretation.lane === 'social') return 'social_chat';
  if (interpretation.lane === 'memory') return 'session_recall';
  if (interpretation.lane === 'knowledge') {
    if (interpretation.target === 'self') return 'identity_self';
    if (interpretation.target === 'world') return 'lore_world';
    if (interpretation.target === 'other') return 'lore_other';
    if (interpretation.target === 'mixed') return 'mixed_knowledge';
  }
  return 'unclear';
}

function projectInterpretationCandidateScores(interpretation: QueryInterpretation): Array<{ intent: string; score: number }> {
  const scoreByIntent = new Map<string, number>();
  for (const candidate of interpretation.candidateScores) {
    const intent = projectInterpretationIntent({
      ...interpretation,
      lane: candidate.lane,
      target: candidate.target,
      facet: candidate.facet,
      timeframe: candidate.timeframe,
      ambiguous: false,
      confidence: candidate.score,
      margin: 0,
      candidateScores: [],
    });
    const current = scoreByIntent.get(intent) ?? 0;
    if (candidate.score > current) {
      scoreByIntent.set(intent, candidate.score);
    }
  }
  return [...scoreByIntent.entries()]
    .map(([intent, score]) => ({
      intent,
      score: Number(score.toFixed(4)),
    }))
    .sort((a, b) => b.score - a.score);
}

export function routeTurnIntent(
  playerMessage: unknown,
  npcName: unknown,
  options?: {
    history?: Array<{ role?: unknown; text?: unknown }>;
    scene?: {
      regionName?: string;
      regionPath?: string;
      currentActivity?: string;
      currentGoal?: string;
    };
    loreEntityHints?: LoreEntityRouteMatch[];
    evidencePreview?: Partial<EvidencePreview> | null;
  },
): RoutingResult {
  const source = normalizeRoutingSource(playerMessage);
  const interpretation = interpretQuery({
    playerMessage: source,
    npcName: typeof npcName === 'string' ? npcName : undefined,
    history: options?.history,
    scene: options?.scene,
    loreEntityHints: options?.loreEntityHints,
    evidencePreview: options?.evidencePreview,
  });

  if (!source) {
    return {
      intent: 'social_chat',
      confidence: 1,
      margin: 1,
      candidateScores: [{ intent: 'social_chat', score: 1 }],
      policyPath: 'chat',
      interpretation: {
        ...interpretation,
        lane: 'social',
        target: 'unknown',
        facet: 'unknown',
        timeframe: 'unknown',
        confidence: 1,
        margin: 1,
        ambiguous: false,
      },
    };
  }
  const intent = projectInterpretationIntent(interpretation);
  const candidateScores = projectInterpretationCandidateScores(interpretation);
  const forceSocialChat = isLikelySmallTalkQuery(source)
    && interpretation.lane === 'social'
    && !interpretation.ambiguous;
  return {
    intent: forceSocialChat ? 'social_chat' : intent,
    confidence: Number((forceSocialChat ? Math.max(0.94, interpretation.confidence) : interpretation.confidence).toFixed(4)),
    margin: Number((forceSocialChat ? Math.max(0.24, interpretation.margin) : interpretation.margin).toFixed(4)),
    candidateScores: forceSocialChat
      ? [
          { intent: 'social_chat', score: Number(Math.max(0.94, interpretation.confidence).toFixed(4)) },
          ...candidateScores.filter((entry) => entry.intent !== 'social_chat'),
        ].slice(0, 6)
      : candidateScores,
    policyPath: routeIntentToPolicyPath(forceSocialChat ? 'social_chat' : intent),
    interpretation,
  };
}

export function classifyTurnQueryType(playerMessage: unknown, npcName: unknown): QueryType {
  const routed = routeTurnIntent(playerMessage, npcName);
  return routeIntentToQueryType(routed.intent);
}

export function routeIntentUsesLore(intent: string): boolean {
  return intent === 'identity_self'
    || intent === 'lore_world'
    || intent === 'lore_other'
    || intent === 'mixed_knowledge';
}

export function routeIntentRequiresGroundingRepair(intent: string): boolean {
  return intent === 'identity_self'
    || intent === 'lore_world'
    || intent === 'lore_other'
    || intent === 'mixed_knowledge';
}

export function isKnowledgeSeekingQueryType(queryType: string): boolean {
  return queryType === 'self_query'
    || queryType === 'other_query'
    || queryType === 'world_query'
    || queryType === 'mixed_query';
}
