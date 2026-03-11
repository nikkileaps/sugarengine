# V1 Golden Slice: Find the Luggage

## Purpose

This document freezes the first Sugarlang vertical slice as a concrete product content contract.

It is the reference interaction bundle used to validate:

- learner-band behavior
- repair-driven interaction
- mixed-language support
- grounded quest binding
- deterministic evaluation
- English and Spanish target packs

If V1 Sugarlang is still vague after reading this document, the product is not defined well enough.

## Scenario Summary

Narrative objective:

- help a station clerk identify and recover a missing piece of luggage

Semantic task:

- understand the luggage description
- locate the correct luggage
- pick it up
- return it to the clerk

Shared quest truth:

- the quest logic does not change by band
- the language-learning realization does change by band

## Target-Language Scope

This slice must ship in:

- English target
- Spanish target

Player-facing support pairings:

- English support for the Spanish-target version
- Spanish support for the English-target version

## Grounded World Truth

The quest slice must include:

- station clerk or traveler NPC
- one red suitcase
- one blue suitcase
- one black suitcase
- a nearby door
- a counter or service desk
- a return point where the player hands the item back

The slice should also include a real interaction loop:

- the correct suitcase can be selected
- the correct suitcase can be picked up
- pickup becomes visible in inventory or held state
- the return step consumes or confirms the returned item

## Grounded Quest Binding for This Slice

The primary reference binding should be:

| Logical element | Slice value |
| --- | --- |
| scenario referent | `target_luggage_primary` |
| world object | `luggage_red_01` in `B0`, `luggage_blue_01` in `B1`, `luggage_black_01` in `B2`, richer feature variants in `B3-B4` |
| interaction affordances | point, inspect, click, pick up, return |
| pickup identity | `pickup_target_luggage` |
| inventory identity | `inventory.target_luggage` |
| return linkage | station clerk completion step |

The exact object changes by band variant, but the binding contract does not.

That means:

- the stable scenario referent is `target_luggage_primary`
- the stable quest chain is talk -> identify -> pick up -> return
- the concrete world object and attached vocabulary entries vary by band

## Vocabulary Entries in This Slice

`First active band` means first introduction in the slice.

Per-band sections below distinguish between:

- `focus items`
  - new or heavily reinforced in that band
- `reinforcement items`
  - previously introduced items intentionally brought back

