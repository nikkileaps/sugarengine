import { describe, expect, it } from 'vitest';
import {
  generateBandedTurns,
  walkDialogueForTurnDerivation,
  matchVocabulary,
  assignVocabularyRoles,
  selectResponseModeForBand,
  buildRepairLadder,
  deriveEvaluation,
  renderLineForBand,
  type BandedTurnGenerationInput,
  type DialogueLine,
  type VocabMatch,
  type RolePlan,
} from '../generate-banded-turns';
import type { DerivedInteraction, LexiconEntry, LexiconPack, LearnerBandId } from '../../types';
import type { DialogueTree } from '../../../../engine/dialogue/types';
import { PLAYER, NARRATOR, EXCERPT } from '../../../../engine/dialogue/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLexicon(entries: Partial<LexiconEntry>[] = []): LexiconPack {
  return {
    targetLanguage: 'es',
    entries: entries.map((e, i) => ({
      lexicalEntryId: e.lexicalEntryId ?? `entry-${i}`,
      targetForm: e.targetForm ?? `form-${i}`,
      gloss: e.gloss ?? `gloss-${i}`,
      category: e.category ?? 'object',
      introductionBand: e.introductionBand ?? 'B0',
      usage: e.usage ?? 'active',
      groundable: e.groundable ?? false,
      ...e,
    })),
  };
}

function makeInteraction(overrides: Partial<DerivedInteraction> = {}): DerivedInteraction {
  return {
    interactionId: 'test-scenario--obj-1',
    sourceQuestNodeId: 'obj-1',
    sourceStageId: 'stage-1',
    sourceDialogueNodeIds: [],
    npcId: 'npc-rosa',
    npcName: 'Rosa',
    worldObjectRefs: [],
    grounding: {
      npcId: 'npc-rosa',
      npcName: 'Rosa',
      worldObjectRefs: [],
      attributes: [],
      questBindingRefs: [],
    },
    sourceDialogueText: [],
    ...overrides,
  };
}

function makeLine(overrides: Partial<DialogueLine> = {}): DialogueLine {
  return {
    nodeId: 'n1',
    text: 'Hello',
    isPlayerLine: false,
    isNarrator: false,
    isExcerpt: false,
    choiceLabels: [],
    ...overrides,
  };
}

const HELLO_LEXICON = makeLexicon([
  { lexicalEntryId: 'phrase.hello', targetForm: 'hola', gloss: 'hello', introductionBand: 'B0', category: 'phrase' },
  { lexicalEntryId: 'phrase.my_name_is', targetForm: 'me llamo', gloss: 'my name is', introductionBand: 'B0', category: 'phrase' },
  { lexicalEntryId: 'verb.am', targetForm: 'soy', gloss: 'am', introductionBand: 'B0', category: 'verb' },
  { lexicalEntryId: 'object.suitcase', targetForm: 'maleta', gloss: 'suitcase', introductionBand: 'B1', category: 'object' },
  { lexicalEntryId: 'color.red', targetForm: 'roja', gloss: 'red', introductionBand: 'B1', category: 'color' },
  { lexicalEntryId: 'verb.is_located', targetForm: 'esta', gloss: 'is / is located', introductionBand: 'B1', category: 'verb' },
  { lexicalEntryId: 'verb.help', targetForm: 'ayudar', gloss: 'help', introductionBand: 'B2', category: 'verb' },
  { lexicalEntryId: 'phrase.where_is', targetForm: 'donde esta', gloss: 'where is', introductionBand: 'B2', category: 'phrase' },
  { lexicalEntryId: 'object.door', targetForm: 'puerta', gloss: 'door', introductionBand: 'B3', category: 'object' },
]);

const ALL_BANDS: LearnerBandId[] = ['B0', 'B1', 'B2', 'B3', 'B4'];

