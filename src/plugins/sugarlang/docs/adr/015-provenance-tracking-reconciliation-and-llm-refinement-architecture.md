# ADR-SL-015: Provenance Tracking, Reconciliation, and LLM Refinement Architecture

## Status

Proposed

## Context

ADR-014 established a deterministic derive pipeline that walks the quest graph and generates banded interaction bundles. Section 7 of that ADR introduced `generationSource: 'derived' | 'polished' | 'manual'` and stated that re-sync only overwrites `derived` turns while preserving `polished` and `manual` turns.

That was a correct first sketch. But it does not address several real authoring scenarios:

1. The author edits a dialogue node's text after manually refining the Italian B2 overlay. The source has changed under the manual edit. What happens on the next sync?

2. The author adds a new quest node that inserts a new interaction between two existing ones. The turns before and after are manual. How does the new interaction get generated without disturbing the manual neighbors?

3. An LLM refines a B3 turn to fix awkward word order. Later the author changes the source dialogue slightly (fixing a typo, adjusting tone). Should the LLM refinement be thrown away? Flagged for re-review? Silently kept even though the source moved?

4. The author wants to see, at a glance, which turns are freshly generated, which have been LLM-polished, which are hand-edited, and which are stale because the source changed.

5. At higher bands (B3-B4), programmatic substitution produces structurally correct but unnatural target-language prose. The LLM needs enough context to produce natural translations — not just the single turn in isolation but the full scenario, the conversation flow, the vocabulary plan, and the band policy.

These are all instances of the same fundamental problem: **derived-but-editable artifacts with upstream source changes**.

This is a well-studied problem in professional localization (Crowdin, memoQ, SDL Trados), version control (Git three-way merge), and component-override systems (Figma). This ADR adapts those solutions to Sugarlang's specific domain.

## Decision

Sugarlang will implement per-turn provenance tracking with source hashing, a three-state edit model, a structured reconciliation workflow for source-change conflicts, and a whole-scenario LLM refinement layer.

### 1. Per-Turn Provenance Fields

Each turn in a `SceneLanguagePack` band entry gains three provenance fields:

```
sourceHash:      string    — hash of the source content that produced this turn
editStatus:      string    — 'generated' | 'reviewed' | 'manual'
generationNote:  string?   — optional author/LLM note explaining the edit
```

These fields are per-turn, not per-interaction or per-band. This is a direct consequence of the granularity decision: if the author edits the B2 Italian turn but not the B0 Italian turn for the same interaction, and the source changes, B0 should silently regenerate while B2 should show a conflict. Per-turn tracking is the only granularity that supports this.

`generationSource` from ADR-014 is superseded by `editStatus`. The values map as:

| ADR-014 `generationSource` | ADR-015 `editStatus` |
|---|---|
| `derived` | `generated` |
| `polished` | `reviewed` |
| `manual` | `manual` |

The rename is intentional. `editStatus` describes the author's relationship to the turn, not just how it was first produced. A turn that was LLM-polished and then approved by the author is `reviewed`. A turn the author has directly changed is `manual`. The distinction matters for reconciliation behavior.

### 2. Source Hash Construction

The `sourceHash` captures the upstream content that was used to generate a turn. When the upstream content changes, the hash misses, and the turn is flagged as stale.

The hash is computed from:

- the source dialogue node text (the English-language canonical line)
- the speaker ID and speaker name
- the dialogue node's outgoing choice labels (if any)
- the quest node ID (structural anchor)
- the band ID (because the same source produces different output per band)
- the target language

The hash does not include:

- vocabulary role assignments (those are derived from the lexicon, not the source)
- band policy settings (policy changes should not invalidate manual edits)
- the rendered target-language text itself (that is the output, not the input)

Hash algorithm: SHA-256 truncated to 12 hex characters. This is not a security hash — it is a change-detection fingerprint.

### 3. Three-State Edit Model

Each turn is in one of three states:

**`generated`** — produced by Sync From Quest or the deterministic pipeline. The author has not inspected or modified it. This is the default state for all newly generated turns.

**`reviewed`** — the author (or the author accepting an LLM suggestion) has looked at this turn and confirmed it is acceptable. The content may be identical to what was generated, or the LLM may have refined it — the point is that a human has approved it.

