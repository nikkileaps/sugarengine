# ADR-SA-032: Shared Query Interpretation and Semantic Routing Layer

## Status

Accepted

## Date

2026-03-15

## Context

SugarAgent currently spreads turn meaning across multiple partially overlapping layers:

1. route intent classification,
2. retrieval query construction,
3. retrieval quality and coverage scoring,
4. evidence claimability checks,
5. initiative and clarification policy.

This has created repeated failures where semantically equivalent prompts take different paths because each layer relies on a different surface-text heuristic set.

Examples:

1. `What do you do for a job?` and `What do you do?` should usually both resolve to self occupation questions.
2. `No, I mean what is your job?` should not fail because discourse-repair text polluted the semantic focus.
3. `What are you doing?` should usually prefer current activity rather than occupation.
4. `Where are we now?` should be answerable from authoritative current-state evidence even when lore retrieval is unnecessary.
5. `Yay! I love cheese!` should remain a social acknowledgement/follow-up turn rather than being misrouted into generic clarification.

ADR-SA-015 introduced a hybrid router and improved safety, but it still leaves too much meaning encoded as phrase-level features inside routing. The result is patch-oriented drift:

1. router tweaks,
2. retrieval-governance tweaks,
3. planner tweaks,
4. regression churn when one layer is fixed without the others.

For a local-runtime architecture, adding another full LLM pass for turn interpretation is not acceptable:

1. latency budget is too tight,
2. reliability would still depend on local-model behavior,
3. debugging would become harder instead of easier.

## Decision

Introduce a shared `QueryInterpretation` layer as the canonical semantic representation of the player's utterance.

This interpretation must be computed once per turn and reused by:

1. routing,
2. retrieval pool selection,
3. retrieval quality and coverage scoring,
4. evidence relevance and claimability checks,
5. initiative and clarification policy.

The initial implementation must be deterministic and local:

1. no per-turn interpretation LLM call,
2. no provider-specific dependency,
3. no direct SugarLang dependency,
4. optional future embedding signals may improve scoring but must not become mandatory in Phase 1.

## Decision Details

### 1) Router responsibility is reduced

The router should no longer be the only component that decides fine-grained meaning from raw phrasing.

Instead:

1. the router consumes `QueryInterpretation`,
2. routing intent becomes a projection of interpretation,
3. routing regexes remain allowed as features,
4. routing regexes must not remain the sole semantic authority.

### 2) Meaning is represented explicitly

Use a normalized interpretation object:

```ts
type QueryLane = 'social' | 'knowledge' | 'memory';
type QueryTarget = 'self' | 'world' | 'other' | 'mixed' | 'unknown';
type QueryFacet =
  | 'identity'
  | 'occupation'
  | 'current_activity'
  | 'location'
  | 'background'
  | 'preference'
  | 'relationship'
  | 'general_lore'
  | 'unknown';
type QueryTimeframe = 'current' | 'habitual' | 'past' | 'future' | 'unknown';

interface ResolvedReferent {
  kind: 'npc' | 'entity' | 'location' | 'faction' | 'topic';
  text: string;
  id?: string;
  confidence: number;
}

interface DiscourseMarkers {
  repair: boolean;
  filler: boolean;
  contrast: boolean;
  emphasis: boolean;
}

interface QueryInterpretation {
  schemaVersion: 1;
  lane: QueryLane;
  target: QueryTarget;
  facet: QueryFacet;
  timeframe: QueryTimeframe;
  focusText: string;
  normalizedText: string;
  referents: ResolvedReferent[];
  discourse: DiscourseMarkers;
  candidateScores: Array<{
    lane: QueryLane;
    target: QueryTarget;
    facet: QueryFacet;
    timeframe: QueryTimeframe;
    score: number;
  }>;
  confidence: number;
  margin: number;
  ambiguous: boolean;
}
```

### 3) Interpretation is a scored archetype choice, not a regex match

Interpretation must be computed by ranking candidates drawn from a fixed archetype set, not by matching a single trigger phrase.

The implementation should not evaluate the full cartesian product of lanes, targets, facets, and timeframes.

Instead, it should score a curated set of valid archetypes such as:

1. `social_chat`
2. `social_acknowledgement`
3. `memory_player_recall`
4. `self_identity`
5. `self_occupation`
6. `self_current_activity`
7. `self_location`
8. `self_background`
9. `world_location`
10. `world_general_lore`
11. `other_identity`
12. `other_background`
13. `mixed_knowledge`

