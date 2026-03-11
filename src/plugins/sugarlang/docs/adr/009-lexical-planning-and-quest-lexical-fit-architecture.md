# ADR-SL-009: Lexical Planning and Quest Lexical Fit Architecture

## Status

Proposed

## Context

Sugarlang now has an explicit product requirement that:

- the quest and world stay stable
- grounded targets stay stable
- the shared lexicon is cumulative by band
- interactions choose a smaller teaching subset from that cumulative pool
- interactions may allow a sparse ambient halo of higher-band or untracked language at the edges

That means Sugarlang cannot treat these as the same thing:

- world objects in the scene
- grounded quest targets
- tracked vocabulary entries in the shared lexicon
- the current interaction's `focus` / `reinforcement` / tracked `ambient`
- sparse ambient look-ahead or untracked flavor language

The writer-facing flow in `UC-006` assumes all of the following:

- the same suitcase can exist at every band
- `maleta` can be introduced at one band, used as `focus`, and only reinforced later
- `mostrador` can stay grounded while not entering the learner's tracked pool until a later band
- later descriptors such as `cinta verde` can be attached to the same quest loop without polluting early bands
- a learner placed at `B2` should immediately have the cumulative `B0 + B1 + B2` tracked pool
- the system can warn when an interaction is a weak lexical fit for a band or drifts from the cumulative band contract

Without an explicit lexical-planning architecture, Sugarlang drifts into bad states:

- every grounded target becomes an automatic teaching target
- quest order is mistaken for vocabulary availability
- later-band language leaks into early-band success paths without control
- lexical progression is buried inside hand-authored surface text and cannot be inspected or regenerated safely

The lexical-planning layer therefore has to operate on the same `quest -> scenario -> interaction` model as the rest of Sugarlang rather than treating vocabulary selection as a detached per-line task.

## Decision

Sugarlang will introduce a lexical-planning architecture that separates:

- world objects and grounded quest targets
- tracked vocabulary entries or lexicon rows
- grounding links between vocabulary entries and world objects or grounded targets
- language-specific surface realizations
- stable `introductionBand` assignments
- interaction vocabulary roles
- sparse ambient-halo allowances

The key decisions are:

1. `world object`, `grounded target`, `vocabulary entry`, `grounding link`, `surface realization`, and `interaction role` are distinct architectural concepts.
2. Shared lexicon rows own stable `introductionBand`; interactions own `focus`, `reinforcement`, and tracked `ambient`.
3. The lexical-planning layer must respect the cumulative band contract rather than quest order.
4. Lexical planning is authoring-time first, but its outputs must be consumable by runtime policy, repair shaping, preview simulation, validation, and learner-evidence updates.
5. Architecture must support slice-level cumulative targets and validation such as the current V1 planning targets (`60 / 150 / 300 / 550 / 850`) without hardcoding them as engine behavior.
6. AI may help extract, rank, and draft lexical plans, but the accepted lexical plan remains part of the canonical artifact model.

## Architectural Strategy

### 1. Separate World Truth from Tracked Language

The architecture should distinguish:

- `world object`
  - the concrete thing in the world
  - suitcase, counter, ribbon, door
- `grounded target`
  - the quest-relevant identity the scene is pointing the learner at
  - for example, the target suitcase in a recovery quest
- `vocabulary entry` or `lexicon row`
  - the tracked word or phrase the game teaches and evaluates
  - `maleta`, `roja`, `mostrador`
- `surface realization`
  - the language-specific form shown to the learner in one target language
- `interaction role`
  - the pedagogical treatment of that tracked entry in one interaction and band

This is what makes the following legal at the same time:

- the suitcase exists at every band
- `maleta` is introduced at `B0`
- `maleta` is `focus` in one interaction and `reinforcement` later
- `mostrador` is still grounded in the world before it is part of the learner's tracked pool
- `cinta verde` can appear only in later variants or sparse ambient look-ahead

### 2. Use One Shared Cumulative Lexicon Per Target Language

Lexical planning must assume:

- one shared lexicon per target language
- cumulative availability by `introductionBand`
- interaction authoring draws from that cumulative tracked pool

This means:

- a learner placed at `B2` gets the tracked `B0 + B1 + B2` pool immediately
- a learner placed at `B4` gets the full tracked pool for the supported slice
- interaction `focus` and `reinforcement` are chosen from that learner-available tracked pool

Lexical planning therefore needs to know both:

- which rows exist in the shared lexicon
- which rows are available to the learner at the selected band

### 3. Use Explicit Scene Roles Plus an Ambient Halo

Sugarlang should standardize on a small set of tracked interaction roles:

- `focus`
  - the vocabulary entry is intentionally foregrounded and may be required for success
- `reinforcement`
  - the learner is expected to re-encounter and practice the entry again
- `ambient`
  - the tracked entry may appear in the interaction, but it is not the current teaching target

In addition, interactions may allow a small ambient halo of:

- higher-band tracked entries
- untracked flavor language

This halo is not the same thing as the tracked teaching subset.

