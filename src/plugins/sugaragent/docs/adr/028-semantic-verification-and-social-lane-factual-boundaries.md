# ADR-SA-028: Semantic Verification and Social-Lane Factual Boundaries

## Status

Proposed

## Date

2026-03-13

## Context

Current validation primarily checks:

1. output structure,
2. support-slot references,
3. self-query ownership.

That is necessary but insufficient. It does not fully stop:

1. semantic overclaiming inside supported parts,
2. unsupported factual content embedded in `social` parts,
3. shifts in confidence between planned claim mode and realized wording.

## Decision

Every realized turn must pass semantic verification against the validated plan.

The verifier operates on propositions, not only slot mechanics.

Because SugarAgent currently relies on a local LLM, semantic verification is explicitly staged:

1. online v1: deterministic verification only,
2. offline or shadow v2: optional helper verifier model or NLI/LLM-assisted judge,
3. optional future online v3: helper verifier only if latency and accuracy gates are met.

## Semantic Unit Model

```ts
interface SemanticUnit {
  unitId: string;
  clauseText: string;
  lane: 'social' | 'knowledge' | 'meta';
  propositionType: 'fact' | 'question' | 'greeting' | 'affect' | 'directive' | 'uncertain';
  normalizedSubject?: string;
  normalizedPredicate?: string;
  normalizedObject?: string;
  hedgeStrength: 'none' | 'soft' | 'strong';
  namedEntities: string[];
}

interface SemanticVerificationResult {
  ok: boolean;
  errors: string[];
  unsupportedUnits: SemanticUnit[];
  overassertedUnits: SemanticUnit[];
}
```

## Verification Rules

1. Every factual proposition in the realized turn must map to:
   - a planned claim, or
   - a whitelisted social act that is explicitly non-factual.
2. No realized clause may introduce a new named entity absent from:
   - the plan,
   - the evidence used by the plan,
   - the engine-owned snapshot.
3. `inferred` and `rumor` claims must preserve required hedge strength.
4. `social` parts may not contain factual propositions unless those propositions are also present in the plan.
5. Realization may reduce verbosity, but may not increase specificity past `maxSpecificity`.

## Algorithm Sketch

```ts
function verifyRealizationAgainstPlan(
  realizedTurn: SugarAgentTurnOutput,
  plan: TurnPlan,
  evidencePack: EvidencePack | null,
  snapshot: NpcStateSnapshot,
): SemanticVerificationResult {
  const units = extractSemanticUnits(realizedTurn.utterance);
  const allowedClaims = indexPlannedClaims(plan.claims, evidencePack, snapshot);
  const allowedEntities = collectAllowedEntities(plan, evidencePack, snapshot);

  const errors: string[] = [];
  const unsupportedUnits: SemanticUnit[] = [];
  const overassertedUnits: SemanticUnit[] = [];

  for (const unit of units) {
    if (unit.propositionType !== 'fact') continue;

    const matchedClaim = matchUnitToPlannedClaim(unit, allowedClaims);
    if (!matchedClaim) {
      errors.push(`unsupported factual unit: ${unit.clauseText}`);
      unsupportedUnits.push(unit);
      continue;
    }

    if (unit.hedgeStrength < matchedClaim.requiredHedge) {
      errors.push(`overasserted claim: ${unit.clauseText}`);
      overassertedUnits.push(unit);
    }

    if (introducesOutOfPlanEntity(unit.namedEntities, allowedEntities)) {
      errors.push(`new entity introduced: ${unit.clauseText}`);
      unsupportedUnits.push(unit);
    }
  }

  return { ok: errors.length === 0, errors, unsupportedUnits, overassertedUnits };
}
```

## Verification Staging

### Stage A: Online deterministic verifier

Required for initial rollout.

Methods:

1. clause segmentation,
2. entity extraction,
3. planned-claim ID matching,
4. hedge-strength checks,
5. out-of-plan entity detection,
6. social-lane factuality checks.

This stage adds no extra online LLM call.

### Stage B: Offline helper verifier

Allowed for:

1. replay evals,
2. shadow-mode comparison,
3. regression triage.

Methods may include:

1. NLI models,
2. small local verifier models,
3. optional stronger remote judges when available for evaluation only.

### Stage C: Optional online helper verifier

Not part of the initial production plan. It may only be enabled if:

1. the online deterministic verifier proves insufficient,
2. latency budgets still hold,
3. accuracy gains are validated on replay and curated regression suites.

## Social-Lane Boundary

The following are allowed in `social` content without knowledge support:

1. greetings,
2. acknowledgements,
3. empathy,
4. politeness,
5. clarifying questions,
6. graceful topic closure.

The following are not allowed in `social` content unless planned and verified:

1. world facts,
2. biographical facts,
3. player-memory facts,
4. beat progression claims,
5. hidden or private information,
6. specific causal explanations.

## Verification Backends

The verifier is plugin-owned and may use multiple internal strategies:

1. deterministic clause segmentation and proposition normalization,
2. lexical and entity matching,
3. optional entailment-style helper model for offline/shadow evaluation,
4. conservative fallback to deterministic realization on failure.

SugarEngine is not responsible for semantic verification.

## SugarEngine Boundary

The verifier may reject or repair conversational output, but it may not:

1. mutate engine state,
2. reinterpret quest completion,
3. infer new canonical world facts.

## SugarLang Compatibility

If SugarLang adjusts wording, the final post-adaptation output must still pass semantic verification.

This ensures language adaptation cannot become a hidden bypass around factual governance.

## Consequences

Positive:

1. factual leakage from `social` content becomes testable,
2. hedge strength can be enforced consistently,
3. realization quality can improve without reopening hallucination risk.

Tradeoff:

1. semantic verification adds latency and implementation complexity,
2. deterministic proposition extraction must be good enough to avoid false negatives,
3. an online LLM judge is intentionally excluded from the first rollout because it creates both latency pressure and a recursive trust problem.

## Acceptance Criteria

1. Any realized factual proposition absent from the plan causes rejection or repair.
2. `social` parts cannot introduce unsupported lore.
3. `inferred` and `rumor` claims fail verification when realized as certainty.
4. Post-SugarLang adaptation output, if any, is verified with the same contract.
