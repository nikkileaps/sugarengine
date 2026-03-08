# ADR-SL-001: English-First Authoring Overlay and Source-of-Truth Model

## Status

Proposed

## Context

Sugarlang is intended for a solo creator or very small team building a game first and a language-learning layer second.

That creator may be:

- a game designer
- a technical solo developer
- a writer
- someone who is not a language pedagogy expert

If Sugarlang requires the creator to manually author every communicative task, learner-band rendering, deterministic evaluation rule, and support policy from a blank form, the product will be too expensive to use and too fragile to scale.

The strategic architecture and product docs already assume:

- the base game is authored as normal SugarEngine content
- the language-learning layer is an overlay
- AI assistance should be a first-class authoring path

This ADR defines the canonical authoring and persistence model that makes that workflow real.

## Decision

Sugarlang will use an English-first overlay model.

That means:

1. The canonical narrative source is the normal SugarEngine-authored quest, dialogue, NPC, and world content.
2. Sugarlang stores its authored/generated learning layer as a separate overlay under the game root.
3. Sugarlang overlay files are the canonical source of truth for the language-learning layer.
4. Those overlay files must be human-readable and round-trip-safe.
5. AI-generated drafts are first-class authored artifacts, not ephemeral previews.
6. The editor UI, chat-based AI assistance, and CLI/automation are all equal authoring clients over the same Sugarlang overlay model.
7. Local databases may support caches, indexes, replay lookup, or analytics, but they are not the canonical store for authored Sugarlang content.
8. The base game content is authored in English, while Sugarlang overlays target runtime `target language` and `support language` behavior.

## Architectural Strategy

### 1. Canonical Narrative Content Stays in the Main Game Model

The creator should continue to write:

- quests
- dialogue trees
- NPC metadata
- regions and world objects

using the normal SugarEngine authoring model.

This preserves the existing engine/editor mental model and keeps the game playable even with Sugarlang disabled.

### 2. Sugarlang Is an Overlay, Not a Replacement Authoring System

Sugarlang should derive and store:

- semantic learning scenarios
- communicative tasks
- learner-band variants
- response contracts
- deterministic evaluation rules
- support and feedback policies

as a layer that references the base authored scene.

That layer is distinct from the narrative source.

### 3. Human-Readable Files Are the Canonical Sugarlang Store

The expected source-of-truth location is the game root, using files under `plugins/sugarlang/`.

This ADR is the canonical definition of the Sugarlang on-disk layout.

Other Sugarlang docs should reference this ADR rather than restating the directory tree independently.

At a high level:

```text
<game-root>/
  project.sgrgame
  plugins/
    sugarlang/
      scenarios/
      defaults/
      languages/
        en/
        es/
      generated/
      eval/
      cache/
```

Intended split:

- `project.sgrgame`
  - plugin enablement
  - enabled target-language and support-language configuration
  - high-level Sugarlang configuration
- `plugins/sugarlang/scenarios/`
  - scene-to-scenario binding
  - semantic task definition
  - grounding maps
  - success model
- `plugins/sugarlang/defaults/`
  - shared learner-band policies
  - shared support-language defaults
- `plugins/sugarlang/languages/<lang>/`
  - shared lexicon packs
  - grammar ladder packs
  - scene language packs containing learner-band variants, response contracts, evaluation rules, and support settings
- `plugins/sugarlang/generated/`
  - optional intermediate draft artifacts
- `plugins/sugarlang/eval/`
  - replay packs and scored reports
- `plugins/sugarlang/cache/`
  - disposable indexes or SQLite caches

### 4. Stable References Are Required

Every Sugarlang overlay artifact should reference stable IDs from the game content layer, such as:

- `questId`
- `objectiveId`
- `dialogueId`
- `nodeId`
- `npcId`
- `objectId`

This is what allows AI-assisted generation, safe regeneration, and editor/chat parity.

For the initial shipped product, the first complete language packs should be `en` and `es`, with player-facing support/target pairings of English support -> Spanish target and Spanish support -> English target.

### 5. AI Draft Generation Is a First-Class Authoring Path

The system should treat the following as equivalent intents:

- clicking `Generate Sugarlang Draft` in the editor
- asking an AI assistant in chat to generate the draft for a quest or scene
- invoking a CLI or automation command to generate or refresh the draft

All three should write the same underlying Sugarlang artifacts.

## Why This Supports the Product and Use Cases

This decision directly supports:

- the English-first workflow described in the product docs
- the use cases where the same quest is adapted across multiple learner bands
- the need for solo-creator scale
- the requirement that `sugarlang` work with scripted games even when `sugaragent` is absent

It also makes the product significantly more reviewable:

- files can be diffed
- AI-generated drafts can be patched
- design changes can be reviewed in git
- generated content can be manually corrected when AI output is wrong

