/**
 * Sugarlang Learner State Manager.
 *
 * Manages the multidimensional learner state, provides V1 placement,
 * and maps state to effective learner bands for scene adaptation.
 *
 * V1 band mapping uses a simple dimensional average → band threshold.
 * More sophisticated mapping can be added later without changing the API.
 */

import type { LearnerState, PlacementOutcome, LearnerBandId, TurnEvidence } from './types';

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------

export function createDefaultLearnerState(
  targetLanguage = 'es',
  supportLanguage = 'en',
): LearnerState {
  return {
    targetLanguage,
    supportLanguage,
    comprehension: 0.1,
    production: 0.05,
    vocabulary: 0.05,
    grammar: 0.05,
    repair: 0.0,
    confidence: 0.3,
    supportUsage: 0.9,
    knownLexicalEntryIds: [],
    unstableLexicalEntryIds: [],
    trackedLexicalEntries: {},
  };
}

// ---------------------------------------------------------------------------
// Band mapping thresholds (V1)
// ---------------------------------------------------------------------------

/** V1 thresholds: average of key dimensions → band. */
const BAND_THRESHOLDS: Array<{ band: LearnerBandId; minAvg: number }> = [
  { band: 'B4', minAvg: 0.75 },
  { band: 'B3', minAvg: 0.55 },
  { band: 'B2', minAvg: 0.35 },
  { band: 'B1', minAvg: 0.15 },
  { band: 'B0', minAvg: 0.0 },
];

function computeDimensionalAverage(state: LearnerState): number {
  return (
    state.comprehension +
    state.production +
    state.vocabulary +
    state.grammar +
    state.repair +
    state.confidence
  ) / 6;
}

function mapToBand(state: LearnerState): LearnerBandId {
  const avg = computeDimensionalAverage(state);
  for (const { band, minAvg } of BAND_THRESHOLDS) {
    if (avg >= minAvg) return band;
  }
  return 'B0';
}

/** Map a band ID to an approximate CEFR label for reporting. */
function deriveCefrLabel(band: LearnerBandId): string {
  switch (band) {
    case 'B0': return 'pre-A1';
    case 'B1': return 'A1';
    case 'B2': return 'A2';
    case 'B3': return 'B1';
    case 'B4': return 'B2+';
  }
}

// ---------------------------------------------------------------------------
// Learner State Manager
// ---------------------------------------------------------------------------

export class LearnerStateManager {
  private state: LearnerState;
  private evidence: TurnEvidence[] = [];

  constructor(initialState?: LearnerState) {
    this.state = initialState ?? createDefaultLearnerState();
  }

  /** Get the current learner state. */
  getState(): Readonly<LearnerState> {
    return this.state;
  }

  /** Get the effective band for the current learner state. */
  getEffectiveBand(): LearnerBandId {
    return mapToBand(this.state);
  }

  /** Create a default B0 placement outcome. */
  createDefaultPlacement(): PlacementOutcome {
    const defaultState = createDefaultLearnerState(
      this.state.targetLanguage,
      this.state.supportLanguage,
    );
    const band = mapToBand(defaultState);
    return {
      state: defaultState,
      derivedCefrLabel: deriveCefrLabel(band),
      timestamp: new Date().toISOString(),
    };
  }

  /** Apply a placement outcome to set the learner state. */
  applyPlacement(placement: PlacementOutcome): void {
    this.state = { ...placement.state };
  }

  /** Set the learner state directly (e.g. from saved state). */
  setState(state: LearnerState): void {
    this.state = { ...state };
  }

  /** Update language context. */
  setLanguageContext(target: string, support: string): void {
    this.state.targetLanguage = target;
    this.state.supportLanguage = support;
  }

