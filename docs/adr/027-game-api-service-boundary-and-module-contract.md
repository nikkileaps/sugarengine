# ADR 027: Game API Service Boundary and Module Contract

## Status

Proposed

## Context

A published game with hosted web play needs a backend while preserving:

- SugarEngine as the owner of gameplay orchestration,
- SugarEngine as the scaffolding/build authority for game repositories,
- Sugarlang as the owner of pedagogy/language policy,
- SugarAgent as the owner of conversational inference behavior,
- each game repository as the release and deployment authority for that specific game,
- future portability to native and browser-local targets,
- the ability to add non-AI backend concerns such as auth and save persistence without creating a service explosion.

The current published-web direction is a CDN-hosted frontend plus Cloud Run backend, as described in [web-release-target-publish-system-design.md](/Users/nikki/projects/sugarengine/docs/proposals/web-release-target-publish-system-design.md).

The central service-boundary question is:

- do we create one game backend service with internal modules,
- or do we split immediately into smaller network services such as auth, save, and inference?

## Decision

The system will use one backend service per game, referred to in this ADR as `game-api`.

`game-api` is a modular monolith with clear internal domains:

- `auth`
- `player`
- optional `save`
- `sugaragent`
- shared `GenerationService`
- shared `EmbeddingsService`

The `sugaragent` module is the plugin-facing orchestration layer.

The `GenerationService` and `EmbeddingsService` are shared lower-level backend services and must not be permanently owned by `sugaragent`.

The public API surface should be domain-oriented, not implementation-oriented.

Initial endpoint families are:

- `/auth/*`
- `/player/*`
- optional `/save/*`
- `/sugaragent/*`

The domain-routed public API does not require the SugarAgent plugin contract to mirror those routes directly.

A browser/runtime bridge layer should translate between:

- the stable plugin-facing runtime bridge methods,
- and the concrete backend HTTP surface for the selected deployment target.

`game-api` is an architectural role name, not a required literal deployment resource name.

Deployed service names should be derived from the game slug, with a default convention such as:

- `<game-slug>-api`
- `<game-slug>-api-<environment>` when environment suffixes are needed

This keeps architecture language reusable while keeping deployed resources clearly associated with a specific game.

## Domain Relationships

### SugarEngine Repository

The SugarEngine repository owns:

- editor/tooling behavior,
- export contracts,
- scaffolding contracts for game repositories,
- shared release-target conventions.

It does not own production deployment state for a specific published game.

### Game Repository

Each game repository owns:

- the release profile for that game,
- CI/CD workflows,
- environment bindings,
- backend service identity and naming for that game's deployment,
- release history.

`game-api` is released from the game repository, even if the initial structure was scaffolded by SugarEngine.

### Preferred Repository/App Shape

The preferred scaffolded shape is:

- one game repository per game,
- one standalone backend application inside that repository,
- one CI/CD automation system for that repository,
- one versioned dependency boundary back to SugarEngine-owned shared runtime packages.

The backend application should live inside the target-oriented release tree, such as `release/targets/web/game-api`, not as copied source generated into arbitrary folders.

For v1, the recommended backend app shape is:

- Node.js + TypeScript,
- Fastify as the HTTP server framework,
- route modules for `auth`, `player`, `save`, and `sugaragent`,
- one dedicated Dockerfile for that app,
- GitHub Actions as the default scaffolded release automation.

Target-specific deployment profiles should live alongside that app under the target tree, for example:

- `release/targets/web/profile.staging.json`
- `release/targets/web/profile.production.json`

The architecture does not require Fastify forever, but it does require:

- one standalone backend app,
- clear route/module boundaries,
- typed request/response contracts,
- containerized deployment shape owned by the game repository.

### Browser Client

The browser client:

- owns active gameplay execution,
- owns in-session world progression,
- owns the engine/provider composition model,
- sends backend requests only for protected backend concerns.

It should choose a concrete runtime bridge implementation at composition/bootstrap time rather than making plugin code aware of deployment topology.

### `auth` Module

The `auth` module owns:

- access control,
- session creation,
- session validation,
- future identity attachment.

It does not own gameplay or inference.

