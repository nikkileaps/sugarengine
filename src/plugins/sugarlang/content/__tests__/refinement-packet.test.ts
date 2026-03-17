import { describe, expect, it } from 'vitest';
import {
  assembleRefinementPacket,
  assembleScenarioRefinementPackets,
  parseRefinementProposal,
  applyRefinementProposal,
} from '../refinement-packet';
import type {
  ScenarioBrief,
  SceneLanguagePack,
  SceneBandRealization,
  SceneTurn,
  LexiconPack,
  BandPolicyPack,
} from '../../types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeScenario(overrides?: Partial<ScenarioBrief>): ScenarioBrief {
  return {
    scenarioId: 'find-the-luggage',
    successCriteria: ['Retrieve suitcase'],
    activeReferents: ['target_luggage_primary'],
    supportedBands: ['B0', 'B1', 'B2'],
    npcIds: ['npc-rosa'],
    npcNames: ['Rosa'],
    ...overrides,
  };
}

function makeTurn(overrides?: Partial<SceneTurn>): SceneTurn {
  return {
    turnId: 'ix-rosa-greeting--B0--t1',
    targetText: '¿Puedes encontrar la maleta?',
    focusLexicalEntryIds: ['object.suitcase'],
    responseMode: 'free_form',
    editStatus: 'generated',
    sourceHash: 'aabbccdd0011',
    speakerName: 'Rosa',
    turnRole: 'npc_delivery',
    ...overrides,
  };
}

function makeBand(bandId: string, turns: SceneTurn[]): SceneBandRealization {
  return { bandId: bandId as SceneBandRealization['bandId'], turns, providerPolicy: 'scripted' };
}

function makePack(overrides?: Partial<SceneLanguagePack>): SceneLanguagePack {
  return {
    scenarioId: 'find-the-luggage',
    targetLanguage: 'es',
    supportLanguage: 'en',
    bands: [
      makeBand('B0', [
        makeTurn(),
        makeTurn({
          turnId: 'ix-rosa-greeting--B0--t2',
          targetText: 'Es roja.',
          turnRole: 'npc_delivery',
          focusLexicalEntryIds: ['color.red'],
        }),
      ]),
    ],
    ...overrides,
  };
}

function makeLexicon(): LexiconPack {
  return {
    targetLanguage: 'es',
    entries: [
      {
        lexicalEntryId: 'object.suitcase',
        targetForm: 'maleta',
        gloss: 'suitcase',
        category: 'object',
        introductionBand: 'B0',
        usage: 'active',
        groundable: true,
      },
      {
        lexicalEntryId: 'color.red',
        targetForm: 'roja',
        gloss: 'red',
        category: 'color',
        introductionBand: 'B0',
        usage: 'active',
        groundable: true,
      },
    ],
  };
}

