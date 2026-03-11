# ADR-SL-013: Authoring Packet and Proposal Contract

## Status

Proposed

## Context

ADR-SL-010 and ADR-SL-011 already establish the architecture:

- Sugarlang owns authoring-time context assembly
- authoring actions are operation-scoped
- AI works against bounded packets
- AI returns structured proposals
- validation and preview happen before apply

What is still missing is the concrete architectural contract for those packets and proposals.

Without that contract, the system is still too vague in exactly the place where the real implementation risk lives:

- what exactly does Sugarlang prepare for the AI?
- what exactly is the AI allowed to change?
- what exactly must come back?
- how do external assistants, a future MCP bridge, and a future integrated AI path avoid becoming different systems?

This is not a new strategic concept.

It is the concrete architectural detail that makes the existing authoring-control-plane decisions real.

## Decision

Sugarlang will define a stable packet/proposal contract for all AI-assisted authoring operations.

The key decisions are:

1. Every AI-assisted authoring request is represented as one scoped packet.
2. Every AI-assisted authoring response is represented as one structured proposal.
3. Packets define:
   - what the task is
   - what source context is relevant
   - what product rules apply
   - what artifacts may be changed
4. Proposals define:
   - the scoped changes being proposed
   - warnings and unresolved questions
   - lightweight provenance and rationale
5. Validation, preview, and apply operate on the packet/proposal contract regardless of invocation mode.

## Architectural Strategy

### 1. One Packet Per Operation

Every authoring packet should correspond to exactly one authoring operation.

Examples:

- `sync_from_quest`
- `regenerate_interaction`
- `regenerate_band_slice`
- `regenerate_repair_ladder`
- `polish_interaction_surface_lines`
- `regenerate_target_language_overlay`
- `rebuild_grounded_quest_binding`
- `refresh_lexical_fit`
- `validate_scenario`

This prevents one AI request from turning into an unbounded rewrite of the scenario or its interactions.

### 2. Packets Must Carry the Scoped Source Context

The packet should contain the specific context needed for the operation, including:

- operation identity and scope
- stable quest, scenario, and interaction refs
- relevant English-authored quest/dialogue content
- relevant world-object, region, pickup, inventory, and objective context
- current Sugarlang artifacts for the targeted scope
- lexical-fit and grounding context
- language-pair and band targets
- product rules and validation constraints
- expected output targets

The packet should be built by Sugarlang code, not invented by the AI client.

That is how Sugarlang avoids the context-management problem entirely:

- the model is not asked to figure out what matters
- Sugarlang hands it the exact job envelope

For `polish_interaction_surface_lines`, the packet should also make the boundary obvious:

- the existing persisted interaction bundle already exists
- only surface wording is in scope
- structural bindings and evaluation semantics are not being reinvented by the model

### 3. Packets Must Enforce Write Boundaries

The packet must make explicit:

- which artifact types are in scope
- which artifact paths or logical sections are in scope
- whether the operation is create, replace, patch, or validate-only
- which related artifacts may be read but not modified

This is the core safeguard against accidental broad edits.

For a surface-polish operation, the packet should explicitly mark fields such as these as editable:

- NPC initial line wording
- repair line wording
- happy-path response phrasing
- natural mixed-language glue

And it should explicitly mark fields such as these as protected unless a broader operation says otherwise:

- interaction identity
- source quest-node refs
- source dialogue-beat refs
- vocabulary role ids
- response contract
- evaluation target
- quest-success hook

### 4. Proposals Must Be Structured, Not Free Text

The output contract should be a structured proposal containing:

- proposal identity
- the packet identity it responds to
- the proposed change set
- warnings
- unresolved questions
- rationale notes
- review signals such as partial or low-confidence sections

The proposal should never rely on a human parsing a blob of prose to discover what was changed.

For surface-polish operations, the proposal should make it visually obvious that the change is line-level polish over an existing structured interaction bundle, not a silent structural rewrite.

### 5. Proposal Changes Must Stay Inside Packet Scope

The proposal may only modify:

- artifact types named in the packet
- scoped sections named in the packet
- IDs or structures the packet explicitly allows to be created or updated

If the AI thinks a broader change is needed, that belongs in:

- a warning
- an unresolved question
- a follow-on operation

Not in a silent spillover edit.

### 6. Validation and Preview Are First-Class Consumers of the Contract

The packet/proposal contract exists so that validation and preview can operate deterministically.

Validation should be able to inspect:

- scope compliance
- reference integrity
- lexical-plan coherence
- cumulative band-contract compliance
- ambient-halo density
- response-contract legality
- repair-ladder completeness
- grounded-binding continuity
- mixed-language policy compliance

Preview should be able to simulate:

- first exposure
- failure stages
- final rescue
- band differences
- language-pair differences
- proposed changes before apply

### 7. The Same Contract Must Survive Different Invocation Modes

This contract must work across:

- external workspace assistants such as Codex
- a future MCP bridge
- a future integrated local-model adapter
- a future server-mediated commercial or self-hosted model adapter

That means the packet/proposal contract is the real authoring interface.

The invocation transport is replaceable.

## Minimal Logical Shape

At a logical level, the contract should feel like this:

### Packet

