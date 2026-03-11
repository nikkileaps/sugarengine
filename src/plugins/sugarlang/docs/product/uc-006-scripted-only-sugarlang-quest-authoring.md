# UC-006: Scripted-Only Sugarlang Quest Authoring for a Writer

## Summary

This use case defines the end-goal authoring experience for a writer or game designer creating a fully scripted Sugarlang quest in SugarEngine.

Both `sugaragent` and `sugarlang` may be installed in the project.

For this quest, the writer intentionally uses:

- engine-owned quest and dialogue structure
- scripted conversation delivery
- Sugarlang adaptation, repair, grounding, evaluation, and preview

They do **not** rely on `sugaragent` for this quest's core teaching flow.

This is the happy-path, dream authoring experience if Phase 6 is done right.

## Persona

`Nikki`, age 39, is writing a narrative game and wants the language-learning layer to feel immersive, not classroom-like.

She is:

- a fluent English writer
- a strong narrative/quest designer
- not required to be a linguist
- willing to refine AI-assisted drafts
- careful about game feel, clarity, and pacing

## Project Context

The project has both plugins installed:

- `sugarlang`
- `sugaragent`

The writer chooses quest by quest, interaction by interaction, and NPC by NPC whether an interaction is:

- scripted-only
- agent-assisted
- hybrid

For `Find the Luggage`, she chooses `scripted-only` because:

- the quest is the first teaching slice
- the vocabulary progression must be tightly controlled
- the grounding and pickup loop must stay deterministic
- the same quest interactions must preview cleanly from `B0` through `B4`

## User Story

As a writer/designer, I want to write a normal English quest first, then use a dedicated Sugarlang authoring flow to turn it into an immersive scripted lesson/quest that I can preview across bands and language pairs without hand-authoring everything from scratch.

## Product Goal

Let the writer create a real quest with:

- narrative stakes
- clear objectives
- grounded objects and locations
- reusable NPC dialogue
- adaptive language-learning behavior

while keeping the authoring mental model coherent:

- story and quest truth stay in SugarEngine
- pedagogy and learner adaptation stay in Sugarlang
- free-form AI conversation remains optional, not required

## Core Authoring Loop

The writer-facing happy path should feel like one coherent loop:

1. write the base quest in English
2. ask SugarEngine to run `Sync From Quest` for the selected quest
3. let SugarEngine derive the scenario, interactions, bindings, and first-pass target-language overlays directly from that quest, or hand that same bounded job to Codex
4. review the resulting Sugarlang artifacts in the dedicated authoring surfaces
5. preview the interactions across bands, language pairs, and repair states
6. regenerate only the weak parts
7. accept the refined result as the canonical Sugarlang overlay

The important product point is that AI assistance is not a separate bonus workflow bolted onto the side.

It is one normal step inside the main authoring loop.

For simple scripted dialogue beats, that first pass should already contain the real learner-facing band package.

The writer should not have to hand-author every band from scratch just to get:

- a banded NPC line
- `focus`, `reinforcement`, and `ambient`
- repair ladders
- response scaffolds
- evaluation targets
- quest-success hooks

Later refinement may improve the surface wording, but the structured interaction should already exist after `Sync From Quest`.

## What the Writer Sees

The writer opens SugarEngine and works in a dedicated Sugarlang authoring flow layered on top of the normal quest/dialogue tools.

She starts by writing the base quest in English:

- quest: `Find the Luggage`
- NPC: `Station Clerk`
- objective 1: talk to the clerk
- objective 2: locate and collect the correct suitcase
- objective 3: return it

Then she opens the Sugarlang surfaces for that quest and immediately sees derive-and-review actions, not just empty panels.

The first meaningful action is something like:

- `Sync From Quest`
- `Regenerate Interaction`

From there, the system can:

- derive a first pass directly from the quest when that is available
- or generate the bounded packet plus copied Codex task that lets her use an external assistant without hand-explaining the whole system

The authoring surfaces below are therefore not passive inspectors.

They are the places where she reviews, refines, previews, and regenerates the Sugarlang draft.

For a simple source dialogue beat such as:

- `Hello. My name is Bippity. I am the Station Master.`

the expected first pass is:

- one derived interaction
- one generated band package per band
- persisted NPC lines for those bands
- persisted vocabulary roles for those bands
- persisted repair and response affordances for those bands

The writer can then do a second pass over those generated lines, including with external AI help, to improve idioms, jokes, or phrasing without rebuilding the interaction from scratch.

See [Deterministic Banded Turn Generation](../api/deterministic-banded-turn-generation.md).

### 1. Sugarlang Scenario Panel

She sees the authored quest bound to a Sugarlang scenario with:

- source quest refs
- communicative task
- success model
- supported bands
- target/support language pairs
- derived interactions

The UI either drafts or suggests:

- `identify_and_return_target_luggage`
- stable referent: `target_luggage_primary`
- supported bands: `B0` to `B4`
- derived interactions:
  - `greeting`
  - `report_missing_luggage`
  - `describe_target_luggage`
  - `return_target_luggage`
