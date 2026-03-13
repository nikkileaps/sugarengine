# Deterministic Banded Turn Generation

## Purpose

This document defines the first-pass generation model for turning simple English-authored quest dialogue into persisted Sugarlang interaction turns across learner bands.

It answers:

- what the input is
- what the generator is allowed to do deterministically
- what the output bundle must contain for each band
- what can be polished later by an LLM without changing the interaction structure

This is a domain and authoring API contract.

It is not a code schema.

## Core Rule

For bounded scripted dialogue beats, the first pass does not need an LLM.

It can work deterministically by:

1. reading the quest node and its English dialogue beat
2. matching dialogue vocabulary against the shared lexicon
3. assigning vocabulary roles per band budget
4. rendering each turn via band-based lexical substitution (swap depth controlled by mixing level)
5. emitting one persisted turn bundle per band

Sugarlang does not classify dialogue into interaction families. The quest graph provides structural context. The lexicon provides the vocabulary swap table. The band policy controls mixing depth.

This first pass is intentionally allowed to be simple and somewhat blunt.

The goal is:

- structurally correct
- lexically legal
- grounded
- previewable
- repair-aware

The goal is not:

- perfect idiomatic target-language prose on the first pass

## Inputs

The deterministic generator should receive, at minimum:

- `questId`
- source quest node ref (exactly one, per the 1:1 rule)
- source English dialogue beat text (walked from the dialogue tree)
- involved NPC refs
- involved world-object or region refs
- resolved grounded context (NPC id/name, world-object refs, attributes, quest binding refs)
- target language
- support language
- learner band
- shared lexicon rows for the target language
- band policy for the target band

## Output

For each band, the generator should emit a full turn bundle, not just a translated line.

Each banded turn bundle should include an ordered list of turns. Each turn has a role:

- **`npc_delivery`** — NPC speaks. Learner reads and absorbs vocabulary. Band-mixed rendering, no response contract.
- **`player_delivery`** — Player character speaks scripted narrative. Same band-based lexical substitution but no active learning apparatus (no response contract, no evaluation, no repair).
- **`learner_response`** — Learner must produce or select something. Carries the full band treatment: response contract, scaffold, repair ladder, and evaluation target.

The bundle as a whole should also include:

- `focus`, `reinforcement`, and `ambient` vocabulary entry ids
- `responseSource` (`explicit_choice` or `generic`) on each `learner_response` turn
- `editStatus` (`generated`, `reviewed`, or `manual`) and `sourceHash` for provenance tracking (see ADR-015)
- quest-success hook

## Band-Based Lexical Substitution

The generator does not translate. It performs lexical substitution on the original English dialogue text. The band's mixing level controls how many words get swapped from English to target language:

- **B0 (`full_support`)**: swap only `focus` vocabulary, rest stays English
- **B1 (`heavy_support`)**: swap `focus` + `reinforcement`, rest stays English
- **B2 (`light_support`)**: swap all matched vocabulary, unmatched stays English
- **B3-B4 (`target_dominant`, `target_only`)**: swap everything possible, including function words (articles, pronouns, copulas from a small per-language lookup table)

Unmatched English words stay in English. For V1 (English-authored, non-English target), this is correct band behavior — lower bands are already designed to leave support-language words in place.

Word order will be blunt at B2+ (e.g. "roja maleta" instead of "maleta roja"). The LLM polish pass fixes word order as part of its surface rewriting.

## Turn Role Derivation

The generator walks the dialogue tree and assigns a turn role to each dialogue node:

- NPC lines become `npc_delivery` turns
- Player lines (Holly) become `player_delivery` turns (passive, band-mixed, no evaluation)
- When an NPC node has multiple `DialogueNext` edges with `text` labels, the choice labels produce a `learner_response` turn with `responseSource: 'explicit_choice'`
- When a dialogue ends after NPC delivery with no player choice, the generator emits a generic `learner_response` turn with `responseSource: 'generic'` (flagged for author review)
- Narrator and excerpt lines are skipped for turn generation but their vocabulary may feed into `ambient` roles

## Worked Example

### Source quest beat

- quest node type: `Talk`
- English dialogue beat: `Hello. My name is Bippity. I am the Station Master.`

### Derived interaction

- one interaction derived from this quest node (1:1 rule)
- turn roles: `npc_delivery` (NPC line), then `learner_response` with `responseSource: 'generic'` (no authored player choices in this beat)
- focus vocabulary at B0: `hola`, `soy`

### Example banded output

