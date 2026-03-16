# SugarAgent Runtime and Embeddings: Mental Model

## Purpose

This document explains the local-model runtime shape in plain software-engineering terms.

It exists because SugarAgent now uses two different model capabilities:

1. a local chat/generation model for phrasing structured NPC replies,
2. a local embedding model for semantic interpretation and retrieval.

Those are different tools with different responsibilities.

## The Short Version

SugarAgent now has two model-backed paths:

1. `generateStructured(...)`
   - uses the local chat model,
   - produces structured reply candidates,
   - is part of natural-language realization.
2. `embed(texts[])`
   - uses a local embedding model,
   - produces vectors for semantic similarity,
   - helps interpretation and retrieval.

Important boundary:

- the chat model helps say things naturally,
- the embedding model helps find semantically relevant meanings and lore,
- neither one owns factual truth,
- evidence governance and validation still decide what the NPC is allowed to say.

## ONNX, MiniLM, and the Tokenizer

### ONNX Runtime

ONNX Runtime is the local inference engine for embeddings in preview/dev.

It is not itself a language model. It is the runtime that loads and executes the embedding model.

Current implementation:

- [local-embedding-runtime.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/runtime/local-embedding-runtime.ts)

### MiniLM

The embedding model currently bundled with SugarAgent is:

- `xenova/all-MiniLM-L6-v2`

The bundled assets include:

1. the ONNX model file,
2. tokenizer files,
3. vocabulary/config files.

Current bundle root:

- [all-MiniLM-L6-v2](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/runtime/bundle/embeddings/all-MiniLM-L6-v2)

### Tokenizer

The tokenizer turns input text into token IDs the embedding model understands.

Example mental model:

1. raw text: `What do you do?`
2. tokenizer: normalize text and convert it into token IDs
3. embedding model: turn token IDs into a dense vector
4. SugarAgent: compare vectors with cosine similarity

That vector is not an answer. It is a representation of the text in semantic space.

## What the Embedding Model Is For

The embedding model is used for:

1. semantic query interpretation,
2. vector-assisted lore retrieval,
3. future semantic memory/reference features when policy allows.

It is not used for:

1. deciding canon,
2. bypassing ownership or disclosure rules,
3. generating NPC dialogue directly,
4. replacing evidence-first validation.

## Where Embeddings Fit in the Turn Pipeline

High level:

1. player text comes in,
2. SugarAgent computes `QueryInterpretation`,
3. SugarAgent may use exemplar similarity to improve interpretation,
4. retrieval uses lexical/entity retrieval plus vector similarity,
5. governance/validation decide what evidence is actually usable,
6. the chat model realizes the approved plan.

So embeddings help with:

- `What does the player probably mean?`
- `What lore is semantically close to this meaning?`

They do not answer:

- `What is allowed to be said as true?`

That remains an evidence/governance question.

## Chat Model vs Embedding Model

### Chat model

Used by:

- `generateStructured(...)`

Responsibility:

- produce natural structured reply candidates

Current live preview/runtime path:

- [runtime.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/session/runtime.ts)
- [LocalLLMProvider.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/providers/llm/LocalLLMProvider.ts)

### Embedding model

Used by:

- `embed(texts[])`

Responsibility:

- semantic similarity only

Current live preview/runtime path:

- [local-embedding-runtime.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/runtime/local-embedding-runtime.ts)

## CPU/GPU Note

Current preview/dev implementation is CPU-only for both local paths:

1. embeddings use ONNX Runtime with `executionProviders: ['cpu']`,
2. the local llama invocation currently passes `--device none`.

This means the new embedding work is not intended to use the GPU in preview/dev.

If the machine becomes unstable, likely suspects are:

1. CPU pressure,
2. RAM pressure,
3. renderer/driver instability outside the embedding path,
4. future custom runtime arguments that override the default device behavior.

## Degraded Mode

If embeddings are unavailable or fail:

1. SugarAgent does not return fake zero vectors as success,
2. interpretation falls back to deterministic lexical behavior,
3. retrieval falls back to lexical/entity behavior,
4. diagnostics report degraded mode explicitly.

This is an architectural requirement from [ADR-SA-033](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/docs/adr/033-local-embedding-runtime-and-vector-artifact-contract.md).

## How to Read the Logs

Relevant high-level logs:

1. `[sugaragent][grounding]`
   - overall route/interpretation/validation summary
2. `[sugaragent][semantic]`
   - whether exemplar-assisted interpretation ran and changed the turn interpretation
3. `[sugaragent][retrieval]`
   - lexical/vector candidate counts, merged selections, degraded mode, and model id

Healthy Phase B examples usually show:

1. `embedding=ok`
2. `model=xenova/all-MiniLM-L6-v2`
3. `sem=attempted` or `sem=changed`
4. non-zero lexical/vector source counts on retrieval turns

## Runtime Contract

The runtime contract lives in:

- [types.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/runtime/types.ts)

Key distinction:

1. `generateStructured(...)` is the generative path,
2. `embed(texts[])` is the semantic vector path.

That separation is intentional and should be preserved.

## What Comes Next

This document covers the completed Plan 003 runtime shape.

Follow-on work moves to:

- [Plan 004: Referential Depth and Native Embedding Follow-On](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/docs/plans/004-referential-depth-and-native-embedding-follow-on.md)

That future work is about:

1. deeper multi-turn referent resolution,
2. richer topic/reference continuity,
3. native packaged embedding parity.