- candidate shared vocabulary entries for the supported target languages
- per-interaction `focus`, `reinforcement`, and `ambient` role suggestions for those items
- quest lexical fit warnings when a proposed focus item is too abstract, too rare, or too weakly grounded for the chosen band
- introduction-band suggestions so the selected interaction fits the cumulative `B0` through `B4` lexicon contract instead of quest order alone

She can accept, edit, or regenerate those suggestions.

### 2. Learner Band Matrix

She sees one matrix row per band for the selected interaction:

- `B0 Anchored Recognition`
- `B1 Guided Response`
- `B2 Constrained Exchange`
- `B3 Independent Task Dialogue`
- `B4 Natural Interaction`

For each row she can inspect or edit:

- support-language posture
- mixed-language posture
- response mode
- repair ladder
- grounding intensity
- correction posture
- vocabulary emphasis
- per-band interaction role selection for relevant vocabulary entries:
  - `focus`
  - `reinforcement`
  - `ambient`

The UI makes the progression obvious:

- `B0` chip composition
- `B1` word-bank blank fill
- `B2` typing plus staged support
- `B3` typing-first with failure-triggered repair
- `B4` near-natural target-language interaction

It also makes the lexical progression obvious.

For example, the writer can see that:

- the suitcase referent exists at every band
- `maleta` may be introduced early and used as `focus` in `B0`
- `roja` may be `focus` early and later shift into `reinforcement`
- `mostrador` may remain ambient or absent until a later band
- `cinta verde` may only become relevant in the richer later variants

The writer does not have to invent a separate mini-lexicon for every interaction.

She is working against one shared target-language lexicon per game and deciding how this interaction uses that pool.

### 3. Repair and Support Policy Editor

She sees the repair ladder for each band as a real design surface.

For example:

- `B0`
  - `No entiendo`
  - `Señálalo`
  - `¿Qué significa "__" en inglés?`
- `B2`
  - first failure: `Show me more words`
  - first failure: `Say it more simply`
  - third failure: `Say it in English`
- `B3`
  - no support on first exposure
  - then the same ladder after failure

She can decide:

- which repair responses exist
- when they appear
- whether they reveal more production help, simpler target-language repair, support-language rescue, or grounding help

### 4. Response Scaffold Editor

She sees exactly how the player will respond in each band:

- chips
- word banks
- blanks
- insert helpers
- typed prompts
- return-response scaffolds

She can verify that the response scaffolds recycle active vocabulary instead of collapsing into empty acknowledgements.

### 5. Grounding Map Editor

She sees the quest referents bound to actual world objects and attributes:

- `maleta` -> suitcase objects
- `roja` -> red suitcase variant
- `mostrador` -> counter region
- `cinta verde` -> ribbon attribute on the later suitcase

But the UI also makes clear that grounding and active teaching are not identical.

The same grounded referent can exist across all bands while its attached vocabulary changes status by band and by interaction.

The UI lets her preview:

- highlight behavior
- repair pointing behavior
- inspect/pickup linkage
- region focus
- per-band concept activation on that same referent

### 6. Grounded Quest Binding Editor

She sees the stable scenario referent carried through the whole quest loop:

- NPC description
- world object
- pickup action
- inventory item
- return objective

She can verify that `target_luggage_primary` stays stable while the concrete band variant changes:

- `B0` red suitcase
- `B1` blue suitcase
- `B2` black suitcase
- `B3/B4` richer feature-bearing variants

### 7. Placement and Preview Panel

She can preview the exact same quest as:

- English support -> Spanish target
- Spanish support -> English target
- `B0` through `B4`

The preview panel also lets her force repair states:

- first exposure
- after first failure
- after second failure
- final rescue

So she can inspect not just the happy path, but the actual repair-driven experience.

### 8. Draft and Refinement Actions

Inside the dream Phase 6 UI, she has first-class actions such as:

- `Sync From Quest`
- `Copy Codex Task`
- `Regenerate Interaction`
- `Regenerate B0-B1`
- `Regenerate Repair Policy`
- `Regenerate Spanish Variants`
- `Rebuild Grounded Quest Binding`
- `Re-score Quest Lexical Fit`
- `Validate Scene`

Those actions operate on the same persisted Sugarlang artifacts the preview uses, and they are the normal way the writer moves work forward.

The important point is that the writer is not inventing the prompt from scratch.

SugarEngine prepares the bounded job.

Codex performs the bounded job.

SugarEngine then validates and previews the result.

## Authoring Flow in SugarEngine

### Existing SugarEngine Writing Flow

1. Create the quest in English.
2. Write the station clerk dialogue in English.
3. Place the suitcase objects in the region.
4. Mark the correct suitcase as collectible.
5. Bind the return objective to the same item.
6. Keep the quest logic deterministic.

### Dream Sugarlang Flow