The exact list may evolve, but the core rule is:

1. score valid interpretation archetypes,
2. do not score nonsensical combinations unless they are represented intentionally.

High-level algorithm:

```ts
function interpretQuery(input: {
  playerMessage: string;
  npcName: string;
  history: ConversationTurn[];
  scene: SceneContext;
  loreEntityHints: LoreEntityHint[];
  evidencePreview: EvidencePreview;
}): QueryInterpretation {
  const normalized = normalizeDiscourse(input.playerMessage);
  const focusText = extractFocusClause(normalized.text);
  const referents = resolveReferents(focusText, input);

  const candidates = INTERPRETATION_ARCHETYPES
    .map((candidate) => ({
      ...candidate,
      score:
        syntaxScore(candidate, focusText) +
        discourseScore(candidate, normalized.markers) +
        referentScore(candidate, referents) +
        contextScore(candidate, input.history, input.scene) +
        evidenceAffinityScore(candidate, input.evidencePreview),
    }))
    .sort(descendingScore);

  return finalizeInterpretation({
    normalizedText: normalized.text,
    focusText,
    referents,
    discourse: normalized.markers,
    candidates,
  });
}
```

### 4) Candidate scoring signals

The deterministic scorer may use:

1. surface syntax:
   - interrogatives,
   - person markers,
   - tense/aspect cues,
   - question form,
2. discourse normalization:
   - `no, I mean`,
   - `okay`,
   - `well`,
   - `actually`,
   - similar repair/filler markers,
3. referent resolution:
   - current NPC,
   - explicit lore entities,
   - scene/location,
   - active topic,
4. lexical feature maps:
   - facet synonym tables,
   - lane cues,
   - timeframe cues,
5. evidence affinity:
   - whether available evidence already supports a candidate well.
6. social-acknowledgement cues:
   - affirmative or affiliative stance markers,
   - enthusiasm or agreement without an information request,
   - continuation cues that indicate the player is reacting to the NPC rather than asking for knowledge.

### 5) `EvidencePreview` is lightweight and pre-retrieval

`EvidencePreview` is not a hidden retrieval pass.

It is a low-cost context summary built from already-available host and profile inputs:

```ts
interface EvidencePreview {
  selfSummary: {
    entityId?: string;
    identityTokens: string[];
    occupationTokens: string[];
    backgroundTokens: string[];
    preferenceTokens: string[];
  };
  sceneSummary: {
    regionName?: string;
    regionPath?: string;
    currentActivity?: string;
    currentGoal?: string;
  };
  topicSummary: {
    activeTopic?: string;
    recentReferents: Array<{
      kind: 'npc' | 'location' | 'topic';
      text: string;
      id?: string;
    }>;
  };
  scopeHints: {
    loreScopes: string[];
    selfLoreScopes: string[];
    relatedLoreScopes: string[];
    entityIds: string[];
    locationIds: string[];
    tagHints: string[];
  };
}
```

Sources of `EvidencePreview` may include:

1. resolved NPC authoring/profile data,
2. engine scene context,
3. active topic tracking,
4. scope metadata already loaded into the runtime.

`EvidencePreview` must not:

1. run chunk retrieval,
2. run vector retrieval,
3. build a full evidence pack.

This means `What do you do?` is not handled by one literal regex. It is handled because:

1. target resolution says the current referent is the NPC,
2. tense/aspect looks habitual rather than current progressive,
3. facet exemplars/synonyms make `occupation` score highly,
4. available NPC evidence about `owns`, `shop`, or `workplace` further boosts `occupation`.

### 6) Ambiguity is explicit

Ambiguity must be represented rather than hidden.

If the best interpretation is only slightly better than the next-best interpretation:

1. mark `ambiguous: true`,
2. expose `confidence` and `margin`,
3. let initiative choose among:
   - answer both when both are supportable,
   - answer the top one with hedged framing,
   - ask a targeted clarification only when support is weak or multiple incompatible answers exist.

Example:

`What do you do?` may produce:

1. `self + occupation + habitual` with score `0.72`
2. `self + current_activity + current` with score `0.64`

If both are answerable, a dual answer is preferred over a generic clarification:

