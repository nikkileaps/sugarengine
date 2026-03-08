# V1 Learner Band Matrix

## Purpose

This document defines the canonical learner-experience bands for V1 Sugarlang.

These bands are product-facing presets.

They are not a replacement for the multidimensional runtime learner state.

Instead:

- runtime learner state remains multidimensional
- placement and adaptation map that state into one of these scene-facing bands
- authoring, preview, and QA use these bands as the stable contract

## Scope

This matrix is the V1 contract for:

- English as a target language
- Spanish as a target language
- English as a support language
- Spanish as a support language

For the player-facing V1 product, the normal language pairs are:

- `supportLanguage = English`, `targetLanguage = Spanish`
- `supportLanguage = Spanish`, `targetLanguage = English`

Target and support may be forced to the same language in internal preview or QA workflows, but that is not the main learner-facing contract.

The same band model should apply to both target languages.

What changes by target language is the surface content.

What should not change is the learner experience shape.

## Product Decision

V1 uses five canonical bands:

1. `B0 Anchored Recognition`
2. `B1 Guided Response`
3. `B2 Constrained Exchange`
4. `B3 Independent Task Dialogue`
5. `B4 Natural Interaction`

These bands map directly to the current `Find the Luggage` use cases.

| Band | Current use case |
| --- | --- |
| `B0 Anchored Recognition` | `UC-001` |
| `B1 Guided Response` | `UC-002` |
| `B2 Constrained Exchange` | `UC-003` |
| `B3 Independent Task Dialogue` | `UC-004` |
| `B4 Natural Interaction` | `UC-005` |

## How These Bands Relate to CEFR

CEFR remains a reporting aid only.

The approximate V1 mapping is:

| Band | Approximate CEFR reference |
| --- | --- |
| `B0 Anchored Recognition` | pre-A1 to early A1 |
| `B1 Guided Response` | A1 to early A2 |
| `B2 Constrained Exchange` | A2 to low B1 |
| `B3 Independent Task Dialogue` | B1 to low B2 |
| `B4 Natural Interaction` | high B2 to C1 |

These are orientation labels, not control logic.

## Band Contract

### `B0 Anchored Recognition`

Player promise:

- "I can succeed without typing."

Primary outcome:

- object recognition
- keyword recognition
- early confidence

Support-language default:

- high mixed-language support
- preserve 1-3 target-language tokens in otherwise support-language framing

Grounding default:

- maximum
- explicit highlights
- tap-to-inspect vocabulary anchors

Allowed player response modes:

- yes/no
- multiple choice
- object selection
- single blank

Not allowed:

- free typing
- grammar explanations as primary interaction
- multi-step language production

Scene authoring rule:

- each scene should teach no more than 2-4 active target-language items

### `B1 Guided Response`

Player promise:

- "I can build a short answer with help."

Primary outcome:

- guided phrase production
- recognition plus assembly

Support-language default:

- medium-high mixed-language support
- support strip or hint copy may stay in English
- important target-language nouns and phrases remain visible

Grounding default:

- high
- persistent object and attribute bindings

Allowed player response modes:

- blank fill
- phrase assembly
- word bank
- guided structured text

Not allowed:

- unconstrained sentence writing
- scenes with too many new target-language concepts at once

Scene authoring rule:

- each scene should teach 4-6 active target-language items

### `B2 Constrained Exchange`

Player promise:

- "I can type one short idea and still know what kind of answer is expected."

Primary outcome:

- short typed production
- clear intent expression

Support-language default:

- medium support-language use
- English appears in prompts, glossary chips, or hints
- full translation is not shown by default

Grounding default:

- medium-high
- scene-keyword chips tied to visible referents

Allowed player response modes:

- short constrained text
- one-sentence question
- one-sentence report

Not allowed:

- open-ended chat
- evaluation that depends entirely on an LLM judge

Scene authoring rule:

- each scene should teach 6-8 active target-language items

### `B3 Independent Task Dialogue`

Player promise:

- "I can handle a short task-oriented exchange and ask for clarification if I need it."

Primary outcome:

- task completion through short dialogue
- clarification and repair

Support-language default:

- low by default
- support shown on request

Grounding default:

- medium
- reveal-based grounding instead of always-on highlighting

Allowed player response modes:

- short multi-turn text
- clarifying question
- short report-back

