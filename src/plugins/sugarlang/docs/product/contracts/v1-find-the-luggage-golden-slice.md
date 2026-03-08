# V1 Golden Slice: Find the Luggage

## Purpose

This document freezes the first Sugarlang vertical slice as a concrete product content contract.

It is the reference scene that should be used to:

- validate the learner bands
- validate the lexicon model
- validate the grounding model
- validate English and Spanish target-language packs
- validate deterministic evaluation rules

If V1 Sugarlang is still vague after reading this document, the product is not defined well enough.

## Scenario Summary

Narrative objective:

- help an NPC identify and recover a missing piece of luggage

Semantic task:

- identify the correct luggage
- understand or ask about its location
- retrieve it or point it out
- confirm completion

Shared quest truth:

- the quest logic does not change by band
- the language-learning realization changes by band

## Target-Language Scope for This Slice

This slice must ship in:

- English target
- Spanish target

Player-facing support pairings:

- English support for the Spanish-target version
- Spanish support for the English-target version

## Scene Referents

The scene must include these grounded referents.

### Required world referents

- station clerk or traveler NPC
- one red suitcase
- one blue suitcase
- one black suitcase
- a nearby door
- a counter or service desk
- a return point where the player confirms success

### Advanced-band referents

- a platform or announcement-board context
- a green ribbon on one suitcase
- a side door or secondary landmark

## Teachable Concepts in This Slice

The first vertical slice should teach the following concept progression.

| Concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| suitcase | `suitcase` | `maleta` | `B0` |
| red | `red` | `roja` | `B0` |
| yes | `yes` | `sí` | `B0` |
| blue | `blue` | `azul` | `B1` |
| here | `here` | `aquí` | `B1` |
| there | `there` | `allí` | `B1` |
| is / is located | `is` | `está` | `B1` |
| black | `black` | `negra` | `B2` |
| door | `door` | `puerta` | `B2` |
| help | `help` | `ayudar` | `B2` |
| where is | `where is` | `dónde está` | `B2` |
| small | `small` | `pequeña` | `B3` |
| counter | `counter` | `mostrador` | `B3` |
| beside | `beside` | `al lado de` | `B3` |
| green ribbon | `green ribbon` | `cinta verde` | `B3` |
| look for | `look for` | `buscar` | `B3` |
| find | `find` | `encontrar` | `B3` |
| platform | `platform` | `andén` | `B4` |
| leather | `leather` | `de cuero` | `B4` |
| worn | `worn` | `gastada` | `B4` |
| side door | `side door` | `puerta lateral` | `B4` |

Interpretation note:

- `First active band` means first introduction in the slice
- the per-band `Active concepts` lists below describe the scene-active teaching set for that band
- previously introduced concepts may remain active, become passive, or become support-only depending on the band goal

## Out of Scope for This Slice

This slice should not try to teach:

- full past-tense narration below `B4`
- article drills as a primary mechanic
- explicit grammar lectures
- large free vocabulary beyond the scene referents
- open-world dialogue unrelated to the luggage task

## Band-by-Band Contract

### `B0 Anchored Recognition`

Player goal:

- recognize the target suitcase

Active concepts:

- suitcase / `maleta`
- red / `roja`
- yes / `sí`

Support-language behavior:

- visible support-language strip
- preserve `maleta` and `roja` as target-language keywords in the strip

Grounding behavior:

- suitcase objects highlighted on keyword tap
- red suitcase highlighted on color tap
- hint centers camera on the correct suitcase

Response contract:

- yes/no
- object click
- one blank with 3 options

Success rule:

- player confirms recognition
- player selects the red suitcase
- player identifies `maleta` in the final blank

### `B1 Guided Response`

Player goal:

- produce a short location phrase with support

Active concepts:

- `maleta`
- `azul`
- `aquí`
- `allí`
- `está`

Support-language behavior:

- support-language strip remains available
- target-language noun and key location phrase stay visible

Grounding behavior:

- blue suitcase highlight
- location cue highlight

Response contract:

- blank fill
- phrase assembly

Success rule:

- player builds a valid location phrase

### `B2 Constrained Exchange`

Player goal:

- ask or answer one short question in the target language

Active concepts:

- `maleta`
- `negra`
- `puerta`
- `ayudar`
- `dónde está`
- `aquí`
- `allí`

Support-language behavior:

- support-language helper prompt allowed
- glossary chips allowed
- no default full-line translation

Grounding behavior:

- glossary chip tap highlights suitcase or door region

Response contract:

- one short typed sentence

Success rule:

- player expresses one valid intent such as:
  - offer help
  - ask location
  - report location

Concrete evaluator example:

- task prompt: ask where the black suitcase is
- intent family: `ask_location`
- required slot: `object.suitcase`
- optional strengthening slot: `color.black`
- normalization rules:
  - lowercase
  - strip punctuation
  - accept missing accents such as `donde`
  - collapse repeated whitespace
  - ignore optional articles like `la`
- communicative-success examples:
  - `dónde está la maleta negra`
  - `donde esta la maleta negra`
  - `la maleta negra donde esta`
- weak-but-successful examples:
  - `donde esta la maleta`
  - `donde la maleta negra`
  - `maleta negra?`
- fail examples:
  - `sí`
  - `está aquí`
  - `¿dónde está la puerta?`
- scoring split:
  - communicative success requires a recognizable location-query intent plus suitcase reference
  - language accuracy is scored separately based on form quality, canonical chunk use, and slot completeness

### `B3 Independent Task Dialogue`

Player goal:

- handle a short multi-turn task exchange

Active concepts:

- `maleta`
- `pequeña`
- `mostrador`
- `al lado de`
- `cinta verde`
- `buscar`
- `encontrar`
- `ayudar`
- `dónde está`

