# Plan 014: Configurable Title Screen And Plugin-Scoped Player Language Profile

## Status

Implemented.

## Purpose

Make the game start/title screen a real game-owned surface instead of a hardcoded demo artifact, and use it to resolve Sugarlang player language settings before gameplay begins.

This plan exists to solve two linked problems:

1. the current title/start screen is not properly configurable per game
2. conversation sessions can begin with unresolved Sugarlang language state like `lang=?/?` and `band=auto`

The goal is to make language/band selection explicit at game start so runtime conversation does not have to guess.

## Problem Statement

Today the start/title/game screen is still partially hardcoded and does not cleanly support per-game customization.

Examples:

1. the title can still show placeholder/demo branding instead of game-owned data
2. menu buttons are not yet fully configurable per game
3. there is no player-facing start-screen control for Sugarlang target language
4. there is no player-facing start-screen control for Sugarlang learner band
5. conversation can therefore start with unresolved values like:
   - `targetLanguage = undefined`
   - `supportLanguage = undefined`
   - `learnerBandOverride = undefined`
   - effectively surfacing as `lang=?/? band=auto`

That unresolved state causes downstream instability:

1. short turns like `hola` can be classified without target-language-aware social protections
2. Sugarlang and SugarAgent can behave differently between local preview and hosted web
3. `auto` is not a meaningful player-facing runtime setting; it is an absence of resolved state

## Architectural Rules

1. The title/start screen is engine-owned and game-configurable.
2. Player startup choices must be stored in engine-owned player profile state, not hidden transient UI state.
3. Sugarlang-specific player settings must remain plugin-scoped, not promoted to fake engine-global language concepts.
4. Runtime conversation should consume resolved concrete values, not `auto`.
5. `supportLanguage` remains implicitly `'en'` for now and is not user-configurable in this plan.
6. The engine remains usable without Sugarlang/SugarAgent enabled.
7. Local preview/debug controls may override Sugarlang player settings, but only by writing through the same Game-owned player profile source of truth.

## Proposed Model

### Game-Owned Start Screen Configuration

Add game/project-configurable title screen data for things like:

1. game title
2. subtitle/tagline
3. button labels
4. button visibility/order
5. whether Sugarlang setup controls are shown
6. default start-screen language/band selections

This should replace demo-specific hardcoded strings and make the start screen per-game.

### Engine-Owned Player Profile

Add an engine-owned player profile root that can persist player-facing game/session choices:

```ts
playerProfile: {
  plugins: {
    sugarlang?: {
      targetLanguage: string;
      supportLanguage: 'en';
      learnerBand: string;
    };
  };
}
```

Important:

1. this is engine-owned profile storage
2. but the actual language-learning fields are plugin-scoped under `playerProfile.plugins.sugarlang`
3. this avoids pretending `learnerBand` is a universal engine concept when it is really a plugin concern

### Runtime Resolution Rule

Before gameplay conversation starts:

1. target language must be resolved to a concrete value
2. learner band must be resolved to a concrete value
3. support language is implicitly resolved to `'en'`

After this plan, runtime conversation should not begin with:

1. `band=auto`
2. `lang=?/?`

Those unresolved values may still exist in authoring/editor defaults internally, but they should not survive into active play sessions.

### Preview Debug Override Rule

Local preview should retain the debug HUD ability to override:

1. target language
2. learner band

But those overrides must:

1. write into the same Game-owned `playerProfile.plugins.sugarlang` state
2. avoid creating a second hidden runtime-only state channel
3. remain clearly scoped to local preview/dev usage

## Non-Goals

1. Do not redesign the entire title screen visual system in one pass.
2. Do not add arbitrary plugin-defined title screen widgets in this plan.
3. Do not add non-English support-language selection in this plan.
4. Do not make learner-band logic globally engine-native outside the plugin namespace.
5. Do not redesign Sugarlang pedagogy semantics beyond replacing unresolved startup state with explicit resolved state.

## Target Outcome

After this plan:

1. each game can configure its title/start screen title and menu labels
2. the start screen can expose Sugarlang target-language and learner-band selectors when relevant
3. start-screen selections persist into engine-owned `playerProfile.plugins.sugarlang`
4. gameplay conversations start with concrete:
   - `targetLanguage`
   - `supportLanguage = 'en'`
   - `learnerBand`
5. runtime conversation no longer relies on `auto` as a live player-facing band state
6. preview debug HUD overrides still work while mutating the same Game-owned profile state

## Source-Of-Truth Decision

The source of truth for active player language-learning setup should be:

1. `playerProfile.plugins.sugarlang`

Not:

1. transient title-screen component state
2. SugarAgent plugin-private memory only
3. hidden preview-only overrides

That means the title screen is a configuration entry surface, but the profile is the durable runtime source of truth.

