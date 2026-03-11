# ADR-SL-006: AI Runtime Abstraction and Deployment Portability

## Status

Proposed

## Context

Sugarlang and SugarAgent must support a browser-based game where:

- some features run fully in the browser
- a local LLM may run in-browser or via a local sidecar/runtime
- local databases may also be in-browser

At the same time, the architecture must not block future movement toward:

- commercial API models such as OpenAI
- self-hosted server inference

This means the architecture cannot hardcode:

- a single local runtime technology
- a single prompt protocol
- a single deployment topology

It also cannot violate the security rules of commercial API providers by exposing API keys in the browser.

## Decision

Sugarlang and SugarAgent will use a deployment-neutral AI runtime abstraction with browser-local execution as a first-class default and commercial or self-hosted server inference as future-compatible variants.

The key decisions are:

1. AI usage is expressed through capability-based contracts, not by binding directly to one vendor or one runtime.
2. Browser-local inference remains a first-class architecture target.
3. Commercial API use is only allowed through a server-side boundary; provider secrets must never live in browser code.
4. Self-hosted server inference should prefer OpenAI-compatible interfaces where possible.
5. Structured outputs, tool/use contracts, pinned model versions, and evals are mandatory guardrails when external or hosted models are used.

## Architectural Strategy

### 1. Separate AI Capabilities from Deployment Topology

The architecture should think in capabilities such as:

- structured generation
- constrained rewriting
- classification
- embeddings
- transcription
- explanation

Those capabilities should operate over the shared Sugarlang domain model:

- quest-linked scenarios
- derived interactions
- target-language interaction overlays
- shared vocabulary entries and grounding links

Those capabilities may be served by:

- local browser models
- local sidecar models
- commercial APIs
- self-hosted servers

The capability contract stays stable.

The deployment topology may change.

### 2. Browser-Local Execution Is a First-Class Default

For browser-local LLM execution, WebLLM is an important reference technology:

- it runs LLMs in-browser
- uses WebGPU
- exposes an OpenAI-compatible API shape
- supports web workers for UI isolation[1]

For smaller analyzers and edge inference, ONNX Runtime Web and Transformers.js are strong browser-compatible options:

- ONNX Runtime Web supports WebAssembly and WebGPU execution paths across browsers, with WebGPU recommended over WebGL where available[2]
- Transformers.js runs models directly in the browser and uses ONNX Runtime under the hood[3]

This suggests a clean architectural split:

- larger generative models: runtime adapter
- smaller evaluators and analyzers: browser-local ML pipeline where useful

### 3. Commercial API Use Must Sit Behind a Server Boundary

OpenAI's API documentation is explicit:

- API keys are secrets
- they must not be exposed in client-side code
- they should be loaded from server-side secret management[4]

Therefore, any future commercial model use must go through a server-side gateway or proxy.

The browser should never call a commercial provider directly with embedded credentials.

### 4. Self-Hosted Server Inference Should Prefer OpenAI-Compatible Serving

Both vLLM and llama.cpp expose OpenAI-compatible server patterns:

- vLLM documents an OpenAI-compatible server and positions it as callable by the official OpenAI client with a different `base_url`[5]
- llama.cpp documents `llama-server` as a lightweight OpenAI-compatible HTTP server[6]

That makes OpenAI-compatible transport a strong architectural compatibility target for server-hosted inference.

This is valuable because it:

- reduces vendor lock-in
- makes switching between self-hosted and commercial paths easier
- allows the same provider abstraction to target multiple backends

### 5. External Model Variability Must Be Contained

OpenAI's docs also note that model behavior can vary across snapshots and recommend pinned model versions and evals.[4]

That recommendation generalizes beyond OpenAI.

Therefore, any hosted inference path should treat:

- model identity
- prompt contract
- schema contract
- eval coverage

as part of the architecture, not as incidental implementation detail.

## Why This Supports the Product and Use Cases

This ADR supports:

- browser-first deployment for beginner and deterministic flows
- optional richer AI behavior for advanced use cases
- future ability to use better hosted models without rewriting core Sugarlang contracts
- future ability to self-host when cost, privacy, or control make that preferable

It also prevents a dangerous trap:

the architecture should not become so browser-local-specific that it cannot later use hosted inference, and it should not become so cloud-centric that browser-local execution becomes impossible.

