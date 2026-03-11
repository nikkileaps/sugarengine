# V1 Cumulative Banded Lexicon Contract

## Purpose

This document defines how the shared lexicon grows across learner bands.

It answers:

- what "introduced at `B0`" or "introduced at `B2`" actually means
- what vocabulary pool a placed learner should have available immediately
- how interaction `focus`, `reinforcement`, and `ambient` draw from that pool
- how the product should decide which vocabulary entries belong in the lexicon in the first place

This is a product contract.

It is not a final mastery algorithm or storage schema.

## Core Rule

The shared lexicon for a target language is cumulative by band.

That means:

- `B0` pool = all vocabulary entries with `introductionBand = B0`
- `B1` pool = all vocabulary entries with `introductionBand <= B1`
- `B2` pool = all vocabulary entries with `introductionBand <= B2`
- `B3` pool = all vocabulary entries with `introductionBand <= B3`
- `B4` pool = all vocabulary entries with `introductionBand <= B4`

So a learner placed at `B2` should immediately be playing against the cumulative `B0 + B1 + B2` vocabulary pool for that content slice.

The game should not wait for quest progression to "unlock" basic vocabulary that belongs to the learner's placed band.

## V1 Planning Targets

These targets are per target language for the supported V1 content slice.

They count tracked vocabulary entries, including:

- single words
- fixed phrases
- repair chunks
- short report-back chunks

They do not count every ambient word that may appear in prose, props, lore, or flavor text.

| Band | New entries introduced at this band | Cumulative tracked pool target |
| --- | --- | --- |
| `B0` | `60` | `60` |
| `B1` | `90` | `150` |
| `B2` | `150` | `300` |
| `B3` | `250` | `550` |
| `B4` | `300` | `850` |

These are product planning targets, not exact mastery guarantees.

They are intentionally far smaller than a full language dictionary, but large enough to support:

- cumulative learner placement
- repeated reinforcement across interactions
- bounded-domain natural interaction in later bands

If the product claims to support `B4` for a slice, the lexicon for that slice should be built to approximately this full cumulative size.

## What `introductionBand` Means

`introductionBand` means:

- the first learner band where this vocabulary entry belongs in the tracked shared pool
- the first band where the system may intentionally present it as `focus`
- the first band where the system may start collecting meaningful evidence for it as part of normal teaching play

It does not mean:

- the only band where the entry can appear
- the band where the learner stops seeing it
- that later-band learners should hide or re-learn it from scratch

Once introduced, a vocabulary entry stays in the cumulative pool for all later bands.

## What a Placed Learner Is Assumed To Have

Placement chooses the learner's starting band.

That starting band carries an immediate cumulative vocabulary assumption.

### `B0`

The learner can rely on:

- `B0` entries only
- roughly `60` tracked vocabulary entries
- heavy support language
- heavy grounding

### `B1`

The learner can rely on:

- `B0 + B1` entries
- roughly `150` tracked vocabulary entries
- strong support for productive use
- continued reuse of `B0` entries as reinforcement

### `B2`

The learner can rely on:

- `B0 + B1 + B2` entries
- roughly `300` tracked vocabulary entries
- shorter repair and more typed production
- `B0` and `B1` entries being treated mostly as reinforcement, unless learner evidence says otherwise

### `B3`

The learner can rely on:

- `B0 + B1 + B2 + B3` entries
- roughly `550` tracked vocabulary entries
- richer descriptive and clarification language
- lower-band entries being broadly available without constant protection

### `B4`

The learner can rely on:

- the full tracked vocabulary pool for the supported game slice
- roughly `850` tracked vocabulary entries
- lower-band vocabulary being available as already-established language
- the interaction choosing a smaller active subset from that full pool

## Available Tracked Pool vs Teaching Subset vs Ambient Halo

The cumulative band pool is not the same thing as the full language visible in an interaction.

For any interaction, the runtime should think in three layers:

### 1. Available tracked pool

All tracked vocabulary entries whose `introductionBand` is at or below the learner's current band.

This is the pool the interaction may safely assume for:

- current-band `focus`
- lower-band `reinforcement`
- success-relevant tracked language

### 2. Teaching subset

The tracked entries the interaction is actively leaning on right now.

That subset is usually expressed through:

- `focus`
- `reinforcement`
- tracked `ambient` entries that are already in or near the learner's available pool

### 3. Ambient halo

Additional language that may appear around the edges of the experience without becoming required for low-band success.

This halo may include:

- lower-band tracked entries not currently emphasized
- current-band tracked entries that are visible but not central
- a small number of higher-band tracked entries
- untracked flavor language in props, books, lore, UI, or richer dialogue

