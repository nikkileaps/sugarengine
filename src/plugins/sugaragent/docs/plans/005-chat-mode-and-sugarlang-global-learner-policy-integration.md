# Plan 005: Engine-Owned NPC Engagement Split and Sugarlang Global Learner Policy for Chat

## Status

Proposed.

Builds on:

- [ADR-SA-001: Plugin Boundary and Loading Model](../adr/001-plugin-boundary-and-loading.md)
- [ADR-SA-017: Dual-Mode NPC Conversation Model](../adr/017-dual-mode-npc-conversation-model.md)
- [ADR-SA-031: Cross-Plugin Language Adaptation Boundary](../adr/031-cross-plugin-language-adaptation-boundary.md)
- [ADR-SL-002: Engine-Owned Conversation Host with Provider and Middleware Composition](../../../sugarlang/docs/adr/002-engine-owned-conversation-host-with-provider-and-middleware-composition.md)

## Purpose

Implement the Wordlark Hollow NPC interaction model as two distinct engagements that can coexist on the same NPC:

1. **Scenario**
   - Sugarlang-authored and scenario-bound
   - uses scripted pedagogy, grounding, response contracts, and evaluation
2. **Chat**
   - SugarAgent free-form NPC chat
   - not scenario-bound
   - still obeys the player's current Sugarlang learner level when Sugarlang is enabled

The core correction in this plan is:

1. chat must not require a Sugarlang scenario,
2. Sugarlang's contribution to chat must come from global learner policy,
3. scenario-only pedagogy must remain separate and optional.

## Architectural Boundary Contract

These rules are non-negotiable:

1. SugarEngine must work with neither plugin installed.
2. SugarAgent must work without Sugarlang.
3. Sugarlang must work without SugarAgent.
4. Plugins may depend on engine contracts.
5. Plugins may not depend on each other.
6. The engine is the only broker for cross-plugin coordination.

Responsibility split:

1. **SugarEngine**
   - owns engagement discovery and selection
   - owns provider selection and middleware ordering
   - owns shared conversation contracts and diagnostics transport
2. **SugarAgent**
   - owns free-form chat routing, planning, grounding, realization, and fallback behavior
   - may consume optional learner-policy hints
   - must remain fully usable without those hints
3. **Sugarlang**
   - owns learner band, target/support language policy, and scenario pedagogy
   - may provide optional learner-policy and scenario-augmentation payloads
   - must not own SugarAgent routing or retrieval

Contribution rule:

1. plugins may contribute engine-owned option descriptors and capability metadata,
2. plugins may not contribute chooser UI ownership,
3. the engine or editor renders the chooser from those descriptors.

Discovery rule:

1. static provider metadata may declare which engagement kinds a provider can ever support,
2. runtime engagement availability must be discovered per NPC and per context through engine-owned provider contracts,
3. the engine must not infer `chat` availability by naming SugarAgent directly.

No new direct plugin-to-plugin imports are allowed.

## Product Model

### NPC engagements

For an NPC with both capabilities available, the player should be able to choose between:

1. **Scenario**
   - the existing Sugarlang-authored interaction
   - bounded, pedagogical, and optionally quest-linked
2. **Chat**
   - open conversation with the NPC as a character
   - no authored beat progression required
   - learner-level surface constraints still apply when Sugarlang is present

If only one engagement exists, the engine should auto-start it.

### NPC authoring policy

The best final authored shape is not `npcInteractionMode`.

The authored source of truth should become an engine-owned capability model such as:

```ts
interface NPCInteractionCapabilities {
  scenario?: {
    enabled?: boolean;
    agentAssist?: 'disallow' | 'allow';
  };
  chat?: {
    enabled?: boolean;
  };
}
```

Interpretation:

1. `scenario.enabled` controls whether the NPC offers the scenario lane as a free interaction,
2. `scenario.agentAssist` controls whether the scenario lane may hand off to agent assistance where authored policy allows,
3. `chat.enabled` controls whether the NPC offers free chat as a distinct engagement,
4. `default` is not an authored capability; it remains an engine fallback path.

Backward compatibility:

1. legacy `interactionMode` is supported only as a project-document migration input,
2. old projects are upgraded to `interactionCapabilities` when loaded,
3. the runtime and editor should then operate only on `interactionCapabilities`.

Legacy normalization target:

1. `scripted` -> `scenario.enabled=true`, `scenario.agentAssist='disallow'`, `chat.enabled=false`
2. `agent` -> `scenario.enabled=false`, `scenario.agentAssist='disallow'`, `chat.enabled=true`
3. `hybrid` -> `scenario.enabled=true`, `scenario.agentAssist='allow'`, `chat.enabled=false`

This preserves current behavior for existing projects while allowing new authoring to explicitly enable both `scenario` and `chat` on the same NPC.

### Sugarlang contribution layers

Sugarlang must contribute through two separate layers:

1. **Global learner policy**
   - learner band
   - target language
   - support language
   - support-language policy
   - correction posture
   - optional cumulative vocabulary availability through the current band
   - optional low-band style bounds such as sentence length, register, and code-switch policy
2. **Scenario augmentation**
   - scenario identity
   - scene semantics
   - grounding scope
   - teaching subset
   - response contracts and evaluation hooks

Chat uses global learner policy only.

Scenario uses global learner policy plus scenario augmentation.

## Current Problems

### 1. Chat is still too scenario-shaped

Today the Sugarlang middleware largely becomes useful only after scenario resolution. That is correct for scenario augmentation, but incorrect for chat. A non-scenario chat should still receive learner-level policy.

### 2. Learner policy and scenario augmentation are conflated

The current shape makes it too easy to treat "no scenario" as "little or no Sugarlang contribution". That is only valid for scenario-specific fields, not for global learner policy.

### 3. The engine does not yet model Scenario and Chat as separate engagements

The current interaction flow is still too provider-centric. The product model needs an engine-owned choice between distinct player experiences, not just provider priority.

### 4. SugarAgent chat fallback is not consistently learner-language aware

Prompted replies may honor target language, but deterministic fallback and uncertainty paths can still break the learner-language contract.

### 5. Multilingual social turns are still under-classified

Short Spanish social turns are still too likely to collapse into knowledge routing and retrieval failure instead of remaining in social chat.

Known failing examples from current traces include:

1. `bien y tu`
2. `me llamo Mim`
3. `donde estas`

These are the first concrete routing failures observed in testing.

That does not mean Spanish is a special product case.
It only means Spanish is the first regression corpus we can seed from real evidence.

## Target Architecture

### A. Engine-owned engagement model

The engine should resolve and expose engagement kinds before provider ownership is chosen.

Candidate engine-owned kinds:

1. `scenario`
2. `chat`
3. `default` or existing scripted fallback when neither special path applies

This keeps the experience model separate from provider implementation.

Plugins may contribute these options through engine-owned descriptors, but the engine owns the chooser UI and the final selection.

### A1. Engine-owned engagement discovery contract

The engine needs both static capability metadata and dynamic per-NPC discovery.

Static metadata answers:

1. what kinds of engagement a provider can ever support,
2. what presentation family the provider expects when selected.

Dynamic discovery answers:

1. whether this NPC supports `chat`, `scenario`, or both right now,
2. which provider is offering that engagement,
3. what label and priority the engine should use in the chooser,
4. what presentation family and driver model the engine should use after selection.

The plan should treat the following as the target contract shape:

```ts
interface ConversationProviderDescriptor {
  id: string;
  priority: number;
  supportsEngagementKinds: ConversationEngagementKind[];
}

interface ConversationEngagementOption {
  kind: ConversationEngagementKind;
  providerId: string;
  label: string;
  priority?: number;
  presentationKind?: 'chat_panel' | 'dialogue_panel';
  driverKind?: 'host_turn_driven' | 'dialogue_manager_driven';
}

interface ConversationProvider {
  getEngagementOptions?(
    npcId: string,
    context: ProviderSelectionContext,
  ): ConversationEngagementOption[];
}
```

The host should then expose an engine-owned discovery method such as:

```ts
listEngagementOptions(
  npcId: string,
  context: ProviderSelectionContext,
): ConversationEngagementOption[]
```

This is what replaces plugin-name checks for "can this NPC chat?"

### A2. Engine-owned runtime dispatch contract

Provider discovery alone is not enough.

The engine currently uses provider ids to decide:

1. which UI to show,
2. which submit method to call,
3. which session start/end events to fire,
4. whether the conversation is host-turn-driven or delegated to the dialogue manager.

Phase A must explicitly migrate that dispatch layer, not just provider selection.

Target direction:

1. selected engagement options carry engine-owned `presentationKind`,
2. selected engagement options carry engine-owned `driverKind`,
3. the session stores those fields,
4. [Game.ts](/Users/nikki/projects/sugarengine/src/engine/core/Game.ts) and [gameUI.ts](/Users/nikki/projects/sugarengine/src/gameUI.ts) dispatch by those fields instead of plugin provider ids.

That implies a generic engine-owned conversation-control surface such as:

```ts
submitConversationTurn(input: PlayerInput): Promise<ConversationTurnEnvelope | null>
closeConversation(): Promise<void>
getActiveConversationSession(): Readonly<ConversationSession> | null
```

And generic conversation lifecycle events such as:

1. `onConversationSessionStart`
2. `onConversationSessionEnd`
3. `onConversationTurnProduced`

Existing provider-specific helpers such as `submitAgentConversationTurn` and `submitSugarlangTurn` should be treated as migration shims to remove during this phase, not as part of the final contract.

### B. Provider-neutral learner policy contract

The engine conversation layer should carry a provider-neutral learner-policy payload that any provider may ignore or consume.

This payload should be available whenever Sugarlang is enabled, even if no scenario exists.

### C. Separate scenario augmentation contract

Scenario-only data should remain a separate optional payload populated only when a real Sugarlang scenario is active.

### D. SugarAgent chat consumes learner policy, not scenario requirements

SugarAgent chat should be able to:

1. speak at the learner's level,
2. follow target/support language policy,
3. localize fallback behavior,
4. remain fully independent when no Sugarlang data is available.

### E. Scenario interactions remain unchanged in ownership

The existing Sugarlang scenario lane should keep its authored behavior and continue to operate when SugarAgent is absent.

### F. Editor authoring surface follows the same gating model

The NPC editor should not hard-code plugin-owned interaction cards.

Instead, it should resolve available interaction authoring options from enabled plugins and show plugin-specific fields only when the corresponding option is enabled and selected.

## Implementation Plan

### Phase A: Add an engine-owned runtime engagement layer

**Goal:** Make `Scenario` and `Chat` explicit player-facing engagements instead of side effects of provider priority.

Implement:

1. Add an engine-owned `ConversationEngagementKind` type in [types.ts](/Users/nikki/projects/sugarengine/src/engine/conversation/types.ts).
2. Add an engine-owned engagement option descriptor such as `ConversationEngagementOption` in [types.ts](/Users/nikki/projects/sugarengine/src/engine/conversation/types.ts).
3. Extend `ConversationProviderDescriptor` with static capability metadata such as `supportsEngagementKinds`.
4. Extend the provider contract with a dynamic discovery method such as `getEngagementOptions(npcId, context)`.
5. Extend [ConversationHost.ts](/Users/nikki/projects/sugarengine/src/engine/conversation/ConversationHost.ts) so it can enumerate available engagement options, not just pick the first matching provider.
6. Add an engine-owned host method such as `listEngagementOptions(...)` and use that in [Game.ts](/Users/nikki/projects/sugarengine/src/engine/core/Game.ts) before starting a conversation.
7. Add a new engine-owned chooser UI component under `src/engine/ui/` and invoke it from [Game.ts](/Users/nikki/projects/sugarengine/src/engine/core/Game.ts) when more than one engagement is available.
8. Pass the chosen `engagementKind` and selected `providerId` into provider selection and middleware execution.
9. Add session-level engine-owned fields such as `engagementKind`, `presentationKind`, and `driverKind`, so runtime UI routing no longer depends on provider ids.
10. Replace provider-specific conversation-control methods in [Game.ts](/Users/nikki/projects/sugarengine/src/engine/core/Game.ts) with generic engine-owned conversation control methods.
11. Update [gameUI.ts](/Users/nikki/projects/sugarengine/src/gameUI.ts) to choose between chat overlay, dialogue presenter, and response-contract widgets from session `presentationKind` and response contract, not from provider ids.
12. Replace current engine checks like `hasSugarAgentProvider`, `session.providerId === 'sugaragent'`, and `session.providerId === 'sugarlang-scripted'` with engagement-based, presentation-based, or driver-based checks.
13. Replace provider-specific conversation lifecycle events with generic engine-owned conversation events, or make the provider-specific callbacks thin compatibility shims outside core dispatch.

Do not:

1. special-case `sugaragent` or `sugarlang` by name in engine flow,
2. let either plugin own the chooser UI,
3. let plugins register custom chooser UI,
4. let providers call each other directly.

Acceptance:

1. the same NPC can offer both `Scenario` and `Chat`,
2. selecting `Scenario` never opens SugarAgent chat,
3. selecting `Chat` never starts the Sugarlang scripted provider,
4. if only one engagement exists, current auto-start behavior remains,
5. plugins contribute option descriptors, not UI ownership,
6. the engine can discover `chat` availability without naming SugarAgent,
7. runtime UI routing no longer depends on `session.providerId === 'sugaragent'`,
8. [Game.ts](/Users/nikki/projects/sugarengine/src/engine/core/Game.ts) no longer uses plugin provider ids as the primary dispatch key for chat/scenario UI flow.

### Phase B: Replace legacy NPC interaction authoring with `interactionCapabilities`

**Goal:** Replace `interactionMode` with the final authored shape, migrate old projects at load time, and align the editor with plugin-gated interaction options.

Implement:

1. Add an engine/editor-owned `interactionCapabilities` shape to NPC authoring types in the editor, engine ingest, and project document flow.
2. Add a project-document migration in [project-document.ts](/Users/nikki/projects/sugarengine/src/editor/game-root/project-document.ts) that converts legacy `interactionMode` into `interactionCapabilities` during load normalization.
3. Save migrated projects back out in the new shape so `interactionMode` disappears from authored project files after the next save.
4. Remove `interactionMode` from active editor authoring state and replace it with editor-owned capability controls.
5. Add an editor-owned interaction option resolver, likely alongside [talkDeliveryOptions.ts](/Users/nikki/projects/sugarengine/src/editor/utils/talkDeliveryOptions.ts), that mirrors the existing plugin-gated option pattern.
6. Thread enabled plugin state into [NPCDetail.tsx](/Users/nikki/projects/sugarengine/src/editor/panels/npc/NPCDetail.tsx) instead of hard-coding the SugarAgent card.
7. Replace the hard-coded SugarAgent interaction select with a general Interaction chooser backed by `interactionCapabilities`.
8. Render plugin-specific subforms only when the plugin is enabled and the corresponding interaction capability is selected.
9. Gate SugarAgent-specific runtime validation calls, such as lore-scope lookup, behind plugin availability and visible panel state.
10. Preserve the built-in scripted NPC authoring path as always available.
11. Remove runtime/editor dependence on legacy `interactionMode` reads after migration is in place.
12. Where SugarAgent still temporarily expects `interactionMode` or `interactionPolicy`, derive those values only at the engine adapter boundary as a transitional plugin-bridge concern, not as a persisted authored field.

