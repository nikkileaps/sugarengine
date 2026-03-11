# Sugarlang ADR Catalog

This directory decomposes the Sugarlang strategic architecture into focused architecture decision records.

These ADRs are intended to be:

- high-detail enough for architecture and product review
- stable enough to guide later API and implementation ADRs
- explicit about browser-first constraints
- explicit about future portability to commercial or self-hosted model serving

They are not implementation plans.

## ADR Index

- [ADR-SL-001: English-First Authoring Overlay and Source-of-Truth Model](./001-english-first-authoring-overlay-and-source-of-truth-model.md)
- [ADR-SL-002: Engine-Owned Conversation Host with Provider and Middleware Composition](./002-engine-owned-conversation-host-with-provider-and-middleware-composition.md)
- [ADR-SL-003: Shared Scenario and Interaction Semantics with Response Contracts](./003-shared-scene-semantics-and-response-contract-model.md)
- [ADR-SL-004: Multidimensional Learner Model, Placement, and Turn Evidence Architecture](./004-multidimensional-learner-model-placement-and-turn-evidence-architecture.md)
- [ADR-SL-005: Deterministic-First Evaluation, Feedback, and Support Architecture](./005-deterministic-first-evaluation-feedback-and-support-architecture.md)
- [ADR-SL-006: AI Runtime Abstraction and Deployment Portability](./006-ai-runtime-abstraction-and-deployment-portability.md)
- [ADR-SL-007: Browser-Local Data, Storage, and Cache Architecture](./007-browser-local-data-storage-and-cache-architecture.md)
- [ADR-SL-008: Observability, Replay, Privacy, and Governance Architecture](./008-observability-replay-privacy-and-governance-architecture.md)
- [ADR-SL-009: Lexical Planning and Quest Lexical Fit Architecture](./009-lexical-planning-and-quest-lexical-fit-architecture.md)
- [ADR-SL-010: Authoring Control Plane and Generation Packet Architecture](./010-authoring-control-plane-and-generation-packet-architecture.md)
- [ADR-SL-011: External AI-Assisted Authoring Client and Invocation Strategy](./011-external-ai-assisted-authoring-client-and-invocation-strategy.md)
- [ADR-SL-012: Preview Simulation and Artifact Validation Architecture](./012-preview-simulation-and-artifact-validation-architecture.md)
- [ADR-SL-013: Authoring Packet and Proposal Contract](./013-authoring-packet-and-proposal-contract.md)
- [ADR-SL-014: Quest-Beat Traversal and Deterministic Interaction Derivation Algorithm](./014-quest-beat-traversal-and-deterministic-interaction-derivation-algorithm.md)
- [ADR-SL-015: Provenance Tracking, Reconciliation, and LLM Refinement Architecture](./015-provenance-tracking-reconciliation-and-llm-refinement-architecture.md)

## Relationship to Other Docs

- [Sugarlang Strategic Architecture](../architecture/sugarlang-strategic-architecture.md)
- [Sugarlang Product Use Cases](../product/README.md)
- [Sugarlang AI-Assisted Authoring Workflow](../product/authoring-workflow.md)

Historical research context:

- [Language Learning Product Roadmap](../research/LANGUAGE_LEARNING_PRODUCT_ROADMAP.md)

## Scope

Across these ADRs:

- the browser-based game remains a first-class target
- local LLMs and local databases remain supported
- commercial API models remain future-compatible but optional
- self-hosted server inference remains future-compatible but optional
- no ADR assumes that `sugaragent` must be enabled

## Not Covered Here

These ADRs intentionally do not define:

- exact TypeScript interfaces
- exact editor layouts
- exact file schemas
- exact evaluator implementations
- exact model selections
- exact deployment phases

Those belong in follow-on ADRs or implementation plans.
