# ADR-018: Mixed-Initiative Policy and Goal Arbitration

## Status

Accepted

## Context

Beat-driven and character-driven dialogue both require proactive and reactive NPC behavior.
A turn system that assumes player-only initiative is insufficient.
A turn system with hard-coded proactive triggers is brittle.

We need a generalized mixed-initiative control plane that decides who leads each turn and why.

## Decision

Adopt a first-class mixed-initiative policy layer that runs before claim planning and emits a machine-readable initiative decision.

The policy engine arbitrates among goal classes and determines whether the NPC should initiate, respond, clarify, abstain, or close.

## Architecture Contract

### Initiative Decision Contract

Each turn must produce an initiative decision including:

- initiator (`npc` or `player`)
- action (`npc_initiate`, `player_respond`, `clarify`, `abstain`, `close`)
- primary goal and optional secondary goals
- expected player response type (when applicable)

### Goal Classes

Goal arbitration must support, at minimum:

- `beat_goal`
- `character_goal`
- `social_goal`
- `repair_goal`
- `closure_goal`

### Policy Inputs

Policy decisions must account for:

- mode (`character`, `narrative`, `hybrid`)
- beat urgency and remaining turn budget (if active)
- unresolved player intents/questions
- novelty/exhaustion state
- retrieval and verification confidence signals
- recent initiative history

### Policy Bounds

1. Initiative decisions must not bypass evidence/ownership constraints.
2. Initiative decisions must not bypass beat completion authority boundaries.
3. Repetitive proactive loops are disallowed under novelty exhaustion.
4. `clarify`/`abstain`/`close` are first-class valid outcomes.

### Planner and Validator Coupling

1. Planner output must include initiative decision fields.
2. Validator must reject plans that violate initiative policy bounds.

## Non-Goals

1. This ADR does not define concrete scoring formulas.
2. This ADR does not define model/provider internals.
3. This ADR does not define implementation sequence.

## Consequences

### Positive

- Enables proactive beat-driven starts without special-case opener hacks.
- Improves conversational coherence through explicit leadership policy.
- Creates clear observability targets for initiative quality.

### Tradeoffs

- Adds a policy surface that must be evaluated and governed with care.

## Related

- ADR-017 (mode model)
- ADR-021 (beat control plane)
- ADR-022 (evaluation and gate governance)