`I run a cheese shop. Right now I'm minding the station.`

For non-question social follow-ups such as `Nice!`, `Same`, or `I love cheese!`:

1. the top interpretation should prefer a social acknowledgement archetype when no real information request is present,
2. initiative should prefer a short in-character social continuation over a clarify prompt,
3. clarification should remain reserved for turns that materially request information but are semantically unresolved.

### 7) Referent resolution boundary

Phase 1 interpretation must use a deliberately shallow referent-resolution policy.

MVP scope:

1. current NPC,
2. current scene/location,
3. explicit entity mentions in the current turn,
4. active topic or last resolved referent from the previous one or two turns,
5. pronouns such as `him`, `her`, `them`, `there`, or `this place` only when there is exactly one high-confidence recent referent.

Out of scope for the first implementation:

1. deep coreference chains,
2. paragraph-scale anaphora resolution,
3. narrative-document-style pronoun tracking,
4. heuristic guessing when multiple recent referents compete.

When referent resolution is ambiguous:

1. keep the interpretation explicit about that ambiguity,
2. prefer clarification or dual-answer policy when safe,
3. do not silently guess.

This boundary is an intentional first implementation constraint, not the final target state. Deeper referent resolution follows in [Plan 004: Referential Depth and Native Embedding Follow-On](../plans/004-referential-depth-and-native-embedding-follow-on.md).

### 8) Shared consumption

`QueryInterpretation` must be consumed by:

1. `routing.ts`
   - to derive `social_chat`, `session_recall`, `identity_self`, `lore_world`, `lore_other`, `mixed_knowledge`, `unclear`
2. `retrieval-pipeline.ts`
   - to choose retrieval pools and corrective query strategy
3. `retrieval-governance.ts`
   - to score semantic coverage against interpreted facet and focus
4. `evidence-first-pipeline.ts`
   - to determine claimability and initiative behavior
5. `turn-quality.ts` and related repair logic
   - to verify that realization matches the interpreted ask
6. social/clarify policy
   - to keep acknowledgement-only turns out of unnecessary clarification loops

No layer should silently invent a new meaning model from raw text once interpretation is available.

## Non-Goals

The initial interpretation layer does not:

1. require embeddings,
2. require a vector store,
3. require an online LLM or local chat-model call,
4. replace epistemology, ownership, or evidence governance,
5. allow unsupported answers.

Those remain separate responsibilities.

## Engine Boundary

SugarEngine may provide context inputs such as:

1. current scene/region,
2. current NPC identity,
3. active beat metadata,
4. topic or conversation metadata already owned by the host.

SugarEngine does not own:

1. the interpretation ontology,
2. scoring rules,
3. semantic coverage logic,
4. clarification policy.

Those remain SugarAgent responsibilities.

## SugarLang Boundary

Query interpretation must not depend on SugarLang.

Future SugarLang cooperation may contribute optional language adaptation context after planning, but must not become the primary semantic parser for NPC grounding.

If multilingual interpretation support is added later, it must still be mediated through host capabilities and optional runtime resources rather than direct plugin coupling.

## Consequences

Positive:

1. semantic meaning becomes consistent across routing, retrieval, and planning,
2. patch-oriented router drift is reduced,
3. ambiguity handling becomes explicit and testable,
4. current working gains can be preserved while reducing fragility.

Tradeoffs:

1. more domain-model complexity in SugarAgent,
2. new evaluation surface for facet/target/timeframe scoring,
3. some questions remain genuinely ambiguous and need deliberate policy rather than a single "correct" route.

## Acceptance Criteria

1. SugarAgent computes one `QueryInterpretation` per turn for knowledge/memory turns.
2. Routing, retrieval governance, and planning consume the same interpretation object rather than separate raw-text heuristics.
3. Discourse repair/filler text no longer changes interpretation of the semantic focus clause.
4. Equivalent self-knowledge phrasing such as `What do you do?`, `What is your job?`, and `What do you do for work?` land on the same or materially similar interpretation.
5. Ambiguous but answerable turns can prefer dual answers over generic clarification.
6. The first implementation uses a shallow, explicitly documented referent-resolution boundary and does not silently guess across multiple plausible referents.
7. Social acknowledgement turns such as `Nice!`, `Same`, `Yay!`, or `I love cheese!` do not fall through to generic clarification when no knowledge request is present.
