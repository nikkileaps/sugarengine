import { tokenizeForPlan } from './retrieval-text';
import { detectSocialAcknowledgement, isLikelyAcknowledgementOnlyMessage } from './social-cues';
import { FACET_EXEMPLARS } from './query-exemplars';
import { maxCosineSimilarity } from './semantic-vectors';
import type {
  DiscourseMarkers,
  EvidencePreview,
  QueryFacet,
  QueryInterpretation,
  QueryInterpretationCandidate,
  QueryLane,
  ReferentPreviewCandidate,
  QueryTarget,
  QueryTimeframe,
  ResolvedReferent,
} from './turn-contracts';

interface LoreEntityHint {
  entityId: string;
  entityType: 'world' | 'character' | 'faction' | 'unknown';
  matchedText: string;
  filterKind: 'entityIds' | 'locationIds' | 'factionIds' | null;
}

interface ConversationTurnLike {
  role?: unknown;
  text?: unknown;
}

interface InterpretQueryInput {
  playerMessage: string;
  npcName?: string;
  history?: ConversationTurnLike[];
  scene?: {
    regionName?: string;
    regionPath?: string;
    currentActivity?: string;
    currentGoal?: string;
  };
  loreEntityHints?: LoreEntityHint[];
  evidencePreview?: Partial<EvidencePreview> | null;
}

interface BuildEvidencePreviewInput {
  selfEntityId?: string;
  regionName?: string;
  regionPath?: string;
  currentActivity?: string;
  currentGoal?: string;
  activeTopic?: string;
  recentReferents?: ReferentPreviewCandidate[];
  loreScopes?: string[];
  selfLoreScopes?: string[];
  relatedLoreScopes?: string[];
  entityIds?: string[];
  locationIds?: string[];
  tagHints?: string[];
}

interface InterpretationArchetype {
  id: string;
  lane: QueryLane;
  target: QueryTarget;
  facet: QueryFacet;
  timeframe: QueryTimeframe;
}

type EmbedTextsFn = (texts: string[]) => Promise<number[][]>;

interface NormalizedDiscourse {
  text: string;
  markers: DiscourseMarkers;
}

const DISCOURSE_FILLER_PREFIXES = [
  /^(?:no|nah)\b[\s,]*/i,
  /^(?:ok|okay|well|actually|sorry)\b[\s,]*/i,
  /^i mean\b[\s,]*/i,
];

const FACET_RELEVANCE_STOP_WORDS = new Set([
  'about',
  'actually',
  'am',
  'anything',
  'are',
  'can',
  'could',
  'did',
  'do',
  'does',
  'hey',
  'hi',
  'how',
  'hello',
  'i',
  'is',
  'just',
  'want',
  'in',
  'if',
  'good',
  'bad',
  'great',
  'has',
  'have',
  'here',
  'know',
  'me',
  'my',
  'nice',
  'now',
  'interesting',
  'like',
  'mean',
  'no',
  'ok',
  'okay',
  'really',
  'pretty',
  'right',
  'sorry',
  'tell',
  'their',
  'them',
  'they',
  'to',
  'up',
  'we',
  'what',
  'where',
  'who',
  'why',
  'will',
  'would',
  'you',
  'your',
]);

const FACET_QUERY_SYNONYMS = new Map<string, string[]>([
  ['job', ['work', 'occupation', 'career', 'profession', 'owner', 'owns', 'run', 'runs', 'shop', 'store', 'stall', 'manager', 'merchant']],
  ['work', ['job', 'occupation', 'career', 'profession', 'owner', 'owns', 'run', 'runs', 'shop', 'store', 'stall', 'manager', 'merchant']],
  ['occupation', ['job', 'work', 'career', 'profession', 'owner', 'owns', 'run', 'runs', 'shop', 'store', 'stall', 'manager', 'merchant']],
  ['career', ['job', 'work', 'occupation', 'profession', 'owner', 'owns', 'run', 'runs']],
  ['profession', ['job', 'work', 'occupation', 'career', 'owner', 'owns', 'run', 'runs']],
  ['where', ['location', 'place', 'here', 'there', 'station', 'town', 'city', 'region']],
  ['doing', ['activity', 'working', 'up', 'currently', 'right', 'now']],
  ['name', ['identity', 'called']],
  ['background', ['past', 'history', 'from']],
  ['favorite', ['like', 'love', 'prefer', 'hate']],
  ['remember', ['recall', 'before', 'met', 'memory']],
  ['history', ['about', 'tell', 'know', 'lore', 'origin', 'founded', 'founder', 'founding', 'climate', 'economy', 'politics', 'exports', 'rituals', 'culture']],
  ['origin', ['history', 'founded', 'founder', 'founding', 'began', 'start']],
  ['founded', ['founder', 'founding', 'origin', 'history', 'established', 'started']],
  ['founder', ['founded', 'founding', 'origin', 'history', 'established']],
]);

