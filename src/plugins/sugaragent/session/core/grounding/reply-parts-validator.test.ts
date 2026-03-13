import { describe, expect, it } from 'vitest';
import {
  buildReplyPartsValidationRepairReason,
  validateReplyPartsContract,
} from './reply-parts-validator';

describe('reply-parts-validator', () => {
  const supportSlots = [
    {
      slotId: 'E1',
      sourceId: 'lore.earendale',
      snippet: 'The Wordlark Hollow Resort and Spa is located just outside Earendale.',
      sourceType: 'lore_chunk',
      ownerType: 'world',
      selfAttributed: false,
      entityIds: ['locations.earendale'],
    },
    {
      slotId: 'E2',
      sourceId: 'self.bippity',
      snippet: 'NPC name: Bippity Roo. Persona: Station manager.',
      sourceType: 'self_profile',
      ownerType: 'npc',
      selfAttributed: true,
      entityIds: ['npc.bippity'],
    },
  ] as const;

  it('accepts grounded knowledge turns with valid support slots', () => {
    const result = validateReplyPartsContract({
      parts: [
        {
          kind: 'grounded',
          text: 'The resort is just outside Earendale.',
          support: ['E1'],
        },
      ],
      supportSlots,
      queryType: 'other_query',
      intent: 'answer',
    });

    expect(result.valid).toBe(true);
    expect(result.summary.validGroundedParts).toBe(1);
  });

  it('rejects grounded parts that reference unknown support slots', () => {
    const result = validateReplyPartsContract({
      parts: [
        {
          kind: 'grounded',
          text: 'The resort is just outside Earendale.',
          support: ['E9'],
        },
      ],
      supportSlots,
      queryType: 'other_query',
      intent: 'answer',
    });

    expect(result.valid).toBe(false);
    expect(result.summary.invalidSupportRefs).toBe(1);
    expect(buildReplyPartsValidationRepairReason(result)).toContain('invalid_support_slot');
  });

  it('rejects knowledge turns that are only social filler', () => {
    const result = validateReplyPartsContract({
      parts: [
        {
          kind: 'social',
          text: 'Sure, I can help.',
        },
      ],
      supportSlots,
      queryType: 'other_query',
      intent: 'answer',
    });

    expect(result.valid).toBe(false);
    expect(buildReplyPartsValidationRepairReason(result)).toContain('knowledge_turn_requires_grounded_or_uncertain');
  });

  it('accepts explicit uncertainty for knowledge turns', () => {
    const result = validateReplyPartsContract({
      parts: [
        {
          kind: 'uncertain',
          text: 'I am not sure. I do not have reliable records about that right now.',
        },
      ],
      supportSlots: [],
      queryType: 'other_query',
      intent: 'uncertain',
    });

    expect(result.valid).toBe(true);
  });

  it('rejects self-query grounded parts that use non-self support', () => {
    const result = validateReplyPartsContract({
      parts: [
        {
          kind: 'grounded',
          text: 'I am the station manager here.',
          support: ['E1'],
        },
      ],
      supportSlots,
      queryType: 'self_query',
      intent: 'answer',
    });

    expect(result.valid).toBe(false);
    expect(result.summary.ownershipViolations).toBe(1);
    expect(buildReplyPartsValidationRepairReason(result)).toContain('self_query_ownership');
  });
});