  /**
   * Update learner state based on turn evidence.
   * V1: simple incremental updates based on success/failure.
   */
  updateFromEvidence(evidence: TurnEvidence): void {
    this.evidence.push(evidence);

    const delta = 0.02; // Small per-turn adjustment
    const decay = 0.005; // Slight decay for failure

    if (evidence.taskSuccess) {
      this.state.comprehension = Math.min(1, this.state.comprehension + delta);
      this.state.production = Math.min(1, this.state.production + delta * evidence.formAccuracy);
      this.state.vocabulary = Math.min(1, this.state.vocabulary + delta);
      this.state.grammar = Math.min(1, this.state.grammar + delta * evidence.formAccuracy);
      this.state.confidence = Math.min(1, this.state.confidence + delta * 0.5);

      // Support dependence reduces confidence growth
      if (evidence.supportDependence > 0.5) {
        this.state.supportUsage = Math.min(1, this.state.supportUsage + delta * 0.3);
      } else {
        this.state.supportUsage = Math.max(0, this.state.supportUsage - delta * 0.5);
      }
    } else {
      this.state.confidence = Math.max(0, this.state.confidence - decay);
      // Don't decrease skills on failure — just don't increase them
    }

    // Track retries as repair ability signal
    if (evidence.retries > 0 && evidence.taskSuccess) {
      this.state.repair = Math.min(1, this.state.repair + delta * 0.5);
    }

    const roleBuckets = [
      ...evidence.focusLexicalEntryIds,
      ...evidence.reinforcementLexicalEntryIds,
      ...evidence.ambientLexicalEntryIds,
    ];
    const lexicalEntryIds = Array.from(new Set(roleBuckets));

    for (const lexicalEntryId of lexicalEntryIds) {
      const existing = this.state.trackedLexicalEntries[lexicalEntryId];
      const progress = existing ?? {
        firstSeenAt: evidence.timestamp,
        lastSeenAt: evidence.timestamp,
        timesSeen: 0,
        recognitionSuccesses: 0,
        recognitionFailures: 0,
        productionSuccesses: 0,
        productionFailures: 0,
        status: 'new' as const,
      };

      progress.lastSeenAt = evidence.timestamp;
      progress.timesSeen += 1;

      const productionAttempt = ['short_text', 'open_text', 'blank_fill', 'single_blank', 'phrase_assembly', 'chip_composition'].includes(evidence.responseMode);
      if (evidence.taskSuccess) {
        if (productionAttempt) {
          progress.productionSuccesses += 1;
        } else {
          progress.recognitionSuccesses += 1;
        }
      } else if (productionAttempt) {
        progress.productionFailures += 1;
      } else {
        progress.recognitionFailures += 1;
      }

      if (evidence.taskSuccess && evidence.formAccuracy >= 0.8) {
        progress.status = 'stable';
        if (!this.state.knownLexicalEntryIds.includes(lexicalEntryId)) {
          this.state.knownLexicalEntryIds.push(lexicalEntryId);
          console.log(`[SL·P2] learner → known+ "${lexicalEntryId}" (formAccuracy=${evidence.formAccuracy})`);
        }
        const unstableIdx = this.state.unstableLexicalEntryIds.indexOf(lexicalEntryId);
        if (unstableIdx !== -1) {
          this.state.unstableLexicalEntryIds.splice(unstableIdx, 1);
          console.log(`[SL·P2] learner → unstable- "${lexicalEntryId}" (promoted to known)`);
        }
      } else if (evidence.taskSuccess && evidence.formAccuracy < 0.8) {
        progress.status = 'practicing';
        if (
          !this.state.knownLexicalEntryIds.includes(lexicalEntryId)
          && !this.state.unstableLexicalEntryIds.includes(lexicalEntryId)
        ) {
          this.state.unstableLexicalEntryIds.push(lexicalEntryId);
          console.log(`[SL·P2] learner → unstable+ "${lexicalEntryId}" (formAccuracy=${evidence.formAccuracy})`);
        }
      } else {
        progress.status = 'practicing';
        const knownIdx = this.state.knownLexicalEntryIds.indexOf(lexicalEntryId);
        if (knownIdx !== -1) {
          this.state.knownLexicalEntryIds.splice(knownIdx, 1);
        }
        if (!this.state.unstableLexicalEntryIds.includes(lexicalEntryId)) {
          this.state.unstableLexicalEntryIds.push(lexicalEntryId);
        }
        console.log(`[SL·P2] learner → practicing "${lexicalEntryId}" (task failed)`);
      }

      this.state.trackedLexicalEntries[lexicalEntryId] = progress;
    }
  }

  /** Get all accumulated evidence for the session. */
  getEvidence(): readonly TurnEvidence[] {
    return this.evidence;
  }

  /** Serialize for plugin state persistence. */
  serialize(): Record<string, unknown> {
    return {
      state: { ...this.state },
      evidence: [...this.evidence],
    };
  }

  /** Load from serialized plugin state. */
  loadSerialized(data: Record<string, unknown>): void {
    if (data.state && typeof data.state === 'object') {
      this.state = data.state as LearnerState;
    }
    if (Array.isArray(data.evidence)) {
      this.evidence = data.evidence as TurnEvidence[];
    }
  }
}
