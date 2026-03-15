# Plan 002: Online Advanced LLM Follow-Up

Builds on:

- [Plan 001: Live Evidence-First Turn Pipeline and Epistemology Implementation](./001-live-evidence-first-turn-pipeline-and-epistemology-implementation-plan.md)
- [ADR-SA-002: Local LLM Runtime and Provider](../adr/002-local-llm-runtime-and-provider.md)
- [ADR-SA-011: In-Engine LLM Provider Wiring](../adr/011-in-engine-llm-provider-wiring.md)
- [ADR-SA-025: Canonical Live Evidence-First Turn Pipeline](../adr/025-canonical-live-evidence-first-turn-pipeline.md)
- [ADR-SA-026: NPC Epistemology and Disclosure Model](../adr/026-npc-epistemology-and-disclosure-model.md)
- [ADR-SA-027: Multi-Strength Claim and Reply Contract](../adr/027-multi-strength-claim-and-reply-contract.md)
- [ADR-SA-028: Semantic Verification and Social-Lane Factual Boundaries](../adr/028-semantic-verification-and-social-lane-factual-boundaries.md)
- [ADR-SA-029: Retrieval Hardening and Evidence Governance Cutover](../adr/029-retrieval-hardening-and-evidence-governance-cutover.md)
- [ADR-SA-030: Memory Provenance and Contamination Control](../adr/030-memory-provenance-and-contamination-control.md)
- [ADR-SA-031: Cross-Plugin Language Adaptation Boundary](../adr/031-cross-plugin-language-adaptation-boundary.md)

## Purpose

Plan 001 deliberately optimizes for a conservative local-runtime profile:

1. one online generative call at most on the knowledge happy path,
2. deterministic online planning and verification,
3. no mandatory online judge,
4. no provider-specific hard dependency.

This follow-up plan covers improvements that are intentionally deferred because they depend on a stronger hosted model or hosted-provider features such as:

1. reasoning-focused planning,
2. online judge or repair passes,
3. provider-native citations,
4. provider-native prompt caching,
5. richer structured outputs and tool use,
6. distillation loops from stronger online models back into smaller models.

The goal is not to replace Plan 001. The goal is to add an optional hosted-advanced profile that can improve difficult turns while preserving the same SugarEngine, SugarAgent, and SugarLang boundaries.

## Design Constraints

1. Plan 001 remains the required baseline and fallback path.
2. SugarEngine remains the only broker of hosted provider access, capability discovery, workspace policy, privacy policy, and prompt-budget policy.
3. SugarAgent remains responsible for conversational grounding, planning, verification, and plugin-local memory policy.
4. SugarLang remains optional and downstream. Any cooperation must still flow through host-mediated capability payloads.
5. No hosted-only feature may become required for canonical world correctness.
6. No hosted pass may mutate engine state directly.
7. No direct SugarAgent import of Anthropic, OpenAI, or SugarLang modules is allowed in the conversational domain layer.
8. Every hosted enhancement must fail closed back to the Plan 001 path.

## Why These Features Were Deferred From Plan 001

Plan 001 excluded the following from the initial production path:

1. online semantic judge calls because they add latency and create a recursive trust problem,
2. online plan repair because it depends on stronger schema adherence and more stable reasoning,
3. model-generated query rewrites because local models are less reliable at producing retrieval-improving rewrites,
4. citations in the online path because provider support is uneven and may constrain output formats,
5. best-of-N generation because it multiplies cost and latency,
6. reflection or distillation loops because they require stable evals, dataset governance, and often stronger teacher models.

This follow-up plan reintroduces those ideas only behind explicit hosted capability checks, turn-level risk budgeting, and eval gates.

## Research-Informed Assumptions

The hosted-advanced profile is informed by current official provider guidance and still-relevant research:

