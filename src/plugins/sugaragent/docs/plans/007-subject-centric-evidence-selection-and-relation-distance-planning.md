# Plan 007: Subject-Centric Evidence Selection and Relation-Distance Planning

## Status

Implemented.

Builds on:

- [ADR-015: Hybrid Intent Routing And Evidence Policy](../adr/015-hybrid-intent-routing-and-evidence-policy.md)
- [ADR-016: Evidence-First Dialogue Architecture](../adr/016-evidence-first-dialogue-architecture.md)
- [ADR-019: Evidence Pack Governance And Corrective Retrieval](../adr/019-evidence-pack-governance-and-corrective-retrieval.md)
- [ADR-025: Canonical Live Evidence-First Turn Pipeline](../adr/025-canonical-live-evidence-first-turn-pipeline.md)
- [ADR-026: NPC Epistemology And Disclosure Model](../adr/026-npc-epistemology-and-disclosure-model.md)
- [ADR-031: Cross-Plugin Language Adaptation Boundary](../adr/031-cross-plugin-language-adaptation-boundary.md)
- [ADR-032: Shared Query Interpretation And Semantic Routing Layer](../adr/032-shared-query-interpretation-and-semantic-routing-layer.md)

## Purpose

Fix the recurring class of failures where SugarAgent answers a question about one subject with facts about a related but less relevant subject.

Observed live example:

1. player asks: `Do you know anything about Earendale?`
2. retrieval admits:
   - direct Earendale place lore,
   - NPC pages tagged or associated with Earendale,
   - arbitrary facts from those NPC pages
3. planning selects:
   - `His wife's name is Janet Roo`
4. realization correctly realizes the wrong claim

The problem is not specific to places.

The general problem is:

1. the runtime identifies a primary subject,
2. retrieval admits evidence at multiple relation distances,
3. planning does not strongly prefer claims whose subject is the asked subject,
4. generation and audit are left to clean up a semantic prioritization error they should never own.

This plan introduces a general subject-centric relevance model for:

1. direct subject facts,
2. associated subject facts,
3. incidental mentions.

It should work for places, NPCs, factions, businesses, objects, and other named referents without introducing place-only policy hacks.

## Non-Negotiable Design Rules

1. This logic belongs in `Interpret -> Retrieve -> Plan`, not `Generate -> Audit -> Repair`.
2. The system must prefer facts about the asked subject before facts about related subjects.
3. Associated-subject facts remain allowed when the query facet invites them.
4. Incidental mentions must not outrank direct-subject facts for generic overview questions.
5. Retrieval and planning must share one canonical relation-distance model.
6. The model must remain deterministic and auditable.
7. The runtime must continue to support low-band Sugarlang delivery without making pedagogy the owner of factual relevance.
8. There must remain one canonical retrieval implementation in `packages/sugaragent-runtime-core`.

## Core Problem Statement

Current evidence selection is still too flat.

Even with better route refinement and retrieval boundaries, the runtime still lacks a general concept of:

1. what the primary asked subject is,
2. how each evidence item relates to that subject,
3. which relation distances are appropriate for this query facet,
4. how those relation distances should constrain claim selection.

That leads to failures like:

1. `Tell me about Earendale` -> NPC biography fact
2. `Tell me about Bippity Roo` -> hometown detail before identity detail
3. `What do you know about the resort?` -> nearby-town trivia before resort facts

The deeper issue is that semantic similarity, tags, and retrieval availability are being allowed to stand in for subject relevance.

## Target Behavioral Model

For any named-subject query, the runtime should reason in terms of relation distance:

1. `primary`
   - the evidence is directly about the asked subject
2. `associated`
   - the evidence is about something clearly connected to the asked subject
3. `incidental`
   - the evidence merely mentions, tags, or weakly co-occurs with the asked subject

Examples:

1. `Do you know anything about Earendale?`
   - Earendale overview page -> `primary`
   - `Bippity Roo lives in Earendale` -> `associated`
   - `His wife's name is Janet Roo` from a Bippity page tagged `earendale` -> `incidental`

2. `Who lives in Earendale?`
   - Earendale overview page -> `primary`
   - `Bippity Roo lives in Earendale` -> `associated`
   - generic resort history -> weak `primary` or low-fit

3. `Tell me about Bippity Roo`
   - Bippity identity page -> `primary`
   - Earendale place facts -> `associated`
   - unrelated family detail from another NPC page mentioning Bippity -> `incidental`

The planner should then use query facet to decide which relation distances are preferred.

## Lifecycle Fit

This logic should map onto the current lifecycle as follows:

### 1. Interpret

Interpret owns:

1. primary subject resolution,
2. query facet classification,
3. relation-distance preference policy.

Interpret should answer:

