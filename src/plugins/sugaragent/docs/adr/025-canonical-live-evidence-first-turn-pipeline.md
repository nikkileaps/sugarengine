# ADR-SA-025: Canonical Live Evidence-First Turn Pipeline

## Status

Proposed

## Date

2026-03-13

## Context

SugarAgent already documents the desired evidence-first architecture in:

- ADR-016
- ADR-019
- the strategic architecture document

However, the active runtime path still allows the model to perform two jobs at once:

1. decide what is true, knowable, and speakable,
2. perform the NPC in natural language.

That creates the observed failure mode:

1. if the prompt is permissive, the NPC hallucinates or overclaims,
2. if the prompt is strict, the NPC collapses into repeated uncertainty or low-agency replies.

This is not a good long-term boundary for:

1. correctness,
2. mode consistency,
3. deterministic engine authority,
4. future interoperability with SugarLang.

## Decision

The live SugarAgent turn path becomes:

`route -> retrieve -> build evidence pack -> resolve initiative -> plan -> validate plan -> realize -> semantic verify -> persist`

This is the only correctness path for knowledge-bearing turns.

The existing runtime-owned `replyParts` contract remains useful, but only as a realization transport for an already validated plan. It is no longer the primary place where factual decisions are made.

## Local Runtime Operating Profile

Because SugarAgent currently targets a local runtime rather than a highly robust hosted frontier API, the initial production profile is intentionally conservative:

1. knowledge turns should target one online generative LLM call on the happy path,
2. routing, retrieval, evidence-pack assembly, planning, and plan validation should remain deterministic,
3. semantic verification should be deterministic in the initial online path,
4. any heavier NLI- or LLM-based judging should be reserved for:
   - offline evals,
   - shadow-mode diagnostics,
   - optional future remote-provider modes.

This aligns with current structured-output practice where constrained decoding improves shape reliability but does not guarantee semantic correctness on its own.

## Scope

This ADR applies to:

- `identity_self`
- `lore_world`
- `lore_other`
- `mixed_knowledge`
- `session_recall`
- any `social_chat` turn that introduces factual claims

Pure social turns may retain a fast path, but only if they do not introduce new factual propositions.

## Canonical Runtime Contract

### 1) Engine-owned inputs

SugarEngine remains authoritative for:

1. quest state,
2. flags and world mutation,
3. current NPC location/routine snapshot when available,
4. active beat bindings,
5. player inventory and action history,
6. plugin orchestration and save namespaces.

SugarAgent consumes this state but does not mutate it directly.

### 2) Plugin-owned steps

SugarAgent owns:

1. retrieval,
2. evidence-pack assembly,
3. initiative resolution,
4. claim planning,
5. plan validation,
6. realization,
7. semantic verification,
8. plugin-local memory persistence.

### 3) Cross-plugin language adaptation

Language adaptation is downstream of factual planning. SugarLang, if present in the future, may supply language adaptation hints, but it must never be required for:

1. retrieval,
2. evidence ranking,
3. claim selection,
4. semantic verification,
5. engine authority checks.

## Domain Model

```ts
interface TurnRoutingDecision {
  routeIntent: string;
  path: TurnPath;
  socialFastPathEligible: boolean;
  routeConfidence: number;
  factualRiskSignals: string[];
}

type TurnPath = 'social_fast' | 'grounded';

interface NpcStateSnapshot {
  npcId: string;
  selfEntityId?: string;
  mode: 'character' | 'narrative' | 'hybrid';
  locationId?: string;
  currentActivity?: string;
  currentGoal?: string;
  mood?: string;
  activeBeatId?: string;
  relationshipState?: Record<string, number>;
  languageAdaptation?: LanguageAdaptationContext | null;
}

interface EvidencePack {
  schemaVersion: 1;
  routeIntent: string;
  queryType: string;
  items: EvidenceItem[];
  evidenceIdToItem: Map<string, EvidenceItem>;
  budget: {
    mode: string;
    limits: Record<string, number>;
    usage: Record<string, number>;
  };
}

interface TurnPlan {
  schemaVersion: 1;
  mode: 'character' | 'narrative' | 'hybrid';
  routeIntent: string;
  queryType: string;
  speechAct: 'answer' | 'ask' | 'clarify' | 'recall' | 'chat' | 'close' | 'uncertain';
  claims: PlannedClaim[];
  socialActs: PlannedSocialAct[];
  questionBack: string | null;
  memoryWrites: MemoryWrite[];
  initiativeDecision: InitiativeDecision;
}
```

## Algorithm Sketch