1. Enable Sugarlang for the project and choose supported language pairs.
2. Open the Sugarlang quest overlay and click `Sync From Quest`.
3. If she wants outside AI help, click `Copy Codex Task`, open Codex in the same workspace, and paste the generated task so Codex works only on the bounded packet.
4. Return to SugarEngine and review the generated scenario binding, communicative task, stable referents, and derived interactions.
5. Review the candidate shared vocabulary entries, the suggested `focus` / `reinforcement` / `ambient` roles for each interaction, and the per-band lexical-fit recommendations.
6. Confirm the proposed `introductionBand` assignments make sense against the cumulative lexicon for the whole content slice, not just this quest.
7. Review the band matrix and confirm the progression from `B0` to `B4`.
8. Tune the repair ladders so the interactions stay immersive and in-world.
9. Tune the response scaffolds so `focus` and `reinforcement` vocabulary keep recurring through quest action.
10. Confirm the grounding map and the grounded quest binding.
11. Preview the quest band by band and language pair by language pair.
12. Use `Validate Scene` to catch:
   - missing object refs
   - broken referents
   - weak lexical fit for a selected band
   - concepts introduced too early for the chosen band
   - interaction `focus` entries that sit above the selected band's cumulative pool
   - ambient look-ahead that is too dense for the selected band
   - slice-level cumulative lexicon drift from the band targets
   - unsupported response modes
   - unnatural mixed-language lines
   - missing repair coverage
13. If the English quest or world data changed, use `Sync From Quest` again before previewing. If the persisted Sugarlang artifact files changed outside the panel, use `Reload From Disk` to resync the editor. Narrower regeneration actions remain future work until the editor exposes explicit scoped operations for them.
14. Refine until the quest feels like a game quest first and a language lesson through that quest second.

## Tiny Preview Checklist

If this quest is authored correctly, the game preview should show:

- `B0` feels immersive and contextual, not like translated subtitles.
- `B1` is clearly different from `B0`, with real word-bank blank fill.
- `B2` and `B3` reveal stronger support only after failure.
- The same luggage referent survives dialogue, grounding, pickup, inventory, and return.
- Active vocabulary recurs naturally across prompt, repair, action, and completion.
- Later-band words do not get forced into early-band scenes just because the object exists in the world.
- Switching bands changes the learning surface, not the underlying quest truth.

## Interaction Model

- quest progression: engine-owned and deterministic
- conversation provider: scripted for this quest
- Sugarlang role: middleware, rendering selection, repair policy, response shaping, evaluation, learner-state updates
- SugarAgent role: installed in project but not used for this quest's core teaching interactions
- source narrative language: English
- runtime language behavior: determined by `targetLanguage`, `supportLanguage`, learner band, and interaction policy

## Evaluation Model

The writer does not need to hand-author everything from zero.

The system should help draft and validate:

- communicative tasks
- shared vocabulary-entry suggestions
- interaction-level `focus` / `reinforcement` / `ambient` role suggestions
- lexical fit by band
- response scaffolds
- repair ladders
- grounding maps
- grounded quest bindings
- deterministic evaluation rules

The writer's job is to judge whether the result feels:

- narratively right
- pedagogically believable
- grounded in the world
- previewable across bands
- stable under repair and failure

## Engineering Acceptance Notes

- This flow must work with `sugaragent` installed but unused for the scripted quest.
- The writer must be able to choose scripted-only delivery without Sugarlang losing any core functionality.
- All Sugarlang editing surfaces must operate on the same persisted artifact model.
- Preview must read the same artifacts that generation, validation, and manual editing touch.
- The full Phase 6 authoring suite must not create a second hidden source of truth.
- Band previews must let the writer inspect:
  - first exposure
  - failure-triggered repair
  - support-language rescue
  - grounded variant changes

## AI-Assisted Authoring Path

Expected happy-path:

1. The writer finishes the English quest and dialogue.
2. She clicks `Sync From Quest` or asks the AI assistant for the same result.
3. The system drafts:
   - scenario binding
   - communicative task
   - candidate shared vocabulary entries and lexical-fit scoring
   - interaction-level `focus` / `reinforcement` / `ambient` role suggestions
   - band matrix defaults
   - target-language interaction overlays
   - repair ladders
   - grounding maps
   - grounded quest bindings
   - evaluation rules
4. She previews the quest across bands.
5. She uses the bounded refresh actions that exist today for only the parts that need work:
   - `Sync From Quest` is the derive or regenerate step from the authored quest. In the target architecture it traverses the quest graph, refreshes the scenario interactions, refreshes source bindings, refreshes grounded quest bindings, refreshes lexicon usage, and regenerates the target-language interaction overlays.
   - `Reload From Disk` re-reads the persisted Sugarlang artifact files after external file edits or AI-assisted JSON changes. It resyncs the panel to disk and does not regenerate from the quest.
6. She ships the scripted Sugarlang quest without needing SugarAgent for the core experience.

## Why This Use Case Matters

This use case defines the real writer/designer promise of Sugarlang:

write a good game quest first, then turn it into an immersive language-learning quest without giving up deterministic quest design, grounded world action, or clear authorial control.
