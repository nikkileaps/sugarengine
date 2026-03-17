// @ts-nocheck
import { localizeGroundedUncertaintyReply } from './language-stock';
export function realizePlanTurn({
  plan,
  npcName,
  playerMessage,
  queryType,
  memoryFacts,
  beatContract,
}, deps) {
  const speechAct = deps.normalizePlanSpeechAct(plan?.speechAct);
  const displayName = deps.normalizeOptionalString(npcName) ?? 'friend';
  const claims = Array.isArray(plan?.claims) ? plan.claims : [];
  const claimTexts = deps.dedupeOrderedStrings(claims.map((entry) => deps.maybePrefixCopula(entry?.text)));
  const citations = claims
    .flatMap((entry) => Array.isArray(entry?.evidenceIds) ? entry.evidenceIds : [])
    .filter((entry, index, source) => source.indexOf(entry) === index)
    .map((sourceId) => ({ sourceId }));

  if (speechAct === 'uncertain') {
    if (plan?.routeIntent === 'session_recall') {
      return {
        ...deps.createDeterministicFallbackReply('what do you remember about me?', memoryFacts),
        beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
      };
    }
    return {
      ...deps.createGroundedUncertaintyReply(queryType),
      beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  if (speechAct === 'recall') {
    if (claimTexts.length === 0) {
      return {
        ...deps.createDeterministicFallbackReply('what do you remember about me?', memoryFacts),
        beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
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
      beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  if (speechAct === 'answer') {
    if (claimTexts.length === 0) {
      return {
        ...deps.createGroundedUncertaintyReply(queryType),
        beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
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
      beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  if (speechAct === 'ask') {
    const prompt = deps.normalizeOptionalString(plan?.questionBack)
      ?? 'What would you like to know?';
    return {
      utterance: prompt,
      emotion: 'curious',
      intent: 'question',
      proposedIntents: [],
      citations,
      beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  if (speechAct === 'close') {
    const closePrompt = deps.normalizeOptionalString(plan?.questionBack)
      ?? 'I think that is all I can help with right now. Goodbye for now, and we can pick this up again later.';
    return {
      utterance: closePrompt,
      emotion: 'warm',
      intent: 'close',
      proposedIntents: [],
      citations,
      beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
    };
  }

  return {
    ...deps.createSocialChatReply({ playerMessage, npcName: displayName }),
    beatEvidence: deps.buildBeatEvidenceFromPlan(plan, beatContract, playerMessage),
  };
}

export function detectBeatCompletionSignal(beatContract, playerMessage, deps) {
  if (!deps.isRecord(beatContract)) return 'none';
  const normalizedMessage = deps.normalizeFact(String(playerMessage ?? '')).toLowerCase();
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
      const normalizedTarget = deps.normalizeOptionalString(beatContract.completionTarget)
        ? deps.normalizeFact(String(beatContract.completionTarget)).toLowerCase()
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

export function buildBeatEvidenceFromPlan(plan, beatContract, playerMessage, deps) {
  if (!deps.isRecord(beatContract)) return deps.createEmptyBeatEvidence();
  const requiredFacts = Array.isArray(beatContract.requiredFacts)
    ? beatContract.requiredFacts.filter((entry) => typeof entry === 'string').map((entry) => deps.normalizeFact(entry))
    : [];
  if (requiredFacts.length === 0) return deps.createEmptyBeatEvidence();
  const claimTexts = Array.isArray(plan?.claims)
    ? plan.claims.filter((entry) => deps.isRecord(entry) && typeof entry.text === 'string').map((entry) => String(entry.text))
    : [];
  const coveredFacts = [];
  const uncoveredFacts = [];
  for (const fact of requiredFacts) {
    const matched = claimTexts.some((claimText) => deps.lexicalOverlapScore(fact, claimText) >= 0.45);
    if (matched) coveredFacts.push(fact);
    else uncoveredFacts.push(fact);
  }
  const completionSignal = deps.detectBeatCompletionSignal(beatContract, playerMessage, deps);
  const coverageRatio = requiredFacts.length > 0 ? coveredFacts.length / requiredFacts.length : 1;
  return {
    beatId: deps.normalizeOptionalString(beatContract.beatId ?? beatContract.id),
    coveredFacts,
    uncoveredFacts,
    completionSignal,
    confidence: Math.max(0, Math.min(1, 0.2 + coverageRatio * 0.65 + (completionSignal !== 'none' ? 0.15 : 0))),
  };
}

export function maybePrefixCopula(text, deps) {
  const source = deps.normalizeFact(text);
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

export function dedupeOrderedStrings(values, deps) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const normalized = deps.normalizeFact(value);
    if (!normalized) continue;
    const canonical = normalized.toLowerCase();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    output.push(normalized);
  }
  return output;
}

export function capitalizeToken(value, deps) {
  const source = deps.normalizeOptionalString(value);
  if (!source) return '';
  return source.charAt(0).toUpperCase() + source.slice(1);
}

export function detectChatSignals(playerMessage, deps) {
  const source = deps.sanitizePromptText(playerMessage).toLowerCase();
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
    greeting: deps.isLikelyGreetingOnlyMessage(source),
    selfIntroName: deps.extractDeclaredIdentityName(playerMessage),
    decline: /\b(i do not|i don't|no thanks|not now|don't want|do not want)\b/.test(source),
    askIdentity: /\b(are you|who are you|your name)\b/.test(source),
    askDirection: /\b(where|how do i get|headed to|going to)\b/.test(source),
    askMemory: /\b(remember|met before|talked before)\b/.test(source),
  };
}

export function createSocialChatReply({ playerMessage, npcName }, deps) {
  const displayName = deps.normalizeOptionalString(npcName) ?? 'friend';
  const signals = deps.detectChatSignals(playerMessage, deps);
  const playerName = deps.normalizeOptionalString(signals.selfIntroName);
  const safePlayerName = playerName ? deps.capitalizeToken(playerName, deps) : null;

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

export function createGroundedUncertaintyReply(queryType, targetLanguage = undefined) {
  const utterance = localizeGroundedUncertaintyReply(queryType, targetLanguage);
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
