# ADR-SA-002: Local LLM Runtime Compiled Into App (Desktop + Mobile)

## Status

Proposed

## Context

SugarAgent requires real LLM dialogue and must work without external cloud APIs.
Target distribution includes desktop and mobile app builds, so runtime packaging must be concrete and App Store-safe.

The previous version of this ADR was too abstract about “local provider.”

## Decision

### 1) Runtime strategy

Use our **own local inference runtime compiled into the app**.

- No mandatory network calls for generation.
- No dependence on hosted API providers.
- Plugin still uses provider interfaces, but default provider is local-native.

### 2) Provider stack

SugarAgent will use two provider interfaces:

1. `LLMProvider` for structured turn generation.
2. `EmbeddingProvider` for lore/memory retrieval vectors.

Default implementations:

- `LocalLLMProvider`
- `LocalEmbeddingProvider`

Both call into a native runtime bridge backed by compiled inference code.

### 3) Native bridge contract

Define a minimal cross-platform native runtime API used by JS plugin code:

- `runtime.health()`
- `runtime.loadModel(modelId)`
- `runtime.generateStructured(request)`
- `runtime.embed(texts[])`
- `runtime.unloadModel(modelId)`

Platform-specific implementations sit behind this contract:

- desktop app: native/sidecar runtime bridge
- iOS/iPadOS app: native bridge + compiled runtime
- Android app: JNI/NDK bridge + compiled runtime

SugarAgent never calls platform APIs directly; it only calls this runtime contract.

### 4) Packaging model by target

For desktop builds:

1. Bundle native runtime binary/library with app.
2. Bundle model files as app assets/data files.
3. Expose runtime through desktop bridge adapter.

For iOS/iPadOS builds:

1. Compile inference runtime into the app binary (native target).
2. Package model weights as app resources (data assets).
3. Expose runtime functions through app-native bridge to SugarAgent provider.
4. Ship plugin code with app build (no post-install executable plugin download).

For Android builds:

1. Compile inference runtime using NDK and ship in app.
2. Package model weights in app assets or first-run copied app storage.
3. Expose runtime functions through JNI bridge adapter.

This keeps behavior deterministic and avoids runtime dependency on remote services across all targets.

### 5) Model tiering (initial)

Ship at least two local model tiers:

- `chat-fast` (low latency, smaller quantized model)
- `chat-quality` (higher quality, slower)

Optional embedding model:

- lightweight sentence embedding model for retrieval

Runtime selects tier by device capability/profile.

Suggested baseline profile mapping:

- desktop-high: `chat-quality`
- desktop-mid/mobile-high: `chat-fast`
- mobile-low: reduced context + reduced generation limits

### 6) Structured output enforcement

All generation must return schema-validated JSON.

Schema includes both conversational output and authored beat evidence when a beat contract is active.
Minimum structured fields:

- `utterance`
- `emotion`
- `proposedIntents[]`
- `citations[]`
- `beatEvidence` (`beatId`, `coveredFacts[]`, `uncoveredFacts[]`, `completionSignal`, `confidence`)

On invalid output:

1. Retry with constrained repair prompt.
2. Fallback to deterministic safe response.
3. Log structured failure event.

No unvalidated output reaches gameplay logic.

### 7) Resource controls

Define hard budgets per device profile:

- max context tokens
- max generation tokens
- max concurrent generations
- memory ceiling triggers (model tier downgrade)

If budget exceeded, runtime degrades gracefully (shorter responses, smaller tier), not crash.

### 8) Non-goals (for now)

- Cloud provider integration
- Dynamic executable/plugin download
- “Huge model” tier for first iPad release

## Implementation Notes

### Phase 1A: Provider + bridge stubs

- Add `LLMProvider` and `EmbeddingProvider` interfaces.
- Add runtime bridge interface + mock implementation.
- Wire `LocalLLMProvider` to bridge interface.

### Phase 1B: Native runtime integration

- Implement desktop bridge adapter.
- Implement iOS/iPadOS bridge adapter.
- Implement Android bridge adapter.
- Compile and wire runtime per target.
- Implement model load/unload and health checks.

### Phase 1C: Model packaging + startup flow

- Bundle default model assets.
- Add startup warmup path and timeout handling.
- Add device capability-based tier selection.

## Consequences

Positive:

- True offline-capable LLM dialogue.
- Portable plugin architecture with clear runtime boundary.
- Desktop/mobile packaging path is explicit, not hand-wavy.

Tradeoffs:

- Larger app size due to bundled models.
- More native build complexity.
- Strict performance tuning required for mobile thermals/memory.
- Cross-platform runtime adapter maintenance overhead.
- Model behavior must still be constrained enough for deterministic beat-evidence extraction.

## MVP Test (End of Phase 1)

### CLI / dev harness

```bash
npm run sugaragent:sim -- --npc baker --provider local
```

Verify:

- Response is generated by local runtime provider.
- JSON output passes schema validation.
- Invalid model output is retried/repaired or safe-fallbacked.
- Structured beat evidence payload is emitted when the interaction includes an active authored beat contract.

### Cross-platform packaging smoke

1. Install/run desktop build with network disabled.
2. Install iOS/iPadOS build in airplane mode.
3. Install Android build in airplane mode.
4. Start the same NPC conversation scenario on each.

Verify:

- No network dependency for generation.
- Runtime health + model load logs are present.
- Structured output behavior is consistent across targets.
- Beat-evidence schema behavior is consistent across desktop/mobile adapters.
