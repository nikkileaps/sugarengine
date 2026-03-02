# SugarAgent Plugin (Phase 2)

SugarAgent is implemented as an optional plugin package under:

- `src/plugins/sugaragent/`

Current implementation provides:

- Optional runtime plugin skeleton (still no-op interaction interception).
- Local provider/runtime contracts for structured generation.
- Plugin-owned reusable turn/session runtime
  (`src/plugins/sugaragent/session/runtime.mjs`) used by CLI today and intended
  for future non-CLI clients.
- Dialogue orchestration source of truth in TypeScript
  (`src/plugins/sugaragent/dialogue/scenario-orchestration.ts`) with a thin
  generated JS runtime adapter for Node CLI path
  (`src/plugins/sugaragent/dialogue/scenario-orchestration.runtime.mjs` via
  `npm run sugaragent:sync:scenario`).
- Plugin-owned CLI simulation module with `echo` and `local` providers
  (`src/plugins/sugaragent/sim/cli.mjs`), invoked via thin script wrapper
  (`scripts/sugaragent-sim.mjs`).
- Real local runtime mode through a local `llama.cpp`-compatible command invocation path.
- Plugin-owned lore ingestion/retrieval module
  (`src/plugins/sugaragent/lore/lore-lib.mjs`) and ingest CLI
  (`src/plugins/sugaragent/lore/ingest-cli.mjs`), invoked via
  `scripts/sugaragent-lore-ingest.mjs`.
- Plugin-owned eval/observability module
  (`src/plugins/sugaragent/eval/runner.ts`) with eval CLI
  (`src/plugins/sugaragent/eval/cli.mjs`), invoked via
  `scripts/sugaragent-eval.mjs`.
- Plugin-owned bundle CLI module
  (`src/plugins/sugaragent/runtime/bundle-cli.mjs`), invoked via
  `scripts/sugaragent-bundle-local-llm.mjs`.

Public API boundary:

1. Game/runtime callers use the single facade exported from `src/plugins/sugaragent`:
   - `SugarAgent.createPlugin(...)`
2. Command callers (script wrappers) use one command API facade:
   - `SugarAgent.execute(...)` in `src/plugins/sugaragent/command-api.mjs`
   - `SugarAgent.createAgentSession(...)` in `src/plugins/sugaragent/command-api.mjs`
   - `SugarAgent.execute({ command: "authoring:pack", ... })` for ADR-008 packaging
   - `SugarAgent.execute({ command: "eval", ... })` for ADR-007 smoke eval + replay

All other modules under `src/plugins/sugaragent/*` are internal implementation details.

## Programmatic Turn Session API (Node)

```javascript
import { SugarAgent } from '../src/plugins/sugaragent/command-api.mjs';

const session = await SugarAgent.createAgentSession({
  npc: 'baker',
  provider: 'local',
  runtime: 'auto',
  session: 'my-session',
  // Optional ADR-008 runtime authoring inputs:
  authoringBundlePath: 'public/plugins/sugaragent/authoring.bundle.json',
  beatContractId: 'beat.baker.intro',
});

const turn = await session.runTurn('What is happening at the gate?');
console.log(turn.output.utterance);

// ADR-006 cadence simulation path
const cadence = await SugarAgent.createAgentSession({
  scenario: 'crowd-town',
  tickBudget: 6,
});
const report = cadence.runTicks(300);
console.log(report.activeBeat.responsiveness);
```

## ADR-008 Authoring Packaging

Optional authoring fields (project data):

- `npcs[].agentProfile`
  - `persona?: string`
  - `tone?: string`
  - `constraints?: string[]` (NPC-specific constraints)
  - `loreScopes?: string[]`
- `plugins[].globalSafetyBounds?: string[]` for `id: "sugaragent"`
  - baseline safety policy applied to all SugarAgent NPC turns
- `npcs[].interactionMode?`
  - `"scripted" | "agent" | "hybrid"` (default: `"scripted"`)
- `quests[].agentBeatContracts[]`
  - `id`, `npcId`, `objective`, `requiredFacts[]`, `completionRule`
  - optional: `forbiddenFacts[]`, `completionTarget`, `maxTurns`, `fallbackScriptId`, `stageId`, `objectiveId`

Enable SugarAgent packaging in project data:

```json
{
  "plugins": ["sugaragent"]
}
```

Pack authoring artifacts from terminal:

```bash
npm run sugaragent:authoring:pack -- \
  --project /path/to/project.sgrgame \
  --out /path/to/authoring.bundle.json
```

Options:

- `--project <path>` project `.sgrgame` input (default: `project.sgrgame`)
- `--out <path>` bundle output path (default: `public/plugins/sugaragent/authoring.bundle.json`)
- `--quiet` suppress non-error logs

Notes:

1. If SugarAgent is not enabled, no bundle is emitted.
2. Invalid SugarAgent blocks fail packaging only when SugarAgent is enabled.

Runtime consumption (same session facade):

1. `createAgentSession(...)` auto-loads authoring bundle by default from:
   - `public/plugins/sugaragent/authoring.bundle.json`
2. Optional session options:
   - `authoringBundlePath?: string`
   - `beatContractId?: string`
   - `useAuthoring?: boolean` (default: `true`)
3. Effects:
   - NPC `agentProfile` is used in local-LLM prompt shaping.
   - Selected beat contract is converted into an orchestration scenario (`authoring:<id>`).

## Runtime Contract

Factory:

```typescript
import { SugarAgent } from '../src/plugins/sugaragent';

const sugaragent = SugarAgent.createPlugin();
```

Descriptor:

- `id: "sugaragent"`
- `version: "0.5.0"`
- `apiVersion: PLUGIN_API_VERSION`

Behavior in current runtime:

- `resolveInteraction()` returns `openAgentConversation` for plugin-routed NPC interactions.
- `runAgentTurn()` is available through plugin manager for in-game text conversation turns.
- Plugin state is namespaced under `plugins.sugaragent`.
- Event counting is included for early smoke verification.

## Phase 1 Provider Contracts (Internal)

`LocalLLMProvider` behavior:

1. Calls runtime bridge `loadModel()` lazily.
2. Requests structured JSON output from runtime.
3. Validates strict turn schema (`utterance`, `emotion`, `intent`, `proposedIntents[]`, `citations[]`).
4. Retries once with repair mode when JSON/schema is invalid.
5. Falls back to deterministic safe output if validation still fails.

## Enabling in a Game

Project entry points can auto-instantiate SugarAgent from project plugin config:

```json
{
  "plugins": ["sugaragent"]
}
```

or:

```json
{
  "plugins": [{ "id": "sugaragent", "enabled": true, "globalSafetyBounds": ["No profanity", "No legal advice", "No medical advice"] }]
}
```

This repo now resolves runtime plugins from project data in both:

- `src/game.ts`
- `src/preview.ts`

You can still wire it manually:

```typescript
import { Game } from '../src/engine';
import { SugarAgent } from '../src/plugins/sugaragent';

const game = new Game({
  container: document.getElementById('app')!,
  plugins: [SugarAgent.createPlugin()],
});
```

If you omit `plugins`, runtime remains fully scripted.

## In-Game Agent Conversation (Phase 10C + 10D + 10E)

Current runtime path in game/preview:

1. NPC interaction chain still starts with scripted priority:
   - quest dialogue -> behavior tree (except `interactionMode: "agent"`) -> plugin -> scripted fallback
2. When plugin handles interaction, it opens the in-game agent conversation panel.
3. Player submits free-text turns in the panel.
4. Game selects an active authored beat contract for this NPC from active quest context
   (`questId`, current stage, optional active `objectiveId`).
5. Game enforces deterministic turn-budget guardrail:
   - if `maxTurns` is exceeded, runtime routes to `fallbackScriptId` (if provided) and exits agent chat.
6. Game forwards turns through plugin manager `runAgentTurn(...)` including optional:
   - `beatContract`
   - `beatTurnCount`
7. Plugin returns structured turn output (`utterance`, optional `emotion`/`intent`) and optional `beatEvidence`.
8. Engine evaluates `beatEvidence` deterministically against contract rules and current state before objective completion.
   - Only engine completes quest objectives (for contracts with `objectiveId` that are currently active).
9. Save/load continuity:
   - beat turn counts and coverage continuity are recovered from persisted SugarAgent plugin state on load.
   - objective/quest completion clears matching beat session state to avoid stale budget carryover.
   - loading saves that include plugin payload remains safe even when plugin is disabled/missing.

Current note: this in-game turn path uses deterministic plugin turn logic for now.
Local LLM-backed in-game turns are still pending deeper runtime/platform wiring.

For NPC routing, set optional NPC field:

- `interactionMode?: "scripted" | "agent" | "hybrid"` (default: `scripted`)

