# V1 Language Content Model

## Purpose

This document defines the product-level language content model for V1 Sugarlang.

It answers:

- what counts as a teaching unit
- what the V1 lexicon should contain
- how vocabulary should progress through introduction, reinforcement, and retrieval
- how mixed target/support language should behave
- how English and Spanish fit the same product contract

This is a product and authoring contract.

It is not a JSON schema.

## V1 Language Scope

V1 supports:

- English as a target language
- Spanish as a target language
- English as a support language
- Spanish as a support language

The base game is authored in English.

Sugarlang then produces per-target-language overlays from that English-authored game content.

## Product Decision

V1 uses a curated teaching lexicon, not a purely open vocabulary model.

Frequency can inform prioritization, but frequency is not the product truth.

The V1 truth is:

- scene relevance
- visible grounding
- quest usefulness
- reusability across early scenes
- suitability for the available response contracts

## Core Content Layers

Sugarlang content should be thought of in five layers.

### 1. Semantic Concepts

Language-neutral concepts such as:

- suitcase
- red
- door
- counter
- where is
- help

### 2. Teaching Units

A scene can teach more than isolated dictionary words.

V1 teaching units may be:

- lexical items
  - `maleta`
- grounded descriptors
  - `roja`
- formulaic chunks
  - `dónde está`
- report chunks
  - `aquí está la maleta`
- repair chunks
  - `no entiendo`

### 3. Per-Target-Language Realizations

Each semantic concept or teaching unit has one or more target-language realizations.

Examples:

| Concept | English target | Spanish target |
| --- | --- | --- |
| `object.suitcase` | `suitcase` | `maleta` |
| `color.red` | `red` | `roja` |
| `phrase.where_is` | `where is` | `dónde está` |
| `repair.i_dont_understand` | `I don't understand` | `no entiendo` |

### 4. Band-Specific Teaching Policy

The same teaching unit behaves differently by band.

Examples:

- `maleta` may be highlighted and used in chip composition in `B0`
- `maleta` may be assembled into a short phrase in `B1`
- `maleta` may be expected in a typed location question in `B2`
- `maleta` may become recycled, not newly taught, in `B3`

### 5. Scene-Specific Teaching Selection

Not every word in the game is active in every scene.

Each scene should declare:

- focus items
- recycled items
- passive items
- support-only items

## Teaching Unit States

V1 should classify teaching units by instructional role.

### `introduce`

- first meaningful exposure in the product
- strong grounding
- strong support

### `reinforce`

- recently introduced and deliberately re-used
- still visible in chips, prompts, or grounded labels

### `retrieve`

- expected to be recalled with less support
- may still appear in fallback repair

### `passive`

- visible in the scene but not required for success

### `support-only`

- appears only in help text, repair, or support-language UI
- not a target teaching item for the scene

## Product Rule for Mixed-Language Rendering

Mixed-language rendering is not literal line-by-line translation.

The rule is:

- keep active target-language teaching units visible
- prefer support language for non-mastered glue or repair framing
- fade support-language use as the learner progresses
- keep mixed lines sounding like something a helpful person would actually say

Good V1 examples:

- `Do you see la maleta roja?`
- `Necesito la maleta azul. Can you show me where it is?`
- `La maleta azul. It's over there.`

Bad default pattern:

- full translated subtitle beneath every line
- token-spliced lines that no real speaker would naturally say

Authoring rule:

- if a mixed line feels unnatural, keep the line natural and move more support into the response scaffold or repair instead of forcing mixed wording into the final utterance

Mixed-language rendering should be:

- mastery-aware
- band-aware
- scene-aware
- repair-aware
- natural-feeling

## Product Rule for Lexical Recycling

Sugarlang should deliberately re-encounter vocabulary over time.

Each important teaching unit should ideally appear in more than one of these places:

- NPC initial line
- repair line
- chip sets or other response scaffolds
- grounded object label
- pickup or inventory text
- completion or report-back line

This is the intended V1 model for spaced retrieval and lexical recycling.

## What Counts as a V1 Vocabulary Item

For product purposes, a V1 vocabulary item should include:

- a stable semantic concept or chunk id
- a primary target-language form
- optional alternate forms
- a plain-language gloss
- a content category
- a first-introduction band
- a teaching-unit type
- a recommended instructional state
- whether it can be grounded in the scene
- whether it is likely to appear in repair or fallback scaffolds

## V1 Domain Scope

The initial domain is:

- transport hub
- lost item recovery
- simple help-seeking
- simple location exchange

That means the V1 lexicon should skew toward:

- visible objects
- visible descriptors
- spatial language
- repair and clarification language
- short task verbs
- report-back phrases

## V1 Starter Teaching Inventory

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

### B. Grounded descriptors

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

### D. Task and report chunks

| Semantic concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| `phrase.i_need` | `I need` | `necesito` | `B1` |
| `phrase.where_is` | `where is` | `dónde está` | `B2` |
| `phrase.here_is` | `here is` | `aquí está` | `B1` |
| `phrase.can_you_help` | `can you help` | `puedes ayudarme` | `B2` |
| `verb.look_for` | `look for` | `buscar` | `B3` |
| `verb.find` | `find` | `encontrar` | `B3` |

Spanish note:

- `puedes ayudarme` is allowed in V1 as a formulaic help chunk, including the attached object-pronoun form `-me`
- V1 should treat this as a permitted chunk at `B2`, not as a separate pronoun lesson

### E. Repair and clarification chunks

| Semantic concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| `repair.i_dont_understand` | `I don't understand` | `no entiendo` | `B0` |
| `repair.slower` | `slower` | `más despacio` | `B1` |
| `repair.what_does_it_mean` | `what does it mean` | `qué significa` | `B2` |
| `repair.point_to_it` | `point to it` | `señálalo` | `B0` |
| `repair.repeat` | `repeat` | `repite` | `B0` |
| `repair.more_words` | `show me more words` | `muéstrame más palabras` | `B2` |
| `repair.simpler` | `say it more simply` | `más simple` | `B2` |
| `repair.in_support_language` | `say it in support language` | `dilo en mi idioma de apoyo` | `B2` |

### F. Social and confirmation language

| Semantic concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| `confirm.yes` | `yes` | `sí` | `B0` |
| `confirm.no` | `no` | `no` | `B0` |
| `social.thank_you` | `thank you` | `gracias` | `B0` |

## Active vs Recycled vs Passive vs Support-Only

Every scene should classify teaching units as one of:

- `focus`
  - newly introduced or heavily reinforced in the scene
- `recycled`
  - intentionally re-used for retrieval
- `passive`
  - visible, but not required for success
- `support-only`
  - appears only in support or repair

This is how V1 avoids both under-teaching and overload.

## V1 Grammar and Chunk Ladder

V1 needs a grammar ceiling, but the product should think in chunks as well as syntax.

### `B0 Anchored Recognition`

- no productive grammar requirement
- fixed chunks only
- recognition and repair acts dominate

### `B1 Guided Response`

- simple noun phrases
- simple `X está aquí/allí` patterns
- guided assembly of short report chunks

### `B2 Constrained Exchange`

- short present-tense statements
- simple `where is` questions
- simple help or clarification chunks
- formulaic repair phrases

### `B3 Independent Task Dialogue`

- multi-attribute descriptions
- clarification questions
- relative location phrases
- short report-back sentences

### `B4 Natural Interaction`

- richer descriptive detail
- optional multi-clause sentences
- natural variation in report-back
- material descriptions using `de + material`, such as `maleta de cuero`

## Product Rule for Scene Vocabulary Budgets

Default focus-item budget per scene:

| Band | Focus items |
| --- | --- |
| `B0` | 2-4 |
| `B1` | 4-6 |
| `B2` | 6-8 |
| `B3` | 8-10 |
| `B4` | 8-12 with a smaller explicit focus subset |

Recycled items may also appear, but the scene should stay readable and playable.

## English Target-Language Role

English target content is not a throwaway debug mode.

It serves real product purposes:

- validate that the band contracts feel coherent
- validate repair behavior and response scaffolds
- validate deterministic evaluation logic with high creator confidence

What English target does not validate as strongly is the learner feeling of cross-language support.

That is why Spanish target remains essential.
