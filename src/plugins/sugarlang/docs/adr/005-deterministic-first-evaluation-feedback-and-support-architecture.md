# ADR-SL-005: Deterministic-First Evaluation, Feedback, and Support Architecture

## Status

Proposed

## Context

Sugarlang must support:

- fill-in-the-blank
- word-bank responses
- constrained short text
- strict accuracy checking without an LLM
- optional recasts, hints, simplification, and explanations

This is not a side case.

It is the core of the product, especially for beginner and intermediate learners.

If the architecture assumes that every meaningful evaluation must be done by an LLM judge, then:

- beginner flows become more expensive
- reliability gets worse
- browser-first deployment gets harder
- product trust goes down

At the same time, higher-level free-form tasks may benefit from AI-generated explanations or richer judgment in the future.

This ADR defines the evaluation and feedback posture that keeps those options open without making them mandatory.

## Decision

Sugarlang will adopt a deterministic-first evaluation architecture with separable support and feedback layers.

The core decisions are:

1. Low- and mid-band learning tasks must be completable and gradable without LLM dependence.
2. Response contracts determine which evaluator family is used.
3. Task success, form quality, and support dependence are scored separately.
4. Feedback is not identical to grading.
5. Inline corrective interruption should be used conservatively; delayed or optional feedback is a first-class pattern.
6. LLM-based evaluation or explanation may be added later for advanced use cases, but it must not become the sole architecture for correctness.

## Architectural Strategy

### 1. Response Mode Drives Evaluation Mode

Examples:

- chip composition -> exact, accepted-sequence, or accepted-token-set evaluators
- blank fill with word bank -> slot-by-slot evaluators with accepted candidates and optional distractors
- repair responses -> exact or accepted-template evaluators
- constrained short text -> intent-plus-slot evaluators
- open text -> broader semantic evaluators, optionally AI-assisted

This keeps evaluator selection explainable and predictable.

### 2. Deterministic Evaluators Are the Default

Deterministic evaluation should be the default for:

- recognition tasks
- guided production
- constrained production
- scene-bounded reporting

Typical evaluator types may include:

- exact match
- accepted answer set
- token multiset or sequence check
- per-slot fill validation
- slot fulfillment
- morphology or agreement checks
- intent family match under a bounded grammar
- bounded clarification-template checks

For bounded scripted interaction families, deterministic generation and deterministic evaluation should line up.

If the generator emitted, for one band:

- a response contract
- a scaffold
- a repair ladder
- an evaluation target
- a quest-success hook

then the evaluator should consume that same structured bundle rather than trying to reverse-engineer intent from the final line alone.

### 3. Quest Progression and Language Evaluation Must Stay Distinct

The player may be allowed to succeed at the quest even if their answer is imperfect.

The system should separately record:

- communicative success
- grammar weakness
- vocabulary weakness
- support usage

When Sugarlang does drive a quest beat, the evaluation result should produce:

- an interaction outcome
- an optional quest-completion recommendation tied to the allowed quest binding

The engine still decides whether to apply that progression recommendation.

This prevents the product from becoming punitive while still preserving useful learning signals.

### 4. Feedback Layer Is Separate from Scoring

The system should support:

- hint
- repeat
- simplify
- recast
- optional explicit explanation
- degradation from harder response modes to stronger scaffolds such as repair responses, word-bank blank fill, or insert chips

These should be chosen by pedagogy policy, not hard-wired to the evaluator result.

At typed bands, staged repair should increase support in distinct dimensions rather than repeating the same help in multiple buttons.

For `B2`, the preferred ladder is:

1. `Show me more words`
   - increases production support by expanding the visible insert tray
2. `Say it more simply`
   - increases comprehension support by rephrasing the prompt at a lower band while staying in the target language
3. `Say it in {supportLanguage}`
   - provides a final support-language paraphrase for that turn only

This staged ladder is still deterministic-first because:

- the repair actions are authored,
- the visibility thresholds are authored or policy-driven,
- the resulting scaffolds remain bounded,
- the evaluator still scores task success, form quality, and support dependence separately.

### 5. Delayed or Optional Feedback Is a First-Class Pattern

For many conversational flows, especially higher bands, continuous interruption harms immersion and confidence.

The architecture should support:

- immediate feedback
- delayed end-of-scene feedback
- on-request explanation
- silent evidence capture with no visible correction

This is especially important for the first deterministic pass generated from quest dialogue beats:

- the repair ladder is authored or generated as structure
- the evaluator should score against that same structure
- a later LLM polish pass may improve wording, but it should not become the only thing holding the interaction together

## Why This Supports the Product and Use Cases

This ADR is directly responsible for the feasibility of:

