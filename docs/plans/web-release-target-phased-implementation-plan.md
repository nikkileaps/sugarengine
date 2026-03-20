# Web Release Target Phased Implementation Plan

## Status

Draft

## Purpose

This document turns the approved web release target architecture into an implementation sequence for engineering teams.

It assumes the design decisions in:

- [web-release-target-publish-system-design.md](/Users/nikki/projects/sugarengine/docs/proposals/web-release-target-publish-system-design.md)
- [027-game-api-service-boundary-and-module-contract.md](/Users/nikki/projects/sugarengine/docs/adr/027-game-api-service-boundary-and-module-contract.md)
- [028-game-api-authentication-session-and-abuse-control-architecture.md](/Users/nikki/projects/sugarengine/docs/adr/028-game-api-authentication-session-and-abuse-control-architecture.md)
- [029-model-packaging-and-artifact-delivery-strategy.md](/Users/nikki/projects/sugarengine/docs/adr/029-model-packaging-and-artifact-delivery-strategy.md)
- [030-cloud-run-service-topology-scaling-and-region-strategy.md](/Users/nikki/projects/sugarengine/docs/adr/030-cloud-run-service-topology-scaling-and-region-strategy.md)
- [031-production-observability-and-traceability-architecture.md](/Users/nikki/projects/sugarengine/docs/adr/031-production-observability-and-traceability-architecture.md)
- [032-local-preview-and-deployed-sugaragent-parity-contract.md](/Users/nikki/projects/sugarengine/docs/adr/032-local-preview-and-deployed-sugaragent-parity-contract.md)

## Objective

Deliver a first hosted `web` release target that:

- keeps SugarEngine as the scaffolding and export authority,
- keeps each game repository as the release authority for that game,
- deploys a static client to a CDN,
- deploys a game-specific backend to Cloud Run,
- preserves Sugarlang and SugarAgent behavior,
- does not require hosted save persistence in the minimum release,
- preserves room for future native release targets.

## Planning Principles

- One source of truth: shared runtime behavior should be extracted once and reused.
- One-way dependencies: game repositories consume shared SugarEngine-owned packages; SugarEngine does not depend on game repositories.
- Single enforcer: auth, traceability, and deployment automation should each have one clear enforcement layer.
- Release-target language first: scaffold and automate around `release/targets/<target>`.
- Shipping path first: the minimum hosted web release should avoid optional systems that do not unblock deployment.

## Out of Scope for the First Hosted Web Release

- Hosted save persistence as a required subsystem.
- Account-backed player identity.
- Browser-local inference.
- Multi-region active-active deployment.
- Splitting `GenerationService` and `EmbeddingsService` into separate deployed services.
- New native release-target implementation work beyond preserving the architecture to support it later.

## Phase 1: Extract Shared Runtime Core and Contracts

### Goal

Create the shared package boundary that both local preview and hosted play will consume.

### Work

- Extract the shared SugarAgent session runtime core from the current local-preview-oriented runtime structure.
- Define the publishable/shared package boundary for:
  - interpret -> retrieve -> plan -> generate -> audit -> repair semantics,
  - request/response contracts,
  - diagnostics/result taxonomies,
  - `GenerationService` and `EmbeddingsService` interfaces,
  - bridge-facing operation semantics.
- Keep local preview behavior working against the extracted shared core.
- Define versioning and package metadata so external game repositories can consume the shared package.

### Deliverables

- A SugarEngine workspace package for the shared runtime core.
- A documented export surface for runtime contracts and service interfaces.
- Local preview wired through the shared core instead of a private duplicate path.

### Exit Criteria

- Local preview still passes its existing SugarAgent/Sugarlang behavioral checks.
- The shared package can be consumed without importing the editor app or Vite-specific code.
- The package boundary is narrow enough that a game repository can depend on it directly.

## Phase 2: Scaffold the Web Release Target in Game Repositories

### Goal

Teach SugarEngine to scaffold the web target structure inside a game repository with minimal manual editing.

### Work

- Define the scaffold contract for:
  - `release/targets/web/game-api`
  - `release/targets/web/profile.staging.json`
  - `release/targets/web/profile.production.json`
  - backend package metadata,
  - Dockerfile and `.dockerignore`,
  - environment template files,
  - GitHub Actions workflow templates.
- Ensure new-game creation and publish/export flows can materialize or refresh the scaffold safely.
- Separate generated/scaffolded files from game-owned configuration that developers are expected to edit.

### Deliverables

- A repeatable scaffolded web target inside a game repository.
- A documented contract for which files SugarEngine owns vs which files the game repo owns.

### Exit Criteria

- A newly created game repository can be scaffolded into a web-target-ready shape in one pass.
- Re-running scaffolding does not destroy game-owned release configuration unexpectedly.
- The scaffold names and paths align with the approved release-target language.

## Phase 3: Stand Up the `game-api` Skeleton

### Goal

Create the modular monolith backend shape in the game repository without yet requiring full hosted SugarAgent execution.

### Work

- Create the Fastify + TypeScript backend skeleton at `release/targets/web/game-api`.
- Establish domain routing for:
  - `/auth/*`
  - `/player/*`
  - optional `/save/*`
  - `/sugaragent/*`
- Implement baseline health/readiness surfaces for deployment automation and operational checks.
- Implement `GET /player/me` as session-derived bootstrap/introspection.
- Scaffold the optional `save` boundary without making hosted persistence mandatory.

### Deliverables

- A bootable backend container with domain-routed endpoints.
- A stable route/module layout matching ADR 027.

### Exit Criteria

- The backend starts locally and in container form.
- `player/me` works for authenticated sessions without a durable player database.
- Optional `save` boundaries are present but do not force hosted persistence into the minimum release.

