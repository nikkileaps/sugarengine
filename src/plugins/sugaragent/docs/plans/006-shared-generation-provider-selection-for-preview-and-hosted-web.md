# Plan 006: Shared Generation Provider Selection for Preview and Hosted Web

## Status

Implemented.

Builds on:

- [ADR-SA-002: Local LLM Runtime and Provider](../adr/002-local-llm-runtime-and-provider.md)
- [ADR-SA-011: In-Engine LLM Provider Wiring](../adr/011-in-engine-llm-provider-wiring.md)
- [ADR 027: Game API Service Boundary and Module Contract](../../../../../docs/adr/027-game-api-service-boundary-and-module-contract.md)
- [ADR 032: Local Preview and Deployed `sugaragent` Parity Contract](../../../../../docs/adr/032-local-preview-and-deployed-sugaragent-parity-contract.md)

## Purpose

Add one shared SugarAgent generation-backend selection model that can drive:

1. local preview/dev,
2. hosted web staging/production.

The supported user-facing generation providers for this phase are:

1. `selfHosted`
2. `openai`

The intent is behavioral parity, not identical prose.

If a creator chooses `openai` for SugarAgent preview, local preview should use the same generation provider family that hosted web uses.

## Non-Negotiable Design Rules

1. Provider selection must not live only inside web publish settings.
2. Shared SugarAgent generation config is the source of truth; target profiles may override it but do not redefine the concept.
3. Preview and hosted web must continue to share one session-runtime core.
4. Browser clients must not call OpenAI directly.
5. Credentials must remain environment-specific and must never be written into project data, published frontend bundles, or diagnostics payloads.
6. `EmbeddingsService` remains local in phase 1 for both `selfHosted` and `openai`.
7. SugarEngine conversation-provider selection and SugarAgent generation-provider selection are separate concerns and must not be conflated.
8. Internal test/debug providers such as `echo` may remain available in code, but they are not part of the user-facing configuration model for this plan.

## Current Gaps

### 1. Preview only understands runtime mode, not provider family

Current preview authoring and editor controls center on `runtimeMode` such as `llama`, `auto`, and `mock`.

That is too low-level for the product need.

The user-facing decision is now:

1. use self-hosted generation,
2. use OpenAI generation.

### 2. Hosted game-api is still hard-wired around local/echo generation

Current hosted runtime config in the scaffolded `game-api` is centered on:

1. `provider: 'local' | 'echo'`
2. `runtimeMode: 'llama' | 'auto' | 'mock'`
3. llama binary/model path environment variables

That shape does not express a shared hosted-vs-preview generation choice.

### 3. Web publish profiles only cover frontend bridge settings

Current web publish profiles capture:

1. `frontend.gameApiBaseUrl`
2. frontend credential mode
3. backend deployment metadata

They do not carry SugarAgent generation defaults or overrides.

### 4. The current naming collides with existing provider terminology

The engine already has conversation providers.

SugarAgent also has runtime/provider concepts.

This work must clearly distinguish:

1. engine conversation provider,
2. SugarAgent generation provider.

### 5. Secret handling is currently optimized for self-hosted assets only

Local preview already relies on local process/runtime access.

Hosted web already relies on backend configuration and Secret Manager.

OpenAI support must preserve that split without leaking credentials into the browser.

## Target Product Model

### Shared generation config

SugarAgent should gain a shared project-level generation config owned by the game/project data and interpreted by both preview and publish flows.

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

Notes:

1. `runtimeMode` remains meaningful only inside `selfHosted`.
2. llama binary path, model path, and timeout remain host-environment runtime details rather than shared authored settings.
3. API keys are not part of this config.

### Target ownership

The ownership model should be:

1. shared game default in project/plugin config,
2. optional target-profile override for `web`,
3. environment-specific credential resolution at runtime.

The project config defines intent.

The release target defines deploy defaults.

The runtime host provides secrets.

### Precedence

Resolved generation config should follow this order:

1. explicit UI/runtime override for the current execution context,
2. release-target profile override,
3. shared game/project default,
4. legacy fallback derived from old `runtimeMode` fields.

Legacy mapping rule:

1. if only legacy `runtimeMode` is present, resolve `provider='selfHosted'`,
2. map the legacy mode into `selfHosted.runtimeMode`,
3. preserve current behavior for existing projects.

## Secret Handling Contract

Credentials are environment-owned and separate from shared provider config.

