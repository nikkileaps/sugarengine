# Plan 003: Query Interpretation and Local Embedding Implementation

Builds on:

- [ADR-SA-015: Hybrid Intent Routing and Evidence Policy](../adr/015-hybrid-intent-routing-and-evidence-policy.md)
- [ADR-SA-029: Retrieval Hardening and Evidence Governance Cutover](../adr/029-retrieval-hardening-and-evidence-governance-cutover.md)
- [ADR-SA-032: Shared Query Interpretation and Semantic Routing Layer](../adr/032-shared-query-interpretation-and-semantic-routing-layer.md)
- [ADR-SA-033: Local Embedding Runtime and Vector Artifact Contract](../adr/033-local-embedding-runtime-and-vector-artifact-contract.md)

## Purpose

Plan 001 established the evidence-first turn pipeline.

This plan addresses the next instability that became visible during implementation:

1. meaning still drifts across routing, retrieval governance, and planning,
2. natural phrasing still falls through because semantics are too surface-text-dependent,
3. vector retrieval remains architecturally planned but operationally stubbed.

This plan fixes those in two major phases:

1. Phase A: shared `QueryInterpretation` without embeddings,
2. Phase B: real local embeddings and vector-assisted interpretation/retrieval.

The order is intentional:

1. first unify meaning,
2. then strengthen meaning.

Follow-on:

- [Plan 004: Referential Depth and Native Embedding Follow-On](./004-referential-depth-and-native-embedding-follow-on.md)

## Design Constraints

1. SugarAgent remains plugin-scoped and optional.
2. SugarEngine remains the deterministic authority and runtime host, not the owner of retrieval policy.
3. SugarLang remains optional and downstream.
4. No per-turn interpretation LLM call is added.
5. No cloud dependency is introduced.
6. Current working evidence-first behavior must not regress while interpretation is refactored.
7. Preview must not be confused with export-time packed artifact requirements.

## Current Problems To Solve

### Semantic drift

Equivalent prompts still behave differently because:

1. routing sees one set of cues,
2. retrieval coverage sees another,
3. planning claimability sees a third.

### Patch-oriented fragility

Short or repaired phrasing like:

1. `What do you do?`
2. `No, I mean what is your job?`
3. `Where are we now?`

causes repeated edge-case fixes because no shared semantic layer exists.

### Mixed social acknowledgement drift

Short non-question follow-ups like:

1. `Nice!`
2. `Same.`
3. `Yay! I love cheese!`

still sometimes fall through to generic clarification because the system treats them as semantically unresolved rather than as acknowledgement/social-continuation turns.

### Stubbed vector path

The runtime advertises `embed(texts[])`, but preview and native stubs still return zero vectors. That blocks:

1. real vector retrieval,
2. exemplar similarity in interpretation,
3. a cleaner local semantic solution.

## Implementation Strategy

### Phase A: Shared Query Interpretation

Goal:

Create one canonical semantic interpretation object and make routing, retrieval, and planning consume it.

### Phase A0: Type boundary cleanup

Goal:

Remove `@ts-nocheck` and establish typed semantic plumbing before `QueryInterpretation` is threaded through the pipeline.

Implement:

1. typed `QueryInterpretation` contracts,
2. typed evidence-preview contracts,
3. typed orchestration inputs/outputs in the main evidence-first path,
4. removal of `@ts-nocheck` from the primary pipeline modules touched by interpretation.

Priority files:

1. `src/plugins/sugaragent/session/core/evidence-first-pipeline.ts`
2. `src/plugins/sugaragent/session/core/retrieval-pipeline.ts`
3. `src/plugins/sugaragent/session/core/retrieval-governance.ts`
4. `src/plugins/sugaragent/session/runtime.ts`

Acceptance:

1. no `@ts-nocheck` remains on the primary interpretation/retrieval/planning path,
2. interpretation data moves through typed function signatures.

### Phase A1: Schema and diagnostics

Implement:

1. `QueryInterpretation` types,
2. interpretation diagnostics,
3. serialization-safe turn diagnostics for debugging.

Files:

1. `src/plugins/sugaragent/session/core/query-interpretation.ts`
2. `src/plugins/sugaragent/session/core/turn-contracts.ts`
3. `src/plugins/sugaragent/plugin.ts`
4. `src/plugins/sugaragent/session/runtime.ts`