### `player` Module

The `player` module owns:

- stable player profile records,
- future account-linked metadata,
- non-save player settings that belong server-side,
- current authenticated player/session view returned to the browser.

It does not own session auth or inference.

For the first hosted release, the `player` module may be lightweight.

It does not require a durable account database in order to justify `GET /player/me`.

In v1, that endpoint may return a session-derived anonymous player view used for:

- browser session bootstrap,
- auth state confirmation,
- game/environment context,
- feature flags such as hosted-save availability.

### `save` Module

The `save` module owns:

- durable saved game state,
- durable learner progression once cloud persistence exists,
- overwrite-style save semantics for the current product.

It does not own in-session gameplay authority.

For the first hosted-AI release, this is an optional module boundary rather than a mandatory live subsystem.

That means:

- the architecture reserves the module and route family,
- scaffolding may include the module shape,
- a game may ship without hosted save persistence enabled,
- in that default case the browser remains authoritative for save persistence.

### `sugaragent` Module

The `sugaragent` module owns:

- translating browser/plugin requests into backend conversation work,
- orchestration of interpret/retrieve/plan/generate/audit/repair,
- plugin-facing diagnostics and policy adaptation at the backend boundary.

It does not own auth or persistence.
It should consume a shared SugarAgent session runtime core rather than hosting a forked copy of that logic.

### Shared SugarAgent Session Runtime Core

The interpret/retrieve/plan/generate/audit/repair core should be shared between:

- local preview/runtime tooling in SugarEngine,
- hosted `game-api` execution for deployed games.

That shared core should cross the repo boundary as a versioned dependency, not as scaffolded copied source.

The `game-api` backend should not depend on the entire SugarEngine editor application.

### Preferred Package Boundary

The preferred first packaging shape is:

- a SugarEngine-owned workspace package inside the SugarEngine repo,
- published as a versioned package when external game repositories need to consume it.

The first shared package should export:

- the shared SugarAgent session runtime core,
- shared request/response contract types used by preview and hosted execution,
- `GenerationService` and `EmbeddingsService` service interfaces,
- shared diagnostics/result taxonomies that parity and observability depend on.

It should not export:

- the editor application,
- Vite/Tauri/browser transport wrappers,
- game-repository server scaffolding,
- deployment-specific route handlers.

The preferred first delivery path is:

- workspace package during local SugarEngine development,
- published package for external game repositories.

For the current repo model, the preferred first publish target is a private package registry such as GitHub Packages.

Initial versioning should be lockstep with SugarEngine releases so the team does not need a second version matrix before the boundary stabilizes.

### Shared `GenerationService`

The `GenerationService` owns:

- low-level model-backed structured generation,
- hardware/runtime-specific generation concerns,
- reusable generation contracts that can later serve more than one module.

At the code level, this should be an internal backend service interface with one selected adapter implementation.

The `sugaragent` module depends on the service interface, not on a concrete runtime technology.

For example, the capability may be backed by:

- a local `llama.cpp` adapter,
- a native library adapter,
- a self-hosted OpenAI-compatible server adapter,
- a commercial provider adapter behind a server-side boundary.

### Shared `EmbeddingsService`

The `EmbeddingsService` owns:

- vector inference,
- embedding-model execution concerns,
- reusable similarity infrastructure for any backend module that later needs embeddings.

At the code level, this should also be an internal backend service interface with one selected adapter implementation.

The `sugaragent` module depends on the service interface, not on `onnxruntime-node` or any other concrete runtime directly.

For example, the capability may be backed by:

- a local ONNX adapter,
- another local embedding runtime,
- a remote embedding service adapter.

## Request and Data Flow

### `sugaragent` Conversation Flow

In plain language, the backend should handle a `sugaragent` turn like this:

1. Authenticate the request.
2. Validate the request shape and version.
3. Hydrate only the backend context that belongs server-side.
4. Hand the request to the `sugaragent` module.
5. The `sugaragent` module invokes the shared session runtime core.
6. The shared core interprets the turn and decides whether it needs embeddings, generation, or both.
7. Shared `EmbeddingsService` and `GenerationService` implementations are called as needed.
8. Produce a structured turn result plus diagnostics.
9. Return the result without letting backend-side inference become the authority for game progression.