function makeInput(overrides: Partial<BandedTurnGenerationInput> = {}): BandedTurnGenerationInput {
  return {
    interaction: makeInteraction(),
    dialogueLines: [makeLine({ text: 'Hello. My name is Rosa.' })],
    lexicon: HELLO_LEXICON,
    targetLanguage: 'es',
    supportLanguage: 'en',
    bands: ['B0'],
    npcName: 'Rosa',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateBandedTurns', () => {
  // 1. Single NPC line, no choices — NPC speaks, no learner_response
  it('produces only npc_delivery with free_form when no explicit choices', () => {
    const result = generateBandedTurns(makeInput({
      dialogueLines: [makeLine({ text: 'Hello traveler.', speaker: 'Rosa', speakerId: 'npc-rosa' })],
      bands: ['B0'],
    }));

    expect(result.bands).toHaveLength(1);
    const band = result.bands[0];
    expect(band.bandId).toBe('B0');

    // Only the NPC delivery turn — no learner_response invented
    expect(band.turns).toHaveLength(1);
    const npcTurn = band.turns[0];
    expect(npcTurn.turnRole).toBe('npc_delivery');
    expect(npcTurn.responseMode).toBe('free_form');
    expect(npcTurn.responseData).toBeUndefined();
    expect(npcTurn.evaluation).toBeUndefined();
  });

  // 2. NPC line with player choices
  it('produces npc_delivery + learner_response with explicit_choice for NPC lines with choices', () => {
    const result = generateBandedTurns(makeInput({
      dialogueLines: [
        makeLine({
          text: 'Where do you want to go?',
          speaker: 'Rosa',
          choiceLabels: ['To the market', 'To the station'],
        }),
      ],
      bands: ['B0'],
    }));

    const band = result.bands[0];
    const responseTurn = band.turns.find((t) => t.turnRole === 'learner_response')!;
    expect(responseTurn).toBeDefined();
    expect(responseTurn.responseSource).toBe('explicit_choice');
  });

  // 3. Player line
  it('produces player_delivery with no response contract for player lines', () => {
    const result = generateBandedTurns(makeInput({
      dialogueLines: [
        makeLine({ text: 'Hello Rosa!', isPlayerLine: true, speaker: 'Holly', speakerId: PLAYER.id }),
        makeLine({ text: 'Welcome!', speaker: 'Rosa', speakerId: 'npc-rosa' }),
      ],
      bands: ['B0'],
    }));

    const band = result.bands[0];
    const playerTurn = band.turns.find((t) => t.turnRole === 'player_delivery')!;
    expect(playerTurn).toBeDefined();
    expect(playerTurn.responseMode).toBe('free_form');
  });

  // 4. Narrator/excerpt lines are skipped
  it('skips narrator and excerpt lines entirely', () => {
    const result = generateBandedTurns(makeInput({
      dialogueLines: [
        makeLine({ text: 'The sun sets.', isNarrator: true, speaker: 'Narrator' }),
        makeLine({ text: 'A sign reads: Welcome.', isExcerpt: true, speaker: 'Excerpt' }),
        makeLine({ text: 'Hello!', speaker: 'Rosa', speakerId: 'npc-rosa' }),
      ],
      bands: ['B0'],
    }));

    const band = result.bands[0];
    // Only the NPC line should be present — no player or narrator turns
    expect(band.turns.every((t) => t.turnRole !== 'player_delivery')).toBe(true);
    const npcTurns = band.turns.filter((t) => t.turnRole === 'npc_delivery');
    expect(npcTurns).toHaveLength(1);
    // No learner_response since there are no choices
    expect(band.turns.every((t) => t.turnRole !== 'learner_response')).toBe(true);
  });

  // 5. Vocabulary matching
  it('correctly matches English text against lexicon', () => {
    const matches = matchVocabulary('Hello. Can you help me find the red suitcase?', HELLO_LEXICON);
    const matchedIds = matches.map((m) => m.entry.lexicalEntryId);

    expect(matchedIds).toContain('phrase.hello');
    expect(matchedIds).toContain('object.suitcase');
    expect(matchedIds).toContain('color.red');
    expect(matchedIds).toContain('verb.help');
  });

  // 6. Multi-word gloss priority
  it('matches multi-word glosses before individual words', () => {
    const matches = matchVocabulary('My name is Rosa.', HELLO_LEXICON);
    const matchedGlosses = matches.map((m) => m.matchedGloss);

    // "my name is" should match as a unit, not individually
    expect(matchedGlosses).toContain('my name is');
  });

  // 7. Slash-variant matching
  it('matches slash-variant glosses', () => {
    const matches = matchVocabulary('The suitcase is here.', HELLO_LEXICON);
    const matchedIds = matches.map((m) => m.entry.lexicalEntryId);

    // "is / is located" should match "is"
    expect(matchedIds).toContain('verb.is_located');
  });

  // 8. Role assignment at B0
  it('assigns 1-2 focus entries at B0, rest as ambient', () => {
    const matches = matchVocabulary('Hello. My name is Rosa. The suitcase is red.', HELLO_LEXICON);
    const roles = assignVocabularyRoles(matches, 'B0');

    // B0 budget max = 2, only B0 entries eligible
    expect(roles.focus.length).toBeGreaterThanOrEqual(1);
    expect(roles.focus.length).toBeLessThanOrEqual(2);
    // All focus entries should have introductionBand B0
    for (const entry of roles.focus) {
      expect(entry.introductionBand).toBe('B0');
    }
  });

  // 9. Role assignment at B2
  it('assigns more focus entries at B2 and earlier-band items as reinforcement', () => {
    const matches = matchVocabulary(
      'Hello. My name is Rosa. Can you help? Where is the red suitcase near the door?',
      HELLO_LEXICON,
    );
    const roles = assignVocabularyRoles(matches, 'B2');

    expect(roles.focus.length).toBeGreaterThanOrEqual(1);
    expect(roles.focus.length).toBeLessThanOrEqual(8);
    // Should have some entries in focus from lower bands
    const focusBands = new Set(roles.focus.map((e) => e.introductionBand));
    expect(focusBands.size).toBeGreaterThanOrEqual(1);
  });

  // 10. B0 rendering — only focus words swapped
  it('B0 rendering swaps only focus words, rest stays English', () => {
    const matches = matchVocabulary('Hello. My name is Rosa.', HELLO_LEXICON);
    const roles = assignVocabularyRoles(matches, 'B0');

    const rendered = renderLineForBand('Hello. My name is Rosa.', 'es', 'B0', roles, HELLO_LEXICON);

    // Focus words (hello, my name is) should be swapped
    expect(rendered.toLowerCase()).toContain('hola');
    // "Rosa" is a proper noun, should stay
    expect(rendered).toContain('Rosa');
  });

  // 11. B1 rendering — focus + reinforcement swapped
  it('B1 rendering swaps focus + reinforcement words', () => {
    const matches = matchVocabulary('Hello. The suitcase is red.', HELLO_LEXICON);
    const roles = assignVocabularyRoles(matches, 'B1');

    const rendered = renderLineForBand('Hello. The suitcase is red.', 'es', 'B1', roles, HELLO_LEXICON);

    // Both B0 (hello) and B1 entries should be swapped
    expect(rendered.toLowerCase()).toContain('hola');
  });

  // 12. B2 rendering — all matched words swapped
  it('B2 rendering swaps all matched vocabulary', () => {
    const matches = matchVocabulary('Hello. Can you help?', HELLO_LEXICON);
    const roles = assignVocabularyRoles(matches, 'B2');

    const rendered = renderLineForBand('Hello. Can you help?', 'es', 'B2', roles, HELLO_LEXICON);

    expect(rendered.toLowerCase()).toContain('hola');
    expect(rendered.toLowerCase()).toContain('ayudar');
  });

  // 13. B3-B4 rendering — all matched + function words swapped
  it('B3 rendering swaps all matched + function words', () => {
    const matches = matchVocabulary('Hello. Can you help?', HELLO_LEXICON);
    const roles = assignVocabularyRoles(matches, 'B3');

    const rendered = renderLineForBand('Hello. Can you help?', 'es', 'B3', roles, HELLO_LEXICON);

    expect(rendered.toLowerCase()).toContain('hola');
    expect(rendered.toLowerCase()).toContain('ayudar');
    // "can you" is a multi-word function word → "puedes"
    expect(rendered.toLowerCase()).toContain('puedes');
  });

  // 14. Repair ladder at B0
  it('B0 repair ladder has repeat repair', () => {
    const roles: RolePlan = { focus: [], reinforcement: [], ambient: [] };
    const repairs = buildRepairLadder('B0', roles, 'Rosa');

    expect(repairs).toHaveLength(1);
    expect(repairs[0].repairId).toBe('repeat');
    expect(repairs[0].label).toBe('Say it again');
    expect(repairs[0].type).toBe('fixed');
  });

  // 15. Repair ladder at B2
  it('B2 repair ladder has staged ladder with minAttempt/maxAttempt', () => {
    const roles: RolePlan = { focus: [], reinforcement: [], ambient: [] };
    const repairs = buildRepairLadder('B2', roles, 'Rosa');

    expect(repairs.length).toBeGreaterThanOrEqual(2);
    expect(repairs[0].repairId).toBe('more-words');
    expect(repairs[0].minAttempt).toBe(1);

    const supportRepair = repairs.find((r) => r.repairId === 'support-language');
    expect(supportRepair).toBeDefined();
    expect(supportRepair!.minAttempt).toBe(3);
  });

  // 16. Evaluation for explicit choices
  it('explicit choice evaluation uses acceptedCompositions at B0, acceptedAnswers at B1+', () => {
    const roles: RolePlan = { focus: [], reinforcement: [], ambient: [] };

    const evalB0 = deriveEvaluation('B0', roles, ['Go left', 'Go right'], ['Ir izquierda', 'Ir derecha']);
    expect(evalB0!.acceptedCompositions).toEqual(['Ir izquierda', 'Ir derecha']);

    const evalB1 = deriveEvaluation('B1', roles, ['Go left', 'Go right'], ['Ir izquierda', 'Ir derecha']);
    expect(evalB1!.acceptedAnswers).toEqual(['Ir izquierda', 'Ir derecha']);
  });

  // 17. Evaluation for generic response
  it('generic evaluation uses focus targetForms as accepted answers', () => {
    const roles: RolePlan = {
      focus: [
        { lexicalEntryId: 'e1', targetForm: 'hola', gloss: 'hello', category: 'phrase', introductionBand: 'B0', usage: 'active', groundable: false },
        { lexicalEntryId: 'e2', targetForm: 'soy', gloss: 'am', category: 'verb', introductionBand: 'B0', usage: 'active', groundable: false },
      ],
      reinforcement: [],
      ambient: [],
    };

    const evaluation = deriveEvaluation('B0', roles);
    expect(evaluation!.acceptedAnswers).toEqual(['hola', 'soy']);
  });

  // 18. All turns marked generationSource: 'derived'
  it('marks all turns with generationSource derived', () => {
    const result = generateBandedTurns(makeInput({
      dialogueLines: [
        makeLine({ text: 'Hello!', speaker: 'Rosa' }),
        makeLine({ text: 'How are you?', isPlayerLine: true }),
      ],
      bands: ALL_BANDS,
    }));

    for (const band of result.bands) {
      for (const turn of band.turns) {
        expect(turn.generationSource).toBe('derived');
      }
    }
  });

  // 19. Idempotent
  it('is idempotent: same input produces same output', () => {
    const input = makeInput({
      dialogueLines: [
        makeLine({ text: 'Hello. My name is Rosa.', speaker: 'Rosa' }),
        makeLine({ text: 'Where is the suitcase?', isPlayerLine: true }),
      ],
      bands: ALL_BANDS,
    });

    const result1 = generateBandedTurns(input);
    const result2 = generateBandedTurns(input);

    expect(result1).toEqual(result2);
  });

  // 20. Worked example
  it('worked example: "Hello. My name is Bippity. I am the Station Manager." at B0', () => {
    const lexicon = makeLexicon([
      { lexicalEntryId: 'phrase.hello', targetForm: 'hola', gloss: 'hello', introductionBand: 'B0' },
      { lexicalEntryId: 'verb.am', targetForm: 'soy', gloss: 'am', introductionBand: 'B0' },
      { lexicalEntryId: 'phrase.my_name_is', targetForm: 'me llamo', gloss: 'my name is', introductionBand: 'B0' },
      { lexicalEntryId: 'noun.station', targetForm: 'estación', gloss: 'station', introductionBand: 'B1' },
      { lexicalEntryId: 'noun.manager', targetForm: 'gerente', gloss: 'manager', introductionBand: 'B2' },
    ]);

    const result = generateBandedTurns({
      interaction: makeInteraction(),
      dialogueLines: [
        makeLine({ text: 'Hello. My name is Bippity. I am the Station Manager.', speaker: 'Bippity' }),
      ],
      lexicon,
      targetLanguage: 'es',
      supportLanguage: 'en',
      bands: ['B0'],
      npcName: 'Bippity',
    });

    const band = result.bands[0];
    const npcTurn = band.turns.find((t) => t.turnRole === 'npc_delivery')!;
    expect(npcTurn).toBeDefined();

    // At B0, only focus (B0-introduced) words should be swapped
    const delivery = npcTurn.initialDelivery!.toLowerCase();
    expect(delivery).toContain('hola');
    expect(delivery).toContain('me llamo');

    // "Station" and "Manager" should NOT be swapped at B0
    expect(delivery).not.toContain('estación');
    expect(delivery).not.toContain('gerente');

    // Bippity (proper noun) should remain
    expect(npcTurn.initialDelivery).toContain('Bippity');

    // Check vocab matches include the right entries
    const matchedIds = result.vocabMatches.map((m) => m.entry.lexicalEntryId);
    expect(matchedIds).toContain('phrase.hello');
    expect(matchedIds).toContain('phrase.my_name_is');
  });
});

