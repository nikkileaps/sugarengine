/**
 * Purpose:
 * Own SugarAgent deterministic beat runtime evaluation inside the plugin.
 *
 * Responsibilities:
 * - Enforce beat turn-budget fallback rules.
 * - Evaluate beat evidence against authored contract requirements.
 * - Stay machine-readable so the engine host only executes returned actions.
 *
 * Non-Goals:
 * - Do not read engine managers directly.
 * - Do not mutate quest/dialogue/flag state directly.
 * - Do not perform retrieval or response generation.
 *
 * @see ../../docs/adr/021-beat-control-plane-and-deterministic-progression.md
 * @see ../../docs/plans/003-engine-host-decontamination-and-beat-runtime-extraction-plan.md
 */

export interface PluginAgentBeatContract {
  id: string;
  requiredFacts?: string[];
  forbiddenFacts?: string[];
  completionRule: 'player_ack' | 'player_action' | 'engine_flag';
  completionTarget?: string;
  maxTurns?: number;
}

export interface PluginAgentBeatEvidence {
  beatId?: string;
  coveredFacts: string[];
  uncoveredFacts: string[];
  completionSignal: 'none' | 'player_ack' | 'player_action' | 'engine_flag';
  confidence: number;
}

export interface SugarAgentBeatEvaluation {
  passed: boolean;
  coveragePassed: boolean;
  rulePassed: boolean;
  beatIdMatched: boolean;
  forbiddenPassed: boolean;
  confidencePassed: boolean;
  missingRequiredFacts: string[];
  forbiddenFactMentions: string[];
  confidence: number;
  completionSignal: PluginAgentBeatEvidence['completionSignal'];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const entries = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
  return Array.from(new Set(entries));
}

function normalizeComparableFact(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function shouldFallbackToScriptedForBeat(
  contract: PluginAgentBeatContract,
  turnCount: number,
): boolean {
  if (!contract.maxTurns) return false;
  return turnCount > contract.maxTurns;
}

export function evaluateSugarAgentBeatCompletion(
  contract: PluginAgentBeatContract,
  evidence: PluginAgentBeatEvidence | undefined,
  flags: Record<string, unknown> = {},
): SugarAgentBeatEvaluation {
  const requiredFacts = normalizeStringArray(contract.requiredFacts).map(normalizeComparableFact);
  const coveredFacts = normalizeStringArray(evidence?.coveredFacts).map(normalizeComparableFact);
  const uncoveredFacts = normalizeStringArray(evidence?.uncoveredFacts).map(normalizeComparableFact);
  const forbiddenFacts = normalizeStringArray(contract.forbiddenFacts).map(normalizeComparableFact);

  const coveredSet = new Set(coveredFacts);
  const uncoveredSet = new Set(uncoveredFacts);
  const missingRequiredFacts = requiredFacts.filter((fact) => !coveredSet.has(fact));
  const uncoveredAccurate = missingRequiredFacts.every((fact) => uncoveredSet.has(fact));
  const coveragePassed = missingRequiredFacts.length === 0 && uncoveredAccurate;

  const forbiddenFactMentions = forbiddenFacts.filter((fact) => coveredSet.has(fact));
  const forbiddenPassed = forbiddenFactMentions.length === 0;

  const beatIdMatched = typeof evidence?.beatId === 'string' && evidence.beatId === contract.id;
  const completionSignal = evidence?.completionSignal ?? 'none';
  const confidence = typeof evidence?.confidence === 'number' && Number.isFinite(evidence.confidence)
    ? Math.max(0, Math.min(1, evidence.confidence))
    : 0;
  const confidencePassed = confidence >= 0.5;

  let rulePassed = false;
  switch (contract.completionRule) {
    case 'player_ack':
      rulePassed = completionSignal === 'player_ack';
      break;
    case 'player_action':
      rulePassed = completionSignal === 'player_action';
      break;
    case 'engine_flag':
      rulePassed = contract.completionTarget
        ? flags[contract.completionTarget] === true
        : completionSignal === 'engine_flag';
      break;
  }

  return {
    passed: beatIdMatched && coveragePassed && forbiddenPassed && rulePassed && confidencePassed,
    coveragePassed,
    rulePassed,
    beatIdMatched,
    forbiddenPassed,
    confidencePassed,
    missingRequiredFacts,
    forbiddenFactMentions,
    confidence,
    completionSignal,
  };
}
