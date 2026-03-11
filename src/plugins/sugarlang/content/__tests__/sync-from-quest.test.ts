import { describe, expect, it } from 'vitest';
import { syncInteractionsFromQuest, type SyncFromQuestInput } from '../sync-from-quest';
import type { QuestDefinition } from '../../../../engine/quests/types';
import type { DialogueTree } from '../../../../engine/dialogue/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuest(overrides: Partial<QuestDefinition> = {}): QuestDefinition {
  return {
    id: 'quest-1',
    name: 'Test Quest',
    description: 'A test quest',
    startStage: 'stage-1',
    stages: [],
    ...overrides,
  };
}

function makeDialogueTree(id: string, nodes: DialogueTree['nodes'] = [], startNode?: string): DialogueTree {
  return {
    id,
    startNode: startNode ?? nodes[0]?.id ?? 'node-1',
    nodes,
  };
}

const SCENARIO_ID = 'test-scenario';

function makeInput(overrides: Partial<SyncFromQuestInput> = {}): SyncFromQuestInput {
  return {
    quest: makeQuest(),
    dialogues: [],
    npcs: [],
    scenarioId: SCENARIO_ID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('syncInteractionsFromQuest', () => {
  it('derives one interaction from a talk node with dialogue', () => {
    const dialogue = makeDialogueTree('dlg-1', [
      { id: 'n1', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'Hello traveler!', next: [{ nodeId: 'n2' }] },
      { id: 'n2', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'Welcome to the station.' },
    ]);

    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Talk to Rosa',
          objectives: [{
            id: 'obj-talk-rosa',
            type: 'talk',
            target: 'npc-rosa',
            dialogue: 'dlg-1',
            description: 'Talk to Rosa',
            completed: false,
          }],
        }],
      }),
      dialogues: [dialogue],
      npcs: [{ id: 'npc-rosa', name: 'Rosa' }],
    }));

    expect(result.interactions).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);

    const ix = result.interactions[0];
    expect(ix.interactionId).toBe(`${SCENARIO_ID}--obj-talk-rosa`);
    expect(ix.sourceQuestNodeId).toBe('obj-talk-rosa');
    expect(ix.sourceStageId).toBe('stage-1');
    expect(ix.sourceDialogueId).toBe('dlg-1');
    expect(ix.sourceDialogueNodeIds).toEqual(['n1', 'n2']);
    expect(ix.npcId).toBe('npc-rosa');
    expect(ix.npcName).toBe('Rosa');
    expect(ix.sourceDialogueText).toEqual(['Hello traveler!', 'Welcome to the station.']);
    expect(ix.worldObjectRefs).toEqual([]);
  });

  it('derives one interaction from a narrative dialogue node', () => {
    const dialogue = makeDialogueTree('dlg-narr', [
      { id: 'nd1', speaker: 'Guard', speakerId: 'npc-guard', text: 'Halt! Who goes there?' },
    ]);

    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Guard interrupts',
          objectives: [{
            id: 'obj-narr-dlg',
            type: 'talk',
            target: 'npc-guard',
            description: 'Guard dialogue',
            completed: false,
            nodeType: 'narrative',
            narrativeType: 'dialogue',
            dialogueId: 'dlg-narr',
          }],
        }],
      }),
      dialogues: [dialogue],
      npcs: [{ id: 'npc-guard', name: 'Guard' }],
    }));

    expect(result.interactions).toHaveLength(1);
    const ix = result.interactions[0];
    expect(ix.sourceDialogueId).toBe('dlg-narr');
    expect(ix.sourceDialogueText).toEqual(['Halt! Who goes there?']);
  });

  it('derives one interaction from a voiceover node', () => {
    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Inner monologue',
          objectives: [{
            id: 'obj-vo',
            type: 'talk',
            target: 'player',
            description: 'Player thinks',
            completed: false,
            nodeType: 'narrative',
            narrativeType: 'voiceover',
            voiceoverText: 'I need to find my luggage.',
          }],
        }],
      }),
    }));

    expect(result.interactions).toHaveLength(1);
    const ix = result.interactions[0];
    expect(ix.sourceDialogueText).toEqual(['I need to find my luggage.']);
    expect(ix.sourceDialogueId).toBeUndefined();
  });

  it('derives one interaction from a collect node with worldObjectRefs', () => {
    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Collect luggage',
          objectives: [{
            id: 'obj-collect',
            type: 'collect',
            target: 'item-suitcase',
            description: 'Pick up the suitcase',
            completed: false,
          }],
        }],
      }),
    }));

    expect(result.interactions).toHaveLength(1);
    const ix = result.interactions[0];
    expect(ix.worldObjectRefs).toEqual(['item-suitcase']);
    expect(ix.grounding.worldObjectRefs).toEqual([{ objectId: 'item-suitcase', label: 'item-suitcase' }]);
  });

  it('skips condition and branch nodes', () => {
    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Gates',
          objectives: [
            {
              id: 'obj-cond',
              type: 'trigger',
              description: 'Has key?',
              completed: false,
              nodeType: 'condition',
              condition: { operator: 'hasItem', operand: 'key-1' },
            },
            {
              id: 'obj-branch',
              type: 'trigger',
              description: 'Route choice',
              completed: false,
              nodeType: 'branch',
              condition: { operator: 'hasFlag', operand: 'spoke-to-guard' },
            },
          ],
        }],
      }),
    }));

    expect(result.interactions).toHaveLength(0);
  });

  it('skips location node with no dialogue', () => {
    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Go to station',
          objectives: [{
            id: 'obj-loc',
            type: 'location',
            target: 'trigger-station',
            description: 'Go to the station',
            completed: false,
          }],
        }],
      }),
    }));

    expect(result.interactions).toHaveLength(0);
  });

  it('orders interactions by stage order then topological order within stage', () => {
    const dlgA = makeDialogueTree('dlg-a', [
      { id: 'a1', speaker: 'NPC', speakerId: 'npc-1', text: 'Line A' },
    ]);
    const dlgB = makeDialogueTree('dlg-b', [
      { id: 'b1', speaker: 'NPC', speakerId: 'npc-1', text: 'Line B' },
    ]);
    const dlgC = makeDialogueTree('dlg-c', [
      { id: 'c1', speaker: 'NPC', speakerId: 'npc-1', text: 'Line C' },
    ]);

    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [
          {
            id: 'stage-1',
            description: 'First stage',
            objectives: [
              // B depends on A (prerequisites), so A should come first
              { id: 'obj-b', type: 'talk', target: 'npc-1', dialogue: 'dlg-b', description: 'B', completed: false, prerequisites: ['obj-a'] },
              { id: 'obj-a', type: 'talk', target: 'npc-1', dialogue: 'dlg-a', description: 'A', completed: false },
            ],
          },
          {
            id: 'stage-2',
            description: 'Second stage',
            objectives: [
              { id: 'obj-c', type: 'talk', target: 'npc-1', dialogue: 'dlg-c', description: 'C', completed: false },
            ],
          },
        ],
      }),
      dialogues: [dlgA, dlgB, dlgC],
      npcs: [{ id: 'npc-1', name: 'NPC' }],
    }));

    expect(result.interactions).toHaveLength(3);
    expect(result.interactions[0].sourceQuestNodeId).toBe('obj-a');
    expect(result.interactions[0].sourceStageId).toBe('stage-1');
    expect(result.interactions[1].sourceQuestNodeId).toBe('obj-b');
    expect(result.interactions[1].sourceStageId).toBe('stage-1');
    expect(result.interactions[2].sourceQuestNodeId).toBe('obj-c');
    expect(result.interactions[2].sourceStageId).toBe('stage-2');
  });

  it('includes choice labels in sourceDialogueText and all node IDs', () => {
    const dialogue = makeDialogueTree('dlg-choices', [
      {
        id: 'n1',
        speaker: 'Rosa',
        speakerId: 'npc-rosa',
        text: 'Where do you want to go?',
        next: [
          { nodeId: 'n2', text: 'To the market' },
          { nodeId: 'n3', text: 'To the station' },
        ],
      },
      { id: 'n2', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'The market is this way.' },
      { id: 'n3', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'The station is over there.' },
    ]);

    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Ask Rosa',
          objectives: [{
            id: 'obj-ask',
            type: 'talk',
            target: 'npc-rosa',
            dialogue: 'dlg-choices',
            description: 'Ask Rosa for directions',
            completed: false,
          }],
        }],
      }),
      dialogues: [dialogue],
      npcs: [{ id: 'npc-rosa', name: 'Rosa' }],
    }));

    expect(result.interactions).toHaveLength(1);
    const ix = result.interactions[0];
    expect(ix.sourceDialogueNodeIds).toEqual(['n1', 'n2', 'n3']);
    expect(ix.sourceDialogueText).toContain('Where do you want to go?');
    expect(ix.sourceDialogueText).toContain('To the market');
    expect(ix.sourceDialogueText).toContain('To the station');
    expect(ix.sourceDialogueText).toContain('The market is this way.');
    expect(ix.sourceDialogueText).toContain('The station is over there.');
  });

  it('emits warning and skips node when dialogue tree is missing', () => {
    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Talk',
          objectives: [{
            id: 'obj-missing-dlg',
            type: 'talk',
            target: 'npc-rosa',
            dialogue: 'dlg-nonexistent',
            description: 'Talk to Rosa',
            completed: false,
          }],
        }],
      }),
      dialogues: [],
      npcs: [{ id: 'npc-rosa', name: 'Rosa' }],
    }));

    // Still produces an interaction (with empty dialogue data) but warns
    expect(result.interactions).toHaveLength(1);
    expect(result.interactions[0].sourceDialogueText).toEqual([]);
    expect(result.interactions[0].sourceDialogueNodeIds).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('dlg-nonexistent');
  });

  it('is idempotent: calling twice produces identical output', () => {
    const dialogue = makeDialogueTree('dlg-1', [
      { id: 'n1', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'Hello!' },
    ]);
    const input = makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Greet',
          objectives: [{
            id: 'obj-greet',
            type: 'talk',
            target: 'npc-rosa',
            dialogue: 'dlg-1',
            description: 'Greet Rosa',
            completed: false,
          }],
        }],
      }),
      dialogues: [dialogue],
      npcs: [{ id: 'npc-rosa', name: 'Rosa' }],
    });

    const result1 = syncInteractionsFromQuest(input);
    const result2 = syncInteractionsFromQuest(input);

    expect(result1).toEqual(result2);
  });

  it('quest-success hook has correct questId and sourceNodeId', () => {
    const dialogue = makeDialogueTree('dlg-1', [
      { id: 'n1', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'Hello!' },
    ]);

    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        id: 'quest-luggage',
        stages: [{
          id: 'stage-1',
          description: 'Find it',
          objectives: [
            {
              id: 'obj-talk',
              type: 'talk',
              target: 'npc-rosa',
              dialogue: 'dlg-1',
              description: 'Talk',
              completed: false,
            },
            {
              id: 'obj-collect',
              type: 'collect',
              target: 'item-bag',
              description: 'Collect',
              completed: false,
            },
          ],
        }],
      }),
      dialogues: [dialogue],
      npcs: [{ id: 'npc-rosa', name: 'Rosa' }],
    }));

    expect(result.interactions).toHaveLength(2);

    const talkHook = result.interactions[0].questSuccessHook!;
    expect(talkHook.questId).toBe('quest-luggage');
    expect(talkHook.sourceNodeId).toBe('obj-talk');
    expect(talkHook.action).toBe('complete_objective');

    const collectHook = result.interactions[1].questSuccessHook!;
    expect(collectHook.questId).toBe('quest-luggage');
    expect(collectHook.sourceNodeId).toBe('obj-collect');
  });

  it('skips Narrator and Excerpt speaker lines from sourceDialogueText', () => {
    const dialogue = makeDialogueTree('dlg-mixed', [
      { id: 'n1', speaker: 'Narrator', text: 'The traveler approaches.', next: [{ nodeId: 'n2' }] },
      { id: 'n2', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'Buenos dias!', next: [{ nodeId: 'n3' }] },
      { id: 'n3', speaker: 'Excerpt', text: 'A sign reads: Bienvenidos.' },
    ]);

    const result = syncInteractionsFromQuest(makeInput({
      quest: makeQuest({
        stages: [{
          id: 'stage-1',
          description: 'Talk',
          objectives: [{
            id: 'obj-1',
            type: 'talk',
            target: 'npc-rosa',
            dialogue: 'dlg-mixed',
            description: 'Talk to Rosa',
            completed: false,
          }],
        }],
      }),
      dialogues: [dialogue],
      npcs: [{ id: 'npc-rosa', name: 'Rosa' }],
    }));

    expect(result.interactions).toHaveLength(1);
    const ix = result.interactions[0];
    // Only Rosa's line should be included
    expect(ix.sourceDialogueText).toEqual(['Buenos dias!']);
    // But all node IDs should be captured
    expect(ix.sourceDialogueNodeIds).toEqual(['n1', 'n2', 'n3']);
  });
});
