# ADR-SL-007: Browser-Local Data, Storage, and Cache Architecture

## Status

Proposed

## Context

Sugarlang needs multiple classes of data:

- authored overlay files
- runtime save state
- turn evidence and replay artifacts
- local caches
- optional relational storage
- optional vector or embedding storage

Because the browser is a first-class runtime target, the architecture must work within browser storage realities:

- storage quotas
- worker constraints
- performance considerations
- cross-browser differences

At the same time, the architecture must not block future server-side storage or hosted retrieval layers.

## Decision

Sugarlang will use a layered storage model that separates:

1. canonical authored overlay content
2. runtime save state
3. disposable or rebuildable local data services

The key decisions are:

1. Canonical authored Sugarlang content remains file-based under the game root.
2. Runtime save state remains plugin-namespaced and separate from authored content.
3. Browser-local databases are used for operational data services, not as the authoring source of truth.
4. The browser storage architecture should prefer technologies that are friendly to Workers and persistent local operation.
5. Vector and relational storage are capabilities, not assumptions about one specific product.

## Architectural Strategy

### 1. Keep Canonical Authoring Out of Operational Databases

This ADR follows ADR-SL-001:

- authored scenario and language overlay files are canonical
- local DBs are derived or operational

At the logical level, any operational indexes or caches should key data by the shared Sugarlang domain model:

- `questId`
- `scenarioId`
- `interactionId`
- `turnId`
- `lexicalEntryId`

This distinction is critical for portability and source control.

### 2. Use the Right Store for the Right Class of Data

High-level storage classes:

- **authored content**
  - human-readable files under the game root
- **runtime save state**
  - plugin-owned namespaced save payloads
- **large persistent browser-local operational data**
  - OPFS-backed storage
- **transactional local relational data**
  - SQLite WASM or another embedded browser-friendly DB
- **optional richer local relational/vector workflows**
  - PGlite or equivalent, when Postgres semantics are justified
- **smaller structured caches**
  - IndexedDB or similar browser-native storage

### 3. OPFS Is the Preferred Browser-Local Persistence Target for Larger Artifacts

The File System API and OPFS are especially relevant because they are designed for origin-private persistent storage and are available in Workers.[1]

SQLite's WASM docs are even more specific:

- SQLite WASM documents OPFS-backed persistence as a core storage option for browser databases[2][3]

This makes OPFS an appropriate default location for:

- larger local databases
- replay bundles
- model or analyzer caches where browser policies allow

### 4. SQLite WASM Is a Strong Baseline for Local Relational State

SQLite WASM is a strong browser-compatible baseline because:

- it is mature
- it supports browser persistence
- it can use OPFS-backed storage[2][3]

That makes it well-suited for:

- turn evidence indexes
- replay query support
- learner analytics caches
- lightweight vector metadata or retrieval bookkeeping

### 5. PGlite Is a Reasonable Optional Local Postgres Pattern

PGlite documents:

- browser operation
- IndexedDB persistence
- support for extensions including `pgvector`[4]

This makes it a legitimate option when Postgres semantics or `pgvector`-based local workflows are specifically valuable.

However, it should remain optional.

Sugarlang should not require a full Postgres mental model for all browser deployments.

### 6. Vector Storage Should Stay Pluggable

The architecture should treat vector retrieval as a capability with multiple possible backends:

- small local vector indexes alongside relational metadata
- browser-local pgvector via PGlite
- future server-side vector stores

The important architectural rule is:

vector storage must not become the canonical home of authored pedagogical meaning.

It is an operational index, not the authoring source of truth.

## Why This Supports the Product and Use Cases

This decision supports:

- browser-first play
- local persistence of learner state and evidence
- offline or mostly-offline operation
- AI-assisted authoring without database lock-in
- future retrieval or replay features without rewriting the authoring model

It also keeps the simplest cases simple:

- many beginner and deterministic use cases do not need any heavy local DB beyond normal save state

## Comparable Product Patterns and Research Basis

Comparable products do not usually expose their internal storage design, but their public product behavior suggests:

- browser and mobile clients need reliable local persistence
- review and progress systems require durable local state
- AI or adaptive features benefit from cached assets and reusable local signals

The strongest source-backed technical patterns here are from browser and embedded database ecosystems rather than from learning apps:

- MDN documents OPFS as a browser-local, origin-private storage endpoint optimized for performance and Worker use.[1]
- SQLite WASM documents persistent browser storage options including OPFS.[2][3]
- PGlite documents a browser-local WASM Postgres option with IndexedDB persistence and `pgvector` support.[4]

## Alternatives Considered

### 1. Make SQLite the Canonical Authored Store

Rejected.

Why:

- poor authoring ergonomics
- poor git review ergonomics
- bad fit for chat-based generation and patching

### 2. Use Only IndexedDB for Everything

Rejected as the preferred long-term pattern.

Why:

- harder fit for larger database artifacts
- fewer direct operational patterns for SQLite-style persistence
- less aligned with OPFS-optimized embedded DB options

### 3. Require PGlite Everywhere

Rejected.

Why:

- too heavy a baseline assumption
- unnecessary for many use cases
- relational/vector needs vary by deployment

## Technology and Pattern Options

### Strong Baseline Choices

- OPFS for large browser-local persistence[1]
- SQLite WASM for embedded transactional local storage[2][3]
- IndexedDB for smaller caches and compatibility-friendly storage[4]

### Optional Advanced Choice

- PGlite when local Postgres semantics or pgvector materially help the product[4]

This ADR intentionally avoids mandating a single vector technology.

## Future-Compatible Growth Path

### Commercial API Future

If hosted AI becomes important, the local storage architecture still matters:

- for learner state
- for offline progress
- for cached pedagogical artifacts
- for replay and review

Hosted inference does not remove the need for strong local storage.

### Self-Hosted Server Future

A self-hosted system may later centralize:

- embeddings
- search
- large-scale analytics

But the local browser stack should still retain enough state for responsive play and offline continuity.

### Hybrid Future

The most likely long-term architecture is hybrid:

- canonical authored files in the game root
- local operational stores for play and cache
- optional server stores for sync, analytics, or large retrieval

This ADR is written to support that without forcing it.

## Consequences and Tradeoffs

Positive:

- strong browser-first fit
- keeps authoring and operations separate
- allows local relational and vector options without lock-in
- supports offline or degraded-online play

Tradeoffs:

- more than one storage class to reason about
- browser storage quotas and compatibility must be handled
- DB lifecycle and rebuild rules must be clear

## Sources

[1] MDN, "File System API" and "Origin private file system"  
[https://developer.mozilla.org/en-US/docs/Web/API/File_System_API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)  
[https://developer.mozilla.org/docs/Web/API/File_System_API/Origin_private_file_system](https://developer.mozilla.org/docs/Web/API/File_System_API/Origin_private_file_system)

[2] SQLite WASM documentation index  
[https://www.sqlite.org/wasm](https://www.sqlite.org/wasm)

[3] SQLite WASM, "Persistent Storage Options"  
[https://sqlite.org/wasm/doc/tip/persistence.md](https://sqlite.org/wasm/doc/tip/persistence.md)

[4] PGlite, "What is PGlite"  
[https://pglite.dev/docs/about](https://pglite.dev/docs/about)
