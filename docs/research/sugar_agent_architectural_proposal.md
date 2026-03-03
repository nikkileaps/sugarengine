# SugarAgent Architecture Proposal v2

## 1) Purpose

This document defines how `sugaragent` should be built as a **fully optional plugin** for SugarEngine while still delivering **LLM-driven NPC dialogue**.

The core requirement is:

- Scripted games (quest + authored dialogue) must continue unchanged.
- Agentic games can opt in per game (and later per NPC).
- Authored episodes/quests/story beats remain canonical; SugarAgent delivers beats in free-form dialogue.
- No dependency on external cloud APIs; local inference only.
- Must ship for both desktop and mobile app targets.

## 2) Hard Constraints

1. `sugaragent` must be removable without breaking SugarEngine.
2. No direct world mutation from model output.
3. Canonical gameplay state remains engine-owned.
4. LLM dialogue is required (no template-only fallback as the primary mode).
5. Local-first execution: no required outbound network dependency.
6. Existing scripted game remains default behavior.
7. Same SugarAgent plugin behavior contract across desktop and mobile platforms.
8. Quest/episode progression remains engine-authored and deterministically validated.

## 3) Architecture Decision Summary

1. Build `sugaragent` under `src/plugins/sugaragent` as an isolated plugin package.
2. Use the new engine plugin system (`GameConfig.plugins`) as the only integration path.
3. Define a provider abstraction and ship a `LocalLLMProvider` default.
4. Keep lore, memory, and relationship stores local and plugin-scoped.
5. Keep action execution deterministic through plugin intent gates in `Game`.
6. Add a CLI simulation harness early so Nikki can test every phase with direct conversation.
7. Introduce engine-owned story-beat contracts that SugarAgent must satisfy via structured turn evidence.

## 4) Ownership Boundaries

### Engine (authoritative)

- ECS update loop, rendering, movement, physics
- Quests, inventory, flags, save slots
- Episode/quest step graph and story-beat completion rules
- Validation and execution of legal actions/intents
- Plugin lifecycle and plugin state persistence envelope

### SugarAgent Plugin

- NPC cognition, dialogue orchestration, memory, planning
- Lore retrieval and citation selection
- Beat delivery planning from engine-provided beat contracts
- Beat evidence reporting for deterministic engine-side validation
- Proposed intents only (no direct canonical writes)

### Local AI Runtime

- Token generation and embeddings via local model runtime
- No mandatory cloud dependency

## 5) Proposed Layout

```text
src/
  engine/
    plugins/                         # already implemented plugin host
  plugins/
    sugaragent/
      index.ts
      plugin.ts                      # EnginePlugin implementation
      contracts/
      runtime/
      memory/
      lore/
      providers/
        llm/
        embeddings/
      sim/                           # CLI harness
      docs/
        adr/
```

This keeps SugarAgent isolated from engine internals except for plugin APIs.

## 6) Local LLM Strategy (No External API Dependencies)

### 6.1 Provider Interface

SugarAgent defines:

- `LLMProvider.generateStructured(...)`
- `EmbeddingProvider.embed(...)`

### 6.2 Default Runtime Options

- Desktop app: bundled local runtime adapter (native binary/sidecar).
- iOS/iPadOS app: compiled-in native runtime + bundled model assets.
- Android app: NDK-compiled runtime + bundled model assets.
- Dev machine: local runtime adapter used by CLI harness.

### 6.3 Runtime Bridge (Cross-Platform)

SugarAgent provider layer must call a single runtime contract:

- `health()`
- `loadModel(modelId)`
- `generateStructured(request)`
- `embed(texts[])`
- `unloadModel(modelId)`

Platform adapters implement this contract without changing SugarAgent core logic.

### 6.4 Enforcement

- Default config blocks network egress for provider paths.
- Provider config should require explicit opt-in for any remote URL.
- CI tests should fail if remote provider is configured in default profiles.

## 7) Runtime Interaction Flow

When player interacts with NPC:

1. Engine resolves active authored context:
   - quest-specific scripted line chain
   - active story-beat contract (if current step requires agent delivery)
   - behavior tree state