**`manual`** — the author has directly edited the turn content (target text, delivery text, focus vocabulary, response mode, or any substantive field). This is the strongest protection level.

State transitions:

```
generated  →  reviewed    (author clicks "approve" or accepts LLM suggestion)
generated  →  manual      (author edits any substantive field)
reviewed   →  manual      (author edits after previously approving)
manual     →  generated   (author clicks "reset to generated" — explicit destructive action)
reviewed   →  generated   (author clicks "reset to generated" — explicit destructive action)
```

There is no transition from `manual` to `reviewed` without going through `generated` first. If you want to re-derive and then review, you reset, regenerate, then review.

### 4. Sync Behavior by State and Source Change

When Sync From Quest runs, it recomputes the source hash for each interaction and compares it against each existing turn's stored `sourceHash`.

| Turn `editStatus` | Source hash matches | Source hash changed |
|---|---|---|
| `generated` | Skip (already current) | Silently regenerate, update hash |
| `reviewed` | Skip (approved, source unchanged) | Flag as **stale-reviewed** (yellow indicator), do not overwrite |
| `manual` | Skip (manual, source unchanged) | Flag as **stale-manual** (orange indicator), do not overwrite |

**Stale** means "the source content that this turn was based on has changed." The turn itself is not modified — only its staleness flag is set. The author must explicitly resolve stale turns.

