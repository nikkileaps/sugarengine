export type QueryType = 'conversation' | 'self_query' | 'other_query' | 'world_query' | 'mixed_query';
export type RoutingIntent = 'social_chat' | 'session_recall' | 'identity_self' | 'lore_world' | 'lore_other' | 'mixed_knowledge' | 'unclear';
export type RoutingPolicyPath = 'chat' | 'memory_first' | 'self_knowledge' | 'lore_knowledge' | 'safe_chat';

export interface RoutingResult {
  intent: RoutingIntent;
  confidence: number;
  margin: number;
  candidateScores: Array<{ intent: string; score: number }>;
  policyPath: RoutingPolicyPath;
}

function normalizeRoutingSource(playerMessage: unknown): string {
  const source = String(playerMessage ?? '').trim();
  if (!source) return '';
  return source.replace(/\s+/g, ' ');
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

export function routeTurnIntent(playerMessage: unknown, npcName: unknown): RoutingResult {
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
  const npcLower = String(npcName ?? '').trim().toLowerCase();
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
  const intent = (isAmbiguous ? 'unclear' : top.intent) as RoutingIntent;
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