### Local preview

Phase 1 local preview should resolve the OpenAI key from:

1. `OPENAI_API_KEY`,
2. optional future editor secret store support.

An optional namespaced fallback such as `SUGARAGENT_OPENAI_API_KEY` is acceptable if needed, but `OPENAI_API_KEY` should remain the primary local convention.

### Hosted web

Hosted `game-api` should resolve the OpenAI key from a backend-only environment variable injected from Secret Manager.

Recommended name:

1. `GAME_API_SUGARAGENT_OPENAI_API_KEY`

This stays consistent with the existing `GAME_API_SUGARAGENT_*` namespace already used by the scaffold.

### UI requirements

The editor and publish surfaces may show:

1. selected provider,
2. selected model,
3. base URL,
4. credential availability status.

They must not show raw secret values.

## Target Runtime Architecture

### A. Keep one session core

The session runtime in `packages/sugaragent-runtime-core/src/session/runtime.ts` remains the single behavioral core for:

1. interpret,
2. retrieve,
3. plan,
4. generate,
5. repair,
6. diagnostics,
7. fallback handling.

Preview and hosted web must continue to wrap this same core rather than fork it.

### B. Add a shared generation-service resolver

The main architectural addition should be a shared resolver layer in `packages/sugaragent-runtime-core` that turns resolved generation config into a concrete `JsonGenerationService`.

Target responsibilities:

1. normalize generation config,
2. select the provider implementation,
3. validate provider-specific non-secret settings,
4. surface health errors consistently,
5. avoid duplicating selection logic in preview and hosted wrappers.

Candidate module split:

1. `src/runtime/generation-config.ts`
2. `src/runtime/generation-service-resolver.ts`
3. `src/runtime/openai-generation-service.ts`

Dependency rule for phase 1:

1. `openai-generation-service.ts` lives in `sugaragent-runtime-core`,
2. it uses raw server-side `fetch` against the OpenAI API,
3. phase 1 does not add the OpenAI SDK as a dependency of `@nikkileaps/sugaragent-runtime-core`.

Rationale:

1. phase 1 only needs a narrow request/response adapter,
2. this keeps dependency weight and transitive package churn lower,
3. preview local dev host and hosted `game-api` can both rely on the same Node runtime HTTP primitive.

### B1. Make resolved generation config the only session source of truth

The session layer must not keep two competing generation selectors.

Required rule:

1. resolved `generation` config is the only production source of truth for provider selection,
2. `generationService` injection is dependency injection for wrappers/tests, not a second user-facing config channel,
3. the session runtime must not re-decide between `selfHosted` and `openai` after resolution.

Direction for `SessionOptions`:

1. replace the current public meaning of `SessionOptions.provider`,
2. pass resolved generation config into the session or use it to construct the injected `generationService` before session creation,
3. keep `generationService?: JsonGenerationService` for tests and wrapper-owned injection,
4. if `echo` remains necessary, move it behind an explicitly debug/test-only flag rather than keeping it as a peer to real generation providers.

Unacceptable end state:

1. `SessionOptions.provider` and resolved `generation` config both influence runtime selection,
2. preview and hosted wrappers resolve one provider while the session layer silently honors another.

### B2. Use one runtime-services factory invocation pattern

The resolver should not be called from arbitrary wrapper code paths.

The intended pattern is two-stage:

1. resolve non-secret generation policy through shared config-merging rules,
2. construct the concrete `JsonGenerationService` once at the backend/runtime-host boundary where credentials are available.

Required call-site rule:

1. `createSugarAgentSession(...)` must not call the generation-service resolver,
2. browser/editor code must not call the generation-service resolver,
3. preview local dev host and hosted `game-api` must both obtain generation services through the same shared runtime-services factory shape.

In plain language:

1. preview browser -> local dev host runtime-services factory -> resolver -> `generationService` -> session,
2. hosted browser -> `game-api` runtime-services factory -> resolver -> `generationService` -> session.

This may be implemented by broadening `createHostedSugarAgentRuntimeServices(...)` into a shared host-agnostic factory or by extracting a lower-level helper used by both preview and hosted paths.

What matters is the architectural rule:

1. one logical resolver invocation pattern,
2. one shared factory boundary,
3. no session-layer fallback resolver,
4. no duplicated preview-vs-hosted resolver wiring.

### C. Preserve transport boundaries

Transport should not change conceptually:

1. preview browser -> `HttpLocalRuntimeBridge` -> local dev host/backend,
2. hosted browser -> `HttpGameApiRuntimeBridge` -> deployed `game-api`.

Only the generation implementation behind the backend should change.

This preserves the plugin-facing bridge contract while allowing provider selection to vary.

### D. Separate generation provider from test/debug provider flags

Current internal runtime options such as `provider: 'local' | 'echo'` should no longer be the user-facing source of truth for generation selection.

The preferred direction is:

1. shared resolved `generation` config selects `selfHosted` vs `openai`,
2. internal `echo` behavior remains an internal test/debug option only,
3. preview/editor UI does not expose `echo`.

Migration note:

1. `provider: 'local'` should be removed rather than retained as a parallel selector,
2. if a temporary compatibility shim is needed, it should map only to resolved `generation.provider='selfHosted'` and must not survive as an independent decision point.

### E. Keep embeddings local in phase 1

Both preview and hosted web should continue to use `createLocalEmbeddingsService()` in this plan.

That gives the first supported matrix:

1. preview + `selfHosted` generation + local embeddings,
2. preview + `openai` generation + local embeddings,
3. hosted + `selfHosted` generation + local embeddings,
4. hosted + `openai` generation + local embeddings.

## Config Placement and Migration Direction

### Shared game/project config

The shared default should live in SugarAgent's authored project/plugin config rather than only in publish profiles.

That means the current authored shape in files such as:

1. `src/plugins/sugaragent/authoring/artifacts.ts`
2. `src/plugins/sugaragent/authoring/runtime-resolution.ts`
3. `src/plugins/sugaragent/project-plugin.ts`

should grow from `runtimeMode`-only policy resolution to resolved generation policy resolution.

### Publish profile override

Web release profiles should gain an optional non-secret override block for SugarAgent generation defaults.

Conceptual shape:

```json
{
  "sugaragent": {
    "generation": {
      "provider": "openai",
      "openai": {
        "model": "gpt-5-mini",
        "baseUrl": "https://api.openai.com/v1"
      }
    }
  }
}
```

Important boundary:

1. this profile block may override provider/model/base URL,
2. it must not carry API keys,
3. it must remain optional so the profile can inherit the shared game default.

### Runtime-only environment config

Hosted runtime config should continue to own infrastructure details such as:

1. OpenAI API key,
2. llama binary/model paths for `selfHosted`,
3. timeout values,
4. deployment-specific tuning.

These values belong in the backend host config, not authored project policy.

## Implementation Plan

### Phase 6A: Shared config schema and normalization

Implement:

1. `SugarAgentGenerationConfig` types in authoring/runtime-core boundaries,
2. project-data parsing and normalization for shared generation defaults,
3. legacy `runtimeMode` to `selfHosted` migration logic,
4. resolved-generation-policy helpers for preview/runtime callers.

Primary files:

1. `src/plugins/sugaragent/authoring/artifacts.ts`
2. `src/plugins/sugaragent/authoring/runtime-resolution.ts`
3. `src/plugins/sugaragent/project-plugin.ts`
4. `docs/api/plugins/sugaragent/16-sugaragent-plugin.md`

Acceptance:

1. project data can express `selfHosted` or `openai`,
2. old projects with only `runtimeMode` still resolve correctly,
3. one normalized generation policy object exists for downstream callers.

### Phase 6B: Shared runtime-core generation resolver

Implement:

1. a shared generation-config normalization module,
2. a shared generation-service resolver,
3. `OpenAIGenerationService` implementing `JsonGenerationService` via raw `fetch` rather than the OpenAI SDK,
4. a shared runtime-services factory that owns the single resolver invocation pattern for both preview dev host and hosted `game-api`,
5. `SessionOptions` cleanup so resolved generation config replaces `provider` as the production selector,
6. explicit error reporting when OpenAI config or credentials are missing,
7. startup diagnostics that include resolved generation provider and non-secret config source.

Primary files:

1. `packages/sugaragent-runtime-core/src/services.ts`
2. `packages/sugaragent-runtime-core/src/session/runtime.ts`
3. `packages/sugaragent-runtime-core/src/hosted.ts`
4. new runtime-core generation-service modules
5. preview local runtime-host entrypoint that currently constructs session runtime services

Acceptance:

1. preview and hosted wrappers both obtain generation services through the same shared runtime-services factory pattern,
2. `selfHosted` still uses the existing llama-backed implementation,
3. `openai` uses a server-side HTTP-backed implementation without changing the session core contract,
4. phase 1 OpenAI support does not require adding the OpenAI SDK to `@nikkileaps/sugaragent-runtime-core`,
5. `createSugarAgentSession(...)` does not invoke the resolver directly,
6. `SessionOptions.provider` no longer competes with resolved generation config inside the session runtime.

### Phase 6C: Preview/editor integration

Implement:

1. editor controls for generation provider,
2. OpenAI model/base URL settings for preview,
3. clear credential-status messaging for local preview,
4. local dev host integration through the shared runtime-services factory rather than bespoke resolver wiring,
5. reuse of the same generation form section wherever possible,
6. runtime reset/health behavior that works for either provider.

Primary files:

1. `src/editor/Editor.tsx`
2. local preview runtime endpoint wiring used by `HttpLocalRuntimeBridge`
3. any shared editor-side normalization helpers for SugarAgent config

Acceptance:

1. local preview can run SugarAgent with `openai`,
2. the browser still talks only to the local SugarEngine dev host,
3. the local dev host uses the same resolver/factory path as hosted web,
4. creators can see whether local credentials are configured without seeing the key itself.

### Phase 6D: Hosted web profile and game-api integration

Implement:

1. optional web-profile generation override parsing,
2. scaffolded `game-api` config support for OpenAI settings and server-side credential lookup,
3. hosted runtime initialization from the shared runtime-services factory,
4. profile/template updates so staging and production can choose different defaults if needed,
5. deployment-guide updates for Secret Manager setup.

Primary files:

1. `src/editor/game-root/web-publish-profile.ts`
2. `src/editor/game-root/release-target-scaffold.ts`
3. `docs/dev/new-game-web-deploy-guide.md`
4. scaffolded `game-api` config/runtime service templates emitted from the scaffold

Acceptance:

1. hosted `game-api` can run with `selfHosted` or `openai`,
2. staging and production may override the shared default without redefining the model,
3. OpenAI credentials are resolved only on the backend,
4. hosted web does not maintain a resolver invocation pattern different from preview local dev host.

### Phase 6E: Diagnostics, parity tests, and migration coverage

Implement:

1. tests for config normalization and legacy migration,
2. tests for generation-service resolver behavior,
3. parity tests across preview and hosted wrappers using injected fake generation services,
4. health and startup diagnostics that expose provider family cleanly,
5. explicit fallback behavior when OpenAI is selected but unavailable.

Acceptance:

1. provider misconfiguration becomes visible as `provider_unavailable` style behavior rather than silent drift,
2. preview and hosted wrappers remain contract-parity aligned,
3. the four-cell phase-1 support matrix is covered by automated tests where feasible.

## Backward Compatibility Rules

1. Existing projects that only specify `runtimeMode` keep working as `selfHosted`.
2. Existing hosted web profiles without SugarAgent generation overrides remain valid.
3. Existing internal `echo` test paths may remain in code until the new resolver fully absorbs their needed behavior.
4. Existing published frontend bridge semantics remain unchanged.

## Diagnostics Contract Changes

The system should add generation-provider visibility to diagnostics, but only in non-secret form.

Allowed examples:

1. provider kind: `selfHosted` or `openai`,
2. runtime mode when `selfHosted`,
3. configured model id,
4. resolved source: shared default, profile override, or explicit runtime override.

Disallowed examples:

1. API keys,
2. authorization headers,
3. full secret-manager payloads.

## Out of Scope for This Plan

1. remote embeddings providers,
2. browser-direct OpenAI access,
3. streaming response transport redesign,
4. model-specific prompt branching,
5. tool-calling or function-calling support,
6. multi-provider failover chains beyond current fallback semantics.

## Acceptance Criteria

1. SugarAgent has one shared generation-provider configuration model consumed by both preview and hosted web paths.
2. Local preview can use `openai` without bypassing the local dev host/backend.
3. Hosted `game-api` can use `openai` with backend-only secret injection.
4. Web publish profiles can override shared generation defaults without becoming the only place provider choice exists.
5. Phase-1 embeddings behavior remains local and unchanged across all four supported environment/provider combinations.
6. Existing `runtimeMode`-only projects continue to work without manual migration.
7. Diagnostics and tests make provider-family drift visible without exposing secrets.
