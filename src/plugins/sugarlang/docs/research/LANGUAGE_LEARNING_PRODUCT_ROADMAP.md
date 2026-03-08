# Language Learning Product Roadmap (Tighter V1)

## Superseded Notice

This document is retained as historical product research context.

The canonical Sugarlang product and delivery contracts now live in:

- `src/plugins/sugarlang/docs/product/README.md`
- `src/plugins/sugarlang/docs/product/contracts/`
- `src/plugins/sugarlang/docs/architecture/sugarlang-strategic-architecture.md`
- `src/plugins/sugarlang/docs/plans/001-sugarlang-v1-implementation-plan.md`

## 1) Why This Document Exists

This document is a tighter companion to `LANGUAGE_LEARNING_ADAPTATION_ROADMAP.md`.

Its purpose is to convert the broad language-learning direction into a buildable product roadmap that:

- fits the final Sugarlang architecture
- avoids over-scoping the first implementation
- uses a learner model that is more reliable than a single CEFR guess
- introduces adaptation only where we can validate it
- supports an English-first, AI-assisted authoring workflow for a solo creator

This roadmap assumes SugarEngine core is already functional enough to support:

- structured scripted dialogue and quest content
- persistent plugin state
- stable IDs for quests, objectives, dialogue nodes, NPCs, and world objects
- optional provider-based conversation extensibility
- one in-game conversational vertical slice

The first shipped Sugarlang slice should assume:

- the base game content is authored in English
- target languages: English and Spanish
- support languages: English and Spanish
- normal player-facing language pairs:
  - English support -> Spanish target
  - Spanish support -> English target

## 2) Product Thesis

Build a conversation-driven RPG layer where language difficulty adapts to the player without changing the underlying story.

The core promise is not "perfectly grade the player."

The core promise is:

- keep the player in the story
- keep input understandable
- keep output demands slightly challenging
- improve over time using evidence gathered from real play

## 3) Product Principles

### Principle A: Story Progression and Language Difficulty Must Stay Separate

Narrative intent should remain stable.

Language rendering should vary by learner state.

This keeps content scalable and prevents every quest from needing multiple hand-authored versions.

### Principle B: CEFR Is a Reporting Layer, Not the Main Control Variable

We may still produce estimated CEFR bands for reporting or coarse placement, but the runtime adaptation system should not primarily depend on a single A1-C2 label.

Free-form turns are too noisy for that to be trustworthy on their own.

### Principle C: Beginners Need Scaffolding Before Free-Form Dialogue

A1 and early A2 users should not be thrown directly into unconstrained free typing as the default interaction mode.

The product should support a progression like:

- comprehension + choice
- partial production
- short constrained production
- free-form production

### Principle D: Support-Language Mixing Is a First-Class Learning Lever

The runtime should not think only in terms of:

- target language only
- translation on/off

It should support deliberate mixtures of target language and support language by band, task, and moment.

Examples:

- support-language framing with protected target-language keywords
- inline or on-demand glosses
- bilingual hints that fade over time

This is especially important for beginner immersion because it lets the game stay playable while still keeping high-value target-language vocabulary visible.

### Principle E: World Grounding Is a First-Class Learning Lever

Vocabulary and phrases should be tied to visible world referents whenever possible.

That includes:

- objects
- attributes
- spatial relations
- interactable regions
- quest actions

The product should exploit the fact that it is a game and not just a chat window.

### Principle F: Adaptation Must Be Conservative

The system should not jump difficulty quickly based on one strong or weak turn.

Difficulty changes should be small, explainable, and reversible.

### Principle G: Evaluation Is Part of the Product, Not a Final Cleanup Step

Every phase should create artifacts we can replay, inspect, and score.

If we cannot evaluate adaptation quality offline, we should not trust it in live play.

### Principle H: English-First, AI-Assisted Authoring Must Be the Default Workflow

The creator should be able to author the game in English first and let Sugarlang draft the language-learning layer.

That means:

- the creator writes quests and dialogue as normal game content
- Sugarlang derives semantic scenarios and learner-band overlays from that content
- AI assistance is available from both the editor and chat/CLI workflows
- the generated artifacts are human-readable and refinable

## 4) V1 Product Boundary

The first real product slice should be intentionally narrow.

### In Scope for V1

- two target languages: English and Spanish
- two support languages: English and Spanish
- one small domain: daily social/task interactions
- one short quest slice
- English-authored source content with AI-generated Sugarlang overlays
- deliberate support-language mixing for beginner and intermediate bands
- strong scene grounding for objects, attributes, and spatial language
- two or three NPCs with distinct personas
- typed input only
- text output only
- one primary feedback mode
- adaptation based on bounded learner signals