const FACET_SEED_TOKENS: Record<QueryFacet, string[]> = {
  identity: ['name'],
  occupation: ['job'],
  current_activity: ['doing'],
  location: ['where'],
  background: ['background'],
  preference: ['favorite'],
  relationship: ['remember'],
  general_lore: ['history'],
  unknown: [],
};

const KNOWLEDGE_FOCUS_CUE = /\b(who|what|when|where|why|how|do you know|know about|know anything about|tell me about|want to know|i want to know|does|do|is|are|have|has)\b/i;
const LOCATION_BACKREFERENCE_CUE = /\b(there|that place|this place|that town|this town|that city|this city|that station|this station)\b/i;
const PERSON_BACKREFERENCE_CUE = /\b(him|her)\b/i;
const GENERIC_BACKREFERENCE_CUE = /\b(it|that one|this one|that thing|this thing)\b/i;
const PLURAL_BACKREFERENCE_CUE = /\b(them|they)\b/i;

const INTERPRETATION_ARCHETYPES: InterpretationArchetype[] = [
  { id: 'social_chat', lane: 'social', target: 'unknown', facet: 'unknown', timeframe: 'unknown' },
  { id: 'social_acknowledgement', lane: 'social', target: 'unknown', facet: 'unknown', timeframe: 'habitual' },
  { id: 'memory_player_recall', lane: 'memory', target: 'self', facet: 'relationship', timeframe: 'past' },
  { id: 'self_identity', lane: 'knowledge', target: 'self', facet: 'identity', timeframe: 'habitual' },
  { id: 'self_occupation', lane: 'knowledge', target: 'self', facet: 'occupation', timeframe: 'habitual' },
  { id: 'self_current_activity', lane: 'knowledge', target: 'self', facet: 'current_activity', timeframe: 'current' },
  { id: 'self_location', lane: 'knowledge', target: 'self', facet: 'location', timeframe: 'current' },
  { id: 'self_background', lane: 'knowledge', target: 'self', facet: 'background', timeframe: 'past' },
  { id: 'self_preference', lane: 'knowledge', target: 'self', facet: 'preference', timeframe: 'habitual' },
  { id: 'world_location', lane: 'knowledge', target: 'world', facet: 'location', timeframe: 'current' },
  { id: 'world_general_lore', lane: 'knowledge', target: 'world', facet: 'general_lore', timeframe: 'unknown' },
  { id: 'other_identity', lane: 'knowledge', target: 'other', facet: 'identity', timeframe: 'habitual' },
  { id: 'other_background', lane: 'knowledge', target: 'other', facet: 'background', timeframe: 'past' },
  { id: 'mixed_knowledge', lane: 'knowledge', target: 'mixed', facet: 'general_lore', timeframe: 'unknown' },
];

const facetExemplarVectorsByEmbed = new WeakMap<EmbedTextsFn, Promise<Record<QueryFacet, number[][]>>>();

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function isReferentCandidateKind(value: unknown): value is ReferentPreviewCandidate['kind'] {
  return value === 'npc'
    || value === 'entity'
    || value === 'location'
    || value === 'faction'
    || value === 'topic';
}

function normalizeReferentCandidate(value: unknown): ReferentPreviewCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  const text = normalizeOptionalString(candidate.text);
  if (!isReferentCandidateKind(kind) || !text) return null;
  return {
    kind,
    text,
    id: normalizeOptionalString(candidate.id),
    confidence: normalizeOptionalNumber(candidate.confidence),
    salience: normalizeOptionalNumber(candidate.salience),
    lastSeenAt: normalizeOptionalNumber(candidate.lastSeenAt),
    topic: normalizeOptionalString(candidate.topic),
    sourceRole: (
      candidate.sourceRole === 'player'
      || candidate.sourceRole === 'npc'
      || candidate.sourceRole === 'scene'
      || candidate.sourceRole === 'lore'
      || candidate.sourceRole === 'memory'
      || candidate.sourceRole === 'unknown'
    )
      ? candidate.sourceRole
      : undefined,
  };
}

