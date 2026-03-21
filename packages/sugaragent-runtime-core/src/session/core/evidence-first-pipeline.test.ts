import { describe, expect, it } from 'vitest';
import {
  createEvidenceFirstTurnPlanV2,
  validateAndRepairTurnPlanV2,
} from './plan/planning.js';
import {
  buildDeterministicSocialReply,
} from './turn-realization.js';
import { buildEvidencePreview, interpretQuery } from './query-interpretation.js';

describe('evidence-first pipeline planning', () => {
  it('builds inferred claims from compatible corroborating evidence instead of single hedged items', () => {
    const evidencePack: any = {
      items: [
        {
          evidenceId: 'e_shift',
          sourceId: 'lore:bridge-shift',
          sourceType: 'lore_chunk',
          ownerType: 'world',
          knowledgeClass: 'faction_internal',
          accessPolicy: 'hedged',
          disclosurePolicy: 'answer_only',
          text: 'The old bridge is watched after dark',
          verificationStatus: 'verified',
          entityIds: ['bridge_old'],
          selfAttributed: false,
          confidence: 0.8,
        },
        {
          evidenceId: 'e_internal',
          sourceId: 'lore:bridge-faction',
          sourceType: 'lore_chunk',
          ownerType: 'world',
          knowledgeClass: 'faction_internal',
          accessPolicy: 'hedged',
          disclosurePolicy: 'answer_only',
          text: 'Guards quietly rotate through the old bridge every night',
          verificationStatus: 'verified',
          entityIds: ['bridge_old'],
          selfAttributed: false,
          confidence: 0.73,
        },
      ],
      evidenceIdToItem: new Map(),
    };

    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_guard',
      npcName: 'Ilya',
      playerMessage: 'What can you tell me about the old bridge?',
      queryType: 'world_query',
      routing: { intent: 'lore_world' },
      evidencePack,
      selfEntityId: 'npc_guard',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    const inferredClaims = plan.claims.filter((claim) => claim.mode === 'inferred');
    expect(inferredClaims).toHaveLength(1);
    expect(inferredClaims[0]?.evidenceIds).toHaveLength(2);
    expect(inferredClaims[0]?.text).toBe('The old bridge is watched after dark');
  });

  it('rejects inferred claims that are backed by only one evidence item', () => {
    const validation = validateAndRepairTurnPlanV2({
      plan: {
        schemaVersion: 1,
        pipelineVersion: 'evidence_first_v1',
        mode: 'character',
        routeIntent: 'lore_world',
        queryType: 'world_query',
        speechAct: 'answer',
        claims: [
          {
            claimId: 'c_1',
            mode: 'inferred',
            subject: 'world',
            ownerType: 'world',
            text: 'The old bridge is guarded at night',
            evidenceIds: ['e_only'],
            confidence: 0.7,
            requiredHedge: 'soft',
            maxSpecificity: 'bounded',
          },
        ],
        socialActs: [],
        questionBack: null,
        memoryWrites: [],
        initiativeDecision: {},
        abstention: null,
      },
      evidencePack: {
        items: [
          {
            evidenceId: 'e_only',
            sourceId: 'lore:bridge-faction',
            sourceType: 'lore_chunk',
            ownerType: 'world',
            knowledgeClass: 'faction_internal',
            accessPolicy: 'hedged',
            disclosurePolicy: 'answer_only',
            text: 'The old bridge is guarded at night',
            verificationStatus: 'verified',
            entityIds: ['bridge_old'],
            selfAttributed: false,
            confidence: 0.73,
          },
        ],
        evidenceIdToItem: new Map([
          ['e_only', {
            evidenceId: 'e_only',
            sourceId: 'lore:bridge-faction',
            sourceType: 'lore_chunk',
            ownerType: 'world',
            knowledgeClass: 'faction_internal',
            accessPolicy: 'hedged',
            disclosurePolicy: 'answer_only',
            text: 'The old bridge is guarded at night',
            verificationStatus: 'verified',
            entityIds: ['bridge_old'],
            selfAttributed: false,
            confidence: 0.73,
          }],
        ]),
      },
      snapshot: {
        npcId: 'npc_guard',
        npcName: 'Ilya',
        mode: 'character',
      },
    });

    expect(validation.acceptable).toBe(false);
    expect(validation.plan.claims).toEqual([]);
    expect(validation.errors).toContain('inferred claim requires corroborating evidence: The old bridge is guarded at night');
  });

  it('uses direct social replies for introductions instead of placeholder chat', () => {
    const result = buildDeterministicSocialReply(
      "I'm Mim.",
      {
        npcId: 'npc_rick',
        npcName: 'Rick Cheese Roll',
        mode: 'character',
      },
      null,
      [],
    );

    expect(result.utterance).toBe("Nice to meet you, Mim. I'm Rick Cheese Roll.");
  });

  it('normalizes self-profile evidence into a direct name answer', () => {
    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_rick',
      npcName: 'Rick Cheese Roll',
      playerMessage: "What's your name?",
      queryType: 'self_query',
      routing: { intent: 'identity_self' },
      evidencePack: {
        items: [
          {
            evidenceId: 'ev_1',
            sourceId: 'self:npc_rick',
            sourceType: 'self_profile',
            ownerType: 'npc',
            knowledgeClass: 'self_profile',
            accessPolicy: 'assert',
            disclosurePolicy: 'answer_only',
            text: 'NPC name: Rick Cheese Roll. Persona: a neighborhood baker.',
            verificationStatus: 'available',
            entityIds: ['npc_rick'],
            selfAttributed: true,
            confidence: 0.9,
          },
        ],
        evidenceIdToItem: new Map(),
      },
      selfEntityId: 'npc_rick',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    expect(plan.claims[0]?.text).toBe('my name is Rick Cheese Roll');
  });

  it('maps self-attributed npc lore into a first-person job answer on self queries', () => {
    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_rick',
      npcName: 'Rick Roll',
      playerMessage: 'What do you do for a job?',
      queryType: 'self_query',
      routing: { intent: 'identity_self' },
      evidencePack: {
        items: [
          {
            evidenceId: 'ev_1',
            sourceId: 'lore:npc_rick',
            sourceType: 'lore_chunk',
            ownerType: 'npc',
            knowledgeClass: 'public_fact',
            accessPolicy: 'assert',
            disclosurePolicy: 'answer_only',
            text: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
            verificationStatus: 'available',
            entityIds: ['npc.rick-roll'],
            selfAttributed: true,
            confidence: 0.88,
            anchorTerms: ['job', 'work', 'shop'],
          },
        ],
        evidenceIdToItem: new Map(),
      },
      selfEntityId: 'npc.rick-roll',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    expect(plan.claims[0]?.text).toBe('I own a Cheese Shop in Wordlark Hollow Station');
  });

  it('maps self-attributed preference lore into a first-person preference answer on self queries', () => {
    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_rick',
      npcName: 'Rick Roll',
      playerMessage: 'Do you like cheese?',
      queryType: 'self_query',
      routing: {
        intent: 'identity_self',
        interpretation: {
          schemaVersion: 1,
          lane: 'knowledge',
          target: 'self',
          facet: 'preference',
          timeframe: 'habitual',
          focusText: 'Do you like cheese?',
          normalizedText: 'do you like cheese',
          referents: [],
          discourse: {
            repair: false,
            filler: false,
            contrast: false,
            emphasis: false,
          },
          candidateScores: [],
          confidence: 0.9,
          margin: 0.4,
          ambiguous: false,
        },
      },
      evidencePack: {
        items: [
          {
            evidenceId: 'ev_1',
            sourceId: 'lore:npc_rick',
            sourceType: 'lore_chunk',
            ownerType: 'npc',
            knowledgeClass: 'public_fact',
            accessPolicy: 'assert',
            disclosurePolicy: 'answer_only',
            text: 'Rick Roll owns a Cheese Shop in Wordlark Hollow Station. He loves cheese.',
            verificationStatus: 'available',
            entityIds: ['npc.rick-roll'],
            selfAttributed: true,
            confidence: 0.88,
            anchorTerms: ['cheese', 'love', 'likes'],
          },
        ],
        evidenceIdToItem: new Map(),
      },
      selfEntityId: 'npc.rick-roll',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    expect(plan.claims[0]?.text).toBe('I love cheese');
  });

  it('does not use self-profile evidence to answer a lore-other question', () => {
    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_rick',
      npcName: 'Rick Cheese Roll',
      playerMessage: 'Do you know anything about Earendale?',
      queryType: 'other_query',
      routing: { intent: 'lore_other' },
      evidencePack: {
        items: [
          {
            evidenceId: 'ev_1',
            sourceId: 'self:npc_rick',
            sourceType: 'self_profile',
            ownerType: 'npc',
            knowledgeClass: 'self_profile',
            accessPolicy: 'assert',
            disclosurePolicy: 'answer_only',
            text: 'NPC name: Rick Cheese Roll. Persona: Funky old dude who loves cheese and is obsessed with it.',
            verificationStatus: 'available',
            entityIds: ['npc_rick'],
            selfAttributed: true,
            confidence: 0.9,
          },
        ],
        evidenceIdToItem: new Map(),
      },
      selfEntityId: 'npc_rick',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    expect(plan.claims).toEqual([]);
    expect(plan.speechAct).toBe('uncertain');
  });

  it('falls back to uncertainty when lore only matches the place anchor but not the asked detail', () => {
    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_rick',
      npcName: 'Rick Cheese Roll',
      playerMessage: 'I want to know if they have good pancakes in Earendale?',
      queryType: 'world_query',
      routing: { intent: 'lore_world' },
      evidencePack: {
        items: [
          {
            evidenceId: 'ev_1',
            sourceId: 'fact:earendale-season',
            sourceType: 'lore_chunk',
            ownerType: 'world',
            knowledgeClass: 'public_fact',
            accessPolicy: 'assert',
            disclosurePolicy: 'answer_only',
            text: 'In its peak season the population swells due to visitors coming and going from the resort.',
            verificationStatus: 'available',
            entityIds: [],
            anchorTerms: ['Earendale', 'town.earendale', 'locations.earendale'],
            selfAttributed: false,
            confidence: 0.86,
          },
        ],
        evidenceIdToItem: new Map(),
      },
      selfEntityId: 'npc_rick',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    expect(plan.claims).toEqual([]);
    expect(plan.speechAct).toBe('uncertain');
    expect(plan.abstention?.reason).toBe('no_claimable_evidence');
  });

  it('prefers direct-subject evidence over incidental related-page trivia on overview turns', () => {
    const interpretation = {
      schemaVersion: 1 as const,
      lane: 'knowledge' as const,
      target: 'world' as const,
      facet: 'general_lore' as const,
      timeframe: 'unknown' as const,
      focusText: 'Earendale',
      normalizedText: 'do you know anything about earendale',
      referents: [],
      discourse: {
        repair: false,
        filler: false,
        contrast: false,
        emphasis: false,
      },
      candidateScores: [],
      confidence: 0.94,
      margin: 0.42,
      ambiguous: false,
      primaryReferent: {
        id: 'locations.earendale',
        text: 'Earendale',
        kind: 'location' as const,
        confidence: 0.96,
      },
      relationPolicy: {
        facet: 'general_lore' as const,
        preferredRelationDistances: ['primary', 'associated'] as Array<'primary' | 'associated'>,
        incidentalAllowed: false,
        associatedFallbackAllowed: true,
        evidenceBudget: {
          maxPrimary: 2,
          maxAssociated: 1,
        },
      },
    };

    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_rick',
      npcName: 'Rick Cheese Roll',
      playerMessage: 'Do you know anything about Earendale?',
      queryType: 'world_query',
      routing: { intent: 'lore_world', interpretation },
      evidencePack: {
        items: [
          {
            evidenceId: 'ev_1',
            sourceId: 'lore:earendale',
            sourceType: 'lore_chunk',
            ownerType: 'world',
            knowledgeClass: 'public_fact',
            accessPolicy: 'assert',
            disclosurePolicy: 'answer_only',
            text: 'Earendale is a market town with a busy station.',
            verificationStatus: 'available',
            entityIds: [],
            locationIds: ['locations.earendale'],
            selfAttributed: false,
            confidence: 0.92,
            relationDistance: 'primary' as const,
            relationStrength: 1,
            relationReason: 'direct_id_match' as const,
            subjectId: 'locations.earendale',
            subjectKind: 'location' as const,
          },
          {
            evidenceId: 'ev_2',
            sourceId: 'lore:bippity-family',
            sourceType: 'lore_chunk',
            ownerType: 'world',
            knowledgeClass: 'public_fact',
            accessPolicy: 'assert',
            disclosurePolicy: 'answer_only',
            text: "His wife's name is Janet Roo.",
            verificationStatus: 'available',
            entityIds: ['npc.bippity-roo'],
            selfAttributed: false,
            confidence: 0.88,
            relationDistance: 'incidental' as const,
            relationStrength: 0.18,
            relationReason: 'tag_only' as const,
            subjectId: 'npc.bippity-roo',
            subjectKind: 'npc' as const,
          },
        ],
        evidenceIdToItem: new Map(),
      },
      selfEntityId: 'npc_rick',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    expect(plan.claims).toHaveLength(1);
    expect(plan.claims[0]?.text).toContain('Earendale');
    expect(plan.claims[0]?.text).not.toContain('Janet Roo');
    expect(plan.claims[0]?.relationDistance).toBe('primary');
  });

  it('gracefully promotes associated evidence when no direct-subject evidence exists', () => {
    const interpretation = {
      schemaVersion: 1 as const,
      lane: 'knowledge' as const,
      target: 'world' as const,
      facet: 'general_lore' as const,
      timeframe: 'unknown' as const,
      focusText: 'Earendale',
      normalizedText: 'do you know anything about earendale',
      referents: [],
      discourse: {
        repair: false,
        filler: false,
        contrast: false,
        emphasis: false,
      },
      candidateScores: [],
      confidence: 0.91,
      margin: 0.38,
      ambiguous: false,
      primaryReferent: {
        id: 'locations.earendale',
        text: 'Earendale',
        kind: 'location' as const,
        confidence: 0.95,
      },
      relationPolicy: {
        facet: 'general_lore' as const,
        preferredRelationDistances: ['primary', 'associated'] as Array<'primary' | 'associated'>,
        incidentalAllowed: false,
        associatedFallbackAllowed: true,
        evidenceBudget: {
          maxPrimary: 2,
          maxAssociated: 1,
        },
      },
    };

    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_rick',
      npcName: 'Rick Cheese Roll',
      playerMessage: 'Do you know anything about Earendale?',
      queryType: 'world_query',
      routing: { intent: 'lore_world', interpretation },
      evidencePack: {
        items: [
          {
            evidenceId: 'ev_1',
            sourceId: 'lore:bippity-home',
            sourceType: 'lore_chunk',
            ownerType: 'world',
            knowledgeClass: 'public_fact',
            accessPolicy: 'assert',
            disclosurePolicy: 'answer_only',
            text: 'Bippity Roo lives in Earendale.',
            verificationStatus: 'available',
            entityIds: ['npc.bippity-roo'],
            locationIds: ['locations.earendale'],
            selfAttributed: false,
            confidence: 0.87,
            relationDistance: 'associated' as const,
            relationStrength: 0.78,
            relationReason: 'associated_location_relation' as const,
            subjectId: 'npc.bippity-roo',
            subjectKind: 'npc' as const,
          },
        ],
        evidenceIdToItem: new Map(),
      },
      selfEntityId: 'npc_rick',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    expect(plan.claims).toHaveLength(1);
    expect(plan.claims[0]?.text).toContain('Bippity Roo lives in Earendale');
    expect(plan.claims[0]?.relationDistance).toBe('associated');
  });

  it('treats current npc activity from routine state as directly answerable self evidence', () => {
    const interpretation = interpretQuery({
      playerMessage: 'What are you doing right now?',
      npcName: 'Rick Roll',
      evidencePreview: buildEvidencePreview({
        currentActivity: 'watching the station and minding the cheese stall',
      }),
    });

    const { plan } = createEvidenceFirstTurnPlanV2({
      npcId: 'npc_rick',
      npcName: 'Rick Roll',
      playerMessage: 'What are you doing right now?',
      queryType: 'self_query',
      routing: {
        intent: 'identity_self',
        interpretation,
      },
      evidencePack: {
        items: [
          {
            evidenceId: 'ev_1',
            sourceId: 'runtime:current_activity',
            sourceType: 'routine_state',
            ownerType: 'npc',
            knowledgeClass: 'routine_state',
            accessPolicy: 'assert',
            disclosurePolicy: 'volunteer_ok',
            text: 'Right now I am watching the station and minding the cheese stall.',
            verificationStatus: 'verified',
            entityIds: ['npc.rick-roll'],
            anchorTerms: ['current activity', 'what are you doing', 'doing right now'],
            selfAttributed: true,
            confidence: 0.9,
          },
        ],
        evidenceIdToItem: new Map(),
      },
      selfEntityId: 'npc.rick-roll',
      mode: 'character',
      beatContract: null,
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
    });

    expect(plan.speechAct).toBe('answer');
    expect(plan.claims[0]?.text).toContain('watching the station');
  });
});