Acceptance:

1. the NPC page does not show SugarAgent controls when SugarAgent is disabled,
2. built-in scripted interaction remains available with no plugins enabled,
3. plugin-contributed interaction options appear only when that plugin is enabled,
4. plugin-specific authoring fields are hidden unless their interaction option is active,
5. new authoring writes `interactionCapabilities`,
6. old projects that still use `interactionMode` are migrated on load with preserved behavior,
7. saved project files no longer persist `interactionMode`,
8. engine/editor runtime logic no longer depends on `interactionMode`.

### Phase C: Split Sugarlang middleware into global learner policy and scenario augmentation

**Goal:** Make learner-level policy always available for chat without fabricating scenario data.

Implement:

1. Refactor [middleware.ts](/Users/nikki/projects/sugarengine/src/plugins/sugarlang/middleware.ts) so learner-policy resolution no longer depends on scenario hydration.
2. Build a provider-neutral global learner-policy payload from learner state, target language, and band policy.
3. Keep scenario hydration responsible only for scenario-specific fields.
4. Ensure [plugin.ts](/Users/nikki/projects/sugarengine/src/plugins/sugarlang/plugin.ts) and [provider.ts](/Users/nikki/projects/sugarengine/src/plugins/sugarlang/provider.ts) preserve current scenario behavior.
5. Extend shared engine-owned conversation types, if needed, in [types.ts](/Users/nikki/projects/sugarengine/src/engine/conversation/types.ts) instead of introducing plugin-owned cross references.

Acceptance:

1. non-scenario chat receives learner band and band policy when Sugarlang is enabled,
2. non-scenario chat does not receive fabricated scenario grounding,
3. scenario interactions still receive full scenario augmentation,
4. Sugarlang-only projects behave as before.

### Phase D: Bridge global learner policy into SugarAgent chat

**Goal:** Let SugarAgent use learner-level policy without ever requiring Sugarlang or scenario content.

Implement:

1. Use engine-owned provider constraints and pedagogy context in [SugarAgentProviderAdapter.ts](/Users/nikki/projects/sugarengine/src/engine/conversation/SugarAgentProviderAdapter.ts) to pass learner policy into SugarAgent.
2. Update [plugin.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/plugin.ts), [runtime.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/session/runtime.ts), and [language-adaptation.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/session/core/language-adaptation.ts) to distinguish:
   - global learner policy
   - scenario augmentation
3. Keep all SugarAgent behavior correct when both payloads are missing.
4. Localize deterministic fallback and uncertainty replies to the current target language and low-band policy.
5. Keep factual planning, retrieval, and validation wholly inside SugarAgent.

Acceptance:

1. chat replies follow target language and learner band even when no scenario exists,
2. deterministic fallback also follows target language and learner level,
3. SugarAgent still works normally when Sugarlang is disabled,
4. no SugarAgent file imports Sugarlang code or types.

### Phase E: Target-language-driven multilingual social routing hardening for chat

**Goal:** Keep ordinary low-band Spanish chat in the social lane instead of misrouting it into failed knowledge retrieval.

Product requirement:

1. support the target languages enabled for Sugarlang use in the project,
2. not just Spanish,
3. without introducing a direct SugarAgent -> Sugarlang dependency.

Architecture direction:

1. SugarAgent should route from the active `targetLanguage` in engine-owned learner policy.
2. SugarAgent should own its own internal per-language social-routing rules for supported target languages.
3. Those routing rules are SugarAgent implementation data, not Sugarlang data.
4. The engine only passes generic language context such as `targetLanguage`.
5. The routing-rule mechanism must work for every target language the game enables through Sugarlang chat.
6. Spanish is the first seeded regression corpus because that is where current failures were observed, not because Spanish is a special support boundary.

