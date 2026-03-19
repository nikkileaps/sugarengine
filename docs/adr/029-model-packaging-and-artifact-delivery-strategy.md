# ADR 029: Model Packaging and Artifact Delivery Strategy

## Status

Proposed

## Context

A published game with a hosted backend has two very different artifact families:

1. game/content artifacts used by the client,
2. model/runtime artifacts used by backend inference services.

Those artifacts have different:

- ownership,
- deployment paths,
- versioning concerns,
- failure modes,
- runtime hosts.

Those artifacts also cross a repository boundary:

- SugarEngine owns export/scaffolding conventions,
- the game repository owns release metadata and deployment automation for a specific game.

If these families are mixed carelessly, the system becomes hard to reason about and hard to release safely.

## Decision

The system will keep content artifacts and model artifacts separate.

For the first hosted release, the preferred posture is:

- bundle only the selected v1 model set required for that deployed game/environment,
- keep that bundled model/runtime payload within a conservative practical image budget,
- move model artifacts out of the image once model size or rollout behavior exceeds that budget.

### Content Artifacts

Content artifacts are:

- exported game data,
- staged assets,
- static Sugarlang content,
- static frontend bundles.

These are frontend/CDN artifacts.

### Model Artifacts

Model artifacts are:

- generation model files,
- embedding model files,
- supporting tokenizer/config/runtime assets used by backend inference services.

These are backend/runtime artifacts.

For the first hosted release, model artifacts will be versioned and deployed with the backend image rather than treated as part of the game export.

The game repository release pipeline owns assembling and deploying both artifact families.
SugarEngine may scaffold the structure, but it does not become the production artifact authority for a game release.

This image-bundled posture is acceptable only for the currently selected v1 model set.

It is not a blanket rule that all future model tiers or larger artifacts should live in the container image indefinitely.

## Domain Relationships

### Editor and Game Export

The editor owns creation of game content.

It does not own backend model packaging.

### Game Repository Release Pipeline

The game repository owns:

- release metadata tying frontend and backend artifacts together,
- environment-specific deployment selection,
- build automation that publishes both artifact families.

### CDN Frontend

The CDN owns delivery of:

- frontend application bundles,
- game exports,
- static content artifacts.

It does not own generation/embedding model deployment.

### `GenerationService`

The `GenerationService` owns which generation artifacts it requires.

That service may be locally packaged in v1, but the artifact strategy should not assume that `GenerationService` is forever tied to one local runtime technology.

### `EmbeddingsService`

The `EmbeddingsService` owns which embedding artifacts it requires.

That service may be locally packaged in v1, but the artifact strategy should not assume that `EmbeddingsService` is forever tied to ONNX or to one deployment topology.

## Size and Packaging Guardrail

The architecture should treat image-bundled model delivery as a bounded v1 convenience, not as an unlimited scaling strategy.

### Preferred v1 Rule

Bundle the active generation and embedding artifacts into the backend image only when:

- the deployed model set is the single selected v1 set for that environment,
- image size remains within a conservative practical operating budget,
- rollout/import/deploy latency remains acceptable for the team.

### Guardrail Trigger

The architecture should stop treating image-bundled models as the default once any of the following becomes true:

- the selected model payload grows beyond a practical image budget for routine deploys,
- more than one large model tier needs to be shipped in the same image,
- rollout time becomes operationally painful,
- environment-specific model swaps become common enough that image rebuilds are the wrong delivery mechanism.

For the current architecture, a useful practical warning threshold is:

- approximately `5 GB` of model/runtime payload in the image

This is not a hard platform limit.
It is an operational design guardrail.

### Post-Guardrail Direction

Once the guardrail is crossed, model artifacts should move out of the image and into external artifact storage with explicit versioning.

For the Google Cloud deployment path, the preferred next step is:

- container image in Artifact Registry,
- model artifacts in Cloud Storage or another explicit artifact store,
- release metadata binding the deployed backend revision to exact model artifact versions.

## Plain-Language Algorithms

### Artifact Compatibility Evaluation

In plain language:

1. The backend release declares which model/artifact versions it requires.
2. On startup, the backend checks that those artifacts are present and readable.
3. If the required artifacts are not available, health must degrade explicitly instead of pretending success.
4. The service may still start in a degraded mode only if the product policy explicitly allows that service to degrade.

### Release Packaging Rule

In plain language:

1. SugarEngine prepares the game export and release inputs for the game repository.
2. The game repository builds the frontend artifacts for CDN delivery.
3. The game repository either:
   - builds the backend image with the selected backend model/runtime artifacts bundled, or
   - binds the backend image to externally stored versioned model/runtime artifacts.
4. The two release products are versioned independently but linked through the same release metadata.

This prevents “frontend deploy succeeded” from implying “backend inference artifacts are correct.”

## Data Flow

### Frontend Artifact Flow

1. Game export is generated.
2. Frontend bundles are built.
3. Content and frontend artifacts are deployed to the CDN target.

### Backend Artifact Flow

1. Backend release selects a concrete generation artifact set.
2. Backend release selects a concrete embedding artifact set.
3. Backend image is either built with those artifacts bundled or configured to load those exact external artifacts.
4. Backend image is deployed to Cloud Run.

## Versioning Rules

### Required

- frontend artifact version and backend artifact version must both exist in release metadata,
- backend health must reflect artifact availability,
- artifact compatibility cannot depend on “latest” lookup at runtime.

### Preferred

- generation and embedding artifact versions are independently visible,
- backend diagnostics expose active artifact versions,
- staged and production environments may use different versions intentionally, but never accidentally.

## Consequences

### Positive

- clearer release boundaries,
- easier rollback,
- easier diagnosis of artifact mismatch,
- cleaner separation between game content and backend inference runtime.

### Tradeoffs

- backend image size may grow,
- release packaging must manage more than one artifact family,
- model changes and content changes may deploy on different cadences.
- an external-artifact path eventually adds more release metadata and startup validation complexity.

## Rejected Alternatives

### 1. Put Model Artifacts Into the Game Export

Rejected because backend runtime artifacts are not client content artifacts.

### 2. Download “Latest” Model Artifacts at Backend Startup

Rejected because it weakens reproducibility and rollback.

### 3. Keep All Future Model Growth Inside the Container Image

Rejected because it turns model growth into deployment pain and makes rollout characteristics progressively worse.

### 4. Let the Editor Manage Backend Model Deployment

Rejected because model packaging belongs to backend release automation, not authoring UX.

## References

- [web-release-target-publish-system-design.md](/Users/nikki/projects/sugarengine/docs/proposals/web-release-target-publish-system-design.md)
- [027-game-api-service-boundary-and-module-contract.md](/Users/nikki/projects/sugarengine/docs/adr/027-game-api-service-boundary-and-module-contract.md)
