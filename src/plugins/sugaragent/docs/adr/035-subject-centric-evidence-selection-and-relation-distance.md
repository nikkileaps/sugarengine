# ADR-035: Subject-Centric Evidence Selection And Relation-Distance Planning

## Status

Proposed

## Date

2026-03-21

## Context

SugarAgent's live evidence-first path already separates:

1. interpretation,
2. retrieval,
3. planning,
4. realization,
5. audit and repair.

That boundary is correct in broad shape, but recent live failures show one important semantic gap:

1. the runtime can correctly classify a turn as `lore_world`,
2. correctly detect a named referent such as `Earendale`,
3. still retrieve or plan around facts whose subject is not the asked subject,
4. and then faithfully realize the wrong claim.

Observed failure class:

1. player asks `Do you know anything about Earendale?`
2. direct Earendale overview lore is available,
3. associated NPC pages tagged or linked to Earendale are also available,
4. planning selects an unrelated NPC-family fact such as `His wife's name is Janet Roo`,
5. realization and audit accept that claim because it is valid relative to the selected evidence,
6. the player receives a semantically bad answer even though the downstream contract machinery behaved correctly.

This reveals that the missing concept is not stronger generation control.

The missing concept is a shared semantic model for:

1. what the primary asked subject is,
2. how each evidence item relates to that subject,
3. which relation distances are appropriate for the current query facet,
4. and where those priorities are enforced.

## Decision

SugarAgent will adopt a subject-centric evidence policy centered on:

1. deterministic primary-referent resolution with abstention,
2. subject-relation labeling for retrieved evidence,
3. relation-distance-aware claim planning before generation begins.

The canonical relation distances are:

1. `primary`
   - evidence is directly about the asked subject
2. `associated`
   - evidence is about an entity, place, event, or object clearly connected to the asked subject
3. `incidental`
   - evidence only weakly co-occurs with, mentions, or is tagged with the asked subject

The canonical rule is:

1. generic `tell me about X` style queries must prefer `primary` facts about `X`,
2. `associated` facts remain first-class but are only preferred when the query facet invites them,
3. `incidental` facts must not outrank direct-subject facts for generic overview queries.

This logic belongs in `Interpret -> Retrieve -> Plan`.

It does not belong primarily in:

1. generation prompt shaping,
2. reply audit,
3. repair loops.

## Primary Referent Resolution

### Purpose

`target` remains a coarse lane label such as:

1. `self`
2. `world`
3. `other`
4. `mixed`

That is still useful, but it is not enough.

The runtime also needs a concrete subject instance such as:

1. `locations.earendale`
2. `npc.bippity-roo`
3. `location.wordlark-hollow-resort`

That subject is the `primaryReferent`.

### Decision

Phase 1 primary referent resolution is deterministic and does not add an extra online LLM pass.

Phase 1 also does not require extending the interpretation prompt/schema to have the LLM emit `primaryReferent`.

The intended first implementation is:

1. run the existing interpretation flow,
2. treat `referents[]` and other existing interpretation outputs as candidate inputs,
3. derive `primaryReferent` in deterministic post-processing.

It should be resolved by a multi-signal scorer with abstention, using:

1. existing interpreted referent candidates,
2. explicit lore-entity matches,
3. lexical fit to the player utterance,
4. compatibility with the existing `target` and facet,
5. recency and scene salience,
6. embedding/semantic similarity from the existing local ONNX semantic stack,
7. ambiguity thresholds.

The algorithm class is:

1. candidate generation,
2. weighted deterministic ranking,
3. margin-based winner selection,
4. abstention when the winner is too weak or too ambiguous.

This is intentionally not "pick the single highest-confidence interpreted referent".

Confidence from the existing interpretation is one signal, but the resolver should also weigh lexical fit, target/facet compatibility, salience, and other deterministic signals before choosing a winner.

Rejected approaches:

1. giant conditional routing trees,
2. embeddings-only nearest-neighbor resolution,
3. an extra online LLM pass for subject classification in phase 1.

