# Sugarlang Product Use Cases

## Purpose

This directory defines the canonical product story for `sugarlang`.

These docs should let product, design, engineering, and AI-assisted authoring all answer the same question:

What are we actually building?

The answer is not "a translation strip over a game."

The answer is:

- an immersive language-learning game
- where the player learns through quest context, grounded world meaning, and conversational repair
- where mixed target/support language is used deliberately and fades as the learner grows
- where `sugaragent` is optional, not required

## Source Documents

- [Sugarlang Strategic Architecture](../architecture/sugarlang-strategic-architecture.md)
- [Sugarlang AI-Assisted Authoring Workflow](./authoring-workflow.md)

Historical research context:

- [Language Learning Product Roadmap](../research/LANGUAGE_LEARNING_PRODUCT_ROADMAP.md)

Additional product framing:

- [Wordlark Episode Writing Template](./wordlark-demo-sandbox-episode-template.md)

## V1 Pedagogical Contract Docs

- [V1 Quest, Scenario, Interaction, and Binding Model](./contracts/v1-quest-scenario-interaction-binding-model.md)
- [V1 Learner Band Matrix](./contracts/v1-learner-band-matrix.md)
- [V1 Language Content Model](./contracts/v1-language-content-model.md)
- [V1 Lexicon and Interaction Curriculum Model](./contracts/v1-lexicon-and-scene-curriculum-model.md)
- [V1 Cumulative Banded Lexicon Contract](./contracts/v1-cumulative-banded-lexicon-contract.md)
- [V1 Authoring Artifact Model](./contracts/v1-authoring-artifact-model.md)
- [V1 Grounded Quest Binding Model](./contracts/v1-grounded-quest-binding-model.md)
- [V1 Golden Slice: Find the Luggage](./contracts/v1-find-the-luggage-golden-slice.md)

These concrete use cases are written primarily from the `English support -> Spanish target` perspective because that is the main learner-testing path.

The same band and contract model must also support the opposite `Spanish support -> English target` pairing and additional target-language packs such as Italian.

## Core Domain Model

Sugarlang sits on top of normal SugarEngine quest content.

The plain-English domain model is:

- `Quest`
  - the engine-owned progression graph
- `Scenario`
  - the Sugarlang overlay for one quest
- `Interaction`
  - one learner-facing communicative beat inside that scenario
- `Turn`
  - one exchange inside an interaction

The important ownership rule is:

- quest truth stays in SugarEngine
- Sugarlang associates one scenario to the quest
- `Sync From Quest` traverses the quest graph and derives interactions inside that scenario
- target languages and learner bands change how each interaction is rendered, not what the quest truth is

For the full binding contract, see [V1 Quest, Scenario, Interaction, and Binding Model](./contracts/v1-quest-scenario-interaction-binding-model.md).

## Deterministic First-Pass Interaction Generation

For bounded scripted quest dialogue, V1 should not require the writer to hand-author every learner band.

`Sync From Quest` should be able to read a simple English-authored quest beat such as:

- `Hello. My name is Bippity. I am the Station Master.`

and deterministically derive a full Sugarlang interaction bundle for each supported band.

That bundle is not just a translated NPC line.

For each band, it should persist:

- the NPC line
- `focus`, `reinforcement`, and `ambient` vocabulary roles
- the primary response contract
- the visible response scaffold
- the repair ladder
- the evaluation target
- the quest-success hook

This first pass is allowed to be simple and somewhat blunt.

It should still be:

- grounded
- structurally correct
- repair-aware
- previewable
- persisted in reviewable files

Later, a writer or optional LLM-assisted pass may improve only the surface wording, such as:

- NPC line phrasing
- repair line phrasing
- mixed-language glue

That later polish should not silently change:

- interaction identity
- source bindings
- vocabulary roles
- response contract
- evaluation target
- quest-success hook

See [Deterministic Banded Turn Generation](../api/deterministic-banded-turn-generation.md).

## Lexicon and Interaction Roles

Sugarlang owns one shared lexicon per target language for the whole game.

That lexicon is the shared teaching dictionary for that language.

It is:

- not a scenario-local word list
- not a separate lexicon per band
- not a full dictionary of the language

Each lexicon row, meaning one vocabulary entry the game tracks, has stable fields such as:

- lexical entry id
- preferred target-language form
- gloss
- category
- first or introduction band

Interactions then consume that shared pool by giving current items a role in the live experience:

