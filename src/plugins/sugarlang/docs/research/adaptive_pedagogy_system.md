Product Proposal
Adaptive Pedagogy System for an Immersive Language Learning Game

Superseded Notice:

This document is retained as historical research context.

The canonical Sugarlang product contracts and ADRs now live in:

- `src/plugins/sugarlang/docs/product/contracts/`
- `src/plugins/sugarlang/docs/adr/`
- `src/plugins/sugarlang/docs/architecture/sugarlang-strategic-architecture.md`

Project: Café Nollie (or similar immersive language-learning narrative game)
Document Type: Product + Pedagogical Architecture Proposal
Audience: Engineering, AI/LLM engineers, Game designers, Curriculum designers

Note:

This document is an earlier research proposal.

The current intended production direction assumes:

- a separate `sugarlang` plugin
- English-first authored game content
- AI-generated Sugarlang overlays that can be refined in the editor or from chat
- human-readable game-root files as the source of truth for Sugarlang content

See:

- `src/plugins/sugarlang/docs/product/README.md`
- `src/plugins/sugarlang/docs/product/contracts/`
- `src/plugins/sugarlang/docs/architecture/sugarlang-strategic-architecture.md`
- `src/plugins/sugarlang/docs/plans/001-sugarlang-v1-implementation-plan.md`

1. Executive Summary

This document proposes an adaptive language pedagogy system for a narrative-driven game.

The system separates:

Narrative progression

Language difficulty

Players progress through the same story and quests, but the language complexity adapts to their proficiency level.

This allows beginners and advanced learners to experience the same narrative while receiving appropriately leveled language input.

The design follows principles from modern second-language acquisition research, including:

Comprehensible Input

Adaptive difficulty

High-frequency vocabulary acquisition

Contextual learning through interaction

The result is a system where language learning emerges naturally from gameplay rather than from explicit lessons.

2. Core Design Principles
2.1 Story ≠ Curriculum

The narrative is fixed and universal.

Language is adaptively rendered depending on the player’s proficiency.

Example:

Narrative intent:

NPC asks player if they want coffee.

Possible language renderings:

Beginner:

¿Quieres café?

Intermediate:

¿Quieres tomar un café?

Advanced:

¿Te gustaría tomar un café?

The semantic intent remains constant, while linguistic complexity changes.

2.2 Comprehensible Input (i+1)

The system should present language slightly above the player’s current ability.

Concept introduced by
Stephen Krashen.

Definition:

Input difficulty = player ability + small challenge

Too easy → boredom
Too hard → frustration

The adaptive system must maintain this balance.

2.3 Contextual Language Learning

Players acquire language through problem-solving interactions, not drills.

Example quest:

Find the missing baker in the marketplace.

Player must ask NPCs questions in the target language.

Language becomes a tool to solve gameplay problems.

3. System Architecture Overview

The pedagogy system is composed of five layers.

Narrative Engine
      ↓
Dialogue Intent Layer
      ↓
Language Rendering System
      ↓
Adaptive Difficulty Engine
      ↓
Player Interaction System
4. Narrative Layer

This layer defines the game’s story and quests.

Example episode:

Episode: Market Delivery

Objectives:
• Talk to the baker
• Ask the fruit seller for directions
• Deliver the package

This layer contains no language complexity constraints.

Instead it stores semantic dialogue intents.

Example:

intent: ask_location_of_baker
intent: offer_player_drink
intent: thank_player
5. Dialogue Intent Layer

Each NPC line is represented as a semantic intent.

Example:

Intent: ask_if_player_wants_coffee

This intent can be rendered into multiple language forms.

Example renderings:

Beginner

¿Quieres café?

Intermediate

¿Quieres tomar un café?

Advanced

¿Te gustaría tomar un café?

The intent layer ensures:

narrative continuity

consistent meaning

flexible linguistic complexity

6. Player Proficiency Model

The system maintains a player language model.

Example structure:

PlayerLanguageProfile
{
    CEFRLevel
    VocabularyBand
    GrammarBand
    ResponseAccuracy
    AverageResponseTime
}
7. Vocabulary Bands

Instead of episode-based vocabulary sets, the system uses frequency-based vocabulary bands.

Example:

Band	Words Known
Band 1	300
Band 2	600
Band 3	1200
Band 4	2500

Dialogue generation must satisfy:

word_frequency_rank ≤ player_vocabulary_band

This ensures players encounter high-frequency vocabulary first.

8. Grammar Complexity Bands

Grammar is also controlled through bands.

Example progression:

Band	Grammar Allowed
1	present tense
2	basic questions
3	reflexive verbs
4	past tense
5	complex clauses

The rendering system should restrict grammar usage to the player’s band.

9. Adaptive Difficulty Engine

Player level is determined through two mechanisms.

