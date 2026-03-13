# ADR-SA-008: Optional Authoring Hooks and Packaging

## Status

Accepted

## Context

Creators need to configure agent personas/knowledge scopes in editor/publish pipelines, but these fields must remain optional so scripted projects are unaffected.
Creators also need authored quest/episode beats that NPCs deliver through free-form dialogue without losing deterministic progression.

## Decision

### 1) Optional SugarAgent authoring blocks

Add optional SugarAgent blocks to authoring schema:

1. NPC-level `agentProfile` (persona, tone, constraints, lore scopes).
2. Plugin-level global safety policy (`plugins[].globalSafetyBounds`) for baseline bounds.
3. Quest/episode-level `agentBeatContracts[]` (objective, required facts, completion rule, fallback).

All fields are optional and ignored when plugin is disabled.

### 2) Authoritative ownership

1. Canonical episode/quest structure stays in existing engine content model.
2. Beat contracts are authored with quests/episodes, not generated dynamically at runtime.
3. SugarAgent consumes these contracts and returns beat evidence; engine decides completion.

### 3) Packaging behavior

1. Publish pipeline emits SugarAgent artifacts only when project enables plugin.
2. Artifact pack includes:
   - normalized agent profiles
   - normalized beat contracts
   - optional lore index references/locks
3. Scripted-only projects emit no SugarAgent artifacts and remain unchanged.

### 4) Validation rules

1. Lint authoring data for missing required beat fields.
2. Validate contract references (`fallbackScriptId`, quest step IDs, entity IDs).
3. Fail publish for invalid SugarAgent blocks only when plugin is enabled.

## Consequences

Positive:

- Mixed project support (scripted + agent) without forced migration.
- Cleaner packaging of plugin-only assets.
- Supports authored narrative design while enabling free-form NPC delivery.

Tradeoff:

- Extra schema/versioning coordination between editor and plugin.
- Additional authoring validation complexity for beat contracts.

## MVP Test (End of Phase 7)

Procedure:

1. Configure one NPC with SugarAgent persona fields.
2. Leave another NPC scripted-only.
3. Author one quest beat contract tied to that NPC.
4. Publish and run preview.

Expected:

- Agent NPC shows configured persona behavior.
- Scripted NPC behavior unchanged.
- Project still loads if SugarAgent fields are absent.
- Authored beat is delivered in free-form dialogue and advances only via engine rule evaluation.

## Implementation Notes

Current implementation in this repo delivers:

1. Optional authoring fields in project data:
   - `npcs[].agentProfile` (persona/tone/constraints/lore scopes)
   - `quests[].agentBeatContracts[]`
2. Explicit enable gate via project plugin config:
   - `plugins: ["sugaragent"]`
   - or `plugins: [{ "id": "sugaragent", "enabled": true }]`
3. Validation + packaging command:
   - `npm run sugaragent:authoring:pack -- --project <path/to/project.sgrgame> --out <path/to/authoring.bundle.json>`
4. Export integration:
   - `scripts/export-game.mjs` now emits `public/plugins/sugaragent/authoring.bundle.json` only when SugarAgent is enabled.
   - Invalid SugarAgent authoring blocks fail export only when SugarAgent is enabled.
5. Runtime consumption via the plugin session facade:
   - `createSugarAgentSession(...)` now loads `authoring.bundle.json` (default path: `public/plugins/sugaragent/authoring.bundle.json`) when present.
   - `npcs[].agentProfile` is injected into local-LLM prompt shaping.
   - `quests[].agentBeatContracts[]` can be selected via `beatContractId` (or `scenario=authoring:<id>`) and is enforced through existing scenario orchestration.
   - `sugaragent:sim` exposes thin flags (`--authoring-bundle`, `--beat-contract`, `--no-authoring`) that map directly to the same session API.

Authoring UI for these fields is not yet added; fields are currently authored in project JSON.