1. what is the user mainly asking about?
2. what kind of information do they want about that subject?
3. are associated-subject facts desirable, optional, or discouraged?

Target additions to interpretation:

1. `primaryReferent`
2. `referentKind`
3. `facetRelationPolicy`

Example:

```ts
interface SubjectSelectionPolicy {
  primaryReferentId?: string;
  primaryReferentText?: string;
  primaryReferentKind?: 'location' | 'npc' | 'faction' | 'object' | 'unknown';
  facet: 'general_lore' | 'identity' | 'location' | 'history' | 'relationship' | 'residents' | 'associated_entities' | 'unknown';
  preferredRelationDistances: Array<'primary' | 'associated'>;
  incidentalAllowed: boolean;
}
```

The phase-1 referent kind enum is intentionally narrow.

Concepts like:

1. abstract topics,
2. events,
3. beats,
4. other not-yet-modeled subject classes

may initially resolve as `unknown`.

That is acceptable in phase 1. `unknown` should still receive the full relation-distance treatment and should not force the turn back onto a non-subject-centric path by itself.

### 2. Retrieve

Retrieve owns:

1. candidate collection,
2. subject-relation labeling,
3. relation-bounded reranking.

Retrieve should not decide final claim priority, but it should annotate every evidence item with:

1. which subject it is about,
2. how directly it is about the primary referent,
3. whether it is likely only an incidental match.

Attachment point:

1. raw lore retrieval should stay source-shaped,
2. `buildEvidencePack()` should attach subject relevance while normalizing chunks into `EvidenceItem`s,
3. epistemic enrichment should remain a later and separate pass.

This means subject relevance belongs on the normalized evidence item, not only on a transient retrieval result and not bundled into epistemic enrichment.

Target retrieval output:

```ts
interface SubjectAnnotatedEvidenceItem extends EpistemicEvidenceItem {
  subjectId?: string;
  subjectKind?: 'location' | 'npc' | 'faction' | 'object' | 'unknown';
  relationDistance: 'primary' | 'associated' | 'incidental';
  relationReason:
    | 'direct_id_match'
    | 'direct_page_match'
    | 'direct_location_match'
    | 'associated_entity_relation'
    | 'associated_location_relation'
    | 'tag_only'
    | 'mention_only'
    | 'unknown';
}
```

`subjectKind: 'unknown'` is still first-class here:

1. it may still be `primary`, `associated`, or `incidental`,
2. it may still be admitted or excluded by facet policy,
3. it should not bypass the relation-distance model just because the taxonomy is coarse.

Retrieval should use that labeling to:

1. keep direct-subject evidence in the top pool,
2. allow associated evidence when policy permits,
3. demote or exclude incidental evidence depending on the query.

Interaction with existing `pickEvidenceForIntent()` scoring:

1. apply relation-distance admissibility first,
2. keep the existing lexical-overlap and confidence scoring model inside the admissible pool,
3. add relation-distance-aware weighting or bonus inside that pool rather than replacing the scorer outright.

So the phase-1 design is effectively `(b) + (c)`:

1. pre-filter inadmissible buckets such as `incidental` on generic overview facets,
2. then weight `primary` above `associated` among the remaining candidates.

Evidence budget note:

1. the current `maxResults: 2` default is likely too tight for subject-centric overview planning,
2. phase 1 should make this budget facet-aware rather than globally large,
3. generic overview queries should be able to inspect a slightly wider pool such as up to `2 primary + 1 associated` when available,
4. final realized claim count can still stay small, especially for low-band delivery.

### 3. Plan

Plan owns:

1. claim selection,
2. claim ordering,
3. relation-distance-aware answer shaping.

This is the main place where the final answer policy should live.

For generic overview prompts:

1. pick `primary` claims first,
2. prefer concrete, high-salience, low-band-friendly claims,
3. optionally admit one `associated` claim only after `primary` coverage exists.

For relation-seeking prompts:

1. associated claims can rise,
2. direct subject facts may still frame the answer,
3. incidental claims stay out.

### 4. Generate

Generate remains a realization transport.

It should realize already-selected claims, not decide whether a Bippity family fact counts as a good Earendale answer.

### 5. Audit

Audit should verify:

1. output stayed within allowed claims,
2. certainty and pedagogy bounds were preserved,
3. low-band delivery contract was respected.

It should not be the main enforcer of subject relevance.

### 6. Repair

Repair should fix:

1. schema or contract failure,
2. language mismatch,
3. delivery-contract mismatch,
4. unsupported visible claims.

It should not be the primary place where subject selection is repaired from scratch.

## Target Relevance Model

The runtime should distinguish three different concepts that are currently too blended:

### A. Subject identity

What entity the player is asking about.

Examples:

1. `Earendale`
2. `Bippity Roo`
3. `Wordlark Hollow Resort`

