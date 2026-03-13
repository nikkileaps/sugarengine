/**
 * Turn reconciliation logic (ADR-015 Phase 2).
 *
 * Compares existing scene language pack turns against freshly generated turns
 * and applies the sync behavior table:
 *
 *   | editStatus | Hash matches | Hash changed              |
 *   |------------|-------------|---------------------------|
 *   | generated  | Skip        | Regenerate, update hash   |
 *   | reviewed   | Skip        | Flag stale, do not overwrite |
 *   | manual     | Skip        | Flag stale, do not overwrite |
 *
 * New interactions → generate fresh turns.
 * Removed interactions → flag existing turns as orphaned.
 *
 * Pure function, no React, no side effects.
 */

import type {
  SceneBandRealization,
  SceneTurn,
  LearnerBandId,
} from '../types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ReconciliationSummary {
  /** Turns that were regenerated (editStatus was 'generated', hash changed). */
  regenerated: number;
  /** Turns that were flagged stale (editStatus was 'reviewed' or 'manual', hash changed). */
  flaggedStale: number;
  /** Turns whose source quest node was removed. */
  flaggedOrphaned: number;
  /** Turns that were skipped (already current). */
  skipped: number;
  /** Turns that were newly added (from new interactions). */
  added: number;
}

/** A stale turn paired with its fresh counterpart for diff review. */
export interface StaleTurnPair {
  bandId: LearnerBandId;
  existing: SceneTurn;
  fresh: SceneTurn;
}

export interface ReconciliationResult {
  bands: SceneBandRealization[];
  summary: ReconciliationSummary;
  /** Stale turn pairs for reconciliation review UI. */
  stalePairs: StaleTurnPair[];
}

/**
 * Reconcile existing scene language pack bands against freshly generated bands.
 *
 * @param existingBands - The current persisted band realizations.
 * @param freshBands - Freshly generated band realizations from generateBandedTurns.
 * @param currentInteractionIds - Set of interaction IDs that currently exist in the quest graph.
 *   Turns belonging to interactions NOT in this set are flagged orphaned.
 */
export function reconcileTurns(
  existingBands: SceneBandRealization[],
  freshBands: SceneBandRealization[],
  currentInteractionIds: Set<string>,
): ReconciliationResult {
  const summary: ReconciliationSummary = {
    regenerated: 0,
    flaggedStale: 0,
    flaggedOrphaned: 0,
    skipped: 0,
    added: 0,
  };
  const stalePairs: StaleTurnPair[] = [];

  // Index fresh turns by bandId → turnId
  const freshByBandAndId = new Map<string, Map<string, SceneTurn>>();
  for (const band of freshBands) {
    const turnMap = new Map<string, SceneTurn>();
    for (const turn of band.turns) {
      turnMap.set(turn.turnId, turn);
    }
    freshByBandAndId.set(band.bandId, turnMap);
  }

  // Index existing bands by bandId
  const existingByBand = new Map<string, SceneBandRealization>();
  for (const band of existingBands) {
    existingByBand.set(band.bandId, band);
  }

  // Collect all band IDs from both sides
  const allBandIds = new Set<LearnerBandId>();
  for (const band of existingBands) allBandIds.add(band.bandId);
  for (const band of freshBands) allBandIds.add(band.bandId);

  const reconciledBands: SceneBandRealization[] = [];

  for (const bandId of allBandIds) {
    const existingBand = existingByBand.get(bandId);
    const freshTurnMap = freshByBandAndId.get(bandId) ?? new Map<string, SceneTurn>();

    if (!existingBand) {
      // Entirely new band — take all fresh turns
      const freshBand = freshBands.find((b) => b.bandId === bandId);
      if (freshBand) {
        summary.added += freshBand.turns.length;
        reconciledBands.push({ ...freshBand });
      }
      continue;
    }

    // Track which fresh turn IDs have been consumed
    const consumedFreshIds = new Set<string>();
    const reconciledTurns: SceneTurn[] = [];

    // Process existing turns
    for (const existing of existingBand.turns) {
      const fresh = freshTurnMap.get(existing.turnId);

      if (fresh) {
        consumedFreshIds.add(existing.turnId);
        const reconciled = reconcileOneTurn(existing, fresh, summary);
        reconciledTurns.push(reconciled);
        // Collect stale pair for diff review
        if (reconciled.stale) {
          stalePairs.push({ bandId, existing, fresh });
        }
      } else {
        // No matching fresh turn — check if the interaction still exists
        const interactionId = extractInteractionId(existing.turnId);
        if (interactionId && !currentInteractionIds.has(interactionId)) {
          // Source interaction was removed
          if (existing.editStatus === 'generated') {
            // Safe to drop generated orphans silently
            summary.flaggedOrphaned += 1;
            continue; // don't include in output
          }
          // Preserve manual/reviewed orphans with flag
          reconciledTurns.push({ ...existing, orphaned: true, stale: false });
          summary.flaggedOrphaned += 1;
        } else {
          // Interaction still exists but turn ID doesn't match fresh output.
          // This can happen with legacy scaffold turns. Keep them as-is.
          reconciledTurns.push(existing);
          summary.skipped += 1;
        }
      }
    }

    // Add new turns from fresh that weren't in existing
    for (const [freshId, freshTurn] of freshTurnMap) {
      if (!consumedFreshIds.has(freshId)) {
        reconciledTurns.push(freshTurn);
        summary.added += 1;
      }
    }

    reconciledBands.push({
      ...existingBand,
      turns: reconciledTurns,
    });
  }

  // Sort bands in standard order
  const BAND_ORDER: LearnerBandId[] = ['B0', 'B1', 'B2', 'B3', 'B4'];
  reconciledBands.sort(
    (a, b) => BAND_ORDER.indexOf(a.bandId) - BAND_ORDER.indexOf(b.bandId),
  );

  return { bands: reconciledBands, summary, stalePairs };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function reconcileOneTurn(
  existing: SceneTurn,
  fresh: SceneTurn,
  summary: ReconciliationSummary,
): SceneTurn {
  const status = existing.editStatus ?? 'generated';

  // If the existing turn has no sourceHash, it predates provenance tracking.
  // We can't detect change, so treat it as current and backfill the hash
  // so future syncs can detect changes properly.
  if (!existing.sourceHash) {
    summary.skipped += 1;
    return { ...existing, sourceHash: fresh.sourceHash, stale: false, orphaned: false };
  }

  const hashMatches = existing.sourceHash === fresh.sourceHash;

  if (hashMatches) {
    // Source unchanged — clear any stale flag, keep existing content
    summary.skipped += 1;
    return { ...existing, stale: false, orphaned: false };
  }

  // Source changed
  switch (status) {
    case 'generated':
      // Safe to regenerate — replace with fresh turn
      summary.regenerated += 1;
      return { ...fresh, stale: false, orphaned: false };

    case 'reviewed':
    case 'manual':
      // Protect manual/reviewed content — flag stale but don't overwrite
      summary.flaggedStale += 1;
      return { ...existing, stale: true, orphaned: false };

    default:
      // Unknown status — treat as generated
      summary.regenerated += 1;
      return { ...fresh, stale: false, orphaned: false };
  }
}

/**
 * Extract the interaction ID from a turn ID.
 * Turn IDs follow the pattern: `{interactionId}--{bandId}--t{n}`
 */
function extractInteractionId(turnId: string): string | null {
  const match = turnId.match(/^(.+?)--B\d+--t\d+$/);
  return match?.[1] ?? null;
}
