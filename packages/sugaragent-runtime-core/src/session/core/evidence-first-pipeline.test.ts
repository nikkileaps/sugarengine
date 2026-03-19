import { describe, expect, it } from 'vitest';
import {
  createEvidenceFirstTurnPlanV2,
  runEvidenceFirstPipeline,
  validateAndRepairTurnPlanV2,
} from './evidence-first-pipeline.js';
import { buildEvidencePreview, interpretQuery } from './query-interpretation.js';

describe('evidence-first pipeline planning', () => {
  it('builds inferred claims from compatible corroborating evidence instead of single hedged items', () => {
    const evidencePack = {
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
    const result = runEvidenceFirstPipeline({
      playerMessage: "I'm Mim.",
      routing: {
        intent: 'social_chat',
        confidence: 0.94,
        margin: 0.5,
        candidateScores: [],
        policyPath: 'chat',
      },
      snapshot: {
        npcId: 'npc_rick',
        npcName: 'Rick Cheese Roll',
        mode: 'character',
      },
      evidencePack: { items: [], evidenceIdToItem: new Map() },
      initiativePolicy: {
        decision: {
          action: 'player_respond',
        },
      },
      beatContract: null,
    });

    expect(result.output.utterance).toBe("Nice to meet you, Mim. I'm Rick Cheese Roll.");
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
