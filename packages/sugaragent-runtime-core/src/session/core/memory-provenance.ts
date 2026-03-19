/**
 * @fileoverview Memory provenance and contamination control.
 *
 * Implements: ADR-SA-030
 *
 * Only the following record classes are persistable:
 * - player_fact (explicit self-assertions only)
 * - npc_commitment (validated NPC promises)
 * - shared_event (engine-confirmed events)
 * - topic_marker (conversational bookkeeping)
 * - relationship_signal (interaction telemetry)
 *
 * No memory record becomes canonical world truth merely because it was said.
 */

import type {
  MemoryWrite,
  MemoryRecordType,
  MemorySource,
  TurnPlan,
} from './turn-contracts.js';

// ---------------------------------------------------------------------------
// First-person clause classification
// ---------------------------------------------------------------------------

const FIRST_PERSON_SUBJECT = /^(I|I'm|I am|my)\b/i;

const PLAYER_FACT_PREDICATES = [
  /\b(am|'m) (from|a |an |the )/i,         // identity, origin
  /\bmy name is\b/i,                         // identity
  /\bI (like|love|prefer|enjoy|hate)\b/i,    // preference
  /\bI (speak|know|can|play)\b/i,            // ability
  /\bI (promised|will|shall|plan to)\b/i,    // commitment
  /\bI (have|own|carry|keep)\b/i,            // possession
  /\bI (live|work|study) (in|at|near)\b/i,   // origin/location
];

const WORLD_BELIEF_PREDICATES = [
  /\bI (think|believe|guess|suppose|feel like|bet)\b/i,
  /\bI heard\b/i,
  /\bthere (is|are|was|were)\b/i,
  /\bthe (bridge|road|gate|station|city|town)\b.*\b(is|was|are|were)\b/i,
];

interface ClauseClassification {
  type: 'player_fact' | 'world_belief' | 'ignore';
  text: string;
}

function classifyFirstPersonClause(clause: string): ClauseClassification {
  const trimmed = clause.trim();
  if (!trimmed) return { type: 'ignore', text: '' };

  if (!FIRST_PERSON_SUBJECT.test(trimmed)) {
    return { type: 'ignore', text: trimmed };
  }

  if (WORLD_BELIEF_PREDICATES.some((p) => p.test(trimmed))) {
    return { type: 'world_belief', text: trimmed };
  }

  if (PLAYER_FACT_PREDICATES.some((p) => p.test(trimmed))) {
    return { type: 'player_fact', text: trimmed };
  }

  return { type: 'ignore', text: trimmed };
}

// ---------------------------------------------------------------------------
// Explicit player fact extraction
// ---------------------------------------------------------------------------

export function extractExplicitPlayerFacts(playerMessage: string): MemoryWrite[] {
  const clauses = playerMessage
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((c) => c.trim().length > 0);

  const writes: MemoryWrite[] = [];
  const seen = new Set<string>();

  for (const clause of clauses) {
    const classification = classifyFirstPersonClause(clause);
    if (classification.type !== 'player_fact') continue;

    const normalized = classification.text
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.!?]+$/, '');

    if (!normalized || normalized.length < 6) continue;
    const canonical = normalized.toLowerCase();
    if (seen.has(canonical)) continue;
    seen.add(canonical);

    writes.push({
      type: 'player_fact',
      ownerType: 'player',
      text: normalized,
      source: 'player_explicit',
      confidence: 0.95,
    });
  }

  return writes;
}

// ---------------------------------------------------------------------------
// Memory write filter
// ---------------------------------------------------------------------------

export function filterMemoryWrites(input: {
  plan: TurnPlan;
  engineEvents?: Array<{ type: string; text: string }>;
}): MemoryWrite[] {
  const writes: MemoryWrite[] = [];

  for (const candidate of input.plan.memoryWrites) {
    // Player facts must come from explicit player self-assertions
    if (candidate.type === 'player_fact' && candidate.source !== 'player_explicit') {
      continue;
    }

    // Shared events must be engine-verified
    if (candidate.type === 'shared_event') {
      const isEngineVerified = input.engineEvents?.some(
        (event) => event.type === candidate.type && event.text === candidate.text,
      ) ?? false;
      if (!isEngineVerified) continue;
    }

    writes.push(candidate);
  }

  return writes;
}

// ---------------------------------------------------------------------------
// NPC commitment extraction
// ---------------------------------------------------------------------------

const NPC_COMMITMENT_PATTERNS = [
  /\bI (will|shall|promise|can help|'ll)\b/i,
  /\bI('ll| will) (come back|return|bring|find|look into|check|ask|help)\b/i,
];

export function extractNpcCommitments(
  npcUtterance: string,
  plan: TurnPlan,
): MemoryWrite[] {
  const clauses = npcUtterance
    .split(/(?<=[.!?])\s+/)
    .filter((c) => c.trim().length > 0);

  const writes: MemoryWrite[] = [];

  for (const clause of clauses) {
    if (!NPC_COMMITMENT_PATTERNS.some((p) => p.test(clause))) continue;

    // Only persist if the commitment relates to a planned claim
    const isPlanned = plan.claims.some((claim) => {
      const claimWords = new Set(claim.text.toLowerCase().split(/\s+/));
      const clauseWords = clause.toLowerCase().split(/\s+/);
      const overlap = clauseWords.filter((w) => claimWords.has(w)).length;
      return overlap >= 2;
    });

    if (!isPlanned && plan.claims.length > 0) continue;

    const normalized = clause.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
    if (normalized.length < 6) continue;

    writes.push({
      type: 'npc_commitment',
      ownerType: 'npc',
      text: normalized,
      source: 'npc_verified_turn',
      confidence: 0.85,
    });
  }

  return writes;
}