| Concept | English target | Spanish target | First active band |
| --- | --- | --- | --- |
| suitcase | `suitcase` | `maleta` | `B0` |
| red | `red` | `roja` | `B0` |
| I don't understand | `I don't understand` | `no entiendo` | `B0` |
| point to it | `point to it` | `señálalo` | `B0` |
| blue | `blue` | `azul` | `B1` |
| I need | `I need` | `necesito` | `B1` |
| here is | `here is` | `aquí está` | `B1` |
| there | `there` | `allí` | `B1` |
| black | `black` | `negra` | `B2` |
| door | `door` | `puerta` | `B2` |
| where is | `where is` | `dónde está` | `B2` |
| can you help | `can you help` | `puedes ayudarme` | `B2` |
| small | `small` | `pequeña` | `B3` |
| counter | `counter` | `mostrador` | `B3` |
| beside | `beside` | `al lado de` | `B3` |
| green ribbon | `green ribbon` | `cinta verde` | `B3` |
| platform | `platform` | `andén` | `B4` |
| leather | `leather` | `de cuero` | `B4` |
| worn | `worn` | `gastada` | `B4` |
| side door | `side door` | `puerta lateral` | `B4` |

## Out of Scope for This Slice

This slice should not try to teach:

- explicit grammar lectures
- large free vocabulary outside the quest context
- unrelated open-world dialogue
- perfect orthography as a progression gate

## Shared Failure and Recovery Contract

This slice should use the same recovery posture across bands:

1. first confusion or failure
   - re-present the same task with stronger repair
2. second confusion or failure
   - increase grounding, simplify, or surface stronger chips
3. third confusion or failure
   - offer a guided success path that keeps the quest moving

The player should never get stuck permanently in the first quest.

## Band-by-Band Contract

### `B0 Anchored Recognition`

Player goal:

- recognize the target suitcase and complete the first pickup loop

Focus items:

- `maleta`
- `roja`
- `no entiendo`
- `señálalo`

Recycled items:

- none required beyond these first exposures

Initial NPC move:

- `Do you see la maleta roja?`

Primary response contract:

- chip-composed response
- object click
- pickup
- chip-composed return response

Example response-building chips:

- `Sí`
- `I see`
- `la`
- `maleta`
- `roja`

Example fallback repair responses:

- `No entiendo`
- `Señálalo`
- `¿Qué significa "__" en inglés?`

Clarification note:

- the blank should be prefilled from `maleta` or `roja` in the NPC line
- this band is tap-only

Example resulting responses:

- `Sí, I see la maleta roja.`
- `¿Qué significa "maleta" en inglés?`

Repair behavior:

- if the learner signals confusion, the clerk repairs with mixed language and grounding
- example repair:
  - `Suitcase. La maleta roja.`
- the red suitcase pulses
- `maleta` can highlight all suitcase objects
- `roja` can highlight the red attribute on the target suitcase

Grounded action:

- player clicks the correct suitcase
- the suitcase is picked up
- inventory shows the same referent as `maleta roja`

Completion response:

- chip-built response:
  - `Here is la maleta roja.`

Success rule:

- learner either recognizes directly or uses repair successfully
- learner selects and picks up the correct suitcase
- learner returns it with a guided chip-built response

### `B1 Guided Response`

Player goal:

- produce a short quest-relevant location or handoff phrase with help

Focus items:

- `azul`
- `necesito`
- `aquí está`
- `allí`

Recycled items:

- `maleta`
- repair responses such as `no entiendo`

Initial NPC move:

- `Necesito la maleta azul. Can you show me where it is?`

Primary response contract:

- word bank
- blank fill
- guided assembly
- pickup and return

Example response frame:

- `La maleta ____ está ____ .`

Example word bank:

- `azul`
- `roja`
- `allí`
- `aquí`

Example fallback repair responses:

- `No entiendo`
- `Señálala`
- `¿Qué significa "__" en inglés?`

Clarification note:

- the blank should be prefilled from `necesito` or `azul` in the NPC line
- this band is tap-only

Example resulting responses:

- `La maleta azul está allí.`
- `¿Qué significa "necesito" en inglés?`

At `B1`, the support can stay in the prompt and the scaffold while the completed response is already fully Spanish if that sounds more natural.

Repair behavior:

- if the learner struggles, repair narrows the language and points to the relevant region
- example repair:
  - `La maleta azul. It's over there.`

Grounded action:

- player points to or moves to the correct luggage
- player picks it up
- inventory keeps the `maleta azul` label

Completion response:

- guided assembly:
  - `Aquí está la maleta azul.`

Success rule:

- learner produces one correct location or handoff phrase
- learner completes the pickup and return loop

### `B2 Constrained Exchange`

Player goal:

- type one short idea while still having visible structured help

Focus items:

- `negra`
- `puerta`
- `dónde está`
- `puedes ayudarme`

Recycled items:

- `maleta`
- `aquí está`
- `no entiendo`

Initial NPC move:

- `Perdí mi maleta negra. ¿Puedes ayudarme?`

Primary response contract:

- short constrained text
- a small visible insert tray remains available as support
- pickup and return

Initial support rule:

- the first typed exposure should show the text box and a small insert tray
- first and second failures should reveal `Show me more words` and `Say it more simply`
- third failure should add `Say it in {supportLanguage}` as the final rescue

Example insert chips:

- `sí`
- `te ayudo`
- `la maleta`

Example first-failure repair controls:

- `Show me more words`
- `Say it more simply`

Example expanded insert tray after `Show me more words`:

- `¿Dónde está`
- `negra`
- `cerca de`
- `la puerta`

Example final rescue:

- `Say it in {supportLanguage}`

Clarification note:

- the blank may be prefilled from `perdí` in the NPC line or filled manually by the learner
- manual clarification entry begins here because typed interaction is now available

Example resulting responses:

- `Sí, te ayudo.`
- `¿Dónde está la maleta negra?`
- `¿Qué significa "perdí" en inglés?`

Repair behavior:

- support may expand the insert tray, lower the phrasing to the next-lower band while staying in the target language, clarify a single unknown word, point to a landmark, or finally reveal a support-language paraphrase
- stronger repair controls should not dominate the first exposure
- example repair:
  - `I lost mi maleta negra. Está cerca de la puerta.`

Concrete evaluator example:

- prompt goal: ask where the black suitcase is
- accepted intent family: `ask_location`
- required semantic slot: suitcase
- strengthening slot: black
- normalization:
  - lowercase
  - strip punctuation
  - accept missing accents
  - collapse whitespace
  - ignore optional articles
- communicative-success examples:
  - `dónde está la maleta negra`
  - `donde esta la maleta negra`
  - `la maleta negra donde esta`
- weak-but-successful examples:
  - `donde esta la maleta`
  - `maleta negra?`
- fail examples:
  - `sí`
  - `está aquí`
  - `¿dónde está la puerta?`

Grounded action:

- door region pulses if mentioned in repair
- player picks up the black suitcase
- return step still uses `maleta negra`

Completion response:

- typed short report, optionally assisted by insert chips:
  - `Aquí está la maleta negra.`

Success rule:

- communicative success advances the interaction and the bound quest step
- language accuracy is tracked separately from quest success

### `B3 Independent Task Dialogue`

Player goal:

- handle a short task exchange and ask for clarification if needed

Focus items:

- `pequeña`
- `mostrador`
- `al lado de`
- `cinta verde`

Recycled items:

- `maleta`
- `buscar`
- `encontrar`
- `dónde está`

Initial NPC move:

- `Estoy buscando una maleta pequeña con una cinta verde. La dejé al lado del mostrador.`

Primary response contract:

- short multi-turn text
- pickup and return

Fallback support:

- no visible support on first exposure
- first and second failures should reveal:
  - `Show me more words`
  - `Say it more simply`
- third failure should add:
  - `Say it in {supportLanguage}`

Example `Show me more words` reveal:

- `¿Qué significa`
- `mostrador`
- `cerca de`
- `la puerta`
- `Voy a buscar`
- `la maleta`

Repair behavior:

- `Say it more simply` should rephrase the line at a B2-style level while staying in the target language
- `Say it in {supportLanguage}` is the final rescue, not the default support mode
- example repair:
  - `El mostrador, the counter there. La maleta pequeña está al lado.`

Concrete evaluator example:

- prompt goal: ask a valid clarification question before searching
- accepted intent families:
  - `clarify_location`
  - `clarify_feature`
- required slot:
  - one of `counter`, `door`, `green_ribbon`, or `small_suitcase`
- communicative-success examples:
  - `¿Está cerca de la puerta?`
  - `¿Qué significa mostrador?`
  - `¿La maleta tiene una cinta verde?`
- weak-but-successful examples:
  - `puerta?`
  - `mostrador?`
- fail examples:
  - `sí`
  - `gracias`
  - unrelated text with no clarification intent

Grounded action:

- `mostrador` reveal highlights the counter
- `cinta verde` reveal highlights the distinguishing suitcase feature
- player picks up the correct suitcase and returns it

Completion response:

- short typed report:
  - `Encontré la maleta con la cinta verde.`

Success rule:

- player may succeed directly or through clarification
- chip scaffolds appear only after failure

### `B4 Natural Interaction`

Player goal:

- complete the task through a mostly natural interaction

Focus items:

- `andén`
- `de cuero`
- `gastada`
- `puerta lateral`

Recycled items:

- `maleta`
- `cinta verde`
- `encontrar`

Initial NPC move:

- `Creo que alguien movió mi equipaje cuando anunciaron el cambio de andén. Era una maleta de cuero bastante gastada, con una cinta verde en el asa.`

Primary response contract:

- open text in a bounded task
- optional `sugaragent` if the game enables it

Fallback support:

- hidden by default
- reveal-based clarification or repair only

Repair behavior:

- naturalistic clarification and simplification
- no tutorial-style translation strip

Grounded action:

- world context carries most meaning
- player still picks up the correct suitcase and returns it

Completion response:

- natural report-back:
  - `Encontré la maleta. Estaba junto a la puerta lateral.`

Success rule:

- interaction remains completable with scripted delivery only
- `sugaragent` may enrich turn realization but does not own correctness
