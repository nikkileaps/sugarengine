# SugarAgent ADR Index

These ADRs are scoped to the `sugaragent` plugin only.

Core engine/plugin-host ADRs remain in `/docs/adr` (for example ADR-024).

## ADR List

- [001-plugin-boundary-and-loading.md](./001-plugin-boundary-and-loading.md)
- [002-local-llm-runtime-and-provider.md](./002-local-llm-runtime-and-provider.md)
- [003-memory-and-relationship-persistence.md](./003-memory-and-relationship-persistence.md)
- [004-lore-ingestion-retrieval-and-citations.md](./004-lore-ingestion-retrieval-and-citations.md)
- [005-dialogue-orchestration-and-intent-gating.md](./005-dialogue-orchestration-and-intent-gating.md)
- [006-simulation-cadence-and-background-planning.md](./006-simulation-cadence-and-background-planning.md)
- [007-observability-evals-and-release-gates.md](./007-observability-evals-and-release-gates.md)
- [008-authoring-hooks-and-packaging.md](./008-authoring-hooks-and-packaging.md)
- [009-deterministic-memory-compaction-and-rollups.md](./009-deterministic-memory-compaction-and-rollups.md)
- [010-in-engine-runtime-integration-and-npc-authoring-surface.md](./010-in-engine-runtime-integration-and-npc-authoring-surface.md)

## Mapping to Implementation Phases

- Phase 0 -> ADR-001
- Phase 1 -> ADR-002
- Phase 2 -> ADR-004
- Phase 3 -> ADR-003
- Phase 4 -> ADR-005 (intent gating + authored beat contract enforcement)
- Phase 5-6 -> ADR-006
- Phase 7 -> ADR-008
- Phase 8 -> ADR-007
- Phase 9 -> ADR-010 (in-game integration + creator-facing NPC authoring surface)
- Deferred post-phase hardening -> ADR-009

## Deferred Backlog

- ADR-009 is intentionally deferred until ADR-001..008 are implemented and stable.

## Coherence Note

Across ADR-001..010, authored quest/episode data remains canonical.
SugarAgent is responsible for free-form conversational delivery and structured evidence only; engine systems remain the deterministic authority for progression and world mutation.