## Workstreams

### Phase 14A: Start Screen Configuration Model

Files likely involved:

1. start/title screen UI modules
2. game config / project document structures
3. editor panels or config surfaces that define title-screen data

Tasks:

1. identify the current start/title screen source of truth
2. replace hardcoded branding/button text with game-configurable data
3. add a config shape for title text, button labels, and Sugarlang-control visibility
4. ensure defaults preserve current behavior for games that do not customize anything

Acceptance criteria:

1. the title is no longer hardcoded to demo-specific text
2. start-screen labels are loaded from game-owned config
3. games without Sugarlang enabled do not show Sugarlang controls

### Phase 14B: Engine-Owned Player Profile With Plugin Scope

Files likely involved:

1. engine save/profile state types
2. game bootstrap / persistent player state loading
3. plugin integration points that read player profile

Tasks:

1. add `playerProfile.plugins.sugarlang`
2. define a normalized shape:
   - `targetLanguage`
   - `supportLanguage`
   - `learnerBand`
3. persist/load it through engine-owned profile state
4. keep the namespace optional when the plugin is absent

Acceptance criteria:

1. Sugarlang settings are stored in engine-owned player profile state
2. the fields are plugin-scoped, not globalized incorrectly
3. the engine still runs when that namespace is absent

### Phase 14C: Start Screen Selection Flow

Files likely involved:

1. start/title screen UI
2. game bootstrap/start flow
3. Game/ConversationHost initialization path

Tasks:

1. add target-language dropdown to the start screen
2. add learner-band dropdown to the start screen
3. implicitly set `supportLanguage = 'en'`
4. write the result into `playerProfile.plugins.sugarlang`
5. apply those values before the first conversation session can start

Acceptance criteria:

1. a player can pick target language and band before starting play
2. the game stores those choices in the player profile
3. conversation starts with concrete language/band values instead of unresolved `auto`

### Phase 14D: Preview Debug HUD Parity

Files likely involved:

1. preview/debug HUD modules
2. [Game.ts](/Users/nikki/projects/sugarengine/src/engine/core/Game.ts)
3. any existing Sugarlang preview control surfaces

Tasks:

1. preserve the preview/debug HUD controls for target language and learner band
2. make those controls update `playerProfile.plugins.sugarlang`
3. ensure preview overrides do not use a separate hidden state channel
4. verify preview still supports cases like:
   - target language = Italian
   - learner band = B3

Acceptance criteria:

1. preview debug HUD can still switch target language and band during local testing
2. those overrides flow through the same Game-owned player profile state used by the title screen
3. preview and normal gameplay share one runtime source of truth for resolved Sugarlang player settings

### Phase 14E: Conversation Bootstrap Parity

Files likely involved:

1. [ConversationHost.ts](/Users/nikki/projects/sugarengine/src/engine/conversation/ConversationHost.ts)
2. [SugarAgentProviderAdapter.ts](/Users/nikki/projects/sugarengine/src/engine/conversation/SugarAgentProviderAdapter.ts)
3. Sugarlang middleware / provider integration surfaces

Tasks:

1. ensure conversation host always starts sessions with resolved target language and learner band from the player profile
2. ensure provider adapters always forward resolved language context into plugin/runtime requests
3. remove reliance on `auto` as a live runtime band state
4. add regression coverage for hosted and local chat startup parity

Acceptance criteria:

1. `hola`-style opening turns no longer start with `lang=?/? band=auto`
2. hosted and local preview receive the same resolved startup language context
3. short greeting-only turns are classified using the correct target language

## Verification Matrix

The plan is complete when all of these are true:

1. the title/start screen title is configurable per game
2. start-screen button labels come from game-owned config
3. the start screen can show a target-language selector when Sugarlang is enabled
4. the start screen can show a learner-band selector when Sugarlang is enabled
5. those selections persist into `playerProfile.plugins.sugarlang`
6. conversation sessions start with concrete resolved:
   - `targetLanguage`
   - `supportLanguage = 'en'`
   - `learnerBand`
7. hosted and local preview no longer diverge because one path starts with unresolved language state
8. preview debug HUD overrides still work, but mutate the same Game-owned profile state instead of a parallel override channel

## Risks

1. Mixing engine-global and plugin-local concerns:
   - mitigated by storing fields under `playerProfile.plugins.sugarlang`
2. Title-screen config sprawl:
   - mitigated by keeping the first config surface small and explicit
3. Hidden fallback back to `auto`:
   - mitigated by making start flow resolve concrete values before conversation starts

## Follow-On Work

These are intentionally out of scope for this plan:

1. support-language selection beyond implicit English
2. full theme/branding/layout builder for title screens
3. plugin-defined arbitrary start-screen modules
4. broader learner-profile concepts outside Sugarlang plugin scope