Target-language cue categories to support explicitly:

1. greetings
   - examples: `hola`, `buenas`, `buenos dias`
2. wellbeing / acknowledgement
   - examples: `bien`, `muy bien`, `todo bien`
3. reciprocal social follow-up
   - examples: `y tu`, `¿y tu?`, `como estas`, `¿como estas?`
4. self-introduction
   - examples: `me llamo ...`, `soy ...`
5. thanks / farewell
   - examples: `gracias`, `adios`, `hasta luego`
6. lightweight NPC-self location or status prompts
   - examples: `donde estas`, `¿donde estas?`

Implement:

1. Extend multilingual social cues in [routing.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/session/core/routing.ts) and [query-interpretation.ts](/Users/nikki/projects/sugarengine/src/plugins/sugaragent/session/core/query-interpretation.ts) with SugarAgent-owned per-language social-routing rules selected by the active `targetLanguage`.
2. Seed the first cue pack from Spanish because that is where current observed failures exist, but make the implementation path language-pack-driven from the start.
3. Protect short target-language utterances of 8 tokens or fewer that match the supported social cue categories from upgrading into world-knowledge retrieval unless an explicit world referent is present.
4. Define an initial "stronger evidence" gate for `knowledge/world/location` routing:
   - explicit named world referent or grounded object,
   - or retrieval candidate count greater than zero,
   - or semantic confidence at or above `0.70` with margin at or above `0.15` over the social lane,
   - and the utterance does not match a protected cue-pack social template.
5. Prefer social/self-location handling for lightweight NPC-directed prompts such as `donde estas` when no explicit world referent or retrieval candidate exists.
6. Add diagnostics that explain why a turn was upgraded from social to knowledge routing, including target language, cue-pack match/miss, explicit referent presence, retrieval candidate presence, confidence, and margin.
7. Add a seeded Spanish regression suite covering:
   - greetings,
   - wellbeing / acknowledgement,
   - reciprocal questions,
   - self-introductions,
   - thanks / farewells,
   - lightweight self-location prompts,
   - explicit factual location questions with named referents as positive knowledge-routing controls.
8. Add equivalent routing-rule tests for each target language enabled in Sugarlang for the project or shipped demo bundle.
9. Add tests for the observed failing examples from current traces: `bien y tu`, `me llamo Mim`, and `donde estas`.
10. Decide and document degraded behavior when a target language is enabled but no cue pack exists:
   - either block publish / warn loudly,
   - or fall back to neutral heuristics with degraded diagnostics.

Acceptance:

1. the routing architecture is keyed by active `targetLanguage`, not hard-coded to Spanish,
2. protected social phrases in each enabled target language do not route to `knowledge/world/location/current` in that language's regression suite,
3. short self-introductions and reciprocal questions in each enabled target language do not trigger retrieval when no explicit referent exists,
4. lightweight self-location prompts without an explicit world referent no longer fall through to corrective-fail world-knowledge retrieval,
5. explicit factual questions with named referents still reach the knowledge path,
6. each enabled target language regression suite reaches at least `90%` correct lane classification overall,
7. routing diagnostics record target language and which evidence gate caused a knowledge-route upgrade.

### Phase F: Regression matrix for removability and composition

**Goal:** Prove the architecture still works when each subsystem is absent.

Validate:

1. engine with neither plugin enabled,
2. Sugarlang-only scenario interaction,
3. SugarAgent-only chat interaction,
4. both plugins enabled with chat only,
5. both plugins enabled with scenario only,
6. both plugins enabled on an NPC offering both engagements.

Acceptance:

1. SugarEngine works unchanged without either plugin,
2. Sugarlang works without SugarAgent,
3. SugarAgent works without Sugarlang,
4. both plugins compose only through engine-owned contracts,
5. no plugin-to-plugin imports or direct calls are introduced.