### B. Subject relation

How an evidence item relates to that subject.

Examples:

1. direct subject page
2. resident of that town
3. event that happens there
4. page merely tagged with the subject name

### C. Query facet

What kind of answer the player is seeking.

Examples:

1. general overview,
2. identity,
3. history,
4. who lives there,
5. what is nearby,
6. what is it known for.

The planner should combine B and C.

That is the general solution.

## Proposed Data Model Extensions

### Interpretation

Add a subject-centric interpretation payload:

```ts
interface QueryInterpretation {
  // existing fields
  primaryReferent?: {
    id?: string;
    text: string;
    kind: 'location' | 'npc' | 'faction' | 'object' | 'unknown';
    confidence: number;
  };
  relationPolicy?: {
    preferred: Array<'primary' | 'associated'>;
    incidentalAllowed: boolean;
  };
}
```

Phase-1 resolution rule:

1. do not add a new online LLM call,
2. do not require the interpret prompt/schema to emit `primaryReferent` in the first implementation,
3. derive `primaryReferent` deterministically after the existing interpretation step from `referents[]` plus other existing interpretation signals,
4. do not implement this as "pick the highest-confidence referent" only; use a deterministic multi-signal scorer with abstention.

### Retrieval

Annotate evidence entries before evidence-pack budgeting and claim selection:

```ts
interface SubjectRelevanceAnnotation {
  subjectId?: string;
  subjectKind?: string;
  relationDistance: 'primary' | 'associated' | 'incidental';
  relationStrength: number;
  reason: string;
}
```

Phase-1 annotation rule:

1. attach this during `buildEvidencePack()`,
2. use deterministic structural matching against normalized evidence metadata and page-subject identity fields,
3. compare the resolved primary referent id against polymorphic metadata id arrays such as `entity_ids`, `location_ids`, and `faction_ids`,
4. do not use a separate semantic or LLM pass to assign `relationReason`.

### Planning

Extend claim metadata so the planner can explicitly prefer direct-subject claims:

```ts
interface PlannedClaim {
  // existing fields
  relationDistance?: 'primary' | 'associated' | 'incidental';
  relationStrength?: number;
}
```

## Retrieval Policy

### 1. Direct-subject ring

Evidence should be `primary` when it is clearly about the asked subject through strong identity-bearing signals such as:

1. exact entity/location/faction id match,
2. direct page id/title match,
3. chunk subject resolved to the primary referent.

### 2. Associated ring

Evidence should be `associated` when it is clearly about something connected to the primary subject, such as:

1. a resident of a location,
2. a business in a town,
3. an event tied to a place,
4. a faction tied to a region.

Important:

1. associated evidence is allowed,
2. but it should not outrank direct-subject evidence for generic overview queries.

### 3. Incidental ring

Evidence should be `incidental` when it only matches weakly, such as:

1. tag-only co-occurrence,
2. passing mention in a chunk,
3. weak semantic neighborhood without a direct relation.

Incidental evidence should be:

1. excluded for generic subject-overview queries,
2. only retained when no better evidence exists and policy explicitly allows it.

## Planning Policy

The planner should use query facet to decide the desired mix.

### Generic overview facet

Examples:

1. `Do you know anything about Earendale?`
2. `Tell me about Bippity Roo.`
3. `What do you know about the resort?`

Policy:

1. `primary` claims first,
2. only admit `associated` after direct coverage exists,
3. disallow `incidental`.

Zero-primary fallback:

1. if no admissible `primary` evidence exists, promote admissible `associated` evidence as graceful degradation,
2. do not promote `incidental` evidence for generic overview queries,
3. prefer narrow associated claims over made-up overview summaries,
4. only fall to uncertainty or clarification if no admissible evidence remains strong enough to answer.

### Relation-seeking facet

Examples:

1. `Who lives in Earendale?`
2. `What is near the resort?`
3. `Who works with Bippity Roo?`

Policy:

1. `associated` may be first-class,
2. `primary` may frame the answer,
3. `incidental` still discouraged.

### Low-band pedagogy interaction

Low learner bands strengthen the need for direct-subject facts because they are usually:

1. easier to lexicalize,
2. shorter,
3. more concrete,
4. more salient.

So B0/B1 should bias even harder toward:

1. one or two direct subject facts,
2. concrete visible properties,
3. no incidental drift.

This is a planner concern, not a generator concern.

## Implementation Shape

### Phase 7A: Canonical relation-distance model

Files:

1. `packages/sugaragent-runtime-core/src/session/core/query-interpretation.ts`
2. `packages/sugaragent-runtime-core/src/session/core/routing.ts`
3. `packages/sugaragent-runtime-core/src/session/core/turn-contracts.ts`

Tasks:

1. add primary-referent and relation-policy interpretation fields,
2. keep current routing intents intact,
3. add no new online LLM calls.

### Phase 7B: Retrieval subject annotation

Files:

1. `packages/sugaragent-runtime-core/src/session/core/retrieve/pipeline.ts`
2. `packages/sugaragent-runtime-core/src/session/core/retrieval-governance.ts`
3. `packages/sugaragent-runtime-core/src/lore/lore-lib.ts`

Tasks:

1. attach subject relevance during `buildEvidencePack()` while normalizing raw chunks into `EvidenceItem`s,
2. annotate direct vs associated vs incidental relation distance,
3. ensure tag-only and mention-only evidence do not count as direct subject identity,
4. preserve associated-ring availability for relation-seeking queries,
5. keep one canonical retrieval implementation only.

### Phase 7C: Subject-centric claim planning

Files:

1. `packages/sugaragent-runtime-core/src/session/core/evidence-first-pipeline.ts`
2. `packages/sugaragent-runtime-core/src/session/core/claim-planning.ts`
3. `packages/sugaragent-runtime-core/src/session/core/turn-planning.ts`

Tasks:

1. prefer `primary` claims for generic overview facets,
2. allow `associated` claims when the facet invites them,
3. disallow `incidental` claims unless a future explicit fallback policy permits them,
4. ensure low-band contracts prefer simpler direct-subject claims,
5. separate internal evidence budget from final claim budget so overview turns can inspect a slightly wider pool without bloating the delivered answer.

### Phase 7D: Diagnostics and observability

Files:

1. `packages/sugaragent-runtime-core/src/session/runtime.ts`
2. `src/plugins/sugaragent/plugin.ts`

Tasks:

1. log primary referent and relation-policy,
2. log relation distance for selected evidence items and a small top-N retrieval preview rather than the full candidate pool,
3. log relation distance for selected claims,
4. keep diagnostics compact by default by logging relation fields and ids instead of large raw evidence payloads,
5. make live failures explainable without adding ad hoc debug patches.

### Phase 7E: Test corpus and evals

Files:

1. `packages/sugaragent-runtime-core/src/session/core/*.test.ts`
2. `src/plugins/sugaragent/session/runtime.test.ts`
3. optional eval fixtures later

Required regression families:

1. place overview vs resident-trivia drift,
2. NPC overview vs hometown drift,
3. business/object overview vs nearby-place drift,
4. relation-seeking queries where associated facts should win,
5. low-band outputs staying direct and concrete.

## Acceptance Criteria

### Core behavior

1. `Tell me about X` prefers direct facts about `X`.
2. `Who/what is connected to X` may prefer associated facts about `X`.
3. Incidental mentions do not outrank direct-subject facts.
4. Generic subject-overview questions do not answer with arbitrary trivia from associated pages.

### Architecture

1. Subject-centric relevance is decided before generation.
2. `Generate -> Audit -> Repair` do not become the main relevance enforcer.
3. Retrieval and planning use one shared relation-distance model.
4. The plugin path and runtime-core path do not fork retrieval semantics.

### Observability

1. Live diagnostics can show:
   - primary referent,
   - relation policy,
   - top retrieved evidence by relation distance,
   - selected claims by relation distance.
2. These diagnostics should remain compact by default:
   - selected evidence plus a small top-N preview,
   - compact relation metadata,
   - no full evidence-pack dump unless a future explicit debug mode asks for it.

## Non-Goals

This plan does not require:

1. a full knowledge graph,
2. new hosted-only infrastructure,
3. an extra online LLM pass for subject classification,
4. rewriting reply-parts audit policy,
5. replacing existing low-band delivery contracts.

## Risks

### 1. Over-hardening to direct facts only

If relation policy is too strict, the runtime may miss useful associated facts.

Mitigation:

1. keep `associated` as a first-class relation distance,
2. let query facet decide when it is preferred.

### 2. Overloading tags as identity

Tags are often useful authoring metadata but too weak as direct subject identity.

Mitigation:

1. treat tag-only matches as associated or incidental,
2. do not let them count as direct-subject evidence by default.

### 3. Plan complexity

The planner could become too bespoke if every facet gets hand-tuned rules.

Mitigation:

1. keep the main abstraction at the relation-distance level,
2. reuse the same policy for places, NPCs, factions, and objects.

## Recommendation

Implement this as a subject-centric semantic policy in `Interpret -> Retrieve -> Plan`.

Do not solve it by:

1. making generation prompts harsher,
2. relying on audit rejection,
3. adding place-specific one-off logic,
4. using tags as direct subject identity.

The general rule should become:

1. resolve the primary subject,
2. classify evidence by relation distance to that subject,
3. let the query facet choose which relation distances are appropriate,
4. plan claims from that ordered evidence set before generation begins.
