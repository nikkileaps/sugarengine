# V1 Lexicon and Interaction Curriculum Model

## Purpose

This document defines what the Sugarlang lexicon actually is and how interactions consume it.

It answers:

- what a lexicon is in product terms
- what belongs to the shared lexicon versus the interaction overlay
- what `focus`, `reinforcement`, and `ambient` mean
- how cumulative band availability works
- how authoring, runtime delivery, and learner progression should consume those roles

This is a domain contract.

It is not a final storage schema.

## Product Decision

Sugarlang owns one shared lexicon per target language for the whole game.

Examples:

- English target lexicon
- Spanish target lexicon
- Italian target lexicon

That lexicon is the game's shared teaching dictionary for that language.

It is not:

- a scenario-local vocabulary list
- a separate lexicon per band
- a full dictionary of the real-world language

## What a Lexicon Row Is

A lexicon row is one vocabulary entry in that teaching dictionary.

It is a stable entry that the game may deliberately teach, reinforce, or expose.

Typical examples include:

- concrete nouns such as `maleta`
- descriptors such as `roja`
- verbs such as `buscar`
- formulaic chunks such as `dónde está`
- repair chunks such as `no entiendo`

In domain terms, a lexicon row should own:

- stable lexical entry id
- preferred target-language form
- alternate forms when needed
- gloss
- category
- first or introduction band
- default usage or teaching priority
- whether the item can be grounded

In practical authoring terms, a lexicon pack is therefore a table of rows for one target language.

Each row answers:

- what vocabulary entry this row refers to
- what word or chunk the learner should see for that meaning in this language
- when the product normally starts teaching it
- whether the item is concrete enough to ground in the world

## Ownership Split

### Lexicon owns

The shared language lexicon owns the stable reusable teaching dictionary for that target language.

It answers:

- which tracked words and chunks exist in the product
- what their canonical target-language forms are
- when they are normally introduced
- which items are game-wide, repeatable, and worth tracking over time

Examples:

- `object.suitcase -> suitcase / maleta / valigia`
- `phrase.where_is -> where is / dónde está / dov'è`
- `repair.i_dont_understand -> I don't understand / no entiendo / non capisco`

### Interaction overlay owns

The interaction overlay owns how the current interaction uses lexicon rows.

It answers:

- which items are currently `focus`
- which items are currently `reinforcement`
- which tracked entries may appear as `ambient`
- whether the interaction allows a small ambient halo of higher-band or untracked language at the edges
- which target-language items are protected or highlighted in mixed-language delivery
- which items are required for success versus merely visible in context

This is why the same vocabulary entry may appear in many interactions but play a different role in each one.

## Stable Band Property vs Interaction Role

The key distinction is:

- `introductionBand` is a stable property of the lexicon row
- `focus`, `reinforcement`, and `ambient` are dynamic interaction- or moment-level roles

The lexicon is also cumulative by band.

That means a learner placed at `B2` should immediately have the cumulative `B0 + B1 + B2` pool available, while interaction roles still choose the smaller active subset for the current moment.

See [V1 Cumulative Banded Lexicon Contract](./v1-cumulative-banded-lexicon-contract.md).

That means:

- `maleta` may have `introductionBand = B0`
- one early interaction may use `maleta` as `focus`
- a later interaction may use `maleta` as `reinforcement`
- an advanced interaction may allow `maleta` to remain present only as `ambient`

## Canonical Interaction Curriculum Roles

### `focus`

The item is being deliberately taught or strongly re-taught in the current interaction.

Product implications:

- likely highlighted or otherwise protected in mixed-language delivery
- likely repeated in initial line, repair, scaffold, action, or completion
- may be required for learner success
- should be one of the items the game actively tracks for mastery evidence

### `reinforcement`

The item has already been introduced and is being deliberately reused for reinforcement.

Product implications:

- should be preferred over unused synonyms where that feels natural
- should recur in scaffolds, repair, grounded labels, or report-back lines
- may still be surfaced visibly, but with less support than a `focus` item
- helps spaced retrieval without turning the interaction into a worksheet

### `ambient`

The item may appear in the surrounding language experience but is not the current lesson target.

Product implications:

- may come from the next band or from already-known language
- may appear in natural dialogue, props, guidebooks, inventory text, or flavor writing
- should not be required for success in low-band scenes
- gives the world a more immersive "living language" feel without breaking the task

Ambient can include both:

- tracked vocabulary entries the interaction wants visible but not central
- a small halo of higher-band or untracked language that remains non-blocking

## System Consumption

### Authoring

The authoring flow should treat lexicons as the reusable per-language curriculum layer.

That means:

- AI or Codex can propose vocabulary entries from the full supported slice, especially its higher-band natural realizations
- writers review and promote stable repeated items into the shared lexicon
- writers assign each entry an `introductionBand`
- interaction authoring then selects `focus`, `reinforcement`, and `ambient` items from the cumulative band pool

Concretely:

- the lexicon gives the writer a visible list of available words and chunks for English, Spanish, or Italian
- interactions do not re-invent those rows
- interactions choose which of those rows matter right now

### Runtime delivery

The runtime should consume interaction roles deliberately.

Examples:

- keep `focus` items visible in mixed-language lines
- prefer `reinforcement` items over fresh synonyms when an interaction needs reusable vocabulary
- allow `ambient` items at the edges of the experience without making them required for success
- use repair, scaffolds, grounding, and repetition to keep `focus` and `reinforcement` items learnable

Concretely:

- grounding lookups should use the lexicon row for the active target language
- mixed-language delivery should protect `focus` items and often keep them visible in target language
- response scaffolds should keep reusing `focus` and `reinforcement` items where possible
- ambient language can appear in flavor text, props, or richer dialogue without becoming a success gate
- higher-band ambient look-ahead should stay sparse enough that it does not drown the current teaching subset

### Learner progression

The learner model should track evidence per vocabulary entry, not only per interaction.

At a high level the system should be able to tell:

- which vocabulary entries have been seen
- which have strong recognition evidence
- which have strong production evidence
- which remain unstable and should return as `focus` or `reinforcement`

This allows the product to:

- fade support on items the learner has likely stabilized
- keep recycling important earlier items
- introduce a controlled amount of next-band ambient language

Concretely, the system should be able to say:

- this learner has seen `object.suitcase`
- this learner can reliably recognize `object.suitcase`
- this learner still needs more production support for `phrase.where_is`
- this learner can now encounter a small amount of `ambient` next-band language without confusion

## Product Rules

### 1. One lexicon per language

There should be one shared lexicon pack per target language for the game or content bundle.

### 2. No separate lexicon per scenario

Interactions should not own private long-term dictionaries unless a provisional item has not yet been promoted into the shared lexicon.

### 3. No separate lexicon per band

Bands influence when an item is introduced and how much support it gets.

They do not own separate vocabulary stores.

Instead, each later band inherits the full tracked pool of all earlier bands.

### 4. Early-band viability is an interaction question

The product should not require every narrative detail to be expressible in `B0`.

Instead, each interaction should have a viable low-band projection using:

- `focus` items
- `reinforcement` items
- support language
- grounded world context

### 5. Frequency is useful, not sufficient

The cumulative lexicon should be informed by common vocabulary, but the final product truth is still:

- interaction relevance
- visible grounding
- quest usefulness
- reusability across early scenes

Game-critical nouns and chunks should be allowed into the lexicon even when pure frequency would rank them later.
