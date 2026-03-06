import { describe, expect, it } from 'vitest';
import {
  buildClaimRepairReason,
  extractClaimUnits,
  isExplicitUncertaintyUtterance,
  validateGroundedClaims,
} from './claim-validator.mjs';

describe('SugarAgent claim validator', () => {
  it('extracts sentence-level units and marks social language as non-factual', () => {
    const claims = extractClaimUnits('Hello there! Earendale is a town on floating land.');

    expect(claims).toHaveLength(2);
    expect(claims[0]?.factual).toBe(false);
    expect(claims[1]?.factual).toBe(true);
    expect(claims[1]?.claim).toContain('Earendale');
  });

  it('accepts supported factual claims when matching evidence exists', () => {
    const grounding = validateGroundedClaims({
      utterance: 'Earendale is a town on floating land.',
      queryType: 'world_query',
      evidenceEntries: [
        {
          sourceId: 'lore.locations.towns.town.earendale#overview',
          sourceType: 'lore_chunk',
          text: 'Earendale is a town located on a floating chunk of land that broke off from the ear of the Great Head.',
        },
      ],
    });

    expect(grounding.summary.decision).toBe('accept');
    expect(grounding.summary.supportedCount).toBeGreaterThan(0);
    expect(grounding.summary.unsupportedCount).toBe(0);
  });

  it('treats wellbeing small-talk statements as non-factual', () => {
    const grounding = validateGroundedClaims({
      utterance: "I'm good, thanks for asking.",
      queryType: 'conversation',
      evidenceEntries: [],
    });

    expect(grounding.summary.decision).toBe('accept');
    expect(grounding.summary.nonFactualCount).toBeGreaterThan(0);
    expect(grounding.summary.unsupportedCount).toBe(0);
  });

  it('requires repair when factual claims are unsupported', () => {
    const grounding = validateGroundedClaims({
      utterance: "Earendale's old walls stood before Rackwick was built.",
      queryType: 'world_query',
      evidenceEntries: [
        {
          sourceId: 'lore.locations.towns.town.earendale#overview',
          sourceType: 'lore_chunk',
          text: 'Earendale is a town located on a floating chunk of land.',
        },
      ],
    });

    expect(grounding.summary.decision).toBe('repair');
    expect(grounding.summary.unsupportedCount).toBeGreaterThan(0);
    expect(buildClaimRepairReason(grounding)).toContain('unsupported claims');
  });

  it('enforces self-query support unless explicit uncertainty is used', () => {
    const unsupportedSelfClaim = validateGroundedClaims({
      utterance: 'I grew up in Earendale and trained with Captain Rowan.',
      queryType: 'self_query',
      requireSelfEvidence: true,
      selfEntityId: 'npc.baker',
      evidenceEntries: [
        {
          sourceId: 'lore.npcs.rowan#background',
          sourceType: 'lore_chunk',
          text: 'Captain Rowan trained with the city watch before joining command.',
          selfAttributed: false,
          entityIds: ['npc.rowan'],
        },
      ],
    });

    expect(unsupportedSelfClaim.summary.decision).toBe('repair');
    expect(unsupportedSelfClaim.hasSupportedSelfEvidence).toBe(false);

    const uncertainUtterance = 'I am not sure yet. I do not have reliable records about my own background.';
    const uncertainSelfReply = validateGroundedClaims({
      utterance: uncertainUtterance,
      queryType: 'self_query',
      requireSelfEvidence: true,
      selfEntityId: 'npc.baker',
      evidenceEntries: [],
    });

    expect(isExplicitUncertaintyUtterance(uncertainUtterance)).toBe(true);
    expect(uncertainSelfReply.summary.decision).toBe('accept');
  });
});