## Editor Authoring Surface (Phase 10F)

The editor now exposes SugarAgent authoring controls directly:

1. Project-level plugin enable:
   - `Project` menu -> `Plugins` -> enable `SugarAgent`
   - Configure `Global Safety Bounds` in the same dialog (baseline policy for all SugarAgent NPCs)
2. NPC authoring:
   - `interactionMode`
   - `agentProfile.persona`
   - `agentProfile.tone`
   - `agentProfile.constraints[]`
   - `agentProfile.loreScopes[]`
3. Quest authoring:
   - `agentBeatContracts[]` add/edit/remove
   - `npcId`, `objective`, `requiredFacts[]`, `forbiddenFacts[]`
   - `completionRule`, `completionTarget`, `maxTurns`, `fallbackScriptId`
   - optional `stageId` / `objectiveId` bindings

## CLI Simulation Harness

Run a one-shot interaction (default `echo` provider):

```bash
npm run sugaragent:sim -- --npc baker --ask "hello"
```

Run with local provider (Phase 1 path):

```bash
npm run sugaragent:sim -- --npc baker --provider local --ask "hello"
```

Run ADR-005 beat/intent-gating MVP scenario:

```bash
npm run sugaragent:sim -- --scenario beat-guard-alert --npc guard --provider local --ask "What is happening at the gate?"
```

Run ADR-006 cadence/background-planning MVP:

```bash
npm run sugaragent:sim -- --scenario crowd-town --ticks 300
```

Cadence options:

1. `--ticks <n>` required for `crowd-town` scenario mode
2. `--tick-budget <n>` max NPC updates per tick (default: `6`)

Run ADR-007 eval smoke suite:

```bash
npm run sugaragent:eval -- --suite smoke
```

Replay a captured transcript:

```bash
npm run sugaragent:eval -- --replay /path/to/transcript.json
```

Eval options:

1. `--suite <id>` currently supports `smoke`
2. `--output <dir>` override artifact output dir (default run dirs under `.sugaragent-evals/`)
3. `--provider <local|echo>` session provider for eval runs
4. `--runtime <auto|mock|llama>` runtime mode for eval runs
5. `--replay <path>` replay mode for a captured transcript

Run ADR-008 authored beat contract from packed bundle:

```bash
npm run sugaragent:sim -- \
  --npc baker \
  --provider local \
  --authoring-bundle public/plugins/sugaragent/authoring.bundle.json \
  --beat-contract beat.baker.intro \
  --ask "hello"
```

Authoring-related sim flags:

1. `--authoring-bundle <path>` override bundle path (default: `public/plugins/sugaragent/authoring.bundle.json`)
2. `--beat-contract <id>` select authored beat contract for scenario orchestration
3. `--no-authoring` disable authoring bundle loading entirely

Bundle runtime + model into the plugin directory:

```bash
npm run sugaragent:bundle:local-llm
```

By default this uses model profile `balanced`.

List profiles:

```bash
npm run sugaragent:bundle:local-llm -- --list-profiles
```

Bundle a specific profile:

```bash
npm run sugaragent:bundle:local-llm -- --profile mobile
```

Current profiles:

1. `mobile`: `Qwen2.5-1.5B-Instruct` `q4_k_m` (lower memory, lower quality)
2. `balanced` (default): `Qwen3-4B-Instruct-2507` `q5_k_m` (fallbacks to `q4_k_m` artifact when needed)
3. `quality`: `Qwen3-8B` `q4_k_m` (higher memory footprint)

The bundle command downloads:

1. `llama.cpp` runtime binaries (defaults to `llama-completion` at runtime)
2. Profile-selected GGUF model

into:

- `src/plugins/sugaragent/runtime/bundle/bin/llama-completion`
- `src/plugins/sugaragent/runtime/bundle/models/<profile-model>.gguf`
- `src/plugins/sugaragent/runtime/bundle/bundle.lock.json`

`sugaragent:sim` resolves the bundled model path from `bundle.lock.json`, so it uses the latest bundled profile automatically.

After bundling, you can chat with the local model directly:

```bash
npm run sugaragent:sim -- --npc baker --provider local --no-lore
```

By default, `--provider local` uses runtime mode `auto`:

1. If llama config is present (`--llama-bin` + `--model-path` or env vars), it uses real llama runtime.
2. Otherwise it falls back to mock runtime and prints a warning.

