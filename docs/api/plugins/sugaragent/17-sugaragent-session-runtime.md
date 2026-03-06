# SugarAgent Turn Lifecycle (In-Engine)

This document now describes the in-engine SugarAgent turn lifecycle only.

Legacy CLI/session-runtime orchestration surfaces were removed.

## Entry Point

- `src/plugins/sugaragent/plugin.ts`
- `runAgentTurn(request)`

## Turn Lifecycle

1. Normalize player input and load NPC/plugin state.
2. Resolve runtime context (including default runtime mode).
3. Call `LocalLLMProvider.generateStructured(...)`.
4. Runtime bridge executes local generation (`llama` path) and returns structured JSON.
5. Run grounding pass:
   - build evidence set,
   - validate claims,
   - fallback to uncertainty when unsupported claims require repair.
6. Normalize diagnostics.
7. Apply beat evidence enrichment when an active beat contract exists.
8. Persist plugin memory/session state and return final turn payload.

## Core Files

- `src/plugins/sugaragent/plugin.ts`
- `src/plugins/sugaragent/providers/llm/LocalLLMProvider.ts`
- `src/plugins/sugaragent/runtime/TauriLocalRuntimeBridge.ts`
- `src/plugins/sugaragent/runtime/HttpLocalRuntimeBridge.ts`
- `src/plugins/sugaragent/session/core/grounding/claim-validator.ts`
- `src/plugins/sugaragent/session/core/grounding/evidence.ts`
- `src/plugins/sugaragent/session/core/grounding/diagnostics.ts`

## Debug Signals

Useful debug logs in the in-engine path:

- `[sugaragent][llm-provider][start]`
- `[sugaragent][grounding]`

Use browser devtools console with debug/verbose logs enabled.
