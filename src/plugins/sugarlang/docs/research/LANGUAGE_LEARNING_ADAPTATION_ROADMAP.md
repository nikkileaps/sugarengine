# Language Learning Adaptation Roadmap (Post-SugarAgent Core)

## Superseded Notice

This document is retained as historical research context.

The canonical Sugarlang product, architecture, and implementation guidance now live in:

- `src/plugins/sugarlang/docs/product/README.md`
- `src/plugins/sugarlang/docs/product/contracts/`
- `src/plugins/sugarlang/docs/architecture/sugarlang-strategic-architecture.md`
- `src/plugins/sugarlang/docs/plans/001-sugarlang-v1-implementation-plan.md`

## Note

This is an earlier research roadmap.

The current intended direction for production architecture is:

- a separate `sugarlang` plugin
- English-first authored quest/dialogue content
- AI-generated Sugarlang overlays that can be refined in the editor or from chat
- human-readable game-root files as the source of truth for Sugarlang content

See:

- `src/plugins/sugarlang/docs/product/README.md`
- `src/plugins/sugarlang/docs/product/contracts/`
- `src/plugins/sugarlang/docs/architecture/sugarlang-strategic-architecture.md`
- `src/plugins/sugarlang/docs/plans/001-sugarlang-v1-implementation-plan.md`

## 1) Why This Exists

This is a forward-looking research roadmap for extending SugarAgent from:

- immersive free-form NPC conversation

to:

- adaptive language-learning conversation that adjusts to player level, with the initial product centered on English/Spanish support-target pairings.

It is intentionally separate from the core SugarAgent implementation plan so we can revisit it after the base plugin is stable.

## 2) Product Goal

Build an RPG conversation system where player free-form text is continuously evaluated, and NPC language complexity adapts to keep the player challenged but not overwhelmed.

## 3) What We Already Have as Foundations

Current plugin architecture already supports this direction:

- Optional plugin boundary (`GameConfig.plugins`)
- Structured turn outputs
- Event stream + persistence hooks
- Deterministic intent gating
- Local-first model provider strategy
- Cross-platform runtime adapter model (desktop + mobile)

This means the language-learning layer can be added as a plugin feature set without changing core scripted gameplay systems.

## 4) Continuation Plan (Rough)

### Phase LL-0: Baseline Learning Data Contracts

- Add learner profile schema under plugin state:
  - `targetLanguage`
  - `estimatedLevel` (A1-C2)
  - `confidence`
  - `strengths[]`, `weaknesses[]`
  - rolling turn metrics
- Add per-turn analysis payload schema:
  - comprehension signals
  - grammar/vocabulary indicators
  - estimated level delta

MVP check:

- Run sim and confirm turn analysis + learner profile are saved to `save.plugins.sugarlang`.

### Phase LL-1: Level Estimation Engine

- Implement first-pass CEFR-style estimator from player text turns.
- Use rubric-driven scoring (vocabulary range, grammatical control, task success, fluency proxies).
- Track confidence and avoid overreacting to single-turn noise.

MVP check:

- Feed known sample transcripts and confirm estimated level bands are plausible.

### Phase LL-2: Adaptive Dialogue Policy

- Add policy layer that maps learner state -> NPC response constraints:
  - sentence length
  - vocabulary tier
  - grammar complexity
  - percentage of target language vs scaffold language
- Add adaptation pacing rules (do not jump difficulty too quickly).

MVP check:

- Same NPC, same topic, different mocked learner levels -> visibly different response complexity.

### Phase LL-3: Pedagogical Response Modes

- Add response modes selectable per NPC/persona:
  - immersive only (no explicit correction)
  - gentle recast
  - explicit correction on request
  - hint-first
- Add error-class tagging (agreement, tense, word choice, word order).

MVP check:

- Player makes a known mistake and NPC response mode behaves as configured.

### Phase LL-4: Learning Loops in Quests/Activities

- Add optional learning-oriented objectives that remain compatible with normal quest flow.
- Add micro-goals (use past tense, ask a question, negotiate meaning).
- Keep these as plugin-level overlays, not core quest system rewrites.

MVP check:

- Complete one conversation objective and verify learner profile updates.

### Phase LL-5: Longitudinal Progression

- Add periodic proficiency snapshots and trend reporting.
- Distinguish short-term conversational success from durable progress.
- Add forgetting model / spaced reinforcement hooks.

MVP check:

- Multi-session run shows stable progression history and confidence calibration.

### Phase LL-6: Multi-Language Generalization

- Make adaptation language-agnostic with language-specific rubrics.
- Start with English-support/Spanish-target and Spanish-support/English-target profiles and compare behavior.
- Add language-specific morphology/grammar detectors as modular analyzers.

MVP check:

- Switch target language in profile and verify policy/rubric path switches correctly.

### Phase LL-7: Evaluation Harness + Release Gates

- Add offline eval suites:
  - level estimation quality
  - adaptation quality
  - pedagogical consistency
  - intent safety regressions
  - desktop/mobile parity checks
- Add transcript replay and scored reports.

MVP check:

- One command runs eval suite and outputs pass/fail report with artifacts.

## 5) Key Research Questions

1. How accurate can level estimation be from short free-form turns?
2. What adaptation pacing avoids learner frustration?
3. How much explicit correction improves learning without breaking immersion?
4. Which signals best predict real improvement over sessions?

## 6) Risk Areas

- Mis-leveling players (too easy or too hard responses)
- Pedagogically bad corrections despite fluent dialogue
- Overfitting to test prompts instead of real play
- High local inference cost for turn analysis + generation
- Cross-platform behavior drift between desktop and mobile adapters

## 7) Suggested Success Metrics

- Level estimation agreement vs rubric-labeled samples
- Player comprehension proxy rate (successful turn continuation)
- Correction usefulness ratings (if/when UX captures this)
- Session-over-session proficiency trend stability
- No regression in scripted-game behavior when plugin disabled

## 8) Revisit Trigger

Revisit this roadmap after SugarAgent core milestones are complete:

- local LLM structured dialogue
- memory persistence
- lore grounding
- intent gating
- single-NPC in-game vertical slice

At that point, prioritize LL-0 through LL-2 first for a realistic first language-learning prototype.