function makeBandPolicies(): BandPolicyPack {
  return {
    policies: [
      {
        bandId: 'B0',
        supportLanguagePolicy: {
          mixingLevel: 'full_support',
          showSupportStrip: true,
          showGlosses: true,
        },
        groundingIntensity: 'always',
        allowedResponseModes: ['object_selection', 'yes_no'],
        correctionPosture: 'immediate',
        deliveryContract: {
          detailLevel: 'minimal',
          maxKnowledgeClaims: 1,
          maxKnowledgeParts: 1,
          maxSentences: 1,
          maxSentenceLength: 8,
          maxClauseDepth: 1,
          allowExactNumbers: false,
          allowEnrichmentFacts: false,
          preferConcreteFacts: true,
          preferHighFrequencyLexicon: true,
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests: assembleRefinementPacket
// ---------------------------------------------------------------------------

describe('assembleRefinementPacket', () => {
  it('assembles a per-turn refinement packet with correct structure', () => {
    const packet = assembleRefinementPacket({
      scenario: makeScenario(),
      pack: makePack(),
      bandId: 'B0',
      lexicon: makeLexicon(),
      bandPolicies: makeBandPolicies(),
      targetTurnId: 'ix-rosa-greeting--B0--t1',
    });

    expect(packet.packetVersion).toBe(1);
    expect(packet.operation).toBe('refine_turn');
    expect(packet.scenarioContext.scenarioId).toBe('find-the-luggage');
    expect(packet.scenarioContext.targetLanguage).toBe('es');
    expect(packet.scenarioContext.supportLanguage).toBe('en');
    expect(packet.scenarioContext.npcNames).toEqual(['Rosa']);
    expect(packet.targetTurnIds).toEqual(['ix-rosa-greeting--B0--t1']);
  });

  it('includes band context from policies', () => {
    const packet = assembleRefinementPacket({
      scenario: makeScenario(),
      pack: makePack(),
      bandId: 'B0',
      bandPolicies: makeBandPolicies(),
    });

    expect(packet.bandContext.bandId).toBe('B0');
    expect(packet.bandContext.mixingLevel).toBe('full_support');
    expect(packet.bandContext.showSupportStrip).toBe(true);
  });

  it('builds vocabulary plan from turn lexical entries', () => {
    const packet = assembleRefinementPacket({
      scenario: makeScenario(),
      pack: makePack(),
      bandId: 'B0',
      lexicon: makeLexicon(),
    });

    expect(packet.vocabularyPlan).toHaveLength(2);
    expect(packet.vocabularyPlan[0]).toMatchObject({
      lexicalEntryId: 'object.suitcase',
      targetForm: 'maleta',
      gloss: 'suitcase',
      role: 'focus',
    });
    expect(packet.vocabularyPlan[1]).toMatchObject({
      lexicalEntryId: 'color.red',
      targetForm: 'roja',
      role: 'focus',
    });
  });

  it('includes all turns in conversation flow', () => {
    const packet = assembleRefinementPacket({
      scenario: makeScenario(),
      pack: makePack(),
      bandId: 'B0',
      targetTurnId: 'ix-rosa-greeting--B0--t1',
    });

    expect(packet.conversationFlow).toHaveLength(2);
    expect(packet.conversationFlow[0].isTarget).toBe(true);
    expect(packet.conversationFlow[1].isTarget).toBe(false);
    expect(packet.conversationFlow[0].currentRenderedText).toBe('¿Puedes encontrar la maleta?');
  });

  it('selects only generated turns when no targetTurnId (per-band mode)', () => {
    const pack = makePack({
      bands: [
        makeBand('B0', [
          makeTurn({ editStatus: 'generated' }),
          makeTurn({
            turnId: 'ix-rosa-greeting--B0--t2',
            editStatus: 'manual',
            targetText: 'My manual text',
          }),
        ]),
      ],
    });

    const packet = assembleRefinementPacket({
      scenario: makeScenario(),
      pack,
      bandId: 'B0',
    });

    // Only the generated turn should be targeted
    expect(packet.targetTurnIds).toEqual(['ix-rosa-greeting--B0--t1']);
    // But both turns appear in the conversation flow
    expect(packet.conversationFlow).toHaveLength(2);
  });

  it('includes source English text when sourceDialogueByInteraction provided', () => {
    const sourceMap = new Map([
      ['ix-rosa-greeting', ['Can you find the suitcase?', 'It is red.']],
    ]);

    const packet = assembleRefinementPacket({
      scenario: makeScenario(),
      pack: makePack(),
      bandId: 'B0',
      sourceDialogueByInteraction: sourceMap,
      targetTurnId: 'ix-rosa-greeting--B0--t1',
    });

    expect(packet.conversationFlow[0].sourceEnglishText).toBe('Can you find the suitcase?');
    expect(packet.conversationFlow[1].sourceEnglishText).toBe('It is red.');
  });

  it('has a non-empty instruction', () => {
    const packet = assembleRefinementPacket({
      scenario: makeScenario(),
      pack: makePack(),
      bandId: 'B0',
    });

    expect(packet.instruction.length).toBeGreaterThan(50);
    expect(packet.instruction).toContain('target-language');
  });
});

// ---------------------------------------------------------------------------
// Tests: assembleScenarioRefinementPackets
// ---------------------------------------------------------------------------

describe('assembleScenarioRefinementPackets', () => {
  it('returns one packet per band with eligible turns', () => {
    const pack = makePack({
      bands: [
        makeBand('B0', [makeTurn({ editStatus: 'generated' })]),
        makeBand('B1', [makeTurn({ turnId: 'ix-rosa-greeting--B1--t1', editStatus: 'generated' })]),
        makeBand('B2', [makeTurn({ turnId: 'ix-rosa-greeting--B2--t1', editStatus: 'manual' })]),
      ],
    });

    const packets = assembleScenarioRefinementPackets({
      scenario: makeScenario(),
      pack,
      bands: ['B0', 'B1', 'B2'],
    });

    // B0 and B1 have generated turns, B2 has only manual → 2 packets
    expect(packets).toHaveLength(2);
    expect(packets[0].bandContext.bandId).toBe('B0');
    expect(packets[1].bandContext.bandId).toBe('B1');
    expect(packets[0].operation).toBe('refine_scenario');
  });

  it('returns empty array when no bands have eligible turns', () => {
    const pack = makePack({
      bands: [
        makeBand('B0', [makeTurn({ editStatus: 'manual' })]),
      ],
    });

    const packets = assembleScenarioRefinementPackets({
      scenario: makeScenario(),
      pack,
      bands: ['B0'],
    });

    expect(packets).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: parseRefinementProposal
// ---------------------------------------------------------------------------

describe('parseRefinementProposal', () => {
  it('parses a valid proposal', () => {
    const json = JSON.stringify({
      turns: [
        {
          turnId: 'ix-rosa-greeting--B0--t1',
          proposedTargetText: '¿Puedes encontrar la maleta roja?',
          note: 'Added adjective for clarity',
        },
      ],
      note: 'Minor surface improvements',
    });

    const { proposal, error } = parseRefinementProposal(json);

    expect(error).toBeNull();
    expect(proposal).not.toBeNull();
    expect(proposal!.turns).toHaveLength(1);
    expect(proposal!.turns[0].proposedTargetText).toBe('¿Puedes encontrar la maleta roja?');
    expect(proposal!.turns[0].note).toBe('Added adjective for clarity');
    expect(proposal!.note).toBe('Minor surface improvements');
  });

  it('rejects invalid JSON', () => {
    const { proposal, error } = parseRefinementProposal('not json');
    expect(proposal).toBeNull();
    expect(error).toContain('Invalid JSON');
  });

  it('rejects missing turns array', () => {
    const { proposal, error } = parseRefinementProposal(JSON.stringify({ foo: 'bar' }));
    expect(proposal).toBeNull();
    expect(error).toContain('Missing "turns" array');
  });

  it('rejects turns without turnId', () => {
    const json = JSON.stringify({
      turns: [{ proposedTargetText: 'text' }],
    });
    const { proposal, error } = parseRefinementProposal(json);
    expect(proposal).toBeNull();
    expect(error).toContain('missing "turnId"');
  });

  it('rejects turns without proposedTargetText', () => {
    const json = JSON.stringify({
      turns: [{ turnId: 'abc' }],
    });
    const { proposal, error } = parseRefinementProposal(json);
    expect(proposal).toBeNull();
    expect(error).toContain('missing "proposedTargetText"');
  });
});

// ---------------------------------------------------------------------------
// Tests: applyRefinementProposal
// ---------------------------------------------------------------------------

describe('applyRefinementProposal', () => {
  it('applies proposals and sets editStatus to reviewed', () => {
    const band = makeBand('B0', [
      makeTurn({ editStatus: 'generated' }),
      makeTurn({ turnId: 'ix-rosa-greeting--B0--t2', editStatus: 'generated', targetText: 'Es roja.' }),
    ]);

    const proposal = {
      packetVersion: 1 as const,
      turns: [
        {
          turnId: 'ix-rosa-greeting--B0--t1',
          proposedTargetText: 'Improved text',
          note: 'Better phrasing',
        },
      ],
    };

    const { band: updated, appliedTurnIds } = applyRefinementProposal(band, proposal);

    expect(appliedTurnIds).toEqual(['ix-rosa-greeting--B0--t1']);
    expect(updated.turns[0].targetText).toBe('Improved text');
    expect(updated.turns[0].editStatus).toBe('reviewed');
    expect(updated.turns[0].generationNote).toBe('Better phrasing');
    expect(updated.turns[0].stale).toBe(false);
    // Unmatched turn is unchanged
    expect(updated.turns[1].targetText).toBe('Es roja.');
    expect(updated.turns[1].editStatus).toBe('generated');
  });

  it('applies proposedDeliveryText when present', () => {
    const band = makeBand('B0', [makeTurn()]);

    const proposal = {
      packetVersion: 1 as const,
      turns: [
        {
          turnId: 'ix-rosa-greeting--B0--t1',
          proposedTargetText: 'Full target text',
          proposedDeliveryText: 'Mixed delivery text',
        },
      ],
    };

    const { band: updated } = applyRefinementProposal(band, proposal);

    expect(updated.turns[0].targetText).toBe('Full target text');
    expect(updated.turns[0].initialDelivery).toBe('Mixed delivery text');
  });

  it('returns empty appliedTurnIds when no turns match', () => {
    const band = makeBand('B0', [makeTurn()]);

    const proposal = {
      packetVersion: 1 as const,
      turns: [{ turnId: 'nonexistent', proposedTargetText: 'text' }],
    };

    const { appliedTurnIds } = applyRefinementProposal(band, proposal);
    expect(appliedTurnIds).toHaveLength(0);
  });
});