1. advanced reasoning models are most useful on hard multi-step planning problems, not on every turn:
   - [OpenAI reasoning models](https://developers.openai.com/api/docs/guides/reasoning)
   - [Anthropic extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
2. strict structured outputs and function calling improve schema compliance for planners, judges, and repair tools:
   - [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
   - [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
3. tool use quality depends heavily on detailed tool descriptions and narrow tool contracts:
   - [Anthropic tool use guidance](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
4. prompt caching is now an important latency and cost pattern for long repeated prefixes such as lore, NPC profile, and stable instructions:
   - [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
   - [OpenAI prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
5. provider-native citations can improve auditability for grounded claims, but feature combinations matter:
   - [Anthropic citations](https://platform.claude.com/docs/en/build-with-claude/citations)
6. model-generated query rewriting can improve retrieval when the retrieval failure is caused by mismatch between player wording and knowledge wording:
   - [Query Rewriting for Retrieval-Augmented Large Language Models](https://arxiv.org/abs/2305.14283)
7. iterative plan -> retrieve -> paraphrase pipelines improve factuality relative to one-shot free generation:
   - [Expository Text Generation: Imitate, Retrieve, Paraphrase](https://arxiv.org/abs/2305.03276)
8. LLM judges can be useful, but they have bias and calibration limitations:
   - [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena](https://arxiv.org/abs/2306.05685)
9. reflection loops can improve agent behavior, but reflective notes should not automatically become trusted evidence:
   - [Reflexion](https://arxiv.org/abs/2303.11366)
10. stronger models can be used to generate better data or teachers for smaller models after evals exist:
   - [OpenAI supervised fine-tuning and distillation guidance](https://developers.openai.com/api/docs/guides/supervised-fine-tuning#distilling-from-a-larger-model)

Inference from these sources:

1. hosted intelligence should be spent on ambiguity, weak retrieval, high-value scenes, or repair,
2. strict schemas should remain the contract boundary even in hosted mode,
3. provider-native features should be treated as optional optimizations rather than architectural assumptions.

## Entry Criteria

This plan should not begin until all are true:

1. Plan 001 is implemented and the local evidence-first path is the canonical correctness path.
2. Eval baselines exist for unsupported propositions, false abstains, ownership leakage, and memory contamination.
3. SugarEngine can advertise hosted provider capabilities through a host-mediated profile.
4. Workspace policy explicitly allows hosted inference for the relevant project or save profile.
5. Replay and shadow execution are available for hosted-vs-local comparison.

## Hosted Capability Model

Hosted features must be negotiated through a host profile rather than by provider-specific assumptions in SugarAgent.

```ts
type HostedCapability =
  | 'reasoning_generation'
  | 'structured_outputs'
  | 'function_calling'
  | 'tool_choice'
  | 'prompt_caching'
  | 'citations'
  | 'streaming'
  | 'batch_eval'
  | 'fine_tuning'
  | 'distillation';

interface HostedProviderProfile {
  providerId: string;
  modelId: string;
  mode: 'local_default' | 'hosted_advanced';
  capabilities: HostedCapability[];
  maxContextTokens?: number;
  supportsStrictSchemas: boolean;
  supportsCitations: boolean;
  supportsPromptCaching: boolean;
  supportsReasoning: boolean;
  supportsFunctionCalling: boolean;
  supportsBatchEval: boolean;
  privacyMode: 'workspace_policy' | 'zdr_eligible' | 'standard';
  promptCacheRetention?: '5m' | '1h' | '24h' | null;
}

interface HostedTurnBudget {
  maxHostedCalls: number;
  maxJudgeCalls: number;
  maxRepairCalls: number;
  maxCandidates: number;
  maxLatencyMs: number;
  maxCostMicros: number;
}

interface HostedTurnPolicy {
  plannerEscalationThreshold: number;
  judgeEscalationThreshold: number;
  allowHostedPlanner: boolean;
  allowHostedJudge: boolean;
  allowHostedRepair: boolean;
  allowBestOfN: boolean;
  allowReflection: boolean;
  allowDistillationExport: boolean;
  citationsPreferred: boolean;
  streamingPolicy: 'off' | 'verified_only';
}

interface RetrievalQuality {
  pass: boolean;
  reason: string;
  riskScore: number;
}
```

## Execution Profiles

The runtime should choose among a small number of execution profiles:

1. `local_default`
   - exactly Plan 001 behavior
2. `hosted_planner`
   - hosted planner or query-rewriter only
3. `hosted_judge_repair`
   - local plan and realization first, hosted judge or repair only on failure or high-risk turns
4. `hosted_full_scene`
   - hosted planner, hosted realization, judge, and optional best-of-N for high-value scenes

Hosted execution should remain selective.

```ts
function resolveExecutionProfile(input: {
  route: RoutingResult;
  retrievalQuality: RetrievalQuality | null;
  ambiguityScore: number;
  narrativeValue: 'low' | 'medium' | 'high';
  provider: HostedProviderProfile | null;
  policy: HostedTurnPolicy;
}): 'local_default' | 'hosted_planner' | 'hosted_judge_repair' | 'hosted_full_scene' {
  if (!input.provider || input.provider.mode !== 'hosted_advanced') return 'local_default';
  if (input.narrativeValue === 'high' && input.policy.allowBestOfN) return 'hosted_full_scene';
  if (input.ambiguityScore >= input.policy.plannerEscalationThreshold) return 'hosted_planner';
  if (input.retrievalQuality && input.retrievalQuality.riskScore >= input.policy.judgeEscalationThreshold) {
    return 'hosted_judge_repair';
  }
  return 'local_default';
}
```

## Provider Notes

These are implementation notes, not architectural dependencies:

1. Anthropic currently offers strong document citations, prompt caching, tool use, and extended thinking:
   - [citations](https://platform.claude.com/docs/en/build-with-claude/citations)
   - [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
   - [tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/implement-tool-use)
   - [extended thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking)
2. Anthropic citations and strict structured outputs are not compatible in the same request, so planning and citation-backed realization may need separate passes.
3. OpenAI currently offers strong reasoning models, structured outputs, function calling, prompt caching, and distillation workflows:
   - [reasoning](https://developers.openai.com/api/docs/guides/reasoning)
   - [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
   - [function calling](https://developers.openai.com/api/docs/guides/function-calling)
   - [prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)
   - [supervised fine-tuning and distillation](https://developers.openai.com/api/docs/guides/supervised-fine-tuning#distilling-from-a-larger-model)
4. SugarAgent should consume a capability profile, not branch directly on provider brand names inside the domain logic.

## Workstream A: Hosted Capability Wiring And Governance

Goal:

Allow SugarAgent to request hosted assistance without knowing which provider is behind SugarEngine.

Deliverables:

1. host capability payload for provider features, privacy mode, and token budget,
2. workspace policy toggles for hosted mode by save, NPC class, or environment,
3. structured observability for hosted calls, cache hits, cost, latency, and fallback reasons,
4. replay harness support for local-vs-hosted shadow execution.

Algorithm sketch:

```ts
function getHostedExecutionContext(host: PluginHostContext): HostedExecutionContext | null {
  const profile = host.getProviderProfile('sugaragent_conversation');
  if (!profile) return null;
  if (!host.workspacePolicy.allowsHostedInference('sugaragent_conversation')) return null;
  return {
    profile,
    budget: host.getHostedTurnBudget('sugaragent_conversation'),
    policy: host.getHostedTurnPolicy('sugaragent_conversation'),
  };
}
```

Acceptance criteria:

1. SugarAgent runs unchanged when no hosted profile is present.
2. Hosted mode can be disabled at the host without changing SugarAgent logic.
3. All hosted calls are traceable in eval and diagnostics.

## Workstream B: Hosted Planner And Query Rewriting

Goal:

Use a stronger hosted model only where better reasoning should improve planning or retrieval, not as a replacement for deterministic governance.

Planner tasks:

1. ambiguous mixed-turn decomposition,
2. stronger initiative choice,
3. richer `inferred` vs `rumor` claim planning,
4. safer disambiguation question choice,
5. retrieval rewrite proposal when retrieval is weak but plausibly recoverable.

Domain additions:

```ts
interface QueryRewriteProposal {
  originalQuery: string;
  rewrittenQuery: string;
  rationaleCode: 'scope_mismatch' | 'surface_form_mismatch' | 'entity_aliasing' | 'under_specified';
}

interface HostedPlanProposal {
  plan: TurnPlan;
  requiresClarification: boolean;
  confidence: number;
  queryRewrite?: QueryRewriteProposal | null;
}
```

Algorithm sketch:

```ts
async function maybeUseHostedPlanner(input: PlannerInput): Promise<TurnPlan> {
  const localPlan = createTurnPlan(input);
  if (!shouldEscalatePlanner(input)) return localPlan;

  const hostedProposal = await callHostedPlanner({
    route: input.route,
    evidencePack: input.evidencePack,
    snapshot: input.snapshot,
    outputSchema: HostedPlanProposalSchema,
  });

  const validated = validateAndRepairTurnPlan({
    plan: hostedProposal.plan,
    evidencePack: input.evidencePack,
    snapshot: input.snapshot,
  });

  if (!validated.acceptable) return localPlan;

  if (hostedProposal.queryRewrite && shouldApplyRewrite(hostedProposal.queryRewrite, input)) {
    return replanAfterHostedRewrite(input, hostedProposal.queryRewrite, validated.plan);
  }

  return validated.plan;
}
```

Hosted query rewriting should be allowed only when:

1. retrieval failure is consistent with surface mismatch or alias mismatch,
2. the relevant knowledge class is allowed by policy,
3. the turn budget still allows another retrieval cycle.

Hosted query rewriting should not be used when:

1. the answer is forbidden by epistemic policy,
2. no relevant lore source exists,
3. the player asked about a private fact the NPC cannot know,
4. the issue is lack of data, not wording.

Acceptance criteria:

1. hosted planner output always passes the same deterministic plan validator as local output,
2. hosted query rewriting improves answerability on replay for qualifying failures,
3. hosted planning can be disabled without changing retrieval or validation contracts.

## Workstream C: Hosted Judge And Repair Pass

Goal:

Use a strong hosted model as a bounded evaluator and repairer for difficult open-ended turns, while keeping deterministic validation authoritative for hard rules.

Judge tasks:

1. compare realized text against plan and evidence,
2. identify unsupported claims, overassertion, entity leakage, or hedge violations,
3. propose repair actions without inventing new facts.

Domain additions:

```ts
interface HostedJudgeVerdict {
  verdict: 'pass' | 'fail' | 'repairable';
  issues: Array<{
    kind: 'unsupported_fact' | 'overassertion' | 'entity_leak' | 'epistemic_violation' | 'tone_only';
    clauseText: string;
    relatedClaimId?: string;
  }>;
  confidence: number;
}

interface HostedRepairProposal {
  repairedUtterance: string;
  preservedClaimIds: string[];
}
```

Algorithm sketch:

```ts
async function maybeHostedJudgeAndRepair(input: {
  realized: SugarAgentTurnOutput;
  plan: TurnPlan;
  evidencePack: EvidencePack;
  snapshot: NpcStateSnapshot;
}): Promise<SugarAgentTurnOutput> {
  const localVerification = verifyRealizationAgainstPlan(
    input.realized,
    input.plan,
    input.evidencePack,
    input.snapshot,
  );

  if (localVerification.ok && !shouldEscalateJudge(input, localVerification)) {
    return input.realized;
  }

  const verdict = await callHostedJudge({
    plan: input.plan,
    evidencePack: input.evidencePack,
    realized: input.realized,
    outputSchema: HostedJudgeVerdictSchema,
  });

  if (verdict.verdict === 'pass') return input.realized;
  if (verdict.verdict !== 'repairable') {
    return realizeDeterministicPlan(input.plan, input.snapshot);
  }

  const repair = await callHostedRepair({
    plan: input.plan,
    evidencePack: input.evidencePack,
    realized: input.realized,
    verdict,
    outputSchema: HostedRepairProposalSchema,
  });

  const repairedTurn = {
    ...input.realized,
    utterance: repair.repairedUtterance,
  };

  const repairedVerification = verifyRealizationAgainstPlan(
    repairedTurn,
    input.plan,
    input.evidencePack,
    input.snapshot,
  );

  return repairedVerification.ok
    ? repairedTurn
    : realizeDeterministicPlan(input.plan, input.snapshot);
}
```

Judge guardrails:

1. hosted judge output must be structured,
2. judge never becomes a source of new factual claims,
3. deterministic hard-policy failures still force local fallback,
4. judge precision and repair salvage rate must be measured against human-reviewed replay sets.

Bias mitigations, informed by LLM-as-a-judge literature:

1. fixed rubric prompts,
2. canonical order of inputs,
3. hidden provider/model names from the judge where possible,
4. calibration against human labels before enabling online use.

Acceptance criteria:

1. hosted judge improves repair salvage rate on difficult turns,
2. hosted judge does not increase unsupported proposition rate,
3. deterministic fallback still handles all judge failures.

## Workstream D: Citation-Backed Realization And Long-Context Persona Mode

Goal:

Exploit provider-native citations and prompt caching where available to improve audibility, long-context handling, and persona continuity on hosted turns.

Key constraint:

Provider feature interactions matter. For example, Anthropic documents say citations and strict structured outputs are incompatible in the same request. Planning and realization must therefore remain split where necessary.

Domain additions:

```ts
interface CitationBackedTurnOutput extends SugarAgentTurnOutput {
  citations?: Array<{
    clauseText: string;
    sourceId: string;
    location: string;
  }>;
}

interface CachedPromptSegment {
  segmentId: string;
  kind: 'tools' | 'system' | 'persona' | 'lore_context' | 'examples';
  stableHash: string;
}
```

Hosted realization shape:

1. planner pass uses strict structured outputs and no provider citations,
2. realization pass receives only validated plan + approved evidence,
3. if provider-native citations are available, realization or audit pass may attach citations,
4. final accepted utterance must still pass SugarAgent verification.

Algorithm sketch:

```ts
async function realizeWithOptionalCitations(input: {
  plan: TurnPlan;
  evidencePack: EvidencePack;
  snapshot: NpcStateSnapshot;
  provider: HostedProviderProfile;
}): Promise<CitationBackedTurnOutput> {
  const prompt = buildHostedRealizerPrompt(input.plan, input.evidencePack, input.snapshot);
  const response = await callHostedRealizer(prompt, {
    enableCitations: input.provider.supportsCitations,
    enablePromptCaching: input.provider.supportsPromptCaching,
  });

  const projected = projectHostedResponseToTurnOutput(response);
  return verifyRealizationAgainstPlan(projected, input.plan, input.evidencePack, input.snapshot).ok
    ? projected
    : realizeDeterministicPlan(input.plan, input.snapshot);
}
```

Prompt caching usage:

1. stable system instructions,
2. NPC biography and persona scaffold,
3. lore exemplars and reply-format exemplars,
4. repeated tool definitions,
5. long multi-turn scenes.

Acceptance criteria:

1. cached hosted turns show measurable latency or cost reductions,
2. citation-backed turns remain compatible with plan verification,
3. provider-specific citation incompatibilities never leak into the domain contract.

## Workstream E: Best-Of-N And Deliberative Scene Realization

Goal:

Reserve extra hosted generation for turns where literary quality matters enough to justify multiple candidates.

Eligible turns:

1. named or story-critical NPCs,
2. tutorial and onboarding scenes,
3. emotionally important relationship scenes,
4. language-learning milestone scenes,
5. authored beats marked as `high_narrative_value`.

Candidate selection rubric:

1. no unsupported claims,
2. preserves claim modes and hedging,
3. better character voice,
4. better conversational initiative,
5. better learner-level fit when language adaptation is active.

Algorithm sketch:

```ts
async function maybeRunBestOfN(input: HostedSceneInput): Promise<SugarAgentTurnOutput> {
  if (!input.policy.allowBestOfN) return input.baseTurn;
  const candidates = await realizeNCandidatesFromSamePlan(input.plan, input.evidencePack, input.snapshot, 3);
  const verified = candidates.filter((candidate) =>
    verifyRealizationAgainstPlan(candidate, input.plan, input.evidencePack, input.snapshot).ok,
  );
  if (verified.length === 0) return realizeDeterministicPlan(input.plan, input.snapshot);
  return selectBestVerifiedCandidate(verified, input.snapshot, input.languageAdaptation);
}
```

Selection may be:

1. deterministic rubric scoring first,
2. hosted judge only if the candidate set is still close and the latency budget allows it.

Acceptance criteria:

1. best-of-N is enabled only on high-value scenes,
2. quality improvement is confirmed by replay and human review,
3. p95 latency remains within the scene-specific budget.

## Workstream F: Hosted Language Adaptation And SugarLang Cooperation

Goal:

Use stronger hosted models to improve learner-aware adaptation without allowing language scaffolding to alter factual content.

This workstream is optional and depends on [ADR-SA-031](../adr/031-cross-plugin-language-adaptation-boundary.md).

Hosted adaptation tasks:

1. vocabulary simplification while preserving claim content,
2. grammar-band targeting,
3. code-switching or gloss insertion under policy,
4. adaptive follow-up questions that match learner level,
5. explanation or reformulation variants for language learning views.

Domain additions:

```ts
interface HostedLanguageAdaptationRequest {
  lockedUtterance: string;
  lockedClaimIds: string[];
  languageContext: LanguageAdaptationContext;
  adaptationMode: 'surface_only' | 'surface_plus_gloss';
}
```

Algorithm sketch:

```ts
async function maybeHostedLanguageAdaptation(input: {
  turn: SugarAgentTurnOutput;
  plan: TurnPlan;
  evidencePack: EvidencePack | null;
  snapshot: NpcStateSnapshot;
  languageContext: LanguageAdaptationContext | null;
}): Promise<SugarAgentTurnOutput> {
  if (!input.languageContext) return input.turn;

  const adapted = await callHostedLanguageAdapter({
    lockedUtterance: input.turn.utterance,
    lockedClaimIds: input.plan.claims.map((claim) => claim.claimId),
    languageContext: input.languageContext,
    adaptationMode: 'surface_plus_gloss',
  });

  return verifyRealizationAgainstPlan(adapted, input.plan, input.evidencePack, input.snapshot).ok
    ? adapted
    : input.turn;
}
```

SugarLang boundary:

1. SugarLang may provide learner state or adaptation context through the host,
2. SugarAgent may emit pedagogical diagnostics through the host,
3. SugarLang does not choose facts, claims, evidence, or memory writes.

Acceptance criteria:

1. hosted language adaptation improves learner-fit metrics without increasing factual errors,
2. post-adaptation verification catches any semantic drift,
3. SugarAgent remains fully operable with no SugarLang present.

## Workstream G: Reflection, Distillation, And Local Backport

Goal:

Use stronger hosted systems to improve future local quality without making hosted inference mandatory forever.

Reflection rules:

1. hosted reflections are not evidence,
2. hosted reflections are not canonical memory,
3. hosted reflections may influence future prompts, evals, or authored tuning only after review.

Distillation opportunities:

1. accepted hosted plans as teacher data,
2. accepted hosted repairs as negative-to-positive rewrite pairs,
3. hosted-vs-local disagreement cases for eval expansion,
4. high-quality language adaptation examples for SugarLang-compatible adapters.

Domain additions:

```ts
interface ReflectionNote {
  noteId: string;
  npcId: string;
  type: 'conversation_strategy' | 'open_question' | 'relationship_hypothesis';
  text: string;
  confidence: number;
  source: 'hosted_reflection';
}

interface DistillationExample {
  input: {
    route: string;
    evidencePack: EvidencePack;
    snapshot: NpcStateSnapshot;
  };
  target: {
    plan?: TurnPlan;
    turn?: SugarAgentTurnOutput;
    judgeVerdict?: HostedJudgeVerdict;
  };
}

interface HostedRunTrace {
  confidence: number;
  trainingInput: DistillationExample['input'];
  acceptedPlan?: TurnPlan;
  judgeVerdict?: HostedJudgeVerdict;
}
```

Algorithm sketch:

```ts
function exportDistillationExample(input: {
  hostedRun: HostedRunTrace;
  finalAcceptedTurn: SugarAgentTurnOutput;
  humanReviewed?: boolean;
}): DistillationExample | null {
  if (!input.humanReviewed && input.hostedRun.confidence < 0.95) return null;
  return {
    input: input.hostedRun.trainingInput,
    target: {
      plan: input.hostedRun.acceptedPlan,
      turn: input.finalAcceptedTurn,
      judgeVerdict: input.hostedRun.judgeVerdict ?? undefined,
    },
  };
}
```

This workstream may support:

1. provider fine-tuning where allowed,
2. smaller hosted deployment tiers,
3. future local adapters or prompt libraries trained from hosted teacher traces.

Acceptance criteria:

1. reflection notes never contaminate factual evidence,
2. distillation exports are opt-in and policy-controlled,
3. distilled improvements are evaluated against the same replay harness as hosted mode.

## Target Hosted Runtime Shape

```ts
async function runNpcTurnWithHostedAssists(
  request: PluginAgentTurnRequest,
  host: PluginHostContext,
): Promise<PluginAgentTurnResult> {
  const hostedContext = getHostedExecutionContext(host);
  const route = routeTurnIntent(request.playerMessage, request.npcName);
  const snapshot = buildNpcStateSnapshot(request, host);
  const adaptationContext = await resolveLanguageAdaptationContext(host, request);
  snapshot.languageAdaptation = adaptationContext;

  const retrieval = await retrieveAndRerankEvidence(request, route, snapshot);
  const evidencePack = buildEvidencePack(retrieval, request, snapshot);
  const executionProfile = resolveExecutionProfile({
    route,
    retrievalQuality: retrieval.quality ?? null,
    ambiguityScore: scoreTurnAmbiguity(request, route, evidencePack, snapshot),
    narrativeValue: scoreNarrativeValue(route, snapshot),
    provider: hostedContext?.profile ?? null,
    policy: hostedContext?.policy ?? defaultHostedTurnPolicy(),
  });

  const plan = executionProfile === 'hosted_planner' || executionProfile === 'hosted_full_scene'
    ? await maybeUseHostedPlanner({ request, route, evidencePack, snapshot, hostedContext })
    : createTurnPlan({ request, route, evidencePack, snapshot });

  const validatedPlan = validateAndRepairTurnPlan({ plan, evidencePack, snapshot });
  if (!validatedPlan.acceptable) {
    const fallbackPlan = buildAbstentionPlan(validatedPlan, snapshot);
    return persistTurn(realizeDeterministicPlan(fallbackPlan, snapshot), fallbackPlan);
  }

  const realized = executionProfile === 'hosted_full_scene'
    ? await realizeWithOptionalCitations({
        plan: validatedPlan.plan,
        evidencePack,
        snapshot,
        provider: hostedContext!.profile,
      })
    : await realizePlan(validatedPlan.plan, snapshot);

  const maybeRepaired = executionProfile === 'hosted_judge_repair' || executionProfile === 'hosted_full_scene'
    ? await maybeHostedJudgeAndRepair({
        realized,
        plan: validatedPlan.plan,
        evidencePack,
        snapshot,
      })
    : realized;

  const maybeBest = executionProfile === 'hosted_full_scene'
    ? await maybeRunBestOfN({
        baseTurn: maybeRepaired,
        plan: validatedPlan.plan,
        evidencePack,
        snapshot,
        policy: hostedContext!.policy,
        languageAdaptation: adaptationContext,
      })
    : maybeRepaired;

  const adapted = await maybeHostedLanguageAdaptation({
    turn: maybeBest,
    plan: validatedPlan.plan,
    evidencePack,
    snapshot,
    languageContext: adaptationContext,
  });

  const finalTurn = verifyRealizationAgainstPlan(adapted, validatedPlan.plan, evidencePack, snapshot).ok
    ? adapted
    : realizeDeterministicPlan(validatedPlan.plan, snapshot);

  persistVerifiedMemory(finalTurn, validatedPlan.plan, snapshot, host);
  maybeQueueReflectionAndDistillation(finalTurn, validatedPlan.plan, hostedContext);
  return finalTurn;
}
```

## Rollout Order

### Phase 0: Hosted Shadow Baseline

1. run hosted planner, judge, or realization in shadow mode only,
2. compare against local accepted turns on replay,
3. measure quality delta, cost, latency, and disagreement patterns.

### Phase 1: Hosted Planner Only

1. enable hosted planner or query rewrite on ambiguous turns,
2. keep local realization and local deterministic verification.

### Phase 2: Hosted Judge And Repair On Failure

1. enable hosted judge only after deterministic verification failure or on marked high-risk turns,
2. allow one hosted repair pass at most.

### Phase 3: Citation-Backed Hosted Realization

1. enable provider-native citations and prompt caching where available,
2. keep post-realization deterministic verification mandatory.

### Phase 4: Best-Of-N High-Value Scenes

1. enable only for authored or runtime-marked high-value scenes,
2. keep concurrency and budget limits strict.

### Phase 5: Reflection And Distillation

1. export high-quality hosted traces into eval and training datasets,
2. use those traces to improve lower-cost or local paths.

## Success Metrics

Hosted mode must improve player-facing quality without violating the Plan 001 safety floor.

Required metrics:

1. unsupported proposition delta vs local baseline,
2. false-abstain delta vs local baseline,
3. repair salvage rate,
4. judge precision and recall against human-reviewed samples,
5. citation coverage and citation correctness,
6. cache hit rate and effective cached token ratio,
7. p50 and p95 latency by execution profile,
8. cost per 100 turns by execution profile,
9. learner-fit improvement when language adaptation is active,
10. distillation uplift on the local baseline after backport.

Suggested gating rules:

1. hosted planner may ship only if it lowers false abstains without increasing unsupported propositions,
2. hosted judge may ship only if human-calibrated precision is high enough that it meaningfully helps repair triage,
3. hosted realization with citations may ship only if citation correctness is high and latency stays within scene budget,
4. best-of-N may ship only for explicitly high-value scenes,
5. distillation may ship only after exported traces are policy-approved and replay-validated.

## Risks And Failure Modes

1. Latency inflation:
   - mitigate with selective escalation, prompt caching, and scene-only best-of-N
2. Recursive trust in judge models:
   - mitigate by keeping deterministic hard rules authoritative and calibrating hosted judges offline first
3. Provider feature mismatch:
   - mitigate with capability profiles and provider-specific execution adapters under the host
4. Privacy or policy mismatch:
   - mitigate with host policy gating and workspace-level hosted opt-in
5. Hosted mode quality regressions:
   - mitigate with shadow mode and replay gates before release
6. Reflection contaminating canon:
   - mitigate by treating reflections as non-evidentiary notes only

## Completion Criteria

This follow-up plan is complete when:

1. hosted enhancements are optional and capability-gated,
2. hosted turns still pass the same grounded plan and verification contracts as local turns,
3. SugarEngine remains the only provider broker,
4. SugarLang remains optional and downstream,
5. local-only operation remains fully playable and supported.
