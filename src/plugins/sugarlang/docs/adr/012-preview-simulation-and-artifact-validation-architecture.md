# ADR-SL-012: Preview Simulation and Artifact Validation Architecture

## Status

Proposed

## Context

The current Sugarlang product is not satisfied by "play the interaction once and see if it kind of works."

The writer needs to inspect:

- `B0` through `B4`
- both language directions
- first exposure
- first and second failure
- final rescue
- which interaction is active
- grounded band variants
- teaching-subset and ambient-halo changes on the same grounded target and world object
- the difference between authored canonical artifacts and a proposed regenerated draft

That means preview is not a convenience feature.

It is part of the authoring architecture.

Validation has the same problem.

Schema-only validation cannot answer the product questions that matter:

- is the repair ladder complete enough?
- does this interaction overreach lexically for the band?
- does the mixed-language line look like support or a translation strip?
- does the grounded quest binding stay coherent through pickup and return?
- did a regeneration accidentally surface later-band vocabulary too early?
- did the interaction drift from the cumulative lexicon contract for the supported slice?

## Decision

Sugarlang will use preview simulation and artifact validation as first-class authoring architecture layered over the same persisted artifacts used by the runtime.

The key decisions are:

1. Preview operates on canonical or proposed Sugarlang artifacts, not on a separate mock model.
2. Preview must support forced authored states such as band, language pair, repair stage, and grounded variant.
3. Validation must be product-aware, not only schema-aware.
4. Preview and validation must work for editor review, external AI-assisted workflows, and direct file editing.
5. Mixed-language naturalness and immersive quality are partially automatable but still require explicit human review surfaces.

## Architectural Strategy

### 1. Treat Preview as Simulation, Not Just Playback

The writer needs to inspect states that are awkward to reach by ordinary playthrough.

So preview must support forced simulation controls such as:

- learner band
- target/support language pair
- first exposure
- current repair stage
- grounded band variant
- current tracked-pool cutoff and teaching-subset visibility
- ambient-halo visibility
- current proposal vs accepted artifact state

This is still artifact-backed preview.

It is not fake data.

### 2. Keep Preview on the Same Artifact Model as Runtime

Preview should consume:

- scenario files
- interaction definitions and source bindings
- lexical plans
- scenario language overlays
- grounding maps
- grounded quest bindings
- repair ladders
- response contracts

Those are the same things runtime uses.

This is necessary so the writer can trust the preview instead of treating it as a disconnected demo surface.

### 3. Validate More Than Structure

Validation should be layered.

At a strategic level, Sugarlang should support:

- structural validation
  - schema and required-field checks
- reference validation
  - quest/object/region/objective/pickup bindings resolve
- contract validation
  - response modes, repair ladders, and band policies are legal
- lexical validation
  - interaction `focus` / `reinforcement` choices stay inside the learner's tracked pool
  - cumulative band targets and `introductionBand` assignments stay coherent
  - ambient-halo density stays within the interaction's allowed range
- continuity validation
  - grounding remains coherent across inspect, pickup, inventory, and return
- product-quality validation
  - obvious translation-strip regressions, missing rescue states, empty response paths, or mixed-language policy drift

The exact scoring rules can come later.

The important architectural decision is that these layers exist.

### 4. Make Failure Paths Reviewable on Purpose

Sugarlang's differentiation comes from repair-driven immersion.

So preview must let the writer inspect:

- what the learner sees on first exposure
- what changes after failure
- when stronger repair surfaces appear
- what the final rescue looks like
- which vocabulary entries are `focus`, `reinforcement`, or ambient at each stage
- what support scaffolds were added at each stage

If the tool cannot show the failure path, the writer cannot really judge the product.

### 5. Support Preview of Proposed Changes Before Apply

AI-assisted authoring becomes much safer if preview can compare:

- currently accepted artifacts
- proposed regenerated artifacts

The writer should be able to inspect a proposed draft in preview before it becomes canonical.

That means preview simulation is a review tool as much as a playtest tool.

### 6. Treat Mixed-Language Naturalness as a Reviewable Contract

Not every quality rule can be fully automated.

Mixed-language naturalness is one of them.

The architecture should therefore support:

- heuristic validation warnings
- explicit preview states that show the actual mixed lines
- human review checkpoints

This is how Sugarlang can enforce the product rule:

- mixed-language delivery should sound like a believable helper utterance, not token-spliced UI

without pretending a validator can solve the entire problem alone.

### 7. Use Preview and Validation as Generation Gates

Generated or edited artifacts should not skip straight to trusted state.

The authoring architecture should support this review loop:

- generate or edit
- validate
- preview
- accept or revise

That applies equally to:

- editor-driven changes
- external AI-assisted changes
- direct file edits

## What This Means Operationally

The real authoring loop becomes:

1. A writer or AI assistant changes one bounded artifact scope.
2. Sugarlang runs structural and product-aware validation.
3. Sugarlang simulates the relevant preview states.
4. The writer reviews the result.
5. Accepted changes become canonical.

This is what makes AI-assisted authoring feel controllable instead of reckless.

## Why This Supports the Product and Use Cases

This ADR directly supports:

- `UC-006`
- the learner-facing `Find the Luggage` use cases
- the golden-slice product contracts
- safe regeneration and review

It is also the practical mechanism that turns product rules into something the writer can actually inspect.

## Alternatives Considered

### 1. Manual Playthrough Only

Rejected.

Why:

- too slow
- hard to reproduce repair stages
- poor fit for iterative authoring

### 2. Separate Mock Preview Data Model

Rejected.

Why:

- preview drifts from runtime
- writers stop trusting it
- validation loses authority

### 3. Schema-Only Validation

Rejected.

Why:

- misses the failures the product actually cares about
- cannot protect immersive behavior or lexical-fit coherence

## Technology and Pattern Options

Patterns compatible with this ADR include:

- artifact-backed preview sessions
- band/language/repair-state overrides
- tracked-pool, teaching-subset, and ambient-halo overlays
- proposal-vs-canonical preview comparison
- validation reports attached to authoring operations
- replayable interaction snapshots and golden-slice fixtures

This ADR does not prescribe one UI.

It prescribes the existence of a trustworthy preview and validation architecture.

## Future-Compatible Growth Path

This architecture remains useful as Sugarlang grows into:

- richer editor panels
- integrated AI generation
- hybrid or agent-assisted scenes
- local or hosted authoring helpers

Because preview and validation remain artifact-based, the generation topology can change without breaking author review.

## Consequences and Tradeoffs

Positive:

- gives writers trustworthy review states
- makes regeneration safer
- turns product rules into inspectable behavior
- provides a bridge between authoring, runtime, and AI assistance

Tradeoffs:

- increases authoring-system scope
- requires careful validation severity design
- some quality checks will remain heuristic and human-reviewed

## Sources

[1] OpenTelemetry, "Traces"  
[https://opentelemetry.io/docs/concepts/signals/traces/](https://opentelemetry.io/docs/concepts/signals/traces/)

[2] Sugarlang ADR-SL-008, "Observability, Replay, Privacy, and Governance Architecture"  
[./008-observability-replay-privacy-and-governance-architecture.md](./008-observability-replay-privacy-and-governance-architecture.md)
