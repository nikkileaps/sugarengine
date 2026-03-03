# ADR-026: SugarAgent In-Engine LLM Provider Wiring

## Status

Proposed

## Context

SugarAgent interaction now works in game/preview, but turn generation is still a deterministic stub in `src/plugins/sugaragent/plugin.ts` (`buildDeterministicAgentTurn`), which produces repetitive replies.

At the same time, the real provider/runtime stack already exists:

- `LocalLLMProvider` (`src/plugins/sugaragent/providers/llm/LocalLLMProvider.ts`)
- runtime bridge contract (`src/plugins/sugaragent/runtime/types.ts`)
- local runtime/session orchestration used by CLI/sim (`src/plugins/sugaragent/session/runtime.mjs`)

Current gap: the in-engine `runAgentTurn` path is not wired to the provider stack, so authored persona/lore/constraints cannot produce real LLM quality responses during gameplay.

## Decision

Wire in-engine SugarAgent turns to the local LLM provider stack and keep deterministic responses only as a final fallback path.

The runtime chain becomes:

1. `Game.submitAgentConversationTurn(...)` calls plugin `runAgentTurn(...)` (existing).
2. SugarAgent plugin delegates turn generation to `LocalLLMProvider`.
3. `LocalLLMProvider` talks to a concrete `LocalRuntimeBridge` implementation for the current environment.
4. Provider output remains schema-validated and beat-evidence-aware.
5. On provider/runtime failure, plugin returns deterministic safe fallback (existing behavior class, but no longer primary path).

## Architecture

### 1) Runtime bridge implementations

Keep `LocalRuntimeBridge` as the single abstraction and add concrete adapters:

- `MockLocalRuntimeBridge` for tests/dev fallback (existing)
- `TauriLocalRuntimeBridge` for desktop app/preview runtime
- optional `SessionRuntimeBridge` for node-driven harness parity (non-game callers)

### 2) Plugin-owned turn service

Add a plugin-internal turn service that:

1. Builds request context (NPC id/name, player input, beat contract, authored profile/safety/lore hints).
2. Calls provider.
3. Normalizes/validates output.
4. Updates plugin memory/session state.
5. Emits structured fallback metadata when provider is unavailable.

### 3) Deterministic authority boundaries stay in engine

No change to engine ownership of:

- beat completion gating
- objective progression
- quest fallback scripting
- intent execution permissions

Only the text generation path changes.

## Implementation Plan

### Phase 26A: Runtime Bridge for In-Engine Calls

1. Implement `TauriLocalRuntimeBridge` in `src/plugins/sugaragent/runtime/`.
2. Add Tauri command surface for `health/load/generate/embed/unload`.
3. Keep strict timeout/error mapping at bridge boundary.
4. Keep `MockLocalRuntimeBridge` as opt-in fallback for dev/tests.

### Phase 26B: Replace Deterministic Primary Turn Path

1. Refactor `createSugarAgentPlugin(...).runAgentTurn(...)` to use `LocalLLMProvider`.
2. Preserve current memory/session persistence and compaction logic.
3. Keep deterministic utterance path only for provider failures and schema-repair exhaustion.

### Phase 26C: Authoring Context Injection

1. Pass authored NPC profile (`persona/tone/constraints/loreScopes`) into provider requests.
2. Include project-level `globalSafetyBounds`.
3. Include active beat contract context where present.
4. Ensure output still conforms to `turn` contract.

### Phase 26D: Runtime UX + Observability

1. Add plugin/runtime health state surfaced to debug UI.
2. Emit structured diagnostics for retries, invalid output, and fallback reason.
3. Distinguish "provider unavailable" vs "validation fallback" in logs.

### Phase 26E: Test + Eval Gate

1. Unit tests: plugin `runAgentTurn` success/retry/fallback paths with bridge mocks.
2. Integration tests: `Game -> PluginManager -> SugarAgent` conversation flow uses provider (not deterministic stub).
3. Regression tests: beat evidence/objective completion behavior unchanged.
4. Eval pass requirement: existing SugarAgent eval suite passes with local provider runtime mode.

## Acceptance Criteria

1. In preview/gameplay, an `interactionMode=agent` NPC produces varied contextual responses instead of repeated deterministic lines.
2. Provider failure does not break gameplay; user receives safe fallback response and chat remains usable.
3. Beat evidence remains machine-readable and objective gating remains deterministic.
4. Save/load continuity for SugarAgent state remains intact.
5. Scripted-only projects (plugin disabled) remain behavior-identical.

## Rejected Alternative

Keep deterministic plugin replies as the primary in-engine path and reserve provider for CLI/sim only.

Rejected because it defeats the purpose of authored agent NPCs in live gameplay and blocks production quality for interactive conversations.

## Consequences

### Positive

- In-engine agent NPC quality matches the intended local-LLM architecture.
- Authoring fields (persona/tone/constraints/lore) materially affect live interactions.
- One provider contract across CLI and gameplay reduces divergence.

### Tradeoffs

- Additional runtime bridge complexity in Tauri/native integration.
- More failure modes at inference boundary (timeouts, model availability).
- Higher test surface area across bridge/provider/plugin layers.

## Notes

This ADR is a follow-on implementation plan to complete the LLM wiring gap after the in-engine interaction scaffolding delivered in SugarAgent ADR-SA-010.