Force real llama runtime:

```bash
npm run sugaragent:sim -- \
  --npc baker \
  --provider local \
  --runtime llama \
  --llama-bin /path/to/llama-completion \
  --model-path /path/to/model.gguf \
  --ask "hello"
```

Explicitly bundle recommended profile:

```bash
npm run sugaragent:bundle:local-llm -- --profile balanced
```

Simulate invalid JSON once (tests retry path):

```bash
npm run sugaragent:sim -- --npc baker --provider local --simulate-invalid-json once --ask "hello"
```

Simulate invalid JSON always (tests fallback path):

```bash
npm run sugaragent:sim -- --npc baker --provider local --simulate-invalid-json always --ask "hello"
```

## Lore Ingestion (Phase 2)

Ingest markdown lore wiki files into generated artifacts:

```bash
npm run sugaragent:lore:ingest -- --source ../game-lore-wiki --commit <sha>
```

Optional flags:

- `--output <dir>` default: `src/plugins/sugaragent/lore/generated`
- `--repo <repo-url-or-label>` default: `local`
- `--ref <git-ref>` optional source ref/tag label for provenance
- `--lock <path>` default: `src/plugins/sugaragent/lore/lore-source.lock.json`
- `--no-lock` ignore lock defaults and require explicit args
- `--write-lock` persist current `repo/commit/ref/source` back to lock file

Default lore lock file:

- `src/plugins/sugaragent/lore/lore-source.lock.json`

Beat-authoring boundary:

- Keep beat design/objectives/completion in scripted quest/episode data.
- Lore `beat_ids` are optional cross-reference tags for retrieval ranking only.
- You can omit `beat_ids` entirely if you do not need lore-to-beat hinting.

After ingesting, run lore-grounded sim:

```bash
npm run sugaragent:sim -- --npc librarian --provider local --ask "Who founded this town?"
```

Expected:

- Sim reports lore artifacts loaded.
- Response includes lore-grounded answer.
- Sim prints citation references to chunk IDs and source file/section with commit provenance (`@<commit>`).

Run interactive mode:

```bash
npm run sugaragent:sim -- --npc baker
```

Commands:

- `/exit` ends the interactive session.
- `--debug-structured` prints structured turn payload JSON.
- `--lore-dir <dir>` points sim to lore artifacts directory.
- `--no-lore` disables lore retrieval for a run.
- `--runtime <auto|mock|llama>` chooses local runtime mode for `--provider local`.
- `--llama-bin <path>` sets local llama executable path.
- `--model-path <path>` sets local model file path.
- `--llama-bin-arg <arg>` appends args before runtime flags (useful for wrapper commands).
- `--llama-arg <arg>` appends additional llama runtime args.
- `--llama-timeout-ms <ms>` sets generation timeout.
- `--session <id>` enables persistent sim memory under `.sugaragent-sim-sessions/<id>.json`.
- `--reset-session <id>` clears that session file first, then starts fresh (if `--session` is omitted, it is implied).
- `--scenario <id>` enables sim orchestration scenario (supported: `beat-guard-alert`).

Environment variables for runtime mode `auto` (optional override):

- `SUGARAGENT_LLAMA_BIN`
- `SUGARAGENT_MODEL_PATH`

## Memory Smoke (Phase 3 / ADR-003)

Run a persistent conversation session:

```bash
npm run sugaragent:sim -- --npc baker --provider local --session memory-smoke
```

The sim persists memory/facts and rolling history to:

- `.sugaragent-sim-sessions/memory-smoke.json`

This gives you a save/reload loop for phase-3 memory behavior while keeping engine-authored quest progression deterministic.
If local generation fails on a direct recall prompt (for example "what did i mention before?"), the shared dialogue fallback policy in `src/plugins/sugaragent/dialogue/fallback-policy.mjs` produces a deterministic memory-based recall reply instead of a generic error line.

## Dialogue Orchestration Smoke (Phase 4 / ADR-005)

Run the guard alert scenario:

```bash
npm run sugaragent:sim -- --scenario beat-guard-alert --npc guard --provider local --ask "What is happening at the gate?"
```

Expected:

- Sim prints `intent-executed=...` for legal intents.
- Sim prints `intent-rejected=...` for blocked intents with rejection reason.
- Sim prints `beat-evidence=...` summary each turn.
- If beat is still incomplete at max turn budget, sim prints `beat-fallback=...` and uses scripted fallback line.
