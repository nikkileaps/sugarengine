# ADR 032: Local Preview and Deployed `sugaragent` Parity Contract

## Status

Proposed

## Context

A published game now has two important execution contexts for SugarAgent-backed play:

1. local preview/dev,
2. deployed web target production/staging.

Those two contexts also cross a repository boundary:

- local preview runs from SugarEngine tooling against local game content,
- deployed web play runs from a game repository release against a deployed `game-api`.

If those two paths diverge behaviorally, the team loses confidence in local testing and production debugging becomes expensive.

Exact string-level parity is unrealistic for model-backed systems.

Contract-level parity is realistic and required.

## Decision

The system will define parity at the contract and behavior level, not at the exact prose level.

Local preview and deployed `sugaragent` must remain aligned on:

- shared session runtime core behavior,
- plugin-facing runtime bridge method semantics,
- request contract shape,
- route/query classifications,
- fallback semantics,
- diagnostics fields,
- shared service usage semantics,
- policy interpretation.

They do not need to produce identical wording on every turn.

## Parity Surface

### Must Match

- shared session runtime core semantics for interpret/retrieve/plan/generate/audit/repair,
- shared service interfaces/semantics for `GenerationService` and `EmbeddingsService`,
- plugin-facing bridge operations such as `health`, `loadModel`, `generateStructured`, `embed`, and `unloadModel`,
- request/response schema,
- route intent classification semantics,
- query type semantics,
- turn path semantics,
- fallback categories,
- auth-independent conversation policy interpretation,
- delivery-contract semantics,
- supported diagnostic fields.

### May Differ

- HTTP path structure and transport envelope,
- service adapter implementation details,
- hosted meaning of bridge lifecycle helpers such as `loadModel` and `unloadModel`,
- exact wording,
- latency,
- infrastructure-specific health details,
- platform-level process details.

For hosted browser play, `loadModel` and `unloadModel` do not require public player-facing HTTP endpoints.

The hosted bridge may satisfy them through:

- readiness checks,
- backend-owned lifecycle management,
- or explicit no-op semantics where the deployment model preselects the active model.

### Shared-Core Rule

Local preview and deployed web execution should not achieve parity by maintaining two independent implementations of the session runtime.

The intended design is:

- one shared session runtime core,
- multiple deployment wrappers around that core.

Across the repo boundary, the deployed game should consume that core through a versioned dependency boundary rather than source vendoring.

## Plain-Language Algorithms

### Parity Evaluation Rule

In plain language:

1. Send the same canonical request corpus through local preview and deployed backend paths.
2. Compare the shape and meaning of the result, not raw wording alone.
3. Treat divergence as important when:
   - plugin-facing bridge semantics change,
   - route classification changes,
   - fallback semantics change,
   - diagnostics contract changes,
   - policy interpretation changes.

### Safe Divergence Rule

In plain language:

1. If both paths stay within the same contract and policy boundaries, wording variation is acceptable.
2. If one path enters a different fallback or policy lane, the system has drifted.

## Data Flow

1. Canonical test/eval corpus is defined.
2. The corpus is run against local preview.
3. The same corpus is run against deployed `sugaragent` from a known game-repository release.
4. Structured comparisons are made on contract-level outputs and diagnostics.
5. Drift is reported by category, not merely by text diff.

## Consequences

### Positive

- local preview stays trustworthy,
- production surprises are easier to isolate,
- model variability does not force impossible exact-match expectations.

### Tradeoffs

- parity evaluation requires richer structured comparison logic,
- teams must agree on what kinds of divergence matter.

## Rejected Alternatives

### 1. Exact-Prose Parity

Rejected because model-backed systems vary too much for that to be a healthy target.

### 2. No Formal Parity Contract

Rejected because it allows silent drift between local and hosted execution paths.

## References

- [web-release-target-publish-system-design.md](/Users/nikki/projects/sugarengine/docs/proposals/web-release-target-publish-system-design.md)
- [027-game-api-service-boundary-and-module-contract.md](/Users/nikki/projects/sugarengine/docs/adr/027-game-api-service-boundary-and-module-contract.md)