Acceptance:

1. every knowledge or memory turn emits interpretation diagnostics,
2. logs show `lane`, `target`, `facet`, `timeframe`, `confidence`, `margin`.

### Phase A2: Deterministic interpretation scorer

Implement:

1. discourse cleanup,
2. focus-clause extraction,
3. target scoring,
4. facet scoring,
5. timeframe scoring,
6. ambiguity handling,
7. acknowledgement/social-follow-up scoring.

Signals:

1. lexical features,
2. synonym tables,
3. question form,
4. tense/aspect,
5. referent resolution,
6. evidence affinity preview,
7. acknowledgement and affiliative stance cues,
8. question-vs-non-question separation.

Interpretation candidates:

1. use a curated archetype list,
2. do not use a raw cartesian product of every lane/target/facet/timeframe combination.

MVP referent-resolution boundary:

1. current NPC,
2. current scene/location,
3. explicit current-turn entity mentions,
4. active topic or last resolved referent from the previous one or two turns,
5. pronouns only when exactly one recent referent is high-confidence.

Out of scope for Plan 003:

1. deep cross-turn coreference chains,
2. open-ended pronoun guessing across many candidates,
3. document-style reference tracking.

Do not implement:

1. embeddings,
2. ANN indexes,
3. LLM-based interpretation.

Acceptance:

1. `What do you do?`, `What is your job?`, and `What do you do for work?` converge on materially similar interpretations.
2. discourse repair text like `No, I mean` does not change the semantic focus.
3. ambiguous pronouns outside the shallow MVP boundary remain explicit and do not silently guess.
4. acknowledgement-only turns such as `Nice!`, `Same`, or `I love cheese!` do not default to clarify when no knowledge request is present.

### Phase A3: Routing cutover

Refactor routing so it consumes interpretation instead of re-deciding meaning from raw text.

Keep routing responsible for:

1. intent projection,
2. confidence/margin thresholds,
3. path-level policy.

Stop routing from owning:

1. facet semantics,
2. target semantics,
3. clarification semantics on its own.

Acceptance:

1. router regexes become features, not sole truth,
2. route regressions are diagnosed in terms of interpretation rather than opaque phrase misses.

### Phase A4: Retrieval governance cutover

Refactor retrieval to consume interpretation:

1. retrieval pool selection uses interpreted target,
2. corrective query building uses interpreted facet and target,
3. coverage scoring uses interpreted focus and facet.

Acceptance:

1. self occupation lore is not rejected because the player said `job` and the lore said `shop owner`,
2. world-location questions and current-state questions are separated correctly.

### Phase A5: Planner and initiative cutover

Refactor planner and initiative to consume interpretation:

1. claimability uses interpreted focus rather than raw utterance only,
2. initiative can answer ambiguous but supportable turns with dual answers,
3. clarification is reserved for materially unresolved ambiguity,
4. acknowledgement-only turns prefer short in-character social continuation over clarification.

Acceptance:

1. `What do you do?` can answer both occupation and current activity when both are supportable,
2. unsupported facet follow-ups still fall back safely,
3. non-question social follow-ups do not regress into generic clarify prompts.

### Phase A6: Evaluation and cleanup

Add targeted regression suites for:

1. short occupation questions,
2. repaired phrasing,
3. current activity vs occupation ambiguity,
4. location questions,
5. current-scene questions,
6. self/world/other disambiguation,
7. acknowledgement-only turns,
8. mixed social-plus-topic follow-ups.

Remove or reduce phrase-patch logic once equivalent interpretation coverage exists.

Success criteria:

1. fewer router phrase patches,
2. lower false-clarify rate,
3. lower false-uncertain rate on supported self-knowledge questions,
4. lower false-clarify rate on acknowledgement-only social turns.

## Phase B: Real Local Embeddings and Vector Retrieval

Goal:

Replace fake `embed()` stubs with a real local embedding service and integrate vector similarity where it materially helps.

### Phase B0: Runtime implementation decision

Adopt ONNX Runtime as the embedding runtime substrate for preview/dev.

Constraints:

1. local/offline,
2. callable from the existing `embed(texts[])` bridge,
3. small enough for preview use,
4. future-native-compatible in principle.

Deliverable:

1. implementation note recorded in code comments and runtime docs,
2. ONNX Runtime selected as the architectural anchor,
3. no change to plugin-facing runtime contract.

