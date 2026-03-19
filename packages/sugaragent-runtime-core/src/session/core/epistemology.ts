/**
 * @fileoverview NPC epistemology and disclosure model.
 *
 * Implements: ADR-SA-026
 *
 * Derives epistemic metadata (knowledgeClass, accessPolicy, disclosurePolicy)
 * for each evidence item so the planner knows whether the NPC may assert, hedge,
 * recall, refuse, or redirect.
 */

import type {
  KnowledgeClass,
  AccessPolicy,
  DisclosurePolicy,
  EpistemicEvidenceItem,
} from './turn-contracts.js';

interface RawEvidenceInput {
  sourceType: string;
  ownerType: string;
  selfAttributed: boolean;
  confidence: number;
  metadata?: Record<string, unknown>;
}

interface BeatContractInput {
  urgency?: string;
}

// ---------------------------------------------------------------------------
// Default policy table (ADR-SA-026)
// ---------------------------------------------------------------------------

const DEFAULT_POLICIES: Record<KnowledgeClass, { accessPolicy: AccessPolicy; disclosurePolicy: DisclosurePolicy }> = {
  self_profile: { accessPolicy: 'assert', disclosurePolicy: 'answer_only' },
  routine_state: { accessPolicy: 'assert', disclosurePolicy: 'volunteer_ok' },
  witnessed_event: { accessPolicy: 'assert', disclosurePolicy: 'answer_only' },
  public_fact: { accessPolicy: 'assert', disclosurePolicy: 'answer_only' },
  rumor: { accessPolicy: 'hedged', disclosurePolicy: 'answer_only' },
  private_other: { accessPolicy: 'forbidden', disclosurePolicy: 'never' },
  faction_internal: { accessPolicy: 'hedged', disclosurePolicy: 'answer_only' },
  player_assertion: { accessPolicy: 'recall_only', disclosurePolicy: 'answer_only' },
  beat_fact: { accessPolicy: 'assert', disclosurePolicy: 'answer_only' },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function deriveEpistemicPolicy(input: {
  evidence: RawEvidenceInput;
  beatContract?: BeatContractInput | null;
}): { knowledgeClass: KnowledgeClass; accessPolicy: AccessPolicy; disclosurePolicy: DisclosurePolicy } {
  const { evidence, beatContract } = input;

  // Self profile
  if (evidence.sourceType === 'self_profile') {
    return { knowledgeClass: 'self_profile', accessPolicy: 'assert', disclosurePolicy: 'answer_only' };
  }

  // Player facts - recall only, never reclassify as world truth
  if (evidence.sourceType === 'player_fact' || evidence.sourceType === 'session_fact') {
    return { knowledgeClass: 'player_assertion', accessPolicy: 'recall_only', disclosurePolicy: 'answer_only' };
  }

  // Beat facts
  if (evidence.sourceType === 'beat_fact') {
    const disclosure: DisclosurePolicy = beatContract?.urgency === 'high' ? 'volunteer_ok' : 'answer_only';
    return { knowledgeClass: 'beat_fact', accessPolicy: 'assert', disclosurePolicy: disclosure };
  }

  // Check authored metadata for visibility hints
  const visibility = typeof evidence.metadata?.visibility === 'string'
    ? evidence.metadata.visibility
    : undefined;

  if (visibility === 'rumor') {
    return { knowledgeClass: 'rumor', accessPolicy: 'hedged', disclosurePolicy: 'answer_only' };
  }

  if (visibility === 'private_other' || visibility === 'private') {
    return { knowledgeClass: 'private_other', accessPolicy: 'forbidden', disclosurePolicy: 'never' };
  }

  if (visibility === 'faction_internal' || visibility === 'faction') {
    return { knowledgeClass: 'faction_internal', accessPolicy: 'hedged', disclosurePolicy: 'answer_only' };
  }

  // Witnessed event - high confidence means assert, low means hedge
  if (evidence.sourceType === 'routine_state') {
    return { knowledgeClass: 'routine_state', accessPolicy: 'assert', disclosurePolicy: 'volunteer_ok' };
  }

  // Default: public fact for lore chunks
  return { knowledgeClass: 'public_fact', accessPolicy: 'assert', disclosurePolicy: 'answer_only' };
}

/**
 * Enriches an existing evidence item with epistemic metadata.
 * Preserves all existing fields and adds knowledgeClass, accessPolicy, disclosurePolicy.
 */
export function enrichEvidenceWithEpistemics(
  item: {
    evidenceId: string;
    sourceId: string;
    sourceType: string;
    ownerType: string;
    text: string;
    factId?: string;
    chunkId?: string;
    verificationStatus: string;
    provenance?: Record<string, unknown>;
    entityIds: string[];
    anchorTerms?: string[];
    selfAttributed: boolean;
    confidence: number;
  },
  beatContract?: BeatContractInput | null,
): EpistemicEvidenceItem {
  const policy = deriveEpistemicPolicy({
    evidence: {
      sourceType: item.sourceType,
      ownerType: item.ownerType,
      selfAttributed: item.selfAttributed,
      confidence: item.confidence,
      metadata: item.provenance,
    },
    beatContract,
  });

  return {
    evidenceId: item.evidenceId,
    sourceId: item.sourceId,
    sourceType: item.sourceType,
    ownerType: item.ownerType as EpistemicEvidenceItem['ownerType'],
    knowledgeClass: policy.knowledgeClass,
    accessPolicy: policy.accessPolicy,
    disclosurePolicy: policy.disclosurePolicy,
    text: item.text,
    factId: item.factId,
    chunkId: item.chunkId,
    verificationStatus: item.verificationStatus,
    provenance: item.provenance,
    entityIds: item.entityIds,
    anchorTerms: Array.isArray(item.anchorTerms) ? item.anchorTerms : [],
    selfAttributed: item.selfAttributed,
    confidence: item.confidence,
  };
}

/**
 * Checks whether evidence is available for planning based on access policy.
 * forbidden items are excluded from the plan entirely.
 */
export function isEvidenceAvailableForPlanning(item: EpistemicEvidenceItem): boolean {
  return item.accessPolicy !== 'forbidden';
}

/**
 * Returns the default policy for a knowledge class (for documentation/testing).
 */
export function getDefaultPolicyForClass(knowledgeClass: KnowledgeClass): {
  accessPolicy: AccessPolicy;
  disclosurePolicy: DisclosurePolicy;
} {
  return DEFAULT_POLICIES[knowledgeClass] ?? DEFAULT_POLICIES.public_fact;
}
