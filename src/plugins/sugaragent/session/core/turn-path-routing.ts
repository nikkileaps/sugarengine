/**
 * @fileoverview Conservative deterministic turn-path routing.
 *
 * Implements: ADR-SA-025 §Social Fast Path Eligibility
 *
 * The social fast path is a conservative optimization, not a separate intelligence tier.
 * This router must not spend an extra online LLM call.
 * Eligibility is biased toward `grounded` whenever uncertainty exists.
 */

import type { RoutingResult } from './routing';
import type {
  TurnPath,
  TurnRiskSignals,
  TurnRoutingDecision,
  NpcStateSnapshot,
} from './turn-contracts';

// ---------------------------------------------------------------------------
// Risk signal patterns
// ---------------------------------------------------------------------------

const KNOWLEDGE_WH_CUES = /\b(who|what|where|when|why|how)\b.*\b(is|are|was|were|did|does|do|can|could|would|will|has|have)\b/i;
const KNOWLEDGE_WH_LEAD = /^(who|what|where|when|why|how)\b/i;

const RECALL_CUES = /\b(remember|last time|before|you said|promised|yesterday|earlier|told me|mentioned|we talked)\b/i;

const FACTUAL_CLAUSE_PATTERNS = /\b(is|are|was|were|there is|there are|what happened|where is|who is|tell me about|know about|know anything about)\b/i;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function collectTurnRiskSignals(
  playerMessage: string,
  snapshot: NpcStateSnapshot,
  loreEntityIds?: string[],
): TurnRiskSignals {
  const lower = playerMessage.toLowerCase();

  const hasKnowledgeWhCue = KNOWLEDGE_WH_CUES.test(lower) || KNOWLEDGE_WH_LEAD.test(lower);
  const hasRecallCue = RECALL_CUES.test(lower);
  const hasFactualClausePattern = FACTUAL_CLAUSE_PATTERNS.test(lower);

  // Check for lore entity mentions in player message
  let hasLoreEntityMention = false;
  if (loreEntityIds && loreEntityIds.length > 0) {
    for (const entityId of loreEntityIds) {
      if (entityId.length >= 3 && lower.includes(entityId.toLowerCase())) {
        hasLoreEntityMention = true;
        break;
      }
    }
  }

  return {
    hasKnowledgeWhCue,
    hasRecallCue,
    hasLoreEntityMention,
    hasFactualClausePattern,
    hasRouteConflict: false, // set by caller based on routing result
  };
}

export function resolveTurnPath(
  route: RoutingResult,
  playerMessage: string,
  snapshot: NpcStateSnapshot,
  loreEntityIds?: string[],
): TurnRoutingDecision {
  const signals = collectTurnRiskSignals(playerMessage, snapshot, loreEntityIds);
  const interpretation = route.interpretation;
  const semanticSocialProtected = (
    route.intent === 'social_chat'
    && interpretation?.lane === 'social'
    && interpretation.ambiguous === false
    && route.confidence >= 0.64
    && route.margin >= 0.12
  );

  // Route conflict: ambiguous routing or low confidence
  signals.hasRouteConflict = route.confidence < 0.48 || route.margin < 0.12;

  const suppressedRiskSignals: string[] = [];
  if (semanticSocialProtected) {
    if (signals.hasKnowledgeWhCue) {
      signals.hasKnowledgeWhCue = false;
      suppressedRiskSignals.push('knowledge_wh_cue');
    }
    if (signals.hasFactualClausePattern) {
      signals.hasFactualClausePattern = false;
      suppressedRiskSignals.push('factual_clause_pattern');
    }
  }

  const socialFastPathEligible =
    route.intent === 'social_chat' &&
    !signals.hasKnowledgeWhCue &&
    !signals.hasRecallCue &&
    !signals.hasLoreEntityMention &&
    !signals.hasFactualClausePattern &&
    !signals.hasRouteConflict;

  const activeSignals: string[] = [];
  if (signals.hasKnowledgeWhCue) activeSignals.push('knowledge_wh_cue');
  if (signals.hasRecallCue) activeSignals.push('recall_cue');
  if (signals.hasLoreEntityMention) activeSignals.push('lore_entity_mention');
  if (signals.hasFactualClausePattern) activeSignals.push('factual_clause_pattern');
  if (signals.hasRouteConflict) activeSignals.push('route_conflict');

  const heuristicFallbackUsed = (
    route.intent === 'social_chat'
    && !socialFastPathEligible
    && !semanticSocialProtected
    && activeSignals.some((signal) =>
      signal === 'knowledge_wh_cue'
      || signal === 'factual_clause_pattern'
      || signal === 'recall_cue'
      || signal === 'lore_entity_mention'
      || signal === 'route_conflict')
  );
  const heuristicFallbackReason = heuristicFallbackUsed
    ? `grounded path forced by heuristic risk signals: ${activeSignals.join(', ')}`
    : undefined;

  if (heuristicFallbackUsed) {
    console.warn('[sugaragent][turn-path] heuristic fallback forced grounded path for social turn', {
      routeIntent: route.intent,
      confidence: route.confidence,
      margin: route.margin,
      activeSignals,
      playerMessage,
    });
  }

  return {
    routeIntent: route.intent,
    path: socialFastPathEligible ? 'social_fast' : 'grounded',
    socialFastPathEligible,
    routeConfidence: route.confidence,
    factualRiskSignals: activeSignals,
    semanticSocialProtected,
    heuristicFallbackUsed,
    heuristicFallbackReason,
    suppressedRiskSignals,
  };
}

/**
 * Checks whether a realized social response contains factual leakage.
 * If so, the turn should be rerouted or safe-fallbacked.
 */
/**
 * Checks whether a realized social response contains factual leakage.
 * If so, the turn should be rerouted or safe-fallbacked.
 *
 * This is intentionally aggressive — false positives just mean the turn
 * gets re-verified through the grounded path, which is always safe.
 */
export function checkSocialResponseForFactualLeakage(utterance: string): boolean {
  const lower = utterance.toLowerCase();
  const factualPatterns = [
    // Location/place assertions
    /\b(the|this|a) (city|town|village|region|station|gate|forest|shop|store|market|tavern|inn|castle|tower|temple|shrine|cave|mine|bridge|port|harbor|library|academy|guild|hall|plaza|square|garden|park|museum|palace|fortress|dungeon|warehouse) .{0,30}\b(is|was|has|called|named|known)\b/,
    // Origin/creation claims
    /\b(founded|created|established|built|discovered|opened|constructed) (in|by|during|after|before)\b/,
    // Location claims
    /\b(located|situated) (in|at|near|by)\b/,
    // Historical claims
    /\b(history|origin|legend|story) of\b/,
    // Attribution
    /\baccording to\b/,
    // Personal knowledge claims about world
    /\bI (know|heard|learned|discovered|found|saw|visited|been to) (that|about|a |the |this )\b/,
    // Naming invented things
    /\bit'?s called ['"]?\w/,
    /\bthe name (is|of it is|was)\b/,
    // Existence assertions about places/things
    /\bthere'?s (a|an|the) \w+ (shop|store|market|tavern|inn|castle|tower|temple|cave|place|building)\b/,
    // Specific factual-sounding claims with numbers/dates
    /\bfor \d+ years?\b/,
    /\b(in|since|around|about) \d{2,4}\b/,
    // "It's real" / asserting truth of ungrounded claim
    /\b(trust me|believe me|it'?s real|it (does|did) exist|I'?m not (lying|making|imagining))\b/,
  ];
  return factualPatterns.some((p) => p.test(lower));
}
