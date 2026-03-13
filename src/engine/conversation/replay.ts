/**
 * Lightweight replay bundle format for conversation sessions.
 *
 * Captures normalized turn envelopes and turn evidence from a conversation
 * session for deterministic local replay and cross-provider comparison.
 *
 * This is the Phase 5 "medium" replay scope — structured JSON bundles
 * derived from the existing ConversationHost pipeline, not the full
 * ADR-008 production observability stack.
 */

import type { ConversationTurnEnvelope, ConversationSession } from './types';

// ---------------------------------------------------------------------------
// Replay Bundle Types
// ---------------------------------------------------------------------------

/** Metadata captured at session start. */
export interface ReplaySessionMetadata {
  sessionId: string;
  traceId: string;
  npcId: string;
  npcName?: string;
  providerId: string;
  targetLanguage?: string;
  supportLanguage?: string;
  learnerBandOverride?: string;
  startedAt: string;
  endedAt?: string;
}

/** A single replay entry — the envelope plus any turn evidence. */
export interface ReplayTurnEntry {
  turnIndex: number;
  envelope: ConversationTurnEnvelope;
  /** Turn evidence extracted from the envelope (if present). */
  turnEvidence?: unknown;
}

/**
 * A complete replay bundle for one conversation session.
 * Can be serialized to JSON and replayed deterministically.
 */
export interface ReplayBundle {
  /** Format version for forward compatibility. */
  formatVersion: 1;
  /** Session metadata. */
  session: ReplaySessionMetadata;
  /** Ordered turn entries. */
  turns: ReplayTurnEntry[];
  /** Total turn count. */
  turnCount: number;
}

// ---------------------------------------------------------------------------
// Replay Collector
// ---------------------------------------------------------------------------

/**
 * Collects turn envelopes during a live session and produces a ReplayBundle.
 *
 * Usage:
 *   const collector = createReplayCollector(session);
 *   // For each turn produced by the host:
 *   collector.addTurn(envelope);
 *   // When the session ends:
 *   const bundle = collector.finalize();
 */
export interface ReplayCollector {
  /** Add a turn envelope to the replay. */
  addTurn(envelope: ConversationTurnEnvelope): void;
  /** Finalize the replay bundle (sets endedAt timestamp). */
  finalize(): ReplayBundle;
  /** Get the current (partial) replay bundle without finalizing. */
  snapshot(): ReplayBundle;
}

export function createReplayCollector(session: ConversationSession): ReplayCollector {
  const metadata: ReplaySessionMetadata = {
    sessionId: session.sessionId,
    traceId: session.traceId,
    npcId: session.npcId,
    npcName: session.npcName,
    providerId: session.providerId,
    targetLanguage: session.targetLanguage,
    supportLanguage: session.supportLanguage,
    learnerBandOverride: session.learnerBandOverride,
    startedAt: new Date().toISOString(),
  };

  const turns: ReplayTurnEntry[] = [];

  function buildBundle(): ReplayBundle {
    return {
      formatVersion: 1,
      session: { ...metadata },
      turns: [...turns],
      turnCount: turns.length,
    };
  }

  return {
    addTurn(envelope: ConversationTurnEnvelope): void {
      turns.push({
        turnIndex: envelope.turnIndex,
        envelope,
        turnEvidence: envelope.turnEvidence,
      });
    },

    finalize(): ReplayBundle {
      metadata.endedAt = new Date().toISOString();
      return buildBundle();
    },

    snapshot(): ReplayBundle {
      return buildBundle();
    },
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

export function serializeReplayBundle(bundle: ReplayBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function deserializeReplayBundle(json: string): ReplayBundle {
  const parsed = JSON.parse(json);
  if (parsed.formatVersion !== 1) {
    throw new Error(`Unsupported replay format version: ${parsed.formatVersion}`);
  }
  return parsed as ReplayBundle;
}