## Comparable Product Patterns and Research Basis

Current language-learning products are already exploring multiple AI deployment shapes:

- Duolingo explicitly uses GPT-4 for AI-powered learning features such as Roleplay and Video Call, while still keeping expert-authored scenario structure and review loops.[7]
- Babbel describes AI-powered speaking practice integrated into an expert-designed course architecture rather than replacing it wholesale.[8]

The comparable product lesson is:

- AI capability matters
- deployment topology may evolve
- pedagogy and product contracts should not be fused to one model host

## Alternatives Considered

### 1. Hardcode One Local LLM Runtime

Rejected.

Why:

- blocks future hosted models
- too brittle for browser capability variation

### 2. Hardcode One Commercial API

Rejected.

Why:

- key handling requires server infrastructure
- creates vendor lock-in
- makes offline/local modes weaker

### 3. Build a Custom Server Protocol Instead of Using OpenAI-Compatible Patterns

Rejected as the primary portability strategy.

Why:

- increases integration cost
- reduces interoperability
- makes future backend swaps harder

Custom additions may still exist, but the baseline compatibility story should stay simple.

## Technology and Pattern Options

### Browser-Local Options

- WebLLM for browser-local generative inference[1]
- ONNX Runtime Web for browser-local inference across WASM and WebGPU[2]
- Transformers.js for browser-local pipelines and analyzers[3]

### Commercial API Option

- OpenAI Responses/API stack, accessed through a server boundary and using structured output and tool contracts where appropriate[4][9]

### Self-Hosted Server Options

- vLLM OpenAI-compatible server[5]
- llama.cpp `llama-server`[6]

The architecture should remain portable across all of them.

## Future-Compatible Growth Path

### Browser-Local to Commercial API

A provider can move from local runtime to commercial API without changing:

- scenario and interaction semantics
- response contracts
- learner-state contracts
- Sugarlang overlay storage

Only the runtime adapter and security boundary change.

### Browser-Local to Self-Hosted Server

The same is true for self-hosted inference.

OpenAI-compatible server patterns reduce migration friction.

### Hybrid Models

Future products may mix modes, for example:

- deterministic and local for beginners
- hosted explanation for advanced conversations
- self-hosted embeddings for retrieval

This ADR is compatible with hybrid deployment as long as capability contracts stay stable.

## Consequences and Tradeoffs

Positive:

- preserves browser-first product goals
- keeps cloud and server options open
- reduces vendor lock-in
- supports gradual future expansion without architectural resets

Tradeoffs:

- requires disciplined abstraction boundaries
- lowest-common-denominator risk must be managed carefully
- commercial API use introduces server security and cost concerns
- self-hosting introduces operational burden

## Sources

[1] WebLLM documentation  
[https://webllm.mlc.ai/docs/](https://webllm.mlc.ai/docs/)  
[https://webllm.mlc.ai/docs/user/get_started.html](https://webllm.mlc.ai/docs/user/get_started.html)

[2] ONNX Runtime Web documentation  
[https://onnxruntime.ai/docs/get-started/with-javascript/web.html](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)

[3] Hugging Face Transformers.js documentation  
[https://huggingface.co/docs/transformers.js/main/en/index](https://huggingface.co/docs/transformers.js/main/en/index)

[4] OpenAI API Overview  
[https://developers.openai.com/api/reference/overview](https://developers.openai.com/api/reference/overview)

[5] vLLM OpenAI-Compatible Server  
[https://docs.vllm.ai/en/latest/serving/openai_compatible_server/](https://docs.vllm.ai/en/latest/serving/openai_compatible_server/)

[6] llama.cpp README and `llama-server`  
[https://github.com/ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp)

[7] Duolingo, "Introducing Duolingo Max, a learning experience powered by GPT-4"  
[https://blog.duolingo.com/duolingo-max/](https://blog.duolingo.com/duolingo-max/)

[8] Babbel, "Introducing Babbel Speak: AI-Powered Confidence for Travel, Futbol, and Everyday Life"  
[https://www.babbel.com/press/en-us/releases/babbel-speak](https://www.babbel.com/press/en-us/releases/babbel-speak)

[9] OpenAI Responses API reference  
[https://platform.openai.com/docs/api-reference/responses/list](https://platform.openai.com/docs/api-reference/responses/list)
