# ADR 031: Production Observability and Traceability Architecture

## Status

Proposed

## Context

A hosted game backend introduces failure modes that local-only gameplay does not have:

- auth failures,
- backend latency,
- inference degradation,
- model/runtime mismatch,
- abuse throttling,
- backend-only fallbacks.

If the system cannot explain what happened across browser and backend boundaries, production debugging will degrade quickly.

## Decision

The system will use structured, traced observability across:

- browser request initiation,
- backend request handling,
- `sugaragent` orchestration,
- shared service execution,
- fallback and degradation decisions.

Observability must optimize for:

- traceability,
- safe diagnostics,
- low ambiguity,
- privacy-aware logging.

Observability must also preserve release traceability across the repo boundary between SugarEngine and each game repository.

## Required Diagnostic Identity

Every protected backend request should carry or receive:

- a trace id,
- a request id,
- a game identifier,
- a game-repository revision or release identifier where practical,
- a SugarEngine/export version identifier where practical,
- module name,
- outcome classification,
- timestamped latency information where practical.

The browser and backend must agree on the primary trace id for a request chain.

## Plain-Language Algorithms

### Trace Propagation

In plain language:

1. The browser creates or receives a trace id when a meaningful backend action begins.
2. That id travels with the request to the backend.
3. Every module handling the request logs against that same id.
4. The response returns enough metadata for debugging without exposing unsafe internals to normal players.

### Outcome Classification

In plain language:

1. Every request ends in a known category such as success, denied, degraded, fallback, or error.
2. The system logs both the category and the reason.
3. “Unknown failure” should be a sign that the taxonomy is incomplete, not the default behavior.

### Release Traceability Rule

In plain language:

1. Every deployed build must be identifiable by game-repository revision and backend revision.
2. When practical, logs should also expose the SugarEngine/export version that produced the release inputs.
3. A production issue should be traceable back to both the deployed game release and the engine/tooling contract version behind it.

### Safe Logging Rule

In plain language:

1. Log enough structure to explain the decision path.
2. Do not default to logging raw sensitive content just because it is convenient.
3. Prefer summaries, classifications, and identifiers over raw payload dumps.

## Data Flow

1. Browser initiates a protected call and records a client-side event.
2. Backend receives the request and logs entry with the same trace id.
3. Modules such as `auth`, `save`, or `sugaragent` emit structured events.
4. Shared `GenerationService` and `EmbeddingsService` implementations emit their own structured diagnostics.
5. Backend returns response metadata.
6. Browser can connect the result to the originating interaction.

## Required Diagnostic Fields

At minimum, backend observability for `sugaragent` requests should include:

- trace id,
- authenticated player/session identifier or safe session surrogate,
- route intent,
- query type,
- turn path,
- fallback/degradation reason,
- target language,
- learner band,
- delivery contract summary,
- latency summary by major phase where practical.

## Consequences

### Positive

- easier production debugging,
- better abuse analysis,
- better parity validation,
- clearer latency and cost interpretation.

### Tradeoffs

- more logging design work,
- need for redaction discipline,
- need to manage volume and retention.

## Rejected Alternatives

### 1. Unstructured Log Strings

Rejected because they do not scale for cross-boundary debugging.

### 2. Raw Prompt/Conversation Logging by Default

Rejected because it creates privacy and operational risk.

### 3. Browser-Only Diagnostics

Rejected because many hosted failures occur after the backend boundary.

## References

- [web-release-target-publish-system-design.md](/Users/nikki/projects/sugarengine/docs/proposals/web-release-target-publish-system-design.md)
- [027-game-api-service-boundary-and-module-contract.md](/Users/nikki/projects/sugarengine/docs/adr/027-game-api-service-boundary-and-module-contract.md)
