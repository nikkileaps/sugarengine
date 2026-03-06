// @ts-nocheck
const VALID_QUERY_TYPES = new Set([
  'conversation',
  'self_query',
  'other_query',
  'world_query',
  'mixed_query',
]);

const ACCEPT_THRESHOLD = 0.64;
const WEAK_THRESHOLD = 0.42;
const MAX_EVIDENCE_PER_CLAIM = 3;

const CLAIM_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'have',
  'has',
  'how',
  'i',
  'in',
  'is',
  'it',
  'its',
  'me',
  'my',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'them',
  'there',
  'these',
  'they',
  'this',
  'to',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'who',
  'why',
  'with',
  'you',
  'your',
]);

const SOCIAL_SENTENCE_PATTERNS = [
  /^(hi|hello|hey|hola|howdy|greetings)[!. ]*$/i,
  /^(nice to meet you|good to see you|welcome|thanks|thank you)[!. ]*$/i,
  /^(how can i help|what can i do for you|what is on your mind)[?.! ]*$/i,
  /^(i hear you|tell me more|go on)[!. ]*$/i,
  /^i heard you (say|mention)\b/i,
  /^you said\b/i,
  /^[a-z0-9' _-]+ heard:\s*/i,
];

const GENERIC_SOCIAL_STEMS = new Set([
  'hello',
  'hi',
  'hey',
  'hola',
  'howdy',
  'thank',
  'welcom',
  'greet',
  'glad',
  'nice',
  'pleas',
  'sure',
  'help',
  'friend',
  'sorry',
  'hear',
  'understand',
  'talk',
  'chat',
]);

const UNCERTAINTY_PATTERNS = [
  /\bi am not sure\b/i,
  /\bi'm not sure\b/i,
  /\bi do not know\b/i,
  /\bi don't know\b/i,
  /\bno reliable records\b/i,
  /\bi do not have reliable records\b/i,
  /\bi don't have reliable records\b/i,
  /\bi do not remember\b/i,
  /\bi don't remember\b/i,
  /\bi lost my train of thought\b/i,
  /\bcould you say that again\b/i,
  /\bi do not want to guess\b/i,
];

const SUBJECTIVE_STATE_PATTERNS = [
  /\b(?:i am|i'm)\s+(?:good|fine|okay|ok|well|great|alright|all right|tired|happy|sad|excited|nervous|busy|hungry|thirsty)\b/i,
  /\b(?:i feel|i'm feeling)\s+(?:good|fine|okay|ok|well|great|alright|happy|sad|excited|nervous|tired)\b/i,
  /\b(?:it(?:'s| is)|thats|that's)\s+(?:good|fine|okay|ok|great|alright|all right)\b/i,
  /\b(?:thanks|thank you)\b.*\b(?:i am|i'm)\s+(?:good|fine|okay|ok|well)\b/i,
];

const ACKNOWLEDGEMENT_PATTERNS = [
  /^(yes|yeah|yep|yup|sure|ok|okay|alright|all right|absolutely|certainly|of course|indeed|right)[!. ]*$/i,
  /^(no|nope|nah)[!. ]*$/i,
];

const SELF_CLAIM_PATTERNS = [
  /\bi\b/i,
  /\bmy\b/i,
  /\bmyself\b/i,
  /\bi\s*(?:am|'m|was|grew|work|live|know|remember|have|had)\b/i,
];

function normalizeWhitespace(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeQueryType(value) {
  if (typeof value !== 'string') return 'conversation';
  const normalized = value.trim().toLowerCase();
  return VALID_QUERY_TYPES.has(normalized) ? normalized : 'conversation';
}

function stemToken(token) {
  if (token.length <= 4) return token;
  return token.replace(/(ing|ed|es|s)$/g, '');
}

function tokenize(text) {
  return normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !CLAIM_STOP_WORDS.has(token));
}

function splitIntoSentenceUnits(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const units = normalized
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => normalizeWhitespace(entry.replace(/^[-*]\s*/, '')))
    .filter(Boolean);

  if (units.length > 0) return units;
  return [normalized];
}

function looksLikeQuestion(sentence) {
  return sentence.includes('?');
}

function isExplicitUncertaintySentence(sentence) {
  return UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(sentence));
}

function isAcknowledgementSentence(sentence) {
  return ACKNOWLEDGEMENT_PATTERNS.some((pattern) => pattern.test(sentence));
}

function isLikelySocialSentence(sentence, tokens) {
  if (!sentence) return true;
  if (SOCIAL_SENTENCE_PATTERNS.some((pattern) => pattern.test(sentence))) {
    return true;
  }

  if (tokens.length === 0) return true;
  if (tokens.length <= 5) {
    const stemmed = tokens.map((token) => stemToken(token));
    if (stemmed.every((token) => GENERIC_SOCIAL_STEMS.has(token))) {
      return true;
    }
  }

  return false;
}

function normalizeEvidenceEntries(entries) {
  if (!Array.isArray(entries)) return [];

  const normalized = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const text = normalizeWhitespace(String(raw.text ?? ''));
    if (!text) continue;

    const sourceType = typeof raw.sourceType === 'string'
      ? raw.sourceType
      : 'unknown';
    const sourceId = typeof raw.sourceId === 'string' && raw.sourceId.trim().length > 0
      ? raw.sourceId.trim()
      : `${sourceType}:${normalized.length + 1}`;
    const entityIds = Array.isArray(raw.entityIds)
      ? raw.entityIds.filter((entry) => typeof entry === 'string').map((entry) => entry.toLowerCase())
      : [];

    normalized.push({
      sourceId,
      sourceType,
      text,
      normalizedText: text.toLowerCase(),
      tokens: tokenize(text),
      stems: tokenize(text).map((token) => stemToken(token)),
      selfAttributed: raw.selfAttributed === true,
      entityIds,
    });
  }

  return normalized;
}

function computeLexicalOverlap(claimTokens, evidenceTokens) {
  if (claimTokens.length === 0 || evidenceTokens.length === 0) return 0;
  const evidenceSet = new Set(evidenceTokens);
  let overlap = 0;
  for (const token of claimTokens) {
    if (evidenceSet.has(token)) overlap += 1;
  }
  return overlap / claimTokens.length;
}

function computeStemOverlap(claimTokens, evidenceStems) {
  if (claimTokens.length === 0 || evidenceStems.length === 0) return 0;
  const evidenceStemSet = new Set(evidenceStems);
  let overlap = 0;
  for (const token of claimTokens) {
    if (evidenceStemSet.has(stemToken(token))) overlap += 1;
  }
  return overlap / claimTokens.length;
}

function computePhraseContainment(claimNormalized, evidenceNormalized) {
  if (!claimNormalized || !evidenceNormalized) return 0;
  if (evidenceNormalized.includes(claimNormalized) || claimNormalized.includes(evidenceNormalized)) {
    const minLength = Math.min(claimNormalized.length, evidenceNormalized.length);
    return minLength >= 24 ? 1 : 0.7;
  }
  return 0;
}

function isSelfReferentialClaim(claim) {
  return SELF_CLAIM_PATTERNS.some((pattern) => pattern.test(claim));
}

function computeQueryCompatibility(queryType, evidenceEntry, claim) {
  const selfReferential = isSelfReferentialClaim(claim);

  if (queryType === 'self_query') {
    if (evidenceEntry.selfAttributed) return 1;
    if (evidenceEntry.sourceType === 'self_profile') return 1;
    if (evidenceEntry.sourceType === 'session_fact' || evidenceEntry.sourceType === 'player_fact') {
      return selfReferential ? 0.55 : 0.8;
    }
    if (evidenceEntry.sourceType === 'beat_fact') return 0.62;
    return 0.2;
  }

  if (queryType === 'other_query') {
    if (evidenceEntry.sourceType === 'lore_chunk' && !evidenceEntry.selfAttributed) return 0.95;
    if (evidenceEntry.sourceType === 'lore_chunk' && evidenceEntry.selfAttributed) return 0.65;
    return 0.72;
  }

  if (queryType === 'world_query') {
    if (evidenceEntry.sourceType === 'lore_chunk') return evidenceEntry.selfAttributed ? 0.75 : 0.95;
    if (evidenceEntry.sourceType === 'beat_fact') return 0.86;
    return 0.6;
  }

  if (queryType === 'mixed_query') {
    if (evidenceEntry.sourceType === 'lore_chunk') return evidenceEntry.selfAttributed ? 0.95 : 0.85;
    return 0.74;
  }

  return 0.72;
}

function computeEntityAlignment(queryType, evidenceEntry, claim, selfEntityId) {
  const selfReferential = isSelfReferentialClaim(claim);

  if (queryType !== 'self_query') {
    return 0.8;
  }

  if (evidenceEntry.selfAttributed || evidenceEntry.sourceType === 'self_profile') {
    return selfReferential ? 1 : 0.88;
  }

  if (evidenceEntry.sourceType === 'session_fact' || evidenceEntry.sourceType === 'player_fact') {
    return selfReferential ? 0.6 : 0.9;
  }

  if (selfEntityId && evidenceEntry.entityIds.length > 0 && !evidenceEntry.entityIds.includes(selfEntityId)) {
    return 0.15;
  }

  return 0.4;
}

function scoreEvidenceForClaim({
  claim,
  claimTokens,
  claimNormalized,
  queryType,
  selfEntityId,
  evidenceEntry,
}) {
  const lexical = computeLexicalOverlap(claimTokens, evidenceEntry.tokens);
  const semantic = computeStemOverlap(claimTokens, evidenceEntry.stems);
  const phrase = computePhraseContainment(claimNormalized, evidenceEntry.normalizedText);
  const queryCompatibility = computeQueryCompatibility(queryType, evidenceEntry, claim);
  const entityAlignment = computeEntityAlignment(queryType, evidenceEntry, claim, selfEntityId);

  const baseScore = (lexical * 0.55)
    + (semantic * 0.2)
    + (phrase * 0.15)
    + (queryCompatibility * 0.1);

  const weighted = baseScore * (0.5 + (entityAlignment * 0.5));
  return {
    score: Math.max(0, Math.min(1, weighted)),
    sourceId: evidenceEntry.sourceId,
    sourceType: evidenceEntry.sourceType,
    selfAttributed: evidenceEntry.selfAttributed,
  };
}

function classifyClaimStatus(score) {
  if (score >= ACCEPT_THRESHOLD) return 'supported';
  if (score >= WEAK_THRESHOLD) return 'weak';
  return 'unsupported';
}

function classifyClaimUnit(sentence) {
  const claim = normalizeWhitespace(sentence);
  const tokens = tokenize(claim);

  if (!claim) {
    return {
      claim,
      normalizedClaim: '',
      tokens,
      factual: false,
      nonFactualReason: 'empty',
    };
  }

  if (looksLikeQuestion(claim)) {
    return {
      claim,
      normalizedClaim: claim.toLowerCase(),
      tokens,
      factual: false,
      nonFactualReason: 'question',
    };
  }

  if (isExplicitUncertaintySentence(claim)) {
    return {
      claim,
      normalizedClaim: claim.toLowerCase(),
      tokens,
      factual: false,
      nonFactualReason: 'uncertainty',
    };
  }
  if (isAcknowledgementSentence(claim)) {
    return {
      claim,
      normalizedClaim: claim.toLowerCase(),
      tokens,
      factual: false,
      nonFactualReason: 'acknowledgement',
    };
  }
  if (SUBJECTIVE_STATE_PATTERNS.some((pattern) => pattern.test(claim))) {
    return {
      claim,
      normalizedClaim: claim.toLowerCase(),
      tokens,
      factual: false,
      nonFactualReason: 'subjective_state',
    };
  }

  if (isLikelySocialSentence(claim, tokens)) {
    return {
      claim,
      normalizedClaim: claim.toLowerCase(),
      tokens,
      factual: false,
      nonFactualReason: 'social',
    };
  }

  if (
    tokens.includes('heard')
    && (tokens.includes('say') || tokens.includes('mention'))
  ) {
    return {
      claim,
      normalizedClaim: claim.toLowerCase(),
      tokens,
      factual: false,
      nonFactualReason: 'acknowledgement',
    };
  }

  return {
    claim,
    normalizedClaim: claim.toLowerCase(),
    tokens,
    factual: true,
    nonFactualReason: null,
  };
}

export function extractClaimUnits(utterance) {
  const source = normalizeWhitespace(utterance);
  if (!source) return [];

  return splitIntoSentenceUnits(source).map((sentence) => classifyClaimUnit(sentence));
}

export function isExplicitUncertaintyUtterance(utterance) {
  const source = normalizeWhitespace(utterance);
  if (!source) return false;
  return UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(source));
}

export function validateGroundedClaims({
  utterance,
  queryType,
  evidenceEntries,
  selfEntityId,
  requireSelfEvidence = false,
} = {}) {
  const normalizedQueryType = normalizeQueryType(queryType);
  const normalizedSelfEntityId = typeof selfEntityId === 'string' && selfEntityId.trim().length > 0
    ? selfEntityId.trim().toLowerCase()
    : undefined;
  const claims = extractClaimUnits(utterance);
  const evidence = normalizeEvidenceEntries(evidenceEntries);

  const claimChecks = [];
  let supportedCount = 0;
  let weakCount = 0;
  let unsupportedCount = 0;
  let nonFactualCount = 0;

  for (const claimUnit of claims) {
    if (!claimUnit.factual) {
      nonFactualCount += 1;
      claimChecks.push({
        claim: claimUnit.claim,
        status: 'non_factual',
        evidenceSourceIds: [],
        score: 0,
      });
      continue;
    }

    const scored = evidence
      .map((entry) => scoreEvidenceForClaim({
        claim: claimUnit.claim,
        claimTokens: claimUnit.tokens,
        claimNormalized: claimUnit.normalizedClaim,
        queryType: normalizedQueryType,
        selfEntityId: normalizedSelfEntityId,
        evidenceEntry: entry,
      }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0] ?? { score: 0 };
    const status = classifyClaimStatus(best.score ?? 0);

    if (status === 'supported') {
      supportedCount += 1;
    } else if (status === 'weak') {
      weakCount += 1;
    } else {
      unsupportedCount += 1;
    }

    claimChecks.push({
      claim: claimUnit.claim,
      status,
      evidenceSourceIds: scored
        .filter((entry) => entry.score >= WEAK_THRESHOLD)
        .slice(0, MAX_EVIDENCE_PER_CLAIM)
        .map((entry) => entry.sourceId),
      score: Number((best.score ?? 0).toFixed(4)),
    });
  }

  const explicitUncertainty = isExplicitUncertaintyUtterance(utterance);
  const hasSupportedSelfEvidence = claims.some((claimUnit, index) => {
    if (!claimUnit.factual) return false;
    const check = claimChecks[index];
    if (!check || check.status !== 'supported') return false;
    const matchingEvidence = evidence.filter((entry) => check.evidenceSourceIds.includes(entry.sourceId));
    return matchingEvidence.some((entry) => entry.selfAttributed || entry.sourceType === 'self_profile');
  });

  let requiresRepair = unsupportedCount > 0;
  const hasFactualClaims = claims.some((claimUnit) => claimUnit.factual);
  const requiresSelfSupport = normalizedQueryType === 'self_query' && requireSelfEvidence;
  if (
    requiresSelfSupport
    && !explicitUncertainty
    && hasFactualClaims
    && !hasSupportedSelfEvidence
  ) {
    requiresRepair = true;
  }

  const unsupportedClaims = claimChecks
    .filter((entry) => entry.status === 'unsupported')
    .map((entry) => entry.claim);

  return {
    claimChecks,
    summary: {
      supportedCount,
      weakCount,
      unsupportedCount,
      nonFactualCount,
      decision: requiresRepair ? 'repair' : 'accept',
    },
    unsupportedClaims,
    requiresRepair,
    explicitUncertainty,
    hasSupportedSelfEvidence,
    queryType: normalizedQueryType,
    requireSelfEvidence: requiresSelfSupport,
    thresholds: {
      accept: ACCEPT_THRESHOLD,
      weak: WEAK_THRESHOLD,
    },
  };
}

export function buildClaimRepairReason(grounding) {
  const unsupportedClaims = Array.isArray(grounding?.unsupportedClaims)
    ? grounding.unsupportedClaims.filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const unsupportedPreview = unsupportedClaims
    .slice(0, 2)
    .map((entry) => `"${normalizeWhitespace(entry).slice(0, 120)}"`)
    .join(', ');

  const unsupportedClause = unsupportedClaims.length > 0
    ? `unsupported claims: ${unsupportedPreview}${unsupportedClaims.length > 2 ? ', ...' : ''}`
    : 'missing grounded support for one or more factual claims';

  const selfClause = grounding?.queryType === 'self_query'
    && grounding?.requireSelfEvidence === true
    && grounding?.hasSupportedSelfEvidence === false
    && !grounding?.explicitUncertainty
    ? '; self_query requires self-attributed evidence or explicit uncertainty'
    : '';

  return `grounding validation failed (${unsupportedClause}${selfClause})`;
}