So for a `B2` learner:

- available tracked pool = every tracked `B0`, `B1`, and `B2` vocabulary entry for the content slice
- teaching subset = the current interaction's `focus` and `reinforcement` entries, plus any tracked ambient entries it wants visibly in play
- ambient halo = a limited amount of richer language, including some `B3/B4` look-ahead or untracked flavor, so long as success does not depend on it

## Scene Role Rules

### `focus`

At a given band, `focus` should usually come from:

- entries whose `introductionBand` is the learner's current band
- unstable lower-band entries that need another strong teaching pass

### `reinforcement`

At a given band, `reinforcement` should usually come from:

- lower-band entries already in the cumulative pool
- current-band entries that were introduced earlier in the same slice and are now being reused

### `ambient`

At a given band, `ambient` may come from:

- lower-band entries not currently being emphasized
- current-band entries that are visible but not central
- higher-band entries that can safely appear without being required for success
- untracked language in props, lore, or flavor text

Low-band success must not depend on `ambient`.

When the interaction explicitly marks tracked entries as `ambient`, it should prefer entries already in or near the learner's available tracked pool and use higher-band look-ahead sparingly.

## Product Rule for Population

The lexicon should be populated top-down from the highest-band experience the product intends to support for the current shipped content slice.

The authoring workflow should be:

1. Draft the natural higher-band version of the content slice.
2. Extract candidate vocabulary entries and phrases from that content.
3. Keep the entries the game wants to track deliberately.
4. Size the resulting lexicon toward the cumulative band targets above.
5. Assign each kept entry an `introductionBand`.
6. Mirror the same rows across target languages.
7. Let lower-band interactions use simpler subsets and stronger support from that cumulative pool.

This means the lexicon is not populated from quest order alone.

It is populated from the full supported language surface of the slice, then distributed across bands.

## Authoring and Validation Implications

The editor and assistant tooling should surface the cumulative lexicon contract in a way a writer can actually use.

At minimum, per target language, the system should be able to show:

- cumulative counts by `introductionBand`
- how many new vocabulary entries a given interaction is trying to introduce
- which interaction `focus` entries sit above the selected band
- when ambient look-ahead is getting too dense for the selected band
- when the overall slice is materially under or over the planning targets

This lets the writer answer practical questions such as:

- are we actually building toward the `B4 = 850` slice we claim to support
- is this interaction overloading `B0`
- are we accidentally teaching `B3` language in a `B1` quest beat
- is the lexicon still coherent across English, Spanish, and Italian packs

## What Belongs In The Tracked Lexicon

A vocabulary entry belongs in the tracked lexicon when the game wants to do one or more of these:

- highlight it
- repeat it deliberately
- prefer it over synonyms
- ground it to a world object
- use it in repair or response scaffolds
- evaluate recognition or production against it
- remember learner evidence for it over time

If the game does not need any of those behaviors, the language may remain ambient instead of becoming a tracked vocabulary entry.

## Product Rule for Highest-Band Coverage

If the product claims to support `B4` for a content slice, the shared lexicon for that slice must contain the tracked vocabulary entries needed to run that `B4` experience.

That does not mean:

- every word that might appear in rich prose must be tracked
- every ambient flavor phrase must become a lexicon row

It does mean:

- every repeated, evaluated, scaffolded, grounded, or success-relevant vocabulary entry needed by the `B4` experience must already exist in the shared lexicon

For V1, that means the tracked `B4` pool should land at roughly `850` vocabulary entries per target language for the supported slice.

## Practical Example

For a `Find the Luggage` slice:

- `maleta` may have `introductionBand = B0`
- `puerta` may have `introductionBand = B2`
- `mostrador` may have `introductionBand = B3`
- `puerta lateral` may have `introductionBand = B4`

So:

- a `B0` learner gets `maleta`, but not `puerta lateral`
- a `B2` learner gets `maleta`, `puerta`, and all lower-band entries immediately
- a `B4` learner gets the full tracked pool for the slice, including `puerta lateral`

At V1 planning scale, those pools are roughly:

- `B0` = `60`
- `B2` = `300`
- `B4` = `850`

The interaction still chooses which of those become `focus`, `reinforcement`, or `ambient`.

## Relationship To Learner Evidence

The cumulative pool is a product/content contract.

Learner evidence is a runtime adaptation input.

That means:

- a placed `B2` learner should have the full `B0 + B1 + B2` pool available
- the system may still discover that some lower-band entries are weak and bring them back as `focus`
- the system may fade support on lower-band entries with strong evidence

Placement controls what pool is available.

Learner evidence controls how much support the learner still needs within that available pool.