Not allowed:

- excessive hand-holding
- scenes that silently shift into unbounded roleplay

Scene authoring rule:

- each scene should teach 8-10 active target-language items

### `B4 Natural Interaction`

Player promise:

- "The game treats me like a capable speaker."

Primary outcome:

- natural-feeling task dialogue
- nuanced description
- low-friction support

Support-language default:

- minimal
- mostly on demand

Grounding default:

- naturalistic and world-first
- the scene itself should carry meaning before UI helper text does

Allowed player response modes:

- open text within a bounded task
- optional free-form conversation when the game enables it

Not allowed:

- tutorial-style scaffolding as the default presentation
- progression rules that require `sugaragent`

Scene authoring rule:

- each scene should still declare a focused teaching target, even if surface language is broad

## Cross-Band Rules

These rules hold across all five bands:

- the quest objective does not change
- the semantic task does not change
- the same scene referents should remain valid across bands
- the evaluation model must separate task success from language quality
- support language should fade, not disappear arbitrarily
- grounding should move from explicit to naturalistic, not from present to absent

## Active Vocabulary Interpretation

The active vocabulary budgets in this document apply to the scene-active teaching set for that band.

They do not mean:

- every previously introduced item must remain active forever
- every visible target-language word counts against the budget
- passive or support-only carry-forward items count as active teaching load

The intended interpretation is:

- the language content model defines the first introduction band for a concept
- each scene language pack defines the active teaching set for a given band
- previously introduced concepts may remain active, become passive, or become support-only depending on the scene goal

This keeps the band budgets meaningful without forcing cumulative vocabulary inflation.

## English-Target and Spanish-Target Behavior

The band contract is the same in both target languages.

### English target

Use case:

- player-facing English learning for a Spanish-support learner
- creator-side evaluation of the English target-language pack
- evaluator sanity checking of response contracts and grading logic

Behavior note:

- in the normal player-facing flow, support language is Spanish
- mixed-language scaffolding should preserve English teaching tokens inside Spanish scaffolding
- internal same-language preview may exist, but it is not the default product behavior

### Spanish target

Use case:

- real learner-facing experience
- validation of scaffolding, grounding, and vocabulary introduction

Behavior note:

- in the normal player-facing flow, support language is English
- mixed-language scaffolding becomes a major learning lever

## Default Scene Support Expectations

V1 scene support by band should default to:

| Band | Support-language default | Grounding default | Correction default |
| --- | --- | --- | --- |
| `B0` | always visible | always visible | implicit only |
| `B1` | visible in prompts and hints | always visible | implicit or very light |
| `B2` | visible in prompts or glossary | visible on demand and for key nouns | light recast allowed |
| `B3` | on demand | on demand | optional recast after success |
| `B4` | on demand only | mostly naturalistic | off by default |

## Failure and Recovery Contract

No Sugarlang scene may dead-end the player on language performance alone.

The cross-band recovery rules are:

- quest progression may depend on communicative success for the current step, but not on perfect grammar
- repeated failure must increase support, narrow the response contract, or reveal a path forward
- one weak turn must not immediately downgrade the learner's overall band
- fallback actions should be recorded as evidence of support dependence, not treated as silent success

Default retry and fallback posture by band:

| Band | Expected retry budget | Required fallback posture |
| --- | --- | --- |
| `B0` | 2 failed attempts before escalation | increase grounding, narrow choices, then reveal the answer and continue if needed |
| `B1` | 2 failed attempts before escalation | lock or prefill part of the phrase, then reveal the model answer and continue if needed |
| `B2` | 2 failed parses or wrong intents before escalation | show stronger support-language prompting or template choices, then allow a guided completion path |
| `B3` | 2 failed clarification attempts before escalation | simplify the NPC line, reveal grounding, or downgrade to a more constrained response contract for that turn |
| `B4` | 1-2 failed attempts before escalation | offer on-demand clarification, glossary, or temporary constrained support without collapsing the whole scene into tutorial mode |

## Preview and QA Contract

Every V1 Sugarlang scene should be previewable in all five bands.

For each band, QA should be able to answer:

- what the player is being asked to do
- which target-language items are active in the scene
- how much support-language text is visible
- how the scene is grounded in world context
- what counts as task success
- what counts as language weakness without task failure

If those answers are unclear, the scene is not ready.
