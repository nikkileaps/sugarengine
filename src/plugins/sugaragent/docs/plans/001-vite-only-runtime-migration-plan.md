# SugarAgent Vite-Only Runtime Migration Plan

## Goal
Remove authored Node ESM runtime/tooling paths (`*.mjs`) as the source of truth for SugarAgent core behavior, and move core functionality to TypeScript with a Vite-based build pipeline. Keep only minimal CLI shim wrappers in `.mjs`.

## Problem Statement
Current SugarAgent runtime behavior is split across direct Node ESM execution paths (for sim/eval/preview middleware) and TypeScript plugin code. This has led to architecture drift, duplicated logic, and hard-to-track regressions.

## Target State
1. Core SugarAgent runtime logic is authored in TypeScript.
2. `session/runtime.ts` is the runtime orchestrator.
3. Tool commands run compiled outputs from a Vite build step.
4. Preview and CLI paths execute the same runtime core.
5. CI/local guardrails prevent new non-shim SugarAgent logic from being added to authored `*.mjs`.

## Runtime Boundary Contract
`runtime.ts` concern is orchestration/lifecycle only:
- Accept turn input/context.
- Call specialized modules (routing, retrieval, grounding, memory, generation, policy).
- Compose final turn result/diagnostics.
- Persist/update session state.

Anything outside that boundary must be extracted into dedicated modules.

## Execution Model
Work proceeds in gated checkpoints. After each checkpoint:
1. Run targeted tests.
2. Run full build.
3. Stop and verify before continuing.

## Checkpoint 1: Vite Tools Build + Script Rewire
### Actions
1. Add dedicated Vite config for SugarAgent tools build (`vite.config.sugaragent-tools.ts`).
2. Add TypeScript tool entrypoints under `src/plugins/sugaragent/tools/`.
3. Update `package.json` sugaragent scripts to:
   - build tools first
   - run compiled output
4. Remove legacy `scripts/sugaragent-*.mjs` wrappers once Vite-built commands are verified.

### Acceptance Criteria
1. `npm run sugaragent:sim` works via compiled output.
2. `npm run sugaragent:lore:ingest` works via compiled output.
3. `npm run sugaragent:eval` works via compiled output.
4. No behavior regressions in existing sim/eval tests.

### Verification
- `npm run test -- src/plugins/sugaragent/sim/cli.test.ts`
- `npm run test -- src/plugins/sugaragent/eval/cli.test.ts`
- `npm run build`

## Checkpoint 2: Runtime Core TS Extraction (No Behavior Change)
### Actions
1. Create `src/plugins/sugaragent/session/runtime.ts` as the TypeScript runtime orchestrator.
2. Extract non-orchestration logic into focused TS modules:
   - `session/core/routing.ts`
   - `session/core/retrieval-text.ts`
   - `session/core/retrieval-governance.ts`
   - `session/core/initiative.ts`
   - `session/core/session-state.ts`
   - `session/core/turn-quality.ts`
3. Remove generated runtime adapters from session/core path; route all runtime imports to TypeScript source modules.
4. Keep all behavior unchanged during extraction.

### Acceptance Criteria
1. Existing tests still pass with no contract changes.
2. Runtime/session core behavior resolves from TypeScript modules only.
3. The retrieval/text-policy change that fixed resort query regression remains green.

### Verification
- `npm run test -- src/plugins/sugaragent/sim/cli.test.ts`
- `npm run test -- src/plugins/sugaragent/plugin.test.ts`
- `npm run build`

## Checkpoint 3: Preview Path Convergence
### Actions
1. Update Vite preview middleware/runtime loading to use TypeScript runtime core path directly.
2. Ensure preview, sim CLI, and eval use the same runtime implementation.

### Acceptance Criteria
1. Preview runtime behavior matches CLI/runtime behavior for retrieval and diagnostics.
2. No stale-path divergence between game-local and src-level runtime behavior.

### Verification
- `npm run test -- src/plugins/sugaragent/sim/cli.test.ts`
- `npm run build`
- Manual preview smoke: lore retrieval question in-game UI resolves with citations.

## Checkpoint 4: Remove Compatibility Shims + Guardrails
### Actions
1. Remove temporary generated runtime adapter files from plugin source.
2. Add a guard script to fail CI/local checks if non-shim SugarAgent logic is authored in `*.mjs`.
3. Keep only minimal operational CLI `.mjs` wrappers where strictly necessary; no domain logic.

### Acceptance Criteria
1. SugarAgent tools execute from compiled TypeScript outputs only.
2. Guardrail prevents regression to non-shim authored `.mjs` logic.

### Verification
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Non-Goals (This Plan)
1. No redesign of dialogue policy behavior.
2. No changes to gameplay authoring UX.
3. No changes to quest/beat contract semantics.

## Risks
1. Script/entrypoint breakage during rewiring.
2. Preview middleware import path mismatch.
3. Hidden coupling in runtime orchestration not covered by tests.

## Risk Controls
1. Remove legacy wrappers immediately after command parity is verified.
2. Move in small extraction slices with tests at each slice.
3. Add explicit regression tests for known failure prompts (resort query).

## Definition of Done
1. Core SugarAgent runtime behavior is authored in TypeScript modules.
2. No generated session/core `.runtime.mjs` artifacts remain in plugin source.
3. All SugarAgent tooling commands run compiled TS outputs through Vite build.
4. Test/build gates pass and preview behavior remains correct.

## Status Tracker
- [x] Checkpoint 1 complete
- [x] Checkpoint 2 complete
  - [x] Slice A: `session/core/routing.ts` extracted and runtime-adapted
  - [x] Slice B: `session/core/retrieval-text.ts` extracted and runtime-adapted
  - [x] Slice C: `session/core/retrieval-governance.ts` extracted and runtime-adapted
  - [x] Slice D: `session/core/initiative.ts`
  - [x] Slice E: `session/core/session-state.ts`
  - [x] Slice F: `session/core/turn-quality.ts`
  - [x] Slice G: `session/runtime.ts` orchestrator + session/core runtime adapter removal
- [x] Checkpoint 3 complete
- [x] Checkpoint 4 complete

Manual verification note:
- Preview smoke test remains a human-in-the-loop check in the game preview UI.
- Session runtime now resolves directly from TypeScript source (`session/runtime.ts` + `session/core/*.ts`); generated `session/*.runtime.mjs` artifacts were removed.
- SugarAgent `.mjs` files are CLI shim wrappers only.
- Legacy `scripts/sugaragent-*.mjs` wrappers were removed from the repo.
