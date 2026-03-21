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
- [024-runtime-owned-reply-parts-grounding-contract.md](./024-runtime-owned-reply-parts-grounding-contract.md)
- [025-canonical-live-evidence-first-turn-pipeline.md](./025-canonical-live-evidence-first-turn-pipeline.md)
- [026-npc-epistemology-and-disclosure-model.md](./026-npc-epistemology-and-disclosure-model.md)
- [027-multi-strength-claim-and-reply-contract.md](./027-multi-strength-claim-and-reply-contract.md)
- [028-semantic-verification-and-social-lane-factual-boundaries.md](./028-semantic-verification-and-social-lane-factual-boundaries.md)
- [029-retrieval-hardening-and-evidence-governance-cutover.md](./029-retrieval-hardening-and-evidence-governance-cutover.md)
- [030-memory-provenance-and-contamination-control.md](./030-memory-provenance-and-contamination-control.md)
- [031-cross-plugin-language-adaptation-boundary.md](./031-cross-plugin-language-adaptation-boundary.md)
- [032-shared-query-interpretation-and-semantic-routing-layer.md](./032-shared-query-interpretation-and-semantic-routing-layer.md)
- [033-local-embedding-runtime-and-vector-artifact-contract.md](./033-local-embedding-runtime-and-vector-artifact-contract.md)
- [034-shared-generation-provider-config-and-runtime-resolution-boundary.md](./034-shared-generation-provider-config-and-runtime-resolution-boundary.md)



## Deferred Backlog

- ADR-009 is intentionally deferred until ADR-001..008 are implemented and stable.

## Coherence Note

Across ADR-001..022, authored quest/episode data remains canonical.
SugarAgent is responsible for free-form conversational delivery and structured evidence only; engine systems remain the deterministic authority for progression and world mutation.

ADR-023 remains historical context for the rejected exact quote claim-tag contract.
ADR-024 is the active grounded-turn contract: runtime-owned reply parts with turn-local support slots and deterministic validation.
ADR-025..031 define the intended cutover from model-first factual generation to a fully live evidence-first pipeline, plus the epistemology, memory, and optional SugarLang interoperability contracts required to support it cleanly.
ADR-032..033 are now the active contracts for the shared semantic interpretation layer and real local embedding/vector support that replaced the old stubbed semantic path.
ADR-034 defines the shared generation-provider config and runtime-resolution boundary across preview and hosted web.