- UC-001 and UC-002 without any LLM requirement
- UC-003 and UC-004 with constrained text and deterministic evaluation
- UC-005 with optional richer turn realization but still deterministic quest correctness

It also protects the browser-first story:

- deterministic evaluators are cheap
- transparent
- debuggable
- stable across deployment environments

## Comparable Product Patterns and Research Basis

Comparable products show a clear pattern:

- Babbel describes a progression from structured speaking practice to more natural conversation, explicitly emphasizing scaffolding and reduced cognitive load.[1]
- Busuu Conversations describes scenario-specific goals and targeted vocabulary/grammar feedback after the conversation, rather than constant interruption during it.[2]
- Busuu also relies on human and community correction for spoken and written exercises, showing that evaluation and feedback are layered concerns rather than one monolithic "answer grader."[3][4]
- Duolingo Roleplay gives post-interaction feedback on accuracy and complexity, and Duolingo Max also includes "Explain My Answer" as a separate feature rather than the sole turn mechanism.[5]

The pattern is not "LLM judges everything all the time."

The pattern is:

- bounded tasks where possible
- feedback separated from task flow
- richer explanation layered on top

## Alternatives Considered

### 1. LLM Judge for All Text Responses

Rejected.

Why:

- costly
- opaque
- brittle for browser-first deployment
- unnecessary for many task types

### 2. Perfect Grammar Required for Quest Success

Rejected.

Why:

- pedagogically too harsh
- discourages risk-taking
- misreads communicative competence

### 3. Constant Inline Correction

Rejected.

Why:

- breaks flow
- increases anxiety
- is misaligned with the advanced use cases

## Technology and Pattern Options

Patterns compatible with this ADR include:

- finite accepted-answer lists
- morphology-aware analyzers
- constrained grammar matchers
- lexicon or slot tables
- rule-based intent classifiers for bounded scenes
- optional AI-generated explanation layers

For browser-local execution, many of these evaluators can be:

- plain application logic
- lightweight analyzers
- small in-browser ML models

No single evaluation technology is mandated.

The mandated architecture is deterministic-first.

## Future-Compatible Growth Path

### Browser-Local AI

Local small models may enhance explanation or advanced-band analysis while deterministic evaluation remains the correctness backbone.

### Commercial API Models

Commercial models may be used for:

- advanced-band explanation
- freer semantic interpretation
- feedback rewriting

But their outputs should be advisory or supplemental unless explicitly validated against Sugarlang contracts.

### Self-Hosted LLM

Self-hosted models can fill the same optional role.

The architecture remains the same:

- deterministic evaluator as trusted baseline
- model-assisted reasoning as an optional augmentation layer

This preserves portability and trust.

## Consequences and Tradeoffs

Positive:

- reliable beginner and intermediate support
- lower runtime cost
- better browser fit
- clearer debugging and testability

Tradeoffs:

- advanced free-text nuance is harder to capture deterministically
- response contracts must stay disciplined
- more evaluator design work is required up front

## Sources

[1] Babbel, "Introducing Babbel Speak: AI-Powered Confidence for Travel, Futbol, and Everyday Life"  
[https://www.babbel.com/press/en-us/releases/babbel-speak](https://www.babbel.com/press/en-us/releases/babbel-speak)

[2] Busuu, "What are Busuu Conversations and how can they help me learn a language?"  
[https://help.busuu.com/hc/en-us/articles/21862192336402-What-are-Busuu-Conversations-and-how-can-they-help-me-learn-a-language](https://help.busuu.com/hc/en-us/articles/21862192336402-What-are-Busuu-Conversations-and-how-can-they-help-me-learn-a-language)

[3] Busuu, "What is Busuu?"  
[https://help.busuu.com/hc/en-us/articles/15936615354641-What-is-Busuu](https://help.busuu.com/hc/en-us/articles/15936615354641-What-is-Busuu)

[4] Busuu, "How can I correct other learners' exercises?" and "How do I send my exercises to the Community?"  
[https://help.busuu.com/hc/en-us/articles/16721992566417-How-can-I-correct-other-learners-exercises](https://help.busuu.com/hc/en-us/articles/16721992566417-How-can-I-correct-other-learners-exercises)  
[https://help.busuu.com/hc/en-us/articles/16722928943377-How-do-I-send-my-exercises-to-the-Community](https://help.busuu.com/hc/en-us/articles/16722928943377-How-do-I-send-my-exercises-to-the-Community)

[5] Duolingo, "Introducing Duolingo Max, a learning experience powered by GPT-4"  
[https://blog.duolingo.com/duolingo-max/](https://blog.duolingo.com/duolingo-max/)
