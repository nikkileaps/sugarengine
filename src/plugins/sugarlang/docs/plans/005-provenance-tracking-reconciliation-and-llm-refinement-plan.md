# Plan 005: Provenance Tracking, Reconciliation, and LLM Refinement

Implements [ADR-SL-015: Provenance Tracking, Reconciliation, and LLM Refinement Architecture](../adr/015-provenance-tracking-reconciliation-and-llm-refinement-architecture.md).

## Phase 1: Provenance Fields and Source Hashing

**Goal:** Every turn knows where it came from and whether a human has touched it.

### Tasks

1. Add `sourceHash`, `editStatus`, and `generationNote` fields to the turn type in `types.ts` (`SceneBandTurn` or equivalent).
   - `sourceHash: string` — 12-char hex hash of source content
   - `editStatus: 'generated' | 'reviewed' | 'manual'` — default `'generated'`
   - `generationNote?: string`

2. Build a `computeSourceHash(sourceText, speakerId, speakerName, choiceLabels, questNodeId, bandId, targetLanguage)` utility. SHA-256 truncated to 12 hex chars. Pure function, no side effects.

3. Update `syncInteractionsFromQuest` (or the downstream turn generation step) to compute and store `sourceHash` on each generated turn.

4. Update artifact serialization/deserialization in `artifacts.ts` to persist the three provenance fields in scene language pack JSON.

5. Migration: existing turns without provenance fields default to `editStatus: 'generated'` and `sourceHash: ''` (empty = never hashed, treated as always-stale on first sync).

### Acceptance

- Generated turns have a non-empty `sourceHash` and `editStatus: 'generated'`.
- Provenance fields round-trip through serialize → save → load → deserialize.
- Existing artifacts load without errors (missing fields default gracefully).

## Phase 2: Sync Respects Edit Status

**Goal:** Sync From Quest never silently overwrites manual or reviewed turns.

### Tasks

1. Before generating a turn, look up the existing turn by turn ID (or interaction ID + band + sequence).

2. Compare the existing turn's `sourceHash` against the freshly computed hash.

3. Apply the sync behavior table:

   | `editStatus` | Hash matches | Hash changed |
   |---|---|---|
   | `generated` | Skip | Regenerate, update hash |
   | `reviewed` | Skip | Set `stale: true`, do not overwrite |
   | `manual` | Skip | Set `stale: true`, do not overwrite |

4. Add a `stale?: boolean` field to turns (or derive it from `sourceHash` mismatch at read time — implementation choice, but explicit field is simpler for the editor to consume).

5. For deleted quest nodes: mark existing turns as `orphaned: true`.

6. For new quest nodes: generate all turns fresh with `editStatus: 'generated'`.

7. After sync, return a summary: `{ regenerated: number, flaggedStale: number, flaggedOrphaned: number, skipped: number }`.

### Acceptance

- Editing a dialogue node's text and re-syncing regenerates `generated` turns but flags `manual`/`reviewed` turns as stale.
- Adding a new quest node generates new turns without disturbing existing ones.
- Deleting a quest node flags its turns as orphaned.

## Phase 3: Editor Indicators and Reconciliation UI

**Goal:** Authors can see turn provenance at a glance and resolve stale conflicts.

### Tasks

1. Add colored dot indicators to the turn list in the Languages tab:
   - Green: `generated`, current
   - Blue: `reviewed`, current
   - Purple: `manual`, current
   - Yellow: `reviewed`, stale
   - Orange: `manual`, stale
   - Gray: orphaned

2. Add summary badges to band selector pills and scene pack headers showing counts of stale/orphaned turns.

3. Remove the "+ Add Turn" button from the Languages tab.

4. Add "Reset to Generated" action per turn. This re-derives the turn from the current source, sets `editStatus` to `generated`, and updates `sourceHash`.

5. When the author edits any substantive field (target text, delivery text, focus vocabulary, response mode), auto-set `editStatus` to `manual`.

6. Build the reconciliation panel (accessible from a "N turns need attention" notification after sync):
   - For each stale turn, show:
     - Source diff (old English text → new English text)
     - Current version (the manual/reviewed content)
     - Suggested version (freshly generated from new source)
   - Three actions per turn: **Keep Mine**, **Accept New**, **Edit**
   - Bulk actions: "Keep All Mine", "Accept All New"

7. After reconciliation, clear staleness flags on resolved turns.

### Acceptance

- Colored dots render correctly for all six states.
- "+ Add Turn" button is gone.
- Editing a turn's target text sets it to `manual`.
- After sync with stale turns, reconciliation panel appears and resolves correctly.
- "Reset to Generated" re-derives and clears manual status.

## Phase 4: LLM Refinement Integration

**Goal:** Authors can invoke LLM refinement to improve surface-language quality, especially at B3-B4.

### Tasks

1. Build the refinement packet assembler: given a scenario, band, target language, and optional target turn, assemble the whole-scenario context packet per ADR-015 section 7.

2. Define the LLM refinement response schema:
   ```
   { proposedTargetText: string, proposedDeliveryText?: string, note?: string }
   ```

3. Wire to the AI invocation strategy from ADR-011:
   - Mode A (V1): Write the refinement packet to a file, external assistant reads it and writes a proposal file, editor imports the proposal.
   - Mode B (future): MCP tool bridge exposes `refine_turn` operation.
   - Mode C (future): Integrated editor action calls provider adapter directly.

4. Add "Refine with AI" button per turn in the Languages tab. Clicking it:
   - Assembles the packet
   - Invokes the configured AI mode
   - Shows the proposal in a preview/diff view
   - Author accepts (→ `reviewed`), edits (→ `manual`), or rejects

5. Add "Refine Band" action (per band) and "Refine Scenario" action (all bands). These batch-refine all `generated` turns, presenting results for review.

6. Turns with `editStatus: 'manual'` are excluded from batch refinement unless explicitly opted in.

### Acceptance

- Per-turn refinement packet correctly includes full scenario context.
- Proposal preview shows diff between current and proposed text.
- Accepting a proposal sets `editStatus` to `reviewed` and updates content.
- Batch refinement skips `manual` turns by default.

## Phase 5: Polish and Workflow Tuning

**Goal:** Smooth out the authoring experience based on real usage.

### Tasks

1. ~~Tune reconciliation UX: keyboard shortcuts, tab-through stale turns, inline editing.~~ (Done — inline editing shipped with the reconciliation modal; keyboard shortcuts and tab-through not needed.)

2. ~~Add bulk actions: "Approve all stale" (dismiss staleness, keep content), "Re-refine all reviewed" (send reviewed turns back through LLM).~~ (Not needed — reconciliation modal already has Keep All Mine / Accept All New bulk buttons.)

3. ~~Add undo support for reconciliation decisions (at minimum, undo last "Accept New").~~ (Not needed — changes aren't persisted until explicit save.)

4. Add a scenario-level provenance summary view: pie chart or bar showing generated/reviewed/manual/stale distribution across bands.

5. ~~Performance: if a scenario has many turns (100+), ensure the reconciliation panel virtualizes the list.~~ (Premature — revisit if scale demands it.)

6. ~~Optional: "Auto-refine on sync" setting — after sync generates new turns, automatically queue them for LLM refinement. Off by default.~~ (Premature — revisit if LLM refinement workflow matures.)

### Acceptance

- Bulk actions work correctly across all turn states.
- Undo reverses the last reconciliation action.
- Large scenarios don't lag in the reconciliation panel.