### Phase B1: Make preview `embed()` real

Replace the zero-vector preview stub in `vite.config.ts` with:

1. singleton embedding runtime,
2. normalized-text cache,
3. batched real embedding inference,
4. explicit failure/degraded diagnostics.

Acceptance:

1. `embed(texts[])` returns real non-zero vectors in preview,
2. failures are surfaced as explicit degraded-mode diagnostics rather than fake success.

### Phase B2: Add vector artifacts to lore ingestion

Extend lore ingestion to emit:

1. vector manifest metadata,
2. chunk vectors,
3. artifact compatibility fields.
4. model-id compatibility markers.

Implementation notes:

1. start with JSON vectors if simpler,
2. binary packing may follow later,
3. chunk vectors should be generated during ingest, not at turn time.
4. facet exemplar vectors remain plugin-managed interpretation assets, not project lore artifacts.

Acceptance:

1. generated lore contains stable chunk vectors,
2. runtime can load vector artifacts without export-only dependencies.

### Phase B3: Vector retrieval merge

Add vector retrieval behind the existing governed retrieval path:

1. embed the interpreted query/focus text,
2. flat cosine scan against scoped chunk vectors,
3. merge with lexical/entity retrieval,
4. rerank and then pass through normal governance.

Do not:

1. skip lexical/entity retrieval,
2. skip governance,
3. introduce ANN infrastructure yet.

Acceptance:

1. semantically paraphrased lore is retrieved more reliably,
2. diagnostics distinguish lexical hits, vector hits, and merged selections.

### Phase B4: Exemplar-assisted interpretation

Add optional vector similarity against facet exemplars for `QueryInterpretation`.

Use it only as a score boost/reducer, not as the sole decision-maker.

Acceptance:

1. short ambiguous phrasing improves without requiring more regex patches,
2. deterministic lexical scoring still works when embeddings are unavailable.

### Phase B5: Native parity follow-on

Plan 003 stops once preview embeddings and vector retrieval are real and stable.

Native/runtime parity and deeper referent resolution continue in [Plan 004: Referential Depth and Native Embedding Follow-On](./004-referential-depth-and-native-embedding-follow-on.md).

## Rollout and Safety

### Feature flags

Recommended flags:

1. `query_interpretation_v1`
2. `vector_retrieval_v1`
3. `facet_exemplar_similarity_v1`

### Rollout order

1. enable `query_interpretation_v1` in tests and replay first,
2. enable in preview after regressions are green,
3. make preview `embed()` real,
4. enable vector retrieval in replay/shadow,
5. enable vector retrieval in preview once diagnostics are stable.

### Degraded mode

If embeddings fail:

1. interpretation remains lexical/deterministic,
2. retrieval remains lexical/entity-first,
3. logs must state degraded mode explicitly.

## Testing Strategy

### Interpretation tests

Add unit tests for:

1. repair text removal,
2. target inference,
3. timeframe inference,
4. facet ambiguity,
5. dual-answer eligibility,
6. acknowledgement-only social interpretation.

### Retrieval tests

Add tests for:

1. vector artifact loading,
2. cosine ranking,
3. lexical/vector merge,
4. degraded no-embedding mode.

### End-to-end tests

Add runtime tests covering:

1. self job questions,
2. `What do you do?`,
3. `What are you doing?`,
4. `Where are we now?`,
5. place lore questions with paraphrase,
6. supported and unsupported facet follow-ups,
7. `Nice!`, `Same`, or `I love cheese!` after a social exchange,
8. mixed turns where a social preamble should not force clarification.

## Deliverables

1. shared `QueryInterpretation` implementation,
2. refactored router/governance/planner consumers,
3. real preview embedding runtime,
4. lore vector artifacts,
5. vector retrieval integration,
6. exemplar-assisted interpretation,
7. replay and regression coverage for the above.
8. documented handoff to Plan 004 for post-MVP referent depth and native parity.

## Completion Criteria

This plan is complete when:

1. semantic meaning is represented once and reused across turn orchestration,
2. preview `embed()` is real rather than stubbed,
3. vector retrieval is operational in preview,
4. self/job/location/current-state question handling no longer depends on repeated router phrase patches,
5. the system degrades explicitly and safely when embedding support is unavailable.
