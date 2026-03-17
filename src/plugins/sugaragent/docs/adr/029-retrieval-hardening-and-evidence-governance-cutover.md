# ADR-SA-029: Retrieval Hardening and Evidence Governance Cutover

## Status

Proposed

## Date

2026-03-13

## Context

The strategic architecture assumes:

1. merged retrieval,
2. reranking,
3. evidence-pack governance,
4. corrective retrieval when needed.

The current live path is still materially weaker than that target. It can:

1. rely on direct lexical retrieval in the active path,
2. expose only a small first slice of evidence to the model,
3. skip the richer evidence-pack path that already exists in the codebase.

That weakens both factual quality and the planner's ability to stay conversational.

## Decision

The live path must cut over to governed evidence-pack retrieval before knowledge planning.

## Required Retrieval Stages

1. Initial query construction from player message, route intent, mode, and identity scope.
2. Lexical retrieval.
3. Vector retrieval when an embedding backend is available.
4. Deterministic merge and dedupe.
5. Rerank.
6. Retrieval-quality evaluation.
7. At most one corrective retrieval pass.
8. Evidence-pack budgeting and selection.

## Domain Model

```ts
interface RetrievalCandidate {
  sourceId: string;
  sourceType: string;
  text: string;
  ownerType: 'npc' | 'player' | 'world' | 'beat' | 'unknown';
  knowledgeClass: KnowledgeClass;
  lexicalScore: number;
  vectorScore?: number;
  rerankScore: number;
  confidence: number;
}

interface RetrievalRun {
  strategy: 'full' | 'lexical_only' | 'degraded';
  attempted: boolean;
  correctiveAttempted: boolean;
  qualityReason: string;
  candidates: RetrievalCandidate[];
  selected: RetrievalCandidate[];
}
```

## Algorithm Sketch

```ts
async function retrieveAndRerankEvidence(
  request: PluginAgentTurnRequest,
  route: RoutingResult,
  snapshot: NpcStateSnapshot,
): Promise<RetrievalRun> {
  const baseQuery = buildRetrievalQuery(request.playerMessage, route, snapshot);
  const lexical = runLexicalRetrieval(baseQuery, snapshot);
  const vector = await maybeRunVectorRetrieval(baseQuery, snapshot);
  const merged = mergeRetrievalPools(lexical, vector);
  const reranked = rerankCandidates(merged, { route, snapshot });
  const quality = evaluateRetrievalQuality(reranked, { route, snapshot });

  if (quality.pass) {
    return finalizeRetrieval(reranked, { strategy: vector.length > 0 ? 'full' : 'lexical_only' });
  }

  if (!shouldAttemptCorrectiveRetrieval(quality.reason, request, route, snapshot)) {
    return finalizeRetrieval([], {
      strategy: vector.length > 0 ? 'full' : 'lexical_only',
      correctiveAttempted: false,
      qualityReason: quality.reason,
    });
  }

  const correctiveQuery = buildCorrectiveLoreQuery(request.playerMessage, route.queryType, route.intent);
  const corrected = rerankCandidates(
    mergeRetrievalPools(runLexicalRetrieval(correctiveQuery, snapshot), await maybeRunVectorRetrieval(correctiveQuery, snapshot)),
    { route, snapshot },
  );
  const correctedQuality = evaluateRetrievalQuality(corrected, { route, snapshot });

  if (correctedQuality.pass) {
    return finalizeRetrieval(corrected, {
      strategy: vector.length > 0 ? 'full' : 'lexical_only',
      correctiveAttempted: true,
    });
  }

  return finalizeRetrieval([], {
    strategy: vector.length > 0 ? 'full' : 'lexical_only',
    correctiveAttempted: true,
    qualityReason: correctedQuality.reason,
  });
}
```

## Corrective Retrieval Policy

The "one retry only" rule is a budgeted control, not an article of faith.

Corrective retrieval is allowed only when the failure mode suggests reformulation can plausibly help, for example:

1. `coverage_low`
2. `support_low`
3. route-intent ambiguity
4. scope mismatch between self/world/other channels

Corrective retrieval should not be attempted when the likely failure cause is structural, for example:

1. no lore bundle is available,
2. allowed scopes are empty by policy,
3. the requested knowledge is private or forbidden by epistemic policy,
4. the artifact genuinely lacks the answer.

This keeps the retry bounded and meaningful for a local-runtime budget.

## Evidence Governance Rules

1. Evidence selection must happen before planning.
2. The model may only see support derived from selected and approved evidence items.
3. Support slots must not be created from an arbitrary first `N` evidence entries.
4. The selected evidence set must respect mode-specific budgets.
5. Retrieval degradation must be explicit in diagnostics.

## Support Exposure Rule

Support slots used during realization must be built from validated planned claims, not from the raw evidence pool.

That prevents:

1. accidental leakage of irrelevant facts,
2. opportunistic model overreach,
3. mismatch between what was selected and what was actually planned.

## Engine Boundary

SugarEngine provides project/plugin configuration and optional runtime services. It does not own:

1. retrieval logic,
2. reranking,
3. evidence budgets.

Those remain SugarAgent responsibilities.

## SugarLang Compatibility

Retrieval must not depend on SugarLang. The same retrieval result must be usable with:

1. no language adaptation,
2. SugarAgent-local language adaptation,
3. future SugarLang-supplied adaptation context.

## Consequences

Positive:

1. the live path matches the architecture already documented,
2. evidence selection becomes more stable and diagnosable,
3. abstention happens after a bounded retrieval effort rather than early collapse.

Tradeoff:

1. retrieval latency increases on knowledge turns,
2. vector retrieval requires optional runtime support and degraded-mode handling,
3. corrective retrieval logic must be reason-aware rather than blindly retried.

## Acceptance Criteria

1. Knowledge turns in the live path use the governed evidence-pack retrieval pipeline.
2. Retrieval quality is evaluated before planning.
3. At most one corrective retrieval pass occurs.
4. Support slots exposed to realization come from validated planned claims only.
