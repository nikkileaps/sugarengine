import { describe, expect, it } from 'vitest';
import {
  buildReplyPartsPrompt,
  buildReplyPartsRepairPrompt,
  buildSupportSlotsFromGroundingEvidence,
  filterSupportSlotsForQueryType,
  materializeTurnOutputFromReplyParts,
  normalizeReplyPartsForValidation,
  parseReplyPartsResponseDetailed,
} from './reply-parts.js';

describe('reply-parts', () => {
  it('builds turn-local support slots from grounding evidence', () => {
    const slots = buildSupportSlotsFromGroundingEvidence({
      evidenceEntries: [
        {
          sourceId: 'lore.earendale',
          sourceType: 'lore_chunk',
          text: 'The Wordlark Hollow Resort and Spa is located just outside Earendale.',
          selfAttributed: false,
          entityIds: ['locations.earendale'],
        },
        {
          sourceId: 'self.bippity',
          sourceType: 'self_profile',
          text: 'NPC name: Bippity Roo. Persona: Station manager.',
          selfAttributed: true,
          entityIds: ['npc.bippity'],
        },
      ],
      selfEntityId: 'npc.bippity',
      npcId: 'npc.bippity',
    });

    expect(slots).toEqual([
      expect.objectContaining({
        slotId: 'E1',
        sourceId: 'lore.earendale',
        ownerType: 'world',
      }),
      expect.objectContaining({
        slotId: 'E2',
        sourceId: 'self.bippity',
        ownerType: 'npc',
      }),
    ]);
  });

  it('parses valid reply-parts payloads and recovers wrapped JSON', () => {
    expect(parseReplyPartsResponseDetailed('preface\n{"parts":[{"kind":"grounded","text":"The resort is just outside Earendale.","support":["E1"]}],"emotion":"warm","intent":"answer","proposedIntents":[]}\nthanks')).toEqual({
      turn: {
        parts: [
          {
            kind: 'grounded',
            text: 'The resort is just outside Earendale.',
            support: ['E1'],
          },
        ],
        emotion: 'warm',
        intent: 'answer',
        proposedIntents: [],
        beatEvidence: undefined,
      },
    });

    expect(parseReplyPartsResponseDetailed('{"parts":"bad","emotion":"warm","intent":"answer","proposedIntents":[]}')).toEqual({
      turn: null,
      failureReason: 'invalid_part',
    });
  });

  it('parses inferred and rumor reply parts', () => {
    expect(parseReplyPartsResponseDetailed('{"parts":[{"kind":"inferred","text":"I think the bridge is watched after dark.","support":["E1","E2"]},{"kind":"rumor","text":"I heard that smugglers use the old tunnel.","support":["E3"]}],"emotion":"guarded","intent":"answer","proposedIntents":[]}')).toEqual({
      turn: {
        parts: [
          {
            kind: 'inferred',
            text: 'I think the bridge is watched after dark.',
            support: ['E1', 'E2'],
          },
          {
            kind: 'rumor',
            text: 'I heard that smugglers use the old tunnel.',
            support: ['E3'],
          },
        ],
        emotion: 'guarded',
        intent: 'answer',
        proposedIntents: [],
        beatEvidence: undefined,
      },
    });
  });

  it('prefers the top-level reply-parts object over nested beat-evidence objects in raw runtime output', () => {
    const rawRuntimeOutput = [
      'Loading model...',
      '{"parts":[{"kind":"grounded","text":"The Wordlark Hollow Resort and Spa is located just outside the town.","support":["E2"]}],"emotion":"warm","intent":"answer","proposedIntents":[],"beatEvidence":{"coveredFacts":[],"uncoveredFacts":["E2"],"completionSignal":"none","confidence":1}}',
      '{"coveredFacts":[],"uncoveredFacts":["E2"],"completionSignal":"none","confidence":1}',
    ].join('\n');

    expect(parseReplyPartsResponseDetailed(rawRuntimeOutput)).toEqual({
      turn: {
        parts: [
          {
            kind: 'grounded',
            text: 'The Wordlark Hollow Resort and Spa is located just outside the town.',
            support: ['E2'],
          },
        ],
        emotion: 'warm',
        intent: 'answer',
        proposedIntents: [],
        beatEvidence: {
          coveredFacts: [],
          uncoveredFacts: ['E2'],
          completionSignal: 'none',
          confidence: 1,
          beatId: undefined,
        },
      },
    });
  });

  it('builds prompt and repair prompt around support slots', () => {
    const prompt = buildReplyPartsPrompt({
      npcName: 'Bippity Roo',
      playerMessage: 'Do you know anything about the resort?',
      queryType: 'other_query',
      routeIntent: 'lore_other',
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'lore.earendale',
          snippet: 'The Wordlark Hollow Resort and Spa is located just outside Earendale.',
          sourceType: 'lore_chunk',
          ownerType: 'world',
          selfAttributed: false,
          entityIds: ['locations.earendale'],
        },
      ],
    });
    const repairPrompt = buildReplyPartsRepairPrompt({
      npcName: 'Bippity Roo',
      playerMessage: 'Do you know anything about the resort?',
      queryType: 'other_query',
      routeIntent: 'lore_other',
      supportSlots: [],
      failureReason: 'invalid_support_slot',
    });

    expect(prompt).toContain('Allowed support slots:');
    expect(prompt).toContain('Allowed part kinds: social, grounded, inferred, rumor, uncertain, close.');
    expect(prompt).toContain('- E1 [owner=world]:');
    expect(prompt).toContain('"support":["E1"]');
    expect(repairPrompt).toContain('Previous response failed: invalid_support_slot.');
    expect(repairPrompt).toContain('Use only the allowed support slot ids.');
  });

  it('makes self-query grounding requirements explicit when self support exists', () => {
    const prompt = buildReplyPartsPrompt({
      npcName: 'Bippity Roo',
      playerMessage: 'Who are you?',
      queryType: 'self_query',
      routeIntent: 'identity_self',
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'self.bippity',
          snippet: 'NPC name: Bippity Roo. Persona: Station manager.',
          sourceType: 'self_profile',
          ownerType: 'npc',
          selfAttributed: true,
          entityIds: ['npc.bippity'],
        },
      ],
    });
    const repairPrompt = buildReplyPartsRepairPrompt({
      npcName: 'Bippity Roo',
      playerMessage: 'Who are you?',
      queryType: 'self_query',
      routeIntent: 'identity_self',
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'self.bippity',
          snippet: 'NPC name: Bippity Roo. Persona: Station manager.',
          sourceType: 'self_profile',
          ownerType: 'npc',
          selfAttributed: true,
          entityIds: ['npc.bippity'],
        },
      ],
      failureReason: 'knowledge_turn_requires_knowledge_or_uncertain',
    });

    expect(prompt).toContain('at least one part MUST be grounded');
    expect(prompt).toContain('Do not answer a self-query with only a social part.');
    expect(prompt).toContain('"support":["E1"]');
    expect(repairPrompt).toContain('Your retry MUST include at least one grounded part.');
    expect(repairPrompt).toContain('Do not return only a social part.');
    expect(repairPrompt).toContain('"support":["E1"]');
  });

  it('filters self-query support slots down to self-owned evidence only', () => {
    const filtered = filterSupportSlotsForQueryType({
      queryType: 'self_query',
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'lore.earendale',
          snippet: 'The resort is outside Earendale.',
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
      ],
    });

    expect(filtered).toEqual([
      expect.objectContaining({
        slotId: 'E2',
        ownerType: 'npc',
      }),
    ]);
  });

  it('binds the single self-owned support slot onto grounded self-query parts when omitted', () => {
    const normalized = normalizeReplyPartsForValidation({
      queryType: 'self_query',
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'self.bippity',
          snippet: 'NPC name: Bippity Roo. Persona: Station manager.',
          sourceType: 'self_profile',
          ownerType: 'npc',
          selfAttributed: true,
          entityIds: ['npc.bippity'],
        },
      ],
      turn: {
        parts: [
          {
            kind: 'grounded',
            text: 'I am Bippity Roo, the station manager here.',
          },
        ],
        emotion: 'warm',
        intent: 'answer',
        proposedIntents: [],
      },
    });

    expect(normalized?.parts).toEqual([
      {
        kind: 'grounded',
        text: 'I am Bippity Roo, the station manager here.',
        support: ['E1'],
      },
    ]);
  });

  it('binds grounded lore parts to the best matching support slots when ids are omitted', () => {
    const normalized = normalizeReplyPartsForValidation({
      queryType: 'other_query',
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'lore.earendale',
          snippet: 'The Wordlark Hollow Resort and Spa is located just outside the town.',
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
        {
          slotId: 'E3',
          sourceId: 'memory.1',
          snippet: 'Player likes coffee.',
          sourceType: 'player_fact',
          ownerType: 'player',
          selfAttributed: false,
          entityIds: [],
        },
      ],
      turn: {
        parts: [
          { kind: 'social', text: 'Great to hear!' },
          {
            kind: 'grounded',
            text: 'The Wordlark Hollow Resort and Spa is located just outside the town.',
          },
        ],
        emotion: 'warm',
        intent: 'answer',
        proposedIntents: [],
      },
    });

    expect(normalized?.parts).toEqual([
      { kind: 'social', text: 'Great to hear!' },
      {
        kind: 'grounded',
        text: 'The Wordlark Hollow Resort and Spa is located just outside the town.',
        support: ['E1'],
      },
    ]);
  });

  it('binds inferred lore parts to the best matching support slots when ids are omitted', () => {
    const normalized = normalizeReplyPartsForValidation({
      queryType: 'other_query',
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'lore.bridge',
          snippet: 'The bridge is watched after dark.',
          sourceType: 'lore_chunk',
          ownerType: 'world',
          selfAttributed: false,
          entityIds: ['bridge.old'],
        },
      ],
      turn: {
        parts: [
          {
            kind: 'inferred',
            text: 'I think the bridge is watched after dark.',
          },
        ],
        emotion: 'guarded',
        intent: 'answer',
        proposedIntents: [],
      },
    });

    expect(normalized?.parts).toEqual([
      {
        kind: 'inferred',
        text: 'I think the bridge is watched after dark.',
        support: ['E1'],
      },
    ]);
  });

  it('materializes final public output from grounded reply parts', () => {
    const output = materializeTurnOutputFromReplyParts({
      turn: {
        parts: [
          { kind: 'social', text: 'Sure.' },
          { kind: 'grounded', text: 'The resort is just outside Earendale.', support: ['E1'] },
        ],
        emotion: 'warm',
        intent: 'answer',
        proposedIntents: [],
      },
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'lore.earendale',
          snippet: 'The Wordlark Hollow Resort and Spa is located just outside Earendale.',
          sourceType: 'lore_chunk',
          ownerType: 'world',
          selfAttributed: false,
          entityIds: ['locations.earendale'],
        },
      ],
    });

    expect(output.utterance).toBe('Sure. The resort is just outside Earendale.');
    expect(output.citations).toEqual([
      {
        sourceId: 'lore.earendale',
        snippet: 'The Wordlark Hollow Resort and Spa is located just outside Earendale.',
      },
    ]);
  });

  it('materializes citations from inferred and rumor parts too', () => {
    const output = materializeTurnOutputFromReplyParts({
      turn: {
        parts: [
          { kind: 'inferred', text: 'I think the bridge is watched after dark.', support: ['E1'] },
          { kind: 'rumor', text: 'I heard the tunnel is used by smugglers.', support: ['E2'] },
        ],
        emotion: 'guarded',
        intent: 'answer',
        proposedIntents: [],
      },
      supportSlots: [
        {
          slotId: 'E1',
          sourceId: 'lore.bridge',
          snippet: 'The bridge is watched after dark.',
          sourceType: 'lore_chunk',
          ownerType: 'world',
          selfAttributed: false,
          entityIds: ['bridge.old'],
        },
        {
          slotId: 'E2',
          sourceId: 'lore.tunnel',
          snippet: 'People whisper that smugglers use the old tunnel.',
          sourceType: 'lore_chunk',
          ownerType: 'world',
          selfAttributed: false,
          entityIds: ['tunnel.old'],
        },
      ],
    });

    expect(output.utterance).toBe('I think the bridge is watched after dark. I heard the tunnel is used by smugglers.');
    expect(output.citations).toEqual([
      {
        sourceId: 'lore.bridge',
        snippet: 'The bridge is watched after dark.',
      },
      {
        sourceId: 'lore.tunnel',
        snippet: 'People whisper that smugglers use the old tunnel.',
      },
    ]);
  });
});