### Out of Scope for V1

- multi-language generalization
- speech recognition
- pronunciation scoring
- claims of formal CEFR certification quality
- manual expert-only pedagogy authoring as the primary content workflow
- open-world adaptive dialogue across the whole game
- multiple correction philosophies per NPC
- fully dynamic grammar tutoring

### Authoring Operating Model

V1 should assume an English-first workflow:

1. the creator authors quests, dialogue, NPC setup, and world structure in English
2. Sugarlang reads that authored structure
3. Sugarlang drafts:
   - semantic learning scenarios
   - communicative tasks
   - grounding maps
   - learner-band renderings
   - support-language policies
   - response contracts
   - deterministic evaluation rules
4. the creator refines those drafts in the editor or via chat

Source of truth should be:

- human-readable files under the game root
- not SQLite

SQLite or similar local databases are acceptable only for:

- caches
- search indexes
- replay lookup
- evaluation/reporting acceleration

## 5) The Runtime Learner Model

Instead of centering the system on a single `estimatedLevel`, V1 should use a multidimensional `LearnerState`.

### Required V1 LearnerState Fields

- `targetLanguage`
- `supportLanguage`
- `comprehensionBand`
- `productionBand`
- `vocabularyBand`
- `grammarBand`
- `repairBand`
- `confidence`
- `recentPerformanceTrend`
- `helpUsageRate`
- `supportLanguageUsage`
- `frustrationSignals`
- `knownStructures[]`
- `unstableStructures[]`
- `recentVocabulary[]`

### Optional Derived Fields

- `estimatedCEFR`
- `estimatedCEFRConfidence`

These derived fields are useful for dashboards and coarse segmentation, but should not be the main knob driving turn-by-turn adaptation.

## 6) The Turn Evidence Model

Each turn should store evidence, not just conclusions.

### Required Per-Turn Evidence

- player input text
- intended scene/task objective
- whether the communicative goal was achieved
- support-language scaffolds shown or requested
- grounding aids shown or used
- comprehension evidence
- production complexity evidence
- vocabulary evidence
- grammar evidence
- repair behavior
- help or hint usage
- latency proxy if available
- analyzer confidence

This gives the system a basis for trend detection and debugging.

It also makes later evals possible when the adaptation behaves badly.

## 7) The Missing Middle: Intent-to-Render Pipeline

The adaptation system needs an explicit rendering pipeline.

Without it, "make the NPC easier or harder" is too vague to be reliable.

### Required Pipeline

`scene intent -> pedagogical target -> candidate utterances -> constraint validation -> final rendered line`

### Constraint Categories

- maximum sentence length
- vocabulary tier
- allowed grammar structures
- target-language ratio
- support-language policy
- grounding affordances allowed
- support affordances allowed
- correction style allowed

### Recommended V1 Strategy

Use constrained templates or candidate pools before relying on open-ended generation.

A mixed strategy is acceptable:

- authored semantic intents
- small candidate pools
- optional LLM rewriting within validated bounds

This is safer than asking an LLM to improvise level-appropriate language with no hard constraints.

## 8) Interaction Mode Progression

V1 should explicitly stage production demands.

### Mode 1: Comprehension First

Player demonstrates understanding through:

- choice selection
- confirmation
- simple classification

### Mode 2: Partial Production

Player responds through:

- fill-in prompts
- short phrase completion
- limited structured text

### Mode 3: Short Free-Form

Player produces one short idea within clear task bounds.

Example:

- ask for an item
- answer a direct question
- ask where something is

### Mode 4: Open Free-Form

This should only unlock when evidence supports it.

It should not be the assumed baseline for all users.

## 9) Feedback Strategy for V1

V1 should not attempt every pedagogical response mode.

Pick one mode that is useful, learnable, and compatible with immersion.

### Recommended V1 Mode

Implicit recast by default, with optional hint or explicit explanation on request.

This gives the player support without turning every exchange into a correction session.

### Not Recommended for V1

- aggressive explicit correction every turn
- persona-specific correction strategies
- deep grammar explanations inline

## 10) Revised Phase Plan

### Phase LL-0: Scope Lock and Eval Seed Set

Deliverables:

- define the V1 scenario, NPC set, and target task set
- define the Sugarlang authoring overlay model for generated scene drafts
- define the initial learner state schema
- define the turn evidence schema
- define stable scene references from English-authored quest/dialogue content
- build a seed transcript set for replay and scoring

