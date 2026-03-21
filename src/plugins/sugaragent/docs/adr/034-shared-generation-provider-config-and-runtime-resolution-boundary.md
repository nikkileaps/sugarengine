# ADR-034: Shared Generation Provider Config and Runtime Resolution Boundary

## Status

Proposed

## Context

SugarAgent now has two important execution environments for generation-backed NPC chat:

1. local preview/dev,
2. hosted web play through `game-api`.

Those environments should differ in transport and infrastructure, but not in the core behavioral conversation pipeline.

Today, the architecture is partly aligned with that goal and partly not:

1. the shared session runtime in `packages/sugaragent-runtime-core/src/session/runtime.ts` already owns interpret/retrieve/plan/generate/repair behavior,
2. the client/plugin side already has a stable `LLMProvider` and runtime-bridge abstraction,
3. hosted and preview already wrap the same core in different ways,
4. but generation selection is still too tied to legacy runtime/provider fields such as `runtimeMode` and `provider: 'local' | 'echo'`,
5. and web publish settings are not yet a coherent source of truth for generation behavior across preview and hosted play.

We now need to add OpenAI as an alternative generation backend while preserving:

1. one shared session core,
2. one coherent provider-selection story across preview and hosted web,
3. environment-specific credential handling,
4. clear ownership boundaries between client transport, backend runtime assembly, and session behavior.

## Decision

SugarAgent will adopt one shared generation-provider configuration model for both preview and hosted web.

The authoritative phase-1 user-facing provider identifiers are:

1. `selfHosted`
2. `openai`

The architecture will follow these rules:

1. shared SugarAgent generation config is the production source of truth for generation selection,
2. preview and hosted web both use the same session runtime core,
3. provider resolution happens at the backend/runtime-host boundary through a shared runtime-services factory pattern,
4. `createSugarAgentSession(...)` does not resolve generation providers,
5. client/browser code does not resolve generation providers,
6. the client-side `LLMProvider` and runtime-bridge layers remain transport adapters rather than becoming a second provider-selection layer,
7. credentials remain environment-specific and are never stored in shared project config or published frontend assets,
8. embeddings remain local in phase 1 regardless of generation provider.

## Shared Config Contract

SugarAgent generation choice is modeled as shared authored/project policy, not as a web-only publish setting.

Target conceptual shape:

```ts
interface SugarAgentGenerationConfig {
  provider: 'selfHosted' | 'openai';
  selfHosted?: {
    runtimeMode?: 'llama' | 'auto' | 'mock';
  };
  openai?: {
    model: string;
    baseUrl?: string;
  };
}
```

Rules:

1. `runtimeMode` is meaningful only inside `selfHosted`,
2. API keys are not part of this config,
3. host-specific runtime details such as llama binary/model path and timeout remain runtime-host configuration, not authored policy.

## Config Precedence

Resolved generation config follows this order:

1. explicit UI/runtime override for the active execution context,
2. target-profile override,
3. shared game/project default,
4. legacy fallback derived from old `runtimeMode`-only configuration.

Legacy rule:

1. existing projects that only specify `runtimeMode` continue to behave as `provider='selfHosted'`,
2. the legacy mode maps into `selfHosted.runtimeMode`.

## Runtime Boundary Contract

### 1. Client/plugin layer

The SugarAgent plugin-side `LLMProvider` layer remains a client adapter.

Its responsibilities are:

1. build plugin/runtime requests,
2. call the runtime bridge,
3. validate and normalize returned payloads,
4. surface structured fallback and diagnostics back to the plugin.

Its non-responsibilities are:

1. choosing `selfHosted` vs `openai`,
2. reading secrets,
3. constructing backend generation services.

### 2. Runtime bridge layer

`HttpLocalRuntimeBridge` and `HttpGameApiRuntimeBridge` remain transport adapters.

Their responsibilities are:

1. move requests between browser/plugin code and the current backend,
2. preserve the plugin-facing runtime contract,
3. normalize transport-level error mapping.

They do not own generation-provider selection.

### 3. Runtime-services factory layer

Generation-provider resolution belongs at the backend/runtime-host boundary.

This layer is responsible for:

1. resolving effective generation config,
2. validating provider-specific non-secret settings,
3. reading environment-specific credentials,
4. constructing the concrete `JsonGenerationService`,
5. injecting that service into session creation,
6. exposing health/readiness for the selected provider.

Preview local dev host and hosted `game-api` must both use the same shared runtime-services factory pattern.

That shared pattern is:

1. resolve effective generation policy,
2. construct generation service,
3. pass generation service into the shared session runtime.

### 4. Session runtime layer

