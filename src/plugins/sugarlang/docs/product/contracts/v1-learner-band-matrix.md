# V1 Learner Band Matrix

## Purpose

This document defines the canonical learner-experience bands for V1 Sugarlang.

These bands are product-facing presets.

They do not replace the multidimensional learner model.

Instead:

- runtime learner state remains multidimensional
- placement and adaptation map that state into one of these scene-facing bands
- authoring, preview, QA, and AI generation use these bands as the stable contract

## Scope

This matrix is the V1 contract for:

- English as a target language
- Spanish as a target language
- English as a support language
- Spanish as a support language

The normal player-facing language pairs are:

- `supportLanguage = English`, `targetLanguage = Spanish`
- `supportLanguage = Spanish`, `targetLanguage = English`

In product terms, `support language` means the learner's scaffold language, usually their strongest or native language.

## Product Decision

V1 uses five canonical bands:

1. `B0 Anchored Recognition`
2. `B1 Guided Response`
3. `B2 Constrained Exchange`
4. `B3 Independent Task Dialogue`
5. `B4 Natural Interaction`

These map directly to the current `Find the Luggage` use cases.

## Core Product Rules Across All Bands

### 1. Repair Exists at Every Band

Sugarlang is not a translation-strip product.

It is a repair-driven product.

Every band must support some form of:

- repeat
- simplify
- support-language rephrase
- point or highlight
- clarification request
- fallback response help

What changes by band is how visible and intrusive those supports are.

### 2. The First Move and the Repair Move Are Different Things

Scenes should distinguish between:

- initial delivery
  - how the NPC speaks before the learner asks for help or fails
- repair delivery
  - how the scene responds when the learner needs help

V1 should prefer:

- heavily mixed initial delivery at `B0`
- narrower but still mixed initial delivery at `B1`
- target-language-first initial delivery from `B2` upward
- mixed-language and grounded repair when needed
- natural-sounding mixed utterances over forced token replacement

over:

- always-visible translated subtitles

### 3. Chips Stay in the Product

Chips are not a beginner-only dead end.

They remain a valid Sugarlang scaffold across the product.

In these docs:

- a `chip` is a selectable token or very short chunk
- a `response` is the submitted utterance or action
- a `repair response` is a fallback response option such as `No entiendo`, `Señálalo`, or a target-language clarification response such as Spanish-target `¿Qué significa "__" en inglés?`
- repair responses are separate fallback controls, not chips
- a clarification repair response should be tap-only in `B0` and `B1`
- manual clarification entry should appear only once typed interaction is introduced
- chips may help build a response, but they are not the full response by definition

What changes is their role:

- primary response mode in early bands
- visible support scaffold in mid bands
- failure-triggered or on-request support in later bands

### 4. Vocabulary Load Has Two Counts

Each scene should think about vocabulary in two buckets:

- `focus items`
  - new or heavily reinforced items the scene is actively teaching
- `recycled items`
  - previously introduced items that reappear for retrieval and fluency

The per-band budgets below refer to `focus items`.

Recycled items should still appear, especially for retrieval, but should not overload the scene.

### 5. Quest Progression Should Favor Communicative Success

V1 should not hard-gate quest completion on perfect language form.

The default rule is:

- progress on communicative success and task success
- score language accuracy separately
- increase repair and support on failure
- do not trap the player in unwinnable language loops

## Approximate CEFR Orientation

CEFR remains a reporting aid only.

| Band | Approximate CEFR reference |
| --- | --- |
| `B0 Anchored Recognition` | pre-A1 to early A1 |
| `B1 Guided Response` | A1 to early A2 |
| `B2 Constrained Exchange` | A2 to low B1 |
| `B3 Independent Task Dialogue` | B1 to low B2 |
| `B4 Natural Interaction` | high B2 to C1 |

## Band Matrix

| Band | Player promise | Initial NPC posture | Default repair posture | Primary response mode | Chip role | Focus-item budget |
| --- | --- | --- | --- | --- | --- | --- |
| `B0` | "I can succeed without typing." | heavily mixed line where a few active target words stay visible inside support-language framing | mixed-language rephrase, pointing, highlight, repeat | chip composition, object selection, single blank | primary | 2-4 |
| `B1` | "I can fill in a short answer with help." | mixed line with more target-language carry-through and clear grounded referents | mixed-language repair plus guided location or action phrasing | word bank, blank fill, guided assembly | not primary for full-response building | 4-6 |
| `B2` | "I can type one short idea and still get help." | mostly target-language line with bounded task framing | shorter repair, support-language helper prompt, glossary, repair responses, or insert chips | short constrained text | visible support scaffold | 6-8 |
| `B3` | "I can handle a short task exchange and ask for clarification." | mostly natural target-language exchange | targeted rephrase, optional simplify, fallback chip composition after failure | short multi-turn text | fallback or on request | 8-10 |
| `B4` | "The game treats me like a capable speaker." | naturalistic task dialogue | low-friction clarification and optional support only | open text in a bounded scene | hidden fallback | 8-12 with a smaller focus subset |

## Detailed Band Contract

### `B0 Anchored Recognition`

Player promise:

- "I can succeed through recognition, context, and guided choice."

Primary outcome:

- object recognition
- early confidence
- first vocabulary anchoring

Support-language posture:

