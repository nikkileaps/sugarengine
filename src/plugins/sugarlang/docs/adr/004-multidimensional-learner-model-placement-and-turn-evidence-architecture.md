# ADR-SL-004: Multidimensional Learner Model, Placement, and Turn Evidence Architecture

## Status

Proposed

## Context

The product roadmap already rejects a runtime architecture based only on a single CEFR label.

That is the right call.

A single label like `A2` does not tell the system enough about:

- what the learner can understand
- what they can produce
- how much help they need
- whether they can repair misunderstandings
- whether they are succeeding only when heavily scaffolded

At the same time, CEFR is still useful as a familiar reporting framework and coarse placement reference.

This ADR defines the architecture around learner state, placement, and turn evidence.

## Decision

Sugarlang will use a multidimensional learner model backed by explicit placement artifacts and persistent turn evidence.

The key decisions are:

1. Runtime adaptation will be driven by a multidimensional `LearnerState`, not by CEFR alone.
2. CEFR-style levels may be derived for reporting, placement summaries, or segmentation, but they are not the primary runtime control variable.
3. Placement is a bounded input into learner state, not the sole source of truth.
4. Every learning-relevant turn produces structured evidence.
5. Sugarlang must distinguish communicative success, language-form quality, and support dependence.
6. Learner-state and evidence artifacts must preserve the active target-language and support-language context.

## Architectural Strategy

### 1. Learner State Is Multidimensional

At a minimum, Sugarlang should track dimensions like:

- target language
- support language
- comprehension
- production
- vocabulary control
- grammar control
- repair ability
- confidence
- help usage
- support-language usage or dependence
- frustration or overload signals
- known structures
- unstable structures
- recent exposures

These are the variables that actually drive turn adaptation and response-mode selection.

### 2. CEFR Is Derived, Not Primary

CEFR is valuable because it is a shared vocabulary for:

- product design
- progress reporting
- external expectations

But runtime adaptation should not collapse to a single `estimatedLevel` field.

Instead:

- placement tests may output a suggested CEFR band
- learner state may derive a reporting CEFR label
- turn adaptation should still consult the richer state

### 3. Placement Is a Distinct Architecture Concern

Placement should be stored as its own artifact or event, separate from general turn evidence.

Why:

- placement is a coarse initial estimate
- ongoing interaction should update learner state
- later re-placement or recalibration should be possible

### 4. Turn Evidence Must Be Stored as Evidence, Not Only as Conclusions

Each turn should preserve structured evidence like:

- quest, scenario, interaction, and turn identity
- target-language and support-language pair
- stable scenario referent and optional grounded band variant
- source quest-node and dialogue-beat refs
- player input
- expected task
- achieved or not achieved
- response mode
- response-frame or scaffold type
- support-language policy used
- mixed-language surface policy used
- support-language scaffolds shown or requested
- grounding aids shown or used
- grammar/vocabulary indicators
- support requests
- retries
- active `focus`, `reinforcement`, and `ambient` vocabulary entries
- analyzer confidence

This enables:

- calibration
- debugging
- eval replay
- later re-scoring when evaluator logic improves

These fields are especially important because `en -> es` and `es -> en` are different learning contexts even when the interaction semantics are identical.

### 5. Success Must Be Split into Multiple Axes

Sugarlang should not confuse:

- "the player completed the communicative task"
- "the player wrote the most grammatical answer"
- "the player needed help to succeed"

Those are different facts.

The system should store them separately.

## Why This Supports the Product and Use Cases

This directly supports the use cases where:

- a beginner succeeds with recognition only
- a guided beginner succeeds with heavy scaffolding
- a constrained conversational learner succeeds despite minor language errors
- an advanced learner receives lower support and higher production demands

A single CEFR label cannot capture those differences well enough.

A multidimensional learner model can.

## Comparable Product Patterns and Research Basis

The strongest standards basis is the CEFR itself:

- the CEFR framework and Companion Volume treat language ability as multidimensional across reception, production, interaction, and mediation.[1]

Comparable product patterns reinforce the need for placement plus ongoing evidence:

- Busuu's placement test covers multiple language skills and gives a suggested placement level rather than claiming to fully define the learner forever.[2]
- Busuu aligns courses and certificates to CEFR levels, showing the value of CEFR as a reporting and curriculum label.[3]
- Babbel explicitly offers lessons at the learner's level and placement testing for course entry.[4]
- Busuu also notes that placement can affect which vocabulary and grammar items are treated as already mastered in review, which is effectively a mastery-state design rather than level-only design.[2]

The pattern is:

- use placement
- keep a progression model
- separate reporting from operational adaptation

## Alternatives Considered

### 1. Single `estimatedLevel` Field Only

Rejected.

Why:

- too noisy
- not expressive enough
- easy to mis-level beginners

### 2. Only Use Ongoing Turn Evidence and No Placement

Rejected.

Why:

- first-run experience becomes poor
- adaptation would need too much evidence before becoming useful

### 3. Only Store Derived Scores, Not Raw Evidence

Rejected.

Why:

- debugging and replay become weak
- evaluator improvements cannot be applied retrospectively

## Technology and Pattern Options

This ADR does not mandate exact schemas, but it favors:

- versioned learner-state schemas
- versioned placement artifacts
- immutable or append-friendly evidence records
- derived summary views built from evidence
- explicit confidence values for inferential updates

These patterns are compatible with:

- local browser persistence
- later server analytics
- human review or correction integration

## Future-Compatible Growth Path

### Browser-Local AI

Local analyzers or local LLMs may help classify learner turns, but the learner-state contract stays the same.

### Commercial API Models

Commercial models may provide richer classification or explanation, but their outputs should still be mapped into the same learner-state and evidence model.

### Self-Hosted LLM

Self-hosted evaluators can do the same.

The important rule is:

external models may produce signals, but they do not redefine the learner-state contract.

That prevents vendor or topology lock-in.

## Consequences and Tradeoffs

Positive:

- better adaptation fidelity
- safer beginner handling
- richer analytics
- better replay and calibration

Tradeoffs:

- more data model complexity
- calibration work is unavoidable
- privacy boundaries must be stronger because more learning data is stored

## Sources

[1] Council of Europe, "Common European Framework of Reference for Languages (CEFR)"  
[https://www.coe.int/en/web/common-european-framework-reference-languages](https://www.coe.int/en/web/common-european-framework-reference-languages)

[2] Busuu, "What is a Placement Test?"  
[https://help.busuu.com/hc/en-us/articles/16526383831569-What-is-a-Placement-Test](https://help.busuu.com/hc/en-us/articles/16526383831569-What-is-a-Placement-Test)

[3] Busuu, "How many languages can I learn?" and "What are Certificates and how can I get them?"  
[https://help.busuu.com/hc/en-us/articles/16519527128849-How-many-languages-can-I-learn](https://help.busuu.com/hc/en-us/articles/16519527128849-How-many-languages-can-I-learn)  
[https://help.busuu.com/hc/en-us/articles/16559434818321-What-are-Certificates-and-how-can-I-get-them](https://help.busuu.com/hc/en-us/articles/16559434818321-What-are-Certificates-and-how-can-I-get-them)

[4] Babbel, "Learn a language with the Babbel App" and "Learn a Language Online - Fast and Effective"  
[https://www.babbel.com/mobile](https://www.babbel.com/mobile)  
[https://www.babbel.com/](https://www.babbel.com/)
