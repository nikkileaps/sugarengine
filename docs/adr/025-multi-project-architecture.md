# ADR-025: Multi-Project Game Architecture (Engine Shared, Content Isolated)

## Status

Proposed

## Context

Sugarengine is now powering more than one game title:

- Rackwick City (existing content)
- Wordlark (new immersive language-learning game)

Current publishing and asset handling are centered around a shared `public/` root. This creates multiple problems:

1. Game-specific assets are mixed together in one global namespace.
2. One game can overwrite or accidentally depend on another game's content.
3. Publish/runtime are tied to root `game.json` and root asset folders.
4. Save data is not namespaced per game, creating cross-title collision risk.

This is the opposite of how Unity/Unreal projects are organized. Those ecosystems isolate each game as its own project and treat engine/runtime code as shared infrastructure.

## Decision

Adopt a **project-per-game architecture**:

1. Keep engine/editor runtime code shared.
2. Move game content and game configuration into isolated per-title project roots.
3. Build, publish, deploy, and save/load must all be scoped by project identity (`gameId` / project path).

### Target Structure

```text
sugarengine/
├── src/                          # shared engine/editor/plugin code
├── docs/
└── games/
    ├── rackwick-city/
    │   ├── project.sgrgame
    │   ├── assets/
    │   │   ├── regions/
    │   │   ├── models/
    │   │   ├── audio/
    │   │   └── items/
    │   ├── config/
    │   │   └── game.config.json
    │   └── publish/              # generated output for this game only
    └── wordlark/
        ├── project.sgrgame
        ├── assets/
        ├── config/
        └── publish/
```

### Runtime Path Policy

- Project-authored paths remain **relative asset paths** (example: `models/player.glb`, `regions/cafe-nollie/geometry.glb`).
- Runtime resolves those against a project-scoped `contentBaseUrl`.
- No game runtime content may assume root `public/` paths.

### Build/Publish Policy

- All game build/export commands must accept a `--project` input (or equivalent env var).
- Build output is per game (`dist/<gameId>/` or game-specific deploy root), never shared global output.
- Deploy scripts must be project-agnostic and parameterized by target game.

### Save Namespace Policy

- Browser and native save keys must include `gameId`.
- Example:
  - localStorage: `sugarengine:<gameId>:save:<slotId>`
  - Tauri files: `saves/<gameId>/<slotId>.json`

### Source-of-Truth Policy

- Each game project owns its assets and authored data.
- Shared engine repo must not store title-specific runtime content in root `public/`.

## Rejected Alternative

`public/games/<slug>/...` inside a single shared public root was considered as a transition approach but rejected as the final architecture because:

1. It preserves a central global content bucket.
2. It blurs ownership boundaries between game projects.
3. It does not match established engine/project separation patterns used by other engines.

## Migration Plan

### Phase 1: Project Roots

1. Create `games/rackwick-city/` and `games/wordlark/`.
2. Add per-project `project.sgrgame` and `config/game.config.json` with stable `gameId`.

### Phase 2: Content Move

1. Move Rackwick-specific assets from root `public/` into `games/rackwick-city/assets/`.
2. Keep a short-lived compatibility fallback for legacy root paths.

### Phase 3: Pipeline Refactor

1. Update export/publish/build scripts to require project selection.
2. Update runtime bootstrap to load project-specific manifest/data.
3. Parameterize deploy scripts so they are not Rackwick-specific.

### Phase 4: Save Migration

1. Introduce game-scoped save keys/paths.
2. On first run, migrate legacy unscoped saves into the new namespace.

### Phase 5: Remove Legacy Coupling

1. Remove root `public/game.json` assumptions.
2. Remove legacy asset fallback once migration is complete.

## Consequences

### Positive

- Clean title isolation (Rackwick and Wordlark cannot pollute each other).
- Predictable ownership boundaries for content and config.
- Safer multi-title development and release cadence.
- Clear path to independent deployment and CDN layout per game.

### Negative

- Requires pipeline refactor across editor/export/runtime/deploy/save.
- Adds migration complexity for existing Rackwick data and save files.

## Notes

This ADR updates the architectural direction for multi-game support and should be treated as the target state for future publish/deploy/save changes.