### Save Flow

In plain language, the backend should handle save persistence like this:

1. Authenticate the player.
2. Validate the save payload and version.
3. Replace the prior saved state for that player/game/environment.
4. Return a durable save acknowledgement and server metadata.

This flow applies only when hosted persistence is enabled for a given game/deployment profile.

## Boundary Rules

### What Must Stay Out of `game-api`

- engine-owned scene orchestration,
- raw editor authoring concerns,
- local-only editor workflows,
- plugin-to-plugin coupling logic,
- browser UI state.

### What Must Stay Out of Scaffolding

Game-repository scaffolding must not:

- vendor runtime source from SugarEngine,
- duplicate the SugarAgent session runtime core,
- generate multiple competing CI/CD systems by default,
- blur the boundary between a standalone backend app and the editor application.

### What Must Stay Out of `sugaragent`

- auth/session issuance,
- save persistence ownership,
- player profile ownership,
- direct control of lower-level shared services as if they were plugin-private,
- vendored copies of shared session-runtime logic,
- deployment-specific HTTP route knowledge.

### What Shared Services Must Not Become

Shared `GenerationService` and `EmbeddingsService` must not become:

- route handlers,
- plugin-facing transport contracts,
- direct child-process calls spread across orchestration code,
- ad hoc utility functions without a stable interface boundary.

They are application-internal service interfaces with swappable adapter implementations.

## Service Shape

The backend is one deployable service for now.

That means:

- one deploy unit,
- one auth boundary,
- one observability surface,
- one rollback unit,
- one release pipeline for backend changes in the game repository.

This is a deployment choice, not a denial of future separation.

If future pressure justifies it, shared services or modules may later split into separate network services.

## Plain-Language Algorithm for Module Responsibility

When deciding where a behavior belongs, use this rule:

1. If it is about who the player is or whether they may act, it belongs to `auth`.
2. If it is about durable player profile data, it belongs to `player`.
3. If it is about durable game state, it belongs to `save`.
4. If it is about plugin-facing conversation orchestration, it belongs to `sugaragent`.
5. If it is about raw model execution, it belongs to shared `GenerationService` or `EmbeddingsService`.
6. If it is about gameplay authority inside the running game, it belongs in the client, not the backend.

When deciding whether something belongs in `sugaragent` or a shared service, use this second rule:

1. If it is about conversational meaning, policy, or orchestration, it belongs to `sugaragent`.
2. If it is about executing an inference primitive such as structured generation or vector embedding, it belongs to a shared service.
3. `sugaragent` may request those primitives, but it should not know whether they come from a local binary, a native library, or a remote server.

## Consequences

### Positive

- simpler operations than early microservices,
- clearer naming,
- cleaner future split points,
- easier shared observability,
- lower latency than multi-hop service decomposition.

### Tradeoffs

- one service still contains multiple domains,
- internal modularity discipline becomes essential,
- poor boundaries inside the monolith would create future migration pain.

## Rejected Alternatives

### 1. Make the Whole Backend “SugarAgent”

Rejected because it confuses:

- product/backend identity,
- plugin orchestration,
- future save/auth concerns,
- shared inference services.

### 2. Split Auth, Save, and Inference into Separate Services Immediately

Rejected because it creates unnecessary:

- network hops,
- deployment complexity,
- auth/token choreography,
- operational overhead,
- early architecture brittleness.

### 3. Make `GenerationService` and `EmbeddingsService` Private to `sugaragent`

Rejected because it blocks later backend reuse and hardcodes plugin naming into lower service layers.

## References

- [web-release-target-publish-system-design.md](/Users/nikki/projects/sugarengine/docs/proposals/web-release-target-publish-system-design.md)
- [024-plugin-architecture.md](/Users/nikki/projects/sugarengine/docs/adr/024-plugin-architecture.md)
- [ADR-SL-006](/Users/nikki/projects/sugarengine/src/plugins/sugarlang/docs/adr/006-ai-runtime-abstraction-and-deployment-portability.md)