2. If scripted chain does not fully resolve turn, plugin receives interaction request.
3. SugarAgent gathers context:
   - world/event facts from plugin event stream
   - relationship state
   - salient memories
   - lore snippets
   - active beat contract constraints
4. Local LLM returns strict JSON payload:
   - `utterance`, `emotion`, `intent`, `proposedIntents[]`, `citations[]`, `beatEvidence`
5. SugarAgent asks engine to execute allowed intents via plugin action gate.
6. Engine evaluates `beatEvidence` against authored completion rules.
7. Plugin records new memory/relationship deltas.

### 7.1 Authored Story-Beat Contract Model

Story beats are authored in the existing quest/episode layer and passed to SugarAgent as constraints.

```ts
interface AgentBeatContract {
  beatId: string;
  objective: string;
  requiredFacts: string[];
  forbiddenFacts?: string[];
  completionRule: "player_ack" | "player_action" | "engine_flag";
  completionTarget?: string;
  maxTurns?: number;
  fallbackScriptId?: string;
}
```

Notes:

- Engine owns contract definitions and progression state.
- SugarAgent does not mark beats complete directly; it returns evidence.
- Engine can fall back to scripted dialogue if beat delivery confidence is low or turns are exhausted.

## 8) Phased Implementation Plan + MVP Test at End of Each Phase

A single testing interface is introduced early and extended over time:

- `npm run sugaragent:sim -- <args>` (CLI conversation harness)

### Phase 0: Skeleton + Isolation + Harness

#### Build

- Create plugin skeleton under `src/plugins/sugaragent`.
- Register plugin only when explicitly passed in `GameConfig.plugins`.
- Add basic CLI harness with mock NPC and echo provider.

#### Nikki MVP test

```bash
npm run sugaragent:sim -- --npc baker
```

Type messages; verify:

- Plugin loads and responds in CLI.
- Running game without plugin shows unchanged scripted behavior.

#### Exit criteria

- Plugin can be added/removed with one config change.
- No plugin => zero behavior regressions.

---

### Phase 1: Local LLM Provider + Structured Output

#### Build

- Implement `LLMProvider` interface and `LocalLLMProvider`.
- Enforce schema validation for model responses.
- Add provider health check and deterministic error fallback.
- Add runtime bridge adapters for desktop + iOS/iPadOS + Android targets.

#### Nikki MVP test

```bash
npm run sugaragent:sim -- --npc baker --provider local
```

Verify:

- NPC response is LLM-generated (not template echo).
- Output includes valid structured metadata.
- Invalid JSON from model is caught and retried/fallbacked.
- Same provider contract works across desktop/mobile adapters.

#### Exit criteria

- Structured output validator is mandatory.
- No external API needed for dialogue generation.

---

### Phase 2: Lore Ingestion + Retrieval + Citations

#### Build

- Lore ingestion pipeline for markdown/wiki docs.
- Local chunk store + metadata filters.
- Retrieval API returning snippets with citation refs.

#### Nikki MVP test

```bash
npm run sugaragent:sim -- --npc librarian --ask "Who founded this town?"
```

Verify:

- Response cites local lore sources.
- Retrieval respects metadata scope.

#### Exit criteria

- Lore claims in dialogue can be traced to citations.

---

### Phase 3: Memory + Relationship Persistence

#### Build

- Episodic memory store and relationship model.
- Salience scoring for what gets written.
- Save/load integration under `save.plugins.sugaragent`.

#### Nikki MVP test

1. Run sim, tell NPC a personal fact.
2. Save session.
3. Reload and ask callback question.

```bash
npm run sugaragent:sim -- --npc baker --session test1
```

Verify:

- NPC remembers salient prior fact after reload.
- Memory is isolated to plugin state.

#### Exit criteria

- Plugin memory survives save/load.
- Core save system remains backward compatible.

---

### Phase 4: Intent Gating + Beat Contract Enforcement

#### Build

- Map `proposedIntents` to engine plugin intents.
- Validate legality before execution.
- Log accepted/rejected intents.
- Add beat contract evaluator that validates `beatEvidence` and advances authored quest step only on rule match.

#### Nikki MVP test