For new interactions (quest nodes that didn't exist before), all turns are generated fresh with `editStatus: 'generated'`.

For removed interactions (quest nodes that were deleted), the turns are flagged as **orphaned**. The author can delete them or keep them (in case the node deletion was accidental).

### 5. Reconciliation Workflow

When stale turns exist after a sync, the editor shows a notification:

> **3 turns need attention** — source dialogue changed since your last edit.

The reconciliation panel shows each stale turn with:

1. **Source diff** — what changed in the upstream dialogue (old text → new text)
2. **Current version** — the author's manual or reviewed content
3. **Suggested version** — what the deterministic pipeline (or LLM, if available) would generate from the new source
4. **Three actions:**
   - **Keep Mine** — dismiss the staleness flag, keep the manual content, update the source hash to current. The turn stays `manual`.
   - **Accept New** — replace the turn content with the suggested version, set `editStatus` to `generated`, update source hash.
   - **Edit** — open the turn editor pre-populated with the suggested version. When the author saves, set `editStatus` to `manual`, update source hash.

If the author does nothing, stale turns remain flagged. They do not block preview or gameplay — they are informational. The game runs fine with stale turns; the flag is an authoring-quality signal, not a runtime gate.

### 6. Staleness Indicators in the Editor

The Languages tab and turn list should show visual indicators:

- **Green dot** — `generated`, hash matches. Fresh and current.
- **Blue dot** — `reviewed`, hash matches. Human-approved and current.
- **Purple dot** — `manual`, hash matches. Hand-edited and current.
- **Yellow dot** — `reviewed` but stale. Source changed since review.
- **Orange dot** — `manual` but stale. Source changed since manual edit.
- **Gray dot** — orphaned. Source quest node no longer exists.

These indicators appear next to each turn in the turn list and as summary badges on the band selector and scene pack headers.

### 7. LLM Refinement Layer

#### Design Principle

The programmatic pipeline is the fast, free, deterministic baseline. The LLM is a refinement layer that improves surface quality. The LLM never owns structure — it improves language within the structure the pipeline created.

#### Context Strategy: Whole-Scenario

The LLM receives the full scenario context when refining any turn. This produces better results than turn-in-isolation because:

- Vocabulary consistency across turns (the LLM sees which words are focus vs ambient and maintains that distinction)
- Conversational coherence (the greeting sets up the ask, the ask sets up the response — the LLM understands the flow)
- Band-appropriate register (the LLM sees the band policy and adjusts formality, complexity, and scaffold density)
- Cross-turn pronoun and article agreement (Spanish and Italian gender agreement depends on what was said earlier)

The refinement packet sent to the LLM contains:

```
scenarioContext:
  scenarioId, npcNames, activeReferents

bandContext:
  bandId, mixingLevel, supportLanguagePolicy, responsePosture

vocabularyPlan:
  focus entries with targetForm, gloss, category
  reinforcement entries
  ambient entries

conversationFlow:
  ordered list of all turns in this band for this scenario, each with:
    turnId, turnRole, sourceEnglishText, currentRenderedText, editStatus

targetTurn:
  the specific turn being refined

instruction:
  "Improve the target-language rendering of the target turn. Preserve the
   meaning of the source English text. Use only vocabulary from the vocabulary
   plan for focus and reinforcement words. Maintain the mixing level appropriate
   for this band. Do not add vocabulary not in the plan. Do not change the turn
   structure or role. Return only the improved targetText and an optional note
   explaining what you changed."
```

The response is a structured proposal:

```
proposedTargetText: string
proposedDeliveryText: string?
note: string?
```

The proposal is presented in the editor for the author to accept, edit, or reject. Accepting sets `editStatus` to `reviewed`.

#### Invocation Modes

Consistent with ADR-011, the LLM refinement can be invoked in three ways:

1. **Per-turn** — "Refine this turn" button on an individual turn. The LLM refines one turn with full scenario context.

2. **Per-band** — "Refine all B3 turns" action. The LLM refines all `generated` turns for a specific band in sequence, each seeing the full scenario context including previously refined turns in the same pass.

3. **Per-scenario** — "Refine scenario" action. The LLM refines all `generated` turns across all bands, working from B0 upward. This is the most expensive but produces the most coherent result.

In all modes, turns with `editStatus: 'manual'` are never sent for LLM refinement unless the author explicitly requests it. Turns with `editStatus: 'reviewed'` are skipped by default but can be included with a "re-refine reviewed turns" option.

#### Band-Specific LLM Strategy

- **B0-B1**: LLM refinement is optional and rarely needed. Programmatic output at these bands is simple (mostly English with a few target-language focus words swapped in). The LLM could adjust article agreement or fix minor awkwardness, but the ROI is low.

- **B2**: LLM refinement becomes useful. The mixed-language sentences can read awkwardly when programmatic substitution doesn't handle word order. The LLM fixes word order, article agreement, and produces more natural blended sentences.

- **B3**: LLM refinement is expected. At this band, most content words are in the target language with function-word substitution. The programmatic output often has wrong word order, missing conjugations, and unnatural phrasing. The LLM rewrites the surface language while preserving vocabulary choices.

- **B4**: LLM refinement is strongly recommended. This band is near-full target language. Programmatic substitution cannot produce natural prose at this level. The LLM essentially translates the line, constrained by the vocabulary plan and the communicative intent of the source.

#### Cost and Caching

LLM refinement results are persisted in the turn's `targetText` and `initialDelivery` fields. The `editStatus` is set to `reviewed` and the `sourceHash` is set to the current source hash. This means:

- The LLM is called once per refinement action, not on every preview.
- The result is cached as the turn content itself.
- Re-refinement only happens when the author explicitly requests it or when the source changes and the author chooses "Accept New" in reconciliation.

There is no background polling, no automatic re-refinement, and no hidden LLM calls.

### 8. The "Add Turn" Question

With provenance tracking in place, the Languages tab turn editor should:

- **Remove the "+ Add Turn" button.** Turn structure comes from the quest graph via Sync From Quest. Manually adding turns creates orphans that the sync cannot track.

- **Keep turn content editing.** The author can edit target text, delivery text, focus vocabulary, response mode, and other content fields. Editing any substantive field sets `editStatus` to `manual`.

- **Add "Reset to Generated" per turn.** This re-derives the turn from the current source, setting `editStatus` back to `generated`. This is the escape hatch when a manual edit goes wrong.

- **Add "Refine with AI" per turn.** This invokes the LLM refinement layer for the selected turn.

- **Show provenance indicators.** Each turn shows its `editStatus` as a colored dot and its staleness state.

### 9. Interaction with Existing Systems

#### Sync From Quest

The existing `syncInteractionsFromQuest` function derives `DerivedInteraction` objects from the quest graph. This function does not change. What changes is the downstream: when `DerivedInteraction` objects are used to generate or update `SceneLanguagePack` turns, the generation step now:

1. Computes the source hash for each turn
2. Checks the existing turn's `editStatus` and stored `sourceHash`
3. Applies the sync behavior table from section 4

#### Artifact Serialization

The provenance fields (`sourceHash`, `editStatus`, `generationNote`) are serialized into the scene language pack JSON artifacts. They are small strings and do not meaningfully increase artifact size.

#### Preview and Runtime

The runtime ignores provenance fields entirely. It reads `targetText`, `initialDelivery`, `responseMode`, and other content fields. Provenance is an authoring-time concept only.

#### Validation

The validator should report:

- Stale turns as warnings (not errors). Stale turns are playable; they are just potentially out of date.
- Orphaned turns as warnings. The author may want to clean them up.
- Turns with `editStatus: 'generated'` and empty `targetText` as errors. That indicates a generation failure.

## Analogies and Prior Art

### Professional Localization Tools

Crowdin, memoQ, and SDL Trados solve the same fundamental problem: translated segments that need updating when source text changes.

Their solution is the **fuzzy match** model:

- Each translated segment stores the source text it was translated from.
- When the source changes, the old translation is not deleted. It is flagged as "fuzzy" (needs re-review).
- The translator sees the old source, the new source, the old translation, and a machine-translation suggestion for the new source.
- The translator picks: keep old, accept suggestion, or edit.

Sugarlang's three-state model and reconciliation workflow are a direct adaptation of this pattern.

### Figma Component Overrides

When a designer overrides text in a Figma component instance, updating the master component does not clobber the override. Figma knows the override exists and shows it visually. The designer can "reset" the override to snap back to the master.

Sugarlang's `manual` edit status and "Reset to Generated" action follow this same pattern.

### Git Three-Way Merge

Git's merge model resolves concurrent changes by comparing both sides against a common ancestor. When both sides change the same region, it produces a conflict for manual resolution. When changes don't overlap, it merges silently.

Sugarlang's reconciliation workflow follows this spirit: `generated` turns auto-merge (silently regenerate), `manual` turns with source changes produce conflicts for author resolution.

## Consequences

### Positive

- Manual edits are never silently destroyed by sync.
- Authors always know whether a turn is fresh, approved, hand-edited, or stale.
- The reconciliation workflow gives authors informed choices instead of forcing all-or-nothing sync.
- LLM refinement is opt-in, cached, and bounded — no surprise API calls or cost.
- The whole-scenario context strategy produces the best possible LLM output at higher bands.
- The system degrades gracefully: without LLM, programmatic generation still works. Without manual edits, sync is fully automatic.

### Negative

- Per-turn provenance tracking adds data model complexity and artifact size (small).
- The reconciliation UI is a new surface to build and maintain.
- Whole-scenario LLM context is more expensive per call than turn-in-isolation (but produces meaningfully better results and is called less often because results are cached).
- Authors must learn the three-state model and what the colored dots mean (but this is a simpler model than what professional translators already use daily in Crowdin/memoQ).

### Tradeoffs Accepted

- Per-turn granularity over per-interaction or per-band. More flags to manage, but the only granularity that correctly handles "I edited B2 Italian but not B0 Italian."
- Whole-scenario LLM context over turn-in-isolation. More expensive per call, but the user explicitly wants the best quality first, dialing back later if needed.
- Staleness as warning over staleness as error. Stale turns are playable. Blocking preview on staleness would be hostile to iterative authoring.

## References

- [ADR-SL-014: Quest-Beat Traversal and Deterministic Interaction Derivation Algorithm](./014-quest-beat-traversal-and-deterministic-interaction-derivation-algorithm.md) — section 7, `generationSource` concept superseded by this ADR's `editStatus`
- [ADR-SL-011: External AI-Assisted Authoring Client and Invocation Strategy](./011-external-ai-assisted-authoring-client-and-invocation-strategy.md) — invocation modes for LLM refinement
- [ADR-SL-013: Authoring Packet and Proposal Contract](./013-authoring-packet-and-proposal-contract.md) — packet structure for LLM refinement extends this contract
- [ADR-SL-005: Deterministic-First Evaluation, Feedback, and Support Architecture](./005-deterministic-first-evaluation-feedback-and-support-architecture.md) — programmatic baseline that LLM refinement builds on
- Crowdin Translation Management documentation — fuzzy match and translation memory model
- Figma Component documentation — override and reset model