Initial Placement Test

At game start the player completes:

comprehension tasks

conversation responses

The system estimates:

CEFR level

Example:

A1
A2
B1
Continuous Adaptation

Player performance updates difficulty.

Metrics tracked:

response accuracy
response latency
sentence complexity
vocabulary usage

Example rule:

if success_rate > 85%
    increase complexity
10. Dialogue Rendering System

The dialogue system converts semantic intents into language output.

Constraints include:

vocabulary_band
grammar_band
sentence_length

Example rendering pipeline:

intent → candidate sentence pool → difficulty filter → final line

Possible implementations:

template system

grammar-aware generation

LLM generation with constraints

11. Vocabulary Exposure Tracking

To support retention, the system tracks word exposure frequency.

Example record:

WordRecord
{
    word: "café"
    exposures: 8
    mastery_score: 0.6
}

Words should reappear using spaced repetition principles.

Typical exposure schedule:

first exposure
10 minutes later
1 day later
3 days later
1 week later
12. Interaction Loop

Each conversation should follow this pedagogical loop.

1. NPC provides input
2. Player interprets meaning
3. Player produces response
4. NPC provides feedback
5. Vocabulary repeats later
13. Beginner Support (Without Translation)

The system should avoid heavy reliance on native language translation.

Instead support comprehension through:

Visual Context

NPC animations or props clarify meaning.

Repetition

NPC repeats key phrases.

Highlighting

Key words visually emphasized.

Optional Translation Button

Available but not required.

14. Player Interaction Modes

Language production evolves over time.

Early Stage

listen

choose responses

Intermediate Stage

partial typing

sentence completion

Advanced Stage

free-form dialogue

15. Example Gameplay Scenario

Quest:

Order a drink at the café

Beginner dialogue:

NPC

Hola.
¿Quieres café?

Choices

Sí.
No.

Intermediate dialogue:

NPC

Hola.
¿Quieres tomar un café?

Player response:

Quiero café.

Advanced dialogue:

NPC

¿Te gustaría tomar algo?

Player response:

Sí, me gustaría un café.
16. Benefits of This System

This architecture enables:

scalable content

adaptive difficulty

immersion-driven learning

multi-level player compatibility

Players of different proficiency levels can experience the same story while receiving appropriately leveled language input.

17. Future Extensions

Potential future systems include:

AI conversation generation

pronunciation evaluation

speech recognition interaction

narrative branching based on language ability

18. Success Metrics

Key metrics to evaluate effectiveness:

vocabulary acquisition rate

session duration

player retention

conversational accuracy growth

CEFR progression

If you'd like, I can also write a second companion document engineers would probably need:

“Technical Architecture for the Adaptive Dialogue Engine.”

That one would cover things like:

intent schemas

vocabulary filtering

LLM prompt design

memory tracking

runtime difficulty adjustment

—and it would map very cleanly onto the NPC planner architecture you've already been building.

Technical Architecture Proposal
Adaptive Dialogue Engine for an Immersive Language Learning Game

Project: Café Nollie (or similar narrative language-learning game)
Document Type: Engineering Architecture Proposal
Audience: Backend Engineers, AI/LLM Engineers, Gameplay Engineers, Systems Architects

1. Overview

The Adaptive Dialogue Engine generates NPC dialogue that adapts to the player’s language proficiency while maintaining consistent narrative intent.

The system separates:

Narrative intent

Language rendering

Difficulty adaptation

This allows the same story content to be delivered at multiple language levels without rewriting the narrative.

2. System Goals
2.1 Primary Goals

Adaptive language complexity

Narrative consistency

High replayability

scalable content creation

support for multiple proficiency levels

2.2 Non-Goals

The system is not intended to

provide traditional grammar lessons

enforce rigid vocabulary sequences

replace narrative writing with fully procedural content

3. High-Level Architecture
Narrative System
      ↓
Intent Engine
      ↓
Dialogue Renderer
      ↓
Difficulty Filter
      ↓
Player Interaction

Each layer isolates a different concern.

4. Core Components
4.1 Narrative Engine

The narrative engine controls:

quests

character goals

scene progression

world state

Example quest:

Quest: Find the missing delivery
Objectives:
• talk to baker
• ask vendor for directions

Dialogue events emitted by this system reference semantic intents, not language.

Example:

intent: ask_location
intent: greet_player
intent: thank_player
5. Intent Schema

Dialogue is defined using intent objects.

Example structure:

Intent {
    id: "ask_location_baker",
    speaker: "fruit_vendor",
    target: "player",
    semantic_goal: "request_information",
    parameters: {
        location: "baker"
    }
}

These intents contain meaning, not phrasing.

6. Dialogue Rendering Layer

The rendering layer converts an intent into a sentence.

Example:

Intent:

ask_location(baker)