The lexical-planning layer should therefore help bound:

- how many `focus` items an interaction is trying to teach
- how much `reinforcement` is being carried forward
- how much ambient look-ahead is acceptable before the interaction becomes noisy or unfair

### 4. Make Quest Lexical Fit a First-Class Capability

Not every quest beat is equally suitable for every band.

Sugarlang therefore needs a lexical-fit capability that can evaluate candidate vocabulary entries using factors such as:

- frequency and range
- quest centrality
- visual groundability
- concreteness
- reusability across other scenes
- response-mode compatibility
- band appropriateness

This capability should answer questions such as:

- is this quest too lexically dense for `B0`
- which vocabulary entries are safe to foreground now
- which grounded entries should remain only ambient
- should this band use a simpler concrete variant
- is the interaction's ambient halo too dense for the selected band
- is the slice drifting away from its cumulative band targets

### 5. Treat Frequency as an Input, Not the Law

Frequency-banded vocabulary remains useful, especially early.

But Sugarlang should not force quest design to follow a raw "top words only" rule.

For an immersive game, a concrete quest-critical entry can be a good early candidate even when it is not one of the absolute most frequent words in general language.

That is why an entry like `maleta` can be valid early:

- it is central to the quest
- it is concrete
- it is visually groundable
- it is easy to recycle across the quest loop

Frequency helps rank candidates, but lexical fit must still consider task centrality, grounding quality, and interaction usefulness.

### 6. Persist Lexical Planning in Canonical Artifacts

Lexical planning should be persisted as part of the canonical Sugarlang overlay, not reconstructed ad hoc every time.

At a strategic level, the artifact model should be able to express:

- candidate vocabulary-entry inventory for an interaction
- vocabulary-entry-to-grounded-target links
- per-row `introductionBand`
- per-interaction tracked roles (`focus`, `reinforcement`, `ambient`)
- optional ambient-halo allowances
- cumulative count targets and validation notes
- accepted versus suggested lexicon plans

That allows:

- AI-assisted drafting
- human correction
- deterministic validation
- preview overlays that show the current teaching subset on the same stable grounded target

### 7. Feed the Lexical Plan into Runtime

The lexical plan is not only for the writer.

Runtime systems should be able to use it when deciding:

- which target-language vocabulary entries must remain visible in mixed delivery
- which vocabulary may appear in chips or word banks
- which entries should appear only as ambient halo
- which lower-band entries are eligible for reinforcement
- which later-band descriptors are still forbidden as tracked teaching targets in early-band interactions

This keeps the product coherent across:

- initial delivery
- repair
- response scaffolds
- inspect and pickup steps
- completion and return beats

### 8. AI Helps Plan the Lesson, Not Just Translate the Scene

The important AI contribution here is not literal translation.

It is:

- extracting candidate vocabulary entries from the authored quest
- linking them to grounded targets
- scoring lexical fit
- proposing `introductionBand` assignments and interaction roles
- proposing simpler or richer concrete variants
- flagging weak lexical fit, overloaded bands, or cumulative count drift

That is the step that makes the dream authoring flow credible for a solo writer who is not a language expert.

## Writer-Facing Implications

This ADR is what makes the following authoring surfaces meaningful instead of decorative:

- Scenario Panel
- Learner Band Matrix
- Grounding Map Editor
- Grounded Quest Binding Editor
- Preview Simulation
- Validation reports with cumulative-count signals

Without lexical planning, those surfaces cannot tell the writer:

- what the interaction is teaching
- why that is appropriate for the band
- what is present in the world but not yet part of the learner's tracked pool
- whether the cumulative slice still matches the band contract

## Alternatives Considered

### 1. Treat Every Grounded Referent as a Tracked Teaching Target

Rejected.

Why:

- overloads early bands
- confuses presence with pedagogy
- makes progression hard to inspect

### 2. Use Raw Frequency as the Only Selection Rule

Rejected.

Why:

- ignores quest centrality
- ignores grounding quality
- excludes some of the best immersive teaching targets

### 3. Hide Lexical Planning Inside Surface Lines Only

Rejected.

Why:

- too brittle
- too hard to validate
- too hard to regenerate safely
- not writer-reviewable

### 4. Let Quest Progression Stand In for Vocabulary Availability

Rejected.

Why:

- conflicts with placement
- breaks higher-band entry assumptions
- makes the same interaction behave inconsistently for learners placed at different bands

## Technology and Pattern Options

Patterns compatible with this ADR include:

- scenario-level candidate vocabulary-entry inventories
- shared cumulative lexicon targets by band
- per-interaction vocabulary-role maps
- optional ambient-halo allowances
- lexical-fit notes or warnings attached to scenario validation
- AI-authored recommendations stored as reviewable draft metadata

The key requirement is explicit lexical planning, not one exact schema.

## Future-Compatible Growth Path

This decision is compatible with:

- fully hand-authored lexical plans
- external AI-assisted lexical planning
- future integrated lexical-planning services
- learner-specific runtime adaptation layered on top of the authored cumulative band contract