## Data and Contract Direction

These are implementation targets, not locked interfaces.

### Engine-owned contracts

Potential additions to [types.ts](/Users/nikki/projects/sugarengine/src/engine/conversation/types.ts):

1. `ConversationEngagementKind`
2. `ConversationEngagementOption`
3. `ConversationPresentationKind`
4. `ConversationDriverKind`
5. `GlobalLearnerPolicy`
6. `ScenarioAugmentation`

The important rule is not the exact type shape. The important rule is that shared contracts live in the engine, not in either plugin.

### NPC authoring direction

Target authored shape:

```ts
interface NPCInteractionCapabilities {
  scenario?: {
    enabled?: boolean;
    agentAssist?: 'disallow' | 'allow';
  };
  chat?: {
    enabled?: boolean;
  };
}
```

Recommended rollout:

1. add `interactionCapabilities` as the new authored field,
2. migrate legacy `interactionMode` into it during project-document normalization,
3. update the editor to write only the new field,
4. remove `interactionMode` from engine/editor runtime logic,
5. derive any remaining temporary SugarAgent bridge fields from normalized capabilities until those contracts are retired.

This avoids a long-lived `3 x 3` matrix between `npcInteractionMode` and `engagementKind`.
Instead:

1. authored capability policy determines which engagements are eligible,
2. runtime engagement choice determines which lane the player entered,
3. fallback remains engine-owned.

### Engagement discovery direction

Target contract direction:

```ts
interface ConversationProviderDescriptor {
  id: string;
  priority: number;
  supportsEngagementKinds: ConversationEngagementKind[];
}

interface ConversationEngagementOption {
  kind: ConversationEngagementKind;
  providerId: string;
  label: string;
  priority?: number;
  presentationKind?: ConversationPresentationKind;
  driverKind?: ConversationDriverKind;
}

interface ConversationSession {
  providerId: string;
  engagementKind?: ConversationEngagementKind;
  presentationKind?: ConversationPresentationKind;
  driverKind?: ConversationDriverKind;
}
```

And on the provider/host side:

```ts
interface ConversationProvider {
  getEngagementOptions?(
    npcId: string,
    context: ProviderSelectionContext,
  ): ConversationEngagementOption[];
}

interface ConversationHost {
  listEngagementOptions(
    npcId: string,
    context: ProviderSelectionContext,
  ): ConversationEngagementOption[];
}
```

Planned engine usage:

1. `Game.handleNPCInteraction()` asks the host for engagement options,
2. if zero options exist, continue existing fallback behavior,
3. if one option exists, auto-start it,
4. if multiple options exist, show the engine-owned chooser,
5. store the selected `engagementKind` on the session,
6. store `presentationKind` and `driverKind` on the session,
7. route runtime UI and session control by `engagementKind`, `presentationKind`, or `driverKind`, not by provider id.

### Population rules

1. If Sugarlang is absent:
   - `globalLearnerPolicy` is absent
   - `scenarioAugmentation` is absent
2. If Sugarlang is present but no scenario is active:
   - `globalLearnerPolicy` is present
   - `scenarioAugmentation` is absent
3. If Sugarlang is present and a scenario is active:
   - both may be present
4. If SugarAgent is absent:
   - the scenario lane still works with scripted/Sugarlang behavior

### Global learner policy population rules

`GlobalLearnerPolicy` should be populated from bundle-global Sugarlang data, not from scenario hydration.

Expected sources:

1. `learnerBand`
   - from learner-state resolution or preview override
2. `targetLanguage`
   - from session / engine language context
3. `supportLanguage`
   - from session / engine language context
4. `supportLanguagePolicy`
   - from bundle-level `bandPolicies` for the resolved band
5. `correctionPosture`
   - from bundle-level `bandPolicies` for the resolved band
6. learner-level advisory constraints such as allowed response modes
   - from bundle-level `bandPolicies`
