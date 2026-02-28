# ADR-024: Plugin Architecture for Optional Systems (including SugarAgent)

## Status

Proposed

## Context

SugarEngine must support multiple games with different runtime needs:

- Game A: fully scripted quest + dialogue flow (current project)
- Game B: may use dynamic NPC systems like SugarAgent

Current engine wiring in `Game.ts` is direct and feature-specific. This is good for speed, but not ideal for optional subsystem loading.

We need a **true plugin model** where:

1. Engine behavior is unchanged when no plugins are installed.
2. A plugin cannot become a hard dependency of core scripted gameplay.
3. Plugins can be added per game (and eventually per NPC) without forking engine code.

## Decision

Introduce a first-class runtime plugin system with strict isolation and opt-in loading.

### Core Rule: Optional By Default

- Plugin support is in core engine.
- Plugin instances are not.
- If `GameConfig.plugins` is omitted, runtime is identical to today.

### Plugin Scope (Runtime)

Plugins may:

- Observe world events (dialogue start/end, interaction, quest events, state changes)
- Propose actions through validated intents
- Provide optional interaction/dialogue handlers
- Persist plugin-local state in namespaced save slots

Plugins may **not**:

- Directly mutate world state
- Bypass quest/dialogue/flag/inventory/caster validation paths
- Break scripted fallback chains

## Architecture

### 1) New Core Types

Create `src/engine/plugins/types.ts`:

```ts
export interface PluginDescriptor {
  id: string;              // e.g. "sugaragent"
  version: string;         // semver-ish
  apiVersion: 1;           // engine plugin API version
}

export interface PluginContext {
  // Read-only world access
  getNearbyInteraction(): { type: string; id: string; available: boolean } | null;
  getNPCInfo(npcId: string): { id: string; name: string } | undefined;
  getPlayerPosition(): { x: number; y: number; z: number } | null;
  getRegionInfo(): { path: string; name?: string } | null;

  // Event bus
  emit(event: PluginEvent): void;
  subscribe(handler: (event: PluginEvent) => void): () => void;

  // Canonical action gate (engine-owned validation/execution)
  executeIntent(intent: PluginIntent): Promise<PluginIntentResult>;
}

export interface EnginePlugin {
  readonly descriptor: PluginDescriptor;
  init(ctx: PluginContext): Promise<void> | void;
  dispose(): Promise<void> | void;

  // Optional hooks
  onUpdate?(delta: number): void;
  onEvent?(event: PluginEvent): void;

  // Optional interaction override. Return null to defer to core/scripted flow.
  resolveInteraction?(input: InteractionRequest): Promise<InteractionResolution | null> | InteractionResolution | null;

  // Optional save/load state
  serializeState?(): unknown;
  loadState?(state: unknown): void;
}
```

### 2) Plugin Manager

Create `src/engine/plugins/PluginManager.ts`:

- Registers plugin instances
- Validates duplicate IDs / API version
- Owns lifecycle (`init`, `update`, `dispose`)
- Fan-outs events to plugins with per-plugin error isolation
- Collects/supplies namespaced save data (`Record<pluginId, unknown>`)
- Resolves interaction via ordered plugin chain

Failure policy:

- Plugin exceptions are logged and isolated.
- Optional: disable plugin after repeated failures in one session.
- Core game loop continues.

### 3) GameConfig Extension

Extend `GameConfig` in `src/engine/core/Game.ts`:

```ts
plugins?: EnginePlugin[]; // optional
```

No default plugins are injected by engine.

### 4) Hook Points in Game Runtime

Integrate `PluginManager` into `Game`:

- Construct manager in `Game` constructor if plugins exist.
- Call plugin update once per frame from a safe hook.
- Emit events from existing systems:
  - dialogue start/end/events
  - quest/objective transitions
  - interaction attempts/results
  - item pickup/add/remove
  - region transitions
  - world flag changes

### 5) Interaction Resolution Chain

Keep scripted flow as canonical fallback:

1. Quest-specific dialogue (current behavior)
2. Behavior tree interaction action (current behavior)
3. Default dialogue (current behavior)

Plugin integration point:

- Before step 2 or between 2 and 3 based on NPC mode
- Plugin only handles interaction when explicitly allowed
- If plugin returns `null`, continue normal scripted chain

### 6) NPC-Level Mode (Optional, Not Required for Phase 1)

Add optional NPC runtime mode:

- `scripted` (default)
- `plugin:<id>`
- `hybrid` (scripted first, plugin fallback, or vice versa by policy)

No NPC content migration required because default remains `scripted`.

### 7) Deterministic Action Gate

Plugins return `PluginIntent`, never direct world writes.

Engine validates and executes via existing paths in `Game.ts` / `Engine.ts`:

- set flag
- emit event
- move NPC
- start dialogue
- quest objective triggers

If an intent fails validation, return structured rejection to plugin.

### 8) Save/Load Integration

Extend save format:

- `GameSaveData.plugins?: Record<string, unknown>`

Load policy:

- If plugin is missing, ignore its saved state.
- If plugin exists, pass state into `plugin.loadState`.

This preserves backward compatibility for scripted-only games and old saves.

### 9) Editor and Publish

Phase 1 runtime plugin system does not require editor changes.

Later:

- Optional project-level `plugins` config in editor/store
- Optional NPC mode fields
- Publish includes plugin config only when present

All fields optional and non-blocking.

## SugarAgent as a Plugin

SugarAgent becomes a consumer of this API, not a core dependency:

- package location (initial): `src/plugins/sugaragent/`
- registered only by games that want it
- stores memory/relationship state under `plugins.sugaragent`
- resolves interactions only for NPCs configured for SugarAgent

This keeps current scripted game unchanged.

## Implementation Plan

### Phase A: Core Plugin Scaffolding

Files:

- `src/engine/plugins/types.ts` (new)
- `src/engine/plugins/PluginManager.ts` (new)
- `src/engine/plugins/index.ts` (new)
- `src/engine/index.ts` (exports)
- `src/engine/core/Game.ts` (`GameConfig.plugins`, manager lifecycle)

Acceptance:

- No plugin configured => no behavioral changes.
- Engine compiles/tests pass.

### Phase B: Runtime Hooking + Interaction Chain

Files:

- `src/engine/core/Game.ts`

Add:

- event emission from existing system callbacks
- plugin interaction resolution in `engine.onInteract` path
- strict fallback to current scripted behavior

Acceptance:

- Existing game scripts behave exactly the same with zero plugins.
- Plugin can augment one NPC interaction without affecting others.

### Phase C: Plugin Persistence

Files:

- `src/engine/save/types.ts` (`plugins` field + save version bump)
- `src/engine/save/SaveManager.ts` (gather/restore plugin state)
- `src/engine/core/Game.ts` (pass persistence handlers)

Acceptance:

- Plugin state survives save/load when plugin enabled.
- Save loads safely when plugin absent.

### Phase D: Optional Authoring Hooks

Files:

- `src/editor/store/useEditorStore.ts`
- `src/editor/panels/npc/NPCDetail.tsx`
- `src/editor/utils/publish.ts`

Acceptance:

- New fields are optional.
- Existing projects require no migration.

### Phase E: SugarAgent Plugin

Files:

- `src/plugins/sugaragent/*`

Acceptance:

- SugarAgent can be enabled per game.
- Scripted game remains unchanged when SugarAgent is disabled.

## Consequences

Positive:

- Strong backward compatibility for scripted games
- Clear extension path for advanced systems
- Lower long-term engine coupling risk

Tradeoffs:

- Slightly more runtime plumbing in `Game.ts`
- More API/versioning discipline required for plugin contracts

## Non-Goals (Phase 1)

- Remote plugin downloading/execution
- Cross-process sandboxing
- Editor plugin marketplace

Phase 1 is in-process, code-level plugins registered at app startup.