```bash
npm run sugaragent:sim -- --npc guard --ask "Can you walk to the gate and set flag guard_alert?"
```

Verify:

- Legal intents execute.
- Illegal intents are rejected safely.
- No direct canonical writes from model payload.
- Beat does not complete unless engine completion rule is satisfied.

#### Exit criteria

- All side effects go through engine intent gate.
- All agent-driven beat progression is validated by authored deterministic rules.

---

### Phase 5: In-Game Integration (Single NPC Slice)

#### Build

- Connect SugarAgent plugin to runtime preview game.
- Enable for selected NPC IDs only.
- Keep scripted chain precedence unchanged.
- Support one authored quest beat delivered via agent conversation.

#### Nikki MVP test

1. Start preview.
2. Talk to agent-enabled NPC in-world.
3. Talk to scripted NPC.
4. Repeat on one desktop build and one mobile build.

Verify:

- Agent NPC uses free-text LLM conversation.
- Scripted NPC remains authored quest/dialogue behavior.
- Behavior contract is equivalent across desktop/mobile.
- One authored beat can be conveyed in free-form and advances quest only after rule-compliant evidence.

#### Exit criteria

- Mixed-mode game works without scripted regressions.

---

### Phase 6: Background Planning + Distance Cadence

#### Build

- Near/mid/far cognition cadence.
- Low-frequency planner for off-screen NPC continuity.
- Performance budgets per tick.

#### Nikki MVP test

```bash
npm run sugaragent:sim -- --scenario crowd-town --ticks 300
```

Verify:

- Latency and tick budgets stay within target.
- NPC continuity remains coherent across distance tiers.

#### Exit criteria

- Stable behavior under load with deterministic guardrails.

---

### Phase 7: Authoring Hooks (Optional)

#### Build

- Optional NPC fields for agent persona/knowledge scopes.
- Optional quest/episode beat contract fields for agent-delivered beats.
- Publish pipeline writes agent artifacts only when plugin used.

#### Nikki MVP test

- Create two NPCs with distinct persona profiles.
- Compare response tone and knowledge boundaries in preview.
- Author one quest beat with completion rule and verify editor/publish/runtime round trip.

#### Exit criteria

- Authoring fields remain optional and non-breaking.
- Existing scripted quest data remains valid when beat contract fields are absent.

---

### Phase 8: Evaluation + Hardening

#### Build

- Add regression eval suites (lore faithfulness, memory recall, safety).
- Add transcript capture and replay.
- Define release gates for plugin readiness.

#### Nikki MVP test

```bash
npm run sugaragent:eval -- --suite smoke
```

Verify:

- Report shows pass/fail by metric with artifact links.

#### Exit criteria

- Repeatable quality gates before shipping.

## 9) Suggested KPI Targets (Initial)

- First token latency (local): <= 1.5s median (dev target)
- Turn completion: <= 6s median for short replies
- Lore citation hit rate: >= 80% on lore questions
- Memory recall success: >= 70% on salient facts
- Illegal intent leak: 0 tolerated
- Authored beat completion precision: >= 95% on replayed beat-contract scenarios

## 10) Risks and Mitigations

1. Local inference performance too slow
- Mitigation: smaller local model tiers, KV caching, async staged replies.

2. Lore drift/hallucination
- Mitigation: retrieval constraints, citation requirements, contradiction checks.

3. Save bloat from memory
- Mitigation: salience thresholds, summarization, memory compaction jobs.

4. Plugin coupling creep
- Mitigation: enforce plugin API boundary, no direct imports of engine internals beyond public plugin contracts.

5. Cross-platform runtime drift
- Mitigation: single runtime bridge contract + adapter conformance tests per target.

6. Beat delivery fails to convey authored narrative intent
- Mitigation: beat-contract eval suites, fallback scripted lines, and stricter completion-rule validators.

## 11) What “Done” Looks Like

- SugarAgent is enabled by config, not by engine default.
- Removing plugin from `GameConfig.plugins` restores fully scripted behavior.
- Nikki can run the same conversation scenario in CLI and in-world.
- All dialogue generation can run locally without external API dependencies.
- Nikki can author a quest beat once and have it conveyed by agent dialogue with deterministic quest progression.
