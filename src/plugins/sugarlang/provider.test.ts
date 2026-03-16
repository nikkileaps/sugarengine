import { describe, expect, it } from 'vitest';
import { createSugarlangScriptedProvider } from './provider';
import { FIND_THE_LUGGAGE_BUNDLE } from './content/find-the-luggage';

describe('createSugarlangScriptedProvider', () => {
  const provider = createSugarlangScriptedProvider({
    contentBundle: FIND_THE_LUGGAGE_BUNDLE,
    getScenarioForNpc: (npcId: string) => npcId === 'station-clerk' ? 'find-the-luggage' : undefined,
    getDialogueTree: () => undefined,
  });

  it('defers explicit agent-mode NPCs to SugarAgent when that provider is available', () => {
    expect(provider.canHandle('station-clerk', {
      hasQuestDialogue: false,
      hasBehaviorTree: false,
      npcInteractionMode: 'agent',
      hasAgentProvider: true,
      targetLanguage: 'es',
      learnerBandOverride: 'B1',
      npcName: 'Station Clerk',
    })).toBe(false);
  });

  it('falls back to scripted delivery when agent mode is set but SugarAgent is unavailable', () => {
    expect(provider.canHandle('station-clerk', {
      hasQuestDialogue: false,
      hasBehaviorTree: false,
      npcInteractionMode: 'agent',
      hasAgentProvider: false,
      targetLanguage: 'es',
      learnerBandOverride: 'B1',
      npcName: 'Station Clerk',
    })).toBe(true);
  });

  it('keeps hybrid mode scripted until the active band explicitly prefers agent delivery', () => {
    expect(provider.canHandle('station-clerk', {
      hasQuestDialogue: false,
      hasBehaviorTree: false,
      npcInteractionMode: 'hybrid',
      hasAgentProvider: true,
      targetLanguage: 'es',
      learnerBandOverride: 'B1',
      npcName: 'Station Clerk',
    })).toBe(true);

    expect(provider.canHandle('station-clerk', {
      hasQuestDialogue: false,
      hasBehaviorTree: false,
      npcInteractionMode: 'hybrid',
      hasAgentProvider: true,
      targetLanguage: 'es',
      learnerBandOverride: 'B4',
      npcName: 'Station Clerk',
    })).toBe(false);
  });
});