The session runtime remains the behavioral core.

Its responsibilities are:

1. interpretation,
2. retrieval,
3. planning,
4. generation orchestration,
5. validation/repair,
6. fallback semantics,
7. diagnostics.

Its non-responsibilities are:

1. deciding between `selfHosted` and `openai`,
2. reading secrets,
3. owning environment-specific provider assembly.

`generationService` injection is dependency injection, not a second configuration surface.

## SessionOptions Rule

`SessionOptions.provider` must not survive as a competing production selector once shared generation config exists.

Required direction:

1. resolved generation config replaces the public meaning of `SessionOptions.provider`,
2. `createSugarAgentSession(...)` receives an already-selected generation service,
3. if `echo` remains for tests/debugging, it moves behind an explicitly internal debug/test path rather than remaining a peer to real providers.

Rejected end state:

1. shared generation config selects one provider,
2. session-level `provider` silently selects another.

## Credential Boundary

Credentials are environment-owned.

### Preview local dev host

Phase 1 OpenAI credential source:

1. `OPENAI_API_KEY`

An editor secret store may be added later, but it does not change the architectural boundary.

### Hosted `game-api`

Phase 1 OpenAI credential source:

1. `GAME_API_SUGARAGENT_OPENAI_API_KEY`

That value is injected through backend-only environment configuration or Secret Manager.

The browser must never receive the raw key.

## Health and Error UX

Provider-misconfiguration errors should surface primarily through runtime health/readiness rather than only on the first gameplay turn.

Required behavior:

1. when `openai` is selected and the key is missing, backend/runtime-host health reports `ok: false`,
2. preview/editor surfaces that state during runtime init or provider-selection changes,
3. generation-time failure remains a safety net, not the primary discovery path.

This keeps missing credentials visible before live gameplay.

## Phase-1 Provider Implementation Rule

The OpenAI generation implementation lives in `packages/sugaragent-runtime-core`.

For phase 1:

1. it is implemented as a `JsonGenerationService`,
2. it uses raw server-side `fetch`,
3. it does not introduce the OpenAI SDK as a dependency of `@nikkileaps/sugaragent-runtime-core`.

That keeps the phase-1 provider adapter narrow and avoids unnecessary dependency expansion in the shared runtime package.

## Phase-1 Support Matrix

Phase 1 supports:

1. preview + `selfHosted` generation + local embeddings,
2. preview + `openai` generation + local embeddings,
3. hosted + `selfHosted` generation + local embeddings,
4. hosted + `openai` generation + local embeddings.

Embeddings-provider switching is out of scope for this ADR.

## Consequences

### Positive

1. preview and hosted web share one coherent provider-selection model,
2. session behavior stays centralized in one shared core,
3. transport layers remain simple adapters,
4. credential handling stays properly server-side,
5. provider drift between preview and hosted becomes easier to detect and test.

### Tradeoffs

1. runtime-host assembly becomes more important and must stay disciplined,
2. legacy `runtimeMode`/`provider` surfaces need cleanup and compatibility shims during migration,
3. more health/readiness state must be surfaced in editor and hosted runtime tooling.

## Rejected Alternatives

### 1. Make web publish profile the only provider-selection source

Rejected because it would make preview and hosted behavior conceptually separate systems.

### 2. Let `createSugarAgentSession(...)` resolve providers internally

Rejected because it would blur behavioral orchestration with environment-specific service assembly and create competing sources of truth.

### 3. Move provider selection into the browser/plugin-side `LLMProvider`

Rejected because provider selection requires backend credentials and would duplicate logic across preview and hosted transport paths.

### 4. Keep `SessionOptions.provider` as a parallel selector

Rejected because it would allow silent drift between resolved config and actual runtime behavior.

## References

- [Plan 006: Shared Generation Provider Selection for Preview and Hosted Web](../plans/006-shared-generation-provider-selection-for-preview-and-hosted-web.md)
- [ADR-SA-002: Local LLM Runtime and Provider](./002-local-llm-runtime-and-provider.md)
- [ADR-SA-011: In-Engine LLM Provider Wiring](./011-in-engine-llm-provider-wiring.md)
- [ADR-SA-033: Local Embedding Runtime and Vector Artifact Contract](./033-local-embedding-runtime-and-vector-artifact-contract.md)
- [ADR 027: Game API Service Boundary and Module Contract](../../../../../docs/adr/027-game-api-service-boundary-and-module-contract.md)
- [ADR 032: Local Preview and Deployed `sugaragent` Parity Contract](../../../../../docs/adr/032-local-preview-and-deployed-sugaragent-parity-contract.md)
