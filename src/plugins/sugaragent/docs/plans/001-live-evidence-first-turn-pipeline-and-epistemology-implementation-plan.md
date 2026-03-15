# Plan 001: Live Evidence-First Turn Pipeline and Epistemology Implementation

Implements:

- [ADR-SA-025: Canonical Live Evidence-First Turn Pipeline](../adr/025-canonical-live-evidence-first-turn-pipeline.md)
- [ADR-SA-026: NPC Epistemology and Disclosure Model](../adr/026-npc-epistemology-and-disclosure-model.md)
- [ADR-SA-027: Multi-Strength Claim and Reply Contract](../adr/027-multi-strength-claim-and-reply-contract.md)
- [ADR-SA-028: Semantic Verification and Social-Lane Factual Boundaries](../adr/028-semantic-verification-and-social-lane-factual-boundaries.md)
- [ADR-SA-029: Retrieval Hardening and Evidence Governance Cutover](../adr/029-retrieval-hardening-and-evidence-governance-cutover.md)
- [ADR-SA-030: Memory Provenance and Contamination Control](../adr/030-memory-provenance-and-contamination-control.md)
- [ADR-SA-031: Cross-Plugin Language Adaptation Boundary](../adr/031-cross-plugin-language-adaptation-boundary.md)

Follow-up:

- [Plan 002: Online Advanced LLM Follow-Up](./002-online-advanced-llm-follow-up-plan.md)

## Design Constraints

1. SugarEngine remains the deterministic authority for world mutation, quest progression, and plugin orchestration.
2. SugarAgent remains optional and plugin-scoped.
3. SugarAgent and SugarLang must not directly import each other.
4. Any future SugarLang cooperation must happen through host-mediated capability payloads.
5. There must be no permanent long-lived correctness split between old and new turn paths.
6. Eval and release governance continue to build on existing SugarAgent eval ADRs, especially ADR-SA-007 and ADR-SA-022; this plan applies those gates to the new pipeline rather than replacing them.

## Research-Informed Assumptions

The current plan is aligned with several widely cited and still-relevant patterns in grounded generation and local-model serving:

1. adaptive or corrective retrieval is better than naïve fixed retrieval:
   - Self-RAG emphasizes retrieving on demand rather than always attaching a fixed bundle ([Self-RAG](https://arxiv.org/abs/2310.11511))
   - CRAG explicitly evaluates retrieval quality and triggers corrective behavior when retrieval is weak ([CRAG](https://arxiv.org/abs/2401.15884))
2. RAG evaluation should separate retrieval quality from generation faithfulness:
   - [RAGAs](https://arxiv.org/abs/2309.15217)
   - [FActScore](https://arxiv.org/abs/2305.14251)
3. constrained decoding is now standard practice for structured outputs, but structure does not guarantee semantic correctness:
   - [OpenAI Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)
   - [llama.cpp grammar support](https://github.com/ggml-org/llama.cpp)
   - [LLGuidance](https://github.com/guidance-ai/llguidance)
4. local-model structured outputs are improving, but they remain operationally less robust than top hosted APIs and need validator backstops:
   - [llama.cpp issue #10732](https://github.com/ggml-org/llama.cpp/issues/10732)
   - [llama.cpp issue #7149](https://github.com/ggerganov/llama.cpp/issues/7149)
5. additional verification loops can reduce hallucination, but they add latency and complexity:
   - [Chain-of-Verification](https://arxiv.org/abs/2309.11495)
6. smaller models can still be useful for hallucination detection or helper verification if scoped carefully, but they should not be assumed equivalent to frontier hosted judges:
   - [OPDAI at SemEval-2024 Task 6](https://aclanthology.org/2024.semeval-1.104/)
7. cost-aware cascades work best when cheap routing is conservative and uncertain cases escalate upward rather than being forced through the cheap path:
   - [FrugalGPT](https://arxiv.org/abs/2305.05176)

These sources point to a pragmatic local-runtime policy:

1. constrain output shape aggressively,
2. keep online pipelines short,
3. prefer deterministic online validation where possible,
4. use heavier verification in eval/shadow mode before moving it into the user-facing path.

## Current Gap Summary

The repo already contains substantial pieces of the target architecture:

1. richer retrieval governance,
2. plan validation,
3. deterministic realization,
4. initiative policy,
5. topic coverage,
6. runtime-owned reply transport.

But the active turn path still relies on model-first factual generation for live knowledge turns. This plan closes that gap without collapsing plugin boundaries.

## Target Runtime Shape

```ts
async function runNpcTurn(request: PluginAgentTurnRequest): Promise<PluginAgentTurnResult> {
  const route = routeTurnIntent(request.playerMessage, request.npcName);
  const snapshot = buildNpcStateSnapshot(request, hostContext);
  const adaptationContext = await resolveLanguageAdaptationContext(hostContext, sugarAgentPlayerModel);
  snapshot.languageAdaptation = adaptationContext;
  const path = resolveTurnPath(route, request, snapshot);

  if (path === 'social_fast') {
    return runVerifiedSocialFastPath(request, route, snapshot);
  }

  const retrievalRun = await retrieveAndRerankEvidence(request, route, snapshot);
  const evidencePack = buildEvidencePackFromRetrievalRun(retrievalRun, request, snapshot);
  const initiative = resolveInitiativePolicy({ route, evidencePack, snapshot });
  const draftPlan = createEvidenceFirstTurnPlan({ request, route, evidencePack, initiative, snapshot });
  const validatedPlan = validateAndRepairTurnPlan({ plan: draftPlan, evidencePack, snapshot });
  const realized = await realizeValidatedPlan(validatedPlan.plan, snapshot);
  const adapted = applyLanguageAdaptation(realized, adaptationContext);
  const verified = verifyRealizationAgainstPlan(adapted, validatedPlan.plan, evidencePack, snapshot);
  const finalTurn = verified.ok ? adapted : realizeDeterministicPlan(validatedPlan.plan, snapshot);
  persistVerifiedMemory(finalTurn, validatedPlan.plan, snapshot, hostContext);
  return finalTurn;
}
```

Here `resolveLanguageAdaptationContext(...)` is context gathering only. Application still occurs after planning and realization.

## Social Fast Path Routing Policy

The social fast path must be high-precision, not high-recall.

In practice that means SugarAgent should only choose `social_fast` when the turn is very likely to be non-factual. Any uncertainty must route to `grounded`.

The initial routing policy should be deterministic and should not spend an extra online LLM call.

Suggested shape:

```ts
function resolveTurnPath(
  route: RoutingResult,
  request: PluginAgentTurnRequest,
  snapshot: NpcStateSnapshot,
): 'social_fast' | 'grounded' {
  const signals = collectTurnRiskSignals(request.playerMessage, snapshot);

  const socialEligible =
    route.intent === 'social_chat' &&
    !signals.hasKnowledgeWhCue &&
    !signals.hasRecallCue &&
    !signals.hasLoreEntityMention &&
    !signals.hasFactualClausePattern &&
    !signals.hasRouteConflict;

  return socialEligible ? 'social_fast' : 'grounded';
}
```

`collectTurnRiskSignals(...)` should remain deterministic in the initial rollout and use conservative signals such as:

1. `hasKnowledgeWhCue`
   - `who`, `what`, `where`, `when`, `why`, `how` questions about identity, location, causality, history, or events
2. `hasRecallCue`
   - `remember`, `before`, `last time`, `you said`, `promised`, `yesterday`
3. `hasLoreEntityMention`
   - mentions of authored entities, places, factions, items, or beats from the lore index or engine snapshot
4. `hasFactualClausePattern`
   - clauses resembling fact-seeking or fact-evaluating propositions such as `X is Y`, `there is`, `what happened`, `where is`, `who is`
5. `hasRouteConflict`
   - mixed intent, ambiguous route, or low deterministic route confidence

This policy is intentionally asymmetric:

1. false negatives are acceptable
   - a purely social turn may fall back to `grounded`
2. false positives are not
   - a knowledge-bearing turn must not be allowed through `social_fast`

`runVerifiedSocialFastPath(...)` should also perform a final non-factuality check on the realized output. If that verification detects factual leakage, the runtime should:

1. reroute to `grounded` if no online generation budget has been spent yet, or
2. fall back to a safe deterministic social response rather than emit unsupported content.

This keeps the fast path cheap while making misrouting observable and non-catastrophic.

## Priority Order

Not all workstreams are equally urgent for player-facing quality.

### P0: Stop wrong answers

Highest current user harm:

1. unsupported world facts,
2. ownership leakage,
3. brittle retrieval on knowledge turns.

Priority work:

1. Workstream A: Orchestration Cutover
2. Workstream C: Retrieval Hardening
3. minimum deterministic realization path from validated plans

### P1: Stop false uncertainty

Second-highest user harm:

1. NPCs becoming too cautious,
2. open conversation collapsing into `I don't know`.

Priority work:

1. Workstream D: Multi-Strength Planning and Reply Contract

### P2: Stop contamination over time

Third-highest user harm:

1. memory drift,
2. player assertions contaminating evidence.

Priority work:

1. Workstream F: Memory Cleanup and Provenance

### P3: Advanced verification and cross-plugin coordination

Important, but should not block the initial safety cutover:

1. Workstream E: Semantic Verification
2. Workstream G: Cross-Plugin Language Adaptation Boundary

## Operating Budget

Initial local-runtime target budgets:

1. social fast path:
   - zero online LLM calls on the happy path when deterministic response is sufficient,
   - one online LLM call only when style generation is explicitly enabled,
   - no separate online LLM classifier call
2. knowledge turn happy path:
   - one online generative LLM call maximum
   - zero online verifier-judge LLM calls
3. corrective retrieval:
   - one bounded retry at most, and only when the failure reason suggests reformulation can help

Any design that requires two or more serial online LLM calls for most knowledge turns should be treated as a non-starter for the initial local-runtime rollout.

## Phase 0: Baseline Measurement and Budget Lock

Before changing the runtime path, establish a baseline on the current implementation.

Tasks:

1. instrument current live knowledge turns for:
   - unsupported factual proposition rate,
   - ownership leakage,
   - false-abstain rate,
   - false-social-route rate,
   - topic-exhaustion close quality,
   - latency percentiles,
   - schema/JSON failure rates
2. define dataset slices:
   - self biography,
   - world lore,
   - rumor/private-other requests,
   - session recall,
   - hybrid/beat turns
3. lock an initial online latency budget for the local runtime.

Acceptance:

1. Every numeric gate in later phases has a measured baseline.
2. The team can compare proposed thresholds against actual current behavior.

## Workstreams

### Workstream A: Orchestration Cutover

Goal:

- make the live path create and validate a plan before free-form wording.

Target modules:

- `src/plugins/sugaragent/session/runtime.ts`
- `src/plugins/sugaragent/plugin.ts`
- `src/plugins/sugaragent/providers/llm/LocalLLMProvider.ts`

Implementation tasks:

1. Move knowledge-turn orchestration out of the current `generateStructured -> validate reply parts` flow.
2. Keep `replyParts` as realization transport only.
3. Route factual turns into the evidence-first planner path.
4. Retain a social fast path only for non-factual turns.
5. Implement `resolveTurnPath(...)` as a conservative deterministic router.
6. Add a final non-factuality verification step for `social_fast` outputs.
7. If `social_fast` verification fails, reroute or safe-fallback without emitting unsupported factual content.
8. Emit diagnostics that clearly report:
   - route,
   - turn path,
   - social-fast-path risk signals,
   - retrieval strategy,
   - evidence-pack composition,
   - plan outcome,
   - realization verification result.

Acceptance:

1. Every knowledge turn constructs a `TurnPlan` before any free-form factual wording is accepted.
2. Knowledge turns no longer rely on raw model output as the primary factual selector.
3. `social_fast` is chosen only when no factual-risk signal is present.
4. Misrouted social turns are observable through a `false_social_route` metric and cannot emit unsupported facts.

### Workstream B: Epistemology Metadata

Goal:

- distinguish ownership from knowability and disclosure.

Target modules:

- `src/plugins/sugaragent/session/core/retrieval-governance.ts`
- `src/plugins/sugaragent/session/core/grounding/evidence.ts`
- `src/plugins/sugaragent/lore/lore-lib.ts`

Implementation tasks:

1. Add epistemic fields to `EvidenceItem`:
   - `knowledgeClass`
   - `accessPolicy`
   - `disclosurePolicy`
2. Extend lore ingestion to read authored metadata when available.
3. Apply conservative defaults when metadata is absent:
   - lore facts -> `public_fact/assert/answer_only`
   - self profile -> `self_profile/assert/answer_only`
   - player facts -> `player_assertion/recall_only/answer_only`
   - beat facts -> `beat_fact/assert/(urgency-driven disclosure policy)`
4. Add engine/runtime evidence sources for:
   - `routine_state`
   - current location
   - active goal
   - current beat urgency

Acceptance:

1. Every evidence item in a grounded turn has epistemic metadata.
2. Planning refuses forbidden/private-other evidence by default.

### Workstream C: Retrieval Hardening

Goal:

- align the live path with the governed evidence retrieval design.

Target modules:

- `src/plugins/sugaragent/session/core/retrieval-governance.ts`
- `src/plugins/sugaragent/session/runtime.ts`
- `src/plugins/sugaragent/runtime/types.ts`

Implementation tasks:

1. Replace direct lexical-only live retrieval with a merged retrieval pipeline.
2. Add optional vector retrieval via the runtime bridge when embeddings are available.
3. Add deterministic merge, dedupe, rerank, and one corrective retrieval pass.
4. Promote retrieval quality diagnostics to a first-class release gate.
5. Build evidence packs from selected retrieval results, not raw retrieval pools.
6. Attempt corrective retrieval only when the failure reason suggests reformulation can help.

Pseudo flow:

```ts
const lexical = retrieveLexically(query, scopes);
const vector = await maybeRetrieveVector(query, scopes);
const merged = mergeAndDedupe(lexical, vector);
const reranked = rerank(merged, query, mode, routeIntent);
const quality = evaluateRetrievalQuality(reranked, query, mode, routeIntent);

if (!quality.pass) {
  if (quality.reason in ['coverage_low', 'support_low', 'scope_mismatch']) {
    const retryQuery = buildCorrectiveLoreQuery(query, queryType, routeIntent);
    // one retry only
  }
}
```

Acceptance:

1. Knowledge-turn retrieval always reports whether it ran in `full`, `lexical_only`, or `degraded` mode.
2. One and only one corrective retrieval pass may occur.

### Workstream D: Multi-Strength Planning and Reply Contract

Goal:

- support `grounded`, `inferred`, and `rumor` claims without inventing canon.

Target modules:

- `src/plugins/sugaragent/session/core/turn-planning.ts`
- `src/plugins/sugaragent/session/core/grounding/reply-parts.ts`
- `src/plugins/sugaragent/session/core/grounding/reply-parts-validator.ts`

Implementation tasks:

1. Extend planned claims with:
   - `mode`
   - `requiredHedge`
   - `maxSpecificity`
2. Add `inferred` and `rumor` reply part kinds.
3. Build hedge-strength validation rules.
4. Update deterministic realization so it can produce safe non-binary answers.

Pseudo logic:

```ts
if (evidence.every(canAssert)) {
  claim.mode = 'grounded';
} else if (evidence.some(isRumor)) {
  claim.mode = 'rumor';
} else if (evidence.every(canHedgeOrAssert)) {
  claim.mode = 'inferred';
} else {
  speechAct = 'uncertain';
}
```

Acceptance:

1. Answerable but partially supported questions no longer collapse immediately to `uncertain`.
2. `rumor` and `inferred` outputs are forced to preserve hedge semantics.

### Workstream E: Semantic Verification

Goal:

- verify meaning, not only slot references.

Target modules:

- `src/plugins/sugaragent/session/core/grounding/`
- new verifier helper module under `src/plugins/sugaragent/session/core/semantic/`

Implementation tasks:

#### Stage E1: Online deterministic verifier

1. Add a semantic-unit extractor for realized utterances.
2. Match realized propositions back to planned claims.
3. Reject:
   - unsupported factual units,
   - overasserted hedge violations,
   - out-of-plan entity introductions,
   - factual leakage from `social` parts.
4. Add deterministic fallback when semantic verification fails.

#### Stage E2: Offline helper verifier

1. Add an optional replay-only verifier using:
   - a small local verifier model,
   - NLI model,
   - or stronger remote judge for evaluation only.
2. Compare helper-verifier outcomes against the deterministic verifier on curated failures.

#### Stage E3: Optional online helper verifier

1. Only consider this if E1 leaves a clearly measured quality gap.
2. Gate it behind latency and replay-eval budgets.

Pseudo flow:

```ts
const units = extractSemanticUnits(turn.utterance);
for (const unit of units) {
  if (!isFactual(unit)) continue;
  const match = matchToPlannedClaim(unit, plan.claims);
  if (!match) reject();
  if (unit.hedgeStrength < match.requiredHedge) reject();
}
```

Acceptance:

1. E1 adds no extra online LLM judge call.
2. Any unsupported realized fact causes rejection or repair.
3. Social-lane factual leakage is observable and test-covered.
4. E2 helper verification improves offline detection quality before any online adoption is considered.

### Workstream F: Memory Cleanup and Provenance

Goal:

- make memory safe enough to act as evidence.

Target modules:

- `src/plugins/sugaragent/session/core/session-state.ts`
- `src/plugins/sugaragent/session/core/grounding/evidence.ts`

Implementation tasks:

1. Replace permissive fact extraction with explicit player-self assertion extraction.
2. Remove hardcoded world-event heuristics from canonical memory write logic.
3. Add provenance fields and source classes to memory records.
4. Mark old records as `legacy_import`.
5. Require engine confirmation for `shared_event` persistence.
6. Treat ambiguous first-person world beliefs as non-persistable in the canonical path.

Pseudo flow:

```ts
const playerFacts = extractExplicitPlayerFacts(playerMessage);
const npcCommitments = extractValidatedNpcCommitments(validatedPlan, verifiedTurn);
const sharedEvents = inferSharedEventsFromEngineContext(engineEvents, beatProgress);
const writes = filterWrites([...playerFacts, ...npcCommitments, ...sharedEvents]);
persist(writes);
```

Mechanical extraction rule:

```ts
if (subjectIsFirstPerson && predicateType in ['identity', 'origin', 'preference', 'ability', 'commitment', 'possession']) {
  persistAsPlayerFact();
} else if (subjectIsFirstPerson && predicateType in ['belief', 'guess', 'world_locative', 'world_event', 'report']) {
  doNotPersistAsPlayerFact();
}
```

Acceptance:

1. Player assertions about the world are not automatically stored as world evidence.
2. Engine-confirmed events can be recalled safely.

### Workstream G: Cross-Plugin Language Adaptation Boundary

Goal:

- allow future SugarLang cooperation without coupling correctness to it.

Target modules:

- `src/plugins/sugaragent/plugin.ts`
- `src/plugins/sugaragent/public-api.ts`
- engine plugin host capability surfaces

Implementation tasks:

1. Define a host-mediated `language_adaptation_context` capability.
2. Build SugarAgent fallback adaptation from its own player model.
3. Apply language adaptation only after plan validation.
4. Re-run semantic verification after adaptation.

Capability shape:

```ts
interface LanguageAdaptationContext {
  source: 'sugaragent' | 'sugarlang' | 'engine';
  targetLanguage: string;
  learnerLevel?: string;
  cefrBand?: string;
  maxSentenceLength?: number;
  focusVocabulary?: string[];
  codeSwitchPolicy?: 'none' | 'gloss_only' | 'learner_choice';
}
```

Acceptance:

1. SugarAgent runs without SugarLang.
2. When SugarLang is present, the host may provide adaptation context without direct plugin imports.

## Phases

## Phase 1: Contracts and Orchestration Spine

Tasks:

1. Introduce canonical turn-contract types used by live runtime.
2. Refactor the runtime so knowledge turns pass through plan creation and validation.
3. Keep old path available only for shadow diagnostics during implementation.
4. Make deterministic realization the first-class fallback and initial rollout default where needed.
5. Add the conservative `resolveTurnPath(...)` gate before `social_fast`.

Acceptance:

1. The live runtime can emit a validated plan for every knowledge turn.
2. The live runtime can explain why a turn was or was not eligible for `social_fast`.

## Phase 2: Epistemology Metadata and Lore/State Ingestion

Tasks:

1. Extend evidence items and lore ingestion with epistemic fields.
2. Add engine/runtime state evidence adapter for routine/location/goal.
3. Default missing metadata conservatively.

Acceptance:

1. Knowledge planning consumes epistemically typed evidence.

## Phase 3: Retrieval Cutover

Tasks:

1. Wire the live runtime into retrieval governance.
2. Add optional vector retrieval integration.
3. Add corrective retrieval and degraded-mode diagnostics.

Acceptance:

1. Live knowledge turns no longer use direct lexical retrieval as the canonical path.

## Phase 4: Multi-Strength Planning and Realization Transport

Tasks:

1. Extend claim modes and reply part kinds.
2. Add hedge-strength validation.
3. Update deterministic realization.

Acceptance:

1. `inferred` and `rumor` replies are supported end-to-end.

## Phase 5: Semantic Verification

Tasks:

1. Implement semantic-unit extraction.
2. Verify realized output against validated plans.
3. Add deterministic fallback on semantic failure.

Acceptance:

1. Unsupported factual content is rejected even if slot mechanics are valid.

## Phase 6: Memory Provenance Cleanup

Tasks:

1. Replace eager extraction with explicit provenance-typed writes.
2. Mark legacy memory records conservatively.
3. Remove banned heuristics from the canonical path.

Acceptance:

1. Memory contamination metrics improve in replay tests.

## Phase 7: Cross-Plugin Language Adaptation

Tasks:

1. Add host-mediated adaptation capability.
2. Keep SugarAgent-local fallback adaptation.
3. Verify post-adaptation semantics.

Acceptance:

1. SugarLang cooperation is possible without coupling.

## Phase 8: Eval Gates, Cutover, and Legacy Removal

Tasks:

1. Run replay/eval suites against old and new paths during shadow mode.
2. Use offline replay as the primary full-comparison mechanism.
3. Compare old and new paths on the same replay corpora during shadow mode:
   - unsupported proposition rate,
   - false-abstain rate,
   - overasserted rumor rate,
   - social-lane factual leakage,
   - memory contamination,
   - beat correctness,
   - latency.
4. Use live dual-run shadowing only as a sampled diagnostic tool on local runtimes, not as the default for every production turn.
5. Cut over to the new path when gates pass.
6. Remove temporary split-path correctness code.

Acceptance:

1. The new path is the only production correctness path for knowledge turns.

## Eval Suite Requirements

Minimum scenario groups:

1. self biography,
2. public world lore,
3. private-other requests,
4. rumor-style questions,
5. witnessed-event questions,
6. player misinformation,
7. jailbreak attempts,
8. long social chat with topic exhaustion,
9. hybrid beat delivery,
10. language adaptation with and without SugarLang.

Provisional gates:

These are target values, not locked release gates, until Phase 0 baseline measurement is complete.

1. unsupported factual proposition rate `<= 1.0%`
2. ownership leakage `<= 0.2%`
3. rumor overassertion:
   - `0` on the curated rumor regression suite
   - near-zero on aggregate replay traffic once measured
4. false-social-route rate at or below current baseline after routing cutover
5. social-lane factual leakage `<= 0.5%`
6. memory contamination `<= 1.0%`
7. beat completion correctness at or above current baseline

## Rollout Notes

1. Keep migration incremental by phase, but not permanent by architecture.
2. Prefer temporary shadow diagnostics over permanent feature toggles.
3. If vector retrieval is unavailable, operate in degraded mode with stricter abstain/clarify thresholds.
4. If SugarLang capability payloads are unavailable, fall back to SugarAgent-local language adaptation or no adaptation.
5. Existing ADR-SA-007 and ADR-SA-022 infrastructure should run both old and new metrics during shadow mode; the goal is one eval harness with dual-pipeline comparison, not two permanently separate evaluation systems.

## Shadow Mode Execution Policy

The legacy `generateStructured -> validate reply parts` path should not run in parallel for every live turn by default on a local runtime.

Primary policy:

1. full old-vs-new comparison belongs in offline replay and curated eval suites,
2. live shadow should be sampled,
3. sampled live shadow should be asynchronous whenever possible so user-facing latency is not doubled.

Suggested live-shadow policy:

```ts
function shouldRunLiveShadowComparison(input: {
  path: 'social_fast' | 'grounded';
  retrievalMode?: 'full' | 'lexical_only' | 'degraded';
  validationFailed: boolean;
  routeConflict: boolean;
  sampleRates: { grounded: number; degraded: number; social: number };
}): boolean {
  if (input.validationFailed) return true;
  if (input.routeConflict) return true;
  if (input.retrievalMode === 'degraded') return sample(input.sampleRates.degraded);
  if (input.path === 'grounded') return sample(input.sampleRates.grounded);
  return sample(input.sampleRates.social);
}
```

Operational guidance:

1. start with replay-only comparison first,
2. when live shadow is enabled, sample knowledge turns before social turns,
3. prioritize sampled shadow on:
   - degraded retrieval,
   - route conflicts,
   - semantic verification failures,
   - high-value eval slices
4. avoid full dual-run on every turn except for short-lived local diagnostic sessions,
5. do not block the player-visible response on the legacy shadow result.

Acceptance:

1. local-runtime rollout does not assume doubled live inference cost,
2. full-turn dual execution is bounded and temporary,
3. shadow comparison still produces enough coverage to detect regressions before cutover.