- heavy in the initial line, repair, and response scaffold
- selective and token-aware
- active focus words stay in the target language while surrounding framing may remain in the support language
- no default requirement for a full translated line under the main line

Grounding posture:

- maximum
- always-on object and attribute anchors
- pointing or highlight as a normal part of repair

Primary response modes:

- chip composition using single-word or short-chunk chips
- single-token chips like `yes` or `no` only when richer chip sets are not practical
- object selection
- single blank
- tap-only clarification repair

Fallback support:

- repeat
- simplify
- support-language rephrase
- repair responses
- point/highlight
- stronger hint path

Scene authoring rule:

- 2-4 focus items
- 1-3 recycled items maximum

### `B1 Guided Response`

Player promise:

- "I can fill in a short quest-relevant answer with help."

Primary outcome:

- guided production
- recognition plus blank filling
- short action or location phrases

Support-language posture:

- still present in the initial line, repair, and response scaffold, but narrower than `B0`
- mixed-language repair remains normal
- more target-language chunks should carry through in the happy path
- support is increasingly tied to task verbs and function words rather than translating everything
- if the happy-path response sounds unnatural when mixed, prefer a natural target-language response with support kept in the prompt, scaffold, or repair

Grounding posture:

- high
- persistent object, attribute, and location bindings

Primary response modes:

- word bank
- blank fill
- guided assembly
- tap-only clarification repair

Word-bank rule:

- the learner fills one or more authored blanks from a bounded candidate pool
- the pool may include a small number of plausible scene-grounded distractors
- distractors should come from visible alternatives in the scene, not random unrelated vocabulary

Fallback support:

- repeat
- simplify
- repair responses
- stronger pointing or highlighting

Scene authoring rule:

- 4-6 focus items
- 2-4 recycled items
- start with one or two blanks in early `B1`
- allow more blanks only as the learner is still succeeding comfortably

### `B2 Constrained Exchange`

Player promise:

- "I can type one short idea, and the game still helps me stay on track."

Primary outcome:

- short typed production
- clear intent expression
- early typed interaction with real repair

Support-language posture:

- moderate
- the initial line should now be mostly target language
- used mostly in repair, helper prompts, glossary, repair responses, or insert chips
- no default full-line translation

Grounding posture:

- medium-high
- object and region grounding remain explicit

Primary response modes:

- short constrained text
- one-sentence question
- one-sentence report
- clarification repair may now allow manual word entry

Fallback support:

- insert chips for key target-language words or short chunks
- repair responses
- stronger prompt framing after failure

Scene authoring rule:

- 6-8 focus items
- 3-5 recycled items

### `B3 Independent Task Dialogue`

Player promise:

- "I can handle a short task-oriented exchange and ask for clarification if I need it."

Primary outcome:

- short dialogue
- clarification behavior
- report-back language tied to task completion

Support-language posture:

- low by default
- surfaced on request or after failure

Grounding posture:

- medium
- reveal-based rather than always-on

Primary response modes:

- short multi-turn text
- short report-back
- clarification question

Fallback support:

- simplify
- reveal one glossary or grounding item
- fallback chip composition after failure

Scene authoring rule:

- 8-10 focus items
- 3-6 recycled items

### `B4 Natural Interaction`

Player promise:

- "The game trusts me to handle the task mostly naturally."

Primary outcome:

- natural-feeling task dialogue
- nuanced description
- minimal interruption

Support-language posture:

- minimal
- mostly on demand

Grounding posture:

- naturalistic and world-first
- helper overlays are secondary

Primary response modes:

- open text within a bounded task
- optional free-flowing conversation if the game enables `sugaragent`

Fallback support:

- clarification
- repeat
- simplify
- hidden or explicit help reveal

Scene authoring rule:

- 8-12 focus items
- use a smaller explicit teaching subset even if more language is present

## Failure and Recovery Contract

V1 needs a clear recovery policy.

The default product rule is:

1. first failure or confusion signal
   - keep the same task
   - repair with slightly stronger support
2. second failure
   - increase grounding or simplify further
   - surface stronger chip sets or hints
3. third failure
   - offer a guided success path that keeps the quest moving
   - record heavy support usage instead of hard-failing the quest

Band-specific expectation:

- `B0`: degrade quickly into very explicit chips and pointing
- `B1`: degrade into stronger guided assembly
- `B2`: degrade from typing toward insert chips, repair responses, or tighter text framing
- `B3`: degrade from free typing toward fallback chip composition or stronger clarification support
- `B4`: degrade gently, preserving natural feel before surfacing overt scaffolds

## Product Rule for Response Progression

The same scene should feel like a different interaction across bands.

The intended progression is:

- `B0`: recognize -> choose -> point -> act
- `B1`: recognize -> assemble -> act -> report
- `B2`: type one short idea -> act -> type one short report
- `B3`: short exchange -> clarify if needed -> act -> report
- `B4`: natural interaction -> act -> natural report-back

## Product Rule for Vocabulary Recycling

Scenes should deliberately re-use previously introduced words.

Examples:

- the NPC says `maleta`
- a chip-built repair response says `No veo la maleta`
- the object label reinforces `maleta`
- the pickup or inventory step still says `maleta`
- the return line says `Aquí está la maleta`

That is the intended V1 pattern.
