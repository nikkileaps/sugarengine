# Sugarlang Immersive Pivot Memo

## Status

This memo records the product pivot that happened after the pre-pivot Sugarlang MVP was implemented and previewed through the original Phase 2 scope.

It is the rationale companion to:

- `src/plugins/sugarlang/docs/plans/001-sugarlang-v1-implementation-plan.md`
- `src/plugins/sugarlang/docs/plans/002-sugarlang-immersive-pivot-rework-plan.md`

## What Changed

Sugarlang is no longer aiming for a beginner experience centered on:

- target-language line,
- translation strip,
- worksheet-like response selection.

Sugarlang is now explicitly aiming for an immersive, repair-driven experience centered on:

- hearing or reading the target language in context,
- trying to understand through the scene and the quest,
- signaling confusion when needed,
- receiving repair through simpler phrasing, mixed support language, and grounded help,
- acting in the world,
- re-encountering the same vocabulary in meaningful quest actions.

That product pivot changes several concrete contracts:

1. Mixed language is now a first-class runtime behavior across:
   - initial delivery,
   - repair,
   - happy-path response scaffolds.
2. Mixed-language lines must sound like believable in-world helper utterances, not token-spliced UI text.
3. `B0` is now explicitly `chip composition` only.
4. `B1` is now explicitly `word-bank blank fill` / `guided assembly`, not a more complex chip mode.
5. Low-band clarification is tap-only. Manual word entry starts with typed bands.
6. Repair responses are separate from chips.
7. Grounding is now defined as one stable scenario-level referent with per-band concrete variants, not a single hardcoded object example.

## Why It Changed

Hands-on use of the pre-pivot MVP exposed a real product problem:

- the beginner flow felt too much like a conventional language-learning app,
- translation-strip scaffolding weakened the immersive promise,
- low-band interactions did not yet feel like real communicative repair,
- `B1` did not feel meaningfully different from `B0`,
- the grounding contract was not explicit enough about how language, world objects, pickup, inventory, and quest progression stay linked.

The pivot exists to protect the core product difference described in the product README:

- context-first comprehension,
- repair-driven learning,
- mixed support language used intentionally,
- quest-grounded vocabulary recurrence,
- immersive language learning inside a real game loop.

## Assumptions That Are Now Invalid

The following assumptions should be treated as obsolete:

1. A translation strip is an acceptable default beginner scaffold.
2. Low-band mixed language only needs to appear during repair.
3. `B1` can be modeled as `B0` with slightly more sophisticated chips.
4. Chips can double as repair controls.
5. Low-band clarification may rely on typing.
6. A single concrete suitcase object is enough to define the grounding model.
7. A mixed-language line is acceptable even if it sounds like arbitrary token replacement.
8. The original `001` plan is still the right forward plan.

## Keep, Rework, Remove

### Keep

The following parts of the current implementation direction remain correct and should be preserved:

1. The engine-owned conversation host.
2. Provider/middleware composition.
3. Sugarlang as a separate plugin.
4. Scripted dialogue as a first-class provider path.
5. SugarAgent as optional rather than required.
6. The provider-neutral learner model and turn-evidence model.
7. Deterministic evaluation as the baseline for the scripted product.
8. The quest-grounded object/pickup/inventory loop as the backbone of the language task.

### Rework

The following areas should be treated as rework targets, not stable V1 behavior:

1. Low-band mixed-language surface rendering.
2. The low-band repair model and repair-response presentation.
3. `B1` response mode and scaffold behavior.
4. Clarification behavior at low bands.
5. Scene language pack ownership of:
   - initial delivery,
   - repair variants,
   - happy-path response frames.
6. The runtime representation of grounded band variants.
7. The evaluator split between:
   - chip composition,
   - word-bank blank fill,
   - repair responses,
   - typed responses.
8. Creator-facing preview and content generation assumptions tied to the old low-band contract.

### Remove

The following behaviors or assumptions should be removed from the canonical forward product:

1. Translation-strip-first beginner UI.
2. Any low-band response model that collapses repair responses into chips.
3. Any `B1` implementation that is effectively `B0` with larger chip sets.
4. Mixed-language surfaces that read like token-spliced UI rather than a plausible in-world helper utterance.

## Planning Consequence

The implementation history still matters, but the canonical forward plan has changed.

Use:

- `001-sugarlang-v1-implementation-plan.md` as the historical pre-pivot record,
- this memo as the pivot rationale,
- `002-sugarlang-immersive-pivot-rework-plan.md` as the current implementation plan.

All future implementation and refactoring should be evaluated against the current product docs, architecture docs, and ADRs as they now stand after the immersive pivot.