- header
- scope
- source snapshot
- existing artifact context
- planning context
- constraints
- output expectation

### Proposal

- header
- packet reference
- change set
- warnings
- open questions
- rationale
- review signals

This ADR does not lock exact JSON field names.

It does lock the existence of these sections.

## Concrete Packet Contents

The packet contract should describe the job in plain operational terms.

### 1. Header

The header should name:

- packet id
- operation name
- project id
- creation time
- contract version

### 2. Scope

The scope should name exactly what is being changed.

At minimum, scope should be able to name:

- `questId`
- `scenarioId`
- zero or more `interactionId`s
- target language
- support language when relevant
- targeted learner bands when relevant
- artifact paths or logical sections that may be edited
- write mode such as create, replace-scope, patch-scope, or validate-only

### 3. Source snapshot

The packet should carry the exact authored source material the operation is allowed to reason from.

For `sync_from_quest`, that means:

- quest summary
- quest graph excerpt
- relevant quest-node list
- relevant English dialogue beats
- involved NPC summaries
- involved world-object, region, pickup, and inventory summaries

### 4. Existing artifact context

The packet should include the current Sugarlang overlay state for that same scope.

Examples:

- current scenario record
- current interaction definitions
- current persisted banded turn bundles
- current grounding map
- current grounded quest bindings
- current target-language interaction overlays
- current validation findings for that scope

### 5. Planning context

The packet should include the planning material the AI would otherwise have to invent or rediscover.

Examples:

- candidate vocabulary entries
- lexical-fit notes
- stable quest bindings and grounded referents
- current per-band `focus`, `reinforcement`, and `ambient`
- current response contracts, repair ladders, evaluation targets, and quest-success hooks for the targeted interaction
- cumulative lexicon targets for the selected target language

### 6. Constraints

The packet should make product rules and write boundaries explicit.

Examples:

- which artifacts may be changed
- which quest bindings are protected
- which vocabulary entries must remain visible
- whether the operation may create new shared lexicon rows
- which validation profiles apply

### 7. Output expectation

The packet should explicitly say what the AI is expected to return.

Examples:

- updated interaction overlays only
- updated quest bindings only
- validation findings only
- full scenario refresh within the named quest scope

## Concrete Proposal Contents

The proposal contract should be the same level of concrete.

### 1. Header

The proposal header should name:

- proposal id
- packet id
- producer
- creation time
- completion state

### 2. Scoped change set

The proposal should contain only changes allowed by the packet.

That change set should be able to express:

- create artifact
- replace scope
- patch scope
- delete scope

### 3. Warnings

Warnings should capture things the AI could not safely solve inside scope.

Examples:

- missing dialogue beat
- weak lexical fit for a selected band
- ambiguous grounded referent
- likely need for a new shared vocabulary entry

### 4. Open questions

Open questions should capture product or content ambiguity that needs writer confirmation.

Examples:

- whether two quest nodes should be one interaction or two
- whether the pickup and return loop really refers to the same suitcase
- whether a new vocabulary entry should be introduced at `B1` or `B2`

### 5. Rationale

Rationale should explain why the proposal chose a given interaction boundary, quest binding, or vocabulary role assignment.

### 6. Review signals

Review signals should call out parts of the proposal that need deliberate human review.

Examples:

- low confidence interaction split
- low confidence mixed-language line
- blocked because a world object ref was missing

## Preview and Validation Expectations

The packet and proposal contract should support preview and validation without additional hidden context.

That means the contract should be rich enough to let Sugarlang preview:

- the selected interaction
- the targeted bands
- first exposure and repair stages
- grounded variants
- proposal versus accepted state

And validate:

- scope compliance
- source-binding integrity
- quest-binding continuity
- cumulative lexicon legality
- interaction-level role legality
- mixed-language policy quality signals

## Minimum Implementation Rule

The minimum acceptable implementation is:

- packets have enforceable scope
- proposals stay inside that scope
- validation runs against the same packet and proposal
- preview can be generated from the same packet and proposal

If those conditions do not hold, the packet/proposal architecture is not real yet.

## Why This Supports the Product and Use Cases

This ADR is what makes the following writer-facing experience plausible:

- click `Sync From Quest` or `Copy Codex Task`
- open Codex or another assistant
- hand it one bounded job
- get back one bounded proposal
- validate and preview before apply

Without this contract, the dream authoring flow in `UC-006` collapses back into improvised prompting.

## Alternatives Considered

### 1. Let the AI Client Invent the Context It Needs

Rejected.

Why:

- context drift
- poor reproducibility
- too much burden on the writer

### 2. Let Proposals Be Mostly Free Text

Rejected.

Why:

- hard to validate
- hard to preview
- hard to apply safely

### 3. Encode the Contract Separately for Every Invocation Mode

Rejected.

Why:

- creates multiple authoring systems
- makes external and integrated AI drift apart

## Consequences and Tradeoffs

Positive:

- gives Sugarlang one stable authoring interface
- keeps AI requests narrow and reviewable
- makes validation and preview credible
- supports external assistants immediately

Tradeoffs:

- requires disciplined packet construction
- requires disciplined scope enforcement
- introduces another formal contract layer in the authoring system
