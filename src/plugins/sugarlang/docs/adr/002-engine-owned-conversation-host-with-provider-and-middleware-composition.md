# ADR-SL-002: Engine-Owned Conversation Host with Provider and Middleware Composition

## Status

Proposed

## Context

Sugarlang and SugarAgent must be separate plugins.

At the same time:

- Sugarlang must work with scripted dialogue alone
- SugarAgent must remain optional
- both plugins must be able to affect the same conversation experience when they are both enabled

That cannot be modeled cleanly if:

- plugins call each other directly
- the engine special-cases one plugin by name
- multiple plugins compete to "own" the same turn with no orchestration model

The current engine plugin surface is still a first-plugin-wins model around interaction resolution and agent-turn execution.

That legacy model is not sufficient for the final Sugarlang plus SugarAgent architecture.

It must be replaced by a host-owned conversation stack that can preserve existing scripted and SugarAgent behavior while moving both onto the same orchestration path.

The strategic architecture already points to an engine-owned conversation host, one turn provider, and ordered middleware. This ADR turns that into a formal architecture decision.

## Decision

SugarEngine will own the conversation orchestration layer.

That orchestration layer will distinguish between:

- **conversation providers**
- **conversation middleware**

The architectural rules are:

1. Exactly one provider owns turn production for a given turn.
2. Zero or more middleware components may wrap that provider execution in a defined engine-owned order.
3. `sugaragent` participates primarily as an optional conversation provider.
4. `sugarlang` participates primarily as conversation middleware and learning runtime.
5. The scripted dialogue system is exposed as an engine-owned provider.
6. Plugins must not call each other directly.
7. The engine is the only component that coordinates provider selection, middleware order, UI rendering, and deterministic host action execution.

## Architectural Strategy

### 1. The Engine Owns a Generic Conversation Host

The host is responsible for:

- session lifecycle
- provider selection
- middleware execution
- normalized turn envelopes
- response contract rendering
- deterministic host action gating
- transcript persistence

This keeps the engine generic and removes `sugaragent`-shaped logic from core runtime paths.

### 2. Provider Capability Is Distinct from Middleware Capability

This distinction is critical:

- a provider decides what the next conversational turn is
- middleware modifies or evaluates the environment around that turn

In Sugarlang's target architecture:

- scripted dialogue provider: engine-owned
- optional free-form provider: `sugaragent`
- pedagogy and learning middleware: `sugarlang`

### 3. Middleware Order Is Engine-Owned and Explicit

Middleware order must not be a side effect of plugin registration order.

The host should own a stage model similar to:

1. scene context hydration
2. learner and policy contribution
3. provider invocation
4. output validation or downgrade
5. post-turn analysis and persistence
6. telemetry and replay emission

The exact interfaces are deferred.

The ordering discipline is not.

### 4. All Paths Produce a Normalized Turn Envelope

Whether the turn came from:

- a fixed dialogue node
- a constrained scripted variant
- `sugaragent`

the rest of the system should receive a normalized turn envelope with:

- scene semantics
- rendered utterance payload
- response contract
- host action proposals
- diagnostics
- provenance when available

This is what makes Sugarlang provider-independent.

### 5. Middleware Contributes a Provider Input Constraint Bundle

The middleware-to-provider channel is part of the architecture, not a follow-on convenience.

The engine-mediated provider input bundle should be able to carry:

- scene semantics and communicative task
- target language and support language
- learner-band context and support dependence
- support-language policy
- response-contract requirements
- grounding scope and prioritized referents
- failure and recovery posture
- trace identity and diagnostics context

This bundle should distinguish between:

- hard constraints the provider must respect
- advisory preferences the provider should follow when capable

This is the mechanism by which Sugarlang influences SugarAgent without any direct plugin-to-plugin call path.

### 6. No Direct Plugin-to-Plugin Dependencies

`sugarlang` must not import `sugaragent`.

`sugaragent` must not import `sugarlang`.

If a free-form turn should be influenced by learner state, the engine passes provider-neutral constraints into the provider.

If the turn should be analyzed pedagogically, Sugarlang does so through middleware hooks after provider execution.

## Why This Supports the Product and Use Cases

This decision directly supports:

- scripted-only Sugarlang deployment for beginners and bounded tasks
- optional SugarAgent-assisted deployment for advanced free-form scenes
- the use cases where the same quest supports different input modes and delivery styles
- the requirement that the learning architecture remain stable even if the provider changes

It also protects the engine from plugin contamination.

The engine hosts conversations.

It does not become the private implementation home of either plugin.

## Comparable Product Patterns and Research Basis

The strongest technical pattern here is standard middleware architecture:

- Microsoft documents middleware as an ordered request pipeline that enables cross-cutting concerns around a core operation.[1]

That pattern maps well to Sugarlang because pedagogy, analytics, and validation are all cross-cutting concerns around turn production.

Comparable language-learning product behavior points in the same direction:

- Duolingo says humans author scenario framing and model steering for Roleplay, while AI powers variation and feedback. That implies a layered architecture, not a monolithic "AI owns the lesson" architecture.[2]
- Babbel describes speaking practice as progressing from structured to natural conversation, with pedagogy and AI collaborating rather than one replacing the other.[3]
- Busuu Conversations centers each scenario around a specific goal and then analyzes the conversation afterward. That is another sign that scenario control and analysis can be architecturally separated from surface turn generation.[4]

The decision here is to encode that separation as engine architecture.

## Alternatives Considered

### 1. Put Sugarlang Inside SugarAgent

Rejected.

Why:

- violates plugin separation
- makes free-form conversation a hidden dependency of language learning
- blocks scripted-only deployment

### 2. Let Sugarlang and SugarAgent Call Each Other Directly

Rejected.

Why:

- creates tight plugin coupling
- breaks removability
- makes testing and substitution harder

### 3. Keep a Single "Plugin Turn Hook"

Rejected.

Why:

- cannot express one provider plus multiple middleware concerns cleanly
- registration order becomes architecture
- prevents stable composition

### 4. Make Sugarlang the Provider for All Conversations

Rejected.

Why:

- Sugarlang is not fundamentally a turn generator
- it would push free-form generation or scripted realization responsibilities into the wrong plugin

## Technology and Pattern Options

This ADR does not lock specific code interfaces, but it does make some patterns preferable:

- capability-based plugin registration
- ordered middleware stages
- normalized request and response envelopes
- provider-neutral constraint passing
- deterministic host action gates

These patterns are compatible with:

- pure browser play
- hybrid desktop shells
- future server-assisted providers

## Future-Compatible Growth Path

This architecture is intentionally portable across model-serving futures.

### Browser-Local AI

`sugaragent` may run a local browser-side model or local native sidecar model.

Sugarlang middleware remains unchanged.

### Commercial LLM via API

A future provider may call a server-side proxy to a commercial model API.

The provider implementation changes.

The engine host and Sugarlang middleware architecture do not.

### Self-Hosted LLM Server

A future provider may call a self-hosted, OpenAI-compatible server.

Again:

- provider implementation changes
- host and middleware contracts remain stable

This ADR is explicitly designed to avoid baking one inference topology into the engine.

## Consequences and Tradeoffs

Positive:

- clean plugin separation
- scripted-only and free-form modes coexist
- provider swap does not rewrite the learning system
- the engine becomes a generic host instead of a plugin-specific runtime

Tradeoffs:

- more orchestration complexity in engine core
- requires careful contract design
- debugging becomes a pipeline concern, not a single-hook concern

## Sources

[1] Microsoft Learn, "ASP.NET Core Middleware"  
[https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/)

[2] Duolingo, "Introducing Duolingo Max, a learning experience powered by GPT-4"  
[https://blog.duolingo.com/duolingo-max/](https://blog.duolingo.com/duolingo-max/)

[3] Babbel, "Introducing Babbel Speak: AI-Powered Confidence for Travel, Futbol, and Everyday Life"  
[https://www.babbel.com/press/en-us/releases/babbel-speak](https://www.babbel.com/press/en-us/releases/babbel-speak)

[4] Busuu, "What are Busuu Conversations and how can they help me learn a language?"  
[https://help.busuu.com/hc/en-us/articles/21862192336402-What-are-Busuu-Conversations-and-how-can-they-help-me-learn-a-language](https://help.busuu.com/hc/en-us/articles/21862192336402-What-are-Busuu-Conversations-and-how-can-they-help-me-learn-a-language)
