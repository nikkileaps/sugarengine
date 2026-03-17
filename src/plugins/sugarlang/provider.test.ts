import { describe, expect, it } from 'vitest';
import { createDefaultNPCInteractionCapabilities } from '../../engine/conversation';
import { createSugarlangScriptedProvider } from './provider';
import { FIND_THE_LUGGAGE_BUNDLE } from './content/find-the-luggage';

describe('createSugarlangScriptedProvider', () => {
  const provider = createSugarlangScriptedProvider({
    contentBundle: FIND_THE_LUGGAGE_BUNDLE,
    getScenarioForNpc: (npcId: string) => npcId === 'station-clerk' ? 'find-the-luggage' : undefined,
    getDialogueTree: () => undefined,
  });

  it('advertises a scenario engagement when the NPC supports scenario interaction', () => {
    const options = provider.getEngagementOptions?.('station-clerk', {
      hasQuestDialogue: false,
      hasBehaviorTree: false,
      npcInteractionCapabilities: createDefaultNPCInteractionCapabilities(),
      targetLanguage: 'es',
      learnerBandOverride: 'B1',
      npcName: 'Station Clerk',
    });

    expect(options).toEqual([
      expect.objectContaining({
        kind: 'scenario',
        providerId: 'sugarlang-scripted',
        presentationKind: 'dialogue_panel',
        driverKind: 'host_turn_driven',
      }),
    ]);
  });

  it('does not advertise a scenario engagement when scenario capability is disabled', () => {
    const options = provider.getEngagementOptions?.('station-clerk', {
      hasQuestDialogue: false,
      hasBehaviorTree: false,
      npcInteractionCapabilities: {
        ...createDefaultNPCInteractionCapabilities(),
        scenario: {
          enabled: false,
          agentAssist: 'disallow',
        },
      },
      targetLanguage: 'es',
      learnerBandOverride: 'B1',
      npcName: 'Station Clerk',
    });

    expect(options).toEqual([]);
  });

  it('only handles the selected scenario engagement lane', () => {
    expect(provider.canHandle('station-clerk', {
      hasQuestDialogue: false,
      hasBehaviorTree: false,
      npcInteractionCapabilities: createDefaultNPCInteractionCapabilities(),
      targetLanguage: 'es',
      learnerBandOverride: 'B1',
      npcName: 'Station Clerk',
      selectedEngagement: {
        kind: 'scenario',
        providerId: 'sugarlang-scripted',
        label: 'Scenario',
        presentationKind: 'dialogue_panel',
        driverKind: 'host_turn_driven',
      },
    })).toBe(true);

    expect(provider.canHandle('station-clerk', {
      hasQuestDialogue: false,
      hasBehaviorTree: false,
      npcInteractionCapabilities: createDefaultNPCInteractionCapabilities(),
      targetLanguage: 'es',
      learnerBandOverride: 'B1',
      npcName: 'Station Clerk',
      selectedEngagement: {
        kind: 'chat',
        providerId: 'sugaragent',
        label: 'Chat',
        presentationKind: 'chat_panel',
        driverKind: 'host_turn_driven',
      },
    })).toBe(false);
  });
});