### Resolver Contract

Conceptual shape:

```ts
interface ResolvedPrimaryReferent {
  id?: string;
  text: string;
  kind: 'location' | 'npc' | 'faction' | 'object' | 'unknown';
  confidence: number;
}
```

The phase-1 kind enum is intentionally narrow.

Topics such as:

1. abstract concepts,
2. events,
3. beats,
4. other not-yet-modeled subject classes

may resolve as `unknown` at first.

That is acceptable in phase 1 so long as `unknown` still participates fully in subject-centric planning.

`unknown` does not disable:

1. primary referent resolution,
2. relation-distance labeling,
3. deterministic page/title/subject matching,
4. subject-centric admissibility and ranking.

`ResolvedPrimaryReferent.id` is any canonical subject id the runtime has for the resolved subject, not only a lore `entity_id`.

In phase 1 that may include:

1. `entity_id`
2. `location_id`
3. `faction_id`
4. another canonical subject id class added later

In practice, this is the canonical id produced by the existing referent-resolution/refinement path when one is available.

The runtime should treat it as a polymorphic canonical subject id and compare it against the relevant metadata id arrays such as:

1. `entity_ids`
2. `location_ids`
3. `faction_ids`

The resolver may return `null` when ambiguity remains.

Abstention is preferred over confidently selecting the wrong primary subject.

When the resolver returns `null`:

1. the runtime must not apply strict subject-distance gating,
2. retrieval and planning fall back to the broader existing evidence policy,
3. the turn may still answer normally if other routing and evidence signals are strong enough,
4. clarification or uncertainty should only rise when the turn is otherwise too ambiguous or weakly supported.

`null` therefore means:

1. subject-centric optimization unavailable for this turn,
2. not an automatic hard failure,
3. not forced uncertainty by default.

## Relation-Distance Model

Each evidence item relevant to a knowledge turn should be labeled with:

1. its effective subject,
2. its relation distance to the primary referent,
3. the reason that relation was assigned.

Conceptual shape:

```ts
interface SubjectRelevanceAnnotation {
  subjectId?: string;
  subjectKind?: 'location' | 'npc' | 'faction' | 'object' | 'unknown';
  relationDistance: 'primary' | 'associated' | 'incidental';
  relationStrength: number;
  reason:
    | 'direct_id_match'
    | 'direct_page_match'
    | 'direct_location_match'
    | 'associated_entity_relation'
    | 'associated_location_relation'
    | 'mention_only'
    | 'tag_only'
    | 'unknown';
}
```

`subjectKind: 'unknown'` is still a first-class annotation state.

It means:

1. the runtime does not yet have a richer subject taxonomy for this referent,
2. not that relation-distance treatment should be skipped.

Important distinction:

1. tags and weak mentions may indicate association,
2. they are not equivalent to direct subject identity.

This specifically means:

1. a chunk tagged `earendale` may be associated with Earendale,
2. but that does not make it a direct Earendale overview fact,
3. and it must not automatically outrank the Earendale place page for a generic Earendale overview query.

### Classification rule

Relation-distance annotation is a deterministic structural classification problem.

It should be assigned primarily from strong identity-bearing and relation-bearing signals such as:

1. `entity_ids`, `location_ids`, or `faction_ids` matching the `primaryReferent.id`,
2. page identity such as canonical title or page id matching the primary referent,
3. explicit deterministic association signals when the chunk is about a different subject that is clearly connected to the primary referent.

The intended interpretation is:

1. `primary`
   - direct identity-bearing match to the asked subject
2. `associated`
   - explicit deterministic relation to the asked subject, but the chunk's own subject is different
3. `incidental`
   - tag-only, mention-only, or weak co-occurrence without a strong subject relation

`direct_id_match` is therefore the strongest reason, but not the only path to `primary`.

When a canonical subject id is unavailable, the runtime may still assign `primary` from deterministic page/title/subject identity signals tied to `ResolvedPrimaryReferent.text` and `ResolvedPrimaryReferent.kind`.