function normalizeEvidencePreview(preview: Partial<EvidencePreview> | null | undefined): EvidencePreview {
  return {
    selfSummary: {
      entityId: normalizeOptionalString(preview?.selfSummary?.entityId),
      identityTokens: normalizeStringArray(preview?.selfSummary?.identityTokens),
      occupationTokens: normalizeStringArray(preview?.selfSummary?.occupationTokens),
      backgroundTokens: normalizeStringArray(preview?.selfSummary?.backgroundTokens),
      preferenceTokens: normalizeStringArray(preview?.selfSummary?.preferenceTokens),
    },
    sceneSummary: {
      regionName: normalizeOptionalString(preview?.sceneSummary?.regionName),
      regionPath: normalizeOptionalString(preview?.sceneSummary?.regionPath),
      currentActivity: normalizeOptionalString(preview?.sceneSummary?.currentActivity),
      currentGoal: normalizeOptionalString(preview?.sceneSummary?.currentGoal),
    },
    topicSummary: {
      activeTopic: normalizeOptionalString(preview?.topicSummary?.activeTopic),
      recentReferents: Array.isArray(preview?.topicSummary?.recentReferents)
        ? preview.topicSummary.recentReferents
            .map((entry) => normalizeReferentCandidate(entry))
            .filter((entry): entry is ReferentPreviewCandidate => Boolean(entry))
            .slice(0, 6)
        : [],
    },
    scopeHints: {
      loreScopes: normalizeStringArray(preview?.scopeHints?.loreScopes),
      selfLoreScopes: normalizeStringArray(preview?.scopeHints?.selfLoreScopes),
      relatedLoreScopes: normalizeStringArray(preview?.scopeHints?.relatedLoreScopes),
      entityIds: normalizeStringArray(preview?.scopeHints?.entityIds),
      locationIds: normalizeStringArray(preview?.scopeHints?.locationIds),
      tagHints: normalizeStringArray(preview?.scopeHints?.tagHints),
    },
  };
}

export function buildEvidencePreview(input: BuildEvidencePreviewInput): EvidencePreview {
  return normalizeEvidencePreview({
    selfSummary: {
      entityId: input.selfEntityId,
      identityTokens: input.selfEntityId ? [input.selfEntityId] : [],
      occupationTokens: [],
      backgroundTokens: [],
      preferenceTokens: [],
    },
    sceneSummary: {
      regionName: input.regionName,
      regionPath: input.regionPath,
      currentActivity: input.currentActivity,
      currentGoal: input.currentGoal,
    },
    topicSummary: {
      activeTopic: input.activeTopic,
      recentReferents: Array.isArray(input.recentReferents) ? input.recentReferents : [],
    },
    scopeHints: {
      loreScopes: Array.isArray(input.loreScopes) ? input.loreScopes : [],
      selfLoreScopes: Array.isArray(input.selfLoreScopes) ? input.selfLoreScopes : [],
      relatedLoreScopes: Array.isArray(input.relatedLoreScopes) ? input.relatedLoreScopes : [],
      entityIds: Array.isArray(input.entityIds) ? input.entityIds : [],
      locationIds: Array.isArray(input.locationIds) ? input.locationIds : [],
      tagHints: Array.isArray(input.tagHints) ? input.tagHints : [],
    },
  });
}