| Band | NPC line | Focus | Reinforcement | Ambient | Primary response | Visible scaffolds | Repair ladder | Evaluation target | Quest hook |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `B0` | `Hola. Soy Bippity. I'm the Station Master.` | `hola`, `soy` | none | `station master` | chip composition | `Hola`, `Soy Mim` chips; NPC name badge visible | repeat with highlight; point to NPC badge; support-language paraphrase | recognize greeting and submit greeting or `Soy Mim` | complete bound greeting interaction on success |
| `B1` | `Hola. Me llamo Bippity. Soy Station Master.` | `me llamo` | `hola`, `soy` | `station master` | guided frame | `Me llamo ____` frame; short word bank | more words; simpler target-language restatement; support-language rescue | fill self-introduction frame successfully | complete bound greeting interaction on success |
| `B2` | `Hola. Me llamo Bippity. Soy el jefe de estación.` | `jefe de estación` | `hola`, `me llamo`, `soy` | none | constrained text | text input with insert tray | `Show me more words`; `Say it more simply`; `Say it in English` | produce short self-introduction or acknowledgement within contract | complete bound greeting interaction on success |
| `B3` | `Hola. Me llamo Bippity. Soy el jefe de estación.` | none or unstable target item | `hola`, `me llamo`, `soy`, `jefe de estación` | none | short free text | minimal prompt text | hidden first repair; simpler target-language repair; support-language rescue | reply appropriately with light form tolerance | complete bound greeting interaction on success |
| `B4` | `Hola. Me llamo Bippity. Soy el jefe de estación.` | none | all relevant known items | none | open bounded reply | none by default | optional clarification only | natural short reply with communicative success | complete bound greeting interaction on success |

Notes:

- The lower-band lines are allowed to leave some meaning in support language or ambient wording.
- The higher-band lines carry more of the original beat in the target language.
- The line is not the whole artifact. The repair ladder, scaffolds, and evaluation target are part of the same generated band package.

## Persistence Contract

The generated result should be persisted structurally, not reconstructed ad hoc from the English line every time.

For each target language and band variant, the persisted interaction overlay should capture:

- interaction identity
- source quest-node ref (exactly one)
- source dialogue-beat refs
- NPC refs
- world-object refs
- current target language
- current support language posture
- ordered list of turns, each with:
  - turn id
  - turn role (`npc_delivery`, `player_delivery`, or `learner_response`)
  - rendered target-language text
  - support text (at lower bands)
  - `focus`, `reinforcement`, and `ambient` entry ids
  - response contract and scaffold (for `learner_response` only)
  - repair ladder (for `learner_response` only)
  - evaluation target (for `learner_response` only)
  - `responseSource` (`explicit_choice` or `generic`, for `learner_response` only)
- allowed quest-success hook
- `editStatus` (`generated`, `reviewed`, or `manual`), `sourceHash`, and optional `generationNote` (see ADR-015)

That persistence rule is what makes later review, preview, and manual refinement possible.

## What the Deterministic Pass Is Allowed To Be Bad At

The first pass is allowed to be rough at:

- idioms
- jokes
- tone-heavy clauses
- natural clause compression
- highly idiomatic role labels
- elegant mixed-language phrasing

Those are the places where a later human or LLM polish pass may help.

## Optional Later LLM Surface Polish

A later manual or integrated LLM pass may rewrite surface language such as:

- NPC delivery line wording
- word order and gender agreement
- repair line wording
- happy-path response phrasing
- natural mixed-language glue

That later pass should not silently change:

- interaction identity
- quest bindings
- grounding refs
- vocabulary role ids
- response contract
- evaluation target
- quest-success hook

Unless the operation explicitly allows a broader structural rewrite.

When a turn is approved after LLM polish, its `editStatus` changes from `generated` to `reviewed`. When manually edited, it changes to `manual`. Re-sync only overwrites turns where `editStatus == 'generated'`. If the source dialogue has changed under a `reviewed` or `manual` turn (detected via `sourceHash` mismatch), it is flagged as stale but not overwritten. See ADR-015 for the full provenance tracking, reconciliation, and LLM refinement architecture.

## Product Rule

The deterministic first pass should get the game to:

- playable
- banded
- repair-aware
- structurally persisted

Then a later pass can improve style.

That is good enough for V1.

See [ADR-SL-014: Quest-Beat Traversal and Deterministic Interaction Derivation Algorithm](../adr/014-quest-beat-traversal-and-deterministic-interaction-derivation-algorithm.md) for the full pseudocode and detailed algorithm.
