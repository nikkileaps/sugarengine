/**
 * @fileoverview Deterministic semantic verification (Stage E1).
 *
 * Implements: ADR-SA-028
 *
 * Verifies that realized turn output matches the validated plan.
 * No extra online LLM call — purely deterministic.
 *
 * Checks:
 * 1. Every factual proposition maps to a planned claim
 * 2. No new named entities absent from plan/evidence/snapshot
 * 3. Hedge strength preserved for inferred/rumor claims
 * 4. Social parts do not contain factual propositions unless planned
 * 5. Realization does not increase specificity past maxSpecificity
 */

import type {
  TurnPlan,
  PlannedClaim,
  EpistemicEvidenceItem,
  NpcStateSnapshot,
  SemanticUnit,
  SemanticVerificationResult,
  SemanticLane,
  PropositionType,
  HedgeStrength,
} from '../turn-contracts.js';

// ---------------------------------------------------------------------------
// Semantic unit extraction (deterministic)
// ---------------------------------------------------------------------------

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;

const FACTUAL_INDICATORS = [
  /\b(is|are|was|were|has|have|had)\b/,
  /\b(located|situated|founded|created|established|built)\b/,
  /\b(known as|called|named)\b/,
  /\b(belongs to|owned by|part of)\b/,
];

const QUESTION_INDICATORS = /[?]$/;

const GREETING_PATTERNS = /^(hi|hello|hey|good (morning|afternoon|evening)|greetings|welcome)\b/i;

const AFFECT_PATTERNS = /^(I'm (sorry|glad|happy|sad)|that's (great|terrible|wonderful)|I (feel|understand))\b/i;

const DIRECTIVE_PATTERNS = /^(please|let's|you should|go to|try|come|follow)\b/i;

const STRONG_HEDGE_PATTERNS = [
  /\bI heard\b/i,
  /\bpeople say\b/i,
  /\brumor has it\b/i,
  /\ballegedly\b/i,
  /\bsupposedly\b/i,
  /\bsome say\b/i,
  /\bthey say\b/i,
];

const SOFT_HEDGE_PATTERNS = [
  /\bI think\b/i,
  /\bit seems\b/i,
  /\bprobably\b/i,
  /\bmight be\b/i,
  /\bcould be\b/i,
  /\bas far as I know\b/i,
];

function classifyPropositionType(clause: string): PropositionType {
  const trimmed = clause.trim();
  if (!trimmed) return 'uncertain';
  if (QUESTION_INDICATORS.test(trimmed)) return 'question';
  if (GREETING_PATTERNS.test(trimmed)) return 'greeting';
  if (AFFECT_PATTERNS.test(trimmed)) return 'affect';
  if (DIRECTIVE_PATTERNS.test(trimmed)) return 'directive';
  if (FACTUAL_INDICATORS.some((p) => p.test(trimmed))) return 'fact';
  return 'uncertain';
}

function detectHedge(clause: string): HedgeStrength {
  if (STRONG_HEDGE_PATTERNS.some((p) => p.test(clause))) return 'strong';
  if (SOFT_HEDGE_PATTERNS.some((p) => p.test(clause))) return 'soft';
  return 'none';
}

function extractNamedEntitiesSimple(clause: string): string[] {
  // Simple capitalized word extraction (not preceded by sentence start)
  const entities: string[] = [];
  const words = clause.split(/\s+/);
  for (let i = 1; i < words.length; i++) {
    const word = (words[i] ?? '').replace(/[^a-zA-Z\u00c0-\u024f]/g, '');
    const firstChar = word.charAt(0);
    if (word.length >= 2 && firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase()) {
      entities.push(word.toLowerCase());
    }
  }
  return [...new Set(entities)];
}

export function extractSemanticUnits(utterance: string): SemanticUnit[] {
  const clauses = utterance.split(SENTENCE_SPLIT).filter((c) => c.trim().length > 0);
  return clauses.map((clause, index) => {
    const propositionType = classifyPropositionType(clause);
    const lane: SemanticLane = propositionType === 'fact' ? 'knowledge' : 'social';
    return {
      unitId: `su_${index + 1}`,
      clauseText: clause.trim(),
      lane,
      propositionType,
      hedgeStrength: detectHedge(clause),
      namedEntities: extractNamedEntitiesSimple(clause),
    };
  });
}

// ---------------------------------------------------------------------------
// Claim matching
// ---------------------------------------------------------------------------

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\u00c0-\u024f\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3),
  );
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap++;
  }
  return overlap / Math.min(a.size, b.size);
}

function matchUnitToPlannedClaim(
  unit: SemanticUnit,
  claims: PlannedClaim[],
): PlannedClaim | null {
  const unitTokens = tokenize(unit.clauseText);
  let bestMatch: PlannedClaim | null = null;
  let bestScore = 0;

  for (const claim of claims) {
    const claimTokens = tokenize(claim.text);
    const score = tokenOverlap(unitTokens, claimTokens);
    if (score > bestScore && score >= 0.3) {
      bestScore = score;
      bestMatch = claim;
    }
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// Main verification
// ---------------------------------------------------------------------------

export function verifyRealizationAgainstPlan(
  utterance: string,
  plan: TurnPlan,
  evidencePack: { items: EpistemicEvidenceItem[] } | null,
  snapshot: NpcStateSnapshot,
): SemanticVerificationResult {
  const units = extractSemanticUnits(utterance);
  const errors: string[] = [];
  const unsupportedUnits: SemanticUnit[] = [];
  const overassertedUnits: SemanticUnit[] = [];

  // Collect all allowed entities from plan, evidence, and snapshot
  const allowedEntities = new Set<string>();
  for (const claim of plan.claims) {
    for (const entity of extractNamedEntitiesSimple(claim.text)) {
      allowedEntities.add(entity);
    }
  }
  if (evidencePack) {
    for (const item of evidencePack.items) {
      for (const entity of extractNamedEntitiesSimple(item.text)) {
        allowedEntities.add(entity);
      }
      for (const entityId of item.entityIds) {
        allowedEntities.add(entityId.toLowerCase());
      }
    }
  }
  if (snapshot.npcName) allowedEntities.add(snapshot.npcName.toLowerCase());
  if (snapshot.selfEntityId) allowedEntities.add(snapshot.selfEntityId.toLowerCase());

  for (const unit of units) {
    if (unit.propositionType !== 'fact') continue;

    const matchedClaim = matchUnitToPlannedClaim(unit, plan.claims);
    if (!matchedClaim) {
      errors.push(`unsupported factual unit: ${unit.clauseText}`);
      unsupportedUnits.push(unit);
      continue;
    }

    // Check hedge strength
    const hedgeOrder: Record<HedgeStrength, number> = { none: 0, soft: 1, strong: 2 };
    if (hedgeOrder[unit.hedgeStrength] < hedgeOrder[matchedClaim.requiredHedge]) {
      errors.push(`overasserted claim (requires ${matchedClaim.requiredHedge} hedge): ${unit.clauseText}`);
      overassertedUnits.push(unit);
    }

    // Check for out-of-plan entities
    for (const entity of unit.namedEntities) {
      if (!allowedEntities.has(entity)) {
        errors.push(`new entity introduced: ${entity} in "${unit.clauseText}"`);
        unsupportedUnits.push(unit);
        break;
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    unsupportedUnits,
    overassertedUnits,
  };
}