function normalizePlayerMessage(playerMessage: string): string {
  return String(playerMessage ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeDiscourse(playerMessage: string): NormalizedDiscourse {
  let text = normalizePlayerMessage(playerMessage);
  const markers: DiscourseMarkers = {
    repair: false,
    filler: false,
    contrast: /\bbut\b|\bactually\b/i.test(text),
    emphasis: /!{2,}|\b(really|seriously|literally)\b/i.test(text),
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of DISCOURSE_FILLER_PREFIXES) {
      if (pattern.test(text)) {
        markers.filler = true;
        text = text.replace(pattern, '');
        changed = true;
      }
    }
  }

  if (/^no\s+i mean\b/i.test(normalizePlayerMessage(playerMessage)) || /\bi mean\b/i.test(playerMessage)) {
    markers.repair = true;
  }

  text = text.replace(/^[,.\s]+/, '').trim();
  return {
    text: text || normalizePlayerMessage(playerMessage),
    markers,
  };
}

export function extractKnowledgeFocusText(playerMessage: unknown): string {
  const source = normalizePlayerMessage(String(playerMessage ?? ''));
  if (!source) return '';
  const normalized = normalizeDiscourse(source);
  const sentences = normalized.text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (sentences.length === 0) return normalized.text;
  const questionSentence = [...sentences].reverse().find((entry) => entry.includes('?'));
  if (questionSentence) return questionSentence;
  const knowledgeSentence = [...sentences].reverse().find((entry) => KNOWLEDGE_FOCUS_CUE.test(entry));
  return knowledgeSentence ?? sentences[sentences.length - 1] ?? normalized.text;
}

export function extractFacetQueryTokens(playerMessageOrInterpretation: unknown): string[] {
  const interpretation = (
    playerMessageOrInterpretation
    && typeof playerMessageOrInterpretation === 'object'
    && typeof (playerMessageOrInterpretation as QueryInterpretation).focusText === 'string'
  )
    ? (playerMessageOrInterpretation as QueryInterpretation)
    : null;
  const source = interpretation?.focusText ?? extractKnowledgeFocusText(playerMessageOrInterpretation);
  const baseTokens = tokenizeForPlan(source);
  const filteredBaseTokens = baseTokens.filter((token) => !FACET_RELEVANCE_STOP_WORDS.has(token));
  if (!interpretation) {
    return filteredBaseTokens.length > 0 ? filteredBaseTokens : baseTokens;
  }

  const referentTokens = interpretation.referents
    .filter((referent) => {
      if (interpretation.target === 'self') {
        return referent.kind !== 'npc';
      }
      if (interpretation.target === 'world') {
        return referent.kind === 'location' || referent.kind === 'faction' || referent.kind === 'topic';
      }
      if (interpretation.target === 'other') {
        return referent.kind === 'entity' || referent.kind === 'topic';
      }
      if (interpretation.target === 'mixed') {
        return referent.kind !== 'npc';
      }
      return true;
    })
    .flatMap((referent) => tokenizeForPlan(referent.text));
  const facetSeedTokens = FACET_SEED_TOKENS[interpretation.facet] ?? [];
  const combined = [...filteredBaseTokens, ...facetSeedTokens, ...referentTokens];
  const deduped = combined.filter((token, index, items) => (
    token.length > 0
    && !FACET_RELEVANCE_STOP_WORDS.has(token)
    && items.indexOf(token) === index
  ));
  if (deduped.length > 0) return deduped;

  const fallback = [...facetSeedTokens, ...referentTokens].filter((token, index, items) => (
    token.length > 0
    && items.indexOf(token) === index
  ));
  return fallback.length > 0 ? fallback : baseTokens;
}

export function expandFacetQueryTokenVariants(token: unknown): Set<string> {
  const normalized = typeof token === 'string' ? token.trim().toLowerCase() : '';
  const variants = new Set<string>();
  if (!normalized) return variants;
  variants.add(normalized);
  for (const variant of FACET_QUERY_SYNONYMS.get(normalized) ?? []) {
    if (typeof variant === 'string' && variant.trim().length > 0) {
      variants.add(variant.trim().toLowerCase());
    }
  }
  return variants;
}

function hasLikelyQuestionForm(text: string): boolean {
  if (!text) return false;
  if (text.includes('?')) return true;
  return /^(what|when|where|who|why|how|do|did|can|could|would|will|have|has|is|are)\b/i.test(text.trim());
}

function extractHistoryReferents(history: ConversationTurnLike[] | undefined): Array<{ kind: 'npc' | 'location' | 'topic'; text: string; id?: string }> {
  return (Array.isArray(history) ? history : [])
    .slice(-2)
    .flatMap((entry) => {
      const text = normalizeOptionalString(entry?.text);
      if (!text) return [];
      const referents: Array<{ kind: 'npc' | 'location' | 'topic'; text: string; id?: string }> = [];
      const capitalized = text.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*\b/g) ?? [];
      for (const match of capitalized.slice(-2)) {
        referents.push({ kind: 'topic', text: match });
      }
      return referents;
    })
    .slice(-4);
}

