# ADR 030: Cloud Run Service Topology, Scaling, and Region Strategy

## Status

Proposed

## Context

The first hosted web architecture for a published game needs:

- a low-ops deployment target,
- predictable HTTPS ingress,
- support for containerized inference,
- warm capacity for latency-sensitive conversation turns,
- enough room to evolve later without committing to multi-region complexity too early.

In this architecture, the game repository owns environment-specific deployment profiles and release automation, while SugarEngine owns scaffolding conventions.

Cloud Run is the selected first hosted platform in the system design.

The remaining design decisions are:

- one service or many,
- one region or many,
- warm or scale-to-zero,
- CPU-first or accelerated from day one.

## Decision

The system will begin with:

- one Cloud Run service per environment,
- one primary region per environment,
- minimum warm capacity,
- CPU-first baseline,
- bounded scale-out,
- no multi-region active-active topology in v1.

The service hosts the modular monolith defined in [027-game-api-service-boundary-and-module-contract.md](/Users/nikki/projects/sugarengine/docs/adr/027-game-api-service-boundary-and-module-contract.md).
Service identity, region choice, and scaling parameters are declared by the game's deployment profile and applied by the game repository's CI/CD pipeline.
The deployment profile should assign a slugged concrete Cloud Run service name, typically `<game-slug>-api`, while the ADR continues to use the generic architectural name `game-api`.

## Topology Decision

### One Service Per Environment

For each deployed environment such as staging or production:

- one `game-api` service,
- one deploy unit,
- one auth boundary,
- one observability surface.

### One Primary Region

Initial deployment uses one primary region chosen by:

1. target player geography,
2. operational convenience,
3. model/runtime performance characteristics.

### Warm Minimum Capacity

The service must keep at least one warm instance available so that hosted conversation does not depend on scale-from-zero cold starts.

## Plain-Language Algorithms

### Region Selection Rule

In plain language:

1. Identify the expected primary player population for the target release.
2. Choose the region that gives the best practical balance of latency, operational convenience, and backend platform support.
3. Re-evaluate only when real player distribution or latency evidence says the choice is wrong.

### Scale-Out Rule

In plain language:

1. Keep a minimum warm baseline.
2. Allow scale-out only within a bounded ceiling.
3. If demand exceeds safe cost or quality limits, degrade gracefully rather than pretending infinite capacity.

### Multi-Region Adoption Rule

In plain language:

1. Do not add a second active region because it feels “more scalable.”
2. Add multi-region only when measured latency, availability, or traffic distribution justifies the operational cost.

## Data Flow

1. Browser requests static assets from the CDN.
2. Browser sends protected backend calls to the primary-region `game-api`.
3. `game-api` processes save/auth/player/`sugaragent` work in that region.
4. Logs and diagnostics remain correlated within that same region/service boundary.

## Scaling Posture

### Required

- minimum warm capacity,
- bounded max scale,
- environment-specific scaling controls,
- no assumption that inference traffic should scale without cost boundaries.

### Not Required in v1

- active-active regional failover,
- region-local player data sharding,
- dedicated network service split for `EmbeddingsService`,
- dedicated network service split for `GenerationService`.

## Consequences

### Positive

- simplest operational shape,
- easiest rollback,
- lowest cognitive overhead,
- clearer debugging.

### Tradeoffs

- a single region is not globally optimal,
- one-service topology may eventually face noisy-neighbor pressure,
- CPU-first performance may eventually hit quality thresholds that require revision.

## Rejected Alternatives

### 1. Multi-Region Active-Active in v1

Rejected because it adds too much:

- operational complexity,
- state and routing complexity,
- rollback difficulty,
- debugging difficulty.

### 2. Scale to Zero by Default

Rejected because conversation UX is too sensitive to cold-start latency.

### 3. Split `GenerationService` and `EmbeddingsService` into Separate Network Services Immediately

Rejected because it increases network hops and operational complexity before evidence demands it.

## References

- [web-release-target-publish-system-design.md](/Users/nikki/projects/sugarengine/docs/proposals/web-release-target-publish-system-design.md)
- [027-game-api-service-boundary-and-module-contract.md](/Users/nikki/projects/sugarengine/docs/adr/027-game-api-service-boundary-and-module-contract.md)