describe('walkDialogueForTurnDerivation', () => {
  it('classifies player, narrator, excerpt, and NPC speakers correctly', () => {
    const tree: DialogueTree = {
      id: 'dlg-1',
      startNode: 'n1',
      nodes: [
        { id: 'n1', speaker: 'Narrator', speakerId: NARRATOR.id, text: 'The scene opens.', next: [{ nodeId: 'n2' }] },
        { id: 'n2', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'Hello!', next: [{ nodeId: 'n3' }] },
        { id: 'n3', speaker: 'Holly', speakerId: PLAYER.id, text: 'Hi there!', next: [{ nodeId: 'n4' }] },
        { id: 'n4', speaker: 'Excerpt', speakerId: EXCERPT.id, text: 'A sign reads: Welcome.' },
      ],
    };

    const lines = walkDialogueForTurnDerivation(tree);

    expect(lines).toHaveLength(4);

    expect(lines[0].isNarrator).toBe(true);
    expect(lines[0].isPlayerLine).toBe(false);

    expect(lines[1].isNarrator).toBe(false);
    expect(lines[1].isPlayerLine).toBe(false);
    expect(lines[1].isExcerpt).toBe(false);
    expect(lines[1].speaker).toBe('Rosa');

    expect(lines[2].isPlayerLine).toBe(true);

    expect(lines[3].isExcerpt).toBe(true);
  });

  it('collects choice labels from multi-choice nodes', () => {
    const tree: DialogueTree = {
      id: 'dlg-1',
      startNode: 'n1',
      nodes: [
        {
          id: 'n1',
          speaker: 'Rosa',
          speakerId: 'npc-rosa',
          text: 'Where to?',
          next: [
            { nodeId: 'n2', text: 'The market' },
            { nodeId: 'n3', text: 'The station' },
          ],
        },
        { id: 'n2', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'This way!' },
        { id: 'n3', speaker: 'Rosa', speakerId: 'npc-rosa', text: 'Over there!' },
      ],
    };

    const lines = walkDialogueForTurnDerivation(tree);
    const choiceNode = lines.find((l) => l.nodeId === 'n1')!;
    expect(choiceNode.choiceLabels).toEqual(['The market', 'The station']);
  });
});

