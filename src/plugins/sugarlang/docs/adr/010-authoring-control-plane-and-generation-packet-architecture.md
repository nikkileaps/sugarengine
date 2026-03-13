# ADR-SL-010: Authoring Control Plane and Generation Packet Architecture

## Status

Proposed

## Context

The practical Sugarlang authoring problem is not "how do we call a model?"

It is:

- how does a writer author the game in English first
- how does Sugarlang derive the right subset of project context
- how does AI help with one narrow authoring task without swallowing the whole repo
- how do editor preview, external AI help, and direct file editing stay on one source of truth

If Sugarlang solves this with raw prompting against arbitrary files, the result will be brittle:

- every client assembles context differently
- regeneration becomes unsafe
- preview and generation drift
- the writer cannot tell what the AI actually used
- context management becomes a tax on every operation

The dream flow in `UC-006` therefore requires a real authoring control plane.

## Decision

Sugarlang will implement AI-assisted authoring through an authoring control plane that produces bounded generation packets and consumes structured proposals.

The key decisions are:

1. Sugarlang product code, not the model, owns source extraction, reference resolution, artifact persistence, validation, and preview wiring.
2. Every authoring action is modeled as an explicit scoped operation.
3. For bounded scripted interaction families, the control plane should be able to produce a deterministic first-pass interaction bundle before any optional AI rewrite step.
4. Every AI-assisted scoped operation is compiled into a bounded generation packet.
5. AI generation returns structured proposals or patch plans, not implicit direct mutation of canonical artifacts.
6. Proposal validation and preview happen before canonical artifacts are accepted as updated.
7. The same packet/proposal architecture must work for editor actions, external AI assistants, and future integrated AI adapters.

The concrete packet/proposal detail is further defined in [ADR-SL-013: Authoring Packet and Proposal Contract](./013-authoring-packet-and-proposal-contract.md).

## Architectural Strategy

### 1. Introduce a Dedicated Authoring Control Plane

The control plane is the Sugarlang-side orchestrator for authoring-time work.

It is distinct from:

- the runtime conversation host
- learner-state runtime services
- provider execution

Its job is to coordinate:

- quest traversal and interaction extraction
- stable reference resolution
- vocabulary-entry and world-object extraction
- lexical-fit analysis
- cumulative lexicon planning and count validation
- grounding and quest-binding planning
- band planning
- scenario overlay and interaction-overlay planning
- proposal validation
- preview preparation
- artifact writes

This is the layer that makes AI help bounded and reproducible instead of magical and fragile.

For simple scripted interaction families, the same control plane should also be able to complete the first pass without AI by:

- reading the English dialogue beat
- classifying the interaction family
- resolving vocabulary from the shared lexicon
- applying band policy
- emitting a full persisted banded turn bundle

That bundle should include:

- NPC line
- `focus`, `reinforcement`, and `ambient`
- response contract
- visible scaffold
- repair ladder
- evaluation target
- quest-success hook

Optional later AI help should usually be surface polish on top of that bundle, not the only way the bundle comes into existence.

### 2. Treat Authoring Requests as Explicit Operations

Sugarlang should not have one vague `Generate` action.

It should reason in scoped operations such as:

- sync one quest into its scenario overlay
- regenerate one interaction
- regenerate one band
- regenerate a repair ladder
- polish one interaction's surface lines
- rebuild a grounded quest binding
- refresh lexical-fit analysis
- regenerate one target-language overlay
- validate one scenario

This matters because operation scope controls:

- which files are relevant
- which rules apply
- what the model is allowed to change
- which preview states need to be refreshed

### 3. Compile Each Operation into a Bounded Generation Packet

The generation packet is the concrete answer to "how does the AI know enough without managing the whole project context?"

The packet should be compiled by Sugarlang code from canonical artifacts and source game content.

At a strategic level, a packet should contain:

- operation identity and scope
- source quest, interaction, and dialogue references
- relevant English-authored quest and interaction source content
- relevant world-object, region, pickup, inventory, and objective context
- current Sugarlang artifacts for the targeted scope
- candidate vocabulary entries and lexical-fit findings
- cumulative lexicon targets and current count context where relevant
- grounded-target, world-object, grounding-link, and band-variant context
- language-pair and band targets
- product rules and validation constraints
- expected output targets

The packet should be:

- small enough to reason over
- reproducible
- reviewable by a human
- stable across editor and external-AI workflows

For bounded scripted interaction families, the control plane may complete the first pass before any AI packet is needed.

In those cases, the packet architecture still matters for later work such as:

- surface-line polish
- scoped regeneration of one interaction
- repair-ladder refinement
- one-band rewrite

### 4. Keep Packets Narrow and Operation-Specific

The control plane should not build giant "everything about this quest" packets by default.

Instead:

- a `regenerate B0/B1 repair ladder` packet should contain only the interaction slices, lexical plan, and repair rules needed for that operation
- a `rebuild grounded binding` packet should contain world and quest-loop context, not all surface-line details
- a `validate scenario` operation may not need AI at all

This keeps the AI request narrow and makes later model swaps less painful.

### 5. Use Structured Proposals as the Output Contract

The output side should be just as disciplined as the input side.

The AI should return a structured proposal or patch plan containing things such as:

- proposed artifact edits
- warnings
- unresolved questions
- rationale notes
- provenance metadata

This proposal can then be:

- validated
- previewed
- applied
- rejected

The canonical artifact store should not be mutated by opaque AI free text.

### 6. Keep Validation Inside the Control Plane

Validation is not cleanup after generation.

The control plane should validate:

- reference integrity
- lexical-fit coherence
- cumulative band-contract compliance
- ambient-halo density
- grounded-binding continuity
- response-mode legality
- repair-ladder completeness
- band-policy compliance
- artifact consistency

That is what makes regeneration safe enough for repeated use.

### 7. Preserve Provenance and Regeneration Scope

The writer needs to know:

- what operation created this draft
- which scenario, interactions, and bands it targeted
- whether the content was suggested or accepted
- whether a section was later human-edited

The control plane should therefore preserve high-level provenance so regeneration does not feel like roulette.

### 8. Make Preview a First-Class Consumer of Proposals

The proposal should not jump straight to "trust me."

Instead, the control plane should support:

- draft preview before apply
- scoped validation reports
- preview of first exposure and failure states
- preview of different bands and language pairs against the proposal

This is what lets the writer judge whether the AI draft is pedagogically useful instead of merely well-formed.

## What This Means Operationally

At a high level, the real workflow becomes:

1. SugarEngine code reads the English-authored quest and existing Sugarlang artifacts.
2. For bounded scripted interaction families, Sugarlang may derive the first persisted banded interaction bundle directly from the quest dialogue beat without AI.
3. If further help is requested, Sugarlang builds the right bounded packet for the requested operation.
4. An AI system or human works against that packet.
5. The result comes back as a structured proposal.
6. Sugarlang validates the proposal.
7. The writer previews the result.
8. Sugarlang applies the accepted artifact changes.

That is the concrete architectural answer to "how is this actually going to work?"

Not:

- whole-project prompt stuffing
- hidden long-lived context state
- hand-wavy "the model will figure it out"

## Why This Supports the Product and Use Cases

This ADR is the control-plane backbone for:

- the AI-assisted authoring workflow
- the writer-facing `UC-006` dream UI
- safe regeneration of part of a quest without rewriting everything
- keeping editor preview and external AI assistance on one artifact model

It also directly addresses the user's desire to avoid babysitting context windows.

## Alternatives Considered

### 1. Direct Raw Prompting Against the Whole Project

Rejected.

Why:

- poor context hygiene
- difficult to reproduce
- difficult to validate safely
- too easy to overwrite unrelated content

### 2. Let Every Client Invent Its Own Context Assembly

Rejected.

Why:

- editor and external AI workflows drift
- validation becomes inconsistent
- preview cannot be trusted

### 3. Let AI Mutate Canonical Artifacts Directly

Rejected.

Why:

- unsafe
- poor provenance
- hard to review
- too easy to corrupt authoring state silently

## Technology and Pattern Options

Patterns compatible with this ADR include:

- JSON generation packets
- JSON-schema-constrained proposal outputs
- patch manifests
- whole-artifact replacement proposals
- stored proposal files under a generated or draft area

This ADR does not force one exact wire format.

It does require:

- packet in
- proposal out
- validate
- preview
- apply

## Future-Compatible Growth Path

This architecture is compatible with:

- external AI assistants operating on workspace files
- future editor-triggered local-model generation
- future server-mediated commercial API generation
- future self-hosted generation

Because the packet and proposal contracts stay stable, invocation topology can evolve without rewriting the authoring model.

## Consequences and Tradeoffs

Positive:

- bounded, reviewable generation
- much lower context-management burden
- safer regeneration
- preview and validation become credible

Tradeoffs:

- adds a real authoring orchestration layer
- requires disciplined validators
- introduces intermediate packet and proposal artifacts or equivalents

## Sources

[1] OpenAI API docs, "Structured model outputs"  
[https://platform.openai.com/docs/guides/json-mode](https://platform.openai.com/docs/guides/json-mode)

[2] OpenAI, "Introducing Structured Outputs in the API"  
[https://openai.com/index/introducing-structured-outputs-in-the-api/](https://openai.com/index/introducing-structured-outputs-in-the-api/)

[3] OpenAI API docs, "File search"  
[https://platform.openai.com/docs/guides/tools-file-search/](https://platform.openai.com/docs/guides/tools-file-search/)
