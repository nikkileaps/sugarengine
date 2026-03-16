# ADR-SA-033: Local Embedding Runtime and Vector Artifact Contract

## Status

Accepted

## Date

2026-03-15

## Context

ADR-SA-029 already assumes optional vector retrieval when an embedding backend is available, but the current runtime path does not provide a real embedding implementation.

Today:

1. `LocalRuntimeBridge` exposes `embed(texts[])`,
2. the HTTP bridge forwards `embed`,
3. preview middleware returns zero vectors,
4. native Tauri runtime also returns zero vectors,
5. lore ingestion does not yet emit vector artifacts for runtime retrieval.

This means vector retrieval and semantic exemplar scoring remain conceptual rather than operational.

At the same time, SugarAgent is now reaching the limit of surface-text-only matching for:

1. semantic retrieval of paraphrased lore,
2. facet classification in `QueryInterpretation`,
3. robust handling of short or naturally phrased questions like `What do you do?`.

For current project scale, the missing capability is not an ANN database. The missing capability is a real local embedding service and stable vector artifacts.

## Decision

Make `embed(texts[])` a real local runtime capability and use it for:

1. vector retrieval over precomputed lore chunk embeddings,
2. optional semantic similarity in `QueryInterpretation`,
3. future memory/topic semantic matching where policy allows.

The implementation must respect existing plugin boundaries:

1. SugarAgent owns retrieval and interpretation policy,
2. the runtime bridge owns embedding inference transport,
3. SugarEngine may host or broker runtime services but does not own retrieval policy,
4. preview and native paths must expose the same logical `embed()` capability even if implementations differ.

## Decision Details

### 1) Keep the existing runtime contract

The public runtime capability remains:

```ts
interface LocalRuntimeBridge {
  health(request?: RuntimeHealthRequest): Promise<RuntimeHealthStatus>;
  loadModel(modelId: string): Promise<void>;
  generateStructured(request: RuntimeGenerateStructuredRequest): Promise<RuntimeGenerateStructuredResponse>;
  embed(texts: string[]): Promise<number[][]>;
  unloadModel(modelId: string): Promise<void>;
}
```

No parallel embedding side-channel should be introduced in plugin code.

### 2) Use a separate small embedding model

Embeddings should come from a dedicated lightweight sentence-embedding model, not from the chat generation model.

Rationale:

1. better latency predictability,
2. better fit for batch embedding,
3. easier future native parity,
4. avoids coupling retrieval quality to chat prompt behavior.

The exact model may change over time, but it must satisfy:

1. local/offline-capable,
2. small enough for preview/dev and future packaged use,
3. stable vector dimensionality,
4. acceptable quality for short dialogue-like inputs.

### 3) Implement the runtime, not the math package stack

SugarAgent should own:

1. normalized text preparation,
2. vector caching,
3. cosine similarity scoring,
4. merge/rerank policy,
5. artifact formats and compatibility rules.

SugarAgent should not invent:

1. embedding inference kernels,
2. low-level tensor runtimes,
3. vector model implementations.

Those belong to the embedding runtime backend.

### 4) Runtime implementation strategy by environment

The preferred embedding runtime substrate is ONNX Runtime.

That means:

1. ONNX Runtime is the architectural anchor,
2. preview/dev should use Node-side ONNX Runtime,
3. future browser fallback may use ONNX Runtime Web if needed,
4. future native parity should target the same ONNX model family and vector contract.

High-level wrappers may be useful for experiments, but they are not the architectural anchor and must not define the long-term contract.

#### Preview / dev

Preview should provide a real embedding service in the local runtime endpoint currently hosted from `vite.config.ts`.

Recommended runtime substrate:

1. Node-side ONNX Runtime,
2. singleton loaded embedding session,
3. batch `embed(texts[])` support,
4. cache by normalized text and model version.

Important preview rule:

Preview must not depend on packed export artifacts or export-only plugin bundles for embeddings. It should operate against the same preview lore sources already used by SugarAgent preview flows.

#### Native / packaged

Native desktop/mobile parity should expose the same `embed(texts[])` contract behind the native runtime bridge.

This ADR does not require native parity in the first implementation phase, but it requires that preview and native share:

1. model identifier semantics,
2. vector dimensionality,
3. artifact compatibility expectations,
4. error and degraded-mode behavior.

### 5) Facet exemplars live in plugin interpretation config

Facet exemplars are part of SugarAgent interpretation policy, not project lore.

Therefore they should live in plugin-managed interpretation config, for example:

1. checked-in source data,
2. generated plugin-local cache artifacts keyed by embedding model id,
3. optional future project overrides if explicitly supported.

Facet exemplars must not be treated as canonical lore artifacts by default.

### 6) Add vector artifacts to lore ingestion

Lore ingestion must emit vector artifacts alongside chunk metadata.

Recommended output shape:

```ts
interface LoreVectorManifest {
  schemaVersion: 1;
  embeddingModelId: string;
  embeddingDimension: number;
  artifactVersion: string;
  sourceCommit: string;
}

interface LoreChunkVectorRecord {
  chunkId: string;
  vectorOffset: number;
  vectorLength: number;
}
```

Recommended generated files:

1. `manifest.json`
2. `chunks.json`
3. `facts.json`
4. `chunk-vectors.json` or `chunk-vectors.bin`
The first implementation may use JSON vectors for simplicity. Binary packing is an optimization, not an initial requirement.

