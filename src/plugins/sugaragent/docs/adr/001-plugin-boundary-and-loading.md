# ADR-SA-001: Plugin Boundary and Loading Model

## Status

Proposed

## Context

SugarAgent must be fully removable and must not become a hard dependency of SugarEngine scripted gameplay.
Authored quest/episode progression must remain engine-owned even when SugarAgent is enabled.

## Decision

1. SugarAgent is implemented under `src/plugins/sugaragent` only.
2. SugarAgent integrates only through `GameConfig.plugins` and plugin contracts.
3. No SugarAgent code is imported by core engine modules unless behind plugin host interfaces.
4. If plugin is not configured, runtime behavior is identical to scripted baseline.
5. Desktop/mobile app builds include SugarAgent at build/package time, but runtime activation still happens through plugin configuration.
6. Story-beat contracts live in authored quest/episode data; SugarAgent consumes beat context and returns evidence only.

## Consequences

Positive:

- Safe add/remove semantics.
- No forced migration for scripted games.
- Scripted quest/episode authority is preserved.

Tradeoff:

- Plugin must work within strict host API; no direct shortcuts.
- Packaging complexity increases across platform targets.
- Beat progression requires explicit engine-plugin contract surface.

## MVP Test (End of Phase 0)

1. Run game without plugin configured.
2. Verify scripted quest/dialogue behavior is unchanged.
3. Run plugin CLI harness:

```bash
npm run sugaragent:sim -- --npc baker
```

4. Verify plugin starts only in sim or when explicitly configured in `GameConfig.plugins`.
5. Verify desktop and mobile build variants can include plugin binary/assets without changing scripted fallback behavior when disabled.
6. Verify authored story-beat progression still runs through engine quest state (not plugin-owned state).