- `focus`
- `reinforcement`
- `ambient`

The key distinction is:

- `introductionBand` is a stable lexicon property
- `focus`, `reinforcement`, and `ambient` are interaction- or moment-level roles

That keeps the ownership clean:

- lexicon = shared teaching dictionary
- interaction overlay = what is active right now and how it is delivered

The lexicon is also cumulative by band:

- a `B2` learner gets the cumulative `B0 + B1 + B2` vocabulary pool immediately
- a `B4` learner gets the full tracked vocabulary pool for the supported game slice
- interaction `focus`, `reinforcement`, and `ambient` are drawn from that cumulative pool, not from quest order

V1 planning targets per target language for the supported slice are:

- `B0` cumulative pool: `60`
- `B1` cumulative pool: `150`
- `B2` cumulative pool: `300`
- `B3` cumulative pool: `550`
- `B4` cumulative pool: `850`

See [V1 Cumulative Banded Lexicon Contract](./contracts/v1-cumulative-banded-lexicon-contract.md).

For the plain-English domain/API glossary, see [Lexicon, World Object, and Grounding Glossary](../api/lexicon-world-object-and-grounding-glossary.md).

## Shared Quest Definition

`UC-001` through `UC-005` are different learner-facing realizations of the same quest.

`UC-006` is the writer-facing happy-path for authoring that same quest as a scripted-only Sugarlang lesson/quest inside SugarEngine.

The shared quest is:

- quest name: `Find the Luggage`
- setting: a train station or port terminal
- narrative objective: help an NPC identify and recover a missing piece of luggage
- core quest steps:
  1. talk to the station clerk or traveler
  2. understand the luggage description
  3. identify or ask about the luggage location
  4. locate and interact with the correct luggage in the world
  5. pick it up or otherwise complete the authored recovery action
  6. return and confirm completion

What changes across bands is not the quest truth.

What changes is:

- how much mixed support language is present in the initial line, repair, and happy-path responses
- which target-language words stay visible while support language carries the rest
- how strongly the interaction and UI ground meaning
- how much productive language the player is asked for
- when chips, hints, and fallback scaffolds appear
- how strictly language form is evaluated versus communicative success

## What Makes Sugarlang Different

Sugarlang should not model language learning as:

- show target sentence
- show translation
- ask worksheet-style question

It should model language learning as:

- hear or read something in the target language
- try to understand through context
- signal confusion when needed
- receive repair through simpler phrasing, mixed support language, and grounded interaction help
- act in the world
- re-encounter the same vocabulary in meaningful quest actions

That is the core product difference.

## Working Terms

These docs use the following terms in a strict way:

- `chip`
  - a selectable token or very short chunk
  - used to compose a response or insert target-language material into a response
- `word bank`
  - a bounded pool of candidate words or short chunks used to fill one or more authored blanks
  - may include plausible interaction-grounded distractors, not just correct answers
- `response`
  - the utterance or action the player actually submits
- `response mode`
  - the way the response is produced, such as object selection, chip composition, word-bank blank fill, guided assembly, constrained text, open text, or a hybrid
- `response scaffold`
  - the UI support around the response mode, such as chips, word banks, blanks, hints, or insertion helpers
- `repair response`
  - a fallback response option available alongside the primary response mode
  - may be a fixed response such as `No entiendo` or `Señálalo`
  - may be a templated clarification response rendered in the target language, such as Spanish-target `¿Qué significa "__" en inglés?`
  - the support-language name inside that utterance should also be localized to the target language, such as `inglés` or `español`
  - in tap-only bands, the blank should be prefilled from the NPC line
  - manual clarification entry should appear only once typed interaction is introduced

Chips are not full responses.

## Four Core Product Levers

### 1. Repair-Driven Immersion

Every band should support repair.

The player should be able to signal things like:

- `I don't understand.`
- `Say it more simply.`
- `What does that mean?`
- `Point to it.`
- `Use my language.`

The exact surface form changes by band, but the product principle stays the same:

- target language comes first when appropriate
- repair is available when needed
- repair is delivered in-world, not as a detached classroom explanation

### 2. Mastery-Aware Mixed Language

Sugarlang should not default to full-line translation strips.

Instead, it should mix the target language and support language according to what the learner is expected to know.

If `maleta` is an active teaching item and `roja` is already being reinforced, but `ves` is still unknown, a repair can look more like:

- `Do you see la maleta roja?`

not:

- `Find the red maleta.`

The mixed-language policy should be:

- token-aware
- band-aware
- mastery-aware
- interaction-aware
- natural-sounding

Mixed-language lines should sound like believable in-world helper utterances, not arbitrary token substitution.

That means:

- switch languages at natural clause or chunk boundaries when possible
- preserve full target-language vocabulary entries or noun phrases where they carry the learning goal
- if a mixed line sounds unnatural, keep the line natural and move more support into the scaffold or repair instead of forcing the mix

The progression should be explicit:

- `B0`: the initial line and the happy-path response may be mostly support language with 1-3 active target items held in the target language
- `B1`: the initial line is still mixed, but more target-language chunks carry through; the happy-path response may already be fully target language if that sounds more natural
- `B2`: the initial line is mostly target language; support language moves into repair, helper prompts, or insert scaffolds
- `B3`: target language is the default; mixed language appears only on failure or by request
- `B4`: target language is effectively the whole experience unless the learner explicitly asks for help

### 3. Grounded Quest Action

Words should stay attached to real game referents and actions.

If the player is learning `maleta`, that referent should remain stable across:

- the NPC description
- repair lines
- chips and typed prompts
- object highlights
- inspect or pickup actions
- inventory item labels
- return or handoff steps

The player should not just identify a word.

The player should use that word while actually completing the quest.

### 4. Lexical Recycling and Spaced Retrieval

Sugarlang should deliberately re-introduce target vocabulary over time.

That means:

- the NPC uses the word
- the repair line uses the word again
- the chip sets and response scaffolds recycle the word
- the object label or inventory label uses the word
- the completion line uses the word again

This is planned lexical recycling and spaced retrieval, not random repetition.

The product should prefer response choices like:

- `Sí, I see la maleta roja.`
- `I don't see la maleta roja.`
- `Here is la maleta.`

over empty acknowledgements like:

- `Sí`
- `No`

when the interaction can support richer vocabulary reuse without overloading the learner.

## Progressive Bands Across Those Levers

| Band | Core player experience | Support-language posture | Chip role | Grounding posture |
| --- | --- | --- | --- | --- |
| `B0 Anchored Recognition` | understand through context and build a heavily mixed response around a few active target words | heavy in the initial line, repair, and response scaffold | primary response mode | always-on highlights, pointing, object anchors |
| `B1 Guided Response` | fill in short quest-relevant responses with narrower but still visible mixed delivery | still present in the initial line and scaffold, but reduced from `B0` | word-bank blank fill and guided assembly | persistent object, color, and location bindings |
| `B2 Constrained Exchange` | type one short idea after a mostly target-language prompt, with visible structured help | moderate, mostly in repair and helper prompts | visible support scaffold, no longer the only path | object and region grounding still explicit |
| `B3 Independent Task Dialogue` | handle a short exchange and ask for clarification | low by default, available on request or failure | fallback or on-request help after failed typing | reveal-based grounding tied to task needs |
| `B4 Natural Interaction` | complete the task mostly through natural dialogue | minimal, mostly on demand | hidden behind help or repair affordances | world-first and naturalistic |

## Product Rules for Chips and Other Scaffolds

Chips stay in the product.

What changes is their role.

In these docs, chips are:

- selectable tokens
- very short chunks
- used for chip composition or typed insertion help

They are not the full response by themselves.
They are not repair responses.
Repair responses are a separate fallback surface that may appear alongside chips, not inside them.

The V1 rule is:

- `B0`: chip composition is the primary response mode
- `B1`: word-bank blank fill and guided assembly become primary
- `B2`: typing becomes primary, a small insert tray may remain visible as support, stronger repair controls should appear after failure, and the final rescue can reveal a support-language paraphrase
- `B3`: typing is primary; no visible support appears on first exposure, and the staged repair ladder appears only after failure
- `B4`: chips are hidden by default and only surfaced as explicit fallback support

This preserves the good part of the current MVP while making the progression feel more immersive.

## Product Rules for Repair

Repair should be authored as part of the conversation contract, not bolted on as generic help UI.

Typical repair responses include:

- repeat
- simplify
- support-language rephrase
- point/highlight
- glossary reveal for one item
- repair responses such as `No entiendo` or `Señálalo`
- clarification responses rendered in the target language, such as Spanish-target `¿Qué significa "__" en inglés?`
- insert chips for key target-language words or short chunks

At typed bands, Sugarlang should distinguish between:

- visible support scaffolds
  - for example a small insert tray that is part of the initial typed-response surface
- stronger repair controls
  - for example `Show me more words`, `Say it more simply`, or a clarification repair response

The stronger repair controls should usually appear only after failure, not as part of the first typed exposure by default.

For `B2`, the preferred repair ladder is:

1. first failure
   - reveal `Show me more words`
   - reveal `Say it more simply`
2. second failure
   - keep both actions available
   - strengthen their outputs:
     - `Show me more words` expands the visible insert tray
     - `Say it more simply` drops the NPC phrasing toward the next-lower band while staying in the target language
3. third failure
   - add `Say it in {supportLanguage}` as the last-resort rescue
- this should reveal a support-language paraphrase for that turn, not turn the interaction into a permanent subtitle strip

The product should prefer repair that uses:

- the world
- the quest state
- the active vocabulary

before resorting to explicit explanation.

## Product Rules for Grounding

Grounding is not just a highlight effect.

For V1, grounding should be able to bind language to:

- world objects
- visible attributes such as color, size, or material
- regions and landmarks
- quest actions such as inspect, pick up, point to, return, or give
- inventory objects after pickup

The grounded quest binding contract is defined in [V1 Grounded Quest Binding Model](./contracts/v1-grounded-quest-binding-model.md).

## Current Authoring Baseline in SugarEngine

The current editor already gives designers the base quest skeleton:

- `Dialogues` for authored dialogue trees
- `Quests` for quest stages and objectives
- `NPCs` for default dialogue and interaction mode
- `Regions` for placing NPCs, pickups, inspectables, and landmarks
- `Episode Details` for main quest and start region

Relevant current engine behavior:

- quest-to-dialogue routing is documented in `docs/dev/quest-episode-integration.md`
- dialogue authoring behavior is documented in `docs/api/06-dialogue.md`

## English-First, AI-Assisted Authoring Model

The creator workflow remains:

1. author the game in English using normal SugarEngine tools
2. ask Sugarlang to run `Sync From Quest` for the selected quest
3. review and refine the generated overlay in SugarEngine or hand that same bounded job to an external workspace assistant such as Codex
4. preview and validate the same interactions across learner bands and language pairs

This generation step should be available through one shared artifact model from:

- the editor UI
- a generated packet plus task handoff to an external workspace assistant
- direct structured-file editing

All three should target the same Sugarlang files and contracts.

## Authoring Principle: Stable Referents, Band-Specific Lexical Activation

The writer should not have to choose between:

- a stable quest/world object or landmark
- and progressive vocabulary teaching

Sugarlang should model those as related but separate things.

The clean authoring model is:

- `world object`
  - the actual thing in the quest or world
  - suitcase, counter, ribbon, door
- `vocabulary entry` or `lexicon row`
  - the word or phrase the game tracks and teaches
  - `suitcase`, `maleta`, `where is`
  - internally it may line up to a stable key such as `object.suitcase`
- `grounding`
  - the link between the vocabulary entry and the world object
- `interaction role`
  - how that lexicon row is being used right now
  - `focus`
  - `reinforcement`
  - `ambient`

That means the same suitcase can exist at every band, while the language foregrounded around it changes by interaction and band.

For example:

- the suitcase referent may exist in `B0` through `B4`
- `maleta` may be introduced at `B0` and used as `focus` in an early interaction
- `roja` may be `focus` in one interaction and later return as `reinforcement`
- `mostrador` may not enter the shared lexicon until `B2` or `B3`
- `cinta verde` may appear later as a higher-band vocabulary entry or as `ambient`

So the quest truth stays stable.

The learner-facing vocabulary emphasis changes.

### Quest Lexical Fit

Not every quest beat is equally good for every band.

Sugarlang should therefore help the writer evaluate an interaction's `lexical fit` for each band.

The system should extract candidate vocabulary entries from the authored quest and score them using inputs such as:

- frequency tier
- quest centrality
- visual groundability
- concreteness
- reusability in later quests
- learner-band appropriateness

Frequency matters.

It should not be the only rule.

A quest-central, perfectly groundable word like `maleta` may deserve early introduction even if it is not one of the absolute highest-frequency words in the language overall.

### AI's Role in Authoring

This is exactly where AI should help on the design side.

The AI should:

- read the authored quest and interaction source
- extract candidate world objects and candidate vocabulary entries
- score them for band suitability
- suggest which vocabulary entries should be `focus`, `reinforcement`, or `ambient`
- warn when a quest beat is a poor fit for a band
- propose simplifications, sub-beats, or variant objects when needed

The AI should not just translate lines.

It should help the writer decide what this quest can responsibly teach at each band.

## Runtime Language Model

The base game is authored in English.

That is not a runtime setting.

The runtime only needs to model:

- `target language`
  - the language the player is learning
- `support language`
  - the learner's scaffold language, usually their strongest or native language
  - used for scaffolding, repair, hints, and mixed-language prompts

For the initial product:

- supported target languages: English and Spanish
- supported support languages: English and Spanish
- normal player-facing pairs:
  - `supportLanguage = English`, `targetLanguage = Spanish`
  - `supportLanguage = Spanish`, `targetLanguage = English`

## Source of Truth and Storage Model

Sugarlang content should be persisted as human-readable JSON files under the game root.

The canonical on-disk layout is defined in [ADR-SL-001](../adr/001-english-first-authoring-overlay-and-source-of-truth-model.md).

At the product level, the important split is:

- project-level plugin configuration
- scenario-owned semantic and grounding data
- scenario-owned grounded quest binding data
- shared defaults
- per-target-language learning packs
- eval artifacts
- disposable caches or indexes

SQLite is acceptable for caches and derived artifacts.

It should not be the canonical source of authored Sugarlang content.

## Proposed Sugarlang Authoring Surfaces

These use cases assume the following Sugarlang authoring surfaces exist somewhere in the shared authoring system, with the editor acting as one client of that system.

V1 does not require the full suite to exist as dedicated editor panels.

The full integrated suite is post-V1 work and belongs to Phase 6 of the implementation plan.

### 0. Draft Generation Actions

Purpose:

- generate or regenerate Sugarlang drafts from English-authored content
- support the same actions from editor, an external workspace assistant, and direct structured-file editing
- generate bounded draft packets and assistant-task handoff text when direct in-editor drafting is not the chosen path

V1 implementation note:

- the full shared authoring vision does not require all of these surfaces as dedicated editor panels in Phase 4
- the minimum Phase 4 editor scope is project configuration, artifact-backed preview controls, and artifact inspection/validation
- later phases should let the editor generate a bounded draft packet and copy a task handoff for Codex or another external assistant without forcing the writer to invent the prompt manually

### 1. Sugarlang Scenario Panel

Purpose:

- bind the authored quest to a semantic learning scenario
- declare the communicative task
- declare interaction-supported learner bands
- review candidate referents and their quest lexical fit

### 2. Learner Band Matrix

Purpose:

- define how the same interaction behaves at `B0` through `B4`
- declare response posture, repair posture, support-language posture, and success expectations by band
- declare which shared vocabulary entries are `focus`, `reinforcement`, or `ambient` in each band

### 3. Repair and Support Policy Editor

Purpose:

- define what happens when the learner does not understand
- choose allowed repair responses such as repeat, simplify, support-language rephrase, pointing, `No entiendo`, `Señálalo`, and target-language clarification templates such as Spanish-target `¿Qué significa "__" en inglés?`
- decide when those repairs are primary, visible, on request, or failure-triggered

### 4. Response Scaffold Editor

Purpose:

- choose primary response modes
- choose fallback response modes
- define chips, word banks, blanks, constrained text, insert helpers, and fallback repair responses
- ensure response choices recycle active vocabulary where appropriate

### 5. Grounding Map Editor

Purpose:

- bind concepts to objects, attributes, landmarks, and regions
- bind repair responses to highlights, pointing, inspect reveals, and camera focus
- show which grounded concepts are currently active versus backgrounded by band

### 6. Grounded Quest Binding Editor

Purpose:

- bind the same referent across world object, pickup, inventory, return, and quest progression
- ensure the learner-facing vocabulary remains attached to the real quest object throughout the loop

### 7. Placement and Preview Panel

Purpose:

- preview the same interaction at different bands and language pairs
- verify that chip use, repair behavior, and grounding intensity change correctly across progression

## Product Litmus Test

If a beginner interaction still feels like:

- a translated subtitle
- a worksheet
- a disconnected multiple-choice overlay

then it is not yet Sugarlang in the form these docs describe.

If it feels like:

- an in-world interaction
- with visible quest stakes
- grounded referents
- meaningful repair
- and progressive vocabulary reuse

then the product is on the right track.
