# ADR-026: Game Root Lifecycle and External Game Discovery

## Status

Proposed

## Context

SugarEngine currently treats a game mostly as a file-centric editing session:

- `New Project` creates in-memory content only.
- `Open Project` opens a single `.sgrgame` file through a file picker.
- `Save Project` is primarily a file export/download flow.
- Authoring assumptions still point back to `games/<slug>/...` paths inside the engine repo.

This is not sufficient if SugarEngine is intended to create and maintain real games with their own local roots, assets, plugin data, runtime bundle, and deployment metadata.

The engine also now has two overlapping architectural directions:

1. ADR-009 introduced a `Project Manager` pattern for onboarding and loading.
2. ADR-025 established a multi-game architecture where game content must be isolated from shared engine code.

What is still missing is the directory-root lifecycle that connects those decisions to the editor itself.

## Decision

Adopt a **game-root-based editor lifecycle**.

### Core rule

For the current product model:

- `game == project`

SugarEngine should open, save, and scaffold an entire **game root directory**, not treat the `.sgrgame` file alone as the main unit of work.

### Editor lifecycle

The editor should use:

- `New Game`
- `Open Game`
- `Save Game`

instead of:

- `New Project`
- `Open Project`
- `Save Project`

This is not just a UI rename. It reflects the architectural unit SugarEngine is editing.

### Game root convention

A game is represented by a root directory using a fixed convention:

```text
<game-root>/
  project.sgrgame
  assets/
    audio/
    items/
    models/
    regions/
    ui/
  plugins/
  runtime/
    bin/
    models/
  config/
    game.config.json
  manifests/
    published-assets.json
  exports/
```

This is the canonical authored layout for newly created games.

### Discovery rule

SugarEngine should not require a second bootstrap manifest just to find the game.

Discovery is convention-based:

1. If the user opens a folder, SugarEngine looks for `project.sgrgame` at the root.
2. If the user opens a `.sgrgame` file directly, SugarEngine infers the game root from its parent directory.

No additional root bootstrap file is required for this stage of the architecture.

### Save rule

`Save Game` writes back into the currently opened game root.

That means:

- `project.sgrgame` is the authored source of truth for game content
- authored files are saved locally into the opened root
- Git is not required for save to work
- Git operations remain explicit user actions outside the save action

### Path rule

Authoring data should be root-relative, not engine-repo-relative.

Specifically:

- authored `meta.contentBasePath` should be `assets/`
- not `games/<slug>/assets/`

Published runtime/export steps may derive deployed paths later, but authored data must describe the local game root.

## Consequences

### Positive

- SugarEngine becomes a real editor for standalone game roots instead of a file exporter.
- Real game content can live outside the engine repo without breaking the authoring model.
- Save semantics become local and deterministic.
- Authored data stops hardcoding transitional engine-repo folder structure.
- This aligns the editor with the multi-game direction from ADR-025.

### Negative

- Existing editor flows and terminology need to change.
- Current assumptions in preview/export/publish logic must be normalized over time.
- Backward compatibility is required for older in-repo `games/<slug>` projects during transition.

## Rejected Alternatives

### 1. Continue with file-only project handling

Rejected because it makes the `.sgrgame` file look like the whole game when it is not. Real games also need assets, plugin data, runtime artifacts, and config under a stable root.

### 2. Add a second root bootstrap manifest immediately

Rejected because discovery would still need an outer rule first, making the first-stage design more complex without enough benefit.

Fixed convention is sufficient for now.

### 3. Make save implicitly perform Git operations

Rejected because save and version control are different concerns.

`Save Game` should mean filesystem persistence only. Commit and push remain explicit user actions.

## Relationship to Existing ADRs

### Builds On

- ADR-025: Multi-Project Game Architecture

This ADR defines how the editor actually works with those game roots.

### Refines

- ADR-009: Project Manager Dialog

ADR-009 established the lifecycle manager pattern but remained project/file-centric. This ADR refines that lifecycle so the manager is rooted in a real game directory instead.

## Notes

This ADR is intentionally about architecture only:

- what the unit of work is
- how it is discovered
- how it is saved
- how authored paths should behave

Implementation sequencing, scaffolding details, and migration steps belong in a separate plan document.
