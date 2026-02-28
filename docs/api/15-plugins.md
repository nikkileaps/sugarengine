# Plugin System

The plugin system (ADR-024) adds optional runtime extensions without changing core scripted gameplay behavior.

**Source**: `src/engine/plugins/`

## Design Goals

- Optional-by-default: no plugins configured means no behavior change.
- ECS-aligned updates: plugin ticks run as a world system.
- Deterministic safety: plugins request actions through validated intents, never direct world mutation.
- Save/load isolation: plugin state is namespaced per plugin ID.

## Core Types

### EnginePlugin

```typescript
interface EnginePlugin {
  descriptor: {
    id: string;
    version: string;
    apiVersion: number; // must match PLUGIN_API_VERSION
  };

  init(ctx: PluginContext): Promise<void> | void;
  dispose(): Promise<void> | void;

  onUpdate?(delta: number): void;
  onEvent?(event: PluginEvent): void;
  resolveInteraction?(
    request: InteractionRequest
  ): PluginInteractionResolution | null | Promise<PluginInteractionResolution | null>;

  serializeState?(): unknown;
  loadState?(state: unknown): void;
}
```

### PluginContext

```typescript
interface PluginContext {
  getNearbyInteraction(): { type: string; id: string; promptText?: string; available: boolean } | null;
  getNearbyInteractable(): NearbyInteractable | null;
  getNPCInfo(npcId: string): { id: string; name: string; dialogueId?: string } | undefined;
  getPlayerPosition(): { x: number; y: number; z: number } | null;
  getRegionInfo(): { path: string; name?: string } | null;
  executeIntent(intent: PluginIntent): Promise<PluginIntentResult>;
  emit(event: PluginEvent): void;
  subscribe(handler: (event: PluginEvent) => void): () => void;
}
```

### PluginIntent

Engine-supported intent types:

- `startDialogue`
- `setFlag`
- `emitEvent`
- `moveNpc`
- `triggerObjective`

Plugins should use intents rather than mutating game state directly.

## Runtime Integration

### PluginManager

`PluginManager` owns:

- plugin registration and API-version checks
- lifecycle (`init`, `update`, `dispose`)
- event fan-out
- interaction resolution chain
- namespaced state serialize/load

Errors in one plugin are isolated and do not stop core runtime.

### PluginSystem (ECS)

`PluginSystem` bridges plugin `onUpdate(delta)` into the ECS world update loop.

This means plugin tick timing follows the same pause/update semantics as other systems.

## Game Configuration

`GameConfig` supports optional plugins:

```typescript
interface GameConfig {
  // ...
  plugins?: EnginePlugin[];
}
```

If omitted, plugin runtime is inactive and the scripted quest/dialogue flow is unchanged.

## Interaction Resolution Order

NPC interaction in `Game` runs:

1. Quest-specific dialogue
2. Behavior tree action
3. Plugin resolution (if plugins exist)
4. Default dialogue fallback

If plugins return `null`, scripted flow continues normally.

## Persistence

`GameSaveData` supports plugin namespaced state:

```typescript
interface GameSaveData {
  // ...
  plugins?: Record<string, unknown>;
}
```

`SaveManager` gathers plugin state through a bridge and restores it on load if plugins are present.
Missing plugins are safely ignored.

## Example

```typescript
import { Game, PLUGIN_API_VERSION, type EnginePlugin } from './engine';

const loggerPlugin: EnginePlugin = {
  descriptor: { id: 'logger', version: '1.0.0', apiVersion: PLUGIN_API_VERSION },
  init(ctx) {
    ctx.subscribe((event) => {
      if (event.type === 'interactionAttempt') {
        console.log('Interaction:', event.npcId);
      }
    });
  },
  dispose() {},
};

const game = new Game({
  container: document.getElementById('app')!,
  plugins: [loggerPlugin],
});
```