Semantic scoring, rerank score, and embedding similarity remain useful, but only for ordering candidates within an already assigned relation-distance bucket.

They must not be the primary mechanism that decides whether an item is `primary`, `associated`, or `incidental`.

## Lifecycle Ownership

### 1. Interpret

Interpret owns:

1. primary subject resolution,
2. query facet classification,
3. relation-distance preference policy.

It should answer:

1. what is the main subject?
2. what kind of answer is being requested?
3. should `associated` facts be preferred, optional, or discouraged?

### 2. Retrieve

Retrieve owns:

1. candidate collection,
2. relation-distance labeling,
3. relation-bounded ranking and filtering.

Retrieval must not remain a flat semantic pool once a primary referent is resolved with sufficient confidence.

The attachment point for relation-distance labeling is the normalized evidence model, not raw source chunks and not the later epistemic layer.

In practice:

1. retrieval gathers raw chunks,
2. evidence-pack construction normalizes those chunks into `EvidenceItem`s,
3. `SubjectRelevanceAnnotation` attaches to those normalized `EvidenceItem`s at that point,
4. epistemic enrichment runs afterward as a separate annotation pass.

This keeps:

1. subject linkage on the evidence object itself,
2. source-format concerns in retrieval adapters,
3. epistemic stance as a later, separate concern.

The annotation mechanism at this stage is deterministic structural matching, not a new semantic or LLM classification pass.

In practice that means comparing the resolved primary referent and normalized evidence metadata such as:

1. `entity_ids`
2. `location_ids`
3. `faction_ids`
4. page id
5. canonical title or other page-subject identity fields

The intended interaction with existing evidence scoring is:

1. apply relation-distance admissibility first,
2. then run the existing lexical/confidence scoring inside the admissible pool,
3. then apply a relation-distance-aware weighting or bonus inside that pool.

This means relation distance is both:

1. a pre-filter for obviously inadmissible evidence such as `incidental` evidence on generic overview facets,
2. and a ranking influence among the remaining admissible evidence.

It is not intended to replace the existing lexical/confidence scoring model outright.

The evidence-selection budget should also become facet-aware.

The current small budget can remain appropriate for many turns, but generic overview queries often benefit from a slightly wider internal evidence pool so planning can see:

1. one or two strong `primary` items,
2. plus one admissible `associated` fallback item when available.

This does not imply a larger user-facing answer by default.

Evidence budget and final claim budget are separate concerns:

1. retrieval/planning may inspect a slightly wider pool,
2. low-band delivery can still realize only one or two short claims.

### 3. Plan

Plan owns:

1. final claim selection,
2. claim ordering,
3. deciding when associated facts are admissible.

For generic overview facets:

1. `primary` claims first,
2. `associated` claims only after direct coverage exists,
3. `incidental` claims excluded.

When zero admissible `primary` claims exist, planning should degrade gracefully rather than hard-failing.

That means:

1. promote admissible `associated` claims when they are the best available coverage for the asked subject,
2. continue to exclude `incidental` claims for generic overview queries unless a future explicit fallback policy says otherwise,
3. prefer narrow and truthful associated claims over unsupported generalization,
4. only lean to uncertainty or clarification when no admissible evidence remains strong enough to answer.

For relation-seeking facets:

1. `associated` claims may be promoted,
2. `primary` facts may still frame the answer,
3. `incidental` claims remain discouraged.

### 4. Generate

Generate realizes already-selected claims.

It does not decide subject relevance.

### 5. Audit And Repair

Audit and repair remain downstream contract enforcement.

They validate:

1. allowed claims,
2. certainty,
3. pedagogy,
4. language and shape constraints.

They are not the primary semantic relevance enforcer.

## Query-Facet Policy

The system should not hard-code place-specific rules.

The general rule is:

1. answer facts about the asked subject before facts about related subjects.

That applies to:

1. places,
2. NPCs,
3. factions,
4. businesses,
5. objects,
6. other named referents.

Facet determines which relation distances are appropriate.

Examples:

1. `Tell me about Earendale`
   - prefer `primary`
