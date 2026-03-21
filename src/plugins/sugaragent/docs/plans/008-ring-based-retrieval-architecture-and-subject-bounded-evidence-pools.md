# Plan 008: Ring-Based Retrieval Architecture And Subject-Bounded Evidence Pools

## Status

Implemented.

Builds on:

- [ADR-019: Evidence Pack Governance And Corrective Retrieval](../adr/019-evidence-pack-governance-and-corrective-retrieval.md)
- [ADR-025: Canonical Live Evidence-First Turn Pipeline](../adr/025-canonical-live-evidence-first-turn-pipeline.md)
- [ADR-029: Retrieval Hardening And Evidence Governance Cutover](../adr/029-retrieval-hardening-and-evidence-governance-cutover.md)
- [ADR-032: Shared Query Interpretation And Semantic Routing Layer](../adr/032-shared-query-interpretation-and-semantic-routing-layer.md)
- [ADR-035: Subject-Centric Evidence Selection And Relation-Distance](../adr/035-subject-centric-evidence-selection-and-relation-distance.md)

## Purpose

Generalize the emerging "inner ring / outer ring" retrieval behavior into the canonical retrieval architecture.

Today, the runtime can still behave as though retrieval is one flat pool:

1. direct subject evidence,
2. associated evidence,
3. semantic neighbors,
4. ambient scope matches

all compete too early.

That creates recurring failure modes:

1. a self-query admits general NPC lore-scope chunks that are not actually self evidence,
2. a named place query admits semantically strong associated pages before the place page itself,
3. the quality gate and planner end up compensating for retrieval admission mistakes that should have been prevented earlier.

This plan makes retrieval explicitly ring-based so direct-subject evidence wins by construction, associated evidence enters in a controlled way, and semantic neighborhood evidence stops acting like first-class identity evidence.

## Core Design Decision

Retrieval should be organized into subject-bounded rings:

1. `direct`
   - evidence directly about the primary subject
2. `associated`
   - evidence about something explicitly connected to the primary subject
3. `ambient`
   - semantically nearby or scope-near evidence that may help but is not directly about the subject

This is primarily a **Retrieve-stage** architecture.

Small upstream dependency:

1. `Interpret` must still provide the `primaryReferent` and facet policy from ADR-035.

Small downstream consequence:

1. `Plan` should consume the ring annotations and claim only from the admissible rings for the facet.

But the main behavior change belongs in **Retrieve**:

1. candidate admission,
2. ring assignment,
3. ring-aware ranking,
4. bounded fallback from one ring to the next.

## Why This Is Needed

The recent self-query bug exposed a general design flaw:

1. `selfEntityId` correctly identified the NPC,
2. the self page was loaded and retrievable,
3. but general `loreScopes` still admitted ambient Earendale and Bippity chunks into the self candidate pool,
4. then later quality logic had to repair the damage.

That is the wrong shape.

The system should not:

1. admit ambient evidence early,
2. score it together with direct evidence,
3. then rely on quality gates to suppress it later.

Instead it should:

1. build the direct ring first,
2. use that ring first,
3. only widen outward if policy and evidence scarcity justify it.

## Behavioral Model

### Example: Self Query

Player asks: `What is your job?`

Expected rings:

1. `direct`
   - self page
   - exact `selfEntityId` matches
   - explicit `selfLoreScopes`
2. `associated`
   - explicitly authored self-related facts if such a relation model exists later
3. `ambient`
   - region lore
   - nearby NPC pages
   - semantically similar chunks

Default rule:

1. evaluate retrieval quality on the `direct` ring first,
2. do not let ambient ring evidence compete with direct self evidence by default.

### Example: Named Place Query

Player asks: `Do you know anything about Earendale?`

Expected rings:

1. `direct`
   - Earendale page
   - exact `location_id` matches
   - page/title identity matches
2. `associated`
   - residents of Earendale
   - businesses in Earendale
   - explicitly linked events
3. `ambient`
   - semantically nearby world lore
   - tag-only neighbors

Default rule:

1. generic overview uses `direct` first,
2. `associated` becomes available when the facet invites it or direct coverage is thin,
3. `ambient` does not outrank either ring.

### Example: Relation-Seeking Query