describe('selectResponseModeForBand', () => {
  it('returns correct modes for each band', () => {
    expect(selectResponseModeForBand('B0')).toBe('chip_composition');
    expect(selectResponseModeForBand('B1')).toBe('word_bank');
    expect(selectResponseModeForBand('B2')).toBe('short_text');
    expect(selectResponseModeForBand('B3')).toBe('short_text');
    expect(selectResponseModeForBand('B4')).toBe('open_text');
  });
});

describe('buildRepairLadder', () => {
  const emptyPlan: RolePlan = { focus: [], reinforcement: [], ambient: [] };

  it('B4 has empty repair ladder', () => {
    expect(buildRepairLadder('B4', emptyPlan)).toEqual([]);
  });

  it('B3 has single repair with minAttempt=2', () => {
    const repairs = buildRepairLadder('B3', emptyPlan);
    expect(repairs).toHaveLength(1);
    expect(repairs[0].minAttempt).toBe(2);
  });
});

describe('generateBandedTurns multi-band', () => {
  it('produces one SceneBandRealization per band', () => {
    const result = generateBandedTurns(makeInput({
      bands: ALL_BANDS,
    }));

    expect(result.bands).toHaveLength(5);
    const bandIds = result.bands.map((b) => b.bandId);
    expect(bandIds).toEqual(ALL_BANDS);
  });

  it('each band realization has interactionId linking back', () => {
    const result = generateBandedTurns(makeInput({
      bands: ALL_BANDS,
    }));

    for (const band of result.bands) {
      expect(band.interactionId).toBe('test-scenario--obj-1');
    }
  });
});
