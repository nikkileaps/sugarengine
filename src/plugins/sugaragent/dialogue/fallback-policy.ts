// @ts-nocheck
function normalizeFact(text) {
  return (text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.?!]+$/g, '');
}

function normalizeForRecallCheck(text) {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isRecallPrompt(message) {
  const source = (message ?? '').trim();
  const normalized = normalizeForRecallCheck(message);
  if (!normalized) return false;

  if (
    normalized.includes('what do you remember about me')
    || normalized.includes('what did i mention before')
    || normalized.includes('what did i say before')
  ) {
    return true;
  }

  const hasQuestionForm = source.includes('?')
    || /^(what|when|where|who|why|how|do|did|can|could|would|will|have|has|is|are)\b/.test(normalized);
  if (!hasQuestionForm) {
    return false;
  }

  if (!normalized.includes('remember') && !normalized.includes('mention') && !normalized.includes('said')) {
    return false;
  }

  return (
    normalized.includes('about me')
    || normalized.includes('before')
    || normalized.includes('i mention')
    || normalized.includes('i said')
    || normalized.includes('did i tell you')
  );
}

function toRecallClause(rawFact) {
  const fact = normalizeFact(String(rawFact ?? ''));
  if (!fact) return null;

  const nameMatch = fact.match(/^my name is\s+(.+)$/i);
  if (nameMatch?.[1]) return `your name is ${nameMatch[1]}`;

  const originMatch = fact.match(/^i(?:'m| am) from\s+(.+)$/i);
  if (originMatch?.[1]) return `you are from ${originMatch[1]}`;

  const speakMatch = fact.match(/^i speak\s+(.+)$/i);
  if (speakMatch?.[1]) return `you speak ${speakMatch[1]}`;

  const likeMatch = fact.match(/^i like\s+(.+)$/i);
  if (likeMatch?.[1]) return `you like ${likeMatch[1]}`;

  const worriedMatch = fact.match(/^i(?:'m| am) worried about\s+(.+)$/i);
  if (worriedMatch?.[1]) return `you were worried about ${worriedMatch[1]}`;

  return fact.charAt(0).toLowerCase() + fact.slice(1);
}

function splitCompositeFact(rawFact) {
  const fact = normalizeFact(String(rawFact ?? ''));
  if (!fact) return [];

  return fact
    .split(/\s+and\s+(?=i(?:\s|['’]m\b))/i)
    .map((entry) => normalizeFact(entry))
    .filter(Boolean);
}

function canonicalizeClause(clause) {
  return (clause ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeClauses(clauses) {
  const seen = new Set();
  const deduped = [];

  for (const clause of clauses) {
    const canonical = canonicalizeClause(clause);
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    deduped.push(clause);
  }

  return deduped;
}

function createRecallFallbackReply(memoryFacts) {
  const clauses = dedupeClauses(
    (Array.isArray(memoryFacts) ? memoryFacts : [])
      .flatMap(splitCompositeFact)
      .map(toRecallClause)
      .filter((entry) => typeof entry === 'string' && entry.length > 0),
  );

  if (clauses.length === 0) {
    return {
      utterance: "I don't remember any details yet. Tell me something about yourself and I'll keep it in mind.",
      emotion: 'neutral',
      intent: 'recall',
      proposedIntents: [],
      citations: [],
    };
  }

  if (clauses.length === 1) {
    return {
      utterance: `You mentioned that ${clauses[0]}.`,
      emotion: 'warm',
      intent: 'recall',
      proposedIntents: [],
      citations: [],
    };
  }

  if (clauses.length === 2) {
    return {
      utterance: `You mentioned that ${clauses[0]}, and ${clauses[1]}.`,
      emotion: 'warm',
      intent: 'recall',
      proposedIntents: [],
      citations: [],
    };
  }

  return {
    utterance: `You mentioned that ${clauses[0]}, ${clauses[1]}, and ${clauses.length - 2} other detail${clauses.length - 2 === 1 ? '' : 's'}.`,
    emotion: 'warm',
    intent: 'recall',
    proposedIntents: [],
    citations: [],
  };
}

export function createConversationFallbackReply() {
  return {
    utterance: 'I lost my train of thought. Could you say that again?',
    emotion: 'neutral',
    intent: 'conversation',
    proposedIntents: [],
    citations: [],
  };
}

export function createDeterministicFallbackReply(playerMessage, memoryFacts) {
  if (isRecallPrompt(playerMessage)) {
    return createRecallFallbackReply(memoryFacts);
  }
  return createConversationFallbackReply();
}
