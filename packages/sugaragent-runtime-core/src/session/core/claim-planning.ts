/**
 * @fileoverview Multi-strength claim planning and hedge policy.
 *
 * Implements: ADR-SA-027
 *
 * Supports grounded, inferred, and rumor claims with required hedge strength.
 * Prevents false certainty and false uncertainty by mapping evidence strength
 * to appropriate claim modes.
 */

import type {
  ClaimMode,
  RequiredHedge,
  PlannedClaim,
  EpistemicEvidenceItem,
} from './turn-contracts.js';

// ---------------------------------------------------------------------------
// Claim mode resolution (ADR-SA-027)
// ---------------------------------------------------------------------------

export function chooseClaimMode(evidenceItems: EpistemicEvidenceItem[]): ClaimMode | 'uncertain' {
  if (evidenceItems.length === 0) return 'uncertain';
  if (evidenceItems.every((item) => item.accessPolicy === 'assert')) return 'grounded';
  if (evidenceItems.some((item) => item.knowledgeClass === 'rumor')) return 'rumor';
  if (evidenceItems.every((item) => item.accessPolicy === 'assert' || item.accessPolicy === 'hedged')) {
    return 'inferred';
  }
  return 'uncertain';
}

export function requiredHedgeForMode(mode: ClaimMode): RequiredHedge {
  if (mode === 'grounded') return 'none';
  if (mode === 'inferred') return 'soft';
  return 'strong'; // rumor
}

export function maxSpecificityForMode(mode: ClaimMode): 'exact' | 'bounded' | 'coarse' {
  if (mode === 'grounded') return 'exact';
  if (mode === 'inferred') return 'bounded';
  return 'coarse'; // rumor
}

// ---------------------------------------------------------------------------
// Claim construction
// ---------------------------------------------------------------------------

export function buildPlannedClaim(input: {
  claimId: string;
  subject: string;
  ownerType: PlannedClaim['ownerType'];
  text: string;
  evidenceIds: string[];
  evidenceItems: EpistemicEvidenceItem[];
  confidenceOverride?: number;
}): PlannedClaim | null {
  const mode = chooseClaimMode(input.evidenceItems);
  if (mode === 'uncertain') return null;

  const avgConfidence = input.evidenceItems.length > 0
    ? input.evidenceItems.reduce((sum, item) => sum + item.confidence, 0) / input.evidenceItems.length
    : 0;

  return {
    claimId: input.claimId,
    mode,
    subject: input.subject,
    ownerType: input.ownerType,
    text: input.text,
    evidenceIds: input.evidenceIds,
    confidence: input.confidenceOverride ?? Number(Math.max(0.1, Math.min(1, avgConfidence)).toFixed(4)),
    requiredHedge: requiredHedgeForMode(mode),
    maxSpecificity: maxSpecificityForMode(mode),
  };
}

// ---------------------------------------------------------------------------
// Hedge validation
// ---------------------------------------------------------------------------

const SOFT_HEDGE_PATTERNS = [
  /\bI think\b/i,
  /\bit seems\b/i,
  /\bit sounds like\b/i,
  /\bfrom what I know\b/i,
  /\bif I recall\b/i,
  /\bprobably\b/i,
  /\bmight be\b/i,
  /\bcould be\b/i,
  /\bas far as I know\b/i,
];

const STRONG_HEDGE_PATTERNS = [
  /\bI heard\b/i,
  /\bpeople say\b/i,
  /\brumor has it\b/i,
  /\bI cannot vouch\b/i,
  /\ballegedly\b/i,
  /\bsupposedly\b/i,
  /\bsome say\b/i,
  /\bthey say\b/i,
  /\bI'm told\b/i,
  /\bI was told\b/i,
];

export function detectHedgeStrength(text: string): RequiredHedge {
  if (STRONG_HEDGE_PATTERNS.some((p) => p.test(text))) return 'strong';
  if (SOFT_HEDGE_PATTERNS.some((p) => p.test(text))) return 'soft';
  return 'none';
}

/**
 * Validates that the realized text meets the required hedge strength.
 * Returns true if the hedge is sufficient, false if it's too weak.
 */
export function validateHedgeStrength(realizedText: string, requiredHedge: RequiredHedge): boolean {
  if (requiredHedge === 'none') return true;
  const detected = detectHedgeStrength(realizedText);
  if (requiredHedge === 'soft') return detected === 'soft' || detected === 'strong';
  if (requiredHedge === 'strong') return detected === 'strong';
  return true;
}

// ---------------------------------------------------------------------------
// Deterministic hedge prefixes for realization fallback
// ---------------------------------------------------------------------------

export function deterministicHedgePrefix(mode: ClaimMode): string {
  if (mode === 'inferred') return 'I think ';
  if (mode === 'rumor') return 'I heard that ';
  return '';
}
