# ADR-SL-003: Shared Scene Semantics and Response Contract Model

## Status

Proposed

## Context

Sugarlang needs to adapt the same quest across multiple learner bands without duplicating the narrative game into entirely separate versions.

The use cases make this explicit:

- the same `Find the Luggage` quest should work for an absolute beginner
- the same quest should later work for an advanced player
- the narrative goal should stay the same
- the language, scaffolding, and player input mode should vary

That requires more than "translate the text."

It requires a shared semantic layer between narrative content and language-learning behavior.

## Decision

Sugarlang will use a shared scene-semantics model and a first-class response-contract model.

The key decision is:

1. Every Sugarlang-enabled scene is bound to a semantic learning scenario.
2. That scenario defines a communicative task and a success model.
3. The provider renders a turn, but the meaning of the turn is captured in shared semantics rather than in raw text alone.
4. The player-facing input mode is described by a typed response contract, not inferred only from dialogue text.
5. The engine UI renders based on the response contract rather than assuming one universal dialogue interaction model.
6. Each semantic scenario may define grounding references that bind language to world objects, attributes, regions, and actions.
7. Each learner-band rendering may define a support-language policy that controls how target language and support language are mixed.
8. A semantic scenario may keep one stable scenario referent while mapping it to different concrete grounded variants by learner band.

## Architectural Strategy

### 1. Semantic Scenario Layer

The semantic scenario layer should describe:

- what the player is trying to accomplish communicatively
- what counts as success
- what the core scene references are
- what scene referents can ground vocabulary and phrases
- which learner bands are supported

Examples:

- `identify_and_report_object_location`
- `ask_for_directions`
- `confirm_assistance`
- `clarify_attribute`

This is the stable layer that allows one narrative scene to support multiple learner experiences.

The scenario layer should also be able to keep one stable scenario-level referent while allowing different concrete teaching variants by band.

Example:

- one `target_luggage_primary` referent
- `B0` bound to a red suitcase
- `B1` bound to a blue suitcase
- `B2` bound to a black suitcase

### 2. Grounding References Are Part of the Semantic Contract

Language-learning meaning in a game should be tied to visible world meaning whenever possible.

That means the scenario layer should be able to identify things like:

- the suitcase object or object class
- visible attributes such as red, blue, small, or worn
- spatial relations such as near the door or beside the counter
- player actions such as tap, inspect, pick up, point to, or return

Those references are not just hint metadata.

They are part of how the same scene becomes learnable at beginner bands without rewriting the quest.

They should also support a stable scenario referent plus optional band-specific concrete variants.

### 3. Success Model

A semantic scenario should define a success model that can be evaluated independently of the exact wording of the NPC line.

That model may include:

- acceptable intent families
- required semantic slots
- optional semantic slots
- scene-level completion conditions
- form-quality tolerances

This is what allows deterministic evaluation to work even when the language surface varies by band.

### 4. Support-Language Policy Is a First-Class Runtime Concept

The scene model should not reduce support language to a simple translation toggle.

It should support policy choices such as:

- target-language-only
- support-language framing with protected target-language keywords
- inline glosses
- dual-language prompts
- on-demand translation only

This policy should vary by learner band and scene goal.

It should also govern:

- the initial-delivery line
- repair variants
- happy-path response frames

The scene model should prefer natural mixed-language helper utterances over arbitrary token substitution.

### 5. Response Contract as a First-Class Runtime Concept

The response contract should define what kind of answer the player is expected to give.

High-level modes include:

- binary choice
- multiple choice
- chip composition
- blank fill
- word bank
- guided assembly
- repair response
- clarification response
- constrained short text
- short free-form text
- open free-form text
- hint request
- repeat or simplify request

This is not just a UI convenience.

It is part of the pedagogical design and part of the evaluator design.

Important distinctions from the product contract:

- `chip composition` is the primary early-band response mode where the learner builds the whole response from chips
- `word bank` is a bounded candidate pool used to fill authored blanks or guided frames
- low-band clarification may be tap-only even when the broader product later supports typed clarification
- repair responses are not chips

### 6. Response Contracts Must Be Provider-Neutral

The same semantic scenario should work whether the turn came from:

- a scripted provider
- `sugaragent`

That means the response contract cannot be encoded as ad hoc UI behavior inside one provider.

It must be host-visible and middleware-visible.

### 7. Rendering Is Derived from Semantics Plus Learner State

The semantic scenario answers:

- what the scene means
- what the player needs to do

Learner state answers:

- how difficult the wording should be
- how much support language should appear
- how much support should be shown
- what input mode is appropriate

That combination produces the actual player experience.

If a mixed-language surface would sound unnatural, the architecture should permit:

- a more natural mixed initial-delivery line
- a more natural mixed repair line
- a fully target-language completed response

while keeping support in the scaffold or repair rather than forcing token-spliced final output.

## Why This Supports the Product and Use Cases

This decision is the foundation for:

- the same quest at different difficulty bands
- the same quest with different support-language mixes
- the same quest with different grounding intensity
- different response modes by learner placement
- deterministic evaluation without LLM dependence in beginner and intermediate flows
- optional free-form delivery without changing the underlying learning objective

Without this layer, the architecture collapses into one of two bad outcomes:

- raw scripted duplication by level
- or vague prompt-only adaptation with poor control

## Comparable Product Patterns and Research Basis

The comparable product pattern is consistent:

- Duolingo Roleplay uses human-authored scenario framing aligned to the learner's course progress, not just generic open chat.[1]
- Babbel describes expert-curated real-life scenarios, level-appropriate dialogues, and clear learner objectives in its speaking practice.[2]
- Busuu Conversations presents specific scenario goals and then evaluates the learner against those goals.[3]
- Memrise emphasizes useful phrases and authentic examples, which again points to scenario-based semantics rather than abstract grammar drills alone.[4]

In other words:

successful products do not rely on "the model will figure out the lesson."

They define the scenario, the goal, and the expected type of learner response.

## Alternatives Considered

### 1. Treat Raw Dialogue Text as the Only Scene Contract

Rejected.

Why:

- impossible to adapt reliably across bands
- impossible to evaluate consistently across providers
- pushes too much inference into runtime heuristics

### 2. Duplicate Entire Dialogue Trees by Learner Level

Rejected.

Why:

- authoring explosion
- hard to maintain narrative consistency
- bad fit for AI-assisted overlay generation

### 3. Use Only Open Free-Form Input

Rejected.

Why:

- bad beginner experience
- bad deterministic evaluation story
- breaks product use cases centered on scaffolding

## Technology and Pattern Options

This ADR does not lock exact schema design, but it does imply certain patterns:

- explicit scenario records separate from dialogue text
- explicit grounding references tied to stable scene IDs
- stable scenario referents plus optional band-specific concrete variant records
- explicit support-language policy records by learner band
- explicit response contract types
- explicit response-frame records
- explicit clarification-entry policy
- semantic slot definitions
- scenario preview tooling by learner band
- validation that every Sugarlang scene points at stable source content

This model is equally compatible with:

- authored scripted variants
- optional LLM rewriting
- optional free-form providers

## Future-Compatible Growth Path

This decision is intentionally neutral across deployment models.

### Browser-Local AI

Local models may help render or rewrite a turn, but they still receive:

- semantic scenario
- response contract
- learner-state constraints

### Commercial API Models

Commercial models may render or explain turns, but the semantic and response-contract layer still lives locally in the game content model.

### Self-Hosted LLM

Self-hosted models may do the same work through a server boundary.

Again, the semantic contract does not change.

This ADR is specifically designed to prevent deployment choice from becoming pedagogy design.

## Consequences and Tradeoffs

Positive:

- one quest can support many learner bands
- evaluation becomes more explainable
- UI can support many response modes coherently
- providers become interchangeable at the surface level

Tradeoffs:

- adds a semantic layer that must be authored or generated
- requires more validation than plain dialogue content
- demands explicit response-contract support in engine UI

## Sources

[1] Duolingo, "Introducing Duolingo Max, a learning experience powered by GPT-4"  
[https://blog.duolingo.com/duolingo-max/](https://blog.duolingo.com/duolingo-max/)

[2] Babbel, "Introducing Babbel Speak: AI-Powered Confidence for Travel, Futbol, and Everyday Life"  
[https://www.babbel.com/press/en-us/releases/babbel-speak](https://www.babbel.com/press/en-us/releases/babbel-speak)

[3] Busuu, "What are Busuu Conversations and how can they help me learn a language?"  
[https://help.busuu.com/hc/en-us/articles/21862192336402-What-are-Busuu-Conversations-and-how-can-they-help-me-learn-a-language](https://help.busuu.com/hc/en-us/articles/21862192336402-What-are-Busuu-Conversations-and-how-can-they-help-me-learn-a-language)

[4] Memrise, "Learn a language. Memrise is authentic, useful and personalised."  
[https://www.memrise.com/](https://www.memrise.com/)