```ts
async function runNpcTurn(request: PluginAgentTurnRequest): Promise<PluginAgentTurnResult> {
  const route = routeTurnIntent(request.playerMessage, request.npcName);
  const snapshot = buildNpcStateSnapshot(request, engineContext);
  const adaptationContext = await resolveLanguageAdaptationContext(engineContext, request);
  snapshot.languageAdaptation = adaptationContext;
  const routing = resolveTurnPath(route, request, snapshot);
  const path = routing.path;

  if (path === 'social_fast') {
    const socialPlan = buildSocialPlan(request, snapshot);
    const socialTurn = realizeSocialPlan(socialPlan, snapshot);
    const verified = verifyRealizationAgainstPlan(socialTurn, socialPlan, null, snapshot);
    if (verified.ok) return persistTurn(verified.turn, socialPlan);

    return canEscalateSameTurnFromSocialFastPath(routing, snapshot)
      ? runGroundedTurn(request, route, snapshot, adaptationContext)
      : realizeSafeSocialFallback(snapshot);
  }

  const retrieval = await retrieveAndRerankEvidence(request, route, snapshot);
  const evidencePack = buildEvidencePack(retrieval, request, snapshot);
  const initiative = resolveInitiativePolicy({ route, evidencePack, snapshot });
  const rawPlan = createTurnPlan({ request, route, evidencePack, snapshot, initiative });
  const validatedPlan = validateAndRepairTurnPlan({ plan: rawPlan, evidencePack, snapshot });

  if (!validatedPlan.acceptable) {
    const fallbackPlan = buildAbstentionPlan(validatedPlan, snapshot);
    return persistTurn(realizeDeterministicPlan(fallbackPlan, snapshot), fallbackPlan);
  }

  const realized = await realizePlan(validatedPlan.plan, snapshot);
  const adapted = applyLanguageAdaptation(realized, adaptationContext);
  const verified = verifyRealizationAgainstPlan(adapted, validatedPlan.plan, evidencePack, snapshot);
  const finalTurn = verified.ok
    ? verified.turn
    : realizeDeterministicPlan(validatedPlan.plan, snapshot);

  return persistTurn(finalTurn, validatedPlan.plan);
}
```

Resolving adaptation context early is context gathering only. Applying language adaptation remains a post-plan, pre-final-verification step.

## Social Fast Path Eligibility

`social_fast` is a conservative optimization, not a separate intelligence tier.

The initial runtime must not spend an extra online LLM call to decide whether a turn qualifies. Eligibility should be determined by deterministic routing signals and should be biased toward `grounded` whenever uncertainty exists.

Suggested eligibility shape:

```ts
function resolveTurnPath(
  route: RoutingResult,
  request: PluginAgentTurnRequest,
  snapshot: NpcStateSnapshot,
): TurnRoutingDecision {
  const factualRiskSignals = collectTurnRiskSignals(request.playerMessage, snapshot);

  const socialFastPathEligible =
    route.intent === 'social_chat' &&
    !factualRiskSignals.includes('knowledge_wh_cue') &&
    !factualRiskSignals.includes('recall_cue') &&
    !factualRiskSignals.includes('lore_entity_mention') &&
    !factualRiskSignals.includes('factual_clause_pattern') &&
    !factualRiskSignals.includes('route_conflict');

  return {
    routeIntent: route.intent,
    path: socialFastPathEligible ? 'social_fast' : 'grounded',
    socialFastPathEligible,
    routeConfidence: route.confidence ?? 0,
    factualRiskSignals,
  };
}
```

Examples of conservative factual-risk signals:

1. `knowledge_wh_cue`
   - `who`, `what`, `where`, `when`, `why`, `how` questions about entities, places, causes, or events
2. `recall_cue`
   - `remember`, `last time`, `before`, `you said`, `promised`, `yesterday`
3. `lore_entity_mention`
   - authored entity or location mentions drawn from lore/engine indexes
4. `factual_clause_pattern`
   - `X is Y`, `there is`, `what happened`, `where is`, `who is`
5. `route_conflict`
   - ambiguous or mixed social-plus-knowledge intent

This policy is intentionally asymmetric:

1. false negatives are acceptable
   - some pure social turns may be routed into `grounded`
2. false positives are not
   - turns with factual risk must not be allowed through `social_fast`

If a realized `social_fast` response still leaks factual content, the runtime must reroute or safe-fallback before emitting the turn.

## Migration Rules

1. The current direct `generateStructured -> validate reply parts -> return turn` path becomes legacy.
2. Knowledge turns must cut over first.
3. Pure social fast path may remain, but any social turn that attempts factual content must be rerouted into the grounded path.
4. Temporary shadow execution for comparison is allowed during implementation, but a permanent toggle split is not.

## Shadow Execution Policy

Shadow execution exists to compare legacy and cutover behavior, not to double the steady-state cost of every live turn.

For local runtimes:

1. offline replay is the primary full-comparison mechanism,
2. live shadow should be sampled rather than universal,
3. sampled shadow should run asynchronously where possible,
4. the player-visible response must not block on the legacy shadow result.

Full per-turn dual execution may be used only for short-lived diagnostic windows or targeted local investigations, not as the default rollout posture.

## Boundaries

### SugarEngine boundary

SugarAgent may not:

1. mark quests complete,
2. mutate flags or inventory,
3. establish canonical world truth,
4. own NPC movement or schedule simulation outside plugin-local conversational policy.

### SugarLang boundary

SugarAgent may:

1. consume optional language adaptation context supplied through the host,
2. expose response metadata that SugarLang can use for post-turn learning analysis.

SugarAgent may not:

1. directly import SugarLang modules,
2. require SugarLang to generate factual plans,
3. treat language-learning state as world truth.

## Consequences

Positive:

1. factual selection moves out of free-form generation,
2. abstention becomes deliberate rather than accidental,
3. social style remains flexible without reopening truth selection,
4. the engine/plugin boundary becomes cleaner,
5. SugarLang interoperability becomes possible without creating a hard dependency.

Tradeoff:

1. more runtime stages,
2. more contracts to version,
3. a stricter migration is required to avoid long-lived split paths,
4. local-runtime latency requires careful budgeting so online verification does not become a multi-call judge loop by default.

## Acceptance Criteria

1. The canonical live path for knowledge turns creates a `TurnPlan` before realization.
2. No accepted knowledge turn may originate factual content outside validated planned claims.
3. Engine progression remains deterministic and external to SugarAgent.
4. SugarAgent can operate without SugarLang present.
5. Language adaptation, when present, occurs after factual planning and before final semantic verification.