function scoreRecentReferentCandidate(input: {
  focusText: string;
  candidate: ReferentPreviewCandidate;
  activeTopic?: string;
}): number {
  const lower = input.focusText.toLowerCase();
  const candidateTextLower = input.candidate.text.toLowerCase();
  const activeTopic = normalizeOptionalString(input.activeTopic)?.toLowerCase();
  const candidateTopic = normalizeOptionalString(input.candidate.topic)?.toLowerCase();
  const explicitMention = candidateTextLower.length > 0 && lower.includes(candidateTextLower);
  const hasLocationCue = LOCATION_BACKREFERENCE_CUE.test(input.focusText);
  const hasPersonCue = PERSON_BACKREFERENCE_CUE.test(input.focusText);
  const hasGenericCue = GENERIC_BACKREFERENCE_CUE.test(input.focusText);
  const hasPluralCue = PLURAL_BACKREFERENCE_CUE.test(input.focusText);
  let score = Math.max(0.3, Math.min(1, input.candidate.salience ?? input.candidate.confidence ?? 0.42));

  if (explicitMention) score += 0.28;
  if (activeTopic && candidateTopic && activeTopic === candidateTopic) score += 0.14;
  if (input.candidate.lastSeenAt) score += 0.03;

  if (hasLocationCue) {
    if (input.candidate.kind === 'location') score += 0.22;
    else if (input.candidate.kind === 'topic') score += 0.1;
    else score -= 0.1;
  }

  if (hasPersonCue) {
    if (input.candidate.kind === 'entity') score += 0.2;
    else if (input.candidate.kind === 'npc') score += 0.08;
    else score -= 0.12;
  }

  if (hasPluralCue) {
    if (input.candidate.kind === 'faction') score += 0.14;
    else if (input.candidate.kind === 'entity') score += 0.08;
  }

  if (hasGenericCue) {
    if (input.candidate.kind === 'location') score += 0.12;
    else if (input.candidate.kind === 'entity' || input.candidate.kind === 'topic' || input.candidate.kind === 'faction') score += 0.08;
    else if (input.candidate.kind === 'npc') score -= 0.04;
  }

  if (!hasLocationCue && !hasPersonCue && !hasGenericCue && !hasPluralCue && explicitMention) {
    score += 0.08;
  }

  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
}

