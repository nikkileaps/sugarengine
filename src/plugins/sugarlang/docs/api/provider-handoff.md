# Provider Handoff: Sugarlang + SugarAgent Composition

## Overview

Sugarlang and SugarAgent can run simultaneously. Sugarlang owns the pedagogical layer (content, middleware, evaluation) while SugarAgent provides LLM-driven free-form conversation. The two never call each other directly — composition happens through the engine's ConversationHost pipeline.

At lower bands (B0–B3), the sugarlang-scripted provider handles turns using pre-authored scene content. At higher bands (B4+), the content author can declare `providerPolicy: 'agent_preferred'` to hand turn production off to SugarAgent while keeping the full sugarlang middleware pipeline active.

## How Provider Selection Works

ConversationHost selects a provider by iterating registered providers in priority order:

| Provider | Priority | Handles |
|---|---|---|
| ScriptedDialogueProvider | 10 | Quest/BT/default dialogues (has a `dialogueId`) |
| sugarlang-scripted | 50 | NPCs with a sugarlang scenario (no `dialogueId`) |
| SugarAgentProviderAdapter | 100 | NPCs in `agent` or `hybrid` interaction mode |

The first provider whose `canHandle()` returns true wins the session.

## The Handoff Gate

The sugarlang-scripted provider's `canHandle()` has a two-key gate:

```
1. Does the NPC have a sugarlang scenario?          → YES (required)
2. Is the NPC in `hybrid` or `agent` mode?          → YES
3. Does the active band declare `agent_preferred`?   → YES
   ⇒ sugarlang-scripted DECLINES → SugarAgent picks it up
```

If either condition 2 or 3 is false, sugarlang-scripted handles it normally with authored scene turns.

### What gets checked

- **NPC interaction mode**: Set per-NPC in game data (`scripted` | `hybrid` | `agent`). Must be `hybrid` or `agent` for the handoff to be possible.
- **Band's providerPolicy**: Set per-band in the scene language pack (`SceneBandRealization.providerPolicy`). Only `'agent_preferred'` triggers the handoff.
- **Learner band**: Comes from `learnerBandOverride` on the language context (set via preview band selector or learner state manager).

### What happens to middleware

The sugarlang middleware runs regardless of which provider is selected. This is the key design point — middleware is registered separately from providers on the ConversationHost. So when SugarAgent handles a B4 turn:

1. **context_hydration** — loads scenario brief, grounding map, lexicon
2. **learner_policy** — resolves band, applies band policy, exposes `providerPolicy`
3. **pre_provider** — sets grounding scope, correction posture, response modes
4. SugarAgent produces the turn (with pedagogy context bridged via `PluginPedagogyContext`)
5. **post_provider** — annotates envelope with sugarlang metadata
6. **analysis** — extracts turn evidence, updates learner state

## Prerequisites

For the handoff to work at runtime, all of these must be true:

1. **Sugarlang plugin enabled** — provides middleware, content bundle, and scenario mapping
2. **SugarAgent plugin enabled** — provides the `SugarAgentProviderAdapter` conversation provider (requires API keys)
3. **NPC interaction mode is `hybrid` or `agent`** — set in game NPC data
4. **Band's `providerPolicy` is `'agent_preferred'`** — authored in the scene language pack
5. **Learner band resolves to that band** — via preview band selector or learner state manager

If SugarAgent is not available, sugarlang-scripted still handles all bands including B4 using the authored fallback turns.

## Authoring providerPolicy

In scene language packs, set `providerPolicy` on the band realization:

```ts
// scene-pack-es.ts
{
  bandId: 'B4',
  providerPolicy: 'agent_preferred',   // ← this triggers the handoff
  turns: [
    // Fallback turns used when SugarAgent is unavailable
    { turnId: 'b4-es-01', ... }
  ]
}
```

Valid values:

| Value | Behavior |
|---|---|
| `undefined` (default) | Sugarlang-scripted handles the turn |
| `'agent_preferred'` | Defers to SugarAgent if available; falls back to scripted turns if not |

The `'scripted'` and `'agent_only'` values are reserved in the type but not yet implemented.

## Pedagogy Context Bridge

When SugarAgent handles a turn, the `SugarAgentProviderAdapter` bridges constraint bundle fields into a `PluginPedagogyContext` object on the agent turn request:

```ts
pedagogyContext: {
  learnerBand: 'B4',
  supportLanguagePolicy: 'target_only',
  targetLanguage: 'es',
  supportLanguage: 'en',
  correctionPosture: 'none',
  groundingScope: [
    { conceptId: 'object.suitcase', targetForm: 'maleta', worldObjectId: 'suitcase-01' }
  ],
  sceneSemantics: { scenarioId: 'find-the-luggage', activeReferents: [...] }
}
```

This lets SugarAgent incorporate the pedagogical constraints into its LLM prompt without any direct coupling to the sugarlang plugin.

## Debug Logging

Console logs trace the full handoff:

```
[SL·provider] declining NPC "bellhop" — band=B4 providerPolicy=agent_preferred mode=hybrid, deferring to SugarAgent
[ConversationHost] session started → trace=trace_1_... provider=sugaragent npc=bellhop lang=es/en band=B4
[SL·P5] providerPolicy=agent_preferred band=B4 scenario=find-the-luggage lang=es
[SL·P2] grounding → band=B4 objects=[suitcase-01, cart-01] (2/5 entries passed filter)
[SugarAgentAdapter] pedagogy bridged → band=B4 policy=target_only posture=none grounding=2 refs task=Find the lost luggage
[ConversationHost] turn 0 → trace=trace_1_... provider=sugaragent mode=free_form sl="B4"
```

## File Reference

| File | Role |
|---|---|
| `src/plugins/sugarlang/provider.ts` | `canHandle()` with providerPolicy gate |
| `src/plugins/sugarlang/middleware.ts` | Middleware pipeline, exposes providerPolicy on constraints |
| `src/plugins/sugarlang/types.ts` | `SceneBandRealization.providerPolicy` type |
| `src/engine/conversation/ConversationHost.ts` | Provider selection, enriches selection context with language settings |
| `src/engine/conversation/types.ts` | `ProviderSelectionContext.learnerBandOverride` |
| `src/engine/conversation/SugarAgentProviderAdapter.ts` | Bridges constraints into `PluginPedagogyContext` |
| `src/engine/plugins/types.ts` | `PluginPedagogyContext` interface |
