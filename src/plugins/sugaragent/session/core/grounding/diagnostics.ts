/**
 * @fileoverview Defines normalized grounding diagnostics helpers used by session turn providers.
 *
 * Responsibilities:
 * - Provide a stable empty grounding diagnostics object.
 * - Apply/override the grounding decision on existing diagnostics payloads.
 *
 * Boundaries:
 * - Owns: Grounding diagnostics envelope shaping.
 * - Does not own: Claim validation, evidence retrieval, or turn orchestration.
 *
 * Public API:
 * - createEmptyGroundingDiagnostics: Creates default diagnostics with a supplied decision.
 * - withGroundingDecision: Returns diagnostics with updated summary decision.
 *
 * Side Effects:
 * - none
 *
 * Invariants:
 * - Returned diagnostics always include `summary.decision` and required summary counters.
 *
 * @see ../../../../../../docs/api/plugins/sugaragent/17-sugaragent-session-runtime.md#grounding-plain-language
 */
export function createEmptyGroundingDiagnostics(decision = 'accept') {
  return {
    claimChecks: [],
    summary: {
      supportedCount: 0,
      weakCount: 0,
      unsupportedCount: 0,
      nonFactualCount: 0,
      decision,
    },
    unsupportedClaims: [],
    requiresRepair: false,
    explicitUncertainty: false,
    hasSupportedSelfEvidence: false,
    thresholds: {
      accept: 0,
      weak: 0,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function withGroundingDecision(grounding: unknown, decision: string) {
  if (!isRecord(grounding) || !isRecord(grounding.summary)) {
    return createEmptyGroundingDiagnostics(decision);
  }
  return {
    ...grounding,
    summary: {
      ...grounding.summary,
      decision,
    },
  };
}
