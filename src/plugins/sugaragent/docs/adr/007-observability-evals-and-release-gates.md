# ADR-SA-007: Observability, Evaluations, and Release Gates

## Status

Accepted

## Context

LLM systems need measurable quality/safety checks before release.

## Decision

1. Add transcript capture and replay.
2. Add evaluation suites:
   - lore faithfulness
   - memory recall
   - intent safety
   - authored beat coverage accuracy
   - beat completion precision/recall (false complete vs missed complete)
   - latency/performance
3. Define release gates with pass thresholds.

## Consequences

Positive:

- Repeatable quality checks.
- Better debugging and regression detection.
- Protects authored narrative progression from silent drift.

Tradeoff:

- Ongoing maintenance of eval datasets.
- Requires curated beat-contract test corpora and replay fixtures.

## MVP Test (End of Phase 8)

```bash
npm run sugaragent:eval -- --suite smoke
```

Expected:

- Report with pass/fail by metric.
- Artifacts for failed cases (transcript + reason).
- Beat-evaluation section shows where contracts were or were not satisfied.

## Implementation Notes

Current implementation in this repo delivers:

1. Plugin-owned eval runner:
   - `src/plugins/sugaragent/eval/runner.ts` (source of truth)
2. Public command integration:
   - `SugarAgent.execute({ command: "eval", ... })`
   - `npm run sugaragent:eval -- --suite smoke`
3. Transcript capture:
   - Per-case transcripts written to `<runDir>/transcripts/*.json`
   - Failed-case artifacts written to `<runDir>/failed/*.json`
4. Replay:
   - `npm run sugaragent:eval -- --replay <path/to/transcript.json>`
   - Produces replay artifact JSON under replay output directory.
5. Smoke suite metrics + release gates:
   - lore faithfulness
   - memory recall persistence
   - intent safety
   - authored beat coverage accuracy
   - beat completion precision/recall
   - latency/performance
6. Report sections include:
   - per-metric pass/fail and thresholds
   - release gate pass/fail list
   - beat-evaluation section (`coverage`, `completion`)