### 7) Retrieval strategy stays simple initially

For current scale, the initial vector retrieval implementation should be a flat cosine scan over all chunk vectors in scope.

That means:

1. no ANN index initially,
2. no pgvector dependency,
3. no HNSW/FAISS complexity in the first cut,
4. deterministic and debuggable retrieval behavior.

This is acceptable because:

1. current lore scale is small,
2. the main problem is semantic recall, not retrieval-at-scale,
3. correctness and observability matter more than index sophistication.

### 8) Embeddings are advisory, not authoritative

Vector similarity may improve ranking and interpretation confidence, but it does not override:

1. entity filters,
2. self/world/other ownership boundaries,
3. epistemic access and disclosure policy,
4. evidence governance and validation.

The runtime must never answer solely because vector similarity is high.

### 9) `QueryInterpretation` uses exemplar similarity optionally

Once embeddings are available, interpretation may compare the cleaned focus text against a small set of facet exemplars.

Example:

```ts
interface FacetExemplar {
  facet: 'occupation' | 'location' | 'current_activity' | 'background';
  text: string;
  vector: number[];
}
```

Example use:

1. `What do you do?` compared against `occupation` exemplars,
2. `What are you doing?` compared against `current_activity` exemplars,
3. lexical and syntax scoring still remain active,
4. embedding similarity boosts or lowers candidates rather than replacing deterministic scoring.

### 10) Degraded mode is mandatory

If embeddings are unavailable or incompatible:

1. `embed()` must return a structured error or degraded status, not silent zeros presented as success,
2. SugarAgent falls back to lexical-only interpretation and retrieval,
3. diagnostics must state that vector assistance was unavailable.

Silent fake vectors are forbidden once this ADR is implemented.

## Algorithm Sketch

### Ingestion

```ts
async function buildLoreVectorArtifacts(chunks: LoreChunk[]): Promise<LoreVectorBundle> {
  const texts = chunks.map(toEmbeddingText);
  const vectors = await embeddingRuntime.embed(texts);
  return {
    manifest: {
      schemaVersion: 1,
      embeddingModelId: EMBEDDING_MODEL_ID,
      embeddingDimension: vectors[0]?.length ?? 0,
      artifactVersion: computeArtifactVersion(chunks),
      sourceCommit: currentSourceCommit(),
    },
    vectors: chunks.map((chunk, index) => ({
      chunkId: chunk.chunkId,
      vector: vectors[index],
    })),
  };
}
```

### Query-time retrieval

```ts
async function maybeRunVectorRetrieval(query: string, snapshot: RetrievalSnapshot): Promise<RetrievalCandidate[]> {
  if (!snapshot.vectorArtifacts || !snapshot.embeddingRuntimeAvailable) return [];
  const [queryVector] = await runtime.embed([toEmbeddingText(query)]);
  if (!queryVector) return [];

  return snapshot.vectorArtifacts.vectors
    .filter((entry) => passesScopeFilter(entry.chunkId, snapshot))
    .map((entry) => ({
      chunkId: entry.chunkId,
      vectorScore: cosineSimilarity(queryVector, entry.vector),
    }))
    .filter((entry) => entry.vectorScore >= snapshot.minVectorThreshold)
    .sort((a, b) => b.vectorScore - a.vectorScore)
    .slice(0, snapshot.maxVectorCandidates);
}
```

## Engine Boundary

SugarEngine may host the preview runtime endpoint or native bridge and may provide lifecycle hooks for runtime services.

SugarEngine does not own:

1. vector merge policy,
2. retrieval thresholds,
3. facet exemplar ontology,
4. interpretation or retrieval governance decisions.

Those remain SugarAgent responsibilities.

## Packaging Boundary

Packed `authoring.bundle.json` and export-time packaging remain separate concerns.

Embedding support for preview must not depend on export-only artifacts unless the preview runtime explicitly consumes them. This boundary must be documented in code comments and diagnostics to prevent repeated preview/export confusion.

## SugarLang Compatibility

Embedding-backed interpretation and retrieval must remain usable:

1. with no SugarLang plugin,
2. with SugarAgent-local adaptation only,
3. with future SugarLang adaptation context supplied by the host.

Vector retrieval is about meaning matching, not language-learning control.

## Consequences

Positive:

1. semantic retrieval becomes real rather than stubbed,
2. interpretation becomes less dependent on phrase patches,
3. preview and native runtime contracts stay aligned,
4. the system moves toward a real local/offline solution.

Tradeoffs:

1. runtime/model lifecycle complexity increases,
2. ingestion must manage vector artifact compatibility,
3. diagnostic surface area increases,
4. packaged/native parity still requires a follow-on implementation after preview.

## Acceptance Criteria

1. Preview `embed(texts[])` returns real non-zero vectors from a local runtime service.
2. Lore ingestion emits compatible vector artifacts for chunks.
3. Vector retrieval can run in local preview without cloud services.
4. `QueryInterpretation` can optionally use exemplar similarity without changing plugin boundaries.
5. ONNX Runtime is the primary embedding substrate in preview/dev rather than an incidental wrapper choice.
6. If embeddings are unavailable, SugarAgent degrades explicitly to lexical-only mode with diagnostics.