## Comparable Product Patterns and Research Basis

Several successful language-learning products use a hybrid model where expert-authored pedagogical structure and AI generation are combined rather than replacing one another:

- Duolingo states that for Roleplay, humans write the scenarios, write the initial message, and tell the model where to take the conversation, while AI adds variability and feedback. That is very close to the authoring overlay pattern Sugarlang needs.[1]
- Babbel describes its courses as expert-crafted and also describes AI speaking practice as an extension of a pedagogy-defined progression from structured to more natural conversation.[2][3]
- Busuu explicitly combines structured lessons with spoken or written exercises and correction workflows, rather than treating AI generation as the only pedagogy source.[4][5]
- Memrise positions itself around useful phrases, authentic native content, and AI practice, which again implies that content design and AI practice are separate but connected layers.[6]

The pattern across these products is consistent:

- structured pedagogy first
- AI augmentation second
- content review remains necessary

Sugarlang should adopt the same architectural posture, but make it compatible with a creator-owned game project and chat-based authoring.

## Alternatives Considered

### 1. Put All Sugarlang Data in `project.sgrgame`

Rejected.

Why:

- the main project file becomes noisy and hard to diff
- AI regeneration becomes harder to scope safely
- content ownership becomes unclear

### 2. Put Canonical Sugarlang Data in SQLite

Rejected.

Why:

- poor source control ergonomics
- hard to inspect and patch manually
- hard to use as a chat-based authoring target
- not appropriate for the canonical authored layer

### 3. Make the Editor the Only Authoring Client

Rejected.

Why:

- it blocks chat-based AI authoring
- it duplicates generation logic if CLI or automation is added later
- it is misaligned with the target creator workflow

### 4. Make AI Output Ephemeral Until a Human Clicks "Save"

Rejected.

Why:

- chat-based workflows need durable artifacts
- partial review and iterative regeneration become awkward
- playtest and eval tooling need stable files

## Technology and Pattern Options

This ADR intentionally does not lock exact formats.

Patterns that are consistent with the decision:

- JSON files for structured scenario overlays
- TOML or YAML for human-editable configuration metadata
- generated artifact manifests for traceability
- status fields like `draft`, `reviewed`, `approved`
- regeneration markers or metadata for safe partial refresh

The main constraint is not the file extension.

The main constraint is:

- readable
- diffable
- patchable
- round-trip-safe

## Future-Compatible Growth Path

This decision is intentionally compatible with all three model-serving futures:

### Browser-Local AI

The chat client or editor uses local models to generate or refine Sugarlang overlays.

No architecture change is required.

### Commercial LLM via API

The generation client can call a server-side proxy to an external provider, but the resulting artifacts still land in the same game-root overlay files.

No architecture change is required to the source-of-truth model.

### Self-Hosted Server LLM

The generation client can call a self-hosted inference service, but again the resulting artifacts are the same Sugarlang overlay files.

No architecture change is required to the source-of-truth model.

This is the main point of the ADR:

runtime deployment can evolve without changing what authored Sugarlang content is or where it lives.

## Consequences and Tradeoffs

Positive:

- aligns with the real creator workflow
- supports editor/chat/CLI parity
- makes AI output durable and reviewable
- keeps the game layer and pedagogy layer distinct
- avoids database lock-in for authored content

Tradeoffs:

- more files to manage
- requires stable reference design
- requires careful regeneration rules to avoid overwriting refined content
- requires validation tooling to keep overlays aligned to source scenes

## Sources

[1] Duolingo, "Introducing Duolingo Max, a learning experience powered by GPT-4"  
[https://blog.duolingo.com/duolingo-max/](https://blog.duolingo.com/duolingo-max/)

[2] Babbel, "Learn a language with the Babbel App"  
[https://www.babbel.com/mobile](https://www.babbel.com/mobile)

[3] Babbel, "Introducing Babbel Speak: AI-Powered Confidence for Travel, Futbol, and Everyday Life"  
[https://www.babbel.com/press/en-us/releases/babbel-speak](https://www.babbel.com/press/en-us/releases/babbel-speak)

[4] Busuu, "What is Busuu?"  
[https://help.busuu.com/hc/en-us/articles/15936615354641-What-is-Busuu](https://help.busuu.com/hc/en-us/articles/15936615354641-What-is-Busuu)

[5] Busuu, "Where can I find exercises to complete?"  
[https://help.busuu.com/hc/en-us/articles/16746898571025-Where-can-I-find-exercises-to-complete](https://help.busuu.com/hc/en-us/articles/16746898571025-Where-can-I-find-exercises-to-complete)

[6] Memrise, "Learn a language. Memrise is authentic, useful and personalised."  
[https://www.memrise.com/](https://www.memrise.com/)
