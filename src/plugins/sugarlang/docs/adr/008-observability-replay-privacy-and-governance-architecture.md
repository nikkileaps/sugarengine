# ADR-SL-008: Observability, Replay, Privacy, and Governance Architecture

## Status

Proposed

## Context

Sugarlang is not just a content system.

It is:

- a learning system
- an adaptive system
- optionally an AI-assisted system

That means it produces risk in multiple dimensions:

- pedagogical mis-leveling
- incorrect or low-quality feedback
- privacy issues around learner transcripts
- runtime behavior drift across model backends
- difficulty debugging why a learner saw a specific experience

If observability, replay, privacy, and governance are not first-class architecture decisions, the product will be hard to trust and hard to improve.

## Decision

Sugarlang will treat observability, replay, privacy, and governance as part of the deployed architecture rather than as post-hoc tooling.

The key decisions are:

1. Every conversational turn should produce normalized traceable artifacts.
2. Replay must work from normalized conversation envelopes rather than provider-specific raw logs alone.
3. Learner-performance data is architecturally more sensitive than generic gameplay telemetry.
4. Retention, export, and redaction must be explicit product capabilities.
5. AI and evaluator quality monitoring must be supported by the architecture.

## Architectural Strategy

### 1. Normalized Turn Tracing

Each turn should be traceable across:

- provider selection
- middleware execution
- evaluator path
- learner-state updates
- persistence
- host action decisions
- target-language and support-language context
- support-language policy path

This is essential because Sugarlang is explicitly a multi-layer pipeline.

### 2. Replay Is a First-Class Product Artifact

Replay artifacts should be built from normalized turn envelopes and evidence records.

That allows:

- deterministic scripted scenes
- SugarAgent-assisted scenes
- hybrid scenes
- English-support/Spanish-target runs
- Spanish-support/English-target runs

to all be replayed and scored using the same evaluation harness.

### 3. Separate Learning Telemetry from Generic Game Telemetry

Language-learning systems store data such as:

- learner responses
- support requests
- support-language scaffolds shown or consumed
- corrections
- evidence of difficulty or frustration

That is not equivalent to generic game analytics like:

- session length
- button click counts

The system should therefore use stricter governance boundaries for learning telemetry.

### 4. Privacy and Retention Policies Must Be Explicit

The architecture should assume:

- raw transcripts may contain personal information
- some exercises may be more sensitive than normal quest activity
- export should be configurable
- retention should be configurable
- redaction and deletion should be possible

### 5. Quality Monitoring Must Cover AI Variability

If AI-backed features are used, the architecture must be able to answer:

- which model produced this output
- which evaluator path accepted it
- which prompt/schema contract applied
- which support-language policy was active
- which user reports or corrections were attached to it

This is especially important when future commercial or hosted models are introduced.

## Why This Supports the Product and Use Cases

This directly supports:

- auditing why a beginner was mis-leveled
- diagnosing why a constrained-text response was rejected
- comparing scripted-only and SugarAgent-assisted outcomes
- protecting learner data while still supporting useful product analytics

It also supports the solo-creator workflow:

- if generated pedagogical content is wrong, the creator needs replayable evidence and clear traces

## Comparable Product Patterns and Research Basis

The strongest technical and governance references here are:

- NIST AI Risk Management Framework, which treats governance, measurement, and monitoring as part of responsible AI system design.[1]
- NIST Privacy Framework, which emphasizes privacy-by-design and scoped handling of personal data.[2]
- OpenTelemetry traces, which provide a strong model for cross-component execution tracing.[3]
- 1EdTech Caliper, which provides a useful model for learning-event semantics and future export compatibility.[4]

Comparable product signals support the need for operational feedback loops:

- Duolingo allows users to report inaccurate AI-generated responses in Duolingo Max, which is a concrete example of productized quality feedback for AI learning experiences.[5]
- Busuu warns that learner-submitted exercises are public in community workflows and advises users not to share sensitive information, which underscores the privacy sensitivity of language-learning data.[6]

## Alternatives Considered

### 1. Treat Logs as Enough

Rejected.

Why:

- raw logs are not a replay strategy
- provider-specific logs are not portable across architecture modes

### 2. Treat Learning Data as Normal Product Analytics

Rejected.

Why:

- learner responses are more sensitive
- free-form text may contain personal information
- governance needs are stricter

### 3. Add Evals Later

Rejected as an architecture stance.

Why:

- eval and replay shape the required data contracts now
- waiting would force poor observability retrofits later

## Technology and Pattern Options

Patterns favored by this ADR:

- OpenTelemetry-style spans and trace IDs[3]
- normalized event schemas for learner interactions[4]
- replay bundles derived from normalized turn artifacts
- explicit retention and redaction controls
- provider metadata attached to AI-backed outputs

These choices work for:

- fully local browser play
- hybrid local/server operation
- commercial API-backed operation

## Future-Compatible Growth Path

### Browser-Local AI

Tracing and replay should still exist even when inference is fully local.

The local nature of the model does not remove the need for:

- monitoring
- debugging
- learner-data governance

### Commercial API Future

If commercial APIs are used, observability becomes even more important because:

- outputs may drift across model snapshots
- latency and cost become operational concerns
- privacy boundaries become sharper

OpenAI's API docs explicitly recommend pinned model versions and evals for consistency, which aligns with this ADR.[7]

### Self-Hosted Server Future

Self-hosting does not remove the need for governance.

It merely shifts the operational surface area:

- serving metrics
- security
- multi-tenant privacy
- replay and audit

This ADR remains valid across all three futures.

## Consequences and Tradeoffs

Positive:

- stronger trust and debuggability
- better product calibration
- safer handling of learner data
- consistent replay across deployment modes

Tradeoffs:

- more metadata and tracing infrastructure
- more careful retention design
- more operational complexity than "just log it"

## Sources

[1] NIST, "AI Risk Management Framework"  
[https://www.nist.gov/itl/ai-risk-management-framework](https://www.nist.gov/itl/ai-risk-management-framework)

[2] NIST, "Privacy Framework"  
[https://www.nist.gov/privacy-framework](https://www.nist.gov/privacy-framework)

[3] OpenTelemetry, "Traces"  
[https://opentelemetry.io/docs/concepts/signals/traces/](https://opentelemetry.io/docs/concepts/signals/traces/)

[4] 1EdTech, "Caliper Analytics"  
[https://www.1edtech.org/standards/caliper-analytics](https://www.1edtech.org/standards/caliper-analytics)

[5] Duolingo, "Introducing Duolingo Max, a learning experience powered by GPT-4"  
[https://blog.duolingo.com/duolingo-max/](https://blog.duolingo.com/duolingo-max/)

[6] Busuu, "Where can I find exercises to complete?"  
[https://help.busuu.com/hc/en-us/articles/16746898571025-Where-can-I-find-exercises-to-complete](https://help.busuu.com/hc/en-us/articles/16746898571025-Where-can-I-find-exercises-to-complete)

[7] OpenAI API Overview  
[https://developers.openai.com/api/reference/overview](https://developers.openai.com/api/reference/overview)
