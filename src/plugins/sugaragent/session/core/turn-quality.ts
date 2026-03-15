import { normalizeInitiativeAction } from './initiative';
import { hasLikelyQuestionForm } from './routing';
import {
  extractSalientFacts,
  MAX_SESSION_FACTS_PER_NPC,
} from './session-state';

type RoutingIntent = 'social_chat' | 'session_recall' | 'identity_self' | 'lore_world' | 'lore_other' | 'mixed_knowledge' | 'unclear';
type QueryType = 'conversation' | 'self_query' | 'other_query' | 'world_query' | 'mixed_query';

interface RecordLike {
  [key: string]: unknown;
}

interface TurnQualityOptions {
  initiativeAction?: unknown;
  npcName?: unknown;
  isFirstMeeting?: unknown;
  routingIntent?: unknown;
  queryType?: unknown;
  regionPath?: unknown;
  regionName?: unknown;
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

const LOCATION_CONTEXT_STOP_WORDS = new Set([
  'a',
  'an',
  'at',
  'for',
  'here',
  'in',
  'my',
  'of',
  'on',
  'our',
  'place',
  'region',
  'spot',
  'that',
  'the',
  'there',
  'this',
  'to',
  'town',
]);

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

function normalizeRoutingIntent(value: unknown): RoutingIntent {
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

function normalizeFact(text: unknown): string {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '');
}

function normalizeLocationPhrase(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizePromptText(text: unknown): string {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function tokenizeLocationPhrase(text: unknown): string[] {
  return normalizeLocationPhrase(text)
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 1 && !LOCATION_CONTEXT_STOP_WORDS.has(entry));
}

export function normalizeForEchoCheck(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecord(value: unknown): value is RecordLike {
  return typeof value === 'object' && value !== null;
}

function isLikelyEchoReply(utterance: unknown, playerMessage: unknown): boolean {
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

function isLikelyRepeatOfRecentNpcReply(utterance: unknown, history: unknown): boolean {
  const normalizedReply = normalizeForEchoCheck(utterance);
  if (!normalizedReply) return false;

  const recentNpcReplies = (Array.isArray(history) ? history : [])
    .filter((entry) => isRecord(entry) && entry.role === 'npc')
    .slice(-3)
    .map((entry) => normalizeForEchoCheck(String(entry.text ?? '')))
    .filter(Boolean);

  return recentNpcReplies.includes(normalizedReply);
}

function isLikelyRepeatOfRecentPlayerText(utterance: unknown, history: unknown): boolean {
  const normalizedReply = normalizeForEchoCheck(utterance);
  if (!normalizedReply) return false;

  const recentPlayerMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => isRecord(entry) && entry.role === 'player')
    .slice(-4)
    .map((entry) => normalizeForEchoCheck(String(entry.text ?? '')))
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

function isLikelyRawMemoryFact(utterance: unknown, memoryFacts: unknown): boolean {
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

function isLikelyFirstMeetingFamiliarityClaim(utterance: unknown): boolean {
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

export function isLikelyGreetingOnlyMessage(playerMessage: unknown): boolean {
  const normalized = normalizeForEchoCheck(playerMessage);
  if (!normalized) return false;
  const patterns = [
    /^(hi|hello|hey|hola|howdy)$/,
    /^(hi|hello|hey|hola|howdy)\s+(there|friend|baker|sir|maam|madam)$/,
    /^(good\s+morning|good\s+afternoon|good\s+evening)$/,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

function isLikelyUngroundedFirstMeetingGreetingReply(utterance: unknown, playerMessage: unknown): boolean {
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

function isLikelyGenericAssistantSocialReply(
  utterance: unknown,
  options: TurnQualityOptions = {},
): boolean {
  const routingIntent = normalizeRoutingIntent(options.routingIntent);
  const queryType = normalizeQueryType(options.queryType);
  if (routingIntent !== 'social_chat' && queryType !== 'conversation') {
    return false;
  }

  const normalized = normalizeForEchoCheck(utterance);
  if (!normalized) return false;

  const genericPatterns = [
    /\btell me more\b/,
    /\bhow can i help\b/,
    /\bhelp where i can\b/,
    /\bwhat can i help with\b/,
    /\bcould you clarify\b/,
    /\bcan you clarify\b/,
    /\bi m here to help\b/,
    /\blet me know how i can help\b/,
  ];

  return genericPatterns.some((pattern) => pattern.test(normalized));
}

function extractLocationAssertionPhrases(text: unknown): string[] {
  const source = typeof text === 'string' ? text : '';
  if (!source.trim()) return [];
  const phrases: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\bwelcome to\s+(?:the\s+)?([a-z0-9\u00c0-\u024f' -]{2,48}?)(?=$|[,.!?;:]|\s+(?:and|but)\b)/gi,
    /\bwe(?:'re| are)\s+(?:at|in)\s+(?:the\s+)?([a-z0-9\u00c0-\u024f' -]{2,48}?)(?=$|[,.!?;:]|\s+(?:and|but)\b)/gi,
    /\byou(?:'re| are)\s+(?:at|in)\s+(?:the\s+)?([a-z0-9\u00c0-\u024f' -]{2,48}?)(?=$|[,.!?;:]|\s+(?:and|but)\b)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const phrase = normalizeLocationPhrase(match[1] ?? '');
      if (!phrase || seen.has(phrase)) continue;
      seen.add(phrase);
      phrases.push(phrase);
    }
  }

  return phrases;
}

function extractPlayerDestinationPhrases(text: unknown): string[] {
  const source = typeof text === 'string' ? text : '';
  if (!source.trim()) return [];
  const phrases: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\b(?:headed|heading|going|traveling|travelling|moving)\s+to\s+(?:the\s+)?([a-z0-9\u00c0-\u024f' -]{2,48}?)(?=$|[,.!?;:]|\s+(?:to|for)\b)/gi,
    /\bon my way to\s+(?:the\s+)?([a-z0-9\u00c0-\u024f' -]{2,48}?)(?=$|[,.!?;:]|\s+(?:to|for)\b)/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      const phrase = normalizeLocationPhrase(match[1] ?? '');
      if (!phrase || seen.has(phrase)) continue;
      seen.add(phrase);
      phrases.push(phrase);
    }
  }

  return phrases;
}

function locationTokensOverlap(left: string[], right: string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const rightSet = new Set(right);
  return left.some((token) => rightSet.has(token));
}

function findCurrentLocationMismatch(
  utterance: unknown,
  playerMessage: unknown,
  options: TurnQualityOptions = {},
): string | null {
  const routingIntent = normalizeRoutingIntent(options.routingIntent);
  const queryType = normalizeQueryType(options.queryType);
  if (routingIntent !== 'social_chat' && queryType !== 'conversation') {
    return null;
  }

  const authoritativeTokens = [
    ...tokenizeLocationPhrase(options.regionName),
    ...tokenizeLocationPhrase(options.regionPath),
  ];
  if (authoritativeTokens.length === 0) return null;

  const assertedPhrases = extractLocationAssertionPhrases(utterance);
  const playerDestinations = extractPlayerDestinationPhrases(playerMessage);
  if (assertedPhrases.length === 0 || playerDestinations.length === 0) return null;

  for (const asserted of assertedPhrases) {
    const assertedTokens = tokenizeLocationPhrase(asserted);
    if (locationTokensOverlap(assertedTokens, authoritativeTokens)) continue;
    for (const destination of playerDestinations) {
      const destinationTokens = tokenizeLocationPhrase(destination);
      if (
        locationTokensOverlap(assertedTokens, destinationTokens)
        && !locationTokensOverlap(destinationTokens, authoritativeTokens)
      ) {
        return asserted;
      }
    }
  }

  return null;
}

function normalizePlayerAttributionText(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f\s'-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stemPlayerAttributionToken(token: unknown): string {
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

function tokenizePlayerAttributionText(text: unknown): string[] {
  return normalizePlayerAttributionText(text)
    .replace(/['’]s\b/g, '')
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 1 && !PLAYER_ATTRIBUTION_STOP_WORDS.has(entry));
}

function expandPlayerAttributionTokenVariants(token: unknown): Set<string> {
  const variants = new Set<string>();
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

function normalizeAttributedPhrase(phrase: unknown): string {
  const normalized = normalizePlayerAttributionText(phrase);
  if (!normalized) return '';
  return normalized
    .replace(/['’]s\b.*$/g, '')
    .replace(/\b(?:is|are|was|were|has|have|had|can|could|would|will|should|always|often|never|looks?|seems?|sounds?|feels?|been|being)\b.*$/g, '')
    .replace(/^(?:a|an|the|this|that|these|those|new|old)\s+/, '')
    .trim();
}

function extractPlayerAttributionPhrases(utterance: unknown): string[] {
  const source = typeof utterance === 'string' ? utterance : '';
  if (!source.trim()) return [];
  const phrases: string[] = [];
  const seen = new Set<string>();

  const pushPhrase = (rawPhrase: unknown) => {
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

function collectPlayerEvidenceFacts(playerMessage: unknown, history: unknown): string[] {
  const facts: string[] = [];
  const seen = new Set<string>();

  const pushFact = (rawFact: unknown) => {
    const normalized = normalizeFact(String(rawFact ?? ''));
    if (!normalized || normalized.length < 6) return;
    const canonical = normalized.toLowerCase();
    if (seen.has(canonical)) return;
    seen.add(canonical);
    facts.push(normalized);
  };

  const pushFactsFromMessage = (rawMessage: unknown) => {
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
    .filter((entry) => isRecord(entry) && entry.role === 'player' && typeof entry.text === 'string')
    .slice(-4)
    .map((entry) => entry.text);
  for (const message of recentPlayerMessages) {
    pushFactsFromMessage(message);
  }

  return facts.slice(-MAX_SESSION_FACTS_PER_NPC);
}

function buildPlayerEvidenceCorpus(playerMessage: unknown, history: unknown, memoryFacts: unknown): string[] {
  const entries: string[] = [];
  const seen = new Set<string>();

  const pushEntry = (rawText: unknown) => {
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
    .filter((entry) => isRecord(entry) && entry.role === 'player' && typeof entry.text === 'string')
    .slice(-6)
    .map((entry) => entry.text);
  for (const message of recentPlayerMessages) {
    pushEntry(message);
  }
  pushEntry(playerMessage);
  return entries;
}

function buildPlayerEvidenceTokenSet(evidenceCorpus: unknown): Set<string> {
  const tokenSet = new Set<string>();
  for (const evidenceText of Array.isArray(evidenceCorpus) ? evidenceCorpus : []) {
    for (const token of tokenizePlayerAttributionText(evidenceText)) {
      for (const variant of expandPlayerAttributionTokenVariants(token)) {
        tokenSet.add(variant);
      }
    }
  }
  return tokenSet;
}

function isAttributionPhraseSupportedByPlayerEvidence(
  phrase: unknown,
  evidenceCorpus: unknown,
  evidenceTokenSet: Set<string>,
): boolean {
  const phraseText = normalizeAttributedPhrase(phrase);
  if (!phraseText) return true;
  const phraseTokens = tokenizePlayerAttributionText(phraseText);
  if (phraseTokens.length === 0) return true;
  const firstToken = phraseTokens[0] ?? '';
  const secondToken = phraseTokens[1] ?? '';
  if (phraseTokens.length === 1 && PLAYER_ATTRIBUTION_ALLOWED_GENERIC.has(firstToken)) {
    return true;
  }
  if (
    phraseTokens.length === 2
    && PLAYER_ATTRIBUTION_ALLOWED_GENERIC.has(firstToken)
    && PLAYER_ATTRIBUTION_ALLOWED_GENERIC.has(secondToken)
  ) {
    return true;
  }
  if ((Array.isArray(evidenceCorpus) ? evidenceCorpus : []).some((entry) => String(entry).includes(phraseText))) {
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

function findUngroundedPlayerAttributionClaims(
  utterance: unknown,
  playerMessage: unknown,
  history: unknown,
  memoryFacts: unknown,
): string[] {
  const phrases = extractPlayerAttributionPhrases(utterance);
  if (phrases.length === 0) return [];
  const evidenceCorpus = buildPlayerEvidenceCorpus(playerMessage, history, memoryFacts);
  const evidenceTokenSet = buildPlayerEvidenceTokenSet(evidenceCorpus);
  return phrases.filter((phrase) => !isAttributionPhraseSupportedByPlayerEvidence(phrase, evidenceCorpus, evidenceTokenSet));
}

function shouldEnforcePlayerAttributionGrounding(options: TurnQualityOptions = {}): boolean {
  const routingIntent = normalizeRoutingIntent(options.routingIntent);
  if (routingIntent === 'session_recall' || routingIntent === 'social_chat' || routingIntent === 'unclear') {
    return true;
  }
  const queryType = normalizeQueryType(options.queryType);
  return queryType === 'conversation';
}

function normalizeIdentityName(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractDeclaredIdentityName(message: unknown): string | null {
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

function extractPlayerDeclaredIdentityName(playerMessage: unknown, history: unknown): string | null {
  const fromCurrent = extractDeclaredIdentityName(playerMessage);
  if (fromCurrent) return fromCurrent;

  const recentPlayerMessages = (Array.isArray(history) ? history : [])
    .filter((entry) => isRecord(entry) && entry.role === 'player' && typeof entry.text === 'string')
    .slice(-6)
    .map((entry) => entry.text)
    .reverse();
  for (const message of recentPlayerMessages) {
    const candidate = extractDeclaredIdentityName(message);
    if (candidate) return candidate;
  }
  return null;
}

function isLikelyNpcIdentityInversion(
  utterance: unknown,
  playerMessage: unknown,
  history: unknown,
  npcName: unknown,
): boolean {
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

export function validateTurnQuality(
  turn: unknown,
  playerMessage: unknown,
  history: unknown,
  memoryFacts: unknown,
  options: TurnQualityOptions = {},
): { valid: true } | { valid: false; reason: string } {
  const utterance = isRecord(turn) ? String(turn.utterance ?? '') : '';
  const initiativeAction = normalizeInitiativeAction(options.initiativeAction, 'player_respond');
  const allowRepeatChecks = initiativeAction !== 'close';
  const normalizedReply = normalizeForEchoCheck(utterance);
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
  if (isLikelyEchoReply(utterance, playerMessage)) {
    return {
      valid: false,
      reason: 'utterance mirrors player text',
    };
  }
  if (allowRepeatChecks && isLikelyRepeatOfRecentNpcReply(utterance, history)) {
    return {
      valid: false,
      reason: 'utterance repeats recent npc reply',
    };
  }
  if (allowRepeatChecks && isLikelyRepeatOfRecentPlayerText(utterance, history)) {
    return {
      valid: false,
      reason: 'utterance repeats earlier player text',
    };
  }
  if (isLikelyRawMemoryFact(utterance, memoryFacts)) {
    return {
      valid: false,
      reason: 'utterance repeats remembered fact verbatim',
    };
  }
  if (isLikelyNpcIdentityInversion(utterance, playerMessage, history, options.npcName)) {
    return {
      valid: false,
      reason: 'utterance adopts player identity as npc self-introduction',
    };
  }
  if (options.isFirstMeeting === true && isLikelyFirstMeetingFamiliarityClaim(utterance)) {
    return {
      valid: false,
      reason: 'first meeting response implies prior familiarity',
    };
  }
  if (options.isFirstMeeting === true && isLikelyUngroundedFirstMeetingGreetingReply(utterance, playerMessage)) {
    return {
      valid: false,
      reason: 'first meeting greeting includes ungrounded player assumptions',
    };
  }
  if (isLikelyGenericAssistantSocialReply(utterance, options)) {
    return {
      valid: false,
      reason: 'social reply sounds like generic assistant filler',
    };
  }
  const locationMismatch = findCurrentLocationMismatch(utterance, playerMessage, options);
  if (locationMismatch) {
    return {
      valid: false,
      reason: `social reply conflicts with authoritative current location: ${locationMismatch}`,
    };
  }
  if (shouldEnforcePlayerAttributionGrounding(options)) {
    const ungroundedClaims = findUngroundedPlayerAttributionClaims(
      utterance,
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