7. cumulative tracked vocabulary availability through the current band
   - from bundle-level target-language `lexicon`, filtered by `introductionBand <= learnerBand`

This means non-scenario chat should still receive meaningful learner policy whenever Sugarlang is enabled and the bundle contains the relevant target-language defaults.

### Scenario augmentation population rules

`ScenarioAugmentation` should be populated only from scenario-specific Sugarlang data such as:

1. scenario brief
2. scene semantics
3. grounding map
4. scene language pack
5. quest bindings
6. active teaching subset
7. ambient halo allowance
8. scenario-specific provider policy

### No-scenario chat presence rules

When Sugarlang is enabled but no scenario is active:

Present:

1. learner band
2. target language
3. support language
4. support-language policy
5. correction posture
6. bundle-derived cumulative tracked vocabulary availability, when a target-language lexicon exists

Absent:

1. scene semantics
2. grounding scope
3. teaching subset
4. ambient halo allowance
5. scenario-specific provider policy
6. scenario evaluation hooks

### Missing data behavior

1. If the target-language lexicon is missing, vocabulary availability should be `undefined`, not fabricated as an empty scenario-like set.
2. If a band policy is missing, Sugarlang should still provide the resolved learner band and language context, while policy-derived fields remain absent.
3. If richer low-band style bounds such as sentence-length or code-switch constraints are required for chat, they should be added to bundle-level `BandPolicy`, not derived from scenario data.

## Risks

### Risk 1: The chooser becomes annoying

Mitigation:

1. auto-start when there is only one engagement,
2. keep the chooser minimal,
3. make engagement discovery deterministic and stable,
4. keep plugin contributions descriptor-based so the engine can render one coherent chooser.

### Risk 2: Chat becomes too constrained

Mitigation:

1. use learner policy to shape surface language, not to replace SugarAgent planning,
2. keep scenario augmentation out of non-scenario chat,
3. tune low-band constraints as advisory where possible.

### Risk 3: Scenario logic bleeds into chat

Mitigation:

1. keep scenario augmentation as a separate payload,
2. test non-scenario chat as a first-class path,
3. reject fabricated scenario fields in chat mode.

### Risk 4: Plugin boundaries blur during implementation

Mitigation:

1. keep all shared contracts engine-owned,
2. review imports as part of each phase,
3. fail code review on direct plugin-to-plugin references.

## Suggested Execution Order

1. Phase A first, because the product model needs an explicit `Scenario` vs `Chat` split.
2. Phase B second, because the NPC editor should stop exposing disabled-plugin controls and should follow the same option-resolution model.
3. Phase C third, because learner policy must stop depending on scenario presence.
4. Phase D fourth, because SugarAgent should only consume the corrected engine-owned payload.
5. Phase E fifth, because multilingual routing improvements matter most after the right architecture is in place.
6. Phase F continuously, with final regression signoff at the end.

## Done When

This plan is complete when all of the following are true:

1. The same NPC can offer both `Scenario` and `Chat` as distinct engagements.
2. `Chat` works without any Sugarlang scenario content.
3. `Chat` still respects learner band and language policy when Sugarlang is enabled.
4. `Scenario` interactions still use full Sugarlang grounding and pedagogy.
5. SugarAgent still works without Sugarlang.
6. Sugarlang still works without SugarAgent.
7. SugarEngine still works with neither plugin enabled.
8. The NPC editor no longer exposes SugarAgent-specific controls when SugarAgent is disabled.
9. Old projects are upgraded from `interactionMode` to `interactionCapabilities` at the project-document boundary.
10. New NPC authoring uses only `interactionCapabilities`.
11. The engine discovers engagement availability through engine-owned provider contracts, not plugin-name checks.
12. Runtime UI and conversation dispatch in the engine use engagement/presentation/driver contracts instead of plugin provider ids.
13. No direct plugin-to-plugin dependency is introduced.
