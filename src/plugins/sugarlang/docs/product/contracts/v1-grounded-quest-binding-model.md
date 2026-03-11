# V1 Grounded Quest Binding Model

## Purpose

This document defines the product contract for binding language to real quest objects and actions in Sugarlang.

It answers:

- how a vocabulary entry maps to an in-world object
- how that object maps to inspect, click, or pickup actions
- how the referent survives into inventory and return steps
- how the same vocabulary stays attached to the quest loop

This is a product and logical content contract.

It is not an implementation schema.

See [V1 Quest, Scenario, Interaction, and Binding Model](./v1-quest-scenario-interaction-binding-model.md).

## Plain-English Terms

- `lexicon row` or `vocabulary entry`
  - the word or phrase the game tracks, such as `maleta` or `dónde está`
- `world object`
  - the actual thing in the world, such as the red suitcase or the station counter
- `grounding`
  - the link between the vocabulary entry and the world object

## Product Decision

Sugarlang should prefer grounded quest actions over detached language mini-games.

If the authored quest already includes:

- a visible object
- a real interaction
- a pickup or collect action
- an inventory state change
- a return or confirmation step

then Sugarlang should bind its teaching referents to that real quest structure.

The product should not replace that with a disconnected prompt unless the interaction truly has no grounded quest action available.

The stable top-level binding remains:

- one quest
- one scenario overlay

Interactions inside that scenario then reuse the same grounded quest bindings as needed.

## Binding Chain

For V1, a grounded vocabulary entry should be able to map across this chain:

1. vocabulary entry
   - which word or phrase the game is tracking in this interaction
2. world object
   - which object, region, or landmark in the world carries that vocabulary entry
3. interaction affordance
   - inspect, point, click, pick up, give, return, or report
4. quest state transition
   - which objective or progression step the action satisfies
5. inventory or held-state referent
   - what the object is called after the player has it
6. completion referent
   - how the quest refers to the same thing during return or confirmation

Not every interaction needs every step, but the product should bind as many of them as the authored quest supports.

## Product Rules

### 1. One Grounded Target, One Real Quest Identity

If `maleta roja` is the grounded teaching target in the interaction, the product should know:

- which world object that is
- which interaction acts on it
- which inventory item or held object it becomes
- which quest step it resolves

That grounded target may carry one vocabulary entry or a small bundle of attached vocabulary entries such as:

- `maleta`
- `roja`

For scenario-based learning scenes, that identity should usually be:

- stable at the scenario level
- reused by one or more interactions inside that scenario
- realized through different concrete world-object variants by band when the pedagogy changes the target example

### 2. Language Surfaces Should Stay Consistent Across the Loop

The same referent should be re-used across:

- NPC descriptions
- repair lines
- chip-built responses and typed responses
- highlights and object labels
- pickup or inventory labels
- return or report-back lines

This is how the player learns that the word belongs to the actual object and task.

### 3. Grounding Can Bind to More Than Objects

Grounded quest binding may also include:

- visible attributes
- landmarks
- regions
- path endpoints
- handoff targets

Examples:

- `roja` binds to the red suitcase color
- `puerta` binds to the nearby door region
- `mostrador` binds to the counter region

### 4. Repair Actions Should Reuse the Same Grounded Binding

Repair should not invent a second teaching object.

If the player asks for help, the repair path should use the same referent and binding chain:

- point at the same suitcase
- highlight the same color
- reference the same pickup target

### 5. Inventory and Return Matter

If the quest includes collection and return, Sugarlang should preserve the vocabulary through those states.

Example:

- world: `maleta roja`
- inventory: `maleta roja`
- return: `Aquí está la maleta roja`

The label may be shortened by band, but the underlying referent should stay stable.

## V1 Binding Elements

Every grounded quest binding should be able to name the following logical elements:

- scenario referent
- optional band variant id
- world object or region
- relevant visible attributes
- allowed learner actions
- optional pickup or collect identity
- optional inventory identity
- quest objective linkage
- completion or return linkage
- vocabulary entries that should stay attached to the binding

## Product Rule for Band Variants

Some Sugarlang scenes keep the same quest truth while changing the concrete teaching example by band.

That should be modeled as:

- one stable scenario-level binding
- plus one or more band-specific concrete variants

This is not a different quest per band.

It is one quest with different pedagogical realizations.

The stable pieces should usually remain:

- scenario referent
- learner action chain
- quest progression linkage
- pickup and inventory linkage
- return linkage

The variant pieces may change by band:

- world object id
- visible attributes
- grounded landmarks
- attached vocabulary entries

## Find the Luggage Reference Binding

### Stable scenario-level binding

The first vertical slice should define a binding like this:

| Logical element | Example |
| --- | --- |
| scenario referent | `target_luggage_primary` |
| learner actions | point, inspect, click, pick up, return |
| pickup identity | `pickup_target_luggage` |
| inventory identity | `inventory.target_luggage` |
| quest progression | satisfies the `retrieve_luggage` step |
| completion linkage | used by the `return_luggage` step with the station clerk |

### Band-specific concrete variants

| Band variant | World object | Visible attributes | Attached vocabulary entries |
| --- | --- | --- | --- |
| `B0` | `luggage_red_01` | `red`, `suitcase` | `maleta`, `roja` |
| `B1` | `luggage_blue_01` | `blue`, `suitcase` | `maleta`, `azul`, `aquí está` |
| `B2` | `luggage_black_01` | `black`, `suitcase`, nearby `door` region | `maleta`, `negra`, `puerta` |
| `B3` | feature-bearing luggage variant | `small`, `green ribbon`, nearby `counter` region | `maleta`, `pequeña`, `cinta verde`, `mostrador` |
| `B4` | richer advanced luggage variant | `worn`, `de cuero`, `green ribbon`, `side door` context | `maleta`, `gastada`, `de cuero`, `puerta lateral` |

The scenario-level binding stays stable while the concrete teaching variant changes by band.

## Product Rule for Partial Scenes

Some interactions will not include pickup or inventory.

In those cases, Sugarlang should still bind:

- description
- world object
- action affordance
- quest progression

The rule is not "every interaction must have inventory."

The rule is "bind to the real quest loop as far as the interaction allows."

## AI Generation Contract

When the AI assistant generates or updates an interaction or scenario, it should try to infer:

- which scenario referent is actually quest-critical
- whether that referent should have multiple concrete band variants
- which object each supported band should bind to
- which authored quest step interacts with it
- whether pickup and inventory are already present
- which vocabulary entries should remain attached to that referent

If those bindings are ambiguous, the AI should leave a review note or draft candidate bindings for the designer to confirm.

## Product Review Questions

For every grounded interaction, product review should be able to answer:

- what stable scenario referent the learner is talking about
- which concrete world-object variant each band maps that referent to
- whether the same referent survives repair and fallback paths
- whether the same referent survives pickup and return
- whether the teaching vocabulary remains attached to real quest progress

If the answer is no, the interaction is not grounded strongly enough.
