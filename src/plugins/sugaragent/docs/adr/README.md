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
- [011-in-engine-llm-provider-wiring.md](./011-in-engine-llm-provider-wiring.md)
- [012-identity-aware-lore-retrieval.md](./012-identity-aware-lore-retrieval.md)
- [013-evidence-based-claim-validation.md](./013-evidence-based-claim-validation.md)
- [014-optional-constrained-grounded-rewrite-pass.md](./014-optional-constrained-grounded-rewrite-pass.md)
- [015-hybrid-intent-routing-and-evidence-policy.md](./015-hybrid-intent-routing-and-evidence-policy.md)
- [016-evidence-first-dialogue-architecture.md](./016-evidence-first-dialogue-architecture.md)
- [017-dual-mode-npc-conversation-model.md](./017-dual-mode-npc-conversation-model.md)
- [018-mixed-initiative-policy-and-goal-arbitration.md](./018-mixed-initiative-policy-and-goal-arbitration.md)
- [019-evidence-pack-governance-and-corrective-retrieval.md](./019-evidence-pack-governance-and-corrective-retrieval.md)
- [020-fact-id-and-provenance-durability-contract.md](./020-fact-id-and-provenance-durability-contract.md)
- [021-beat-control-plane-and-deterministic-progression.md](./021-beat-control-plane-and-deterministic-progression.md)
- [022-evaluation-stack-and-deployment-gate-governance.md](./022-evaluation-stack-and-deployment-gate-governance.md)
- [023-two-lane-conversation-and-llm-claim-span-tagging.md](./023-two-lane-conversation-and-llm-claim-span-tagging.md)

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
- Dialogue architecture hardening and v2 pipeline -> ADR-011..016
- Strategic dual-mode and governance contracts -> ADR-017..022
- Two-lane conversational grounding refinement -> ADR-023

## Deferred Backlog

- ADR-009 is intentionally deferred until ADR-001..008 are implemented and stable.

## Coherence Note

Across ADR-001..022, authored quest/episode data remains canonical.
SugarAgent is responsible for free-form conversational delivery and structured evidence only; engine systems remain the deterministic authority for progression and world mutation.

ADR-023 refines grounded-turn validation by introducing LLM claim-tagging with deterministic span/evidence enforcement, while preserving the same canonical authority boundaries.