MVP check:

- one replayable transcript pack exists for the chosen quest slice
- plugin persistence saves learner state and turn evidence cleanly

### Phase LL-1: Learner State and Evidence Collection

Deliverables:

- implement learner-state updates from turn evidence
- distinguish comprehension from production
- add trend smoothing and confidence handling
- derive CEFR only as a secondary summary field

MVP check:

- known test transcripts produce stable learner-state updates
- the system does not overreact to single-turn noise

### Phase LL-2: Intent Rendering and Constraint Validation

Deliverables:

- define scene intents for the V1 quest slice
- implement extraction from English-authored scene content to Sugarlang scenario drafts
- implement candidate utterance selection/rendering
- add validators for vocabulary, grammar, sentence length, and language ratio
- fail safely when a generated line violates constraints

MVP check:

- the same intent can render at multiple difficulty profiles
- invalid renderings are rejected or downgraded predictably

### Phase LL-3: Beginner-Safe Interaction Loop

Deliverables:

- implement Mode 1 and Mode 2 interaction flows
- gate short free-form behind learner-state thresholds
- add support affordances such as repeat, hint, and optional translation

MVP check:

- an early learner can complete the V1 quest slice without relying on unrestricted free typing

### Phase LL-4: Conservative Adaptation Policy

Deliverables:

- map learner state to response policy
- adjust only a few variables at first:
  - sentence length
  - vocabulary tier
  - grammar allowance
  - support level
- add pacing rules to prevent large jumps

MVP check:

- the same NPC and intent behave differently for mocked beginner and intermediate profiles
- difficulty changes remain gradual across transcript replay

### Phase LL-5: Pedagogical Feedback Layer

Deliverables:

- implement default recast behavior
- allow optional hint/explanation requests
- classify a small set of error types for response shaping

Recommended initial error classes:

- agreement
- tense
- word choice
- word order

MVP check:

- common scripted mistakes trigger consistent response behavior
- feedback remains brief and does not break scene flow

### Phase LL-6: Longitudinal Progress and Reinforcement

Deliverables:

- add durable progress snapshots
- distinguish recent success from stable mastery
- add exposure tracking for target vocabulary and structures
- add hooks for spaced reappearance

MVP check:

- multi-session runs show progression history without unstable swings
- recently shaky material can be resurfaced intentionally

### Phase LL-7: Generalization and Expansion

Deliverables:

- expand the V1 slice to more quests or NPCs
- test whether the same learner-state and rendering model holds up
- verify AI-generated authoring drafts remain round-trip-safe and reviewable
- only after stability, consider a second language

MVP check:

- the system scales to additional content without bespoke adaptation logic for every scene

## 11) Release Gates for the First Language-Learning Prototype

Do not call the feature ready until all of the following are true:

- the V1 quest slice is playable start to finish
- beginner users can progress without full free-form typing
- adaptation is driven by learner-state dimensions, not just CEFR labels
- intent rendering is constrained and validated
- transcript replay catches obvious mis-leveling cases
- feedback behavior is consistent for common mistakes
- disabling the language-learning layer does not break normal game behavior

## 12) Main Risks and Design Responses

### Risk: Mis-leveling from Thin Evidence

Response:

- use multidimensional state
- track confidence
- smooth updates over time

### Risk: Fluent but Pedagogically Bad Output

Response:

- constrain rendering
- validate outputs
- prefer bounded candidate generation over unconstrained generation

### Risk: Beginners Bounce Off the System

Response:

- stage interaction modes
- keep comprehension and partial production as first-class modes

### Risk: Team Overbuilds Before Proving Learning Value

Response:

- lock V1 to one language, one domain, one correction style, one short quest slice

## 13) What Success Looks Like

The first successful prototype should not try to prove full language mastery.

It should prove four narrower things:

1. The same story content can be rendered at different difficulty levels without breaking meaning.
2. The system can adapt using more than a single CEFR guess.
3. Beginners can participate without being forced into unconstrained free-form dialogue.
4. The team can evaluate and debug adaptation behavior through replayable transcripts.

## 14) Recommended Build Order

If SugarAgent core is ready, the recommended implementation order is:

1. LL-0
2. LL-1
3. LL-2
4. LL-3
5. LL-4

Only after those are stable should the team move on to:

1. LL-5
2. LL-6
3. LL-7

That order gives the project a realistic path to a credible first language-learning prototype instead of an overgeneralized research system.