Support-language behavior:

- on-demand support-language glossary reveal only

Grounding behavior:

- reveal-based highlight for `mostrador`
- reveal-based highlight for the green ribbon

Response contract:

- short multi-turn text
- clarification allowed

Success rule:

- player either interprets the description directly or asks a valid clarification question before success

Concrete evaluator example:

- task prompt: ask one clarification question about the small suitcase near the counter with the green ribbon
- accepted intent families:
  - `clarify_attribute`
  - `clarify_location`
- required slot:
  - at least one of `place.counter`, `object.ribbon_green`, or `size.small`
- normalization rules:
  - lowercase
  - strip punctuation
  - accept missing accents
  - ignore optional articles
  - allow one missing function word if the intent and slot are still recoverable
- communicative-success examples:
  - `está al lado del mostrador?`
  - `tiene una cinta verde?`
  - `es pequeña?`
  - `la maleta pequeña está al lado del mostrador?`
- weak-but-successful examples:
  - `mostrador?`
  - `cinta verde?`
  - `maleta pequena mostrador`
- fail examples:
  - `sí`
  - `gracias`
  - `¿dónde está la puerta?`
- scoring split:
  - communicative success requires a recoverable clarification intent tied to one allowed scene slot
  - language accuracy is scored separately for morphology, prepositions, and fuller canonical phrasing

The English target version uses the same evaluator families and tolerance posture with English lexical realizations.

### `B4 Natural Interaction`

Player goal:

- complete the task through natural-feeling dialogue

Active concepts:

- `andén`
- `de cuero`
- `gastada`
- `puerta lateral`

Support-language behavior:

- no default translation
- optional detail-level clarification only

Grounding behavior:

- world context carries most of the meaning
- UI grounding appears only if requested

Response contract:

- open text within the task
- optional free-form provider if enabled

Success rule:

- player completes the quest through valid descriptive interaction

## English Target-Language Version

The English target version should use the same band contracts and the same scene referents.

Examples:

| Band | Example English target line |
| --- | --- |
| `B0` | `Do you see the red suitcase?` |
| `B1` | `You need the blue suitcase. Where is it?` |
| `B2` | `I lost my suitcase. It is black. Can you help me?` |
| `B3` | `I am looking for a small suitcase I left beside the counter. It has a green ribbon.` |
| `B4` | `I think someone moved my luggage after the platform change announcement. It was a worn leather suitcase with a green ribbon on the handle.` |

English target mode is mainly a creator-validation profile.

It should still obey the same:

- band behavior
- grounding map
- response contracts
- evaluation categories

## Spanish Target-Language Version

The Spanish target version is the primary learner-facing version.

Examples:

| Band | Example Spanish target line |
| --- | --- |
| `B0` | `¿Ves la maleta roja?` |
| `B1` | `Necesito la maleta azul. ¿Dónde está?` |
| `B2` | `Perdí mi maleta. Es negra. ¿Puedes ayudarme?` |
| `B3` | `Estoy buscando una maleta pequeña que dejé al lado del mostrador. Tiene una cinta verde.` |
| `B4` | `Creo que alguien movió mi equipaje cuando anunciaron el cambio de andén. Era una maleta de cuero bastante gastada, con una cinta verde en el asa.` |

## Response-Contract Progression

This slice must demonstrate the full V1 progression:

| Band | Response contract |
| --- | --- |
| `B0` | yes/no, object selection, one blank |
| `B1` | blank fill, phrase assembly |
| `B2` | one short typed sentence |
| `B3` | short multi-turn text |
| `B4` | open text within bounded scene objective |

## Support-Language Progression

This slice must also demonstrate the full support-language progression:

| Band | Support-language behavior |
| --- | --- |
| `B0` | visible support-language strip with protected target keywords |
| `B1` | visible support-language help in prompts and hints |
| `B2` | support-language glossary chips and prompt help |
| `B3` | support-language glossary on demand |
| `B4` | support-language clarification only when requested |

## Grounding Progression

This slice must prove the grounding model:

| Band | Grounding behavior |
| --- | --- |
| `B0` | object and color highlight on tap |
| `B1` | persistent object and location cues |
| `B2` | assistive grounding via glossary chips |
| `B3` | reveal-based grounding for clarification |
| `B4` | mostly naturalistic world context |

## Failure and Recovery in This Slice

This slice must never leave the player stuck.

The required recovery behavior is:

| Band | Failure trigger | Required recovery path |
| --- | --- | --- |
| `B0` | 2 incorrect recognitions | highlight the correct suitcase more strongly, then reveal the answer if the player still misses it |
| `B1` | 2 incorrect assemblies | prefill one correct token or lock the word order further, then reveal the model phrase if needed |
| `B2` | 2 failed parses or wrong intents | show a stronger support-language prompt and offer one or more valid template choices |
| `B3` | 2 failed clarification attempts | simplify the NPC line, reveal grounding on demand, or temporarily downgrade the turn to a constrained prompt |
| `B4` | repeated failure or explicit confusion | offer clarify, repeat, simplify, or temporary structured support without changing the scene objective |

Quest progression rule:

- the player may be nudged or given the answer path after repeated failure
- the quest must not hard-fail because of language weakness alone
- failure recovery should be recorded as support dependence, not hidden as a fully correct turn

## Acceptance Checklist

This vertical slice is product-ready only if:

- both English and Spanish target packs exist
- all five bands are previewable
- the same scenario referents are used across both target languages
- every band has a clear active teaching set
- every band has a clear support-language posture
- every band has a clear grounding posture
- task success remains stable across all bands
- the English target pack is good enough for creator-side evaluation
- the Spanish target pack is good enough to test real learner experience
