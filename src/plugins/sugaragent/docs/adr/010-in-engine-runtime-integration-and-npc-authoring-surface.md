# ADR-SA-010: In-Engine Runtime Integration and NPC Authoring Surface

## Status

Accepted

## Context

SugarAgent CLI paths now validate local LLM runtime, memory, lore retrieval, authored beat contracts, cadence simulation, and eval gates.  
What is still missing is the in-game integration surface so creators can actually ship NPCs that use SugarAgent through normal gameplay.

We need an implementation plan that:

1. Keeps SugarAgent fully optional.
2. Preserves scripted quest/dialogue authority.
3. Exposes a clear authoring interface for designing agent NPCs.
4. Uses one coherent plugin boundary that can be called by game runtime clients (not CLI-specific logic).

## Decision

### 1) In-game activation stays plugin-config driven

SugarAgent will only run when project plugin config enables it:

- `plugins: ["sugaragent"]`
- or `plugins: [{ "id": "sugaragent", "enabled": true }]`

If plugin is omitted/disabled, game behavior remains the scripted baseline.

### 2) One runtime facade for game callers

Game integration will call SugarAgent through one plugin-owned turn API surface and not through CLI modules.  
CLI remains a thin wrapper around this same API.

### 3) Authoring interface for NPC design

#### Required for agent behavior

- NPC-level: `npcs[].agentProfile`
  - `persona?: string`
  - `tone?: string`
  - `constraints?: string[]`
  - `loreScopes?: string[]`
- Plugin-level: `plugins[].globalSafetyBounds?: string[]` for `id: "sugaragent"`
- Quest-level: `quests[].agentBeatContracts[]`
  - `id`
  - `npcId`
  - `objective`
  - `requiredFacts[]`
  - `completionRule`
  - optional: `forbiddenFacts[]`, `completionTarget`, `maxTurns`, `fallbackScriptId`, `stageId`, `objectiveId`

#### Optional mode hint for runtime routing (new)

Add an optional NPC interaction mode field:

- `npcs[].interactionMode?: "scripted" | "agent" | "hybrid"`

Default is `"scripted"` when absent.  
`"hybrid"` means scripted chain still runs first; SugarAgent is attempted when scripted branches do not resolve.

### 4) Runtime interaction contract

Game runtime will pass a turn request containing:

1. NPC identity and `agentProfile`.
2. Current player text input.
3. Relevant authored beat contract (if quest/objective context binds one).
4. Short recent dialogue history.
5. Save-backed SugarAgent memory state.

SugarAgent returns structured output:

1. `utterance`
2. `emotion`
3. `intent`
4. `proposedIntents[]`
5. `citations[]`
6. `beatEvidence`

Engine remains deterministic authority:

1. Validates/executes allowed intents.
2. Evaluates beat completion.
3. Advances objective/quest state.
4. Chooses scripted fallback when rules require it.

### 5) UI surface

Add an in-game free-text conversation panel for NPC interaction.  
This panel is the runtime client of the plugin API (same API class as CLI), not a separate logic path.

### 6) Persistence and load behavior

SugarAgent state continues under save namespace:

- `GameSaveData.plugins.sugaragent`

Load must remain fail-safe:

1. Missing plugin state is ignored.
2. Missing plugin at load time does not break save load.
3. Plugin re-enable resumes from namespaced state when present.

## Phased Implementation Plan and MVP Feedback Loop

### Phase 10A: Project-to-runtime plugin bootstrap

Implementation:

1. Build plugin registry in game entry points that instantiates `SugarAgent.createPlugin()` when project config enables it.
2. Pass plugin list into `new Game({ plugins: [...] })` for both preview and production paths.

Nikki MVP test:

1. Run preview with plugin disabled and verify no behavior change.
2. Enable plugin in project data and verify game starts with plugin runtime active.
3. Disable again and verify fallback to scripted-only remains intact.

### Phase 10B: NPC routing model and authoring mode

Implementation:

1. Add optional `interactionMode` authoring field with safe default `"scripted"`.
2. Update interaction chain to consult mode without breaking existing quest/BT priority.
3. Keep `"scripted"` and absent mode behavior identical to today.

Nikki MVP test:

1. One NPC set to `"scripted"` behaves exactly as current game.
2. One NPC set to `"agent"` routes to SugarAgent when interacted with.
3. One NPC set to `"hybrid"` uses scripted paths first, then agent fallback.

### Phase 10C: In-game text conversation UI

Implementation:

1. Add an in-game text input panel for active NPC conversations.
2. Connect UI submit action to SugarAgent turn API.
3. Show returned `utterance` and minimal metadata for debug mode.
4. When turn diagnostics indicate `initiative.action === "close"`, keep the final NPC close utterance visible and then auto-close the conversation panel (UI concern only; dialogue policy remains plugin-owned).

Nikki MVP test:

1. Start game and interact with agent NPC.
2. Type free-form input in English/Spanish.
3. Observe natural response continuity across multiple turns.
4. Trigger a close turn and verify:
   - NPC emits a graceful closing line.
   - UI panel auto-closes after showing that final line.

### Phase 10D: Quest/beat contract binding in live runtime

Implementation:

1. Bind active quest objective context to matching `agentBeatContracts`.
2. Feed selected beat contract into turn orchestration.
3. Evaluate `beatEvidence` deterministically in engine before objective completion.

Nikki MVP test:

1. Run a quest step with an authored beat contract.
2. Confirm NPC conveys required facts in free-form style.
3. Confirm objective only completes when completion rule is satisfied.
4. Confirm fallback script path is used when turn budget is exceeded.

