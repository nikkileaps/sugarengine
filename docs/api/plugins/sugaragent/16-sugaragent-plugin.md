# SugarAgent Plugin API

SugarAgent is an optional engine plugin implemented at:

- `src/plugins/sugaragent/`

## Public Facade

SugarAgent exposes one public facade for engine callers:

- `SugarAgent.createPlugin(options?)`
- Source: `src/plugins/sugaragent/public-api.ts`

Everything else under `src/plugins/sugaragent/*` is internal.

## Engine Contract

Created plugin instances implement the engine plugin contract (`EnginePlugin`) and provide:

- `resolveInteraction(...)` -> opens agent conversation UI when selected
- `runAgentTurn(...)` -> executes one NPC turn
- `serializeState()` / `loadState(...)` -> plugin-scoped save/load

Core implementation:

- `src/plugins/sugaragent/plugin.ts`

## Turn Generation Path (In-Engine)

Current production/preview path:

1. `Game` calls `plugin.runAgentTurn(...)`.
2. Plugin delegates generation to `LocalLLMProvider`.
3. `LocalLLMProvider` calls runtime bridge (`TauriLocalRuntimeBridge` or `HttpLocalRuntimeBridge`).
4. Plugin applies grounding validation and fallback policy.
5. Plugin returns structured turn payload to engine/UI.

Core files:

- `src/plugins/sugaragent/plugin.ts`
- `src/plugins/sugaragent/providers/llm/LocalLLMProvider.ts`
- `src/plugins/sugaragent/runtime/TauriLocalRuntimeBridge.ts`
- `src/plugins/sugaragent/runtime/HttpLocalRuntimeBridge.ts`
- `src/plugins/sugaragent/session/core/grounding/claim-validator.ts`

## Project Configuration

Enable SugarAgent via project plugin settings:

```json
{
  "plugins": [
    {
      "id": "sugaragent",
      "enabled": true,
      "runtimeMode": "llama",
      "globalSafetyBounds": [
        "No profanity",
        "No legal advice",
        "No medical advice"
      ]
    }
  ]
}
```

NPC authoring fields consumed by the plugin:

- `interactionMode`
- `agentProfile.persona`
- `agentProfile.tone`
- `agentProfile.constraints[]`
- `agentProfile.loreScopes[]`
- `agentProfile.selfEntityId`
- `agentProfile.selfLoreScopes[]`
- `agentProfile.relatedLoreScopes[]`

## Notes

- CLI/session-runtime command surfaces were removed from this package.
- SugarAgent correctness and behavior should now be exercised through the live engine path.