2. `Who lives in Earendale?`
   - `associated` becomes first-class
3. `Tell me about Bippity Roo`
   - prefer facts directly about Bippity
4. `Who works with Bippity Roo?`
   - associated entities may rise

## Low-Band Pedagogy Interaction

This policy aligns with low-band language goals.

Direct-subject facts are usually:

1. more salient,
2. easier to lexicalize,
3. shorter,
4. safer for B0/B1 realization.

Therefore low-band policy should reinforce, not replace, subject-centric claim selection.

Pedagogy remains downstream of factual planning.

It does not become the owner of subject relevance.

## Consequences

### Positive

1. Generic named-subject queries become more stable and intuitive.
2. Associated facts remain available without overwhelming direct-subject answers.
3. Retrieval and planning become easier to debug because relation distance is explicit.
4. Generation, audit, and repair can stay focused on realization quality rather than semantic prioritization.

### Tradeoffs

1. Interpretation and retrieval become slightly richer.
2. We must maintain a deterministic resolver and relation-labeling model.
3. Some queries will now intentionally abstain on primary referent resolution when ambiguity is high.

## Rejected Alternatives

### 1. Solve it in generation prompts only

Rejected because:

1. generation should not be the primary chooser of what subject the answer is about,
2. prompt-only fixes are hard to audit and easy to regress.

### 2. Solve it in audit/repair only

Rejected because:

1. audit can only validate against already-selected claims,
2. if the wrong claim is selected upstream, audit cannot recognize that it is the wrong subject-level answer unless we duplicate planning semantics there.

### 3. Add an extra online LLM referent-resolution pass

Rejected for phase 1 because:

1. it increases latency,
2. it reduces deterministic observability,
3. existing interpretation and semantic infrastructure should be sufficient for a first deterministic resolver.

## Deferred Future Improvements

The following directions remain valid future options, but they are intentionally deferred for the first implementation:

### 1. Let the LLM emit `primaryReferent`

This could be added later by extending the interpretation schema so the existing interpretation call emits an explicit `primaryReferent`.

This is not the first implementation because:

1. it increases schema churn in an already important interpretation contract,
2. it shifts more subject-selection authority into the model,
3. the deterministic resolver remains easier to observe, test, and tune in phase 1.

### 2. Learning-to-rank or trained subject resolver

A trained ranking model could eventually replace or augment the hand-tuned weighted scorer if we build a strong eval corpus for referent resolution and relation-distance selection.

This is deferred because:

1. it requires labeled data we do not yet have,
2. it adds operational complexity,
3. the deterministic scorer is a simpler first implementation.

### 3. Graph-based resolver and relation model

A richer resolver could be built later around explicit relation edges in lore such as:

1. `lives_in`,
2. `located_in`,
3. `works_in`,
4. `member_of`,
5. `near`,
6. `from`.

That would improve associated-subject handling and make relation distance more precise.

This is deferred because:

1. current lore artifacts do not yet expose a full explicit relation graph,
2. it is a larger ingestion and authoring-model change,
3. the first implementation should work with current evidence and metadata structures.

## Implementation Direction

This ADR is expected to be implemented through the plan in:

- [Plan 007: Subject-Centric Evidence Selection and Relation-Distance Planning](../plans/007-subject-centric-evidence-selection-and-relation-distance-planning.md)

Initial implementation should:

1. add deterministic primary-referent resolution,
2. annotate evidence with relation distance,
3. make the planner relation-distance-aware,
4. keep one canonical retrieval implementation in `packages/sugaragent-runtime-core`,
5. improve diagnostics so live traces can show:
   - primary referent,
   - relation policy,
   - relation distance for selected or top-N retrieved evidence,
   - relation distance for selected claims.

Diagnostics should stay compact by default:

1. log selected evidence items and a small top-N retrieval preview rather than the full candidate pool,
2. log compact relation fields such as distance, reason, subject id/kind, and score,
3. avoid embedding large raw evidence payloads unless a future explicit debug mode requests them.
