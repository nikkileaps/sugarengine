# ADR-SA-006: Simulation Cadence and Background Planning

## Status

Accepted

## Context

Continuous high-frequency cognition for all NPCs is expensive and unnecessary.

## Decision

1. Use tiered cognition cadence:
   - Near: full dialogue/planning cadence
   - Mid: summarized updates
   - Far: schedule/probabilistic simulation
2. Integrate updates through plugin system/ECS tick semantics.
3. Add budget controls for max NPC updates per frame.
4. Prioritize NPCs with active authored beat contracts when allocating near-tier budgets.
5. Do not auto-complete authored beats from far-tier simulation; beat completion requires live deterministic engine checks.

## Consequences

Positive:

- Scales to larger NPC populations.
- Keeps interaction quality high near player.
- Protects authored narrative reliability while scaling.

Tradeoff:

- More state bookkeeping between tiers.
- Additional scheduler complexity for beat-priority queues.

## MVP Test (End of Phase 6)

```bash
npm run sugaragent:sim -- --scenario crowd-town --ticks 300
```

Expected:

- Stable tick time under configured budget.
- Coherent NPC continuity when moving between tiers.
- Active beat NPC remains responsive when player is nearby.
- No off-screen beat auto-completions occur.

## Implementation Notes

Current implementation in this repo delivers:

1. Plugin-owned cadence simulation core:
   - `src/plugins/sugaragent/simulation/cadence.ts` (source of truth)
   - `src/plugins/sugaragent/simulation/cadence.runtime.mjs` (generated runtime adapter)
2. Tiered cadence behavior:
   - Near/mid/far tier assignment by simulated distance.
   - Per-tier update cadence and continuity tracking.
   - Deterministic per-tick budget cap (`maxNpcUpdatesPerTick`).
3. Active beat prioritization:
   - Active beat NPC receives highest priority in near tier.
   - Responsiveness metrics are emitted in simulation report.
4. Guardrail enforcement:
   - Far-tier planner never auto-completes beat contracts (`farAutoCompletions=0`).
5. Shared session facade integration:
   - `createSugarAgentSession({ scenario: "crowd-town", tickBudget })`
   - `session.runTicks(<n>)` executes cadence simulation through the same public command/session path used by CLI.
6. CLI MVP path:
   - `npm run sugaragent:sim -- --scenario crowd-town --ticks 300`
   - Optional budget override: `--tick-budget <positive-int>`