Player asks: `Who lives in Earendale?`

Expected rings:

1. `direct`
   - Earendale page
2. `associated`
   - resident NPC pages
   - business pages
3. `ambient`
   - weakly related place history or nearby region lore

Default rule:

1. the facet explicitly invites `associated`,
2. so retrieval may widen to the associated ring earlier,
3. but ambient still remains a later fallback.

## Non-Negotiable Rules

1. Ring assignment must be deterministic and auditable.
2. Ring assignment is not the job of semantic ranking.
3. ONNX/vector similarity may rank within a ring, but must not assign the ring.
4. Retrieval quality must evaluate the ring currently being used, not a mixed pool spanning all rings.
5. The planner must see ring metadata and preserve ring priority.
6. The architecture must not special-case places only; it must work for self, other, world, and future object-like referents.
7. General `loreScopes` must not automatically behave as direct-subject evidence for self queries.
8. There must remain one canonical implementation in `packages/sugaragent-runtime-core`.

## Lifecycle Fit

### 1. Interpret

Interpret remains responsible for:

1. `primaryReferent`
2. facet
3. relation policy from ADR-035

This plan does not move ring assignment into Interpret.

Interpret supplies:

1. which subject the rings should be centered on,
2. whether the facet allows widening into associated evidence,
3. whether ambient evidence should be visible at all.

### 2. Retrieve

This plan is primarily about Retrieve.

Retrieve should do four things explicitly:

1. candidate admission by ring
2. ring assignment for each candidate
3. ranking within a ring
4. bounded widening from one ring to the next

Retrieve should stop treating the candidate pool as a single flat list.

### 3. Plan

Plan should consume ringed evidence rather than inventing ring behavior itself.

Plan remains responsible for:

1. which claims to allow,
2. how many claims to take,
3. how to combine direct and associated claims for the facet.

But Plan should not have to repair a retrieval pool that already mixed direct and ambient evidence together.

## Proposed Data Model

### Ring Labels

Add a ring label to retrieval candidates and normalized evidence:

```ts
type RetrievalRing = 'direct' | 'associated' | 'ambient';
```

This does not replace ADR-035 relation-distance annotation.

Instead, it operationalizes it at retrieval time:

1. `direct` corresponds to `primary`
2. `associated` corresponds to `associated`
3. `ambient` corresponds to a retrievable form of `incidental` or weak neighborhood evidence

### Ring Reason

Add a compact retrieval-side reason:

```ts
type RetrievalRingReason =
  | 'exact_self_entity'
  | 'exact_subject_id'
  | 'direct_page_identity'
  | 'explicit_self_scope'
  | 'explicit_association'
  | 'relation_scope'
  | 'semantic_neighbor'
  | 'tag_neighbor'
  | 'ambient_scope'
  | 'unknown';
```

This keeps the admission reason visible and debuggable.

## Proposed Retrieval Algorithm

### Step 1: Build the Direct Ring

Direct ring candidates should be admitted only from identity-bearing signals:

1. exact `selfEntityId`
2. exact `entity_id`
3. exact `location_id`
4. exact `faction_id`
5. direct page/title identity
6. explicit `selfLoreScopes` when those scopes are authored as direct-subject scopes

Crucially:

1. general `loreScopes` do not belong in the self direct ring,
2. tag-only matches do not belong in the direct ring,
3. vector similarity does not create direct identity.

### Step 2: Build the Associated Ring

Associated ring candidates are admitted from deterministic non-direct relations:

1. explicit related scopes
2. explicit authored relation metadata
3. page-level relations that clearly connect the candidate subject to the primary subject

This is the ring where:

1. residents of Earendale,
2. businesses in Earendale,
3. self-related authored facts,
4. later object-owner or quest-object relations

should live.

### Step 3: Build the Ambient Ring

Ambient ring candidates are admitted from weaker signals:

1. semantic neighborhood via ONNX/vector retrieval
2. lexical overlap across broader scopes
3. tag-only neighborhood
4. generic scope matches that are not direct or explicitly associated

Ambient is not worthless. It is just lower-trust retrieval context.

### Step 4: Rank Within Ring

Once candidates are grouped by ring:

1. rank within the ring using the existing lexical/vector scorer,
2. keep ring boundaries intact,
3. avoid a global flat rerank across all rings.

### Step 5: Widen by Policy

The retrieval result should widen in stages:

1. try `direct` first
2. if direct is insufficient and facet permits it, add `associated`
3. only if still needed and policy allows it, consider `ambient`

This widening decision belongs to Retrieve because it is a candidate-pool decision, not a wording decision.

## Quality Gate Changes

The quality gate should become simpler, not fatter.

Instead of evaluating one mixed selected set, it should evaluate:

1. the current active ring set
2. the coverage/support/conflict of that ring set

Example:

1. self query starts with `direct`
2. if `direct` passes, stop
3. if `direct` is empty or too thin and policy allows widening, evaluate `direct + associated`
4. ambient should not pollute direct-ring quality by default

So the quality gate becomes:

1. ring-aware
2. stage-aware
3. smaller in responsibility

and less of a giant conditional compensation layer.

## Planning Implications

Planner behavior should become predictable:

1. if `direct` claims exist, take those first
2. if the facet permits `associated`, admit at most a small number of associated claims
3. do not synthesize a generic overview answer from ambient-only evidence when direct or associated evidence exists

This should improve:

1. self identity questions
2. self occupation/preference questions
3. generic place/entity overview questions
4. relation-seeking follow-ups

## Diagnostics

Diagnostics should expose the ring structure compactly:

1. active ring set used for quality evaluation
2. counts by ring
3. top selected candidates by ring
4. widening decision
5. compact ring reasons

Do not dump full ring contents by default.

## Implementation Phases

### Phase 8A: Retrieval Ring Contract

Add canonical ring labels and reasons to runtime-core retrieval candidates and normalized evidence items.

Deliverables:

1. `RetrievalRing`
2. `RetrievalRingReason`
3. compact diagnostics fields

### Phase 8B: Direct-Ring Admission Cleanup

Refactor admission rules so direct subject evidence is built from identity-bearing signals only.

Key requirement:

1. self queries stop inheriting general `loreScopes` as direct-subject retrieval input.

### Phase 8C: Associated-Ring Admission

Introduce one deterministic associated ring path from:

1. explicit relation scopes
2. relation metadata already present in lore
3. safe page-level association heuristics

This phase should not introduce a new online LLM pass.

### Phase 8D: Ring-Aware Retrieval Widening

Refactor governed retrieval to widen ring-by-ring instead of reranking one flat pool.

Deliverables:

1. direct-only first pass
2. optional direct+associated widening
3. optional ambient fallback where policy permits

### Phase 8E: Planner Consumption

Update evidence planning so selected claims preserve ring priority.

Planner should not flatten ring priority back out.

### Phase 8F: Diagnostics And Evals

Add compact ring-aware diagnostics and regression tests for:

1. self-query isolation
2. generic place/entity overview
3. associated-relation questions
4. ambient fallback only when appropriate

## Acceptance Criteria

### Self Query

1. `What is your job?`
   - self page wins
   - Earendale ambient lore does not compete in the direct ring
2. `Do you like cheese?`
   - self preference claim comes from direct self evidence
   - ambient ring does not suppress it

### Named Overview Query

1. `Do you know anything about Earendale?`
   - direct Earendale overview facts appear before resident trivia
2. if no direct Earendale page exists but associated evidence does:
   - associated facts may answer
   - ambient trivia does not leapfrog them

### Relation-Seeking Query

1. `Who lives in Earendale?`
   - associated resident evidence is admissible and useful
   - direct overview may frame but not block the answer

### Safety

1. Earendale/world-lore behavior remains correct
2. self-query fixes do not degrade world-query behavior
3. the quality gate is simpler after the change, not more complicated

## Non-Goals

1. No extra online LLM pass for ring assignment.
2. No replacement of the existing reranker with a trained model in phase 1.
3. No graph database or fully explicit relation graph in phase 1.
4. No object/item referent expansion in this plan; that belongs in a later follow-on.

## Follow-On Work

This plan should make later work easier:

1. engine-owned item/object referents can plug into the same ring model,
2. graph-based relation retrieval can later improve the associated ring,
3. trained reranking can later improve within-ring ranking without changing ring admission semantics.