Possible renderings:

Beginner:

¿Dónde está el panadero?

Intermediate:

¿Sabes dónde está el panadero?

Advanced:

¿Podrías decirme dónde trabaja el panadero?

Rendering can be implemented using:

template pools

grammar-aware generators

LLM-based generation

7. Vocabulary Constraint System

The dialogue renderer must obey vocabulary constraints.

Each word is assigned a frequency rank.

Example dataset:

word: "café"
frequency_rank: 320

Player profile includes:

vocabulary_band = 600

Constraint rule:

frequency_rank ≤ vocabulary_band

Words above this threshold must be replaced.

Example substitution:

beverage → café
8. Grammar Constraint System

Grammar features are also tagged.

Example metadata:

SentenceFeatures {
    tense: "present"
    clause_type: "simple"
    question: true
}

Player grammar capability:

grammar_band = 2

Allowed features:

Band	Grammar
1	present tense
2	basic questions
3	reflexives
4	past tense
5	subordinate clauses

Rendering engine filters candidate sentences accordingly.

9. Player Language Model

Each player has a dynamic language profile.

Example structure:

PlayerLanguageModel {
    CEFRLevel
    vocabulary_band
    grammar_band
    known_words
    word_exposure_history
    response_accuracy
}

The model is updated after each interaction.

10. Vocabulary Exposure Tracker

Words should reappear at controlled intervals.

Example structure:

WordExposure {
    word
    exposure_count
    last_seen_timestamp
    mastery_score
}

Exposure scheduling follows spaced repetition patterns.

11. Adaptive Difficulty Engine

Difficulty adjusts continuously based on player performance.

Inputs:

response correctness
response latency
sentence complexity
word recall success

Example rule:

if accuracy > 0.85
    vocabulary_band += 100

This ensures players remain in the optimal difficulty zone.

12. Dialogue Generation Strategies

The renderer may use one of three strategies.

Strategy 1 — Template Pools

Each intent contains predefined sentences.

Example:

intent: greet_player

templates:
level_1: "Hola."
level_2: "Hola, ¿cómo estás?"
level_3: "Hola, ¿cómo te encuentras hoy?"

Advantages:

predictable

easy to control

Disadvantages:

content heavy

Strategy 2 — Grammar Generator

Uses grammatical rules to assemble sentences.

Example pipeline:

intent → grammar tree → vocabulary selection → surface form

Advantages:

scalable

deterministic

Disadvantages:

complex to implement

Strategy 3 — LLM Generation

Uses a language model constrained by prompts.

Example prompt:

Generate a Spanish sentence asking if the player wants coffee.
Constraints:
• vocabulary rank ≤ 600
• grammar ≤ A1
• sentence ≤ 6 words

Advantages:

flexible

low authoring cost

Disadvantages:

requires guardrails

13. Hybrid Rendering Model

Recommended approach:

templates for core dialogue
LLM for dynamic dialogue

This ensures reliability while enabling flexible conversation.

14. Player Response Processing

Player input must be interpreted.

Example pipeline:

player text
→ intent classification
→ grammar analysis
→ vocabulary detection
→ feedback generation

Outputs include:

correctness score

language complexity estimate

15. Feedback System

NPC responses should encourage learning.

Examples:

Correct response:

NPC: Exacto.

Minor error:

NPC: Casi. Intenta otra vez.

Corrected example:

NPC: Quieres decir "Quiero café".
16. Conversation Loop

Each interaction follows a predictable loop.

NPC intent
→ dialogue render
→ player response
→ interpretation
→ feedback
→ update player model
17. Integration with NPC Planner

The dialogue system integrates with the NPC planner.

Example flow:

NPC goal: serve customer
planner step: ask order
dialogue intent: ask_drink

The planner determines what to say.

The dialogue system determines how to say it.

18. Example Runtime Flow
player enters café
↓
NPC planner chooses intent
↓
dialogue renderer generates sentence
↓
difficulty filter applied
↓
NPC speaks
↓
player responds
↓
response evaluated
↓
player model updated
19. Data Sources Required

The system requires several linguistic datasets.

Word Frequency Lists

Common vocabulary ordered by frequency.

CEFR Word Lists

Vocabulary tagged by difficulty.

Grammar Feature Tags

Sentence complexity metadata.

20. Scalability Considerations

The system should support:

multiple languages

multiplayer interactions

persistent player models

cloud-based language generation

21. Future Enhancements

Possible future improvements:

speech recognition input

pronunciation scoring

generative NPC dialogue

semantic conversation memory

22. Summary

The Adaptive Dialogue Engine enables a narrative-driven game to function as a dynamic language learning environment.

By separating narrative intent from language rendering, the system can deliver:

adaptive difficulty

natural conversation

scalable content

while maintaining consistent storytelling