### Phase 10E: Save/load and continuity hardening

Implementation:

1. Persist SugarAgent runtime memory/session state per current save architecture.
2. Restore state on load and continue conversation continuity.
3. Verify graceful behavior when plugin is disabled or missing.

Nikki MVP test:

1. Talk to NPC, save, reload, ask memory recall question.
2. Verify continuity survives reload.
3. Disable plugin and verify save still loads safely.

### Phase 10F: Editor UX for authoring fields

Implementation:

1. Add editor controls for `agentProfile`, `interactionMode`, and `agentBeatContracts`.
2. Add inline validation errors mirroring pack validation.
3. Keep JSON compatibility for existing projects.

Nikki MVP test:

1. Configure agent NPC and beat contracts fully from editor UI.
2. Export/publish and run preview.
3. Verify no manual JSON editing is required.

## Consequences

Positive:

- Clear creator-facing path to design agent NPCs.
- One runtime API across CLI and game clients.
- Scripted projects remain unaffected by default.
- Deterministic quest progression remains engine-owned.

Tradeoff:

- Additional integration complexity in game UI/input flow.
- More editor schema/UI maintenance work.
- Requires disciplined contract/version management between engine and plugin.

## Implementation Notes

Current implementation in this repo now delivers:

1. Phase 10A bootstrap:
   - Shared runtime plugin resolver: `src/plugins/runtime.ts`
   - Runtime plugin resolver tests: `src/plugins/runtime.test.ts`
   - Production entry wiring: `src/game.ts`
   - Preview entry wiring: `src/preview.ts`
2. Phase 10B mode routing (engine runtime):
   - Optional NPC mode field support in game project ingest:
     - `interactionMode?: "scripted" | "agent" | "hybrid"`
     - `src/engine/core/Game.ts`
   - Mode-aware interaction availability checks and routing in `Game`:
     - `scripted`: quest -> BT -> scripted fallback
     - `hybrid`: quest -> BT -> plugin -> scripted fallback
     - `agent`: quest -> plugin -> scripted fallback
3. Authoring type surfacing updates:
   - `src/editor/store/useEditorStore.ts` includes optional `interactionMode`, `agentProfile`, and `agentBeatContracts` typing.
4. Phase 10C in-game text conversation UI:
   - New in-game chat UI: `src/engine/ui/AgentConversationUI.ts`
   - UI wiring: `src/gameUI.ts`
   - Engine runtime hooks:
     - `openAgentConversation` plugin interaction resolution path
     - `Game.submitAgentConversationTurn(...)` delegates turn processing through plugin manager `runAgentTurn(...)`
   - Remaining Phase 10C UI hardening:
     - auto-close panel behavior when `initiative.action === "close"` after rendering final NPC close utterance.
   - SugarAgent plugin now provides deterministic turn handling for in-game path (`runAgentTurn`) while preserving plugin state persistence.
5. Phase 10D quest/beat contract binding in live runtime:
   - New engine helper module for deterministic contract parsing/selection/evaluation:
     - `src/engine/core/agentBeatRuntime.ts`
   - Runtime selection of active beat contract by NPC + active quest context:
     - `Game.submitAgentConversationTurn(...)`
   - Deterministic guardrails:
     - `maxTurns` overflow routes to scripted fallback (`fallbackScriptId`) and closes agent chat
     - engine-owned completion checks evaluate plugin `beatEvidence` and only then complete quest objective (`objectiveId`)
   - Plugin turn contract extension:
     - request includes optional `beatContract`/`beatTurnCount`
     - response includes optional `beatEvidence`
   - SugarAgent plugin deterministic beat-evidence generation wired in:
     - `src/plugins/sugaragent/plugin.ts`
6. Phase 10E save/load continuity hardening:
   - Runtime beat turn counting now reads persisted SugarAgent plugin session state instead of transient in-memory counters:
     - `Game.getPersistedSugarAgentBeatTurnCount(...)`
   - SugarAgent dialogue session state now stores beat/quest/objective linkage:
     - `activeBeatId`, `questId`, `objectiveId`, `turnCount`, covered/uncovered facts.
   - Objective/quest completion events clear matching SugarAgent dialogue sessions, preventing stale turn-budget carryover after completion.
   - Save/load safety verification expanded:
     - plugin state round-trip continuity test for beat sessions
     - explicit load safety test when save includes plugin state but plugin bridge is absent (plugin disabled/missing case)
7. Phase 10F editor UX authoring controls:
   - Project-level SugarAgent enable via `Project -> Plugins` dialog (`src/editor/Editor.tsx`, `src/editor/components/ProjectMenu.tsx`).
   - Project-level global safety policy (`globalSafetyBounds`) in the same Plugins dialog.
   - NPC authoring controls in NPC detail:
     - `interactionMode` select (`scripted` | `hybrid` | `agent`)
     - `agentProfile` fields (`persona`, `tone`, `constraints`, `loreScopes`)
     - `src/editor/panels/npc/NPCDetail.tsx`
   - Quest authoring controls in quest detail:
     - full `agentBeatContracts[]` add/edit/remove UI
     - stage/objective bindings, completion rule/target, max turns, fallback dialogue, required/forbidden facts
     - `src/editor/panels/quest/QuestDetail.tsx`
   - Quest validation now includes beat-contract sanity checks in panel validation (`src/editor/panels/quest/QuestPanel.tsx`).

Still pending from this ADR:

1. No remaining phases in ADR-010; follow-on work should be tracked in a new ADR.