function resolveRecentBackreference(
  focusText: string,
  preview: EvidencePreview,
  history: ConversationTurnLike[] | undefined,
): ResolvedReferent | null {
  const hasBackreference = (
    LOCATION_BACKREFERENCE_CUE.test(focusText)
    || PERSON_BACKREFERENCE_CUE.test(focusText)
    || GENERIC_BACKREFERENCE_CUE.test(focusText)
    || PLURAL_BACKREFERENCE_CUE.test(focusText)
  );
  if (!hasBackreference) return null;

  const recentReferents = preview.topicSummary.recentReferents.length > 0
    ? preview.topicSummary.recentReferents
    : extractHistoryReferents(history);
  if (recentReferents.length === 0) return null;

  const scored = recentReferents
    .map((candidate) => ({
      candidate,
      score: scoreRecentReferentCandidate({
        focusText,
        candidate,
        activeTopic: preview.topicSummary.activeTopic,
      }),
    }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  if (!top) return null;
  const margin = second ? Number((top.score - second.score).toFixed(4)) : top.score;
  const minimumScore = PERSON_BACKREFERENCE_CUE.test(focusText) ? 0.7 : 0.62;
  if (top.score < minimumScore || margin < 0.1) {
    return null;
  }

  return {
    kind: top.candidate.kind,
    text: top.candidate.text,
    id: top.candidate.id,
    confidence: top.score,
  };
}

function resolveReferents(
  focusText: string,
  input: InterpretQueryInput,
  preview: EvidencePreview,
): ResolvedReferent[] {
  const referents: ResolvedReferent[] = [];
  const lower = focusText.toLowerCase();
  const npcName = normalizeOptionalString(input.npcName);
  const loreHints = Array.isArray(input.loreEntityHints) ? input.loreEntityHints : [];

  if ((/\b(you|your)\b/i.test(focusText) || (npcName && lower.includes(npcName.toLowerCase()))) && npcName) {
    referents.push({
      kind: 'npc',
      text: npcName,
      id: preview.selfSummary.entityId,
      confidence: 0.95,
    });
  }

  if (/\b(where are we|where am i|where are you|where is this|this place|here)\b/i.test(focusText)) {
    const regionName = preview.sceneSummary.regionName ?? preview.sceneSummary.regionPath;
    if (regionName) {
      referents.push({
        kind: 'location',
        text: regionName,
        id: regionName,
        confidence: 0.92,
      });
    }
  }

  for (const hint of loreHints) {
    if (hint.entityType === 'world' || hint.entityType === 'faction') {
      referents.push({
        kind: hint.entityType === 'faction' ? 'faction' : 'location',
        text: hint.matchedText,
        id: hint.entityId,
        confidence: 0.9,
      });
    } else if (hint.entityType === 'character') {
      referents.push({
        kind: 'entity',
        text: hint.matchedText,
        id: hint.entityId,
        confidence: 0.88,
      });
    }
  }

  const backreference = resolveRecentBackreference(focusText, preview, input.history);
  if (backreference) {
    referents.push(backreference);
  }

  const deduped = new Map<string, ResolvedReferent>();
  for (const referent of referents) {
    const key = `${referent.kind}:${referent.id ?? referent.text}`.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || referent.confidence > existing.confidence) {
      deduped.set(key, referent);
    }
  }
  return [...deduped.values()].sort((a, b) => b.confidence - a.confidence);
}

function scoreLane(candidate: InterpretationArchetype, focusText: string): number {
  const source = focusText.toLowerCase();
  const hasRecallCue = /\b(remember me|have we met|did we meet|what do you remember|met before|last time|before)\b/.test(source);
  const hasGreetingCue = /\b(hello|hi|hey|what'?s up|how are you)\b/.test(source);
  const hasIntroductionCue = /\b(i(?:'m| am)\s+[a-z][a-z'-]*|my name is\s+[a-z][a-z'-]*)\b/i.test(focusText);
  const hasAcknowledgementCue = isLikelyAcknowledgementOnlyMessage(focusText);
  const hasQuestion = hasLikelyQuestionForm(focusText);
  const hasKnowledgeCue = /\b(who|what|when|where|why|how|tell me about|know about|know anything about)\b/.test(source);

  if (candidate.lane === 'memory') {
    return hasRecallCue ? 0.72 : 0.06;
  }
  if (candidate.lane === 'social') {
    if ((hasGreetingCue || hasIntroductionCue) && !hasKnowledgeCue && !hasRecallCue) return 0.74;
    if (hasAcknowledgementCue && !hasKnowledgeCue && !hasRecallCue) return 0.68;
    return hasQuestion ? 0.08 : 0.2;
  }
  if (candidate.lane === 'knowledge') {
    return hasKnowledgeCue || hasQuestion ? 0.52 : 0.1;
  }
  return 0;
}

function scoreTarget(candidate: InterpretationArchetype, focusText: string, referents: ResolvedReferent[]): number {
  const source = focusText.toLowerCase();
  const hasSelfCue = /\b(you|your)\b/.test(source);
  const hasGenericLoreCue = /\b(tell me about|know about|know anything about|what do you know about)\b/.test(source);
  const worldReferents = referents.filter((entry) => entry.kind === 'location' || entry.kind === 'faction');
  const otherReferents = referents.filter((entry) => entry.kind === 'entity');

  if (candidate.target === 'self') {
    return hasSelfCue || referents.some((entry) => entry.kind === 'npc') ? 0.28 : 0.04;
  }
  if (candidate.target === 'world') {
    return worldReferents.length > 0
      || /\b(city|town|place|world|region|station|history|where|resort|area|location|here|there)\b/.test(source)
      || (hasGenericLoreCue && !hasSelfCue && otherReferents.length === 0)
      ? 0.28
      : 0.04;
  }
  if (candidate.target === 'other') {
    return otherReferents.length > 0 ? 0.24 : 0.04;
  }
  if (candidate.target === 'mixed') {
    return worldReferents.length > 0 && (referents.some((entry) => entry.kind === 'npc') || otherReferents.length > 0)
      ? 0.18
      : (hasGenericLoreCue && (worldReferents.length > 0 || otherReferents.length > 0) ? 0.08 : 0.03);
  }
  return candidate.target === 'unknown' ? 0.12 : 0;
}

function scoreFacet(candidate: InterpretationArchetype, focusText: string): number {
  const source = focusText.toLowerCase();
  switch (candidate.facet) {
    case 'identity':
      return /\b(who are you|what(?:'s| is) your name|your name)\b/.test(source) ? 0.48 : 0.04;
    case 'occupation':
      return /\b(what do you do|what(?:'s| is) your job|job|work|occupation|for a living|where do you work)\b/.test(source) ? 0.54 : 0.04;
    case 'current_activity':
      return /\b(what are you doing|what are you up to|doing right now|up to right now)\b/.test(source) ? 0.54 : 0.04;
    case 'location':
      return /\b(where are we|where am i|where are you|where is this|this place|what place)\b/.test(source) ? 0.54 : 0.04;
    case 'background':
      return /\b(background|past|family|where are you from|about yourself)\b/.test(source) ? 0.48 : 0.04;
    case 'preference':
      return /\b(favorite|like|love|hate|prefer)\b/.test(source) ? 0.34 : 0.03;
    case 'relationship':
      return /\b(remember me|have we met|did we meet|last time|before)\b/.test(source) ? 0.48 : 0.03;
    case 'general_lore':
      return /\b(tell me about|know about|know anything about|history|what do you know|founded|founder|founding|origin|established|climate|economy|politics|exports|rituals|culture)\b/.test(source) ? 0.42 : 0.04;
    case 'unknown':
      return 0.08;
    default:
      return 0;
  }
}

function scoreArchetype(candidate: InterpretationArchetype, focusText: string): number {
  const acknowledgement = detectSocialAcknowledgement(focusText);
  if (candidate.id === 'social_acknowledgement') {
    if (!acknowledgement) return 0;
    return acknowledgement === 'shared_preference' ? 0.28 : 0.22;
  }
  if (candidate.id === 'social_chat' && acknowledgement) {
    return 0.06;
  }
  return 0;
}

function scoreTimeframe(candidate: InterpretationArchetype, focusText: string): number {
  const source = focusText.toLowerCase();
  switch (candidate.timeframe) {
    case 'current':
      return /\b(now|right now|currently|are you doing|where are we|where am i|where are you)\b/.test(source) ? 0.18 : 0.04;
    case 'habitual':
      return /\b(do you do|job|work|occupation|usually|for a living)\b/.test(source) ? 0.18 : 0.04;
    case 'past':
      return /\b(did you|used to|before|were you|where were you from|last time)\b/.test(source) ? 0.18 : 0.04;
    case 'future':
      return /\b(will you|going to|soon)\b/.test(source) ? 0.18 : 0.04;
    case 'unknown':
      return 0.08;
    default:
      return 0;
  }
}

function scoreEvidenceAffinity(candidate: InterpretationArchetype, preview: EvidencePreview): number {
  if (candidate.target === 'self' && candidate.facet === 'occupation' && preview.selfSummary.occupationTokens.length > 0) {
    return 0.14;
  }
  if (candidate.target === 'self' && candidate.facet === 'identity' && preview.selfSummary.identityTokens.length > 0) {
    return 0.12;
  }
  if (candidate.target === 'self' && candidate.facet === 'background' && preview.selfSummary.backgroundTokens.length > 0) {
    return 0.12;
  }
  if (candidate.target === 'self' && candidate.facet === 'preference' && preview.selfSummary.preferenceTokens.length > 0) {
    return 0.12;
  }
  if (candidate.facet === 'location' && (preview.sceneSummary.regionName || preview.sceneSummary.regionPath)) {
    return 0.12;
  }
  if (candidate.facet === 'current_activity' && preview.sceneSummary.currentActivity) {
    return 0.12;
  }
  return 0;
}

function scoreContext(candidate: InterpretationArchetype, preview: EvidencePreview): number {
  if (candidate.target === 'world' && preview.topicSummary.activeTopic && candidate.facet === 'general_lore') {
    return 0.08;
  }
  if (candidate.target === 'world' && preview.topicSummary.recentReferents.some((entry) => entry.kind === 'location')) {
    return 0.06;
  }
  return 0;
}

function normalizeCandidateScore(value: number): number {
  return Number(Math.max(0, Math.min(1, value / 1.7)).toFixed(4));
}

function finalizeInterpretation(input: {
  normalizedText: string;
  focusText: string;
  referents: ResolvedReferent[];
  discourse: DiscourseMarkers;
  candidateScores: QueryInterpretationCandidate[];
}): QueryInterpretation {
  const scoredCandidates = [...input.candidateScores]
    .sort((a, b) => (
      b.score - a.score
      || a.lane.localeCompare(b.lane)
      || a.target.localeCompare(b.target)
      || a.facet.localeCompare(b.facet)
    ));

  const top = scoredCandidates[0] ?? {
    lane: 'social' as QueryLane,
    target: 'unknown' as QueryTarget,
    facet: 'unknown' as QueryFacet,
    timeframe: 'unknown' as QueryTimeframe,
    score: 0,
  };
  const second = scoredCandidates[1] ?? { ...top, score: 0 };
  const confidence = top.score;
  const rawMargin = Number(Math.max(0, Math.min(1, top.score - second.score)).toFixed(4));
  const socialConsensus = top.lane === 'social'
    && second.lane === 'social'
    && !hasLikelyQuestionForm(input.normalizedText);
  const margin = socialConsensus ? Math.max(rawMargin, 0.24) : rawMargin;
  const ambiguous = socialConsensus
    ? confidence < 0.42
    : (confidence < 0.48 || margin < 0.12);

  return {
    schemaVersion: 1,
    lane: top.lane,
    target: top.target,
    facet: top.facet,
    timeframe: top.timeframe,
    focusText: input.focusText,
    normalizedText: input.normalizedText,
    referents: input.referents,
    discourse: input.discourse,
    candidateScores: scoredCandidates.slice(0, 6),
    confidence,
    margin,
    ambiguous,
  };
}

export function interpretQuery(input: InterpretQueryInput): QueryInterpretation {
  const preview = normalizeEvidencePreview(input.evidencePreview);
  const normalized = normalizeDiscourse(input.playerMessage);
  const focusText = extractKnowledgeFocusText(normalized.text);
  const referents = resolveReferents(focusText, input, preview);
  const scoredCandidates: QueryInterpretationCandidate[] = INTERPRETATION_ARCHETYPES
    .map((candidate) => {
      const score = normalizeCandidateScore(
        scoreLane(candidate, focusText)
        + scoreTarget(candidate, focusText, referents)
        + scoreFacet(candidate, focusText)
        + scoreTimeframe(candidate, focusText)
        + scoreEvidenceAffinity(candidate, preview)
        + scoreContext(candidate, preview)
        + scoreArchetype(candidate, focusText),
      );
      return {
        lane: candidate.lane,
        target: candidate.target,
        facet: candidate.facet,
        timeframe: candidate.timeframe,
        score,
      };
    });

  return finalizeInterpretation({
    normalizedText: normalized.text,
    focusText,
    referents,
    discourse: normalized.markers,
    candidateScores: scoredCandidates,
  });
}

async function getFacetExemplarVectors(embedTexts: EmbedTextsFn): Promise<Record<QueryFacet, number[][]>> {
  const cached = facetExemplarVectorsByEmbed.get(embedTexts);
  if (cached) {
    return cached;
  }
  const promise = (async () => {
    const facets = Object.entries(FACET_EXEMPLARS) as Array<[QueryFacet, string[]]>;
    const texts = facets.flatMap(([, exemplarTexts]) => exemplarTexts);
    const vectors = await embedTexts(texts);
    const byFacet = {} as Record<QueryFacet, number[][]>;
    let offset = 0;
    for (const [facet, exemplarTexts] of facets) {
      const facetVectors: number[][] = [];
      for (let index = 0; index < exemplarTexts.length; index += 1) {
        const maybeVector = vectors[offset + index];
        if (Array.isArray(maybeVector) && maybeVector.length > 0) {
          facetVectors.push(maybeVector);
        }
      }
      byFacet[facet] = facetVectors;
      offset += exemplarTexts.length;
    }
    return byFacet;
  })().catch((error) => {
    facetExemplarVectorsByEmbed.delete(embedTexts);
    throw error;
  });
  facetExemplarVectorsByEmbed.set(embedTexts, promise);
  return promise;
}

export async function enhanceInterpretationWithFacetSimilarity(input: {
  interpretation: QueryInterpretation;
  embedTexts: EmbedTextsFn;
}): Promise<QueryInterpretation> {
  if (input.interpretation.lane !== 'knowledge') return input.interpretation;
  const focusText = normalizePlayerMessage(input.interpretation.focusText);
  if (!focusText) return input.interpretation;

  const [queryVector] = await input.embedTexts([focusText]);
  if (!Array.isArray(queryVector) || queryVector.length === 0) {
    return input.interpretation;
  }

  const exemplarVectors = await getFacetExemplarVectors(input.embedTexts);
  const facetSimilarities = new Map<QueryFacet, number>();
  let strongestFacetSimilarity = 0;
  for (const facet of Object.keys(FACET_EXEMPLARS) as QueryFacet[]) {
    const similarity = maxCosineSimilarity(queryVector, exemplarVectors[facet] ?? []);
    facetSimilarities.set(facet, similarity);
    if (similarity > strongestFacetSimilarity) strongestFacetSimilarity = similarity;
  }

  const adjustedCandidates = input.interpretation.candidateScores.map((candidate) => {
    if (candidate.lane !== 'knowledge' || candidate.facet === 'unknown') {
      return candidate;
    }
    const facetSimilarity = facetSimilarities.get(candidate.facet) ?? 0;
    const similarityFloor = Math.max(0.35, strongestFacetSimilarity * 0.6);
    const boost = facetSimilarity >= similarityFloor
      ? Math.min(0.18, (facetSimilarity - similarityFloor) * 0.42)
      : 0;
    return {
      ...candidate,
      score: Number(Math.max(0, Math.min(1, candidate.score + boost)).toFixed(4)),
    };
  });

  return finalizeInterpretation({
    normalizedText: input.interpretation.normalizedText,
    focusText: input.interpretation.focusText,
    referents: input.interpretation.referents,
    discourse: input.interpretation.discourse,
    candidateScores: adjustedCandidates,
  });
}