## Phase 4: Implement Auth, Session, and Access Controls

### Goal

Put the required protection boundary in front of hosted backend usage before live SugarAgent traffic is enabled.

### Work

- Implement closed-alpha login/session issuance in the `auth` module.
- Use server-side secrets for credential verification and session signing.
- Deliver short-lived session tokens via secure `HttpOnly` cookies for browser play.
- Enforce protected-route authentication for `player` and `sugaragent` endpoints.
- Implement rate limiting:
  - pre-auth per-IP,
  - post-auth per-session,
  - tighter controls for expensive `sugaragent` routes.
- Emit auth-denied and throttled outcomes through the traceable diagnostics taxonomy.

### Deliverables

- Working browser-authenticated session flow.
- Protected API middleware/policies.
- Abuse-control enforcement in front of cost-bearing endpoints.

### Exit Criteria

- Unauthenticated direct access to hosted `sugaragent` routes is denied.
- The browser can establish a session and call protected endpoints with credentials.
- Rate limiting and denial outcomes are observable and attributable.

## Phase 5: Add Hosted SugarAgent Execution Behind Shared Services

### Goal

Run hosted SugarAgent behavior in `game-api` using the shared runtime core and shared service interfaces.

### Work

- Wire the `sugaragent` module to the extracted shared runtime core.
- Implement hosted adapters for:
  - `GenerationService`
  - `EmbeddingsService`
- Keep the plugin-facing bridge semantics stable while mapping them to the hosted domain routes.
- Add the hosted bridge implementation for the browser/web target.
- Preserve parity semantics between local preview and hosted play.
- Keep hosted model lifecycle backend-owned even if the bridge still exposes `loadModel`/`unloadModel` semantics.

### Deliverables

- Hosted `sugaragent` request flow using shared runtime semantics.
- Production bridge implementation for the web target.
- Shared service adapter wiring for generation and embeddings.

### Exit Criteria

- Hosted browser play can complete protected SugarAgent turns end to end.
- Local preview and hosted play share the same runtime core semantics.
- The web target no longer depends on the local Vite-only `op` runtime envelope.

## Phase 6: Integrate the Web Client with Hosted Play

### Goal

Keep the frontend delta small while making the published client work against the hosted backend.

### Work

- Inject deployment-time runtime configuration for the web target.
- Select the hosted runtime bridge from release-target/deployment configuration.
- Implement auth/session bootstrap in the client.
- Use credentialed HTTPS requests to the backend.
- Add degraded/unavailable backend states to the conversation UX and client bootstrap flow.
- Propagate trace ids across browser-initiated backend calls.

### Deliverables

- A CDN-hostable frontend build that can talk to the hosted backend.
- Browser UX for authenticated play and backend degradation.

### Exit Criteria

- The frontend can authenticate, call the hosted backend, and surface meaningful failure states.
- The frontend changes remain runtime-configuration-focused rather than a frontend architecture fork.

## Phase 7: Containerization, CI/CD, and Release Automation

### Goal

Make the web target deployable through automation owned by the game repository.

### Work

- Finalize the backend Docker image build for the selected v1 model set.
- Implement GitHub Actions workflows for:
  - frontend build/deploy,
  - backend build/push/deploy,
  - environment/profile selection,
  - release metadata capture.
- Wire deployment profiles to concrete service names such as `<game-slug>-api`.
- Ensure the release pipeline records:
  - game repo revision,
  - backend revision,
  - shared package version,
  - selected model/runtime artifact identifiers.

### Deliverables

- Automated deployment workflows in the game repository.
- Repeatable staging and production deployment paths for the web target.

### Exit Criteria

- A game repository can deploy the `web` target without manual infra steps beyond expected secret/config management.
- Deployment outputs make it clear which game revision and backend revision are live.
- The image/model packaging remains within the v1 operational budget defined in ADR 029.

## Phase 8: Observability, Parity Validation, and Release Hardening

### Goal

Make the first hosted release explainable, supportable, and safe to operate.

### Work

- Implement structured traced logging across browser -> backend -> `sugaragent` -> shared services.
- Standardize outcome classification for success, denial, fallback, degradation, and error.
- Build parity checks or replay-style validation between local preview and hosted play using the shared runtime contract.
- Add release health checks, smoke tests, and operational diagnostics for staging and production.
- Verify that the hosted web release target does not regress the ability to add future native targets.

### Deliverables

- Traceable request flow across the hosted stack.
- A parity-validation harness or equivalent contract-level verification workflow.
- Production-readiness checks for deployment and incident debugging.

### Exit Criteria

- A production issue can be traced to a specific game release, backend revision, and shared runtime version.
- Hosted behavior is diagnosable without relying on ad hoc logs.
- The team has enough parity confidence to use local preview as a meaningful pre-release signal.

## Recommended First Hosted Release Gate

The first hosted web release should not be considered ready until all of the following are true:

- the shared runtime core is extracted and consumed by both local preview and hosted play,
- a game repository can be scaffolded into the expected `web` target shape,
- the hosted backend is protected by authenticated session flow,
- hosted SugarAgent turns run through the shared runtime core,
- the published frontend uses the hosted bridge successfully,
- the game repository can deploy the target through CI/CD,
- the deployed system emits traceable diagnostics across browser and backend,
- the minimum release does not depend on hosted save persistence.

## Deferred Follow-On Work

These items are intentionally deferred until the minimum hosted web release is stable:

- hosted save persistence,
- account-backed identity,
- splitting shared services into separate deployed services,
- larger model artifact delivery beyond the v1 image budget,
- multi-region deployment,
- GPU-first hosting,
- native target-specific build/release implementation.
