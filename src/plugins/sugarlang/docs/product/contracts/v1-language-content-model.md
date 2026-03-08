# V1 Language Content Model

## Purpose

This document defines the product-level content model for V1 Sugarlang.

It answers questions like:

- what counts as a vocabulary item
- what the V1 teaching lexicon should contain
- how grammar should be constrained by band
- how English and Spanish should both fit the same product

This is a product and authoring contract.

It is not a JSON schema.

## V1 Language Scope

V1 supports:

- English as a target language
- Spanish as a target language
- English as a support language
- Spanish as a support language

The normal player-facing V1 language pairs are:

- English support -> Spanish target
- Spanish support -> English target

The base game content is authored in English.

Sugarlang then produces per-target-language teaching overlays from that English-authored base content.

## Product Decision

V1 should use a curated teaching lexicon, not a purely open vocabulary model.

Frequency information may help rank or select vocabulary, but frequency lists should not be the sole product truth.

The practical rule is:

- frequency is a prioritization input
- curated scene relevance is the V1 product truth

That means V1 vocabulary is selected because it is:

- common enough to be useful
- grounded in visible game context
- reusable across multiple early quests
- teachable through the available response contracts

## Core Content Layers

Sugarlang content should be thought of in four layers.

### 1. Semantic Concepts

Language-neutral teaching concepts such as:

- suitcase
- red
- door
- counter
- near
- where is
- help

This layer is shared by English and Spanish targets.

### 2. Per-Target-Language Lexical Realizations

Each semantic concept has one or more target-language realizations.

Examples:

| Semantic concept | English target | Spanish target |
| --- | --- | --- |
| `object.suitcase` | `suitcase` | `maleta` |
| `color.red` | `red` | `roja` |
| `location.here` | `here` | `aquí` |
| `verb.help` | `help` | `ayudar` |

### 3. Band-Specific Teaching Policies

The same word should not be taught the same way in every band.

Examples:

- `maleta` may be a highlighted keyword in `B0`
- `maleta` may be used in a blank fill in `B1`
- `maleta` may become an expected slot in a short typed response in `B2`

### 4. Scene-Specific Teaching Selection

Not every word in the game is active in every scene.

Each scene should declare:

- active teachable concepts
- passive support-only concepts
- advanced optional concepts

## What Counts as a V1 Vocabulary Item

For product purposes, a V1 vocabulary item should include:

- a stable semantic concept
- a primary target-language surface form
- optional alternate forms
- a plain-English gloss
- a content category
- a first-introduction band
- whether the item is meant for active production, passive recognition, or support-only use
- whether the item can be grounded in the scene

V1 does not need full linguistics coverage.

It does need stable teaching units.

## V1 Domain Scope

The initial domain is:

- transport hub
- lost item recovery
- simple help-seeking
- simple location exchange

That means the V1 lexicon should skew toward:

- visible objects
- visible attributes
- spatial language
- short task verbs
- polite interaction phrases

## V1 Starter Teaching Lexicon

The list below is the recommended V1 core teaching inventory for the first vertical slice and adjacent early scenes.

### A. Core task nouns

| Semantic concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| `object.suitcase` | `suitcase` | `maleta` | `B0` |
| `object.bag` | `bag` | `bolsa` | `B2` |
| `object.ticket` | `ticket` | `boleto` | `B3` |
| `object.passport` | `passport` | `pasaporte` | `B3` |
| `place.door` | `door` | `puerta` | `B2` |
| `place.counter` | `counter` | `mostrador` | `B3` |
| `place.platform` | `platform` | `andén` | `B4` |
| `place.station` | `station` | `estación` | `B3` |

### B. Visible descriptors

| Semantic concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| `color.red` | `red` | `roja` | `B0` |
| `color.blue` | `blue` | `azul` | `B1` |
| `color.black` | `black` | `negra` | `B2` |
| `color.green` | `green` | `verde` | `B3` |
| `size.small` | `small` | `pequeña` | `B3` |
| `size.big` | `big` | `grande` | `B1` |
| `material.leather` | `leather` | `de cuero` | `B4` |
| `condition.worn` | `worn` | `gastada` | `B4` |

Spanish note:

- `roja`, `negra`, `pequeña`, and `gastada` are agreement-sensitive forms used here with feminine `maleta`
- `azul` and `verde` do not change form for gender in these common singular uses and should be taught that way in V1

### C. Spatial language

| Semantic concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| `location.here` | `here` | `aquí` | `B1` |
| `location.there` | `there` | `allí` | `B1` |
| `relation.near` | `near` | `cerca de` | `B2` |
| `relation.next_to` | `next to` | `junto a` | `B3` |
| `relation.beside` | `beside` | `al lado de` | `B3` |
| `direction.left` | `left` | `izquierda` | `B4` |
| `direction.right` | `right` | `derecha` | `B4` |

### D. Core task verbs and phrases

| Semantic concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| `verb.see` | `see` | `ver` | `B0` |
| `verb.need` | `need` | `necesitar` | `B1` |
| `verb.help` | `help` | `ayudar` | `B2` |
| `verb.look_for` | `look for` | `buscar` | `B3` |
| `verb.find` | `find` | `encontrar` | `B3` |
| `verb.is` | `is` | `está` | `B1` |
| `phrase.where_is` | `where is` | `dónde está` | `B2` |
| `phrase.can_you_help` | `can you help` | `puedes ayudarme` | `B2` |

Spanish note:

- `puedes ayudarme` is allowed in V1 as a formulaic help phrase, including the attached object-pronoun form `-me`
- V1 should treat this as a permitted chunk at `B2`, not as a separate pronoun lesson

### E. Control and social phrases

| Semantic concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| `confirm.yes` | `yes` | `sí` | `B0` |
| `confirm.no` | `no` | `no` | `B0` |
| `ui.repeat` | `repeat` | `repetir` | `B0` |
| `ui.easier` | `easier` | `más fácil` | `B1` |
| `ui.hint` | `hint` | `pista` | `B0` |
| `social.thank_you` | `thank you` | `gracias` | `B0` |

## Active vs Passive vs Support-Only Vocabulary

Every scene should classify vocabulary items as one of:

- `active`
  - the learner is expected to recognize or produce it
- `passive`
  - it may appear, but success does not depend on it
- `support-only`
  - it may appear in support-language text or helper UI, but is not a target teaching item

This distinction is important because V1 should not accidentally teach every visible word equally.

## V1 Grammar Ladder

V1 also needs a concrete grammar ceiling by band.

### `B0 Anchored Recognition`

- no productive grammar requirement
- fixed chunks only
- grammar is mostly exposure

### `B1 Guided Response`

- simple noun phrases
- fixed `X está aquí/allí` patterns
- simple adjective-noun pairings as recognition or guided assembly
- common non-gender-changing color adjectives such as `azul` may be introduced here

### `B2 Constrained Exchange`

- simple present-tense statements
- simple `where is` questions
- simple help/confirmation phrases
- formulaic object-pronoun help chunks such as `puedes ayudarme`

### `B3 Independent Task Dialogue`

- description with multiple attributes
- clarification questions
- relative location phrases

### `B4 Natural Interaction`

- richer descriptive detail
- optional multi-clause sentences
- less tightly bounded phrasing
- material descriptions using `de + material`, such as `maleta de cuero`

## Product Rule for New Vocabulary Load

V1 scenes should not overload the learner.

Default active vocabulary budget per scene:

| Band | Active target-language items |
| --- | --- |
| `B0` | 2-4 |
| `B1` | 4-6 |
| `B2` | 6-8 |
| `B3` | 8-10 |
| `B4` | 8-12 with a small explicit focus subset |

## English Target-Language Role

English target content is not a throwaway debug mode.

It serves three real product purposes:

- validate that the band contracts feel coherent
- validate that response contracts and evaluation rules behave sanely
- let the creator judge wording and success logic with high confidence

The English target pack should still use:

- the same semantic concepts
- the same scene contracts
- the same band rules

What it does not validate well is mixed-language scaffolding, because target and support are both English.

That is why Spanish remains essential for learner-experience testing.

## Product Rule on Frequency Lists

The older research direction that uses frequency-ranked vocabulary bands is still useful.

For V1, treat frequency data as:

- a prioritization aid
- a tie-breaker
- a sanity check

Do not treat frequency rank as the only truth about whether a word belongs in a scene.

Scene relevance and visible grounding matter more for V1.
